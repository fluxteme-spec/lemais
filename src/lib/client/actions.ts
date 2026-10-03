"use client";
/** Ações de cliente compartilhadas entre telas. */
import { repo } from "@/lib/persistence";
import { makeContent } from "@/lib/session";
import { getTrainingText, curatedQuestionSet } from "@/lib/training";
import { hashBlocks } from "@/lib/text";
import { TEXT_LIMITS } from "@/lib/config";
import type { Content, QuestionSet, TextBlock } from "@/lib/types";

export async function openTrainingText(id: string): Promise<Content> {
  const t = getTrainingText(id);
  if (!t) throw new Error("Texto de treino não encontrado.");
  const existing = await repo().findContentByTraining(id);
  if (existing && existing.contentHash === hashBlocks(t.blocks)) return existing;
  const c = makeContent({ sourceType: "training", title: t.title, blocks: t.blocks, trainingId: t.id, difficulty: t.difficulty });
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
  | { kind: "can_generate" }
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
  if (await aiAvailable()) return { kind: "can_generate" };
  return {
    kind: "unavailable",
    reason: "O teste automático para textos colados ou importados não está disponível nesta instalação. Os textos da área Treinar têm questionários revisados.",
  };
}

export async function generateQuestions(content: Content): Promise<{ ok: true; set: QuestionSet } | { ok: false; message: string }> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { ok: false, message: "Você está sem conexão. A geração de questões precisa de internet." };
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
