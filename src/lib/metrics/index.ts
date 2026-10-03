/**
 * Métricas de sessão — definições (metricsVersion 1):
 *
 *  activeDurationMs      tempo em leitura, incluindo pausas programadas pelo motor (pausas inteligentes).
 *  pausedDurationMs      tempo em pausa manual ou por aba oculta.
 *  presentedWordCount    apresentações de palavras, incluindo repetições (voltar e reler conta de novo).
 *  uniquePresentedWordCount  posições distintas apresentadas pelo motor. NÃO são "palavras comprovadamente lidas".
 *  observedWpm           presentedWordCount ÷ minutos ativos (modos automáticos);
 *                        no texto livre: total de palavras ÷ minutos ativos, uma ESTIMATIVA.
 *  coveragePercent       uniquePresentedWordCount ÷ total de palavras (somente modos automáticos).
 *  comprehensionScore    acertos ÷ questões respondidas, ou null quando não avaliada.
 *
 * Avançar manualmente não marca palavras puladas como apresentadas.
 */
import { ENGINE } from "@/lib/config";
import type { QuizAttempt, ReadingMode } from "@/lib/types";

export const METRICS_VERSION = ENGINE.metricsVersion;

export interface DerivedMetrics {
  observedWpm: number | null;
  coveragePercent: number | null;
  insufficient: boolean;
  observedIsEstimate: boolean;
}

export function deriveMetrics(input: {
  mode: ReadingMode;
  modesUsed: ReadingMode[];
  activeDurationMs: number;
  presentedWordCount: number;
  uniquePresentedWordCount: number;
  totalWords: number;
}): DerivedMetrics {
  const minutes = input.activeDurationMs / 60_000;
  const insufficient = input.activeDurationMs < ENGINE.minActiveMsForMetrics || input.totalWords === 0;
  const onlyFree = input.modesUsed.length > 0 && input.modesUsed.every((m) => m === "free");
  if (insufficient) {
    return { observedWpm: null, coveragePercent: null, insufficient: true, observedIsEstimate: onlyFree };
  }
  if (onlyFree) {
    return {
      observedWpm: Math.round(input.totalWords / minutes),
      coveragePercent: null,
      insufficient: false,
      observedIsEstimate: true,
    };
  }
  return {
    observedWpm: Math.round(input.presentedWordCount / minutes),
    coveragePercent: Math.round((input.uniquePresentedWordCount / input.totalWords) * 1000) / 10,
    insufficient: false,
    observedIsEstimate: false,
  };
}

export function scoreAttempt(answers: (number | null)[], correct: number[]): { correctCount: number; questionCount: number; score: number | null } {
  const questionCount = correct.length;
  const answered = answers.filter((a) => a !== null).length;
  const correctCount = answers.reduce<number>((n, a, i) => n + (a !== null && a === correct[i] ? 1 : 0), 0);
  return { correctCount, questionCount, score: answered === 0 ? null : correctCount / answered };
}

/** A tentativa que representa a sessão: a primeira concluída. Revisões não a substituem. */
export function primaryAttempt(attempts: QuizAttempt[]): QuizAttempt | null {
  const done = attempts.filter((a) => a.finishedAt && a.score !== null).sort((a, b) => a.attemptNumber - b.attemptNumber);
  return done[0] ?? null;
}

/** "4 de 5 respostas corretas — 80%" */
export function formatScore(a: Pick<QuizAttempt, "correctCount" | "questionCount" | "score">): string {
  if (a.score === null || a.correctCount === null) return "Não avaliada";
  return `${a.correctCount} de ${a.questionCount} respostas corretas — ${Math.round(a.score * 100)}%`;
}

// ---- Bitset de posições apresentadas (compacto para persistência) ----

export class PositionSet {
  private bits: Uint8Array;
  private _count = 0;
  constructor(public readonly size: number, encoded?: string) {
    this.bits = new Uint8Array(Math.ceil(size / 8));
    if (encoded) {
      const bin = typeof atob === "function" ? atob(encoded) : Buffer.from(encoded, "base64").toString("binary");
      for (let i = 0; i < Math.min(bin.length, this.bits.length); i++) this.bits[i] = bin.charCodeAt(i);
      for (let i = 0; i < size; i++) if (this.has(i)) this._count++;
    }
  }
  has(i: number): boolean {
    return (this.bits[i >> 3] & (1 << (i & 7))) !== 0;
  }
  add(i: number): boolean {
    if (i < 0 || i >= this.size || this.has(i)) return false;
    this.bits[i >> 3] |= 1 << (i & 7);
    this._count++;
    return true;
  }
  get count(): number {
    return this._count;
  }
  encode(): string {
    let bin = "";
    for (let i = 0; i < this.bits.length; i++) bin += String.fromCharCode(this.bits[i]);
    return typeof btoa === "function" ? btoa(bin) : Buffer.from(bin, "binary").toString("base64");
  }
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h} h ${m} min`;
  if (m > 0) return `${m} min ${sec.toString().padStart(2, "0")} s`;
  return `${sec} s`;
}
