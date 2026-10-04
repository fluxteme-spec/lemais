"use client";

import Link from "next/link";
import { useState } from "react";
import { supabase } from "@/lib/supabase/browser";
import { useAccount } from "./Account";
import { Sheet } from "./Sheet";
import { deriveMetrics } from "@/lib/metrics";
import { ADAPT_LABEL, MODE_LABEL } from "@/lib/session";
import type { Content, QuizAttempt, ReadingSession } from "@/lib/types";

function excerptOf(content: Content): string {
  const p = content.textBlocks.find((b) => b.type === "paragraph")?.text ?? "";
  if (p.length <= 200) return p;
  return p.slice(0, 200).replace(/\s+\S*$/, "") + "…";
}

type Created = { id: string; url: string };

export function SharePanel({ session, content, attempt }: { session: ReadingSession; content: Content | null; attempt: QuizAttempt | null }) {
  const acc = useAccount();
  const [open, setOpen] = useState(false);
  const [withExcerpt, setWithExcerpt] = useState(false);
  const [withScore, setWithScore] = useState(true);
  const [created, setCreated] = useState<Created | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (!acc.enabled) return null;

  const m = deriveMetrics({ ...session });
  const source = content?.siteName ?? (content?.finalUrl ? new URL(content.finalUrl).hostname.replace(/^www\./, "") : content?.author ?? null);

  async function create() {
    if (!acc.user || !content) return;
    setBusy(true);
    setMsg(null);
    const row = {
      user_id: acc.user.id,
      display_name: acc.profile?.display_name ?? null,
      title: session.contentTitle.slice(0, 200),
      source: source?.slice(0, 120) ?? null,
      excerpt: withExcerpt ? excerptOf(content).slice(0, 220) : null,
      mode: session.modesUsed.map((x) => MODE_LABEL[x]).join(", ").slice(0, 40),
      observed_wpm: m.observedWpm,
      wpm_is_estimate: m.observedIsEstimate,
      words: session.totalWords,
      active_seconds: Math.round(session.activeDurationMs / 1000),
      correct: withScore && attempt?.correctCount != null ? attempt.correctCount : null,
      question_count: withScore && attempt ? attempt.questionCount : null,
      adaptation: session.adaptation ? ADAPT_LABEL[session.adaptation] : null,
    };
    const { data, error } = await supabase()!.from("shares").insert(row).select("id").single();
    setBusy(false);
    if (error || !data) {
      setMsg("Não foi possível criar o cartão. Confira sua conexão.");
      return;
    }
    setCreated({ id: data.id, url: `${window.location.origin}/s/${data.id}` });
  }

  const inviteText = created
    ? `Li “${session.contentTitle}” no LêMais${m.observedWpm ? ` a ${m.observedWpm} PPM` : ""}${withScore && attempt?.correctCount != null ? `, ${attempt.correctCount} de ${attempt.questionCount} no teste` : ""}. Venha ler comigo: ${created.url}`
    : "";

  async function shareStory() {
    if (!created) return;
    setMsg("Preparando a imagem…");
    try {
      const res = await fetch(`/api/cartao/${created.id}?formato=story`);
      const blob = await res.blob();
      const file = new File([blob], "lemais.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: inviteText });
        setMsg("Escolha o Instagram (Stories ou Feed) na lista de compartilhamento.");
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "lemais-stories.png";
        a.click();
        URL.revokeObjectURL(a.href);
        setMsg("Imagem baixada. Publique-a nos Stories ou no Feed do Instagram pelo celular.");
      }
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") setMsg("Não foi possível preparar a imagem.");
      else setMsg(null);
    }
  }

  async function copy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(inviteText);
      setMsg("Convite copiado.");
    } catch {
      setMsg(created.url);
    }
  }

  return (
    <>
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        Compartilhar
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Compartilhar resultado">
        {!acc.user ? (
          <div>
            <p>Entre na sua conta para criar um cartão com seu resultado e convidar amigos.</p>
            <Link href={`/entrar?voltar=/sessao/${session.id}`} className="btn btn-primary mt-4">
              Entrar
            </Link>
          </div>
        ) : acc.needsOnboarding ? (
          <div>
            <p>Conclua o cadastro para compartilhar.</p>
            <Link href="/conta" className="btn btn-primary mt-4">
              Concluir cadastro
            </Link>
          </div>
        ) : !created ? (
          <div className="space-y-4">
            <p>O cartão mostra o seu nome, o título{source ? ", a fonte" : ""} e o desempenho, com um convite para ler no LêMais. O texto completo nunca é publicado.</p>
            <label className="flex items-start gap-3">
              <input type="checkbox" className="mt-1 size-5 accent-[var(--ink)]" checked={withScore} onChange={(e) => setWithScore(e.target.checked)} disabled={!attempt} />
              <span>
                Mostrar resultado do questionário
                {!attempt && <span className="block text-sm text-muted">Não houve questionário nesta leitura.</span>}
              </span>
            </label>
            <label className="flex items-start gap-3">
              <input type="checkbox" className="mt-1 size-5 accent-[var(--ink)]" checked={withExcerpt} onChange={(e) => setWithExcerpt(e.target.checked)} disabled={!content} />
              <span>
                Incluir um trecho curto do início do texto
                <span className="block text-sm text-muted">Até 200 caracteres, com a fonte. Use só se puder citar o texto.</span>
              </span>
            </label>
            <p className="text-sm text-muted">Cria uma página pública que qualquer pessoa com o link pode ver.</p>
            <button type="button" className="btn btn-primary" disabled={busy || !content} onClick={() => void create()}>
              {busy ? "Criando…" : "Criar cartão"}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/cartao/${created.id}?formato=feed`} alt={`Cartão: ${session.contentTitle}`} className="w-full rounded-xl border border-line" />
            <div className="grid gap-2 sm:grid-cols-2">
              <a className="btn btn-primary" href={`https://wa.me/?text=${encodeURIComponent(inviteText)}`} target="_blank" rel="noopener noreferrer">
                WhatsApp
              </a>
              <button type="button" className="btn btn-primary" onClick={() => void shareStory()}>
                Instagram
              </button>
              <a className="btn btn-primary" href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(created.url)}`} target="_blank" rel="noopener noreferrer">
                Facebook
              </a>
              <button type="button" className="btn" onClick={() => void copy()}>
                Copiar convite
              </button>
            </div>
            {msg && (
              <p role="status" className="text-sm">
                {msg}
              </p>
            )}
            <p className="text-sm text-muted break-all">
              Link:{" "}
              <a href={created.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                {created.url}
              </a>
            </p>
          </div>
        )}
        {msg && !created && (
          <p role="alert" className="mt-3 text-danger">
            {msg}
          </p>
        )}
      </Sheet>
    </>
  );
}
