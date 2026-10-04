import { adminSupabase } from "@/lib/supabase/server";
import { AdList } from "./AdList";
import type { AdRow } from "./AdForm";

export const dynamic = "force-dynamic";

export default async function AdminAds() {
  const { data } = await adminSupabase().from("ads").select("*").order("created_at", { ascending: false });
  return (
    <div>
      <h1 className="font-serif text-3xl font-bold">Propagandas</h1>
      <p className="mt-2 max-w-prose text-sm text-muted">
        Aparecem marcadas como “Patrocinado” e são sorteadas entre as ativas de cada local. As contagens não identificam quem viu ou clicou.
      </p>
      <div className="mt-6">
        <AdList ads={((data ?? []) as AdRow[]).map((a) => ({ ...a, impressions: Number(a.impressions), clicks: Number(a.clicks) }))} />
      </div>
    </div>
  );
}
