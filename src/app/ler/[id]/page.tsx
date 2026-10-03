"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { repo } from "@/lib/persistence";
import { tokenize } from "@/lib/text";
import { chunkDurationMs } from "@/lib/reader/chunks";
import { clampWpm, ReaderEngine, type EngineSnapshot } from "@/lib/reader/engine";
import { applySnapshot, MODE_LABEL } from "@/lib/session";
import { ENGINE, WPM } from "@/lib/config";
import { useAppState } from "@/components/AppState";
import { ChunkSizeSelector, ModeSelector, Toggle, WpmControl, formatEstimate } from "@/components/Controls";
import { ChunkView, FullTextView, RsvpView } from "@/components/ReaderViews";
import { Sheet } from "@/components/Sheet";
import { formatDuration } from "@/lib/metrics";
import type { Content, ReadingSession, ReadingSettings } from "@/lib/types";

type SaveState = "idle" | "ok" | "error";

export default function ReaderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { settings: globalSettings, updateSettings, ready } = useAppState();
  const [content, setContent] = useState<Content | null | undefined>(undefined);
  const [session, setSession] = useState<ReadingSession | null>(null);
  const [snap, setSnap] = useState<EngineSnapshot | null>(null);
  const [panel, setPanel] = useState<null | "ajustes" | "texto" | "sair">(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const engineRef = useRef<ReaderEngine | null>(null);
  const sessionRef = useRef<ReadingSession | null>(null);
  const finishingRef = useRef(false);

  // ---------- carregamento ----------
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = await repo().getSession(id);
        if (!s) return alive && setContent(null);
        if (s.status !== "preparado" && s.status !== "lendo" && s.status !== "pausado") {
          router.replace(`/sessao/${s.id}`);
          return;
        }
        const c = await repo().getContent(s.contentId);
        if (!alive) return;
        if (!c || c.contentHash !== s.contentHash) return setContent(null);
        sessionRef.current = s;
        setSession(s);
        setContent(c);
      } catch {
        if (alive) setContent(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, router]);

  const tokens = useMemo(() => (content ? tokenize(content.textBlocks) : []), [content]);
  const view: Pick<ReadingSettings, "fontSize" | "lineSpacing" | "referenceLetterHighlight"> = globalSettings;

  // ---------- persistência ----------
  const checkpoint = useCallback(
    async (patch?: Partial<ReadingSession>) => {
      const e = engineRef.current;
      const s = sessionRef.current;
      if (!e || !s) return false;
      const snapNow = e.snapshot();
      const next: ReadingSession = {
        ...applySnapshot(s, snapNow, e.encodePresented(), {
          ...globalSettings,
          mode: snapNow.settings.mode,
          targetWpm: snapNow.settings.wpm,
          chunkSize: snapNow.settings.chunkSize,
          smartPauses: snapNow.settings.smartPauses,
        }),
        ...patch,
      };
      sessionRef.current = next;
      try {
        await repo().putSession(next);
        setSaveState("ok");
        return true;
      } catch {
        setSaveState("error");
        return false;
      }
    },
    [globalSettings],
  );

  const finishSession = useCallback(
    async (kind: "concluida" | "parcial") => {
      if (finishingRef.current) return;
      finishingRef.current = true;
      const e = engineRef.current;
      if (e && e.snapshot().state !== "concluida") e.finish();
      const ok = await checkpoint({
        status: kind,
        finishedAt: new Date().toISOString(),
        finalWpm: e?.snapshot().settings.wpm ?? null,
      });
      if (ok) router.push(`/sessao/${id}`);
      else finishingRef.current = false;
    },
    [checkpoint, id, router],
  );

  // ---------- motor ----------
  useEffect(() => {
    if (!content || !session || !ready || engineRef.current) return;
    const s = session;
    const restoring = s.activeDurationMs > 0 || s.currentTokenIndex > 0;
    const engine = new ReaderEngine(
      tokens,
      { mode: s.mode, wpm: s.currentWpm, chunkSize: s.settingsSnapshot.chunkSize, smartPauses: s.settingsSnapshot.smartPauses },
      restoring
        ? {
            tokenIndex: s.currentTokenIndex,
            activeDurationMs: s.activeDurationMs,
            pausedDurationMs: s.pausedDurationMs,
            presentedWordCount: s.presentedWordCount,
            presentedBitset: s.presentedBitset,
          }
        : undefined,
    );
    engineRef.current = engine;
    setSnap(engine.snapshot());
    const unsub = engine.subscribe(setSnap);
    const unev = engine.onEvent((ev) => {
      if (ev === "finish") {
        if (engine.reachedEnd) void finishSession("concluida");
      } else if (ev === "state" || ev === "settings") void checkpoint();
    });
    return () => {
      unsub();
      unev();
    };
    // o motor é criado uma única vez por sessão
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, session, ready]);

  useEffect(() => () => engineRef.current?.destroy(), []);

  // checkpoint periódico durante a leitura
  const reading = snap?.state === "lendo";
  useEffect(() => {
    if (!reading) return;
    const t = setInterval(() => void checkpoint(), ENGINE.checkpointIntervalMs);
    return () => clearInterval(t);
  }, [reading, checkpoint]);

  // aba oculta: pausa motor e cronômetro, salva
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        engineRef.current?.pause("oculta");
        void checkpoint();
      }
    };
    const onHide = () => void checkpoint();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onHide);
    };
  }, [checkpoint]);

  // ---------- atalhos ----------
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement | null;
      if (t && (t.closest("input,textarea,select,[contenteditable=true],dialog") || t.isContentEditable)) return;
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const e = engineRef.current;
      if (!e) return;
      const s = e.snapshot();
      switch (ev.key) {
        case " ":
          if (t?.tagName === "BUTTON") return; // deixa o botão focado agir
          ev.preventDefault();
          e.toggle();
          break;
        case "ArrowLeft":
          ev.preventDefault();
          e.prev();
          break;
        case "ArrowRight":
          ev.preventDefault();
          e.next();
          break;
        case "ArrowUp":
          if (s.settings.mode === "free") return;
          ev.preventDefault();
          e.setWpm(clampWpm(s.settings.wpm + WPM.step));
          break;
        case "ArrowDown":
          if (s.settings.mode === "free") return;
          ev.preventDefault();
          e.setWpm(clampWpm(s.settings.wpm - WPM.step));
          break;
        case "Escape":
          e.pause("manual");
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---------- derivados ----------
  const remainingMs = useMemo(() => {
    const e = engineRef.current;
    if (!e || !snap || snap.settings.mode === "free") return null;
    const chunks = e.getChunks();
    let total = 0;
    for (let i = snap.chunkIndex; i < chunks.length; i++) total += chunkDurationMs(tokens, chunks[i], snap.settings.wpm, snap.settings.smartPauses);
    return total;
    // recalcula quando a posição ou as configurações mudam
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap?.chunkIndex, snap?.settings.wpm, snap?.settings.smartPauses, snap?.settings.mode, snap?.settings.chunkSize, tokens]);

  if (content === undefined || (content && !snap)) return <p className="pt-12 text-muted">Carregando leitura…</p>;
  if (content === null || !session)
    return (
      <div className="pt-12">
        <h1 className="font-serif text-3xl font-bold">Sessão não encontrada</h1>
        <p className="mt-2">A sessão ou o texto foram excluídos ou alterados.</p>
        <Link href="/" className="btn btn-primary mt-4">
          Voltar ao início
        </Link>
      </div>
    );

  const e = engineRef.current!;
  const s = snap!;
  const mode = s.settings.mode;
  const isFree = mode === "free";
  const chunkText = s.chunk ? tokens.slice(s.chunk.start, s.chunk.end).map((t) => t.text).join(" ") : "";
  const textSize = Math.max(16, Math.round(view.fontSize * 0.5));
  const progressPct = Math.round(s.progress * 100);
  const notStarted = s.state === "preparado";

  return (
    <div className="flex min-h-dvh flex-col">
      {/* barra superior: mínima durante a leitura */}
      <header className="sticky top-0 z-10 -mx-4 border-b border-line bg-paper/95 px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 backdrop-blur">
        <div className={`flex items-center gap-2 ${reading ? "opacity-40" : ""}`}>
          <p className="min-w-0 flex-1 truncate font-serif font-bold" title={content.title}>
            {content.title}
          </p>
          {!reading && (
            <>
              <button type="button" className="btn btn-quiet px-2 text-sm" onClick={() => setPanel("texto")} aria-label="Ver texto completo">
                Texto
              </button>
              <button type="button" className="btn btn-quiet px-2 text-sm" onClick={() => setPanel("ajustes")}>
                Ajustes
              </button>
              <button type="button" className="btn px-3 text-sm" onClick={() => setPanel("sair")}>
                Sair
              </button>
            </>
          )}
        </div>
        <div
          className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-line"
          role="progressbar"
          aria-label="Posição no texto"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progressPct}
        >
          <div className="h-full bg-ink" style={{ width: `${progressPct}%` }} />
        </div>
        <p className="mt-1 flex flex-wrap justify-between gap-x-3 text-xs text-muted tabular-nums">
          <span>
            {MODE_LABEL[mode]}, {progressPct}%
          </span>
          <span>
            {isFree ? `Tempo ativo ${formatDuration(s.activeDurationMs)}` : remainingMs !== null ? `Faltam ${formatEstimate(remainingMs)} (estimativa)` : ""}
          </span>
        </p>
      </header>

      {saveState === "error" && (
        <p role="alert" className="mt-2 border-l-4 border-danger pl-3 text-sm">
          Não foi possível salvar o progresso neste navegador. Se você sair, a leitura não poderá ser retomada.
        </p>
      )}
      {s.state === "pausado" && s.pauseReason === "oculta" && (
        <p role="status" className="mt-3 text-sm text-muted">
          Pausado porque a aba ficou oculta. Nenhuma palavra foi avançada.
        </p>
      )}

      {/* área de leitura */}
      <section aria-label="Leitura" className="flex flex-1 flex-col">
        {mode === "rsvp" || mode === "chunk" ? (
          <div className="relative flex min-h-[45dvh] flex-1 items-center justify-center py-8">
            <span aria-hidden className="absolute top-1/2 left-1/2 h-[60%] w-px -translate-x-1/2 -translate-y-1/2 bg-line" style={{ opacity: mode === "rsvp" && !view.referenceLetterHighlight ? 0.6 : 0 }} />
            {notStarted ? (
              <p className="reading-text max-w-sm text-center text-xl text-muted">Pressione Começar quando estiver pronto. Nada avança sem o seu comando.</p>
            ) : mode === "rsvp" ? (
              <RsvpView token={s.chunk ? tokens[s.chunk.start] : null} fontSize={view.fontSize} highlight={view.referenceLetterHighlight} />
            ) : (
              <ChunkView text={chunkText} fontSize={view.fontSize} />
            )}
            {/* anúncio discreto apenas no estado pausado (nunca palavra a palavra) */}
            <p className="sr-only" aria-live="polite">
              {s.state === "pausado" ? `Pausado em: ${chunkText}` : ""}
            </p>
          </div>
        ) : (
          <div className="flex-1 py-6">
            {isFree && (
              <p className="mb-4 text-sm text-muted">
                Leia no seu ritmo. Use Começar e Pausar para marcar o tempo e “Terminei a leitura” ao final. A velocidade será uma estimativa
                baseada nesse tempo.
              </p>
            )}
            {mode === "guided" && !reading && (
              <p className="mb-4 text-sm text-muted">Toque em uma palavra para retomar dali. O destaque marca o ritmo, não comprova a leitura.</p>
            )}
            <FullTextView
              blocks={content.textBlocks}
              tokens={tokens}
              active={mode === "guided" && s.chunk && !notStarted ? { start: s.chunk.start, end: s.chunk.end } : null}
              onSeek={mode === "guided" ? (i) => e.seek(i) : undefined}
              fontSize={textSize}
              lineSpacing={view.lineSpacing}
            />
          </div>
        )}
      </section>

      {/* controles essenciais */}
      <div className="sticky bottom-0 z-10 -mx-4 border-t border-line bg-paper/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        {isFree ? (
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button type="button" className="btn btn-primary h-14 min-w-36 text-lg" onClick={() => e.toggle()}>
              {reading ? "Pausar" : notStarted ? "Começar" : "Continuar"}
            </button>
            <button type="button" className="btn h-14" onClick={() => void finishSession("concluida")} disabled={notStarted}>
              Terminei a leitura
            </button>
          </div>
        ) : (
          <div className="mx-auto flex max-w-xl items-center justify-between gap-2">
            <button type="button" className="btn px-3 text-sm" onClick={() => e.prev()} aria-label="Voltar uma frase">
              <span aria-hidden>‹</span> Frase
            </button>
            <button type="button" className="btn btn-primary h-14 min-w-32 text-lg" onClick={() => e.toggle()} aria-keyshortcuts="Space">
              {reading ? "Pausar" : notStarted ? "Começar" : "Continuar"}
            </button>
            <button type="button" className="btn px-3 text-sm" onClick={() => e.next()} aria-label="Avançar uma frase">
              Frase <span aria-hidden>›</span>
            </button>
          </div>
        )}
        {!isFree && (
          <div className="mx-auto mt-2 flex max-w-xl items-center justify-center gap-2 text-sm">
            <button type="button" className="btn size-11 px-0" aria-label="Diminuir ritmo" onClick={() => e.setWpm(s.settings.wpm - WPM.step)} disabled={s.settings.wpm <= WPM.min}>
              −
            </button>
            <span className="min-w-24 text-center font-semibold tabular-nums">{s.settings.wpm} PPM</span>
            <button type="button" className="btn size-11 px-0" aria-label="Aumentar ritmo" onClick={() => e.setWpm(s.settings.wpm + WPM.step)} disabled={s.settings.wpm >= WPM.max}>
              +
            </button>
          </div>
        )}
        <p className="mt-1 hidden text-center text-xs text-muted sm:block">
          Espaço: começar/pausar · ← →: frase anterior/próxima{!isFree && " · ↑ ↓: ritmo"} · Esc: pausar
        </p>
      </div>

      {/* painéis */}
      <Sheet open={panel === "ajustes"} onClose={() => setPanel(null)} title="Ajustes da leitura">
        <div className="space-y-6">
          {!isFree && <WpmControl value={s.settings.wpm} onChange={(v) => e.setWpm(v)} compact />}
          <div>
            <ModeSelector
              value={mode}
              disabled={reading}
              onChange={(m) => {
                if (m === "rsvp" && mode === "chunk") e.setMode("rsvp");
                else e.setMode(m);
              }}
            />
            <p className="mt-1 text-sm text-muted">A troca de modo mantém a posição no texto. Só é possível com a leitura pausada.</p>
          </div>
          {(mode === "chunk" || mode === "guided") && (
            <ChunkSizeSelector value={s.settings.chunkSize} onChange={(c) => e.setMode(mode, c)} disabled={reading} />
          )}
          {!isFree && (
            <Toggle
              checked={s.settings.smartPauses}
              onChange={(v) => e.setSmartPauses(v)}
              label="Pausas inteligentes"
              hint="Pausas extras em vírgulas, frases, parágrafos e palavras longas. O ritmo observado pode ficar abaixo do configurado."
            />
          )}
          {mode === "rsvp" && (
            <Toggle
              checked={view.referenceLetterHighlight}
              onChange={(v) => void updateSettings({ referenceLetterHighlight: v })}
              label="Destacar letra de referência"
              hint="Preferência visual: marca uma letra perto do início de cada palavra. Não há promessa de benefício."
            />
          )}
          <div>
            <label htmlFor="fonte" className="mb-1 block font-medium">
              Tamanho do texto: {view.fontSize}px
            </label>
            <input id="fonte" type="range" min={24} max={72} step={2} value={view.fontSize} onChange={(ev) => void updateSettings({ fontSize: Number(ev.target.value) })} className="w-full" />
          </div>
          <div>
            <label htmlFor="entrelinha" className="mb-1 block font-medium">
              Espaçamento entre linhas: {view.lineSpacing.toFixed(1)}
            </label>
            <input id="entrelinha" type="range" min={1.2} max={2.4} step={0.1} value={view.lineSpacing} onChange={(ev) => void updateSettings({ lineSpacing: Number(ev.target.value) })} className="w-full" />
          </div>
          <fieldset>
            <legend className="mb-1 font-medium">Tema</legend>
            <div className="flex gap-2">
              {(["sistema", "claro", "escuro"] as const).map((t) => (
                <label key={t} className="inline-flex min-h-11 cursor-pointer items-center rounded-full border-[1.5px] border-line px-4 capitalize has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-paper">
                  <input type="radio" name="tema" className="sr-only" checked={globalSettings.theme === t} onChange={() => void updateSettings({ theme: t })} />
                  {t}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </Sheet>

      <Sheet open={panel === "texto"} onClose={() => setPanel(null)} title="Texto completo">
        <p className="mb-4 text-sm text-muted">Texto estático, compatível com leitores de tela. Toque em uma palavra para retomar a leitura a partir dela.</p>
        <FullTextView
          blocks={content.textBlocks}
          tokens={tokens}
          onSeek={(i) => {
            e.seek(i);
            setPanel(null);
          }}
          fontSize={18}
          lineSpacing={view.lineSpacing}
        />
      </Sheet>

      <Sheet open={panel === "sair"} onClose={() => setPanel(null)} title="Sair da leitura">
        <div className="space-y-5">
          <div>
            <button
              type="button"
              className="btn btn-primary w-full"
              onClick={async () => {
                e.pause("manual");
                const ok = await checkpoint();
                if (ok) router.push("/");
                else setPanel(null);
              }}
            >
              Sair salvando
            </button>
            <p className="mt-1 text-sm text-muted">A leitura fica pausada e pode ser retomada em “Continuar leitura”.</p>
          </div>
          <div>
            <button type="button" className="btn w-full" onClick={() => void finishSession(isFree ? "concluida" : "parcial")}>
              {isFree ? "Terminei a leitura" : "Encerrar leitura agora"}
            </button>
            <p className="mt-1 text-sm text-muted">
              {isFree ? "Registra o tempo e segue para o resultado." : "Registra uma sessão parcial com o que foi apresentado até aqui."}
            </p>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
