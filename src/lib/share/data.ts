import { createClient } from "@supabase/supabase-js";
import { accountsEnabled, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabase/env";

export interface ShareRow {
  id: string;
  display_name: string | null;
  title: string;
  source: string | null;
  excerpt: string | null;
  mode: string | null;
  observed_wpm: number | null;
  wpm_is_estimate: boolean;
  words: number | null;
  active_seconds: number | null;
  correct: number | null;
  question_count: number | null;
  adaptation: string | null;
  created_at: string;
}

/** Leitura pública de um compartilhamento (sem sessão). */
export async function getShare(id: string): Promise<ShareRow | null> {
  if (!accountsEnabled || !/^[a-z0-9]{6,20}$/.test(id)) return null;
  const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { data } = await sb.from("shares").select("*").eq("id", id).maybeSingle();
  return (data as ShareRow) ?? null;
}

export function shareStats(s: ShareRow): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  if (s.observed_wpm) out.push({ label: s.wpm_is_estimate ? "ritmo estimado" : "ritmo", value: `${s.observed_wpm} PPM` });
  if (s.active_seconds) {
    const m = Math.floor(s.active_seconds / 60);
    const sec = s.active_seconds % 60;
    out.push({ label: "tempo", value: m ? `${m} min ${String(sec).padStart(2, "0")} s` : `${sec} s` });
  }
  if (s.question_count && s.correct !== null) out.push({ label: "compreensão", value: `${s.correct} de ${s.question_count}` });
  else if (s.words) out.push({ label: "palavras", value: s.words.toLocaleString("pt-BR") });
  return out;
}
