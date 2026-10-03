/**
 * Formação de blocos e cálculo de duração das apresentações.
 *
 * Heurística do bloco automático (documentada, sem pretensão de análise linguística):
 *  - acumula até ENGINE.autoChunkMax palavras;
 *  - fecha o bloco após vírgula/ponto e vírgula/dois-pontos/travessão, fim de frase ou fim de parágrafo;
 *  - fecha antes de uma palavra muito longa (≥ 12 letras) se o bloco já tiver 2+ palavras,
 *    para não sobrecarregar a apresentação.
 * Blocos de tamanho fixo (2, 3, 4) nunca atravessam fim de frase ou de parágrafo;
 * por isso alguns blocos ficam menores que o tamanho escolhido.
 */
import { ENGINE, SMART_PAUSES } from "@/lib/config";
import type { Token } from "@/lib/text";
import type { ChunkSize, ReadingMode } from "@/lib/types";

export interface Chunk {
  start: number; // índice do primeiro token (inclusivo)
  end: number; // exclusivo
}

export function chunkSizeForMode(mode: ReadingMode, chunkSize: ChunkSize): ChunkSize | 1 {
  if (mode === "rsvp") return 1;
  return chunkSize;
}

export function buildChunks(tokens: Token[], size: ChunkSize | 1): Chunk[] {
  const chunks: Chunk[] = [];
  let start = 0;
  const max = size === "auto" ? ENGINE.autoChunkMax : size;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const len = i - start + 1;
    if (size === "auto" && len > 2 && t.letters >= 12) {
      // fecha antes da palavra longa
      chunks.push({ start, end: i });
      start = i;
    }
    const curLen = i - start + 1;
    const hardBreak = t.sentenceEnd || t.blockEnd;
    const softBreak = size === "auto" && t.clauseEnd;
    if (curLen >= max || hardBreak || softBreak || i === tokens.length - 1) {
      chunks.push({ start, end: i + 1 });
      start = i + 1;
    }
  }
  return chunks;
}

/** Mapa token → índice do bloco que o contém. */
export function tokenToChunkMap(chunks: Chunk[], tokenCount: number): Int32Array {
  const map = new Int32Array(tokenCount);
  chunks.forEach((c, ci) => {
    for (let i = c.start; i < c.end; i++) map[i] = ci;
  });
  return map;
}

/**
 * Duração de um bloco:
 *   base = 60.000 × palavras ÷ PPM
 *   + acréscimo de limite textual (apenas o MAIOR entre vírgula, frase e parágrafo)
 *   + acréscimo por palavra longa
 * Acréscimos são medidos em "durações de uma palavra" e limitados por maxTotalExtra.
 */
export function chunkDurationMs(tokens: Token[], chunk: Chunk, wpm: number, smartPauses: boolean): number {
  const words = chunk.end - chunk.start;
  const wordMs = 60_000 / wpm;
  const base = wordMs * words;
  if (!smartPauses || words === 0) return base;
  const last = tokens[chunk.end - 1];
  let boundary = 0;
  if (last.blockEnd) boundary = SMART_PAUSES.paragraphEnd;
  else if (last.sentenceEnd) boundary = SMART_PAUSES.sentenceEnd;
  else if (last.clauseEnd) boundary = SMART_PAUSES.comma;
  let long = 0;
  for (let i = chunk.start; i < chunk.end; i++) {
    const over = tokens[i].letters - SMART_PAUSES.longWordChars + 1;
    if (over > 0) long += Math.min(SMART_PAUSES.longWordMax, over * SMART_PAUSES.longWordPerChar);
  }
  const extra = Math.min(SMART_PAUSES.maxTotalExtra, boundary + long);
  return base + extra * wordMs;
}

/** Tempo estimado (ms) para ler do token `from` até o fim no modo escolhido. */
export function estimateDurationMs(
  tokens: Token[],
  mode: ReadingMode,
  chunkSize: ChunkSize,
  wpm: number,
  smartPauses: boolean,
  from = 0,
): number {
  if (tokens.length === 0) return 0;
  if (mode === "free") return ((tokens.length - from) / wpm) * 60_000;
  const chunks = buildChunks(tokens, chunkSizeForMode(mode, chunkSize));
  let total = 0;
  for (const c of chunks) if (c.end > from) total += chunkDurationMs(tokens, c, wpm, smartPauses);
  return total;
}

/** Navegação: cada comando move UMA FRASE (intertítulos contam como frase). */
export function nextSentenceStart(tokens: Token[], i: number): number {
  let j = i;
  while (j < tokens.length - 1 && !tokens[j].sentenceEnd && !tokens[j].blockEnd) j++;
  return Math.min(j + 1, tokens.length - 1);
}

export function prevSentenceStart(tokens: Token[], i: number): number {
  const startOf = (k: number) => {
    let j = k;
    while (j > 0 && !tokens[j - 1].sentenceEnd && !tokens[j - 1].blockEnd) j--;
    return j;
  };
  const s = startOf(i);
  // se já estamos no começo (ou quase) da frase, volta para a anterior
  if (i - s <= 1 && s > 0) return startOf(s - 1);
  return s;
}
