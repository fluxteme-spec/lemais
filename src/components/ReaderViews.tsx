"use client";

import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Token } from "@/lib/text";
import type { TextBlock } from "@/lib/types";

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Letra de referência (preferência visual; sem benefício comprovado). */
export function referenceIndex(word: string): number {
  const letters = [...word];
  const firstLetter = letters.findIndex((c) => /[\p{L}\p{N}]/u.test(c));
  const n = letters.filter((c) => /[\p{L}\p{N}]/u.test(c)).length;
  const off = n <= 1 ? 0 : n <= 5 ? 1 : n <= 9 ? 2 : n <= 13 ? 3 : 4;
  return Math.max(0, firstLetter) + off;
}

/** RSVP: uma palavra em posição central estável. Palavras longas reduzem o tamanho, nunca são cortadas. */
export function RsvpView({ token, fontSize, highlight }: { token: Token | null; fontSize: number; highlight: boolean }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const word = token?.text ?? "";
  const chars = [...word].length || 1;
  const size = Math.max(16, Math.min(fontSize, width ? (width * 0.94) / (chars * 0.62) : fontSize));
  const idx = referenceIndex(word);
  const letters = [...word];
  return (
    <div ref={ref} aria-hidden className="reading-text flex h-full w-full items-center justify-center overflow-hidden" style={{ fontSize: size }}>
      {!token ? null : highlight ? (
        <div className="grid w-full grid-cols-[1fr_auto_1fr] items-baseline leading-none whitespace-pre">
          <span className="text-right">{letters.slice(0, idx).join("")}</span>
          <span className="border-b-[0.12em] border-marker font-bold">{letters[idx] ?? ""}</span>
          <span className="text-left">{letters.slice(idx + 1).join("")}</span>
        </div>
      ) : (
        <span className="leading-none whitespace-pre">{word}</span>
      )}
    </div>
  );
}

/** Blocos: grupo de palavras centralizado, com quebra de linha quando necessário. */
export function ChunkView({ text, fontSize }: { text: string; fontSize: number }) {
  return (
    <div aria-hidden className="reading-text flex h-full w-full items-center justify-center text-center" style={{ fontSize: Math.round(fontSize * 0.85), lineHeight: 1.25 }}>
      <span className="max-w-[18ch] [overflow-wrap:anywhere]">{text}</span>
    </div>
  );
}

interface BlockProps {
  block: TextBlock;
  tokens: Token[];
  activeStart: number;
  activeEnd: number;
  onSeek?: (i: number) => void;
}

const GuidedBlock = memo(function GuidedBlock({ block, tokens, activeStart, activeEnd, onSeek }: BlockProps) {
  const Tag = block.type === "heading" ? "h2" : "p";
  return (
    <Tag className={block.type === "heading" ? "mt-8 mb-2 text-[1.15em] font-bold" : "mb-[1em]"}>
      {tokens.map((t) => {
        const active = t.index >= activeStart && t.index < activeEnd;
        // dentro do trecho ativo o espaço também fica marcado, formando uma faixa contínua
        const joined = active && t.index + 1 < activeEnd;
        return (
          <span key={t.index}>
            <span
              data-t={t.index}
              onClick={onSeek ? () => onSeek(t.index) : undefined}
              className={(active ? "marker " : "") + (onSeek ? "cursor-pointer" : "")}
            >
              {t.text}
              {joined ? " " : ""}
            </span>
            {joined ? "" : " "}
          </span>
        );
      })}
    </Tag>
  );
});

function groupByBlock(tokens: Token[], blocks: TextBlock[]): Token[][] {
  const groups: Token[][] = blocks.map(() => []);
  for (const t of tokens) groups[t.blockIndex].push(t);
  return groups;
}

/**
 * Texto completo. Com `active`, destaca o trecho atual e mantém-no visível sem saltos bruscos.
 * Sem `active`, é texto estático (modo livre e alternativa para leitores de tela).
 */
export function FullTextView({
  blocks,
  tokens,
  active,
  onSeek,
  fontSize,
  lineSpacing,
}: {
  blocks: TextBlock[];
  tokens: Token[];
  active?: { start: number; end: number } | null;
  onSeek?: (i: number) => void;
  fontSize: number;
  lineSpacing: number;
}) {
  const groups = useMemo(() => groupByBlock(tokens, blocks), [tokens, blocks]);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) return;
    const el = container.current?.querySelector(`[data-t="${active.start}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight;
    if (r.top < vh * 0.18 || r.bottom > vh * 0.68) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollBy({ top: r.top - vh * 0.35, behavior: reduce ? "auto" : "smooth" });
    }
  }, [active]);

  return (
    <div ref={container} className="reading-text mx-auto max-w-[38rem]" style={{ fontSize, lineHeight: lineSpacing }}>
      {blocks.map((b, i) => {
        const ts = groups[i];
        if (!ts.length) return null;
        const overlaps = active && active.start < ts[ts.length - 1].index + 1 && active.end > ts[0].index;
        return (
          <GuidedBlock
            key={i}
            block={b}
            tokens={ts}
            activeStart={overlaps ? active!.start : -1}
            activeEnd={overlaps ? active!.end : -1}
            onSeek={onSeek}
          />
        );
      })}
    </div>
  );
}
