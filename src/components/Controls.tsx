"use client";

import { useEffect, useId, useState } from "react";
import { WPM } from "@/lib/config";
import { clampWpm } from "@/lib/reader/engine";
import type { ChunkSize, ReadingMode } from "@/lib/types";

export const MODES: { id: ReadingMode; label: string; hint: string }[] = [
  { id: "rsvp", label: "Palavra a palavra", hint: "Uma palavra por vez, no centro da tela (RSVP)." },
  { id: "chunk", label: "Por blocos", hint: "Pequenos grupos de palavras por vez." },
  { id: "guided", label: "Texto guiado", hint: "Texto completo com o trecho atual marcado." },
  { id: "free", label: "Texto livre", hint: "Sem avanço automático. Você marca início e fim." },
];

export function ModeSelector({
  value,
  onChange,
  disabled,
}: {
  value: ReadingMode;
  onChange: (m: ReadingMode) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled}>
      <legend className="mb-2 font-medium">Modo de leitura</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {MODES.map((m) => (
          <label
            key={m.id}
            className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border-[1.5px] border-line p-3 has-[:checked]:border-ink has-[:checked]:bg-surface has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
          >
            <input type="radio" name="modo" className="mt-1 size-5 accent-[var(--ink)]" checked={value === m.id} onChange={() => onChange(m.id)} />
            <span>
              <span className="block font-semibold">{m.label}</span>
              <span className="block text-sm text-muted">{m.hint}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function ChunkSizeSelector({ value, onChange, disabled }: { value: ChunkSize; onChange: (c: ChunkSize) => void; disabled?: boolean }) {
  const opts: { v: ChunkSize; label: string }[] = [
    { v: 2, label: "2 palavras" },
    { v: 3, label: "3 palavras" },
    { v: 4, label: "4 palavras" },
    { v: "auto", label: "Automático" },
  ];
  return (
    <fieldset disabled={disabled}>
      <legend className="mb-2 font-medium">Tamanho do bloco</legend>
      <div className="flex flex-wrap gap-2">
        {opts.map((o) => (
          <label
            key={String(o.v)}
            className="inline-flex min-h-11 cursor-pointer items-center rounded-full border-[1.5px] border-line px-4 has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-paper has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-focus"
          >
            <input type="radio" name="bloco" className="sr-only" checked={value === o.v} onChange={() => onChange(o.v)} />
            {o.label}
          </label>
        ))}
      </div>
      <p className="mt-1 text-sm text-muted">
        Blocos não atravessam fim de frase ou de parágrafo. O automático fecha blocos em vírgulas e pontos, com até 4 palavras.
      </p>
    </fieldset>
  );
}

export function WpmControl({ value, onChange, compact }: { value: number; onChange: (v: number) => void; compact?: boolean }) {
  const id = useId();
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = (raw: string) => {
    const n = Number(raw);
    if (raw.trim() === "" || !Number.isFinite(n)) return setDraft(String(value));
    const v = clampWpm(n);
    setDraft(String(v));
    onChange(v);
  };
  return (
    <div role="group" aria-labelledby={`${id}-l`}>
      <div id={`${id}-l`} className="mb-2 font-medium">
        Ritmo configurado
      </div>
      <div className="flex items-center gap-2">
        <button type="button" className="btn px-0 text-xl" aria-label="Diminuir 25 palavras por minuto" onClick={() => onChange(clampWpm(value - WPM.step))} disabled={value <= WPM.min}>
          −
        </button>
        <label className="flex items-baseline gap-1">
          <span className="sr-only">Palavras por minuto</span>
          <input
            type="number"
            inputMode="numeric"
            min={WPM.min}
            max={WPM.max}
            step={WPM.step}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && commit((e.target as HTMLInputElement).value)}
            className="field w-24 text-center text-xl font-bold tabular-nums"
          />
          <span className="text-muted">PPM</span>
        </label>
        <button type="button" className="btn px-0 text-xl" aria-label="Aumentar 25 palavras por minuto" onClick={() => onChange(clampWpm(value + WPM.step))} disabled={value >= WPM.max}>
          +
        </button>
      </div>
      <input
        type="range"
        min={WPM.min}
        max={WPM.max}
        step={WPM.step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Ritmo em palavras por minuto"
        aria-valuetext={`${value} palavras por minuto`}
        className="mt-2 w-full"
      />
      <div className="mt-1 flex flex-wrap gap-2">
        {WPM.presets.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={value === p}
            onClick={() => onChange(p)}
            className="min-h-11 min-w-11 rounded-full border-[1.5px] border-line px-3 text-sm tabular-nums aria-pressed:border-ink aria-pressed:font-bold"
          >
            {p}
          </button>
        ))}
      </div>
      {!compact && <p className="mt-2 text-sm text-muted">A faixa de 100 a 1.000 PPM não é uma recomendação. Escolha um ritmo confortável.</p>}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <input id={id} type="checkbox" role="switch" className="mt-1 size-6 shrink-0 accent-[var(--ink)]" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-describedby={hint ? `${id}-h` : undefined} />
      <label htmlFor={id} className="min-h-11 cursor-pointer">
        <span className="block font-medium">{label}</span>
        {hint && (
          <span id={`${id}-h`} className="block text-sm text-muted">
            {hint}
          </span>
        )}
      </label>
    </div>
  );
}

export function formatEstimate(ms: number): string {
  const min = ms / 60_000;
  if (min < 1) return "menos de 1 min";
  if (min < 60) return `cerca de ${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  return `cerca de ${h} h ${Math.round(min - h * 60)} min`;
}
