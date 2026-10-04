"use client";

import { useEffect, useState } from "react";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();

export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      deferred = e as InstallPromptEvent;
      listeners.forEach((l) => l());
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);
  return null;
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
