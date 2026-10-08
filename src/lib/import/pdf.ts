/** Leitura de PDF no navegador, em janelas de poucas páginas (o arquivo nunca sai do aparelho). */
import { reflowText, joinPages } from "./cleanup";

type PdfJs = typeof import("pdfjs-dist");
type PdfDoc = Awaited<ReturnType<PdfJs["getDocument"]>["promise"]>;

let lib: Promise<PdfJs> | null = null;
function load(): Promise<PdfJs> {
  lib ??= import("pdfjs-dist").then((m) => {
    m.GlobalWorkerOptions.workerSrc = "/pdf/pdf.worker.min.mjs";
    return m;
  });
  return lib;
}

export interface OpenPdf {
  doc: PdfDoc;
  pageCount: number;
}

export async function openPdf(file: File): Promise<OpenPdf> {
  const pdfjs = await load();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  return { doc, pageCount: doc.numPages };
}

/** Reconstrói as linhas de uma página a partir dos fragmentos de texto. */
async function pageText(doc: PdfDoc, n: number): Promise<string> {
  const page = await doc.getPage(n);
  const tc = await page.getTextContent();
  let out = "";
  let lastY: number | null = null;
  for (const it of tc.items) {
    if (!("str" in it)) continue;
    const y = it.transform[5];
    if (lastY !== null && Math.abs(y - lastY) > 2) out += "\n";
    else if (out && !out.endsWith(" ") && !out.endsWith("\n") && it.str && !it.str.startsWith(" ")) out += " ";
    out += it.str;
    if (it.hasEOL) out += "\n";
    lastY = y;
  }
  page.cleanup();
  return out;
}

/** Texto das páginas [from, to] (1-based). `scanned` indica páginas sem texto (PDF de imagem). */
export async function readPdfPages(doc: PdfDoc, from: number, to: number): Promise<{ text: string; scanned: boolean }> {
  const parts: string[] = [];
  for (let n = from; n <= Math.min(to, doc.numPages); n++) parts.push(reflowText(await pageText(doc, n)));
  const text = joinPages(parts);
  return { text, scanned: text.replace(/\s/g, "").length < 20 * (to - from + 1) };
}

/** Desenha uma página em canvas (para OCR de PDFs que são só imagem). */
export async function renderPdfPage(doc: PdfDoc, n: number, scale = 2): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(n);
  const vp = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(vp.width);
  canvas.height = Math.floor(vp.height);
  await page.render({ canvas, viewport: vp }).promise;
  page.cleanup();
  return canvas;
}
