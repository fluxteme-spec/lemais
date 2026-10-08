"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { canPromptInstall, onInstallPromptChange, promptInstall } from "@/components/Pwa";

const KEY = "lemais-instalar-adiado";
const SNOOZE_DAYS = 14;
const DELAY_MS = 4000;

type Kind = "android" | "android-menu" | "ios" | "inapp";

function snoozed(): boolean {
  try {
    const v = Number(localStorage.getItem(KEY) || 0);
    return Date.now() - v < SNOOZE_DAYS * 86400000;
  } catch {
    return false;
  }
}
function snooze() {
  try {
    localStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* ignora */
  }
}

/** Convite para instalar o app no celular (Android: botão nativo; iPhone: instruções). */
export function InstallPopup() {
  const path = usePathname() ?? "";
  const [kind, setKind] = useState<Kind | null>(null);
  const [open, setOpen] = useState(false);
  const hidden = /^\/(ler|admin|entrar|auth)(\/|$)/.test(path);

  useEffect(() => {
    const ua = navigator.userAgent;
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    if (standalone || snoozed()) return;
    const ios = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
    const android = /android/i.test(ua);
    if (!ios && !android) return;
    const inApp = /instagram|fban|fbav|fb_iab|tiktok|line\/|linkedinapp|snapchat/i.test(ua);

    let timer: ReturnType<typeof setTimeout>;
    if (inApp) {
      setKind("inapp");
      timer = setTimeout(() => setOpen(true), DELAY_MS);
      return () => clearTimeout(timer);
    }
    if (ios) {
      setKind("ios");
      timer = setTimeout(() => setOpen(true), DELAY_MS);
      return () => clearTimeout(timer);
    }
    // Android: usa o instalador nativo quando o navegador oferece; senão, instrução pelo menu
    const update = () => setKind(canPromptInstall() ? "android" : "android-menu");
    update();
    const off = onInstallPromptChange(update);
    timer = setTimeout(() => setOpen(true), DELAY_MS + 2000);
    return () => {
      off();
      clearTimeout(timer);
    };
  }, []);

  if (!open || !kind || hidden) return null;

  function close() {
    snooze();
    setOpen(false);
  }

  async function install() {
    const ok = await promptInstall();
    if (ok) setOpen(false);
    else close();
  }

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="instalar-titulo"
      className="fixed inset-x-3 bottom-20 z-50 mx-auto max-w-md rounded-2xl border-[1.5px] border-ink bg-surface p-5 shadow-xl sm:bottom-6"
    >
      <div className="flex items-start gap-4">
        <img src="/icons/icon-192.png" alt="" width={48} height={48} className="rounded-xl" />
        <div className="min-w-0 flex-1">
          <h2 id="instalar-titulo" className="font-serif text-xl font-bold">
            Instale o LêMais
          </h2>
          {kind === "android" && <p className="mt-1">Abra direto da tela inicial, em tela cheia e mais rápido. É grátis e ocupa pouco espaço.</p>}
          {kind === "android-menu" && (
            <p className="mt-1">
              Toque no menu <strong>⋮</strong> do navegador e escolha <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.
            </p>
          )}
          {kind === "ios" && (
            <ol className="mt-2 space-y-1.5">
              <li>
                <span className="font-bold">1.</span> Toque em{" "}
                <svg
                  className="mx-0.5 inline align-[-3px]"
                  aria-hidden
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
                  <path d="M16 6l-4-4-4 4" />
                  <path d="M12 2v13" />
                </svg>{" "}
                <strong>Compartilhar</strong>
              </li>
              <li>
                <span className="font-bold">2.</span> Escolha <strong>Adicionar à Tela de Início</strong>
              </li>
            </ol>
          )}
          {kind === "inapp" && (
            <p className="mt-1">
              Para instalar, abra este link no navegador: toque em <strong>⋯</strong> e escolha <strong>Abrir no navegador</strong> (Chrome ou Safari).
            </p>
          )}
        </div>
        <button
          type="button"
          aria-label="Fechar"
          className="-mr-2 -mt-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
          onClick={close}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button type="button" className="btn btn-quiet" onClick={close}>
          {kind === "android" ? "Agora não" : "Entendi"}
        </button>
        {kind === "android" && (
          <button type="button" className="btn btn-primary" onClick={() => void install()}>
            Instalar
          </button>
        )}
      </div>
    </div>
  );
}
