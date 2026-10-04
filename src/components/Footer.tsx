"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Footer() {
  const path = usePathname() ?? "";
  if (path.startsWith("/ler/")) return null;
  return (
    <footer className="mx-auto w-full max-w-3xl px-4 pb-28 text-sm text-muted sm:pb-10">
      <nav aria-label="Rodapé" className="flex flex-wrap gap-x-5 border-t border-line pt-4">
        <Link href="/termos" className="inline-flex min-h-11 items-center underline-offset-4 hover:underline">
          Termos de uso
        </Link>
        <Link href="/privacidade" className="inline-flex min-h-11 items-center underline-offset-4 hover:underline">
          Privacidade
        </Link>
        <Link href="/conectar-ia" className="inline-flex min-h-11 items-center underline-offset-4 hover:underline">
          Conectar IA
        </Link>
      </nav>
    </footer>
  );
}
