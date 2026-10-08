/** OCR local (Tesseract) — as imagens não saem do aparelho. Arquivos servidos em /ocr. */
import { reflowText } from "./cleanup";

type Worker = import("tesseract.js").Worker;
let worker: Promise<Worker> | null = null;

function getWorker(onProgress?: (p: number) => void): Promise<Worker> {
  worker ??= import("tesseract.js").then(({ createWorker }) =>
    createWorker("por", 1, {
      workerPath: "/ocr/worker.min.js",
      corePath: "/ocr",
      langPath: "/ocr",
      workerBlobURL: false,
      gzip: true,
      logger: (m: { status: string; progress: number }) => {
        if (m.status === "recognizing text") onProgress?.(m.progress);
      },
    }),
  );
  return worker;
}

/** Reduz fotos grandes de câmera (acelera e melhora o reconhecimento). */
async function toCanvas(src: File | HTMLCanvasElement): Promise<HTMLCanvasElement> {
  if (src instanceof HTMLCanvasElement) return src;
  const bmp = await createImageBitmap(src);
  const max = 2200;
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  const ctx = c.getContext("2d")!;
  ctx.filter = "grayscale(1) contrast(1.25)";
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c;
}

export async function recognize(src: File | HTMLCanvasElement, onProgress?: (p: number) => void): Promise<string> {
  const w = await getWorker(onProgress);
  const canvas = await toCanvas(src);
  const { data } = await w.recognize(canvas);
  return reflowText(data.text);
}

export async function stopOcr() {
  if (worker) {
    const w = await worker;
    worker = null;
    await w.terminate();
  }
}
