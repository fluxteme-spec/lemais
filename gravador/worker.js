// Transcrição no próprio aparelho com Whisper (transformers.js).
// Usa a GPU do iPhone via WebGPU quando disponível; senão, CPU (WASM).
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6';

env.allowLocalModels = false;
env.useBrowserCache = true; // o modelo fica guardado e funciona offline depois

const SR = 16000;
const JANELA = 28 * SR; // Whisper lê 30 s por vez
const BUSCA_CORTE = 4 * SR; // procura um silêncio nos últimos 4 s para não cortar palavras

let asr = null;
let carregado = '';
let dispositivo = '';

async function temWebGPU() {
  try {
    return !!(navigator.gpu && (await navigator.gpu.requestAdapter()));
  } catch {
    return false;
  }
}

async function carregar(modelo) {
  if (asr && carregado === modelo) return;
  dispositivo = (await temWebGPU()) ? 'webgpu' : 'wasm';
  const dtype =
    dispositivo === 'webgpu' ? { encoder_model: 'fp32', decoder_model_merged: 'q4' } : 'q8';
  asr = await pipeline('automatic-speech-recognition', modelo, {
    device: dispositivo,
    dtype,
    progress_callback: (p) => {
      if (p.status === 'progress' && p.total) {
        postMessage({ tipo: 'download', arquivo: p.file, carregado: p.loaded, total: p.total });
      }
    },
  });
  carregado = modelo;
  postMessage({ tipo: 'pronto', dispositivo });
}

function pontoDeCorte(audio, inicio) {
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

function silencioso(trecho) {
  let e = 0;
  for (let i = 0; i < trecho.length; i++) e += trecho[i] * trecho[i];
  return Math.sqrt(e / trecho.length) < 0.002;
}

self.onmessage = async ({ data }) => {
  if (data.tipo !== 'transcrever') return;
  const { audio, modelo, idioma } = data;
  try {
    await carregar(modelo);
    const segmentos = [];
    let inicio = 0;
    while (inicio < audio.length) {
      const fim = pontoDeCorte(audio, inicio);
      const trecho = audio.subarray(inicio, fim);
      if (trecho.length > SR / 2 && !silencioso(trecho)) {
        const out = await asr(trecho, {
          language: idioma === 'auto' ? null : idioma,
          task: 'transcribe',
          no_repeat_ngram_size: 4,
        });
        const texto = (out.text || '').trim();
        if (texto) segmentos.push({ inicio: inicio / SR, fim: fim / SR, texto });
      }
      inicio = fim;
      postMessage({ tipo: 'progresso', fracao: inicio / audio.length, segmentos });
    }
    postMessage({ tipo: 'fim', segmentos, dispositivo });
  } catch (e) {
    postMessage({ tipo: 'erro', mensagem: String(e?.message || e) });
  }
};
