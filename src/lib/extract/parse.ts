/**
 * Extração editorial com Readability sobre um DOM sem execução de scripts (linkedom).
 * Resultado: blocos de TEXTO (intertítulos e parágrafos) — nenhum HTML é repassado ao cliente.
 * Campos não encontrados ficam null; nada é inventado.
 */
import { parseHTML } from "linkedom";
import { Readability } from "@mozilla/readability";
import { EXTRACTION } from "@/lib/config";
import { countWords } from "@/lib/text";
import type { TextBlock } from "@/lib/types";
import { ExtractError } from "./fetch";

export interface ExtractedArticle {
  title: string | null;
  subtitle: string | null;
  author: string | null;
  publishedAt: string | null;
  siteName: string | null;
  blocks: TextBlock[];
  wordCount: number;
  warnings: string[];
  possiblyIncomplete: boolean;
  possiblyRestricted: boolean;
}

const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const nullable = (s: string | null | undefined) => clean(s) || null;

function meta(doc: Document, ...names: string[]): string | null {
  for (const n of names) {
    const el = doc.querySelector(`meta[property="${n}"], meta[name="${n}"], meta[itemprop="${n}"]`);
    const v = nullable(el?.getAttribute("content"));
    if (v) return v;
  }
  return null;
}

function restrictionHints(doc: Document, html: string): boolean {
  // Sinais explícitos publicados pelo próprio site — não deduzimos paywall só por falha.
  if (/"isAccessibleForFree"\s*:\s*(false|"false"|"False")/.test(html)) return true;
  if (meta(doc, "article:content_tier") === "locked") return true;
  return false;
}

const BLOCK_SELECTOR = "h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,dt,dd";

function htmlToBlocks(contentHtml: string): TextBlock[] {
  const { document } = parseHTML(`<!doctype html><html><body>${contentHtml}</body></html>`);
  document.querySelectorAll("script,style,noscript,iframe,object,embed,form,button,svg,figure figcaption").forEach((e) => e.remove());
  const nodes = Array.from(document.querySelectorAll(BLOCK_SELECTOR)) as Element[];
  const blocks: TextBlock[] = [];
  for (const el of nodes) {
    if (el.querySelector(BLOCK_SELECTOR)) continue; // usa só o elemento mais interno
    const text = clean(el.textContent);
    if (!text) continue;
    const isHeading = /^H[1-6]$/.test(el.tagName.toUpperCase());
    blocks.push({ type: isHeading ? "heading" : "paragraph", text });
  }
  // fallback: conteúdo sem marcação de parágrafo
  const allText = clean(document.body?.textContent);
  const collected = blocks.reduce((n, b) => n + b.text.length, 0);
  if (allText && collected < allText.length * 0.5) {
    const fallback = (document.body?.textContent ?? "")
      .split(/\n\s*\n+/)
      .map(clean)
      .filter(Boolean)
      .map((text) => ({ type: "paragraph" as const, text }));
    if (fallback.reduce((n, b) => n + b.text.length, 0) > collected) return fallback;
  }
  return blocks;
}

function normalizeDate(raw: string | null): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? raw : d.toISOString();
}

export function extractArticle(html: string, url?: string): ExtractedArticle {
  const { document } = parseHTML(html);
  const doc = document as unknown as Document;
  // nada de script é executado (linkedom não executa); removemos mesmo assim
  doc.querySelectorAll("script:not([type='application/ld+json']),style,noscript,iframe,template").forEach((e) => e.remove());

  const subtitle =
    nullable(doc.querySelector("[class*='subtitle'],[class*='standfirst'],[class*='dek'],[class*='lede'],[class*='linha-fina'],h2.sub")?.textContent) ?? null;
  const restricted = restrictionHints(doc, html);
  const metaPublished = meta(doc, "article:published_time", "datePublished", "pubdate", "date");

  let article: ReturnType<Readability<string>["parse"]> = null;
  try {
    if (url) {
      try {
        // ajuda o Readability a resolver links relativos (não fazemos requisições)
        Object.defineProperty(doc, "documentURI", { value: url, configurable: true });
      } catch {
        /* ignora */
      }
    }
    article = new Readability(doc, { charThreshold: 300, keepClasses: false }).parse();
  } catch {
    article = null;
  }

  if (!article?.content) {
    throw new ExtractError(restricted ? "possibly_restricted" : "no_content", restricted ? "A página indica conteúdo restrito a assinantes." : "Não identificamos um artigo nesta página.");
  }

  let blocks = htmlToBlocks(article.content);
  const title = nullable(article.title);
  if (title && blocks[0]?.type === "heading" && blocks[0].text.toLowerCase() === title.toLowerCase()) blocks = blocks.slice(1);
  if (subtitle && blocks[0]?.text === subtitle) blocks = blocks.slice(1);

  const wordCount = countWords(blocks);
  if (wordCount < EXTRACTION.minWords) {
    throw new ExtractError(restricted ? "possibly_restricted" : "no_content", restricted ? "A página indica conteúdo restrito a assinantes." : "Não identificamos texto suficiente nesta página.");
  }

  const warnings: string[] = [];
  const possiblyIncomplete = wordCount < EXTRACTION.suspiciousWords || restricted;
  if (restricted) warnings.push("A página indica que parte do conteúdo é restrita. O texto pode estar incompleto.");
  else if (wordCount < EXTRACTION.suspiciousWords) warnings.push("O texto extraído é curto. Confira se o artigo veio completo.");

  return {
    title,
    subtitle: subtitle && subtitle !== title ? subtitle : null,
    author: nullable(article.byline),
    publishedAt: normalizeDate(nullable(article.publishedTime) ?? metaPublished),
    siteName: nullable(article.siteName),
    blocks,
    wordCount,
    warnings,
    possiblyIncomplete,
    possiblyRestricted: restricted,
  };
}
