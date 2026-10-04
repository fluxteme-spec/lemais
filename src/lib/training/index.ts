import { tokenize } from "@/lib/text";
import { validateQuestions } from "@/lib/comprehension/validate";
import type { Content, QuestionSet } from "@/lib/types";
import { getTrainingText, pickThree } from "./library";

export { TRAINING_TEXTS, getTrainingText, pickThree } from "./library";
export type { TrainingText } from "./library";

/** Questionário revisado de um texto da biblioteca, vinculado à versão exata do conteúdo. */
export function curatedQuestionSet(content: Content): QuestionSet | null {
  let raw = content.curatedQuestions ?? null;
  let prefix = `cur-${content.id}`;
  if (!raw && content.trainingId) {
    const t = getTrainingText(content.trainingId);
    if (!t) return null;
    raw = t.questions;
    prefix = `cur-${t.id}`;
  }
  if (!raw || raw.length === 0) return null;
  const chosen = pickThree(raw);
  const report = validateQuestions({ questions: chosen }, tokenize(content.textBlocks), prefix);
  // conteúdo editado → evidências podem não existir mais; nesse caso não oferecemos o questionário
  if (report.valid.length !== chosen.length) return null;
  return {
    id: `qs-${content.id}-${content.contentHash}`,
    contentId: content.id,
    contentVersion: content.version,
    contentHash: content.contentHash,
    source: "curated",
    providerMetadata: null,
    questions: report.valid,
    createdAt: content.createdAt,
  };
}
