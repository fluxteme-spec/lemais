"use client";

import { useActionState, useState } from "react";
import { saveAd, type ActionResult } from "../actions";

export interface AdRow {
  id: string;
  title: string;
  body: string | null;
  image_url: string | null;
  link_url: string;
  cta: string | null;
  placements: string[];
  starts_at: string | null;
  ends_at: string | null;
  active: boolean;
  impressions: number;
  clicks: number;
}

const PLACES = [
  { id: "home", label: "Início" },
  { id: "treinar", label: "Treinar" },
  { id: "resultado", label: "Resultado da leitura" },
  { id: "progresso", label: "Meu progresso" },
];

const local = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");

export function AdForm({ ad, onDone }: { ad?: AdRow; onDone?: (message: string) => void }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(async (prev, form) => {
    const r = await saveAd(prev, form);
    if (r.ok) onDone?.(r.message);
    return r;
  }, null);
  const [title, setTitle] = useState(ad?.title ?? "");
  const [body, setBody] = useState(ad?.body ?? "");
  const [img, setImg] = useState(ad?.image_url ?? "");
  const [cta, setCta] = useState(ad?.cta ?? "");
  return (
    <form action={action} className="space-y-4">
      {ad && <input type="hidden" name="id" value={ad.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block font-medium">Título</span>
          <input name="title" required maxLength={80} className="field" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block font-medium">Texto do botão</span>
          <input name="cta" maxLength={30} placeholder="Saiba mais" className="field" value={cta} onChange={(e) => setCta(e.target.value)} />
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block font-medium">Descrição</span>
        <textarea name="body" maxLength={200} rows={2} className="field" value={body} onChange={(e) => setBody(e.target.value)} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block font-medium">Link de destino</span>
          <input name="link_url" required type="url" defaultValue={ad?.link_url} placeholder="https://" className="field" />
        </label>
        <label className="block">
          <span className="mb-1 block font-medium">Imagem (endereço https, opcional)</span>
          <input name="image_url" type="url" placeholder="https://…/imagem.jpg" className="field" value={img} onChange={(e) => setImg(e.target.value)} />
        </label>
      </div>
      <fieldset>
        <legend className="mb-1 font-medium">Onde aparece</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          {PLACES.map((p) => (
            <label key={p.id} className="inline-flex min-h-11 items-center gap-2">
              <input type="checkbox" name="placements" value={p.id} defaultChecked={ad ? ad.placements.includes(p.id) : p.id === "home"} className="size-5 accent-[var(--ink)]" />
              {p.label}
            </label>
          ))}
        </div>
        <p className="text-sm text-muted">Propagandas nunca aparecem durante a leitura ou o questionário.</p>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block font-medium">Início (opcional)</span>
          <input name="starts_at" type="datetime-local" defaultValue={local(ad?.starts_at ?? null)} className="field" />
        </label>
        <label className="block">
          <span className="mb-1 block font-medium">Fim (opcional)</span>
          <input name="ends_at" type="datetime-local" defaultValue={local(ad?.ends_at ?? null)} className="field" />
        </label>
      </div>
      <label className="inline-flex min-h-11 items-center gap-2">
        <input type="checkbox" name="active" defaultChecked={ad?.active ?? true} className="size-5 accent-[var(--ink)]" />
        Ativa
      </label>

      <div>
        <p className="mb-1 text-sm text-muted">Prévia</p>
        <div className="rounded-xl border-[1.5px] border-line bg-surface p-4">
          <p className="text-xs font-medium text-muted">Patrocinado</p>
          <div className="mt-2 flex items-start gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {img.startsWith("https://") && <img src={img} alt="" className="size-20 shrink-0 rounded-lg object-cover" />}
            <div>
              <p className="font-serif text-lg font-bold">{title || "Título"}</p>
              {body && <p className="text-sm text-muted">{body}</p>}
              <p className="mt-2 text-sm font-semibold underline underline-offset-4">{cta || "Saiba mais"}</p>
            </div>
          </div>
        </div>
      </div>

      {state && (
        <p role="status" className={state.ok ? "text-ok" : "text-danger"}>
          {state.message}
        </p>
      )}
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Salvando…" : ad ? "Salvar alterações" : "Criar propaganda"}
      </button>
    </form>
  );
}
