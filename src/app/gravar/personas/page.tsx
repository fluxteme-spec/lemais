"use client";
/** Biblioteca de personas (quem a IA é e como trata a transcrição) e projetos (para organizar). */
import Link from "next/link";
import { useEffect, useState } from "react";
import { CORES_PROJETO, PERSONAS_PRONTAS, personasComPadrao } from "@/lib/gravador/personas";
import { apagarPersona, apagarProjeto, guardarPersona, guardarProjeto, listarProjetos, novoId, type Persona, type Projeto } from "@/lib/gravador/store";

export default function PersonasPage() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [editando, setEditando] = useState<Persona | null>(null);
  const [novoProjeto, setNovoProjeto] = useState("");

  const recarregar = () => {
    personasComPadrao().then(setPersonas);
    listarProjetos().then((p) => setProjetos(p.sort((a, b) => a.nome.localeCompare(b.nome))));
  };
  useEffect(recarregar, []);

  async function salvar() {
    if (!editando || !editando.nome.trim() || !editando.papel.trim()) return;
    await guardarPersona({ ...editando, nome: editando.nome.trim(), atualizadoEm: Date.now() });
    setEditando(null);
    recarregar();
  }

  async function restaurar(p: Persona) {
    const original = PERSONAS_PRONTAS.find((x) => x.id === p.id);
    if (original && confirm(`Voltar a persona “${p.nome}” ao texto original?`)) {
      await guardarPersona({ ...original, atualizadoEm: Date.now() });
      setEditando(null);
      recarregar();
    }
  }

  return (
    <div className="pt-6">
      <Link href="/gravar" className="btn btn-quiet -ml-4">
        ‹ Gravações
      </Link>
      <h1 className="mt-2 font-serif text-4xl font-bold">Personas e projetos</h1>
      <p className="mt-2 max-w-prose">
        A persona define <strong>quem</strong> a IA é e <strong>como</strong> ela trata cada transcrição para gerar resumo, tarefas, mapa, ata e relatório. Você escolhe a persona em cada gravação.
      </p>

      <section className="mt-8" aria-labelledby="p">
        <div className="flex items-center justify-between">
          <h2 id="p" className="font-semibold">
            Personas
          </h2>
          <button type="button" className="btn" onClick={() => setEditando({ id: novoId("p-"), nome: "", papel: "", comportamento: "", atualizadoEm: Date.now() })}>
            Nova persona
          </button>
        </div>

        {editando && (
          <div className="mt-4 grid gap-3 rounded-xl border border-line bg-surface p-4">
            <label className="grid gap-1">
              Nome
              <input className="field" value={editando.nome} maxLength={40} onChange={(e) => setEditando({ ...editando, nome: e.target.value })} placeholder="Ex.: Consultor comercial" />
            </label>
            <label className="grid gap-1">
              Quem a IA é
              <textarea className="field min-h-24" value={editando.papel} maxLength={1000} onChange={(e) => setEditando({ ...editando, papel: e.target.value })} placeholder="Ex.: Você é um consultor comercial do mercado de café corporativo…" />
            </label>
            <label className="grid gap-1">
              Como tratar a transcrição
              <textarea
                className="field min-h-28"
                value={editando.comportamento}
                maxLength={2000}
                onChange={(e) => setEditando({ ...editando, comportamento: e.target.value })}
                placeholder="Ex.: Destaque objeções do cliente, preços citados e próximos passos. Ignore conversa fiada. Tom direto."
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-primary" onClick={() => void salvar()} disabled={!editando.nome.trim() || !editando.papel.trim()}>
                Salvar
              </button>
              <button type="button" className="btn" onClick={() => setEditando(null)}>
                Cancelar
              </button>
              {editando.pronta && (
                <button type="button" className="btn btn-quiet" onClick={() => void restaurar(editando)}>
                  Restaurar original
                </button>
              )}
            </div>
          </div>
        )}

        <ul className="mt-4 divide-y divide-line border-y border-line">
          {personas.map((p) => (
            <li key={p.id} className="py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-serif text-xl font-bold">
                    {p.nome} {p.pronta && <span className="font-sans text-xs font-normal text-muted">pronta</span>}
                  </p>
                  <p className="line-clamp-2 text-sm text-muted">{p.papel}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button type="button" className="btn min-h-9 px-3 text-sm" onClick={() => setEditando(p)}>
                    Editar
                  </button>
                  {!p.pronta && (
                    <button
                      type="button"
                      className="btn btn-quiet min-h-9 px-2 text-sm text-danger"
                      onClick={async () => {
                        if (confirm(`Excluir a persona “${p.nome}”?`)) {
                          await apagarPersona(p.id);
                          recarregar();
                        }
                      }}
                    >
                      Excluir
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10" aria-labelledby="pr">
        <h2 id="pr" className="font-semibold">
          Projetos
        </h2>
        <p className="text-sm text-muted">Servem para organizar as gravações e filtrar o Grafo Geral.</p>
        <form
          className="mt-3 flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const nome = novoProjeto.trim();
            if (!nome) return;
            await guardarProjeto({ id: novoId("pr-"), nome, cor: CORES_PROJETO[projetos.length % CORES_PROJETO.length], atualizadoEm: Date.now() });
            setNovoProjeto("");
            recarregar();
          }}
        >
          <input className="field" value={novoProjeto} maxLength={40} onChange={(e) => setNovoProjeto(e.target.value)} placeholder="Ex.: ConnectVending, Pessoal, Italiano" aria-label="Nome do projeto" />
          <button type="submit" className="btn btn-primary shrink-0">
            Criar
          </button>
        </form>
        <ul className="mt-3 flex flex-wrap gap-2">
          {projetos.map((p) => (
            <li key={p.id} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface py-1 pl-3 pr-1">
              <span aria-hidden className="h-3 w-3 rounded-full" style={{ background: p.cor }} />
              {p.nome}
              <button
                type="button"
                className="btn btn-quiet min-h-8 min-w-8 px-2 text-sm"
                aria-label={`Excluir o projeto ${p.nome}`}
                onClick={async () => {
                  if (confirm(`Excluir o projeto “${p.nome}”? As gravações continuam, só ficam sem projeto.`)) {
                    await apagarProjeto(p.id);
                    recarregar();
                  }
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
