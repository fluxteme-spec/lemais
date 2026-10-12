/**
 * Dados do grafo 3D (estilo Obsidian): um por gravação e um Grafo Geral, em que
 * a mesma ideia citada em várias gravações vira um único nó que liga todas elas.
 */
import type { Gravacao, MapaMental } from "./store";

export interface NoGrafo {
  id: string;
  rotulo: string;
  grupo: string;
  tamanho: number;
  tipo: "central" | "ideia" | "gravacao";
  trechos: { gravacaoId: string; titulo: string; trecho?: string }[];
}

export interface LigacaoGrafo {
  source: string;
  target: string;
  rotulo?: string;
}

export interface DadosGrafo {
  nodes: NoGrafo[];
  links: LigacaoGrafo[];
}

export const normalizar = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Grafo de uma gravação. */
export function grafoDaGravacao(mapa: MapaMental, g: Pick<Gravacao, "id" | "titulo">): DadosGrafo {
  const graus = new Map<string, number>();
  for (const l of mapa.ligacoes) for (const k of [l.de, l.para]) graus.set(k, (graus.get(k) ?? 0) + 1);
  const nodes: NoGrafo[] = [
    { id: "central", rotulo: mapa.central, grupo: "Central", tamanho: 10, tipo: "central", trechos: [{ gravacaoId: g.id, titulo: g.titulo }] },
    ...mapa.nos.map((n) => ({
      id: n.id,
      rotulo: n.rotulo,
      grupo: n.grupo,
      tamanho: 2 + n.peso + Math.min(4, graus.get(n.id) ?? 0),
      tipo: "ideia" as const,
      trechos: [{ gravacaoId: g.id, titulo: g.titulo, trecho: n.trecho }],
    })),
  ];
  return { nodes, links: mapa.ligacoes.map((l) => ({ source: l.de, target: l.para, rotulo: l.rotulo })) };
}

/**
 * Grafo Geral: cada gravação vira um nó; ideias com o mesmo nome (sem acentos e
 * maiúsculas) em gravações diferentes se fundem num nó só, que liga essas gravações.
 */
export function grafoGeral(gravacoes: Pick<Gravacao, "id" | "titulo" | "saidas" | "projetoId">[], filtro?: (g: Pick<Gravacao, "projetoId">) => boolean): DadosGrafo {
  const nodes = new Map<string, NoGrafo>();
  const links = new Map<string, LigacaoGrafo>();
  const ligar = (a: string, b: string, rotulo?: string) => {
    if (a === b) return;
    const k = [a, b].sort().join("|");
    if (!links.has(k)) links.set(k, { source: a, target: b, rotulo });
  };

  for (const g of gravacoes) {
    const mapa = g.saidas?.mapa;
    if (!mapa || (filtro && !filtro(g))) continue;
    const idGrav = `g:${g.id}`;
    nodes.set(idGrav, { id: idGrav, rotulo: g.titulo, grupo: "Gravação", tamanho: 8, tipo: "gravacao", trechos: [{ gravacaoId: g.id, titulo: g.titulo }] });
    const local = new Map<string, string>([["central", idGrav]]);
    for (const n of mapa.nos) {
      const chave = normalizar(n.rotulo);
      if (!chave) continue;
      const id = `i:${chave}`;
      local.set(n.id, id);
      const existente = nodes.get(id);
      if (existente) {
        existente.tamanho = Math.min(16, existente.tamanho + 2);
        if (!existente.trechos.some((t) => t.gravacaoId === g.id)) existente.trechos.push({ gravacaoId: g.id, titulo: g.titulo, trecho: n.trecho });
      } else {
        nodes.set(id, { id, rotulo: n.rotulo, grupo: n.grupo, tamanho: 2 + n.peso, tipo: "ideia", trechos: [{ gravacaoId: g.id, titulo: g.titulo, trecho: n.trecho }] });
      }
    }
    for (const l of mapa.ligacoes) {
      const a = local.get(l.de);
      const b = local.get(l.para);
      if (a && b) ligar(a, b, l.rotulo);
    }
  }
  return { nodes: [...nodes.values()], links: [...links.values()] };
}

/** Assuntos que aparecem em mais de uma gravação, do mais citado para o menos. */
export function assuntosRecorrentes(d: DadosGrafo): NoGrafo[] {
  return d.nodes.filter((n) => n.tipo === "ideia" && n.trechos.length > 1).sort((a, b) => b.trechos.length - a.trechos.length);
}

const PALETA = ["#e5a50a", "#3584e4", "#2ec27e", "#e66100", "#9141ac", "#26a269", "#c01c28", "#1c71d8", "#865e3c", "#63452c"];

export function corDoGrupo(grupo: string, tipo: NoGrafo["tipo"]): string {
  if (tipo === "central") return "#f6d32d";
  if (tipo === "gravacao") return "#ffffff";
  let h = 0;
  for (const c of grupo) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETA[h % PALETA.length];
}
