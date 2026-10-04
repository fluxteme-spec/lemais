/**
 * Validação de questionários (curados ou gerados por IA).
 * Esquema válido + evidência encontrada NÃO garantem uma boa questão;
 * por isso há verificações de coerência e o usuário pode reportar problemas.
 */
import { z } from "zod";
import { locateEvidence, normalizeForMatch, type Token } from "@/lib/text";
import type { Question } from "@/lib/types";

export const RawQuestionSchema = z.object({
  prompt: z.string().min(8).max(200),
  options: z.array(z.string().min(1).max(160)).length(4),
  correctOption: z.number().int().min(0).max(3),
  explanation: z.string().min(10).max(600),
  evidence: z.string().min(15).max(600),
  focus: z.enum(["ideia_central", "desenvolvimento", "conclusao"]).optional(),
});
export const RawQuestionSetSchema = z.object({ questions: z.array(RawQuestionSchema).min(1).max(8) });
export type RawQuestion = z.infer<typeof RawQuestionSchema>;

const BANNED_OPTION = /\b(todas|nenhuma) (as|das) (anteriores|alternativas)\b|\btodas as opções\b/i;

export interface ValidationReport {
  valid: Question[];
  rejected: { index: number; reason: string }[];
}

export function validateQuestions(raw: unknown, tokens: Token[], idPrefix: string): ValidationReport {
  const parsed = RawQuestionSetSchema.safeParse(raw);
  if (!parsed.success) return { valid: [], rejected: [{ index: -1, reason: "esquema inválido" }] };
  const valid: Question[] = [];
  const rejected: ValidationReport["rejected"] = [];
  const seenPrompts = new Set<string>();

  parsed.data.questions.forEach((q, index) => {
    const opts = q.options.map((o) => normalizeForMatch(o));
    if (new Set(opts).size !== 4) return rejected.push({ index, reason: "alternativas repetidas" });
    if (q.options.some((o) => BANNED_OPTION.test(o))) return rejected.push({ index, reason: "alternativa do tipo 'todas/nenhuma'" });
    const p = normalizeForMatch(q.prompt);
    if (seenPrompts.has(p)) return rejected.push({ index, reason: "enunciado duplicado" });
    const loc = locateEvidence(tokens, q.evidence);
    if (loc === null) return rejected.push({ index, reason: "evidência não encontrada no texto" });
    if (normalizeForMatch(q.evidence).split(" ").length < 5) return rejected.push({ index, reason: "evidência curta demais" });
    // a resposta correta não deve estar contida literalmente em outra alternativa
    const correct = opts[q.correctOption];
    if (opts.some((o, i) => i !== q.correctOption && (o.includes(correct) || correct.includes(o)))) {
      return rejected.push({ index, reason: "alternativas ambíguas" });
    }
    seenPrompts.add(p);
    valid.push({
      id: `${idPrefix}-${index}`,
      prompt: q.prompt.trim(),
      options: q.options.map((o) => o.trim()),
      correctOption: q.correctOption,
      explanation: q.explanation.trim(),
      evidence: q.evidence.trim(),
      evidenceLocation: loc,
      focus: q.focus,
    });
  });
  return { valid, rejected };
}
