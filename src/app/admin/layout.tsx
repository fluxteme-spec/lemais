import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { currentUser, isAdminUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Painel", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const TABS = [
  { href: "/admin", label: "Visão geral" },
  { href: "/admin/usuarios", label: "Usuários" },
  { href: "/admin/propagandas", label: "Propagandas" },
  { href: "/admin/textos", label: "Textos sugeridos" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!isAdminUser(user) || !process.env.SUPABASE_SECRET_KEY) notFound();
  return (
    <div className="pt-8">
      <p className="text-sm text-muted">Painel do desenvolvedor</p>
      <nav aria-label="Painel" className="mt-2 -mx-1 flex flex-wrap gap-1">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} className="inline-flex min-h-11 items-center rounded-full border-[1.5px] border-line px-4 text-sm font-medium">
            {t.label}
          </Link>
        ))}
      </nav>
      <div className="mt-6">{children}</div>
    </div>
  );
}
