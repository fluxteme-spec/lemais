/**
 * Transcrição pela IA conectada do usuário. O áudio sai do aparelho direto para o
 * provedor (a chave fica só no navegador), em partes de 5 minutos.
 *  - OpenAI: Whisper (whisper-1), com horários por frase.
 *  - Gemini (chave Google ou via OpenRouter): ouve o áudio e separa quem fala.
 *  - Anthropic não aceita áudio: use a transcrição no aparelho.
 */
import { parseJsonObject } from "@/lib/comprehension/prompt";
import { ProviderError } from "@/lib/comprehension/provider";
import { listModels, type AIConnection } from "@/lib/ai/providers";
import type { Segmento } from "./store";

const SR = 16000;
export const PARTE_SEGUNDOS = 300;

export function aceitaAudio(conn: AIConnection | null): boolean {
  return !!conn && conn.provider !== "anthropic";
}

/** PCM float 16 kHz mono → WAV 16 bits. */
export function paraWav(amostras: Float32Array, taxa = SR): Uint8Array {
  const buf = new ArrayBuffer(44 + amostras.length * 2);
  const v = new DataView(buf);
  const escreve = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  escreve(0, "RIFF");
  v.setUint32(4, 36 + amostras.length * 2, true);
  escreve(8, "WAVE");
  escreve(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, taxa, true);
  v.setUint32(28, taxa * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  escreve(36, "data");
  v.setUint32(40, amostras.length * 2, true);
  for (let i = 0; i < amostras.length; i++) {
    const s = Math.max(-1, Math.min(1, amostras[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buf);
}

function base64(bytes: Uint8Array): string {
  let s = "";
  const passo = 0x8000;
  for (let i = 0; i < bytes.length; i += passo) s += String.fromCharCode(...bytes.subarray(i, i + passo));
  return btoa(s);
}

const PEDIDO = (idioma: string) =>
  `Transcreva este áudio palavra por palavra${idioma && idioma !== "auto" ? ` (idioma: ${idioma})` : ""}. Identifique quem fala como "Pessoa 1", "Pessoa 2"… (ou pelo nome, se a própria pessoa disser). Não resuma, não corrija o conteúdo, não traduza. Responda só com JSON: {"segmentos":[{"inicio":segundos desde o começo deste áudio,"falante":"Pessoa 1","texto":"..."}]}. Se não houver fala, responda {"segmentos":[]}.`;

export function interpretarSegmentos(bruto: string, deslocamento: number, duracaoParte: number): Segmento[] {
  let json: { segmentos?: { inicio?: unknown; falante?: unknown; texto?: unknown }[] };
  try {
    json = parseJsonObject(bruto) as typeof json;
  } catch {
    throw new ProviderError("invalid_output", "A IA devolveu a transcrição fora do formato esperado.");
  }
  const lista = Array.isArray(json.segmentos) ? json.segmentos : [];
  const segs = lista
    .map((s) => {
      const ini = Math.min(duracaoParte, Math.max(0, Number(s.inicio) || 0));
      return { inicio: deslocamento + ini, fim: deslocamento + ini, texto: typeof s.texto === "string" ? s.texto.trim() : "", falante: typeof s.falante === "string" ? s.falante.trim().slice(0, 40) || undefined : undefined };
    })
    .filter((s) => s.texto);
  for (let i = 0; i < segs.length; i++) segs[i].fim = i + 1 < segs.length ? segs[i + 1].inicio : deslocamento + duracaoParte;
  return segs;
}

async function erroDoProvedor(res: Response): Promise<never> {
  if (res.status === 401 || res.status === 403) throw new ProviderError("upstream", "A chave foi recusada pelo provedor.");
  if (res.status === 402) throw new ProviderError("upstream", "O provedor informou falta de créditos na sua conta.");
  if (res.status === 429) throw new ProviderError("upstream", "O provedor limitou o uso no momento. Tente de novo em instantes.");
  const corpo = await res.text().catch(() => "");
  throw new ProviderError("upstream", `O provedor respondeu com erro ${res.status}${/model/i.test(corpo) ? " (modelo sem suporte a áudio)" : ""}.`);
}

async function parteOpenAI(conn: AIConnection, wav: Uint8Array, idioma: string, desl: number, dur: number, f: typeof fetch): Promise<Segmento[]> {
  const form = new FormData();
  form.append("file", new Blob([wav as BlobPart], { type: "audio/wav" }), "parte.wav");
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");
  const iso: Record<string, string> = { portuguese: "pt", english: "en", italian: "it", spanish: "es" };
  if (iso[idioma]) form.append("language", iso[idioma]);
  const res = await f("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${conn.apiKey}` }, body: form, signal: AbortSignal.timeout(180_000) });
  if (!res.ok) await erroDoProvedor(res);
  const json = (await res.json()) as { segments?: { start: number; end: number; text: string }[]; text?: string };
  const segs = (json.segments ?? []).map((s) => ({ inicio: desl + s.start, fim: desl + s.end, texto: s.text.trim() })).filter((s) => s.texto);
  return segs.length || !json.text?.trim() ? segs : [{ inicio: desl, fim: desl + dur, texto: json.text.trim() }];
}

async function parteGemini(conn: AIConnection, wav: Uint8Array, idioma: string, desl: number, dur: number, f: typeof fetch): Promise<Segmento[]> {
  const res = await f(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(conn.model)}:generateContent`, {
    method: "POST",
    signal: AbortSignal.timeout(180_000),
    headers: { "content-type": "application/json", "x-goog-api-key": conn.apiKey },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ inline_data: { mime_type: "audio/wav", data: base64(wav) } }, { text: PEDIDO(idioma) }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0 },
    }),
  });
  if (!res.ok) await erroDoProvedor(res);
  const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
  const bruto = (json.candidates?.[0]?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("");
  return interpretarSegmentos(bruto, desl, dur);
}

let modeloAudioOpenRouter: string | null = null;
async function modeloOpenRouter(conn: AIConnection, f: typeof fetch): Promise<string> {
  if (/gemini/i.test(conn.model)) return conn.model;
  if (modeloAudioOpenRouter) return modeloAudioOpenRouter;
  const modelos = await listModels("openrouter", conn.apiKey, f);
  const flash = modelos.filter((m) => /^google\/gemini-[\d.]+-flash(?!.*(lite|image|thinking|exp|preview))/.test(m.id) && !/:free$/.test(m.id));
  const escolhido = flash.sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }))[0]?.id;
  if (!escolhido) throw new ProviderError("upstream", "Não encontrei um modelo com áudio na sua conta OpenRouter.");
  return (modeloAudioOpenRouter = escolhido);
}

async function parteOpenRouter(conn: AIConnection, wav: Uint8Array, idioma: string, desl: number, dur: number, f: typeof fetch): Promise<Segmento[]> {
  const model = await modeloOpenRouter(conn, f);
  const res = await f("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(180_000),
    headers: { "content-type": "application/json", Authorization: `Bearer ${conn.apiKey}`, "HTTP-Referer": location.origin, "X-Title": "LêMais" },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: [{ type: "input_audio", input_audio: { data: base64(wav), format: "wav" } }, { type: "text", text: PEDIDO(idioma) }] }],
    }),
  });
  if (!res.ok) await erroDoProvedor(res);
  const json = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
  return interpretarSegmentos(json.choices?.[0]?.message?.content ?? "", desl, dur);
}

/** Transcreve o áudio (já em 16 kHz mono) com a IA conectada, parte por parte. */
export async function transcreverComIA(
  conn: AIConnection,
  audio: Float32Array,
  idioma: string,
  aoAvancar: (fracao: number, segmentos: Segmento[]) => void,
  f: typeof fetch = fetch,
): Promise<Segmento[]> {
  if (!aceitaAudio(conn)) throw new ProviderError("upstream", "A Anthropic (Claude) não transcreve áudio. Use a transcrição no aparelho.");
  const parte = conn.provider === "openai" ? parteOpenAI : conn.provider === "gemini" ? parteGemini : parteOpenRouter;
  const tamanho = PARTE_SEGUNDOS * SR;
  const todos: Segmento[] = [];
  for (let ini = 0; ini < audio.length; ini += tamanho) {
    const trecho = audio.subarray(ini, Math.min(audio.length, ini + tamanho));
    if (trecho.length < SR / 2) break;
    todos.push(...(await parte(conn, paraWav(trecho), idioma, ini / SR, trecho.length / SR, f)));
    aoAvancar(Math.min(1, (ini + trecho.length) / audio.length), [...todos]);
  }
  return todos;
}
