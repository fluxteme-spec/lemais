"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/browser";
import { clearInvite, pendingInvite, useAccount } from "@/components/Account";
import { repo } from "@/lib/persistence";

function timeAgo(iso: string | null): string {
  if (!iso) return "ainda não";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "agora há pouco";
  if (s < 3600) return `há ${Math.round(s / 60)} min`;
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export default function AccountPage() {
  const router = useRouter();
  const acc = useAccount();
  const [name, setName] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pendingOut, setPendingOut] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  useEffect(() => {
    if (acc.profile?.display_name) setName(acc.profile.display_name);
  }, [acc.profile?.display_name]);

  useEffect(() => {
    if (!acc.loading && !acc.user && !acc.blocked) router.replace("/entrar?voltar=/conta");
  }, [acc.loading, acc.user, acc.blocked, router]);

  if (acc.blocked)
    return (
      <div className="pt-12">
        <h1 className="font-serif text-3xl font-bold">Conta suspensa</h1>
        <p className="mt-3 max-w-prose">Esta conta foi suspensa pela administração do LêMais. Você ainda pode ler sem conta neste aparelho.</p>
        <button type="button" className="btn mt-5" onClick={() => void acc.signOut({ force: true })}>
          Sair
        </button>
      </div>
    );

  if (acc.loading || !acc.user || !acc.profile) return <p className="pt-12 text-muted">Carregando…</p>;

  async function saveProfile(confirm: boolean) {
    setBusy(true);
    setErr(null);
    let invitedBy: string | null = null;
    const invite = pendingInvite();
    if (confirm && invite) {
      const { data } = await supabase()!.from("shares").select("user_id").eq("id", invite).maybeSingle();
      invitedBy = (data?.user_id as string | undefined) ?? null;
    }
    const { error } = await supabase()!.rpc("update_my_profile", { p_display_name: name, p_confirm: confirm, p_invited_by: invitedBy });
    setBusy(false);
    if (error) {
      setErr("Não foi possível salvar. Tente de novo.");
      return;
    }
    if (confirm) clearInvite();
    await acc.refreshProfile();
    setMsg(confirm ? "Tudo pronto. Suas leituras deste aparelho estão sendo enviadas para a sua conta." : "Nome atualizado.");
  }

  if (acc.needsOnboarding)
    return (
      <div className="pt-10">
        <h1 className="font-serif text-4xl font-bold">Boas-vindas ao LêMais</h1>
        <p className="mt-3 max-w-prose">Só falta confirmar dois detalhes para ativar a sua conta.</p>
        <form
          className="mt-8 space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            void saveProfile(true);
          }}
        >
          <div>
            <label htmlFor="nome" className="mb-1 block font-medium">
              Como quer ser chamado?
            </label>
            <input id="nome" className="field" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
            <p className="mt-1 text-sm text-muted">Aparece nos cartões que você compartilhar.</p>
          </div>
          <div className="flex items-start gap-3">
            <input id="aceite" type="checkbox" className="mt-1 size-6 shrink-0 accent-[var(--ink)]" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <label htmlFor="aceite">
              Tenho 13 anos ou mais e aceito os{" "}
              <Link href="/termos" target="_blank" className="underline underline-offset-4">
                Termos de uso
              </Link>{" "}
              e a{" "}
              <Link href="/privacidade" target="_blank" className="underline underline-offset-4">
                Política de privacidade
              </Link>
              .
            </label>
          </div>
          {err && (
            <p role="alert" className="text-danger">
              {err}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <button type="submit" className="btn btn-primary" disabled={busy || !agree || !name.trim()}>
              Ativar minha conta
            </button>
            <button type="button" className="btn btn-quiet" onClick={() => void acc.signOut({ force: true })}>
              Agora não (sair)
            </button>
          </div>
        </form>
      </div>
    );

  const sync = acc.sync;
  return (
    <div className="pt-10">
      <h1 className="font-serif text-4xl font-bold">Minha conta</h1>
      <p className="mt-2 text-muted">{acc.user.email}</p>
      {msg && (
        <p role="status" className="mt-4 border-l-4 border-ok pl-3">
          {msg}
        </p>
      )}

      <section aria-labelledby="sinc" className="mt-8">
        <h2 id="sinc" className="font-semibold">
          Sincronização
        </h2>
        <p className="mt-1" role="status">
          {!sync || sync.state === "syncing"
            ? "Sincronizando…"
            : sync.state === "error"
              ? sync.message
              : `Leituras salvas na conta. Última sincronização: ${timeAgo(sync.lastAt)}.`}
        </p>
        <button type="button" className="btn mt-3" onClick={() => void acc.syncNow()}>
          Sincronizar agora
        </button>
        <p className="mt-2 max-w-prose text-sm text-muted">
          Textos, leituras, questionários e preferências ficam na sua conta. A conexão com a sua IA não é enviada: conecte-a em cada aparelho.
        </p>
      </section>

      <section aria-labelledby="perfil" className="mt-10">
        <h2 id="perfil" className="font-semibold">
          Nome
        </h2>
        <form
          className="mt-2 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void saveProfile(false);
          }}
        >
          <label className="flex-1">
            <span className="sr-only">Nome</span>
            <input className="field" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <button type="submit" className="btn" disabled={busy || !name.trim()}>
            Salvar nome
          </button>
        </form>
      </section>

      <section className="mt-10 flex flex-wrap gap-3">
        <button
          type="button"
          className="btn"
          onClick={async () => {
            const r = await acc.signOut();
            if (!r.ok) setPendingOut(r.pending ?? 0);
          }}
        >
          Sair da conta
        </button>
        {acc.isAdmin && (
          <Link href="/admin" className="btn">
            Painel do desenvolvedor
          </Link>
        )}
      </section>
      {pendingOut !== null && (
        <div role="alert" className="mt-4 border-l-4 border-danger pl-3">
          <p>
            {pendingOut} {pendingOut === 1 ? "alteração ainda não foi enviada" : "alterações ainda não foram enviadas"} para a conta. Ao sair, os dados
            deste aparelho são apagados e essas alterações se perdem.
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            <button type="button" className="btn" onClick={() => void acc.syncNow().then(() => setPendingOut(null))}>
              Tentar sincronizar
            </button>
            <button type="button" className="btn btn-danger" onClick={() => void acc.signOut({ force: true })}>
              Sair mesmo assim
            </button>
          </div>
        </div>
      )}
      <p className="mt-2 max-w-prose text-sm text-muted">Ao sair, as leituras são apagadas deste aparelho e continuam na sua conta.</p>

      <section aria-labelledby="excluir" className="mt-14 border-t border-line pt-6">
        <h2 id="excluir" className="font-semibold">
          Excluir conta
        </h2>
        <p className="mt-1 max-w-prose text-sm">Apaga a conta e todos os dados salvos nela, inclusive cartões compartilhados. Não é possível desfazer.</p>
        <label className="mt-3 block text-sm">
          Para confirmar, digite EXCLUIR
          <input className="field mt-1 max-w-xs" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
        </label>
        <button
          type="button"
          className="btn btn-danger mt-3"
          disabled={confirmText !== "EXCLUIR" || deleting}
          onClick={async () => {
            setDeleting(true);
            const r = await fetch("/api/conta/excluir", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ confirmacao: "EXCLUIR" }),
            })
              .then((x) => x.json())
              .catch(() => ({ ok: false }));
            if (r.ok) {
              await supabase()!.auth.signOut().catch(() => {});
              await repo().clearAll().catch(() => {});
              window.location.href = "/";
            } else {
              setDeleting(false);
              setErr(r.message ?? "Não foi possível excluir a conta agora.");
            }
          }}
        >
          Excluir minha conta
        </button>
        {err && (
          <p role="alert" className="mt-2 text-danger">
            {err}
          </p>
        )}
      </section>
    </div>
  );
}
