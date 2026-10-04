/** Orquestra a geração: limites de tempo/tentativas, validação e montagem do QuestionSet. */
import { AI } from "@/lib/config";
import { blocksToPlainText, hashBlocks, tokenize } from "@/lib/text";
import type { QuestionSet, TextBlock } from "@/lib/types";
import { ProviderError, type QuestionProvider } from "./provider";
import { validateQuestions } from "./validate";

export class GenerationError extends Error {
  constructor(public code: "too_long" | "too_short" | "failed", message: string) {
    super(message);
  }
}

export async function generateQuestionSet(
  provider: QuestionProvider,
  input: { contentId: string; contentVersion: number; title: string; blocks: TextBlock[] },
  minWords: number,
): Promise<QuestionSet> {
  const tokens = tokenize(input.blocks);
  if (tokens.length < minWords) throw new GenerationError("too_short", "Texto curto demais para um questionário útil.");
  const text = blocksToPlainText(input.blocks);
  if (text.length > AI.maxInputChars) {
    throw new GenerationError("too_long", "Texto longo demais para geração automática de questões nesta versão.");
  }
  let lastReason = "";
  for (let attempt = 1; attempt <= AI.maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AI.timeoutMs);
    try {
      const raw = await provider.generate({ title: input.title, text, count: AI.questionCount }, controller.signal);
      const report = validateQuestions(raw, tokens, `ai-${Date.now().toString(36)}`);
      if (report.valid.length >= AI.minValidQuestions) {
        return {
          id: `qs-${input.contentId}-${hashBlocks(input.blocks)}`,
          contentId: input.contentId,
          contentVersion: input.contentVersion,
          contentHash: hashBlocks(input.blocks),
          source: "ai",
          providerMetadata: { provider: provider.name, model: provider.model },
          questions: report.valid.slice(0, AI.questionCount),
          createdAt: new Date().toISOString(),
        };
      }
      lastReason = `apenas ${report.valid.length} questões válidas (${report.rejected.map((r) => r.reason).join(", ")})`;
    } catch (e) {
      lastReason = e instanceof ProviderError ? e.message : "erro inesperado";
      if (e instanceof ProviderError && e.code === "refused") break;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new GenerationError("failed", `Não foi possível gerar um questionário confiável: ${lastReason}.`);
}
