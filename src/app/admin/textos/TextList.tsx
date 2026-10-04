"use client";

import { useState } from "react";
import { AdminButton } from "../AdminButton";
import { deleteSuggestedText } from "../actions";
import { TextForm, type SuggestedRow } from "./TextForm";
import { countWords } from "@/lib/text";

export function TextList({ rows }: { rows: SuggestedRow[] }) {
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
          <h2 className="mb-4 font-semibold">Novo texto sugerido</h2>
          <TextForm onDone={done} />
          <button type="button" className="btn btn-quiet mt-2" onClick={() => setCreating(false)}>
            Cancelar
          </button>
        </section>
      ) : (
        <button type="button" className="btn btn-primary" onClick={() => {
            setFlash(null);
            setCreating(true);
          }}>
          Novo texto
        </button>
      )}
      {rows.length === 0 && !creating && <p className="mt-6 text-muted">Nenhum texto sugerido ainda.</p>}
      <ul className="mt-6 divide-y divide-line border-y border-line">
        {rows.map((r) =>
          editing === r.id ? (
            <li key={r.id} className="py-4">
              <TextForm row={r} onDone={done} />
              <button type="button" className="btn btn-quiet mt-2" onClick={() => setEditing(null)}>
                Cancelar
              </button>
            </li>
          ) : (
            <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-4">
              <div className="min-w-0">
                <p className="font-serif text-lg font-bold">{r.title}</p>
                <p className="text-sm text-muted">
                  {r.published ? "Publicado" : "Rascunho"} · {countWords(r.blocks)} palavras · {r.questions?.length ?? 0} perguntas
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn px-3 text-sm" onClick={() => setEditing(r.id)}>
                  Editar
                </button>
                <AdminButton action={deleteSuggestedText.bind(null, r.id)} label="Excluir" danger confirmText={`Excluir “${r.title}”?`} />
              </div>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
