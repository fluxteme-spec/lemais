"use client";

import { useEffect, useRef } from "react";

/** Painel modal acessível baseado em <dialog> (foco preso, Esc fecha). */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-label={title}
      className="m-0 mt-auto max-h-[88dvh] w-full max-w-none overflow-y-auto rounded-t-2xl border-t border-line bg-paper p-0 text-ink backdrop:bg-black/40 sm:m-auto sm:max-w-xl sm:rounded-2xl sm:border"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-paper px-5 py-2">
        <h2 className="font-semibold">{title}</h2>
        <button type="button" className="btn btn-quiet" onClick={onClose}>
          Fechar
        </button>
      </div>
      <div className="px-5 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">{children}</div>
    </dialog>
  );
}
