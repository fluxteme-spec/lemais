/** Funções de domínio que ligam conteúdo, motor e persistência. */
import { hashBlocks, countWords } from "@/lib/text";
import { deriveMetrics, METRICS_VERSION } from "@/lib/metrics";
import { newId } from "@/lib/persistence";
import type { EngineSnapshot } from "@/lib/reader/engine";
import type { Content, Difficulty, ReadingSession, ReadingSettings, SourceType, TextBlock } from "@/lib/types";

export function makeContent(input: {
  sourceType: SourceType;
  title: string;
  blocks: TextBlock[];
  subtitle?: string | null;
  author?: string | null;
  publishedAt?: string | null;
  siteName?: string | null;
  originalUrl?: string | null;
  finalUrl?: string | null;
  difficulty?: Difficulty;
  trainingId?: string | null;
  warnings?: string[];
  curatedQuestions?: Content["curatedQuestions"];
  adaptation?: Content["adaptation"];
}): Content {
  return {
    id: newId(),
    sourceType: input.sourceType,
    title: input.title.trim() || "Sem título",
    subtitle: input.subtitle ?? null,
    author: input.author ?? null,
    publishedAt: input.publishedAt ?? null,
    siteName: input.siteName ?? null,
    originalUrl: input.originalUrl ?? null,
    finalUrl: input.finalUrl ?? null,
    textBlocks: input.blocks,
    wordCount: countWords(input.blocks),
    contentHash: hashBlocks(input.blocks),
    version: 1,
    difficulty: input.difficulty ?? "nao_classificada",
    trainingId: input.trainingId ?? null,
    warnings: input.warnings ?? [],
    createdAt: new Date().toISOString(),
    curatedQuestions: input.curatedQuestions ?? null,
    adaptation: input.adaptation ?? null,
  };
}

/** Atualiza texto/título; mudar o texto cria nova versão (invalida questionários anteriores). */
export function editContent(c: Content, title: string, blocks: TextBlock[]): Content {
  const hash = hashBlocks(blocks);
  const changed = hash !== c.contentHash;
  return {
    ...c,
    title: title.trim() || "Sem título",
    textBlocks: blocks,
    wordCount: countWords(blocks),
    contentHash: hash,
    version: changed ? c.version + 1 : c.version,
    // texto da biblioteca editado deixa de ter dificuldade editorial conhecida
    difficulty: changed && (c.sourceType === "training" || c.sourceType === "suggested") ? "nao_classificada" : c.difficulty,
    trainingId: changed ? null : c.trainingId,
    curatedQuestions: changed ? null : (c.curatedQuestions ?? null),
    sourceType: changed && (c.sourceType === "training" || c.sourceType === "suggested") ? "pasted" : c.sourceType,
  };
}

export function newSession(content: Content, settings: ReadingSettings): ReadingSession {
  const now = new Date().toISOString();
  return {
    id: newId(),
    contentId: content.id,
    contentVersion: content.version,
    contentHash: content.contentHash,
    contentTitle: content.title,
    totalWords: content.wordCount,
    mode: settings.mode,
    status: "preparado",
    currentTokenIndex: 0,
    initialWpm: settings.targetWpm,
    currentWpm: settings.targetWpm,
    finalWpm: null,
    activeDurationMs: 0,
    pausedDurationMs: 0,
    presentedWordCount: 0,
    uniquePresentedWordCount: 0,
    presentedBitset: "",
    observedWpm: null,
    coveragePercent: null,
    modesUsed: [settings.mode],
    startedAt: now,
    lastCheckpointAt: now,
    finishedAt: null,
    settingsSnapshot: { ...settings },
    metricsVersion: METRICS_VERSION,
    difficulty: content.difficulty,
    adaptation: content.adaptation?.style ?? null,
  };
}

/** Converte o estado do motor em registro de sessão (checkpoint). */
export function applySnapshot(
  s: ReadingSession,
  snap: EngineSnapshot,
  presentedBitset: string,
  settings: ReadingSettings,
): ReadingSession {
  const modesUsed = s.modesUsed.includes(snap.settings.mode) ? s.modesUsed : [...s.modesUsed, snap.settings.mode];
  const m = deriveMetrics({
    mode: snap.settings.mode,
    modesUsed,
    activeDurationMs: snap.activeDurationMs,
    presentedWordCount: snap.presentedWordCount,
    uniquePresentedWordCount: snap.uniquePresentedWordCount,
    totalWords: snap.totalWords,
  });
  let status: ReadingSession["status"] = s.status;
  if (snap.state === "lendo") status = "lendo";
  else if (snap.state === "pausado" || snap.state === "preparado") status = s.status === "preparado" && snap.activeDurationMs === 0 ? "preparado" : "pausado";
  return {
    ...s,
    mode: snap.settings.mode,
    status,
    currentTokenIndex: snap.tokenIndex,
    currentWpm: snap.settings.wpm,
    activeDurationMs: snap.activeDurationMs,
    pausedDurationMs: snap.pausedDurationMs,
    presentedWordCount: snap.presentedWordCount,
    uniquePresentedWordCount: snap.uniquePresentedWordCount,
    presentedBitset,
    observedWpm: m.observedWpm,
    coveragePercent: m.coveragePercent,
    modesUsed,
    lastCheckpointAt: new Date().toISOString(),
    settingsSnapshot: { ...settings },
  };
}

export function isRecoverable(s: ReadingSession): boolean {
  return s.status === "lendo" || s.status === "pausado" || s.status === "questionario" || s.status === "concluida";
}

export const MODE_LABEL: Record<ReadingSession["mode"], string> = {
  rsvp: "Palavra a palavra (RSVP)",
  chunk: "Leitura por blocos",
  guided: "Texto guiado",
  free: "Texto livre",
};

export const DIFFICULTY_LABEL: Record<Content["difficulty"], string> = {
  facil: "Fácil (aprox.)",
  intermediario: "Intermediário (aprox.)",
  avancado: "Avançado (aprox.)",
  nao_classificada: "Dificuldade não classificada",
};

export const ADAPT_LABEL: Record<NonNullable<Content["adaptation"]>["style"], string> = {
  simples: "versão simplificada",
  cientifico: "versão científica",
  academico: "versão acadêmica",
  classico: "versão clássica (séc. XIX)",
};
