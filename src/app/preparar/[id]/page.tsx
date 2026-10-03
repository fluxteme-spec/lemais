"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { repo } from "@/lib/persistence";
import { blocksToPlainText, parsePlainText, tokenize, validateText } from "@/lib/text";
import { estimateDurationMs } from "@/lib/reader/chunks";
import { DIFFICULTY_LABEL, editContent, newSession } from "@/lib/session";
import { quizAvailability, type QuizAvailability } from "@/lib/client/actions";
import { useAppState } from "@/components/AppState";
import { ChunkSizeSelector, ModeSelector, Toggle, WpmControl, formatEstimate } from "@/components/Controls";
import { TEXT_LIMITS } from "@/lib/config";
import type { Content, ReadingSettings } from "@/lib/types";

export default function PreparePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { settings: saved, ready, updateSettings, reportStorageError } = useAppState();
  const [content, setContent] = useState<Content | null | undefined>(undefined);
  const [title, setTitle] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [settings, setSettings] = useState<ReadingSettings>(saved);
  const [quiz, setQuiz] = useState<QuizAvailability | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!ready) return;
    const freeFromUrl = new URLSearchParams(window.location.search).get("modo") === "free";
    setSettings(freeFromUrl ? { ...saved, mode: "free" } : saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useEffect(() => {
    repo()
      .getContent(id)
      .then((c) => {
        setContent(c);
        if (c) setTitle(c.title);
      })
      .catch((e) => {
        reportStorageError(e);
        setContent(null);
      });
  }, [id, reportStorageError]);

  useEffect(() => {
    if (content) quizAvailability(content).then(setQuiz);
  }, [content]);

  const tokens = useMemo(() => (content ? tokenize(content.textBlocks) : []), [content]);
  const estimate = useMemo(
    () => estimateDurationMs(tokens, settings.mode, settings.chunkSize, settings.targetWpm, settings.smartPauses),
    [tokens, settings],
  );

  if (content === undefined) return <p className="pt-12 text-muted">Carregando…</p>;
  if (content === null)
    return (
      <div className="pt-12">
        <h1 className="font-serif text-3xl font-bold">Conteúdo não encontrado</h1>
        <p className="mt-2">Ele pode ter sido excluído ou os dados deste navegador foram apagados.</p>
        <Link href="/" className="btn btn-primary mt-4">
          Escolher outro conteúdo
        </Link>
      </div>
    );

  const set = (patch: Partial<ReadingSettings>) => setSettings((s) => ({ ...s, ...patch }));

  function saveEdit() {
    if (!content) return;
    const blocks = parsePlainText(draft);
    const v = validateText(blocks, draft.length);
    if (!v.ok) {
      setEditError(v.message);
      return;
    }
    const next = editContent(content, title, blocks);
    repo()
      .putContent(next)
      .then(() => {
        setContent(next);
        setEditing(false);
        setEditError(null);
      })
      .catch((e) => {
        reportStorageError(e);
        setEditError("Não foi possível salvar a edição.");
      });
  }

  async function start() {
    if (!content) return;
    setStarting(true);
    try {
      const finalContent = title.trim() && title.trim() !== content.title ? { ...content, title: title.trim() } : content;
      if (finalContent !== content) await repo().putContent(finalContent);
      await updateSettings({
        mode: settings.mode,
        targetWpm: settings.targetWpm,
        chunkSize: settings.chunkSize,
        smartPauses: settings.smartPauses,
      });
      const s = newSession(finalContent, settings);
      await repo().putSession(s);
      router.push(`/ler/${s.id}`);
    } catch (e) {
      reportStorageError(e);
      setStarting(false);
    }
  }

  const published = content.publishedAt ? new Date(content.publishedAt) : null;

  return (
    <div className="pt-6 sm:pt-10">
      <p className="text-sm text-muted">Preparação</p>
      <label htmlFor="titulo" className="sr-only">
        Título
      </label>
      <input
        id="titulo"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={300}
        className="w-full rounded-lg border-[1.5px] border-transparent bg-transparent py-1 font-serif text-3xl font-bold leading-tight hover:border-line focus:border-focus sm:text-4xl"
      />
      {content.subtitle && <p className="mt-1 font-serif text-lg text-muted">{content.subtitle}</p>}

      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        {content.siteName && (
          <>
            <dt className="text-muted">Fonte</dt>
            <dd>{content.siteName}</dd>
          </>
        )}
        {content.author && (
          <>
            <dt className="text-muted">Autoria</dt>
            <dd>{content.author}</dd>
          </>
        )}
        {published && (
          <>
            <dt className="text-muted">Publicação</dt>
            <dd>{Number.isNaN(published.getTime()) ? content.publishedAt : published.toLocaleDateString("pt-BR", { dateStyle: "long" })}</dd>
          </>
        )}
        {content.finalUrl && (
          <>
            <dt className="text-muted">Link</dt>
            <dd className="break-all">
              <a href={content.finalUrl} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-4">
                {content.finalUrl}
              </a>
            </dd>
          </>
        )}
        <dt className="text-muted">Palavras</dt>
        <dd className="tabular-nums">{content.wordCount.toLocaleString("pt-BR")}</dd>
        {content.sourceType === "training" && (
          <>
            <dt className="text-muted">Nível</dt>
            <dd>{DIFFICULTY_LABEL[content.difficulty]}</dd>
          </>
        )}
      </dl>

      {content.warnings.length > 0 && (
        <div role="status" className="mt-4 border-l-4 border-marker pl-3">
          {content.warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
          <p className="text-sm text-muted">Revise a prévia abaixo e edite o texto se faltar algo.</p>
        </div>
      )}

      <section aria-labelledby="previa" className="mt-6">
        <div className="flex items-center justify-between">
          <h2 id="previa" className="font-semibold">
            Prévia do texto
          </h2>
          {!editing && (
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => {
                setDraft(blocksToPlainText(content.textBlocks));
                setEditing(true);
              }}
            >
              Editar texto
            </button>
          )}
        </div>
        {editing ? (
          <div className="mt-2 space-y-3">
            <label htmlFor="edicao" className="sr-only">
              Texto completo
            </label>
            <textarea id="edicao" className="field reading-text min-h-80 text-base leading-relaxed" value={draft} onChange={(e) => setDraft(e.target.value)} />
            <p className="text-sm text-muted">Linhas iniciadas com ## viram intertítulos. Alterar o texto invalida questionários feitos antes.</p>
            {editError && (
              <p role="alert" className="text-danger">
                {editError}
              </p>
            )}
            <div className="flex gap-2">
              <button type="button" className="btn btn-primary" onClick={saveEdit}>
                Salvar texto
              </button>
              <button type="button" className="btn" onClick={() => setEditing(false)}>
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div tabIndex={0} aria-label="Prévia do texto" className="reading-text mt-2 max-h-72 overflow-y-auto rounded-xl border-[1.5px] border-line bg-surface p-4 text-[1.05rem] leading-relaxed">
            {content.textBlocks.map((b, i) =>
              b.type === "heading" ? (
                <h3 key={i} className="mt-3 font-bold first:mt-0">
                  {b.text}
                </h3>
              ) : (
                <p key={i} className="mt-3 first:mt-0">
                  {b.text}
                </p>
              ),
            )}
          </div>
        )}
      </section>

      <section aria-label="Configuração da leitura" className="mt-8 space-y-6">
        <ModeSelector value={settings.mode} onChange={(mode) => set({ mode })} />
        {(settings.mode === "chunk" || settings.mode === "guided") && (
          <ChunkSizeSelector value={settings.chunkSize} onChange={(chunkSize) => set({ chunkSize })} />
        )}
        {settings.mode !== "free" ? (
          <>
            <WpmControl value={settings.targetWpm} onChange={(targetWpm) => set({ targetWpm })} />
            <Toggle
              checked={settings.smartPauses}
              onChange={(smartPauses) => set({ smartPauses })}
              label="Pausas inteligentes"
              hint="Pausa um pouco mais em vírgulas, fins de frase, parágrafos e palavras longas. Por isso o ritmo observado pode ficar abaixo do configurado."
            />
          </>
        ) : (
          <p className="text-muted">No texto livre não há avanço automático. O ritmo será estimado a partir do tempo entre início e fim.</p>
        )}
      </section>

      <section aria-label="Resumo" className="mt-8 border-t border-line pt-6">
        <p>
          <span className="text-muted">Tempo estimado: </span>
          <strong>{formatEstimate(estimate)}</strong>
          <span className="text-sm text-muted">
            {" "}
            (estimativa{settings.mode === "free" ? ` a ${settings.targetWpm} PPM` : settings.smartPauses ? ", inclui pausas inteligentes" : ""})
          </span>
        </p>
        <p className="mt-1 text-sm text-muted">
          {quiz === null && "Verificando questionário…"}
          {quiz?.kind === "ready" && (quiz.set.source === "curated" ? "Ao final, você pode responder um questionário revisado." : "Ao final, você pode responder o questionário já gerado para este texto.")}
          {quiz?.kind === "can_generate" &&
            (quiz.via.kind === "user"
              ? `Ao final, você pode pedir um questionário criado pela sua conta em ${quiz.via.providerName}.`
              : "Ao final, você pode pedir um questionário gerado automaticamente.")}
          {quiz?.kind === "too_short" && `O texto tem menos de ${TEXT_LIMITS.minWordsForQuiz} palavras, curto demais para um questionário útil. A leitura funciona normalmente.`}
          {quiz?.kind === "unavailable" && (
            <>
              {quiz.reason}{" "}
              <Link href="/conectar-ia" className="underline underline-offset-4">
                Conectar minha IA
              </Link>
            </>
          )}
        </p>
        <button type="button" className="btn btn-primary mt-5 h-14 w-full text-lg sm:w-auto sm:px-10" onClick={start} disabled={starting || editing}>
          Começar leitura
        </button>
      </section>
    </div>
  );
}
