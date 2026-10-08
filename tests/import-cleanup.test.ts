import { describe, expect, it } from "vitest";
import { joinPages, reflowText, splitIntoPages } from "@/lib/import/cleanup";

describe("reflowText", () => {
  it("junta linhas do mesmo parágrafo e une palavras cortadas pelo hífen", () => {
    const raw = ["A leitura é uma habilidade que se desenvolve com a prática cons-", "tante e com atenção ao que se lê todos os dias da semana,", "sem pressa e com curiosidade verdadeira pelo texto."].join("\n");
    expect(reflowText(raw)).toBe("A leitura é uma habilidade que se desenvolve com a prática constante e com atenção ao que se lê todos os dias da semana, sem pressa e com curiosidade verdadeira pelo texto.");
  });

  it("usa a linha curta que termina em ponto como fim de parágrafo", () => {
    const long = "Esta é uma linha comprida o bastante para servir de referência de largura do texto";
    const raw = [long, long, "Fim do primeiro parágrafo.", long, long, "Fim do segundo."].join("\n");
    expect(reflowText(raw).split("\n\n")).toHaveLength(2);
  });

  it("remove números de página e normaliza ligaduras", () => {
    const raw = "O ﬁnal da história\n\n12\n\nPágina 13\n\nContinua aqui.";
    const out = reflowText(raw);
    expect(out).not.toMatch(/^12$/m);
    expect(out).not.toMatch(/Página 13/);
    expect(out).toContain("final");
  });

  it("mantém um título curto separado do texto", () => {
    const long = "Esta é uma linha comprida o bastante para servir de referência de largura do texto aqui";
    const raw = [long, long, "Fim do parágrafo.", "Capítulo Dois", long, long, "Fim."].join("\n");
    const paras = reflowText(raw).split("\n\n");
    expect(paras).toContain("Capítulo Dois");
  });
});

describe("joinPages", () => {
  it("une a frase que continua na página seguinte", () => {
    expect(joinPages(["Ele disse que não", "voltaria mais."])).toBe("Ele disse que não voltaria mais.");
  });
  it("mantém parágrafos separados quando a frase terminou", () => {
    expect(joinPages(["Fim da página.", "Começa outra."])).toBe("Fim da página.\n\nComeça outra.");
  });
});

describe("splitIntoPages", () => {
  it("divide por volume de palavras sem cortar parágrafos", () => {
    const para = Array(60).fill("palavra").join(" ");
    const text = Array(10).fill(para).join("\n\n");
    const pages = splitIntoPages(text, 200);
    expect(pages.length).toBe(4);
    expect(pages.join("\n\n")).toBe(text);
  });
});
