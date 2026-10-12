/**
 * Lado da tela da transcrição no aparelho: decodifica o áudio para 16 kHz mono
 * e conversa com o worker (um só, reaproveitado entre gravações).
 */
import type { Segmento } from "./store";

export type PedidoDeTranscricao = { audio: Float32Array; modelo: string; idioma: string };
export type MensagemDoWorker =
  | { tipo: "download"; arquivo: string; carregado: number; total: number }
  | { tipo: "pronto"; dispositivo: "webgpu" | "wasm" }
  | { tipo: "progresso"; fracao: number; segmentos: Segmento[] }
  | { tipo: "fim"; segmentos: Segmento[] }
  | { tipo: "erro"; mensagem: string };

export const MODELOS_WHISPER = [
  { id: "onnx-community/whisper-small", nome: "Preciso (Whisper small, ~550 MB)" },
  { id: "onnx-community/whisper-base", nome: "Rápido (Whisper base, ~210 MB)" },
] as const;

export const IDIOMAS = [
  { id: "portuguese", nome: "Português" },
  { id: "english", nome: "Inglês" },
  { id: "italian", nome: "Italiano" },
  { id: "spanish", nome: "Espanhol" },
  { id: "auto", nome: "Detectar sozinho" },
] as const;

export async function audioPara16k(blob: Blob): Promise<Float32Array> {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  try {
    const dec = await ctx.decodeAudioData(await blob.arrayBuffer());
    const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(dec.duration * 16000)), 16000);
    const src = off.createBufferSource();
    src.buffer = dec;
    src.connect(off.destination);
    src.start();
    return (await off.startRendering()).getChannelData(0);
  } finally {
    void ctx.close();
  }
}

let worker: Worker | null = null;
let ocupado = false;

export function transcrevendoAgora() {
  return ocupado;
}

/** Transcreve; `aoMudar` recebe cada mensagem (download, progresso…). Resolve com os segmentos. */
export async function transcreverNoAparelho(
  blob: Blob,
  opcoes: { modelo: string; idioma: string },
  aoMudar: (m: MensagemDoWorker) => void,
): Promise<Segmento[]> {
  if (ocupado) throw new Error("Já tem uma transcrição em andamento.");
  ocupado = true;
  try {
    const audio = await audioPara16k(blob);
    worker ??= new Worker(new URL("./transcrever.worker.ts", import.meta.url), { type: "module" });
    return await new Promise<Segmento[]>((ok, erro) => {
      worker!.onmessage = ({ data }: MessageEvent<MensagemDoWorker>) => {
        aoMudar(data);
        if (data.tipo === "fim") ok(data.segmentos);
        if (data.tipo === "erro") erro(new Error(data.mensagem));
      };
      worker!.onerror = (e) => erro(new Error(e.message || "O motor de transcrição falhou."));
      const pedido: PedidoDeTranscricao = { audio, ...opcoes };
      worker!.postMessage(pedido, [audio.buffer]);
    });
  } finally {
    ocupado = false;
  }
}
