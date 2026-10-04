/**
 * Persistência local (IndexedDB). Os dados ficam neste navegador e não são
 * sincronizados entre dispositivos.
 *
 * `Repository` é o ponto de extensão para uma futura persistência remota
 * (ex.: PostgreSQL com isolamento por usuário) — a UI só conhece esta interface.
 * Todas as gravações usam `put` com ids estáveis: são idempotentes.
 */
import type { Content, QuestionSet, QuizAttempt, ReadingSession, ReadingSettings } from "@/lib/types";
import { WPM } from "@/lib/config";

export interface Repository {
  putContent(c: Content): Promise<void>;
  getContent(id: string): Promise<Content | null>;
  findContentByTraining(trainingId: string): Promise<Content | null>;
  listContents(): Promise<Content[]>;
  deleteContent(id: string): Promise<void>;

  putSession(s: ReadingSession): Promise<void>;
  getSession(id: string): Promise<ReadingSession | null>;
  listSessions(): Promise<ReadingSession[]>;
  deleteSession(id: string): Promise<void>;

  putQuestionSet(q: QuestionSet): Promise<void>;
  getQuestionSet(id: string): Promise<QuestionSet | null>;
  findQuestionSet(contentId: string, contentHash: string): Promise<QuestionSet | null>;

  putAttempt(a: QuizAttempt): Promise<void>;
  listAttempts(sessionId?: string): Promise<QuizAttempt[]>;

  getSettings(): Promise<ReadingSettings>;
  putSettings(s: ReadingSettings): Promise<void>;
  getFlag(key: string): Promise<unknown>;
  setFlag(key: string, value: unknown): Promise<void>;

  clearAll(): Promise<void>;

  // ---- sincronização ----
  listDirty(): Promise<DirtyEntry[]>;
  clearDirty(entry: DirtyEntry): Promise<void>;
  getRaw(kind: SyncKind, id: string): Promise<unknown>;
  /** Aplica um registro vindo da nuvem sem marcá-lo como alterado. Ignora se houver alteração local pendente. */
  applyRemote(kind: SyncKind, id: string, data: unknown | null): Promise<boolean>;
  /** Marca todos os registros locais para envio (primeiro login neste navegador). */
  markAllDirty(): Promise<number>;
}

export type SyncKind = "content" | "session" | "questionSet" | "attempt" | "settings";
export interface DirtyEntry {
  kind: SyncKind;
  id: string;
  at: string;
  deleted: boolean;
}

const KIND_STORE: Record<Exclude<SyncKind, "settings">, StoreName> = {
  content: "contents",
  session: "sessions",
  questionSet: "questionSets",
  attempt: "attempts",
};
const dirtyKey = (kind: SyncKind, id: string) => `dirty|${kind}|${id}`;

/** Ouvintes de alteração local (usados para disparar a sincronização). */
const changeListeners = new Set<() => void>();
export function onLocalChange(fn: () => void): () => void {
  changeListeners.add(fn);
  return () => changeListeners.delete(fn);
}
function emitChange() {
  changeListeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignora */
    }
  });
}

export const DEFAULT_SETTINGS: ReadingSettings = {
  mode: "rsvp",
  targetWpm: WPM.default,
  fontSize: 40,
  lineSpacing: 1.6,
  theme: "sistema",
  chunkSize: 3,
  smartPauses: true,
  referenceLetterHighlight: false,
};

export class StorageError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = "StorageError";
  }
}

const DB_NAME = "lemais";
const DB_VERSION = 1;
const STORES = ["contents", "sessions", "questionSets", "attempts", "kv"] as const;
type StoreName = (typeof STORES)[number];

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export class IndexedDbRepository implements Repository {
  private dbp: Promise<IDBDatabase> | null = null;

  constructor(private factory: IDBFactory | undefined = typeof indexedDB !== "undefined" ? indexedDB : undefined) {}

  private db(): Promise<IDBDatabase> {
    if (!this.factory) return Promise.reject(new StorageError("Este navegador não oferece armazenamento local (IndexedDB)."));
    if (!this.dbp) {
      this.dbp = new Promise((resolve, reject) => {
        let open: IDBOpenDBRequest;
        try {
          open = this.factory!.open(DB_NAME, DB_VERSION);
        } catch (e) {
          reject(new StorageError("Não foi possível abrir o armazenamento local.", e));
          return;
        }
        open.onupgradeneeded = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains("contents")) {
            const s = db.createObjectStore("contents", { keyPath: "id" });
            s.createIndex("trainingId", "trainingId");
          }
          if (!db.objectStoreNames.contains("sessions")) {
            const s = db.createObjectStore("sessions", { keyPath: "id" });
            s.createIndex("contentId", "contentId");
          }
          if (!db.objectStoreNames.contains("questionSets")) {
            const s = db.createObjectStore("questionSets", { keyPath: "id" });
            s.createIndex("contentId", "contentId");
          }
          if (!db.objectStoreNames.contains("attempts")) {
            const s = db.createObjectStore("attempts", { keyPath: "id" });
            s.createIndex("sessionId", "sessionId");
          }
          if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
        };
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => {
          this.dbp = null;
          reject(new StorageError("Não foi possível abrir o armazenamento local. Em janelas privadas ele pode estar bloqueado.", open.error));
        };
        open.onblocked = () => reject(new StorageError("O armazenamento local está bloqueado por outra aba do LêMais."));
      });
    }
    return this.dbp;
  }

  private async run<T>(store: StoreName | StoreName[], mode: IDBTransactionMode, fn: (tx: IDBTransaction) => Promise<T> | T): Promise<T> {
    try {
      const db = await this.db();
      const tx = db.transaction(store, mode);
      const done = new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error("Transação abortada"));
      });
      const result = await fn(tx);
      await done;
      return result;
    } catch (e) {
      if (e instanceof StorageError) throw e;
      const quota = e instanceof DOMException && e.name === "QuotaExceededError";
      throw new StorageError(quota ? "Sem espaço no armazenamento local do navegador." : "Falha ao acessar o armazenamento local.", e);
    }
  }

  private put(store: StoreName, value: unknown, key?: IDBValidKey) {
    return this.run(store, "readwrite", (tx) => req(tx.objectStore(store).put(value, key)).then(() => undefined));
  }
  /** Grava e marca para sincronização na mesma transação. */
  private putTracked(store: StoreName, kind: SyncKind, id: string, value: unknown, key?: IDBValidKey) {
    return this.run([store, "kv"], "readwrite", (tx) => {
      tx.objectStore(store).put(value, key);
      const entry: DirtyEntry = { kind, id, at: new Date().toISOString(), deleted: false };
      tx.objectStore("kv").put(entry, dirtyKey(kind, id));
    }).then(emitChange);
  }
  private markDeleted(tx: IDBTransaction, kind: SyncKind, id: string) {
    const entry: DirtyEntry = { kind, id, at: new Date().toISOString(), deleted: true };
    tx.objectStore("kv").put(entry, dirtyKey(kind, id));
  }
  private get<T>(store: StoreName, key: IDBValidKey) {
    return this.run(store, "readonly", (tx) => req(tx.objectStore(store).get(key)).then((v) => (v ?? null) as T | null));
  }
  private all<T>(store: StoreName) {
    return this.run(store, "readonly", (tx) => req(tx.objectStore(store).getAll()) as Promise<T[]>);
  }
  private byIndex<T>(store: StoreName, index: string, key: IDBValidKey) {
    return this.run(store, "readonly", (tx) => req(tx.objectStore(store).index(index).getAll(key)) as Promise<T[]>);
  }

  putContent(c: Content) {
    return this.putTracked("contents", "content", c.id, c);
  }
  getContent(id: string) {
    return this.get<Content>("contents", id);
  }
  async findContentByTraining(trainingId: string) {
    const list = await this.byIndex<Content>("contents", "trainingId", trainingId);
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
  }
  async listContents() {
    return (await this.all<Content>("contents")).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  /** Exclui o conteúdo e tudo que depende dele (sessões, questionários, tentativas). */
  deleteContent(id: string) {
    return this.run(["contents", "sessions", "questionSets", "attempts", "kv"], "readwrite", async (tx) => {
      const sessions = (await req(tx.objectStore("sessions").index("contentId").getAll(id))) as ReadingSession[];
      for (const s of sessions) {
        const atts = (await req(tx.objectStore("attempts").index("sessionId").getAll(s.id))) as QuizAttempt[];
        for (const a of atts) {
          tx.objectStore("attempts").delete(a.id);
          this.markDeleted(tx, "attempt", a.id);
        }
        tx.objectStore("sessions").delete(s.id);
        this.markDeleted(tx, "session", s.id);
      }
      const sets = (await req(tx.objectStore("questionSets").index("contentId").getAll(id))) as QuestionSet[];
      for (const q of sets) {
        tx.objectStore("questionSets").delete(q.id);
        this.markDeleted(tx, "questionSet", q.id);
      }
      tx.objectStore("contents").delete(id);
      this.markDeleted(tx, "content", id);
    }).then(emitChange);
  }

  putSession(s: ReadingSession) {
    return this.putTracked("sessions", "session", s.id, s);
  }
  getSession(id: string) {
    return this.get<ReadingSession>("sessions", id);
  }
  async listSessions() {
    return (await this.all<ReadingSession>("sessions")).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }
  deleteSession(id: string) {
    return this.run(["sessions", "attempts", "kv"], "readwrite", async (tx) => {
      const atts = (await req(tx.objectStore("attempts").index("sessionId").getAll(id))) as QuizAttempt[];
      for (const a of atts) {
        tx.objectStore("attempts").delete(a.id);
        this.markDeleted(tx, "attempt", a.id);
      }
      tx.objectStore("sessions").delete(id);
      this.markDeleted(tx, "session", id);
    }).then(emitChange);
  }

  putQuestionSet(q: QuestionSet) {
    return this.putTracked("questionSets", "questionSet", q.id, q);
  }
  getQuestionSet(id: string) {
    return this.get<QuestionSet>("questionSets", id);
  }
  async findQuestionSet(contentId: string, contentHash: string) {
    const list = await this.byIndex<QuestionSet>("questionSets", "contentId", contentId);
    // alterações no texto invalidam questões anteriores: exige o hash exato
    return list.find((q) => q.contentHash === contentHash) ?? null;
  }

  putAttempt(a: QuizAttempt) {
    return this.putTracked("attempts", "attempt", a.id, a);
  }
  listAttempts(sessionId?: string) {
    return sessionId ? this.byIndex<QuizAttempt>("attempts", "sessionId", sessionId) : this.all<QuizAttempt>("attempts");
  }

  async getSettings() {
    const s = await this.get<ReadingSettings>("kv", "settings");
    return { ...DEFAULT_SETTINGS, ...(s ?? {}) };
  }
  putSettings(s: ReadingSettings) {
    return this.putTracked("kv", "settings", "settings", s, "settings");
  }
  getFlag(key: string) {
    return this.get<unknown>("kv", `flag:${key}`);
  }
  setFlag(key: string, value: unknown) {
    return this.put("kv", value, `flag:${key}`);
  }

  clearAll() {
    return this.run([...STORES], "readwrite", (tx) => {
      for (const s of STORES) tx.objectStore(s).clear();
    });
  }

  async listDirty() {
    return this.run("kv", "readonly", (tx) =>
      req(tx.objectStore("kv").getAll(IDBKeyRange.bound("dirty|", "dirty|\uffff"))) as Promise<DirtyEntry[]>,
    );
  }

  clearDirty(entry: DirtyEntry) {
    return this.run("kv", "readwrite", async (tx) => {
      const store = tx.objectStore("kv");
      const cur = (await req(store.get(dirtyKey(entry.kind, entry.id)))) as DirtyEntry | undefined;
      // só limpa se nada mudou desde o envio
      if (cur && cur.at === entry.at && cur.deleted === entry.deleted) store.delete(dirtyKey(entry.kind, entry.id));
    });
  }

  getRaw(kind: SyncKind, id: string) {
    if (kind === "settings") return this.get<unknown>("kv", "settings");
    return this.get<unknown>(KIND_STORE[kind], id);
  }

  applyRemote(kind: SyncKind, id: string, data: unknown | null) {
    const store: StoreName = kind === "settings" ? "kv" : KIND_STORE[kind];
    return this.run(Array.from(new Set<StoreName>([store, "kv"])), "readwrite", async (tx) => {
      const pending = await req(tx.objectStore("kv").get(dirtyKey(kind, id)));
      if (pending) return false;
      const key = kind === "settings" ? "settings" : id;
      if (data === null) tx.objectStore(store).delete(key);
      else if (kind === "settings") tx.objectStore(store).put(data, "settings");
      else tx.objectStore(store).put(data);
      return true;
    });
  }

  markAllDirty() {
    return this.run([...STORES], "readwrite", async (tx) => {
      const at = new Date().toISOString();
      let n = 0;
      for (const [kind, store] of Object.entries(KIND_STORE) as [SyncKind, StoreName][]) {
        const keys = (await req(tx.objectStore(store).getAllKeys())) as string[];
        for (const id of keys) {
          tx.objectStore("kv").put({ kind, id, at, deleted: false } satisfies DirtyEntry, dirtyKey(kind, id));
          n++;
        }
      }
      if (await req(tx.objectStore("kv").get("settings"))) {
        tx.objectStore("kv").put({ kind: "settings", id: "settings", at, deleted: false } satisfies DirtyEntry, dirtyKey("settings", "settings"));
        n++;
      }
      return n;
    });
  }
}

let singleton: Repository | null = null;
/** Permite trocar o armazenamento (ex.: memória, quando o navegador bloqueia o IndexedDB). */
export function setRepo(r: Repository) {
  singleton = r;
}
export function repo(): Repository {
  if (!singleton) singleton = new IndexedDbRepository();
  return singleton;
}

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
