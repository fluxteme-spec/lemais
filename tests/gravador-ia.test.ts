import { describe, expect, it } from "vitest";
import { interpretar, montarMensagem, normalizarMapa, normalizarTarefas } from "@/lib/gravador/ia";
import { assuntosRecorrentes, grafoDaGravacao, grafoGeral, normalizar } from "@/lib/gravador/grafo";
import { interpretarSegmentos, paraWav } from "@/lib/gravador/transcreverNuvem";
import type { Gravacao } from "@/lib/gravador/store";

describe("saídas da IA", () => {
  it("normaliza o mapa: ids únicos, ligações válidas e nós soltos presos à ideia central", () => {
    const m = normalizarMapa({
      central: "Visita Mondelez",
      nos: [
        { id: "a", rotulo: "Moinho travando", grupo: "Técnico", peso: 9 },
        { id: "a", rotulo: "Correia", grupo: "Técnico", peso: 0 },
        { id: "b", rotulo: "", grupo: "x" },
        { id: "c", rotulo: "Relatório de consumo", grupo: "Comercial", peso: 3 },
      ],
      ligacoes: [
        { de: "central", para: "a" },
        { de: "a", para: "central" },
        { de: "a", para: "fantasma" },
        { de: "a", para: "a-1", rotulo: "causa" },
      ],
    })!;
    expect(m.nos.map((n) => n.id)).toEqual(["a", "a-1", "c"]);
    expect(m.nos[0].peso).toBe(5);
    expect(m.nos[1].peso).toBe(1);
    expect(m.ligacoes).toEqual([
      { de: "central", para: "a", rotulo: undefined },
      { de: "a", para: "a-1", rotulo: "causa" },
      { de: "central", para: "c", rotulo: undefined },
    ]);
  });

  it("aceita resposta com texto em volta do JSON e recusa formato errado", () => {
    const r = interpretar("essencial", 'Aqui está: {"resumo":"## Assunto\\nTeste","tarefas":[{"texto":"Trocar correia","prazo":"sexta"},{"texto":""}]}');
    expect(r.resumo).toContain("Assunto");
    expect(normalizarTarefas([{ texto: " Ligar " }, null])).toEqual([{ texto: "Ligar", responsavel: undefined, prazo: undefined }]);
    expect(r.tarefas).toHaveLength(1);
    expect(() => interpretar("ata", "sem json")).toThrow(/formato/);
  });

  it("isola a transcrição e inclui os falantes quando existem", () => {
    const msg = montarMensagem({ titulo: "T", transcricao: "oi", segmentos: [{ inicio: 0, fim: 1, texto: "oi", falante: "Pessoa 1" }] }, "ata");
    expect(msg).toContain("<transcricao>\nPessoa 1: oi\n</transcricao>");
  });
});

describe("grafo", () => {
  const g = (id: string, rotulos: string[]) =>
    ({ id, titulo: id, saidas: { mapa: { central: "c", nos: rotulos.map((r, i) => ({ id: `n${i}`, rotulo: r, grupo: "G", peso: 2 })), ligacoes: rotulos.map((_, i) => ({ de: "central", para: `n${i}` })) } } }) as unknown as Gravacao;

  it("funde a mesma ideia entre gravações ignorando acentos e maiúsculas", () => {
    const d = grafoGeral([g("r1", ["Máquina Phedra", "Café"]), g("r2", ["maquina phedra"])]);
    const phedra = d.nodes.find((n) => n.id === `i:${normalizar("Máquina Phedra")}`)!;
    expect(phedra.trechos.map((t) => t.gravacaoId)).toEqual(["r1", "r2"]);
    expect(assuntosRecorrentes(d).map((n) => n.rotulo)).toEqual(["Máquina Phedra"]);
    expect(d.links.filter((l) => l.target === phedra.id || l.source === phedra.id)).toHaveLength(2);
  });

  it("monta o grafo de uma gravação com o nó central", () => {
    const d = grafoDaGravacao(g("r1", ["A"]).saidas!.mapa!, { id: "r1", titulo: "R" });
    expect(d.nodes[0].tipo).toBe("central");
    expect(d.links).toEqual([{ source: "central", target: "n0", rotulo: undefined }]);
  });
});

describe("transcrição pela IA", () => {
  it("gera WAV 16 bits mono válido", () => {
    const w = paraWav(new Float32Array([0, 1, -1]));
    const v = new DataView(w.buffer);
    expect(String.fromCharCode(...w.subarray(0, 4))).toBe("RIFF");
    expect(v.getUint32(24, true)).toBe(16000);
    expect(v.getInt16(46, true)).toBe(32767);
    expect(v.getInt16(48, true)).toBe(-32768);
  });

  it("desloca os horários da parte e calcula o fim de cada fala", () => {
    const s = interpretarSegmentos('{"segmentos":[{"inicio":0,"falante":"Pessoa 1","texto":"Bom dia"},{"inicio":12,"falante":"Pessoa 2","texto":"Oi"},{"inicio":3,"texto":""}]}', 300, 60);
    expect(s).toEqual([
      { inicio: 300, fim: 312, texto: "Bom dia", falante: "Pessoa 1" },
      { inicio: 312, fim: 360, texto: "Oi", falante: "Pessoa 2" },
    ]);
  });
});
