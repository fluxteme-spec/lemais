"use client";
/**
 * Gravador na conta (Supabase), só quando a pessoa está logada:
 *  - sincroniza o TEXTO das gravações (o áudio fica no aparelho);
 *  - caixa de entrada dos Atalhos do iPhone (áudio só de passagem);
 *  - links públicos de leitura, com validade e revogação.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabase/env";
import { guardar, novaGravacao, pegarMesmoExcluida, todasComExcluidas, type Gravacao, type Saidas } from "./store";

// ---------- sincronização do texto ----------
type DadosSincronizados = Omit<Gravacao, "audio">;

function semAudio(g: Gravacao): DadosSincronizados {
  const { audio: _audio, ...resto } = g;
  void _audio;
  return resto;
}

/** Envia o que mudou neste aparelho e traz o que mudou nos outros. Vale a alteração mais recente. */
export async function sincronizarGravacoes(sb: SupabaseClient, userId: string): Promise<{ enviadas: number; recebidas: number }> {
  const locais = await todasComExcluidas();
  const { data: remotas, error } = await sb.from("gravacoes").select("id, dados, excluido, atualizado_em").eq("user_id", userId);
  if (error) throw error;
  const porId = new Map((remotas ?? []).map((r) => [r.id as string, r]));

  const enviar = locais.filter((g) => {
    const r = porId.get(g.id);
    return !r || new Date(r.atualizado_em as string).getTime() < g.atualizadoEm;
  });
  if (enviar.length) {
    const { error: e } = await sb.from("gravacoes").upsert(
      enviar.map((g) => ({ user_id: userId, id: g.id, dados: g.excluido ? null : semAudio(g), excluido: !!g.excluido, atualizado_em: new Date(g.atualizadoEm).toISOString() })),
    );
    if (e) throw e;
  }

  let recebidas = 0;
  const locaisPorId = new Map(locais.map((g) => [g.id, g]));
  for (const r of remotas ?? []) {
    const quando = new Date(r.atualizado_em as string).getTime();
    const local = locaisPorId.get(r.id as string);
    if (local && local.atualizadoEm >= quando) continue;
    const atual = local ?? (await pegarMesmoExcluida(r.id as string));
    if (r.excluido) {
      if (atual && !atual.excluido) {
        await guardar({ ...atual, audio: null, transcricao: "", segmentos: [], resumo: "", saidas: undefined, excluido: true, atualizadoEm: quando });
        recebidas++;
      }
      continue;
    }
    const dados = r.dados as DadosSincronizados | null;
    if (!dados) continue;
    await guardar({ ...dados, audio: atual?.audio ?? null, origem: atual?.origem ?? "sincronizado", atualizadoEm: quando });
    recebidas++;
  }
  return { enviadas: enviar.length, recebidas };
}

// ---------- caixa de entrada (Atalhos) ----------
export const PASTA_ENTRADA = "entrada";

function tokenAleatorio(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export async function meuToken(sb: SupabaseClient, userId: string, criarSeFaltar = true): Promise<string | null> {
  const { data } = await sb.from("gravador_tokens").select("token").eq("user_id", userId).order("criado_em", { ascending: false }).limit(1);
  if (data?.[0]?.token) return data[0].token as string;
  if (!criarSeFaltar) return null;
  const token = tokenAleatorio();
  const { error } = await sb.from("gravador_tokens").insert({ token, user_id: userId });
  if (error) throw error;
  return token;
}

/** Troca o código: o antigo para de aceitar envios (os áudios já enviados continuam na caixa até serem importados). */
export async function trocarToken(sb: SupabaseClient, userId: string): Promise<string> {
  const novo = tokenAleatorio();
  const { error } = await sb.from("gravador_tokens").insert({ token: novo, user_id: userId });
  if (error) throw error;
  await sb.from("gravador_tokens").delete().eq("user_id", userId).neq("token", novo);
  return novo;
}

/** Endereço e cabeçalho que o Atalho usa para enviar um áudio. */
export function enderecoEnvio(token: string): { url: string; cabecalho: string; valor: string } {
  return { url: `${SUPABASE_URL}/storage/v1/object/${PASTA_ENTRADA}/${token}/`, cabecalho: "apikey", valor: SUPABASE_PUBLISHABLE_KEY };
}

export interface ItemEntrada {
  caminho: string;
  nome: string;
  criadoEm: number;
  tamanho: number;
}

export async function listarEntrada(sb: SupabaseClient, token: string): Promise<ItemEntrada[]> {
  const { data, error } = await sb.storage.from(PASTA_ENTRADA).list(token, { limit: 100, sortBy: { column: "created_at", order: "asc" } });
  if (error) throw error;
  return (data ?? [])
    .filter((o) => o.id)
    .map((o) => ({
      caminho: `${token}/${o.name}`,
      nome: o.name,
      criadoEm: new Date(o.created_at ?? Date.now()).getTime(),
      tamanho: Number((o.metadata as { size?: number } | null)?.size ?? 0),
    }));
}

/** Baixa um áudio da caixa, guarda como gravação no aparelho e apaga da nuvem. */
export async function importarDaEntrada(sb: SupabaseClient, item: ItemEntrada, opcoes: { template: string; personaId?: string }): Promise<Gravacao> {
  const { data, error } = await sb.storage.from(PASTA_ENTRADA).download(item.caminho);
  if (error || !data) throw error ?? new Error("Não consegui baixar o áudio.");
  const tipo = data.type && data.type !== "application/octet-stream" ? data.type : "audio/mp4";
  const blob = new Blob([data], { type: tipo });
  const duracao = await new Promise<number>((ok) => {
    const a = new Audio();
    a.preload = "metadata";
    a.onloadedmetadata = () => ok(Number.isFinite(a.duration) ? a.duration : 0);
    a.onerror = () => ok(0);
    a.src = URL.createObjectURL(blob);
  });
  const g = novaGravacao(blob, duracao, { criadoEm: item.criadoEm, template: opcoes.template, personaId: opcoes.personaId, origem: "atalho" });
  await guardar(g);
  await sb.storage.from(PASTA_ENTRADA).remove([item.caminho]);
  return g;
}

// ---------- links públicos ----------
export interface ConteudoPublico {
  titulo: string;
  criadoEm: number;
  duracao: number;
  saidas: Pick<Saidas, "resumo" | "tarefas" | "mapa" | "ata" | "relatorio">;
  transcricao?: string;
}

export interface LinkPublico {
  id: string;
  expira_em: string;
  revogado: boolean;
}

export async function criarLinkPublico(sb: SupabaseClient, userId: string, c: ConteudoPublico, dias: number): Promise<LinkPublico> {
  const expira = new Date(Date.now() + Math.min(90, Math.max(1, dias)) * 86_400_000).toISOString();
  const { data, error } = await sb.from("gravador_publicos").insert({ user_id: userId, titulo: c.titulo.slice(0, 200), conteudo: c, expira_em: expira }).select("id, expira_em, revogado").single();
  if (error) throw error;
  return data as LinkPublico;
}

export async function revogarLink(sb: SupabaseClient, id: string): Promise<void> {
  const { error } = await sb.from("gravador_publicos").update({ revogado: true }).eq("id", id);
  if (error) throw error;
}

export async function meusLinks(sb: SupabaseClient, userId: string): Promise<(LinkPublico & { titulo: string })[]> {
  const { data } = await sb.from("gravador_publicos").select("id, titulo, expira_em, revogado").eq("user_id", userId).order("criado_em", { ascending: false }).limit(50);
  return (data ?? []) as (LinkPublico & { titulo: string })[];
}
