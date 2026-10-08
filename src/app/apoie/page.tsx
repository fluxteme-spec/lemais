"use client";

import Link from "next/link";
import { useState } from "react";
import { supabase } from "@/lib/supabase/browser";
import { useAccount } from "@/components/Account";
import { DonorBadge } from "@/components/DonorBadge";
import { DOACAO_URL } from "@/lib/legal";

export default function SupportPage() {
  const acc = useAccount();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const profile = acc.profile;
  const isDonor = !!profile?.donor_since;
  const claimed = !!profile?.donation_claimed_at;
  const canClaim = acc.enabled && !!acc.user && !acc.needsOnboarding && !acc.blocked && !isDonor && !claimed;

  async function claim() {
    setBusy(true);
    setErr(null);
    const { error } = await supabase()!.rpc("claim_donation");
    setBusy(false);
    if (error) {
      setErr("Não foi possível registrar agora. Tente de novo.");
      return;
    }
    await acc.refreshProfile();
    setMsg("Pedido registrado. Depois de conferir a doação, a medalha aparece na sua conta.");
  }

  return (
    <article className="max-w-prose pt-10">
      <h1 className="font-serif text-4xl font-bold">Apoie o LêMais</h1>
      <p className="mt-3 text-lg">
        O LêMais é gratuito. Ele é mantido por doações voluntárias e por propagandas identificadas, e cada apoio ajuda a pagar a hospedagem e a continuar
        desenvolvendo novos recursos.
      </p>

      {isDonor && (
        <p className="mt-6 flex flex-wrap items-center gap-3 border-l-4 border-ok pl-3" role="status">
          <DonorBadge /> Obrigado por apoiar o LêMais!
        </p>
      )}

      <div className="mt-8 flex flex-wrap gap-3">
        <a className="btn btn-primary h-14 px-8 text-lg" href={DOACAO_URL} target="_blank" rel="noopener noreferrer">
          Fazer uma doação
        </a>
      </div>
      <p className="mt-3 text-sm text-muted">
        A doação é feita no Mercado Pago (Pix, cartão e outras formas), em uma página dele. O valor é você quem escolhe. Doar é opcional e não libera recursos
        extras.
      </p>

      <section aria-labelledby="medalha" className="mt-10 border-t border-line pt-6">
        <h2 id="medalha" className="font-semibold">
          Medalha de apoiador
        </h2>
        <p className="mt-1">
          Quem doa ganha a medalha <DonorBadge /> no perfil. Ela é concedida manualmente, depois que a doação é conferida.
        </p>

        {!acc.enabled || (!acc.loading && !acc.user) ? (
          <p className="mt-3">
            Para pedir a medalha,{" "}
            <Link href="/entrar?voltar=/apoie" className="underline underline-offset-4">
              entre na sua conta
            </Link>
            .
          </p>
        ) : acc.needsOnboarding ? (
          <p className="mt-3">
            Conclua o cadastro em{" "}
            <Link href="/conta" className="underline underline-offset-4">
              Minha conta
            </Link>{" "}
            para pedir a medalha.
          </p>
        ) : claimed && !isDonor ? (
          <p className="mt-3" role="status">
            Seu pedido foi registrado e está aguardando conferência.
          </p>
        ) : canClaim ? (
          <>
            <p className="mt-3 text-sm text-muted">Já doou? Registre aqui para o responsável conferir.</p>
            <button type="button" className="btn mt-2" disabled={busy} onClick={() => void claim()}>
              Já doei, quero a medalha
            </button>
          </>
        ) : null}
        {msg && (
          <p role="status" className="mt-3 border-l-4 border-ok pl-3">
            {msg}
          </p>
        )}
        {err && (
          <p role="alert" className="mt-3 text-danger">
            {err}
          </p>
        )}
      </section>
    </article>
  );
}
