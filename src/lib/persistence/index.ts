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
    return this.put("contents", c);
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
    return this.run(["contents", "sessions", "questionSets", "attempts"], "readwrite", async (tx) => {
      const sessions = (await req(tx.objectStore("sessions").index("contentId").getAll(id))) as ReadingSession[];
      for (const s of sessions) {
        const atts = (await req(tx.objectStore("attempts").index("sessionId").getAll(s.id))) as QuizAttempt[];
        for (const a of atts) tx.objectStore("attempts").delete(a.id);
        tx.objectStore("sessions").delete(s.id);
      }
      const sets = (await req(tx.objectStore("questionSets").index("contentId").getAll(id))) as QuestionSet[];
      for (const q of sets) tx.objectStore("questionSets").delete(q.id);
      tx.objectStore("contents").delete(id);
    });
  }

  putSession(s: ReadingSession) {
    return this.put("sessions", s);
  }
  getSession(id: string) {
    return this.get<ReadingSession>("sessions", id);
  }
  async listSessions() {
    return (await this.all<ReadingSession>("sessions")).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }
  deleteSession(id: string) {
    return this.run(["sessions", "attempts"], "readwrite", async (tx) => {
      const atts = (await req(tx.objectStore("attempts").index("sessionId").getAll(id))) as QuizAttempt[];
      for (const a of atts) tx.objectStore("attempts").delete(a.id);
      tx.objectStore("sessions").delete(id);
    });
  }

  putQuestionSet(q: QuestionSet) {
    return this.put("questionSets", q);
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
    return this.put("attempts", a);
  }
  listAttempts(sessionId?: string) {
    return sessionId ? this.byIndex<QuizAttempt>("attempts", "sessionId", sessionId) : this.all<QuizAttempt>("attempts");
  }

  async getSettings() {
    const s = await this.get<ReadingSettings>("kv", "settings");
    return { ...DEFAULT_SETTINGS, ...(s ?? {}) };
  }
  putSettings(s: ReadingSettings) {
    return this.put("kv", s, "settings");
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
}

let singleton: Repository | null = null;
export function repo(): Repository {
  if (!singleton) singleton = new IndexedDbRepository();
  return singleton;
}

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
