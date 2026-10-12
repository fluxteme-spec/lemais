"use client";
/** Link público de uma gravação: só leitura, com validade, sem áudio. */
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Markdown } from "@/components/gravador/Markdown";
import { Grafo3D } from "@/components/gravador/Grafo3D";
import { grafoDaGravacao, type NoGrafo } from "@/lib/gravador/grafo";
import type { ConteudoPublico } from "@/lib/gravador/nuvem";
import { dataCurta, hhmmss } from "@/lib/gravador/store";
import { supabase } from "@/lib/supabase/browser";

export default function LinkPublicoPage() {
  const { id } = useParams<{ id: string }>();
  const [c, setC] = useState<(ConteudoPublico & { expira: string }) | null | undefined>(undefined);
  const [no, setNo] = useState<NoGrafo | null>(null);

  useEffect(() => {
    const sb = supabase();
    if (!sb) return setC(null);
    sb.from("gravador_publicos")
      .select("conteudo, expira_em")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => setC(data ? { ...(data.conteudo as ConteudoPublico), expira: data.expira_em as string } : null));
  }, [id]);

  const dados = useMemo(() => (c?.saidas.mapa ? grafoDaGravacao(c.saidas.mapa, { id, titulo: c.titulo }) : null), [c, id]);

  if (c === undefined) return <p className="pt-10 text-muted">Carregando…</p>;
  if (!c)
    return (
      <div className="pt-10">
        <h1 className="font-serif text-3xl font-bold">Link indisponível</h1>
        <p className="mt-2">Este link expirou ou foi revogado por quem o criou.</p>
        <Link href="/" className="btn mt-6">
          Conhecer o LêMais
        </Link>
      </div>
    );
  const s = c.saidas;
  return (
    <article className="pt-8">
      <p className="text-sm text-muted">Compartilhado pelo Gravador do LêMais · disponível até {new Date(c.expira).toLocaleDateString("pt-BR")}</p>
      <h1 className="mt-2 font-serif text-3xl font-bold">{c.titulo}</h1>
      <p className="text-sm text-muted">
        {dataCurta(c.criadoEm)} · {hhmmss(c.duracao)} · conteúdo gerado com ajuda de IA
      </p>
      {s.resumo && (
        <section className="mt-6 rounded-xl border border-line bg-surface px-4 py-3">
          <Markdown texto={s.resumo} />
        </section>
      )}
      {!!s.tarefas?.length && (
        <section className="mt-6">
          <h2 className="font-semibold">Tarefas</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {s.tarefas.map((t, i) => (
              <li key={i} className={t.feita ? "text-muted line-through" : ""}>
                {t.texto}
                {(t.responsavel || t.prazo) && <span className="text-sm text-muted"> — {[t.responsavel, t.prazo].filter(Boolean).join(", ")}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {dados && (
        <section className="mt-6">
          <h2 className="mb-2 font-semibold">Mapa de ideias</h2>
          <Grafo3D dados={dados} aoEscolher={setNo} altura={420} />
          {no && <p className="mt-2 text-sm">{no.rotulo}{no.trechos[0]?.trecho ? ` — “${no.trechos[0].trecho}”` : ""}</p>}
        </section>
      )}
      {s.ata && (
        <section className="mt-6">
          <h2 className="font-semibold">Ata</h2>
          <Markdown texto={s.ata} />
        </section>
      )}
      {s.relatorio && (
        <section className="mt-6">
          <h2 className="font-semibold">Relatório</h2>
          <Markdown texto={s.relatorio} />
        </section>
      )}
    </article>
  );
}
