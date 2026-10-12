/**
 * Gravações guardadas neste aparelho (IndexedDB próprio, separado das leituras).
 * O áudio nunca sai daqui; transcrição e saídas serão sincronizadas na Fase 2.
 */
export interface Segmento {
  inicio: number; // segundos
  fim: number;
  texto: string;
}

export interface Gravacao {
  id: string;
  titulo: string;
  criadoEm: number;
  atualizadoEm: number;
  duracao: number; // segundos
  mime: string;
  audio: Blob;
  transcricao: string;
  segmentos: Segmento[];
  resumo: string;
  template: string;
}

export interface Rascunho {
  id: typeof RASCUNHO;
  criadoEm: number;
  duracao: number;
  mime: string;
  audio: Blob;
}

const DB = "lemais-gravador";
const STORE = "gravacoes";
export const RASCUNHO = "rascunho";

let aberto: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  aberto ??= new Promise((ok, erro) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "id" });
    r.onsuccess = () => ok(r.result);
    r.onerror = () => {
      aberto = null;
      erro(r.error);
    };
  });
  return aberto;
}

async function tx<T>(modo: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | void): Promise<T> {
  const d = await db();
  return new Promise((ok, erro) => {
    const t = d.transaction(STORE, modo);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => ok((req ? req.result : undefined) as T);
    t.onerror = () => erro(t.error);
    t.onabort = () => erro(t.error);
  });
}

export const pegar = (id: string) => tx<Gravacao | undefined>("readonly", (s) => s.get(id));
export const guardar = (g: Gravacao | Rascunho) => tx<void>("readwrite", (s) => void s.put(g));
export const apagar = (id: string) => tx<void>("readwrite", (s) => void s.delete(id));
export const pegarRascunho = () => tx<Rascunho | undefined>("readonly", (s) => s.get(RASCUNHO));

export async function listar(): Promise<Gravacao[]> {
  const todas = await tx<(Gravacao | Rascunho)[]>("readonly", (s) => s.getAll());
  return todas.filter((g): g is Gravacao => g.id !== RASCUNHO).sort((a, b) => b.criadoEm - a.criadoEm);
}

export function dataCurta(t: number): string {
  return new Date(t).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function novaGravacao(audio: Blob, duracao: number, opcoes: { titulo?: string; criadoEm?: number; template?: string } = {}): Gravacao {
  const agora = opcoes.criadoEm ?? Date.now();
  return {
    id: `${agora.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    titulo: opcoes.titulo || `Gravação ${dataCurta(agora)}`,
    criadoEm: agora,
    atualizadoEm: Date.now(),
    duracao,
    mime: audio.type,
    audio,
    transcricao: "",
    segmentos: [],
    resumo: "",
    template: opcoes.template ?? "reuniao",
  };
}

/** Se o app fechou no meio de uma gravação, transforma o rascunho em gravação. */
export async function recuperarRascunho(): Promise<Gravacao | null> {
  const r = await pegarRascunho();
  if (!r || !r.audio?.size) return null;
  const g = novaGravacao(r.audio, r.duracao, { titulo: `Gravação recuperada ${dataCurta(r.criadoEm)}`, criadoEm: r.criadoEm });
  await guardar(g);
  await apagar(RASCUNHO);
  return g;
}

export function hhmmss(seg: number): string {
  const s0 = Math.max(0, Math.round(seg || 0));
  const h = Math.floor(s0 / 3600);
  const m = Math.floor((s0 % 3600) / 60);
  const s = s0 % 60;
  return (h ? `${h}:${String(m).padStart(2, "0")}` : String(m)) + ":" + String(s).padStart(2, "0");
}
