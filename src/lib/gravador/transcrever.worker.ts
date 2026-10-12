/// <reference lib="webworker" />
/**
 * Transcrição no próprio aparelho com Whisper (transformers.js).
 * Usa a GPU via WebGPU quando disponível; senão, a CPU (WASM).
 * O modelo é baixado uma vez e fica no cache do navegador.
 */
import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";
import type { MensagemDoWorker, PedidoDeTranscricao } from "./transcrever";
import type { Segmento } from "./store";

env.allowLocalModels = false;
env.useBrowserCache = true;
if (env.backends.onnx.wasm) env.backends.onnx.wasm.wasmPaths = "/ort/";

const SR = 16000;
const JANELA = 28 * SR; // o Whisper lê 30 s por vez
const BUSCA_CORTE = 4 * SR; // procura um silêncio nos últimos 4 s para não cortar palavras

// a assinatura genérica de pipeline() é complexa demais para o TypeScript; aqui só usamos ASR
const criarAsr = pipeline as unknown as (
  tarefa: "automatic-speech-recognition",
  modelo: string,
  opcoes: Record<string, unknown>,
) => Promise<AutomaticSpeechRecognitionPipeline>;

const enviar = (m: MensagemDoWorker) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

let asr: AutomaticSpeechRecognitionPipeline | null = null;
let carregado = "";

async function temWebGPU(): Promise<boolean> {
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    return !!(gpu && (await gpu.requestAdapter()));
  } catch {
    return false;
  }
}

async function carregar(modelo: string) {
  if (asr && carregado === modelo) return;
  const dispositivo = (await temWebGPU()) ? "webgpu" : "wasm";
  asr = await criarAsr("automatic-speech-recognition", modelo, {
    device: dispositivo,
    dtype: dispositivo === "webgpu" ? { encoder_model: "fp32", decoder_model_merged: "q4" } : "q8",
    progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (p.status === "progress" && p.total) enviar({ tipo: "download", arquivo: p.file ?? "", carregado: p.loaded ?? 0, total: p.total });
    },
  });
  carregado = modelo;
  enviar({ tipo: "pronto", dispositivo });
}

export function pontoDeCorte(audio: Float32Array, inicio: number): number {
  const fim = Math.min(inicio + JANELA, audio.length);
  if (fim === audio.length) return fim;
  const passo = SR / 20; // blocos de 50 ms
  let melhor = fim;
  let menor = Infinity;
  for (let p = fim - BUSCA_CORTE; p + passo <= fim; p += passo) {
    let e = 0;
    for (let i = p; i < p + passo; i++) e += audio[i] * audio[i];
    if (e < menor) {
      menor = e;
      melhor = p + passo / 2;
    }
  }
  return Math.round(melhor);
}

function silencioso(trecho: Float32Array): boolean {
  let e = 0;
  for (let i = 0; i < trecho.length; i++) e += trecho[i] * trecho[i];
  return Math.sqrt(e / trecho.length) < 0.002;
}

self.onmessage = async ({ data }: MessageEvent<PedidoDeTranscricao>) => {
  const { audio, modelo, idioma } = data;
  try {
    await carregar(modelo);
    const segmentos: Segmento[] = [];
    let inicio = 0;
    while (inicio < audio.length) {
      const fim = pontoDeCorte(audio, inicio);
      const trecho = audio.subarray(inicio, fim);
      if (trecho.length > SR / 2 && !silencioso(trecho)) {
        const out = (await asr!(trecho, {
          language: idioma === "auto" ? undefined : idioma,
          task: "transcribe",
          no_repeat_ngram_size: 4,
        } as Record<string, unknown>)) as { text?: string };
        const texto = (out.text ?? "").trim();
        if (texto) segmentos.push({ inicio: inicio / SR, fim: fim / SR, texto });
      }
      inicio = fim;
      enviar({ tipo: "progresso", fracao: inicio / audio.length, segmentos: [...segmentos] });
    }
    enviar({ tipo: "fim", segmentos });
  } catch (e) {
    enviar({ tipo: "erro", mensagem: String((e as Error)?.message ?? e) });
  }
};
