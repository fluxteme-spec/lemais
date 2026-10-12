import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { apagar, guardar, hhmmss, listar, novaGravacao, pegar, recuperarRascunho, RASCUNHO } from "@/lib/gravador/store";

describe("armazenamento do gravador", () => {
  it("guarda, lista do mais novo para o mais antigo e apaga", async () => {
    const a = novaGravacao(new Blob(["a"], { type: "audio/mp4" }), 5, { criadoEm: 1000 });
    const b = novaGravacao(new Blob(["b"], { type: "audio/mp4" }), 7, { criadoEm: 2000 });
    await guardar(a);
    await guardar(b);
    expect((await listar()).map((g) => g.id)).toEqual([b.id, a.id]);
    await apagar(a.id);
    await apagar(b.id);
    expect(await listar()).toEqual([]);
  });

  it("recupera uma gravação interrompida e não lista o rascunho", async () => {
    await guardar({ id: RASCUNHO, criadoEm: 3000, duracao: 12, mime: "audio/mp4", audio: new Blob(["x"], { type: "audio/mp4" }) });
    expect(await listar()).toEqual([]);
    const g = await recuperarRascunho();
    expect(g?.titulo).toMatch(/^Gravação recuperada/);
    expect(g?.duracao).toBe(12);
    expect(await pegar(RASCUNHO)).toBeUndefined();
    expect(await recuperarRascunho()).toBeNull();
  });

  it("formata a duração", () => {
    expect(hhmmss(5)).toBe("0:05");
    expect(hhmmss(3725)).toBe("1:02:05");
  });
});
