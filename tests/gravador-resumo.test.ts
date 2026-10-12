import { describe, expect, it } from "vitest";
import { frases, resumir, resumoEmTexto } from "@/lib/gravador/resumo";

const REUNIAO =
  "Bom dia pessoal, vamos falar da máquina Phedra do cliente Mondelez. A máquina Phedra está com o moinho travando desde segunda. " +
  "O técnico Fábio precisa trocar a correia do moinho até sexta. Também tem que verificar o estoque de café no galpão. " +
  "O cliente reclamou do tempo de atendimento do chamado. Ficou combinado que vamos enviar o relatório de consumo na quinta. " +
  "O resto foi conversa sobre o almoço e o jogo de domingo.";

describe("resumo local do gravador", () => {
  it("separa frases e ignora fragmentos curtos", () => {
    expect(frases("Oi. Isto é uma frase completa aqui. Ok!")).toEqual(["Isto é uma frase completa aqui."]);
  });

  it("encontra pendências sem confundir o começo da conversa com tarefa", () => {
    const r = resumir(REUNIAO);
    expect(r.acoes).toHaveLength(3);
    expect(r.acoes.join(" ")).toContain("trocar a correia");
    expect(r.acoes.join(" ")).not.toContain("vamos falar");
  });

  it("escolhe destaques na ordem original e palavras-chave repetidas", () => {
    const r = resumir(REUNIAO);
    expect(r.destaques.length).toBeGreaterThanOrEqual(2);
    expect(REUNIAO.indexOf(r.destaques[0])).toBeLessThan(REUNIAO.indexOf(r.destaques[1]));
    expect(r.palavras).toContain("moinho");
  });

  it("avisa quando não há o que resumir", () => {
    expect(resumoEmTexto("curto")).toMatch(/curta demais/);
  });
});
