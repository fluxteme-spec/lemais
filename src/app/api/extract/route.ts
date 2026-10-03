import { z } from "zod";
import { RATE_LIMIT } from "@/lib/config";
import { ExtractError, safeFetch } from "@/lib/extract/fetch";
import { extractArticle } from "@/lib/extract/parse";
import { clientKey, rateLimit, Semaphore } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ url: z.string().min(1).max(2048) });
const sem = new Semaphore(RATE_LIMIT.maxConcurrentExtractions);

function fail(code: string, message: string, status: number) {
  return Response.json({ ok: false, code, message }, { status, headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("invalid_url", "Informe um link válido.", 400);
  if (!rateLimit(`extract:${clientKey(req)}`, RATE_LIMIT.extractPerWindow, RATE_LIMIT.windowMs)) {
    return fail("rate_limited", "Muitas importações em pouco tempo. Aguarde alguns minutos.", 429);
  }
  if (!sem.tryAcquire()) return fail("rate_limited", "O servidor está ocupado. Tente novamente em instantes.", 503);
  let host = "?";
  try {
    try {
      host = new URL(parsed.data.url).hostname;
    } catch {}
    const page = await safeFetch(parsed.data.url);
    const article = extractArticle(page.html, page.finalUrl);
    return Response.json(
      { ok: true, data: { ...article, originalUrl: page.originalUrl, finalUrl: page.finalUrl } },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    if (e instanceof ExtractError) {
      // log mínimo: só o domínio e o código, nunca a URL completa ou o texto
      console.info(`[extract] ${host} → ${e.code}`);
      const status = e.code === "invalid_url" || e.code === "forbidden_destination" ? 400 : 422;
      return fail(e.code, e.message, status);
    }
    console.error(`[extract] ${host} → erro interno`);
    return fail("internal", "Erro inesperado ao preparar o link.", 500);
  } finally {
    sem.release();
  }
}
