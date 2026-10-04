import { adminSupabase } from "@/lib/supabase/server";
import { TextList } from "./TextList";
import type { SuggestedRow } from "./TextForm";

export const dynamic = "force-dynamic";

export default async function AdminTexts() {
  const { data } = await adminSupabase().from("suggested_texts").select("*").order("created_at", { ascending: false });
  return (
    <div>
      <h1 className="font-serif text-3xl font-bold">Textos sugeridos</h1>
      <p className="mt-2 max-w-prose text-sm text-muted">Textos publicados aparecem para todos em Treinar, com as perguntas que você cadastrar.</p>
      <div className="mt-6">
        <TextList rows={(data ?? []) as SuggestedRow[]} />
      </div>
    </div>
  );
}
