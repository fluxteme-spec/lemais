/**
 * Limites de requisição e concorrência em memória (adequado a um processo único).
 * Em execução distribuída, troque por um armazenamento compartilhado (ex.: Redis).
 */
const hits = new Map<string, number[]>();

export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) {
    hits.set(key, arr);
    return false;
  }
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 10_000) {
    for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  }
  return true;
}

export class Semaphore {
  private active = 0;
  constructor(private max: number) {}
  tryAcquire(): boolean {
    if (this.active >= this.max) return false;
    this.active++;
    return true;
  }
  release(): void {
    this.active = Math.max(0, this.active - 1);
  }
}

export function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || req.headers.get("x-real-ip") || "local";
}
