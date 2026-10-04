"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/browser";
import { useAccount } from "@/components/Account";

// O botão do Google só aparece depois que o login Google é ativado no Supabase.
const GOOGLE_ENABLED = process.env.NEXT_PUBLIC_GOOGLE_LOGIN === "1";

function safeNext(v: string | null): string {
  return v && v.startsWith("/") && !v.startsWith("//") ? v : "/conta";
}

export default function SignInPage() {
  const router = useRouter();
  const { enabled, user, loading } = useAccount();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [next, setNext] = useState("/conta");

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setNext(safeNext(p.get("voltar")));
    if (p.get("erro")) setError("O login não foi concluído. Tente de novo.");
  }, []);

  useEffect(() => {
    if (!loading && user) router.replace(next);
  }, [loading, user, next, router]);

  if (!enabled)
    return (
      <div className="pt-12">
        <h1 className="font-serif text-3xl font-bold">Contas indisponíveis</h1>
        <p className="mt-3 max-w-prose">
          Esta instalação do LêMais não tem contas configuradas. Você pode
          continuar lendo normalmente; os dados ficam neste aparelho.
        </p>
        <Link href="/" className="btn btn-primary mt-5">
          Voltar ao início
        </Link>
      </div>
    );

  async function google() {
    setBusy(true);
    setError(null);
    const { error: e } = await supabase()!.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (e) {
      setError(
        "Não foi possível abrir o login do Google. Tente de novo ou entre com e-mail.",
      );
      setBusy(false);
    }
  }

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await supabase()!.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (err) {
      setError(
        /banned/i.test(err.message)
          ? "Esta conta foi suspensa pela administração do LêMais."
          : /rate|security purposes/i.test(err.message)
            ? "Muitos pedidos de código. Aguarde um minuto e tente de novo."
            : "Não foi possível enviar o código. Confira o e-mail.",
      );
      return;
    }
    setStep("code");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await supabase()!.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: "email",
    });
    setBusy(false);
    if (err) {
      setError(
        /banned/i.test(err.message)
          ? "Esta conta foi suspensa pela administração do LêMais."
          : "Código inválido ou expirado. Confira os números ou peça um novo código.",
      );
      return;
    }
    router.replace(next);
  }

  return (
    <div className="pt-10">
      <h1 className="font-serif text-4xl font-bold">Entrar</h1>
      <p className="mt-3 max-w-prose">
        Com uma conta, suas leituras ficam salvas em todos os seus aparelhos e
        você pode compartilhar seus resultados.
      </p>

      {error && (
        <p role="alert" className="mt-4 border-l-4 border-danger pl-3">
          {error}
        </p>
      )}

      {GOOGLE_ENABLED && (
        <>
          <button
            type="button"
            className="btn mt-8 h-14 w-full gap-3 text-lg sm:w-auto sm:px-8"
            disabled={busy}
            onClick={() => void google()}
          >
            <svg aria-hidden width="20" height="20" viewBox="0 0 48 48">
              <path
                fill="#FFC107"
                d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
              />
              <path
                fill="#FF3D00"
                d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
              />
              <path
                fill="#4CAF50"
                d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
              />
              <path
                fill="#1976D2"
                d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
              />
            </svg>
            Continuar com Google
          </button>

          <div className="my-8 flex items-center gap-3 text-sm text-muted">
            <span className="h-px flex-1 bg-line" />
            ou com e-mail
            <span className="h-px flex-1 bg-line" />
          </div>
        </>
      )}

      {step === "email" ? (
        <form onSubmit={sendCode} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block font-medium">
              E-mail
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              className="field"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy || !email.includes("@")}
          >
            {busy ? "Enviando…" : "Receber código por e-mail"}
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-4">
          <p>
            Enviamos um código de 6 números para <strong>{email}</strong>.
            Confira também a caixa de spam.
          </p>
          <div>
            <label htmlFor="codigo" className="mb-1 block font-medium">
              Código
            </label>
            <input
              id="codigo"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={8}
              className="field w-44 text-center text-2xl tracking-[0.3em] tabular-nums"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={busy || code.length < 6}
            >
              {busy ? "Conferindo…" : "Entrar"}
            </button>
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => setStep("email")}
            >
              Usar outro e-mail
            </button>
          </div>
        </form>
      )}

      <p className="mt-10 max-w-prose text-sm text-muted">
        Ao entrar, você concorda com os{" "}
        <Link href="/termos" className="underline underline-offset-4">
          Termos de uso
        </Link>{" "}
        e a{" "}
        <Link href="/privacidade" className="underline underline-offset-4">
          Política de privacidade
        </Link>
        . É preciso ter 13 anos ou mais.
      </p>
    </div>
  );
}
