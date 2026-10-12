"use client";
/** Versão para PDF (imprimir › salvar como PDF ou compartilhar), com a marca do LêMais. */
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Markdown } from "@/components/gravador/Markdown";
import { dataCurta, hhmmss, pegar, type Gravacao } from "@/lib/gravador/store";

export default function ImprimirPage() {
  const { id } = useParams<{ id: string }>();
  const parte = useSearchParams().get("parte");
  const [g, setG] = useState<Gravacao | null | undefined>(undefined);

  useEffect(() => {
    pegar(id).then((x) => setG(x ?? null));
  }, [id]);

  useEffect(() => {
    if (g) setTimeout(() => window.print(), 400);
  }, [g]);

  if (g === undefined) return <p className="pt-10 text-muted">Carregando…</p>;
  if (!g) return <p className="pt-10">Gravação não encontrada neste aparelho.</p>;
  const s = g.saidas ?? {};
  const mostra = (p: string) => !parte || parte === p;
  const secao = (titulo: string, md?: string) =>
    md ? (
      <section className="mt-8 break-inside-avoid-page">
        <h2 className="border-b border-line pb-1 font-serif text-2xl font-bold">{titulo}</h2>
        <div className="mt-2">
          <Markdown texto={md} />
        </div>
      </section>
    ) : null;

  return (
    <article className="impressao pt-6">
      <style>{`@media print { header, nav, footer, .nao-imprimir { display: none !important; } body { background: #fff !important; color: #000 !important; } main { max-width: none !important; padding: 0 !important; } @page { margin: 16mm; } }`}</style>
      <div className="flex items-center justify-between border-b-4 border-marker pb-3">
        <span className="font-serif text-2xl font-bold">LêMais</span>
        <span className="text-sm text-muted">Gravador</span>
      </div>
      <h1 className="mt-6 font-serif text-3xl font-bold">{g.titulo}</h1>
      <p className="text-sm text-muted">
        {dataCurta(g.criadoEm)} · duração {hhmmss(g.duracao)}
        {s.geradoPor ? ` · gerado com IA (${s.geradoPor}); confira antes de usar` : ""}
      </p>
      {mostra("resumo") && secao("Resumo", s.resumo ?? g.resumo)}
      {mostra("tarefas") && s.tarefas?.length ? secao("Tarefas", s.tarefas.map((t) => `- [${t.feita ? "x" : " "}] ${t.texto}${t.responsavel ? ` — ${t.responsavel}` : ""}${t.prazo ? ` (prazo: ${t.prazo})` : ""}`).join("\n")) : null}
      {mostra("ata") && secao("Ata", s.ata)}
      {mostra("relatorio") && secao("Relatório", s.relatorio)}
      {mostra("mapa") && s.mapa && secao("Mapa de ideias", [`**${s.mapa.central}**`, ...s.mapa.nos.map((n) => `- ${n.rotulo} — ${n.grupo}`)].join("\n"))}
      {parte === "transcricao" && secao("Transcrição", g.transcricao)}
      <p className="mt-10 text-xs text-muted">Gerado pelo LêMais em {new Date().toLocaleString("pt-BR")}.</p>
      <div className="nao-imprimir mt-6 flex gap-2">
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>
          Imprimir ou salvar PDF
        </button>
        <button type="button" className="btn" onClick={() => history.back()}>
          Voltar
        </button>
      </div>
    </article>
  );
}
