"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getSample } from "./claude-ai";

export default function ConectarIAPage() {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    getSample().then((s) => setOk(!!s));
  }, []);
  return (
    <div className="pt-10">
      <h1 className="font-serif text-4xl font-bold">IA nesta versão de teste</h1>
      <p className="mt-3 max-w-prose">
        Aqui, as perguntas sobre textos colados e a adaptação de texto usam o <strong>Claude da sua própria conta</strong>, direto por esta página. Na primeira
        vez, o Claude pede a sua autorização. O uso conta no seu plano do Claude.
      </p>
      <p className="mt-3 max-w-prose" role="status">
        {ok === null ? "Verificando…" : ok ? "Claude disponível nesta página." : "O Claude não está disponível neste modo de visualização. Os textos da área Treinar funcionam sem IA."}
      </p>
      <p className="mt-6 max-w-prose text-sm text-muted">
        Na versão publicada do app, cada pessoa conecta a própria IA: login com OpenRouter (inclusive com conta Google) ou chave do Google Gemini, da OpenAI
        ou da Anthropic.
      </p>
      <Link href="/treinar" className="btn btn-primary mt-6">
        Ir para Treinar
      </Link>
    </div>
  );
}
