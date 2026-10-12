"use client";
/** Grafo Geral: liga os assuntos que se repetem entre todas as gravações (estilo Obsidian). */
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Grafo3D, type Grafo3DRef } from "@/components/gravador/Grafo3D";
import { assuntosRecorrentes, grafoGeral, type NoGrafo } from "@/lib/gravador/grafo";
import { listar, listarProjetos, type Gravacao, type Projeto } from "@/lib/gravador/store";

const PERIODOS = [
  { dias: 7, nome: "7 dias" },
  { dias: 30, nome: "30 dias" },
  { dias: 90, nome: "90 dias" },
  { dias: 0, nome: "Tudo" },
];

export default function GrafoGeralPage() {
  const [gravacoes, setGravacoes] = useState<Gravacao[] | null>(null);
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [projeto, setProjeto] = useState("");
  const [dias, setDias] = useState(0);
  const [no, setNo] = useState<NoGrafo | null>(null);
  const grafo = useRef<Grafo3DRef>(null);

  useEffect(() => {
    listar().then(setGravacoes);
    listarProjetos().then(setProjetos);
  }, []);

  const dados = useMemo(() => {
    if (!gravacoes) return null;
    const desde = dias ? Date.now() - dias * 86_400_000 : 0;
    return grafoGeral(gravacoes.filter((g) => g.criadoEm >= desde && (!projeto || g.projetoId === projeto)));
  }, [gravacoes, projeto, dias]);

  const recorrentes = useMemo(() => (dados ? assuntosRecorrentes(dados).slice(0, 12) : []), [dados]);
  const comMapa = dados?.nodes.filter((n) => n.tipo === "gravacao").length ?? 0;

  async function compartilhar() {
    const b = await grafo.current?.foto();
    if (!b) return;
    const arq = new File([b], "grafo-geral.png", { type: "image/png" });
    try {
      if (navigator.canShare?.({ files: [arq] })) await navigator.share({ files: [arq], title: "Grafo Geral" });
    } catch {}
  }

  return (
    <div className="pt-6">
      <Link href="/gravar" className="btn btn-quiet -ml-4">
        ‹ Gravações
      </Link>
      <h1 className="mt-2 font-serif text-4xl font-bold">Grafo Geral</h1>
      <p className="mt-2 max-w-prose">Cada esfera branca é uma gravação. Ideias com o mesmo nome em gravações diferentes viram um só nó, que liga tudo.</p>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <select className="field" value={projeto} onChange={(e) => setProjeto(e.target.value)} aria-label="Projeto">
          <option value="">Todos os projetos</option>
          {projetos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
        <select className="field" value={dias} onChange={(e) => setDias(Number(e.target.value))} aria-label="Período">
          {PERIODOS.map((p) => (
            <option key={p.dias} value={p.dias}>
              {p.nome}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4">
        {!dados ? (
          <p className="text-muted">Carregando…</p>
        ) : comMapa === 0 ? (
          <p className="rounded-xl border border-line bg-surface p-4 text-muted">
            Nenhuma gravação com mapa mental neste filtro. O mapa é gerado pela IA junto com o resumo de cada gravação.
          </p>
        ) : (
          <>
            <Grafo3D ref={grafo} dados={dados} aoEscolher={setNo} altura={520} />
            <p className="mt-2 text-sm text-muted">
              {comMapa} gravações · {dados.nodes.length - comMapa} ideias · {dados.links.length} ligações
            </p>
          </>
        )}
      </div>

      {no && (
        <section className="mt-4 rounded-xl border border-line bg-surface px-4 py-3">
          <p className="font-semibold">{no.rotulo}</p>
          <p className="text-sm text-muted">{no.tipo === "gravacao" ? "Gravação" : `Aparece em ${no.trechos.length} gravação(ões)`}</p>
          <ul className="mt-2 space-y-2">
            {no.trechos.map((t) => (
              <li key={t.gravacaoId}>
                <Link href={`/gravar/${t.gravacaoId}`} className="underline underline-offset-4">
                  {t.titulo}
                </Link>
                {t.trecho && <span className="block text-sm italic text-muted">“{t.trecho}”</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {recorrentes.length > 0 && (
        <section className="mt-6">
          <h2 className="font-semibold">Assuntos que mais se repetem</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {recorrentes.map((n) => (
              <li key={n.id}>
                <button type="button" className="btn min-h-9 px-3 text-sm" onClick={() => setNo(n)}>
                  {n.rotulo} · {n.trechos.length}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {dados && comMapa > 0 && (
        <button type="button" className="btn mt-6" onClick={() => void compartilhar()}>
          Compartilhar imagem do grafo
        </button>
      )}
    </div>
  );
}
