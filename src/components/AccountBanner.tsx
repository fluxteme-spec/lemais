"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount } from "@/components/Account";

/** Lembra de concluir o cadastro (idade e termos) antes de usar recursos da conta. */
export function AccountBanner() {
  const acc = useAccount();
  const path = usePathname() ?? "";
  if (!acc.needsOnboarding || path.startsWith("/conta") || path.startsWith("/ler/") || path === "/termos" || path === "/privacidade") return null;
  return (
    <div role="status" className="border-b-2 border-marker bg-surface px-4 py-3 text-sm">
      Falta pouco para ativar sua conta.{" "}
      <Link href="/conta" className="font-semibold underline underline-offset-4">
        Concluir cadastro
      </Link>
    </div>
  );
}
