/**
 * Limpeza de texto vindo de PDF, Word e reconhecimento de fotos (OCR):
 * junta linhas quebradas em parágrafos, une palavras cortadas pelo hífen e remove números de página.
 */

const LIGATURES: Record<string, string> = { ﬁ: "fi", ﬂ: "fl", ﬀ: "ff", ﬃ: "ffi", ﬄ: "ffl", "­": "" };

const PAGE_NUMBER = /^[\s\-–—]*\d{1,4}[\s\-–—]*$/;
const PAGE_LABEL = /^(p[áa]gina|p[áa]g\.?)\s*\d+(\s*(de|\/)\s*\d+)?$/i;
const SENTENCE_END = /[.!?…:;"”')\]»]$/;

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}

export function normalizeChars(text: string): string {
  return text
    .replace(/[ﬁﬂﬀﬃﬄ­]/g, (c) => LIGATURES[c] ?? c)
    .replace(/\r\n?/g, "\n")
    .replace(/[\t ]+/g, " ")
    .replace(/ {2,}/g, " ");
}

function joinLines(lines: string[]): string {
  let out = "";
  for (const line of lines) {
    if (!out) {
      out = line;
      continue;
    }
    // palavra cortada no fim da linha ("compreen-" + "são")
    if (/[\p{L}]-$/u.test(out) && /^\p{Ll}/u.test(line)) out = out.slice(0, -1) + line;
    else out += " " + line;
  }
  return out;
}

/** Reorganiza linhas em parágrafos. Linhas em branco continuam separando parágrafos. */
export function reflowText(raw: string): string {
  const lines = normalizeChars(raw)
    .split("\n")
    .map((l) => l.trim());
  const body = lines.filter((l) => l && !PAGE_NUMBER.test(l) && !PAGE_LABEL.test(l));
  const maxLen = percentile(
    body.map((l) => l.length).filter((n) => n > 20),
    0.9,
  );

  const paragraphs: string[][] = [];
  let current: string[] = [];
  const close = () => {
    if (current.length) paragraphs.push(current);
    current = [];
  };

  const clean = lines.filter((l) => !PAGE_NUMBER.test(l) && !PAGE_LABEL.test(l));
  for (let i = 0; i < clean.length; i++) {
    const line = clean[i];
    if (!line) {
      close();
      continue;
    }
    current.push(line);
    if (maxLen >= 40) {
      const next = clean[i + 1];
      const short = line.length < maxLen * 0.65;
      // última linha curta de um parágrafo
      if (short && SENTENCE_END.test(line)) close();
      // título curto sem pontuação seguido de texto em maiúscula
      else if (line.length < maxLen * 0.5 && !SENTENCE_END.test(line) && !/-$/.test(line) && next && /^\p{Lu}/u.test(next)) close();
    }
  }
  close();
  return paragraphs.map(joinLines).join("\n\n");
}

/** Une o texto de páginas consecutivas; frases que continuam na página seguinte voltam a ser um parágrafo só. */
export function joinPages(parts: string[]): string {
  const pages = parts.map((p) => p.trim()).filter(Boolean);
  let out = "";
  for (const p of pages) {
    if (!out) {
      out = p;
      continue;
    }
    const lastPara = out.split("\n\n").pop() ?? "";
    if (!SENTENCE_END.test(lastPara) && /^\p{Ll}/u.test(p)) {
      out = /[\p{L}]-$/u.test(out) ? out.slice(0, -1) + p : out + " " + p;
    } else out += "\n\n" + p;
  }
  return out;
}

/** Divide um texto longo em "páginas" de aproximadamente `wordsPerPage` palavras, sem cortar parágrafos. */
export function splitIntoPages(text: string, wordsPerPage = 500): string[] {
  const paras = text.split(/\n{2,}/).filter((p) => p.trim());
  const pages: string[] = [];
  let cur: string[] = [];
  let words = 0;
  for (const p of paras) {
    const n = p.split(/\s+/).length;
    if (cur.length && words + n > wordsPerPage) {
      pages.push(cur.join("\n\n"));
      cur = [];
      words = 0;
    }
    cur.push(p);
    words += n;
  }
  if (cur.length) pages.push(cur.join("\n\n"));
  return pages;
}
