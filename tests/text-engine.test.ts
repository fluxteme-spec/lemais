import { describe, expect, it } from "vitest";
import { parsePlainText, tokenize, validateText, locateEvidence, hashBlocks, countWords } from "@/lib/text";
import { buildChunks, chunkDurationMs, estimateDurationMs, nextSentenceStart, prevSentenceStart } from "@/lib/reader/chunks";
import { ReaderEngine, type Clock } from "@/lib/reader/engine";
import { deriveMetrics, PositionSet, scoreAttempt, formatScore, primaryAttempt } from "@/lib/metrics";
import type { QuizAttempt } from "@/lib/types";

class FakeClock implements Clock {
  t = 0;
  private q: { at: number; fn: () => void; id: number }[] = [];
  private seq = 0;
  now() {
    return this.t;
  }
  setTimeout(fn: () => void, ms: number) {
    const id = ++this.seq;
    this.q.push({ at: this.t + ms, fn, id });
    return id;
  }
  clearTimeout(id: unknown) {
    this.q = this.q.filter((x) => x.id !== id);
  }
  /** Avança o relógio executando timers devidos. `lag` simula atraso do timer. */
  advance(ms: number, lag = 0) {
    const end = this.t + ms;
    for (;;) {
      this.q.sort((a, b) => a.at - b.at);
      const next = this.q[0];
      if (!next || next.at + lag > end) break;
      this.q.shift();
      this.t = next.at + lag;
      next.fn();
    }
    this.t = end;
  }
}

const SAMPLE = `Introdução

A leitura rápida, bem-estar e atenção: temas que se cruzam. Em 2024, R$ 1.000,50 foram gastos!

Segundo parágrafo — com travessão — e "aspas". Fim.`;

describe("tokenização", () => {
  const blocks = parsePlainText(SAMPLE);
  const tokens = tokenize(blocks);

  it("detecta intertítulo e parágrafos", () => {
    expect(blocks.map((b) => b.type)).toEqual(["heading", "paragraph", "paragraph"]);
  });

  it("conta hífen, números e acentos corretamente; pontuação isolada não conta", () => {
    const texts = tokens.map((t) => t.text);
    expect(texts).toContain("bem-estar");
    expect(texts).toContain("1.000,50");
    expect(texts).toContain("Introdução");
    expect(texts.some((t) => t === "—")).toBe(false);
    expect(texts).toContain("parágrafo —");
    expect(countWords(blocks)).toBe(tokens.length);
  });

  it("marca limites de frase, vírgula e parágrafo", () => {
    const atencao = tokens.find((t) => t.text === "atenção:")!;
    expect(atencao.clauseEnd).toBe(true);
    const gastos = tokens.find((t) => t.text === "gastos!")!;
    expect(gastos.sentenceEnd && gastos.blockEnd).toBe(true);
    expect(tokens[0].isHeading && tokens[0].blockEnd).toBe(true);
  });

  it("é determinística (posições estáveis)", () => {
    expect(tokenize(parsePlainText(SAMPLE))).toEqual(tokens);
    expect(hashBlocks(blocks)).toBe(hashBlocks(parsePlainText(SAMPLE)));
    expect(hashBlocks(blocks)).not.toBe(hashBlocks(parsePlainText(SAMPLE + " x")));
  });

  it("valida vazio e limites sem truncar", () => {
    expect(validateText(parsePlainText("   \n  ")).ok).toBe(false);
    const big = parsePlainText("palavra ".repeat(30_001));
    const v = validateText(big);
    expect(v.ok).toBe(false);
    expect(v.wordCount).toBe(30_001);
    expect(validateText(parsePlainText("a".repeat(300_001))).ok).toBe(false);
  });

  it("aceita texto sem linhas em branco (uma linha por parágrafo)", () => {
    const b = parsePlainText("Primeira frase aqui.\nSegunda frase aqui.");
    expect(b).toHaveLength(2);
  });

  it("localiza evidências pela mesma tokenização", () => {
    expect(locateEvidence(tokens, "com travessão — e “aspas”")).toBe(tokens.findIndex((t) => t.text === "com"));
    expect(locateEvidence(tokens, "trecho que não existe no texto")).toBeNull();
  });
});

describe("blocos e duração", () => {
  const tokens = tokenize(parsePlainText("um dois três quatro cinco seis, sete oito. nove dez onze"));

  it("nenhuma palavra omitida ou duplicada em nenhum tamanho", () => {
    for (const size of [1, 2, 3, 4, "auto"] as const) {
      const chunks = buildChunks(tokens, size);
      const covered = chunks.flatMap((c) => Array.from({ length: c.end - c.start }, (_, k) => c.start + k));
      expect(covered).toEqual(tokens.map((t) => t.index));
      for (const c of chunks) expect(c.end - c.start).toBeLessThanOrEqual(size === "auto" ? 4 : size);
    }
  });

  it("bloco fixo não atravessa fim de frase", () => {
    const chunks = buildChunks(tokens, 3);
    const oito = tokens.findIndex((t) => t.text === "oito.");
    expect(chunks.some((c) => c.end === oito + 1)).toBe(true);
  });

  it("duração-base = 60000 × palavras ÷ PPM", () => {
    expect(chunkDurationMs(tokens, { start: 0, end: 3 }, 300, false)).toBe(600);
    expect(chunkDurationMs(tokens, { start: 0, end: 1 }, 600, false)).toBe(100);
  });

  it("pausas não se somam no mesmo limite: parágrafo prevalece sobre frase", () => {
    const t = tokenize(parsePlainText("Fim de frase."));
    const last = { start: 2, end: 3 };
    // 200ms base + 1.6 × 200 (parágrafo) — sem somar a pausa de frase
    expect(chunkDurationMs(t, last, 300, true)).toBeCloseTo(200 + 1.6 * 200);
  });

  it("estimativa considera pausas", () => {
    expect(estimateDurationMs(tokens, "rsvp", 3, 300, true)).toBeGreaterThan(estimateDurationMs(tokens, "rsvp", 3, 300, false));
    expect(estimateDurationMs(tokens, "free", 3, 300, true)).toBe((11 / 300) * 60000);
  });

  it("navegação move uma frase", () => {
    const sete = tokens.findIndex((t) => t.text === "sete");
    expect(nextSentenceStart(tokens, sete)).toBe(tokens.findIndex((t) => t.text === "nove"));
    expect(prevSentenceStart(tokens, tokens.findIndex((t) => t.text === "nove"))).toBe(0);
  });
});

describe("ReaderEngine", () => {
  const text = "Alfa beta gama delta. Épsilon zeta eta teta. Iota capa lambda mi.";
  const tokens = tokenize(parsePlainText(text));
  const settings = { mode: "rsvp" as const, wpm: 600, chunkSize: 2 as const, smartPauses: false };

  it("apresenta todas as palavras em ordem e conclui", () => {
    const clock = new FakeClock();
    const e = new ReaderEngine(tokens, settings, undefined, clock);
    const seen: number[] = [];
    e.onEvent((ev) => ev === "present" && seen.push(e.tokenIndex));
    e.play();
    clock.advance(100 * tokens.length + 5);
    const s = e.snapshot();
    expect(seen).toEqual(tokens.map((t) => t.index));
    expect(s.state).toBe("concluida");
    expect(e.reachedEnd).toBe(true);
    expect(s.presentedWordCount).toBe(tokens.length);
    expect(s.uniquePresentedWordCount).toBe(tokens.length);
    expect(s.activeDurationMs).toBe(100 * tokens.length);
  });

  it("aba oculta pausa motor e cronômetro, sem compensar palavras", () => {
    const clock = new FakeClock();
    const e = new ReaderEngine(tokens, settings, undefined, clock);
    e.play();
    clock.advance(250); // 3 palavras apresentadas (t=0,100,200)
    e.pause("oculta");
    const before = e.snapshot();
    clock.advance(60_000);
    const after = e.snapshot();
    expect(after.tokenIndex).toBe(before.tokenIndex);
    expect(after.activeDurationMs).toBe(250);
    expect(after.pausedDurationMs).toBe(60_000);
    expect(after.pauseReason).toBe("oculta");
    e.play();
    expect(e.snapshot().presentedWordCount).toBe(before.presentedWordCount); // retomar não reconta
  });

  it("atraso grande do timer não pula palavras", () => {
    const clock = new FakeClock();
    const e = new ReaderEngine(tokens, settings, undefined, clock);
    const seen: number[] = [];
    e.onEvent((ev) => ev === "present" && seen.push(e.tokenIndex));
    e.play();
    clock.advance(1000, 900); // timer dispara com 900ms de atraso
    expect(seen).toEqual([0, 1]);
  });

  it("navegação manual não infla cobertura", () => {
    const clock = new FakeClock();
    const e = new ReaderEngine(tokens, settings, undefined, clock);
    e.play();
    clock.advance(50);
    e.pause();
    e.next(); // pula para "Épsilon"
    e.next(); // pula para "Iota"
    const s = e.snapshot();
    expect(s.tokenIndex).toBe(8);
    expect(s.uniquePresentedWordCount).toBe(1);
  });

  it("mudança de ritmo não reinicia e troca de modo preserva posição", () => {
    const clock = new FakeClock();
    const e = new ReaderEngine(tokens, settings, undefined, clock);
    e.play();
    clock.advance(450);
    e.setWpm(300);
    expect(e.snapshot().state).toBe("lendo");
    const pos = e.tokenIndex;
    expect(e.setMode("chunk", 2)).toBe(false); // não troca lendo
    e.pause();
    expect(e.setMode("chunk", 2)).toBe(true);
    const c = e.snapshot().chunk!;
    expect(c.start <= pos && pos < c.end).toBe(true);
    expect(e.setMode("guided", 4)).toBe(true);
    expect(e.snapshot().chunk!.end).toBeGreaterThan(pos);
  });

  it("encerrar antecipadamente não é conclusão natural", () => {
    const clock = new FakeClock();
    const e = new ReaderEngine(tokens, settings, undefined, clock);
    e.play();
    clock.advance(150);
    e.finish();
    expect(e.snapshot().state).toBe("concluida");
    expect(e.reachedEnd).toBe(false);
  });

  it("recupera sessão sempre pausada, com métricas preservadas", () => {
    const clock = new FakeClock();
    const ps = new PositionSet(tokens.length);
    [0, 1, 2].forEach((i) => ps.add(i));
    const e = new ReaderEngine(
      tokens,
      settings,
      { tokenIndex: 3, activeDurationMs: 300, pausedDurationMs: 10, presentedWordCount: 3, presentedBitset: ps.encode() },
      clock,
    );
    const s = e.snapshot();
    expect(s.state).toBe("pausado");
    expect(s.tokenIndex).toBe(3);
    expect(s.uniquePresentedWordCount).toBe(3);
    expect(s.activeDurationMs).toBe(300);
  });

  it("texto livre só mede tempo, sem avanço automático", () => {
    const clock = new FakeClock();
    const e = new ReaderEngine(tokens, { ...settings, mode: "free" }, undefined, clock);
    e.play();
    clock.advance(5000);
    const s = e.snapshot();
    expect(s.tokenIndex).toBe(0);
    expect(s.presentedWordCount).toBe(0);
    expect(s.activeDurationMs).toBe(5000);
  });

  it("pausas inteligentes deixam o ritmo observado abaixo do configurado", () => {
    const clock = new FakeClock();
    const e = new ReaderEngine(tokens, { ...settings, smartPauses: true }, undefined, clock);
    e.play();
    clock.advance(60_000);
    const s = e.snapshot();
    expect(s.state).toBe("concluida");
    expect(s.activeDurationMs).toBeGreaterThan(100 * tokens.length);
  });
});

describe("métricas", () => {
  it("dados insuficientes evitam divisões absurdas", () => {
    const m = deriveMetrics({ mode: "rsvp", modesUsed: ["rsvp"], activeDurationMs: 500, presentedWordCount: 10, uniquePresentedWordCount: 10, totalWords: 100 });
    expect(m.insufficient).toBe(true);
    expect(m.observedWpm).toBeNull();
  });

  it("calcula ritmo observado e cobertura", () => {
    const m = deriveMetrics({ mode: "rsvp", modesUsed: ["rsvp"], activeDurationMs: 60_000, presentedWordCount: 320, uniquePresentedWordCount: 300, totalWords: 400 });
    expect(m.observedWpm).toBe(320);
    expect(m.coveragePercent).toBe(75);
  });

  it("texto livre é estimativa e não tem cobertura", () => {
    const m = deriveMetrics({ mode: "free", modesUsed: ["free"], activeDurationMs: 120_000, presentedWordCount: 0, uniquePresentedWordCount: 0, totalWords: 500 });
    expect(m.observedWpm).toBe(250);
    expect(m.observedIsEstimate).toBe(true);
    expect(m.coveragePercent).toBeNull();
  });

  it("pontuação e formatação; não avaliada fica nula", () => {
    const r = scoreAttempt([0, 1, 2, 3, 0], [0, 1, 2, 3, 1]);
    expect(r).toEqual({ correctCount: 4, questionCount: 5, score: 0.8 });
    expect(formatScore(r)).toBe("4 de 5 respostas corretas — 80%");
    expect(scoreAttempt([null, null], [0, 1]).score).toBeNull();
  });

  it("revisões não substituem a primeira tentativa", () => {
    const base = { sessionId: "s", questionSetId: "q", answers: [], questionCount: 5, consultedText: false, reportedQuestionIds: [], startedAt: "", finishedAt: "x" };
    const attempts: QuizAttempt[] = [
      { ...base, id: "2", attemptNumber: 2, correctCount: 5, score: 1 },
      { ...base, id: "1", attemptNumber: 1, correctCount: 3, score: 0.6 },
    ];
    expect(primaryAttempt(attempts)!.id).toBe("1");
  });

  it("bitset codifica e decodifica", () => {
    const p = new PositionSet(30);
    [0, 7, 8, 29].forEach((i) => p.add(i));
    const q = new PositionSet(30, p.encode());
    expect(q.count).toBe(4);
    expect(q.has(29) && q.has(8) && !q.has(9)).toBe(true);
  });
});
