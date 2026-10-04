import { z } from "zod";
import { adminSupabase } from "@/lib/supabase/server";
import { clientKey, rateLimit } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

const Body = z.object({ ad: z.string().uuid(), kind: z.enum(["impression", "click"]) });

/** Conta exibições e cliques sem identificar quem viu ou clicou. */
export async function POST(req: Request) {
  const raw = await req.text().catch(() => "");
  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(JSON.parse(raw));
  } catch {
    return new Response(null, { status: 400 });
  }
  // no máximo 1 contagem por anúncio, tipo e IP a cada 30 minutos
  if (!rateLimit(`ad:${parsed.kind}:${parsed.ad}:${clientKey(req)}`, 1, 30 * 60_000)) return new Response(null, { status: 204 });
  try {
    await adminSupabase().rpc("track_ad", { p_ad: parsed.ad, p_kind: parsed.kind });
  } catch {
    /* contagem é melhor esforço */
  }
  return new Response(null, { status: 204 });
}
