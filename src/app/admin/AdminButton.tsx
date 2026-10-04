"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "./actions";

/** Botão que executa uma ação do painel, com confirmação opcional e retorno visível. */
export function AdminButton({
  action,
  label,
  confirmText,
  danger,
}: {
  action: () => Promise<ActionResult>;
  label: string;
  confirmText?: string;
  danger?: boolean;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<ActionResult | null>(null);
  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        className={`btn px-3 text-sm ${danger ? "btn-danger" : ""}`}
        disabled={pending}
        onClick={() => {
          if (confirmText && !window.confirm(confirmText)) return;
          start(async () => setMsg(await action()));
        }}
      >
        {pending ? "Aguarde…" : label}
      </button>
      {msg && (
        <span role="status" className={`mt-1 text-xs ${msg.ok ? "text-ok" : "text-danger"}`}>
          {msg.message}
        </span>
      )}
    </span>
  );
}
