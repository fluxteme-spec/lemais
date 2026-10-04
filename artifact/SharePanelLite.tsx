"use client";
/** Compartilhar na versão de teste: cartão desenhado no aparelho, WhatsApp, cópia e imagem para o Instagram. */
import { useEffect, useRef, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { deriveMetrics } from "@/lib/metrics";
import { ADAPT_LABEL } from "@/lib/session";
import type { Content, QuizAttempt, ReadingSession } from "@/lib/types";

type Downloads = { save: (r: { filename: string; data: Blob }) => Promise<{ status: string }> };

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

function css(name: string, fallback: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** Desenha o cartão no formato Stories (1080×1920). */
function drawCard(canvas: HTMLCanvasElement, d: { title: string; source: string | null; excerpt: string | null; stats: { v: string; l: string }[]; adaptation: string | null }) {
  const W = 1080, H = 1920;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const paper = "#eef1ec", ink = "#1c2b33", muted = "#56666c", marker = "#f3d75a", line = "#cfd8d2";
  const serif = css("--font-serif", "Georgia, serif");
  const sans = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, W, H);
  const pad = 96;
  ctx.fillStyle = ink;
  ctx.font = `700 76px ${serif}`;
  ctx.fillText("LêMais", pad, 200);
  ctx.fillStyle = marker;
  ctx.fillRect(pad, 222, ctx.measureText("LêMais").width, 14);
  ctx.fillStyle = muted;
  ctx.font = `36px ${sans}`;
  ctx.fillText("leitura, ritmo e compreensão", pad, 300);

  let y = 620;
  ctx.fillStyle = muted;
  ctx.font = `40px ${sans}`;
  ctx.fillText("Acabei de ler", pad, y);
  y += 90;
  ctx.fillStyle = ink;
  ctx.font = `700 ${d.title.length > 50 ? 72 : 88}px ${serif}`;
  for (const l of wrap(ctx, d.title, W - pad * 2).slice(0, 4)) {
    ctx.fillText(l, pad, y);
    y += d.title.length > 50 ? 86 : 104;
  }
  const meta = [d.source, d.adaptation].filter(Boolean).join(" · ");
  if (meta) {
    ctx.fillStyle = muted;
    ctx.font = `36px ${sans}`;
    ctx.fillText(meta.slice(0, 60), pad, y + 10);
    y += 70;
  }
  if (d.excerpt) {
    y += 40;
    ctx.font = `italic 42px ${serif}`;
    const lines = wrap(ctx, `“${d.excerpt}”`, W - pad * 2 - 50).slice(0, 6);
    ctx.fillStyle = marker;
    ctx.fillRect(pad, y - 44, 12, lines.length * 60 + 10);
    ctx.fillStyle = ink;
    for (const l of lines) {
      ctx.fillText(l, pad + 50, y);
      y += 60;
    }
  }

  const baseY = H - 470;
  ctx.fillStyle = line;
  ctx.fillRect(pad, baseY, W - pad * 2, 4);
  let x = pad;
  for (const s of d.stats) {
    ctx.fillStyle = ink;
    ctx.font = `700 78px ${sans}`;
    ctx.fillText(s.v, x, baseY + 120);
    ctx.fillStyle = muted;
    ctx.font = `34px ${sans}`;
    ctx.fillText(s.l, x, baseY + 172);
    ctx.font = `700 78px ${sans}`;
    x += Math.max(ctx.measureText(s.v).width, 220) + 70;
  }
  ctx.fillStyle = ink;
  const cta = "Venha ler comigo no LêMais";
  ctx.font = `700 46px ${sans}`;
  const cw = ctx.measureText(cta).width + 100;
  const cy = H - 220;
  ctx.beginPath();
  ctx.roundRect(pad, cy, cw, 110, 55);
  ctx.fill();
  ctx.fillStyle = paper;
  ctx.fillText(cta, pad + 50, cy + 70);
}

export function SharePanel({ session, content, attempt }: { session: ReadingSession; content: Content | null; attempt: QuizAttempt | null }) {
  const [open, setOpen] = useState(false);
  const [withExcerpt, setWithExcerpt] = useState(false);
  const [withScore, setWithScore] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [downloads, setDownloads] = useState<Downloads | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  const m = deriveMetrics({ ...session });
  const source = content?.siteName ?? content?.author ?? null;
  const excerpt = (() => {
    const p = content?.textBlocks.find((b) => b.type === "paragraph")?.text ?? "";
    return p.length <= 200 ? p : p.slice(0, 200).replace(/\s+\S*$/, "") + "…";
  })();
  const stats: { v: string; l: string }[] = [];
  if (m.observedWpm) stats.push({ v: `${m.observedWpm} PPM`, l: m.observedIsEstimate ? "ritmo estimado" : "ritmo" });
  const secs = Math.round(session.activeDurationMs / 1000);
  stats.push({ v: secs >= 60 ? `${Math.floor(secs / 60)} min` : `${secs} s`, l: "tempo" });
  if (withScore && attempt?.correctCount != null) stats.push({ v: `${attempt.correctCount} de ${attempt.questionCount}`, l: "compreensão" });

  const invite = `Li “${session.contentTitle}” no LêMais${m.observedWpm ? ` a ${m.observedWpm} PPM` : ""}${withScore && attempt?.correctCount != null ? `, ${attempt.correctCount} de ${attempt.questionCount} no teste` : ""}. Venha ler comigo!`;

  useEffect(() => {
    if (!open) return;
    const c = (window as unknown as { claude?: { use: (n: string) => Promise<unknown> } }).claude;
    c?.use("downloads").then((d) => setDownloads((d as Downloads) ?? null)).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (open && canvas.current)
      drawCard(canvas.current, {
        title: session.contentTitle,
        source,
        excerpt: withExcerpt ? excerpt : null,
        stats,
        adaptation: session.adaptation ? ADAPT_LABEL[session.adaptation] : null,
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, withExcerpt, withScore]);

  async function saveImage() {
    if (!canvas.current || !downloads) return;
    const blob = await new Promise<Blob | null>((r) => canvas.current!.toBlob(r, "image/png"));
    if (!blob) return;
    try {
      const r = await downloads.save({ filename: "lemais-stories.png", data: blob });
      setMsg(r.status === "saved" ? "Imagem salva. Publique nos Stories ou no Feed do Instagram." : "Imagem enviada.");
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code !== "cancelled" && code !== "declined") setMsg("Não foi possível salvar a imagem.");
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(invite);
      setMsg("Convite copiado.");
    } catch {
      setMsg(invite);
    }
  }

  return (
    <>
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        Compartilhar
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Compartilhar resultado">
        <div className="space-y-4">
          <label className="flex items-start gap-3">
            <input type="checkbox" className="mt-1 size-5 accent-[var(--ink)]" checked={withScore} onChange={(e) => setWithScore(e.target.checked)} disabled={!attempt} />
            <span>Mostrar resultado do questionário</span>
          </label>
          <label className="flex items-start gap-3">
            <input type="checkbox" className="mt-1 size-5 accent-[var(--ink)]" checked={withExcerpt} onChange={(e) => setWithExcerpt(e.target.checked)} />
            <span>
              Incluir um trecho curto do início do texto
              <span className="block text-sm text-muted">Até 200 caracteres. Use só se puder citar o texto.</span>
            </span>
          </label>
          <canvas ref={canvas} className="mx-auto block w-full max-w-[260px] rounded-xl border border-line" aria-label="Prévia do cartão para Stories" role="img" />
          <div className="grid gap-2 sm:grid-cols-2">
            <a className="btn btn-primary" href={`https://wa.me/?text=${encodeURIComponent(invite)}`} target="_blank" rel="noopener noreferrer">
              WhatsApp
            </a>
            {downloads ? (
              <button type="button" className="btn btn-primary" onClick={() => void saveImage()}>
                Salvar imagem para o Instagram
              </button>
            ) : (
              <p className="text-sm text-muted">Para salvar a imagem, use a versão publicada do app.</p>
            )}
            <button type="button" className="btn" onClick={() => void copy()}>
              Copiar convite
            </button>
          </div>
          {msg && (
            <p role="status" className="text-sm break-words">
              {msg}
            </p>
          )}
          <p className="text-sm text-muted">Na versão publicada, o cartão ganha um link com prévia para o Facebook e registra quem entrou pelo convite.</p>
        </div>
      </Sheet>
    </>
  );
}
