import { describe, expect, it } from "vitest";
import { TRAINING_TEXTS, curatedQuestionSet } from "@/lib/training";
import { validateQuestions } from "@/lib/comprehension/validate";
import { generateQuestionSet } from "@/lib/comprehension/generate";
import { ProviderError, type QuestionProvider } from "@/lib/comprehension/provider";
import { countWords, tokenize } from "@/lib/text";
import { makeContent, editContent } from "@/lib/session";
import { TEXT_LIMITS } from "@/lib/config";

describe("biblioteca de treino", () => {
  it("tem 2 textos de cada dificuldade", () => {
    const by = (d: string) => TRAINING_TEXTS.filter((t) => t.difficulty === d).length;
    expect([by("facil"), by("intermediario"), by("avancado")]).toEqual([2, 2, 2]);
  });

  it.each(TRAINING_TEXTS.map((t) => [t.id, t] as const))("%s: questões válidas, evidências literais e respostas distribuídas", (_id, t) => {
    expect(countWords(t.blocks)).toBeGreaterThanOrEqual(TEXT_LIMITS.minWordsForQuiz);
    const report = validateQuestions({ questions: t.questions }, tokenize(t.blocks), "x");
    expect(report.rejected).toEqual([]);
    expect(report.valid.length).toBeGreaterThanOrEqual(3);
    expect(report.valid.length).toBeLessThanOrEqual(5);
    expect(new Set(t.questions.map((q) => q.correctOption)).size).toBeGreaterThan(1);
    expect(t.questions.some((q) => q.focus === "ideia_central")).toBe(true);
    expect(t.questions.some((q) => q.focus === "conclusao")).toBe(true);
  });

  it("editar o texto invalida o questionário revisado", () => {
    const t = TRAINING_TEXTS[0];
    const c = makeContent({ sourceType: "training", title: t.title, blocks: t.blocks, trainingId: t.id, difficulty: t.difficulty });
    expect(curatedQuestionSet(c)).not.toBeNull();
    const edited = editContent(c, c.title, [...c.textBlocks.slice(0, 2), { type: "paragraph", text: "Texto novo." }]);
    expect(edited.version).toBe(2);
    expect(edited.contentHash).not.toBe(c.contentHash);
    expect(curatedQuestionSet(edited)).toBeNull();
    expect(edited.difficulty).toBe("nao_classificada");
  });
});

describe("validação de questões geradas", () => {
  const blocks = TRAINING_TEXTS[2].blocks;
  const tokens = tokenize(blocks);
  const good = TRAINING_TEXTS[2].questions[0];

  it("rejeita evidência inexistente, alternativas repetidas e 'todas as anteriores'", () => {
    const r = validateQuestions(
      {
        questions: [
          { ...good, evidence: "Este trecho foi inventado pelo modelo e não está no texto." },
          { ...good, prompt: "Outra pergunta qualquer?", options: ["a", "a", "b", "c"] },
          { ...good, prompt: "Mais uma pergunta?", options: ["x", "y", "z", "Todas as anteriores"] },
          good,
        ],
      },
      tokens,
      "t",
    );
    expect(r.valid).toHaveLength(1);
    expect(r.rejected.map((x) => x.reason)).toEqual(["evidência não encontrada no texto", "alternativas repetidas", "alternativa do tipo 'todas/nenhuma'"]);
    expect(r.valid[0].evidenceLocation).not.toBeNull();
  });

  it("rejeita esquema inválido", () => {
    expect(validateQuestions({ foo: 1 }, tokens, "t").valid).toHaveLength(0);
    expect(validateQuestions({ questions: [{ ...good, correctOption: 7 }] }, tokens, "t").valid).toHaveLength(0);
  });
});

describe("geração com provedor", () => {
  const input = { contentId: "c1", contentVersion: 1, title: "Ilhas", blocks: TRAINING_TEXTS[2].blocks };
  const fake = (fn: () => Promise<unknown>): QuestionProvider => ({ name: "fake", model: "m", generate: fn });

  it("aceita saída válida e associa ao hash do conteúdo", async () => {
    const set = await generateQuestionSet(fake(async () => ({ questions: TRAINING_TEXTS[2].questions })), input, 120);
    expect(set.source).toBe("ai");
    expect(set.questions.length).toBe(5);
    expect(set.providerMetadata).toEqual({ provider: "fake", model: "m" });
  });

  it("falha com clareza em resposta inválida ou timeout", async () => {
    await expect(generateQuestionSet(fake(async () => ({ questions: [] })), input, 120)).rejects.toMatchObject({ code: "failed" });
    await expect(generateQuestionSet(fake(async () => { throw new ProviderError("timeout", "demorou"); }), input, 120)).rejects.toMatchObject({ code: "failed" });
  });

  it("não gera para texto curto demais", async () => {
    await expect(
      generateQuestionSet(fake(async () => ({})), { ...input, blocks: [{ type: "paragraph", text: "Curto demais." }] }, 120),
    ).rejects.toMatchObject({ code: "too_short" });
  });
});
