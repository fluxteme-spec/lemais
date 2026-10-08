"use client";

import { useRef, useState } from "react";
import type { FilePart } from "@/lib/types";
import { splitIntoPages } from "@/lib/import/cleanup";

export interface Imported {
  title: string;
  text: string;
  warning?: string;
  filePart?: FilePart;
}

const WINDOW = 3;
const MAX_PHOTOS = 3;

type Loaded =
  | { kind: "pdf"; file: File; total: number; doc: Awaited<ReturnType<typeof import("@/lib/import/pdf").openPdf>>["doc"] }
  | { kind: "text"; file: File; pages: string[]; total: number };

const baseName = (n: string) =>
  n
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .trim();

/** Anexar arquivo (PDF, Word, texto) lido em janelas de 3 páginas, ou escanear até 3 fotos. */
export function ImportPanel({
  mode,
  onReady,
  resume,
}: {
  mode: "arquivo" | "foto";
  onReady: (r: Imported) => void;
  resume?: { name: string; size: number; nextFrom: number } | null;
}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [from, setFrom] = useState(1);
  const [photos, setPhotos] = useState<File[]>([]);
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const input = useRef<HTMLInputElement>(null);

  async function pickFile(f: File | undefined) {
    if (!f) return;
    setError(null);
    setBusy(true);
    setStatus("Abrindo o arquivo…");
    try {
      const ext = f.name.toLowerCase().split(".").pop();
      if (f.size > 120 * 1024 * 1024) throw new Error("Arquivo muito grande (limite de 120 MB).");
      let l: Loaded;
      if (ext === "pdf" || f.type === "application/pdf") {
        const { openPdf } = await import("@/lib/import/pdf");
        const { doc, pageCount } = await openPdf(f);
        l = { kind: "pdf", file: f, total: pageCount, doc };
      } else if (ext === "docx") {
        const { readDocx } = await import("@/lib/import/docx");
        const pages = splitIntoPages(await readDocx(f));
        l = { kind: "text", file: f, pages, total: pages.length };
      } else if (ext === "txt" || ext === "md" || f.type.startsWith("text/")) {
        const { readPlain } = await import("@/lib/import/docx");
        const pages = splitIntoPages(await readPlain(f));
        l = { kind: "text", file: f, pages, total: pages.length };
      } else if (ext === "doc") {
        throw new Error("Arquivos .doc antigos não são lidos. Salve como .docx ou PDF e tente de novo.");
      } else {
        throw new Error("Formato não suportado. Use PDF, Word (.docx) ou texto (.txt).");
      }
      if (l.total === 0) throw new Error("Não encontramos texto neste arquivo.");
      const same = resume && resume.name === f.name && resume.size === f.size;
      setFrom(same ? Math.min(resume.nextFrom, l.total) : 1);
      setTitle(baseName(f.name));
      setLoaded(l);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível abrir o arquivo.");
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }

  async function readWindow() {
    if (!loaded) return;
    const to = Math.min(from + WINDOW - 1, loaded.total);
    setBusy(true);
    setError(null);
    try {
      let out = "";
      let warning: string | undefined;
      if (loaded.kind === "pdf") {
        setStatus(`Lendo as páginas ${from}–${to}…`);
        const { readPdfPages, renderPdfPage } = await import("@/lib/import/pdf");
        const r = await readPdfPages(loaded.doc, from, to);
        out = r.text;
        if (r.scanned) {
          const { recognize } = await import("@/lib/import/ocr");
          const parts: string[] = [];
          for (let n = from; n <= to; n++) {
            setStatus(`Página ${n} é imagem — reconhecendo texto… (pode demorar)`);
            parts.push(await recognize(await renderPdfPage(loaded.doc, n)));
          }
          out = parts.join("\n\n");
          warning = "Texto reconhecido de imagem (OCR): confira antes de ler.";
        }
      } else {
        out = loaded.pages.slice(from - 1, to).join("\n\n");
      }
      if (out.trim().length < 20) throw new Error("Estas páginas não têm texto legível. Tente outras páginas.");
      setText(out);
      setPartMeta({ name: loaded.file.name, size: loaded.file.size, from, to, total: loaded.total, warning });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível ler estas páginas.");
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }
  const [partMeta, setPartMeta] = useState<{ name: string; size: number; from: number; to: number; total: number; warning?: string } | null>(null);

  async function scan() {
    setBusy(true);
    setError(null);
    try {
      const { recognize } = await import("@/lib/import/ocr");
      const parts: string[] = [];
      for (let i = 0; i < photos.length; i++) {
        setStatus(`Reconhecendo a foto ${i + 1} de ${photos.length}…`);
        parts.push(await recognize(photos[i], (p) => setStatus(`Foto ${i + 1} de ${photos.length}: ${Math.round(p * 100)}%`)));
      }
      const { joinPages } = await import("@/lib/import/cleanup");
      const out = joinPages(parts);
      if (out.trim().length < 20) throw new Error("Não conseguimos reconhecer texto. Tente com mais luz, sem sombra e com a página reta.");
      setText(out);
      setPartMeta({ name: "", size: 0, from: 0, to: 0, total: 0, warning: "Texto reconhecido de foto (OCR): confira e corrija antes de ler." });
      setTitle("Texto escaneado");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível reconhecer o texto.");
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }

  function addPhotos(files: FileList | null) {
    if (!files) return;
    setPhotos((p) => [...p, ...Array.from(files).filter((f) => f.type.startsWith("image/"))].slice(0, MAX_PHOTOS));
  }

  function finish() {
    if (!partMeta) return;
    onReady({
      title: title.trim() || "Sem título",
      text,
      warning: partMeta.warning,
      filePart: partMeta.total ? { name: partMeta.name, size: partMeta.size, from: partMeta.from, to: partMeta.to, total: partMeta.total } : undefined,
    });
  }

  // revisão do texto reconhecido
  if (partMeta) {
    return (
      <div className="space-y-4">
        {partMeta.total > 0 && (
          <p className="text-sm text-muted">
            Páginas {partMeta.from}–{partMeta.to} de {partMeta.total}
          </p>
        )}
        {partMeta.warning && <p className="border-l-4 border-marker pl-3 text-sm">{partMeta.warning}</p>}
        <div>
          <label htmlFor="imp-texto" className="mb-1 block font-medium">
            Texto (você pode corrigir)
          </label>
          <textarea id="imp-texto" className="field reading-text min-h-56 text-lg leading-relaxed" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <div>
          <label htmlFor="imp-titulo" className="mb-1 block font-medium">
            Título
          </label>
          <input id="imp-titulo" className="field" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn btn-primary" onClick={finish} disabled={!text.trim()}>
            Preparar texto
          </button>
          <button type="button" className="btn btn-quiet" onClick={() => setPartMeta(null)}>
            Voltar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {mode === "arquivo" && !loaded && (
        <div>
          {resume && (
            <p className="mb-3 border-l-4 border-marker pl-3">
              Para continuar, selecione de novo o arquivo <strong>{resume.name}</strong>. Você seguirá da página {resume.nextFrom}.
            </p>
          )}
          <label htmlFor="imp-arquivo" className="mb-1 block font-medium">
            Arquivo (PDF, Word .docx ou .txt)
          </label>
          <input
            id="imp-arquivo"
            ref={input}
            type="file"
            accept=".pdf,.docx,.txt,.md,application/pdf,text/plain"
            className="field"
            disabled={busy}
            onChange={(e) => void pickFile(e.target.files?.[0])}
          />
          <p className="mt-1 text-sm text-muted">O arquivo é lido no seu aparelho, {WINDOW} páginas por vez, e não é enviado a ninguém.</p>
        </div>
      )}

      {mode === "arquivo" && loaded && (
        <div className="space-y-3">
          <p>
            <strong>{loaded.file.name}</strong> — {loaded.total} {loaded.kind === "pdf" ? "páginas" : "trechos de ~500 palavras"}
          </p>
          <div>
            <label htmlFor="imp-de" className="mb-1 block font-medium">
              Começar na página
            </label>
            <input
              id="imp-de"
              type="number"
              min={1}
              max={loaded.total}
              className="field w-32"
              value={from}
              onChange={(e) => setFrom(Math.max(1, Math.min(loaded.total, Number(e.target.value) || 1)))}
            />
            <p className="mt-1 text-sm text-muted">
              Vamos preparar as páginas {from}–{Math.min(from + WINDOW - 1, loaded.total)}.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void readWindow()}>
              {busy ? "Lendo…" : `Preparar páginas ${from}–${Math.min(from + WINDOW - 1, loaded.total)}`}
            </button>
            <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => setLoaded(null)}>
              Trocar arquivo
            </button>
          </div>
        </div>
      )}

      {mode === "foto" && (
        <div className="space-y-3">
          <p className="max-w-prose">Fotografe até {MAX_PHOTOS} páginas. Com boa luz, a página reta e o texto preenchendo a foto, o resultado é melhor.</p>
          <div className="flex flex-wrap gap-3">
            <label className="btn cursor-pointer">
              {photos.length ? "Adicionar outra foto" : "Tirar foto ou escolher imagem"}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                disabled={busy || photos.length >= MAX_PHOTOS}
                onChange={(e) => {
                  addPhotos(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          {photos.length > 0 && (
            <ul className="divide-y divide-line border-y border-line">
              {photos.map((p, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-2">
                  <span>
                    Foto {i + 1} <span className="text-sm text-muted">({Math.round(p.size / 1024)} KB)</span>
                  </span>
                  <button type="button" className="btn btn-quiet px-2" disabled={busy} onClick={() => setPhotos((x) => x.filter((_, j) => j !== i))}>
                    Remover
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="btn btn-primary" disabled={busy || !photos.length} onClick={() => void scan()}>
            {busy ? "Reconhecendo…" : "Reconhecer texto"}
          </button>
        </div>
      )}

      {status && (
        <p role="status" className="text-sm text-muted">
          {status}
        </p>
      )}
      {error && (
        <p role="alert" className="border-l-4 border-danger pl-3 font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
