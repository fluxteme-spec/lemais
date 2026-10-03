/**
 * Módulo único de processamento de texto.
 * A MESMA regra de tokenização é usada na preparação, no leitor, nas métricas
 * e na localização de evidências dos questionários.
 *
 * Regra de palavra: sequência separada por espaço em branco que contenha ao menos
 * uma letra ou dígito. Palavras com hífen ("bem-estar") e números ("1.000,50")
 * contam como uma palavra. Pontuação isolada ("—", "...") é anexada à palavra anterior
 * para exibição, mas não conta como palavra.
 */
import { TEXT_LIMITS } from "@/lib/config";
import type { TextBlock } from "@/lib/types";

export interface Token {
  /** Posição estável (0..n-1) no conteúdo. */
  index: number;
  /** Texto exibido (inclui pontuação colada). */
  text: string;
  blockIndex: number;
  isHeading: boolean;
  /** Final de frase (. ! ? …). */
  sentenceEnd: boolean;
  /** Pausa curta (, ; : —). */
  clauseEnd: boolean;
  /** Último token do bloco (parágrafo ou intertítulo). */
  blockEnd: boolean;
  /** Número de letras/dígitos (para palavras longas). */
  letters: number;
}

const WORDLIKE = /[\p{L}\p{N}]/u;
const SENTENCE_END = /[.!?…]+["'”’»)\]]*$/u;
const CLAUSE_END = /([,;:]|[—–])["'”’»)\]]*$/u;

function normalizeNewlines(raw: string): string {
  return raw.replace(/\r\n?/g, "\n").replace(/ /g, " ").normalize("NFC");
}

function looksLikeHeading(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 90) return false;
  if (/^#{1,6}\s+\S/.test(t)) return true;
  const words = t.split(/\s+/).length;
  if (words > 12) return false;
  if (/[.,;:!?…]["'”’)]*$/u.test(t)) return false; // termina como frase → parágrafo
  return /^[\p{Lu}\p{N}"“'«]/u.test(t);
}

/**
 * Converte texto simples em blocos, preservando parágrafos e identificando
 * intertítulos quando há sinais claros. Não resume nem reescreve.
 */
export function parsePlainText(raw: string): TextBlock[] {
  const text = normalizeNewlines(raw).trim();
  if (!text) return [];
  const hasBlankLines = /\n[ \t]*\n/.test(text);
  const pieces = hasBlankLines
    ? text.split(/\n[ \t]*\n+/).map((p) => p.replace(/[ \t]*\n[ \t]*/g, " "))
    : text.split(/\n/);
  const cleaned = pieces.map((p) => p.replace(/[ \t]+/g, " ").trim()).filter(Boolean);

  return cleaned.map((p, i) => {
    const next = cleaned[i + 1];
    const md = /^#{1,6}\s+/.test(p);
    const heading = md || (looksLikeHeading(p) && next !== undefined && !looksLikeHeading(next));
    return { type: heading ? "heading" : "paragraph", text: md ? p.replace(/^#{1,6}\s+/, "") : p };
  });
}

/** Tokeniza blocos. Determinístico: mesmos blocos → mesmos índices. */
export function tokenize(blocks: TextBlock[]): Token[] {
  const tokens: Token[] = [];
  blocks.forEach((block, blockIndex) => {
    const parts = block.text.split(/\s+/).filter(Boolean);
    const startLen = tokens.length;
    for (const part of parts) {
      if (!WORDLIKE.test(part)) {
        // pontuação isolada: cola na palavra anterior do mesmo bloco
        const prev = tokens.length > startLen ? tokens[tokens.length - 1] : null;
        if (prev) {
          prev.text += ` ${part}`;
          prev.sentenceEnd = prev.sentenceEnd || SENTENCE_END.test(part);
          prev.clauseEnd = prev.clauseEnd || CLAUSE_END.test(part);
        }
        continue;
      }
      tokens.push({
        index: tokens.length,
        text: part,
        blockIndex,
        isHeading: block.type === "heading",
        sentenceEnd: SENTENCE_END.test(part),
        clauseEnd: CLAUSE_END.test(part),
        blockEnd: false,
        letters: (part.match(/[\p{L}\p{N}]/gu) ?? []).length,
      });
    }
    if (tokens.length > startLen) tokens[tokens.length - 1].blockEnd = true;
  });
  return tokens;
}

export function countWords(blocks: TextBlock[]): number {
  return tokenize(blocks).length;
}

export function blocksToPlainText(blocks: TextBlock[]): string {
  return blocks.map((b) => (b.type === "heading" ? `## ${b.text}` : b.text)).join("\n\n");
}

export type TextValidation =
  | { ok: true; wordCount: number }
  | { ok: false; reason: "empty" | "too_many_words" | "too_many_chars"; wordCount: number; message: string };

/** Valida contra os limites. Nunca trunca silenciosamente. */
export function validateText(blocks: TextBlock[], rawLength?: number): TextValidation {
  const chars = rawLength ?? blocks.reduce((n, b) => n + b.text.length, 0);
  const wordCount = countWords(blocks);
  if (wordCount === 0) {
    return { ok: false, reason: "empty", wordCount, message: "O texto está vazio. Cole ou digite algum conteúdo." };
  }
  if (chars > TEXT_LIMITS.maxChars) {
    return {
      ok: false,
      reason: "too_many_chars",
      wordCount,
      message: `O texto tem ${chars.toLocaleString("pt-BR")} caracteres. O limite é ${TEXT_LIMITS.maxChars.toLocaleString("pt-BR")}. Remova parte do conteúdo para continuar.`,
    };
  }
  if (wordCount > TEXT_LIMITS.maxWords) {
    return {
      ok: false,
      reason: "too_many_words",
      wordCount,
      message: `O texto tem ${wordCount.toLocaleString("pt-BR")} palavras. O limite é ${TEXT_LIMITS.maxWords.toLocaleString("pt-BR")}. Remova parte do conteúdo para continuar.`,
    };
  }
  return { ok: true, wordCount };
}

/** Hash determinístico (cyrb53) do conteúdo — identifica a versão exata. */
export function hashBlocks(blocks: TextBlock[]): string {
  const str = blocks.map((b) => `${b.type}:${b.text}`).join("␞");
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

/** Normalização usada para comparar trechos (evidências). */
export function normalizeForMatch(s: string): string {
  return s
    .normalize("NFC")
    .toLowerCase()
    .replace(/[“”«»"]/g, '"')
    .replace(/[‘’`]/g, "'")
    .replace(/[—–]/g, "-")
    .replace(/[^\p{L}\p{N}\s'"-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Localiza um trecho no conteúdo e devolve o índice do primeiro token,
 * ou null se o trecho não existir literalmente (após normalização leve).
 */
export function locateEvidence(tokens: Token[], evidence: string): number | null {
  const needle = normalizeForMatch(evidence);
  if (needle.split(" ").length < 3) return null; // trechos curtos demais não comprovam nada
  const starts: number[] = [];
  let hay = "";
  for (const t of tokens) {
    const n = normalizeForMatch(t.text);
    starts.push(hay.length);
    hay += n + " ";
  }
  const pos = (" " + hay).indexOf(" " + needle);
  if (pos < 0) return null;
  // busca binária do token que começa em `pos`
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= pos) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Início da frase que contém o token i. */
export function sentenceStart(tokens: Token[], i: number): number {
  let j = Math.max(0, Math.min(i, tokens.length - 1));
  while (j > 0 && !tokens[j - 1].sentenceEnd && !tokens[j - 1].blockEnd) j--;
  return j;
}
