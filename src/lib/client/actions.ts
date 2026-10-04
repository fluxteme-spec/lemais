"use client";
/** Ações de cliente compartilhadas entre telas. */
import { repo } from "@/lib/persistence";
import { makeContent } from "@/lib/session";
import { getTrainingText, curatedQuestionSet } from "@/lib/training";
import { hashBlocks } from "@/lib/text";
import { TEXT_LIMITS } from "@/lib/config";
import type { Content, QuestionSet, TextBlock } from "@/lib/types";
import { getConnection } from "@/lib/ai/connection";
import { supabase } from "@/lib/supabase/browser";
import { browserProvider, PROVIDERS, type AIConnection } from "@/lib/ai/providers";
import { generateQuestionSet, GenerationError } from "@/lib/comprehension/generate";

export async function openTrainingText(id: string): Promise<Content> {
  const t = getTrainingText(id);
  if (!t) throw new Error("Texto de treino não encontrado.");
  const existing = await repo().findContentByTraining(id);
  if (existing && existing.contentHash === hashBlocks(t.blocks)) return existing;
  const c = makeContent({ sourceType: "training", title: t.title, blocks: t.blocks, trainingId: t.id, difficulty: t.difficulty });
  await repo().putContent(c);
  return c;
}

export interface SuggestedText {
  id: string;
  title: string;
  author: string | null;
  source: string | null;
  summary: string | null;
  difficulty: Content["difficulty"];
  blocks: TextBlock[];
  questions: Content["curatedQuestions"];
  updated_at: string;
}

export async function listSuggestedTexts(): Promise<SuggestedText[]> {
  const sb = supabase();
  if (!sb) return [];
  const { data } = await sb.from("suggested_texts").select("id, title, author, source, summary, difficulty, blocks, questions, updated_at").order("created_at", { ascending: false }).limit(50);
  return (data ?? []) as SuggestedText[];
}

export async function openSuggestedText(t: SuggestedText): Promise<Content> {
  const key = `sug:${t.id}`;
  const existing = await repo().findContentByTraining(key);
  if (existing && existing.contentHash === hashBlocks(t.blocks)) return existing;
  const c = makeContent({
    sourceType: "suggested",
    title: t.title,
    blocks: t.blocks,
    author: t.author,
    siteName: t.source && !/^https?:/.test(t.source) ? t.source : null,
    originalUrl: t.source && /^https?:/.test(t.source) ? t.source : null,
    finalUrl: t.source && /^https?:/.test(t.source) ? t.source : null,
    trainingId: key,
    difficulty: t.difficulty,
    curatedQuestions: t.questions ?? null,
  });
  await repo().putContent(c);
  return c;
}

export interface ExtractSuccess {
  title: string | null;
  subtitle: string | null;
  author: string | null;
  publishedAt: string | null;
  siteName: string | null;
  blocks: TextBlock[];
  warnings: string[];
  originalUrl: string;
  finalUrl: string;
}

const EXTRACT_MESSAGES: Record<string, string> = {
  invalid_url: "O link não é válido. Confira se ele começa com http:// ou https://.",
  forbidden_destination: "Este endereço não pode ser acessado pelo LêMais.",
  timeout: "A página demorou demais para responder.",
  unavailable: "A página não está disponível.",
  unsupported_type: "O link não aponta para uma página de texto (HTML).",
  too_large: "A página é grande demais para ser preparada.",
  blocked: "O site recusou o acesso automático.",
  possibly_restricted: "A página parece exigir login ou assinatura.",
  no_content: "Não identificamos um artigo nesta página.",
  rate_limited: "Muitas importações em pouco tempo. Aguarde alguns minutos.",
};

export async function extractFromUrl(url: string): Promise<{ ok: true; data: ExtractSuccess } | { ok: false; message: string }> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { ok: false, message: "Você está sem conexão. A importação por link precisa de internet." };
  }
  try {
    const res = await fetch("/api/extract", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const body = await res.json().catch(() => null);
    if (body?.ok) return { ok: true, data: body.data as ExtractSuccess };
    return { ok: false, message: EXTRACT_MESSAGES[body?.code] ?? body?.message ?? "Erro inesperado ao preparar o link." };
  } catch {
    return { ok: false, message: "Não foi possível falar com o servidor. Verifique sua conexão." };
  }
}

export type QuizAvailability =
  | { kind: "ready"; set: QuestionSet }
  | { kind: "can_generate"; via: { kind: "user"; connection: AIConnection; providerName: string } | { kind: "server" } }
  | { kind: "too_short" }
  | { kind: "unavailable"; reason: string };

let aiStatusCache: Promise<boolean> | null = null;
export function aiAvailable(): Promise<boolean> {
  if (!aiStatusCache) {
    aiStatusCache = fetch("/api/questions")
      .then((r) => r.json())
      .then((b) => !!b.available)
      .catch(() => {
        aiStatusCache = null;
        return false;
      });
  }
  return aiStatusCache;
}

export async function quizAvailability(content: Content): Promise<QuizAvailability> {
  const stored = await repo().findQuestionSet(content.id, content.contentHash).catch(() => null);
  if (stored) return { kind: "ready", set: stored };
  const curated = curatedQuestionSet(content);
  if (curated) return { kind: "ready", set: curated };
  if (content.wordCount < TEXT_LIMITS.minWordsForQuiz) return { kind: "too_short" };
  const conn = await getConnection();
  if (conn) return { kind: "can_generate", via: { kind: "user", connection: conn, providerName: PROVIDERS[conn.provider].name } };
  if (await aiAvailable()) return { kind: "can_generate", via: { kind: "server" } };
  return {
    kind: "unavailable",
    reason: "Para testar a compreensão de textos colados ou importados, conecte a sua IA (Google Gemini, ChatGPT, Claude e outras). Os textos da área Treinar já têm questionários revisados.",
  };
}

export async function generateQuestions(content: Content): Promise<{ ok: true; set: QuestionSet } | { ok: false; message: string }> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { ok: false, message: "Você está sem conexão. A geração de questões precisa de internet." };
  }
  const conn = await getConnection();
  if (conn) {
    // direto do navegador para o provedor do usuário; o servidor do LêMais não participa
    try {
      const set = await generateQuestionSet(
        browserProvider(conn),
        { contentId: content.id, contentVersion: content.version, title: content.title, blocks: content.textBlocks },
        TEXT_LIMITS.minWordsForQuiz,
      );
      await repo().putQuestionSet(set);
      return { ok: true, set };
    } catch (e) {
      return { ok: false, message: e instanceof GenerationError ? e.message : "Não foi possível gerar o questionário." };
    }
  }
  try {
    const res = await fetch("/api/questions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contentId: content.id, contentVersion: content.version, title: content.title, blocks: content.textBlocks }),
    });
    const body = await res.json().catch(() => null);
    if (body?.ok) {
      const set = body.questionSet as QuestionSet;
      if (set.contentHash !== content.contentHash) return { ok: false, message: "O texto mudou durante a geração. Tente novamente." };
      await repo().putQuestionSet(set);
      return { ok: true, set };
    }
    return { ok: false, message: body?.message ?? "Não foi possível gerar o questionário." };
  } catch {
    return { ok: false, message: "Não foi possível falar com o servidor. Verifique sua conexão." };
  }
}
