"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { repo } from "@/lib/persistence";
import { parsePlainText, validateText } from "@/lib/text";
import { makeContent, isRecoverable } from "@/lib/session";
import { extractFromUrl, openTrainingText } from "@/lib/client/actions";
import { TRAINING_TEXTS } from "@/lib/training";
import { DIFFICULTY_LABEL } from "@/lib/session";
import { useAppState } from "@/components/AppState";
import { useAccount, useOnSynced } from "@/components/Account";
import { AdSlot } from "@/components/AdSlot";
import { ImportPanel, type Imported } from "@/components/ImportPanel";
import type { ReadingSession } from "@/lib/types";

type Source = "texto" | "link" | "arquivo" | "foto" | "treino";

const SOURCES: { id: Source; label: string }[] = [
  { id: "texto", label: "Colar texto" },
  { id: "link", label: "Ler de um link" },
  { id: "arquivo", label: "Anexar arquivo" },
  { id: "foto", label: "Escanear com a câmera" },
  { id: "treino", label: "Escolher texto de treino" },
];

export default function HomePage() {
  const router = useRouter();
  const { reportStorageError } = useAppState();
  const [source, setSource] = useState<Source>("texto");
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resume, setResume] = useState<ReadingSession | null>(null);
  const [firstVisit, setFirstVisit] = useState(false);
  const [resume_file, setResumeFile] = useState<{ name: string; size: number; nextFrom: number } | null>(null);

  const acc = useAccount();
  const loadResume = () =>
    repo()
      .listSessions()
      .then((list) => setResume(list.find(isRecoverable) ?? null))
      .catch(() => {});
  useOnSynced(loadResume);
  useEffect(() => {
    void loadResume();
    const cont = new URLSearchParams(window.location.search).get("continuar");
    if (cont) {
      repo()
        .getContent(cont)
        .then((c) => {
          if (c?.filePart && c.filePart.to < c.filePart.total) {
            setResumeFile({ name: c.filePart.name, size: c.filePart.size, nextFrom: c.filePart.to + 1 });
            setSource("arquivo");
          }
        })
        .catch(() => {});
    }
    repo()
      .getFlag("onboarded")
      .then((v) => setFirstVisit(!v))
      .catch(() => {});
  }, []);

  async function save(contentPromise: Promise<string>) {
    setBusy(true);
    setError(null);
    try {
      const id = await contentPromise;
      router.push(`/preparar/${id}`);
    } catch (e) {
      reportStorageError(e);
      setError(e instanceof Error ? e.message : "Não foi possível salvar o conteúdo.");
      setBusy(false);
    }
  }

  function preparePasted(e: React.FormEvent) {
    e.preventDefault();
    const blocks = parsePlainText(text);
    const v = validateText(blocks, text.length);
    if (!v.ok) {
      setError(v.message);
      return;
    }
    const firstLine = blocks[0]?.text ?? "";
    const autoTitle = title.trim() || (firstLine.length <= 80 ? firstLine : firstLine.slice(0, 77).trimEnd() + "…");
    const c = makeContent({ sourceType: "pasted", title: autoTitle, blocks });
    save(
      repo()
        .putContent(c)
        .then(() => c.id),
    );
  }

  async function prepareLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await extractFromUrl(url);
    if (!r.ok) {
      setError(r.message);
      setBusy(false);
      return;
    }
    const d = r.data;
    const v = validateText(d.blocks);
    if (!v.ok) {
      setError(v.message);
      setBusy(false);
      return;
    }
    const c = makeContent({
      sourceType: "url",
      title: d.title ?? "Artigo sem título",
      blocks: d.blocks,
      subtitle: d.subtitle,
      author: d.author,
      publishedAt: d.publishedAt,
      siteName: d.siteName,
      originalUrl: d.originalUrl,
      finalUrl: d.finalUrl,
      warnings: d.warnings,
    });
    save(
      repo()
        .putContent(c)
        .then(() => c.id),
    );
  }

  function prepareImported(r: Imported) {
    const blocks = parsePlainText(r.text);
    const v = validateText(blocks, r.text.length);
    if (!v.ok) {
      setError(v.message);
      return;
    }
    const c = makeContent({ sourceType: "pasted", title: r.title, blocks, warnings: r.warning ? [r.warning] : [], filePart: r.filePart });
    save(
      repo()
        .putContent(c)
        .then(() => c.id),
    );
  }

  function chooseTraining(id: string, mode?: "free") {
    save(openTrainingText(id).then((c) => c.id + (mode ? "?modo=free" : "")));
  }

  function dismissIntro() {
    setFirstVisit(false);
    repo()
      .setFlag("onboarded", true)
      .catch(() => {});
  }

  return (
    <div className="pt-6 sm:pt-12">
      {firstVisit && (
        <section aria-labelledby="intro-titulo" className="mb-10 border-l-4 border-marker pl-4">
          <h2 id="intro-titulo" className="font-serif text-xl font-bold">
            Ler mais rápido só importa se você continuar entendendo.
          </h2>
          <p className="mt-2 max-w-prose text-muted">
            Aqui você experimenta modos de leitura, ajusta o ritmo e, se quiser, responde algumas perguntas para ver como foi a compreensão. Não precisa de
            cadastro; com uma conta, suas leituras ficam salvas em todos os seus aparelhos.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => {
                dismissIntro();
                chooseTraining(TRAINING_TEXTS[0].id, "free");
              }}
            >
              Experimentar agora
            </button>
            <button type="button" className="btn btn-quiet" onClick={dismissIntro}>
              Pular
            </button>
          </div>
          <p className="mt-2 text-sm text-muted">
            “Experimentar agora” abre um texto curto no modo texto livre: você marca o início e o fim e pode responder 3 perguntas.
          </p>
        </section>
      )}

      <h1 className="font-serif text-4xl font-bold leading-tight sm:text-5xl">O que você quer ler?</h1>

      <fieldset className="mt-6">
        <legend className="sr-only">Origem do conteúdo</legend>
        <div className="flex flex-wrap gap-2">
          {SOURCES.map((s) => (
            <label
              key={s.id}
              className="inline-flex min-h-11 cursor-pointer items-center rounded-full border-[1.5px] border-line px-4 font-medium has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-paper has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-focus"
            >
              <input
                type="radio"
                name="origem"
                value={s.id}
                checked={source === s.id}
                onChange={() => {
                  setSource(s.id);
                  setError(null);
                }}
                className="sr-only"
              />
              {s.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-6">
        {source === "texto" && (
          <form onSubmit={preparePasted} className="space-y-4">
            <div>
              <label htmlFor="texto" className="mb-1 block font-medium">
                Texto
              </label>
              <textarea
                id="texto"
                className="field reading-text min-h-56 text-lg leading-relaxed"
                placeholder="Cole aqui o texto que você quer ler. Parágrafos e intertítulos são preservados."
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="titulo" className="mb-1 block font-medium">
                Título <span className="font-normal text-muted">(opcional)</span>
              </label>
              <input id="titulo" className="field" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
            </div>
            <button type="submit" className="btn btn-primary" disabled={busy || !text.trim()}>
              Preparar texto
            </button>
          </form>
        )}

        {source === "link" && (
          <form onSubmit={prepareLink} className="space-y-4">
            <div>
              <label htmlFor="url" className="mb-1 block font-medium">
                Endereço do artigo
              </label>
              <input
                id="url"
                type="url"
                inputMode="url"
                autoComplete="url"
                className="field"
                placeholder="https://"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                aria-describedby="url-ajuda"
              />
              <p id="url-ajuda" className="mt-1 text-sm text-muted">
                Funciona com artigos públicos. Páginas com login ou assinatura não são acessadas.
              </p>
            </div>
            <button type="submit" className="btn btn-primary" disabled={busy || !url.trim()}>
              {busy ? "Preparando…" : "Preparar link"}
            </button>
          </form>
        )}

        {(source === "arquivo" || source === "foto") && <ImportPanel key={source} mode={source} onReady={prepareImported} resume={resume_file} />}

        {source === "treino" && (
          <ul className="divide-y divide-line border-y border-line">
            {TRAINING_TEXTS.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => chooseTraining(t.id)}
                  className="flex min-h-16 w-full flex-col items-start gap-0.5 py-3 text-left"
                >
                  <span className="font-serif text-lg font-bold underline-offset-4 hover:underline">{t.title}</span>
                  <span className="text-sm text-muted">
                    {DIFFICULTY_LABEL[t.difficulty]} — {t.summary}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {error && (
          <div role="alert" className="mt-4 border-l-4 border-danger pl-3">
            <p className="font-medium text-danger">{error}</p>
            {source === "link" && (
              <p className="mt-1">
                Não conseguimos preparar este link. Você pode colar o texto para continuar.{" "}
                <button type="button" className="btn btn-quiet px-1" onClick={() => setSource("texto")}>
                  Colar texto
                </button>
              </p>
            )}
          </div>
        )}
      </div>

      <div className="mt-12 flex flex-col gap-1 text-base">
        {resume && (
          <Link
            href={resume.status === "lendo" || resume.status === "pausado" ? `/ler/${resume.id}` : `/sessao/${resume.id}`}
            className="inline-flex min-h-11 items-center gap-2 underline underline-offset-4"
          >
            {resume.status === "lendo" || resume.status === "pausado" ? "Continuar leitura" : "Concluir sessão"}:{" "}
            <span className="font-serif font-bold">{resume.contentTitle}</span>
            <span className="text-muted">({Math.round((resume.currentTokenIndex / Math.max(1, resume.totalWords)) * 100)}%)</span>
          </Link>
        )}
        <Link href="/progresso" className="inline-flex min-h-11 items-center text-muted underline underline-offset-4">
          Meu progresso
        </Link>
        {acc.enabled && !acc.loading && !acc.user && (
          <Link href="/entrar" className="inline-flex min-h-11 items-center text-muted underline underline-offset-4">
            Entrar para salvar em todos os aparelhos
          </Link>
        )}
      </div>
      <AdSlot placement="home" />
    </div>
  );
}
