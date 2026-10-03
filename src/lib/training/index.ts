import { tokenize } from "@/lib/text";
import { validateQuestions } from "@/lib/comprehension/validate";
import type { Content, QuestionSet } from "@/lib/types";
import { getTrainingText } from "./library";

export { TRAINING_TEXTS, getTrainingText } from "./library";
export type { TrainingText } from "./library";

/** Questionário revisado de um texto da biblioteca, vinculado à versão exata do conteúdo. */
export function curatedQuestionSet(content: Content): QuestionSet | null {
  if (!content.trainingId) return null;
  const t = getTrainingText(content.trainingId);
  if (!t) return null;
  const report = validateQuestions({ questions: t.questions }, tokenize(content.textBlocks), `cur-${t.id}`);
  // conteúdo editado → evidências podem não existir mais; nesse caso não oferecemos o questionário
  if (report.valid.length !== t.questions.length) return null;
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
