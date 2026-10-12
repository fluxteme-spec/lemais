/**
 * Gravações, personas e projetos guardados neste aparelho (IndexedDB próprio,
 * separado das leituras). O áudio nunca sai daqui; o texto pode ser sincronizado com a conta.
 */
export interface Segmento {
  inicio: number; // segundos
  fim: number;
  texto: string;
  falante?: string;
}

export interface Tarefa {
  texto: string;
  responsavel?: string;
  prazo?: string;
  feita?: boolean;
}

export interface NoMapa {
  id: string;
  rotulo: string;
  grupo: string; // tema, para a cor
  peso: number; // 1..5, importância
  trecho?: string; // de onde a ideia saiu
}

export interface LigacaoMapa {
  de: string;
  para: string;
  rotulo?: string;
}

export interface MapaMental {
  central: string;
  nos: NoMapa[];
  ligacoes: LigacaoMapa[];
}

export interface Saidas {
  resumo?: string; // markdown
  tarefas?: Tarefa[];
  mapa?: MapaMental;
  ata?: string; // markdown
  relatorio?: string; // markdown
  geradoPor?: string; // provedor/modelo
  geradoEm?: number;
}

export type MotorTranscricao = "aparelho" | "ia";

export interface Gravacao {
  id: string;
  titulo: string;
  criadoEm: number;
  atualizadoEm: number;
  duracao: number; // segundos
  mime: string;
  audio: Blob | null; // null quando veio de outro aparelho (só o texto sincroniza)
  transcricao: string;
  segmentos: Segmento[];
  resumo: string; // resumo rápido local (sem IA)
  template: string;
  personaId?: string;
  projetoId?: string;
  saidas?: Saidas;
  origem?: "app" | "importado" | "atalho" | "sincronizado";
  excluido?: boolean; // para a sincronização saber que foi apagada
}

export interface Rascunho {
  id: typeof RASCUNHO;
  criadoEm: number;
  duracao: number;
  mime: string;
  audio: Blob;
}

export interface Persona {
  id: string;
  nome: string;
  papel: string; // quem a IA é
  comportamento: string; // como trata a transcrição
  pronta?: boolean; // veio com o app
  atualizadoEm: number;
}

export interface Projeto {
  id: string;
  nome: string;
  cor: string;
  atualizadoEm: number;
}

const DB = "lemais-gravador";
const GRAVACOES = "gravacoes";
const PERSONAS = "personas";
const PROJETOS = "projetos";
export const RASCUNHO = "rascunho";

type Loja = typeof GRAVACOES | typeof PERSONAS | typeof PROJETOS;

let aberto: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  aberto ??= new Promise((ok, erro) => {
    const r = indexedDB.open(DB, 2);
    r.onupgradeneeded = () => {
      const d = r.result;
      for (const nome of [GRAVACOES, PERSONAS, PROJETOS]) if (!d.objectStoreNames.contains(nome)) d.createObjectStore(nome, { keyPath: "id" });
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => {
      aberto = null;
      erro(r.error);
    };
  });
  return aberto;
}

async function tx<T>(loja: Loja, modo: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | void): Promise<T> {
  const d = await db();
  return new Promise((ok, erro) => {
    const t = d.transaction(loja, modo);
    const req = fn(t.objectStore(loja));
    t.oncomplete = () => ok((req ? req.result : undefined) as T);
    t.onerror = () => erro(t.error);
    t.onabort = () => erro(t.error);
  });
}

// ---------- gravações ----------
export const pegar = async (id: string) => {
  const g = await tx<Gravacao | undefined>(GRAVACOES, "readonly", (s) => s.get(id));
  return g && !g.excluido ? g : undefined;
};
export const pegarMesmoExcluida = (id: string) => tx<Gravacao | undefined>(GRAVACOES, "readonly", (s) => s.get(id));
export const guardar = (g: Gravacao | Rascunho) => tx<void>(GRAVACOES, "readwrite", (s) => void s.put(g));
export const pegarRascunho = () => tx<Rascunho | undefined>(GRAVACOES, "readonly", (s) => s.get(RASCUNHO));
export const apagarRascunho = () => tx<void>(GRAVACOES, "readwrite", (s) => void s.delete(RASCUNHO));

/** Apaga o áudio e o conteúdo, mas deixa um marcador para a exclusão sincronizar. */
export async function apagar(id: string): Promise<void> {
  if (id === RASCUNHO) return apagarRascunho();
  const g = await pegarMesmoExcluida(id);
  if (!g) return;
  await guardar({ ...g, audio: null, transcricao: "", segmentos: [], resumo: "", saidas: undefined, excluido: true, atualizadoEm: Date.now() });
}

export async function todasComExcluidas(): Promise<Gravacao[]> {
  const todas = await tx<(Gravacao | Rascunho)[]>(GRAVACOES, "readonly", (s) => s.getAll());
  return todas.filter((g): g is Gravacao => g.id !== RASCUNHO);
}

export async function listar(): Promise<Gravacao[]> {
  return (await todasComExcluidas()).filter((g) => !g.excluido).sort((a, b) => b.criadoEm - a.criadoEm);
}

// ---------- personas e projetos ----------
export const listarPersonas = () => tx<Persona[]>(PERSONAS, "readonly", (s) => s.getAll());
export const guardarPersona = (p: Persona) => tx<void>(PERSONAS, "readwrite", (s) => void s.put(p));
export const apagarPersona = (id: string) => tx<void>(PERSONAS, "readwrite", (s) => void s.delete(id));
export const listarProjetos = () => tx<Projeto[]>(PROJETOS, "readonly", (s) => s.getAll());
export const guardarProjeto = (p: Projeto) => tx<void>(PROJETOS, "readwrite", (s) => void s.put(p));
export const apagarProjeto = (id: string) => tx<void>(PROJETOS, "readwrite", (s) => void s.delete(id));

// ---------- utilidades ----------
export function novoId(prefixo = ""): string {
  return `${prefixo}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function dataCurta(t: number): string {
  return new Date(t).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function novaGravacao(
  audio: Blob,
  duracao: number,
  opcoes: { titulo?: string; criadoEm?: number; template?: string; personaId?: string; projetoId?: string; origem?: Gravacao["origem"] } = {},
): Gravacao {
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
    personaId: opcoes.personaId,
    projetoId: opcoes.projetoId,
    origem: opcoes.origem ?? "app",
  };
}

/** Se o app fechou no meio de uma gravação, transforma o rascunho em gravação. */
export async function recuperarRascunho(): Promise<Gravacao | null> {
  const r = await pegarRascunho();
  if (!r || !r.audio?.size) return null;
  const g = novaGravacao(r.audio, r.duracao, { titulo: `Gravação recuperada ${dataCurta(r.criadoEm)}`, criadoEm: r.criadoEm });
  await guardar(g);
  await apagarRascunho();
  return g;
}

export function hhmmss(seg: number): string {
  const s0 = Math.max(0, Math.round(seg || 0));
  const h = Math.floor(s0 / 3600);
  const m = Math.floor((s0 % 3600) / 60);
  const s = s0 % 60;
  return (h ? `${h}:${String(m).padStart(2, "0")}` : String(m)) + ":" + String(s).padStart(2, "0");
}
