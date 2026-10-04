"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount } from "@/components/Account";

const ITEMS = [
  { href: "/", label: "Ler" },
  { href: "/treinar", label: "Treinar" },
  { href: "/progresso", label: "Meu progresso" },
];

function isActive(path: string, href: string) {
  if (href === "/") return path === "/" || path.startsWith("/preparar");
  return path.startsWith(href);
}

export function Wordmark() {
  return (
    <Link href="/" className="inline-flex min-h-11 items-center font-serif text-2xl font-bold tracking-tight" aria-label="LêMais, início">
      <span className="relative">
        LêMais
        <span aria-hidden className="absolute -bottom-0.5 left-0 h-[5px] w-full rounded-full bg-marker" />
      </span>
    </Link>
  );
}

export function Nav() {
  const path = usePathname() ?? "/";
  const acc = useAccount();
  if (path.startsWith("/ler/")) return null; // o leitor usa a tela inteira
  return (
    <>
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
        <Wordmark />
        <nav aria-label="Principal" className="hidden sm:block">
          <ul className="flex gap-1">
            {ITEMS.map((i) => (
              <li key={i.href}>
                <Link
                  href={i.href}
                  aria-current={isActive(path, i.href) ? "page" : undefined}
                  className="inline-flex min-h-11 items-center rounded-full px-4 font-medium aria-[current=page]:bg-ink aria-[current=page]:text-paper"
                >
                  {i.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center gap-1">
          {acc.enabled && !acc.loading && (
            <Link
              href={acc.user ? "/conta" : "/entrar"}
              aria-current={path.startsWith("/conta") || path.startsWith("/entrar") ? "page" : undefined}
              className="inline-flex min-h-11 max-w-36 items-center truncate rounded-full px-3 text-sm font-medium underline-offset-4 hover:underline"
            >
              {acc.user ? (acc.profile?.display_name ?? "Minha conta") : "Entrar"}
            </Link>
          )}
          <Link
            href="/configuracoes"
            aria-label="Configurações"
            aria-current={path.startsWith("/configuracoes") ? "page" : undefined}
            className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full px-2 text-sm text-muted aria-[current=page]:text-ink"
          >
            <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
            </svg>
            <span className="hidden md:inline">Configurações</span>
          </Link>
        </div>
      </header>
      <nav
        aria-label="Principal"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] sm:hidden"
      >
        <ul className="grid grid-cols-3">
          {ITEMS.map((i) => (
            <li key={i.href}>
              <Link
                href={i.href}
                aria-current={isActive(path, i.href) ? "page" : undefined}
                className="flex min-h-14 items-center justify-center text-sm font-medium text-muted aria-[current=page]:font-bold aria-[current=page]:text-ink aria-[current=page]:underline aria-[current=page]:decoration-marker aria-[current=page]:decoration-4 aria-[current=page]:underline-offset-8"
              >
                {i.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
