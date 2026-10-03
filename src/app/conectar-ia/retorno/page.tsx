"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { exchangeCode } from "@/lib/ai/oauth";
import { listModels, suggestModel } from "@/lib/ai/providers";
import { saveConnection } from "@/lib/ai/connection";

export default function OAuthReturnPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // o código só pode ser trocado uma vez
    ran.current = true;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    // remove o código da barra de endereço e do histórico
    window.history.replaceState(null, "", "/conectar-ia/retorno");
    if (!code) {
      setError("O login foi cancelado ou não retornou um código.");
      return;
    }
    (async () => {
      try {
        const key = await exchangeCode(code, params.get("state"), window.sessionStorage);
        const models = await listModels("openrouter", key);
        const model = suggestModel("openrouter", models);
        if (!model) throw new Error("A conta não tem modelos disponíveis.");
        await saveConnection({ provider: "openrouter", apiKey: key, model, connectedAt: new Date().toISOString() });
        router.replace("/conectar-ia?ok=1");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Não foi possível concluir o login.");
      }
    })();
  }, [router]);

  return (
    <div className="pt-12">
      {error ? (
        <>
          <h1 className="font-serif text-3xl font-bold">Não foi possível conectar</h1>
          <p role="alert" className="mt-3 max-w-prose">
            {error}
          </p>
          <Link href="/conectar-ia" className="btn btn-primary mt-5">
            Tentar de novo
          </Link>
        </>
      ) : (
        <p role="status" className="text-lg">
          Concluindo o login com OpenRouter…
        </p>
      )}
    </div>
  );
}
