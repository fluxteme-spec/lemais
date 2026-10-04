import { adminSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function count(q: PromiseLike<{ count: number | null }>): Promise<number> {
  const r = await q;
  return r.count ?? 0;
}

export default async function AdminOverview() {
  const sb = adminSupabase();
  const now = Date.now();
  const d7 = new Date(now - 7 * 864e5).toISOString();
  const d30 = new Date(now - 30 * 864e5).toISOString();
  const p = () => sb.from("profiles").select("id", { count: "exact", head: true });
  const [total, new7, new30, active7, returned, invited, blocked, pending, shares, readings] = await Promise.all([
    count(p()),
    count(p().gte("created_at", d7)),
    count(p().gte("created_at", d30)),
    count(p().gte("last_seen_at", d7)),
    count(p().gte("visit_days", 2)),
    count(p().not("invited_by", "is", null)),
    count(p().eq("blocked", true)),
    count(p().is("age_confirmed_at", null)),
    count(sb.from("shares").select("id", { count: "exact", head: true })),
    count(sb.from("user_records").select("id", { count: "exact", head: true }).eq("kind", "session").eq("deleted", false)),
  ]);
  const { data: ads } = await sb.from("ads").select("impressions, clicks");
  const imp = (ads ?? []).reduce((n, a) => n + Number(a.impressions), 0);
  const clk = (ads ?? []).reduce((n, a) => n + Number(a.clicks), 0);

  const items: [string, string, string?][] = [
    ["Usuários", total.toLocaleString("pt-BR"), `${pending} sem cadastro concluído`],
    ["Novos em 7 dias", new7.toLocaleString("pt-BR"), `${new30} em 30 dias`],
    ["Ativos em 7 dias", active7.toLocaleString("pt-BR"), "abriram o app logados"],
    ["Voltaram", returned.toLocaleString("pt-BR"), total ? `${Math.round((returned / total) * 100)}% usaram em 2 dias ou mais` : undefined],
    ["Vieram por convite", invited.toLocaleString("pt-BR")],
    ["Suspensos", blocked.toLocaleString("pt-BR")],
    ["Leituras sincronizadas", readings.toLocaleString("pt-BR")],
    ["Cartões compartilhados", shares.toLocaleString("pt-BR")],
    ["Propagandas", `${imp.toLocaleString("pt-BR")} exibições`, `${clk.toLocaleString("pt-BR")} cliques${imp ? ` (${((clk / imp) * 100).toFixed(1)}%)` : ""}`],
  ];
  return (
    <div>
      <h1 className="font-serif text-3xl font-bold">Visão geral</h1>
      <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3">
        {items.map(([label, value, hint]) => (
          <div key={label}>
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="font-serif text-2xl font-bold tabular-nums">{value}</dd>
            {hint && <dd className="text-xs text-muted">{hint}</dd>}
          </div>
        ))}
      </dl>
      <p className="mt-8 max-w-prose text-sm text-muted">
        Contam apenas pessoas com conta. Leituras sem login ficam no aparelho de cada pessoa e não aparecem aqui. “Voltaram” = usaram o app logadas em pelo menos 2 dias diferentes.
      </p>
    </div>
  );
}
