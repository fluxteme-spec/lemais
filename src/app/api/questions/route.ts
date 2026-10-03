import { z } from "zod";
import { RATE_LIMIT, TEXT_LIMITS } from "@/lib/config";
import { getProvider } from "@/lib/comprehension/provider";
import { GenerationError, generateQuestionSet } from "@/lib/comprehension/generate";
import { clientKey, rateLimit, Semaphore } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sem = new Semaphore(RATE_LIMIT.maxConcurrentGenerations);
const Body = z.object({
  contentId: z.string().min(1).max(100),
  contentVersion: z.number().int().min(1),
  title: z.string().max(500),
  blocks: z
    .array(z.object({ type: z.enum(["heading", "paragraph"]), text: z.string().max(TEXT_LIMITS.maxChars) }))
    .min(1)
    .max(5000),
});

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

/** Informa se a geração automática está disponível (sem expor detalhes da chave). */
export async function GET() {
  const p = getProvider();
  return json({ available: !!p, provider: p?.name ?? null, model: p?.model ?? null });
}

export async function POST(req: Request) {
  const provider = getProvider();
  if (!provider) return json({ ok: false, code: "ai_unavailable", message: "Geração automática de questões não configurada." }, 501);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ ok: false, code: "invalid", message: "Requisição inválida." }, 400);
  if (!rateLimit(`q:${clientKey(req)}`, RATE_LIMIT.questionsPerWindow, RATE_LIMIT.windowMs)) {
    return json({ ok: false, code: "rate_limited", message: "Limite de gerações atingido. Tente mais tarde." }, 429);
  }
  if (!sem.tryAcquire()) return json({ ok: false, code: "busy", message: "Servidor ocupado. Tente novamente em instantes." }, 503);
  try {
    const set = await generateQuestionSet(provider, parsed.data, TEXT_LIMITS.minWordsForQuiz);
    return json({ ok: true, questionSet: set });
  } catch (e) {
    if (e instanceof GenerationError) {
      console.info(`[questions] ${e.code}`); // nunca registra o texto
      return json({ ok: false, code: e.code, message: e.message }, 422);
    }
    console.error("[questions] erro interno");
    return json({ ok: false, code: "failed", message: "Erro inesperado na geração." }, 500);
  } finally {
    sem.release();
  }
}
