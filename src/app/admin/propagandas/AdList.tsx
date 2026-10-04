"use client";

import { useState } from "react";
import { AdminButton } from "../AdminButton";
import { deleteAd, toggleAd } from "../actions";
import { AdForm, type AdRow } from "./AdForm";

const PLACE: Record<string, string> = { home: "Início", treinar: "Treinar", resultado: "Resultado", progresso: "Progresso" };

export function AdList({ ads }: { ads: AdRow[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const done = (m: string) => {
    setFlash(m);
    setCreating(false);
    setEditing(null);
  };
  return (
    <div>
      {flash && (
        <p role="status" className="mb-4 border-l-4 border-ok pl-3">
          {flash}
        </p>
      )}
      {creating ? (
        <section className="rounded-xl border-[1.5px] border-ink p-4">
          <h2 className="mb-4 font-semibold">Nova propaganda</h2>
          <AdForm onDone={done} />
          <button type="button" className="btn btn-quiet mt-2" onClick={() => setCreating(false)}>
            Cancelar
          </button>
        </section>
      ) : (
        <button type="button" className="btn btn-primary" onClick={() => {
            setFlash(null);
            setCreating(true);
          }}>
          Nova propaganda
        </button>
      )}
      {ads.length === 0 && !creating && <p className="mt-6 text-muted">Nenhuma propaganda cadastrada.</p>}
      <ul className="mt-6 divide-y divide-line border-y border-line">
        {ads.map((a) => {
          const now = Date.now();
          const live = a.active && (!a.starts_at || new Date(a.starts_at).getTime() <= now) && (!a.ends_at || new Date(a.ends_at).getTime() > now);
          return (
            <li key={a.id} className="py-4">
              {editing === a.id ? (
                <>
                  <AdForm ad={a} onDone={done} />
                  <button type="button" className="btn btn-quiet mt-2" onClick={() => setEditing(null)}>
                    Cancelar
                  </button>
                </>
              ) : (
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-serif text-lg font-bold">{a.title}</p>
                    <p className="text-sm text-muted">
                      {live ? "No ar" : a.active ? "Fora do período" : "Pausada"} · {a.placements.map((p) => PLACE[p] ?? p).join(", ")}
                    </p>
                    <p className="text-sm tabular-nums">
                      {a.impressions.toLocaleString("pt-BR")} exibições · {a.clicks.toLocaleString("pt-BR")} cliques
                      {a.impressions ? ` · ${((a.clicks / a.impressions) * 100).toFixed(1)}%` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn px-3 text-sm" onClick={() => setEditing(a.id)}>
                      Editar
                    </button>
                    <AdminButton action={toggleAd.bind(null, a.id, !a.active)} label={a.active ? "Pausar" : "Ativar"} />
                    <AdminButton action={deleteAd.bind(null, a.id)} label="Excluir" danger confirmText={`Excluir a propaganda “${a.title}”?`} />
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
