"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ADAPT_OPTIONS, AdaptError, adaptText } from "@/lib/ai/adapt";
import { getConnection } from "@/lib/ai/connection";
import { PROVIDERS, type AIConnection } from "@/lib/ai/providers";
import { repo } from "@/lib/persistence";
import { ADAPT_LABEL, makeContent } from "@/lib/session";
import type { AdaptStyle, Content } from "@/lib/types";

/** Cria uma versão adaptada do texto com a IA do usuário. O original não muda. */
export function AdaptPanel({ content }: { content: Content }) {
  const router = useRouter();
  const [conn, setConn] = useState<AIConnection | null | undefined>(undefined);
  const [style, setStyle] = useState<AdaptStyle>("simples");
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getConnection().then(setConn);
  }, []);

  if (content.adaptation) {
    return (
      <div role="note" className="mt-4 border-l-4 border-marker pl-3">
        <p>
          Esta é a <strong>{ADAPT_LABEL[content.adaptation.style]}</strong> de “{content.adaptation.fromTitle}”, criada pela IA ({content.adaptation.model}). A IA pode
          cometer erros; confira antes de ler.
        </p>
        <Link href={`/preparar/${content.adaptation.fromId}`} className="mt-1 inline-flex min-h-11 items-center underline underline-offset-4">
          Abrir o texto original
        </Link>
      </div>
    );
  }

  async function run() {
    if (!conn) return;
    setError(null);
    setProgress("Preparando…");
    try {
      const blocks = await adaptText(conn, content.textBlocks, style, (done, total) =>
        setProgress(total > 1 ? `Adaptando parte ${Math.min(done + 1, total)} de ${total}…` : "Adaptando o texto…"),
      );
      const label = ADAPT_LABEL[style];
      const c = makeContent({
        sourceType: content.sourceType === "url" ? "url" : "pasted",
        title: `${content.title} (${label})`,
        blocks,
        author: content.author,
        siteName: content.siteName,
        originalUrl: content.originalUrl,
        finalUrl: content.finalUrl,
        publishedAt: content.publishedAt,
        adaptation: { fromId: content.id, fromTitle: content.title, style, provider: conn.provider, model: conn.model },
      });
      await repo().putContent(c);
      router.push(`/preparar/${c.id}`);
    } catch (e) {
      setProgress(null);
      setError(e instanceof AdaptError ? e.message : "Não foi possível adaptar o texto agora.");
    }
  }

  return (
    <details className="mt-6 rounded-xl border-[1.5px] border-line p-4 open:bg-surface">
      <summary className="min-h-11 cursor-pointer content-center font-semibold">Adaptar o texto</summary>
      <p className="mt-2 max-w-prose text-sm text-muted">
        Crie uma versão mais simples, para entender melhor, ou em outro estilo, para ampliar o vocabulário. O original continua salvo, e a versão adaptada
        ganha perguntas próprias.
      </p>
      {conn === null ? (
        <p className="mt-3">
          Para adaptar textos, conecte a sua IA.{" "}
          <Link href="/conectar-ia" className="underline underline-offset-4">
            Conectar minha IA
          </Link>
        </p>
      ) : (
        <>
          <fieldset className="mt-4" disabled={!!progress}>
            <legend className="sr-only">Estilo</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {ADAPT_OPTIONS.map((o) => (
                <label key={o.id} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border-[1.5px] border-line p-3 has-[:checked]:border-ink">
                  <input type="radio" name="estilo" className="mt-1 size-5 accent-[var(--ink)]" checked={style === o.id} onChange={() => setStyle(o.id)} />
                  <span>
                    <span className="block font-semibold">{o.label}</span>
                    <span className="block text-sm text-muted">{o.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          {conn && (
            <p className="mt-3 text-sm text-muted">
              O texto será enviado do seu navegador para a sua conta em {PROVIDERS[conn.provider].name} ({conn.model}). O custo segue o seu plano no provedor.
            </p>
          )}
          <button type="button" className="btn btn-primary mt-3" disabled={!conn || !!progress} onClick={() => void run()}>
            {progress ?? "Criar versão adaptada"}
          </button>
          {progress && (
            <p role="status" className="sr-only">
              {progress}
            </p>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="mt-3 border-l-4 border-danger pl-3">
          {error}
        </p>
      )}
    </details>
  );
}
