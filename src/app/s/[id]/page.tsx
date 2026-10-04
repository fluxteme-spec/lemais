import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getShare, shareStats } from "@/lib/share/data";
import { RememberInvite } from "@/components/RememberInvite";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const s = await getShare(id);
  if (!s) return { title: "Compartilhamento não encontrado" };
  const title = `${s.display_name ?? "Alguém"} leu “${s.title}” no LêMais`;
  const description = "Leitura guiada, ritmo e compreensão. Venha ler também.";
  return {
    title,
    description,
    openGraph: { title, description, type: "article", images: [{ url: `/api/cartao/${s.id}?formato=feed`, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description, images: [`/api/cartao/${s.id}?formato=feed`] },
  };
}

export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getShare(id);
  if (!s) notFound();
  const stats = shareStats(s);
  return (
    <div className="pt-10">
      <RememberInvite id={s.id} />
      <p className="text-muted">{s.display_name ? `${s.display_name} leu` : "Leitura concluída"}</p>
      <h1 className="mt-1 font-serif text-4xl font-bold leading-tight">{s.title}</h1>
      {(s.source || s.adaptation) && <p className="mt-2 text-muted">{[s.source, s.adaptation].filter(Boolean).join(" · ")}</p>}
      {s.excerpt && <blockquote className="reading-text mt-6 border-l-4 border-marker pl-4 text-lg">“{s.excerpt}”</blockquote>}
      <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-4 border-t border-line pt-5">
        {stats.map((x) => (
          <div key={x.label}>
            <dd className="font-serif text-3xl font-bold tabular-nums">{x.value}</dd>
            <dt className="text-sm text-muted">{x.label}</dt>
          </div>
        ))}
      </dl>
      <section className="mt-12 border-l-4 border-marker pl-4">
        <h2 className="font-serif text-2xl font-bold">Venha ler no LêMais</h2>
        <p className="mt-2 max-w-prose">Experimente modos de leitura, encontre seu ritmo e veja como foi a compreensão. É gratuito.</p>
        <Link href={`/?convite=${s.id}`} className="btn btn-primary mt-4 h-14 px-8 text-lg">
          Começar a ler
        </Link>
      </section>
    </div>
  );
}
