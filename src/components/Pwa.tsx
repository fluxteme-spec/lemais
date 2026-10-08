"use client";

import { useEffect, useState } from "react";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();

export function PwaRegister() {
  const [updated, setUpdated] = useState(false);
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      const had = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.register("/sw.js").catch(() => {});
      // uma versão nova assumiu o controle: oferece recarregar para usá-la
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (had) setUpdated(true);
      });
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      deferred = e as InstallPromptEvent;
      listeners.forEach((l) => l());
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);
  if (!updated) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-20 z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-xl border-[1.5px] border-ink bg-paper p-3 shadow-lg sm:bottom-6"
    >
      <span>Nova versão do LêMais disponível.</span>
      <button type="button" className="btn btn-primary px-4" onClick={() => window.location.reload()}>
        Atualizar
      </button>
    </div>
  );
}

/** Botão “Verificar atualizações” (configurações). */
export function UpdateApp() {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function check() {
    setBusy(true);
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      if (!reg) {
        window.location.reload();
        return;
      }
      await reg.update();
      if (reg.installing || reg.waiting) {
        setMsg("Atualizando…");
        setTimeout(() => window.location.reload(), 1200);
      } else setMsg("Você já está na versão mais recente.");
    } catch {
      setMsg("Não foi possível verificar agora. Confira a conexão.");
    }
    setBusy(false);
  }
  return (
    <div>
      <button type="button" className="btn" disabled={busy} onClick={() => void check()}>
        {busy ? "Verificando…" : "Verificar atualizações"}
      </button>
      {msg && (
        <p role="status" className="mt-2 text-sm text-muted">
          {msg}
        </p>
      )}
    </div>
  );
}

/** Botão “Instalar app” (Android/desktop) ou instrução para iPhone. */
export function InstallApp() {
  const [can, setCan] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);
  useEffect(() => {
    const update = () => setCan(!!deferred);
    listeners.add(update);
    update();
    setInstalled(window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true);
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    return () => void listeners.delete(update);
  }, []);
  if (installed) return <p className="text-muted">O LêMais já está instalado neste aparelho.</p>;
  if (can)
    return (
      <button
        type="button"
        className="btn"
        onClick={async () => {
          await deferred?.prompt();
          const r = await deferred?.userChoice;
          if (r?.outcome === "accepted") setInstalled(true);
          deferred = null;
          setCan(false);
        }}
      >
        Instalar o app
      </button>
    );
  if (ios)
    return (
      <p className="max-w-prose">
        No iPhone: abra no Safari, toque em <strong>Compartilhar</strong> e depois em <strong>Adicionar à Tela de Início</strong>.
      </p>
    );
  return <p className="max-w-prose text-muted">No celular, use a opção “Instalar app” ou “Adicionar à tela inicial” do menu do navegador.</p>;
}
