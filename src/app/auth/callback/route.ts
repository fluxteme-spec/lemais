import { NextResponse } from "next/server";
import { serverSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Retorno do login com Google: troca o código pela sessão. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const nextRaw = url.searchParams.get("next") ?? "/conta";
  const next = nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/conta";
  const sb = await serverSupabase();
  if (!sb || !code) return NextResponse.redirect(new URL("/entrar?erro=retorno", url.origin));
  const { error } = await sb.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/entrar?erro=retorno", url.origin));
  return NextResponse.redirect(new URL(next, url.origin));
}
