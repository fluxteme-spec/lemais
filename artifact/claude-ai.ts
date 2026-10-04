/** Acesso ao Claude pela própria página (capacidade "sample"), na conta de quem usa. */
type SampleFn = ((input: string, opts?: Record<string, unknown>) => Promise<{ text: string }>) & {
  json: <T = unknown>(input: string, opts?: Record<string, unknown>) => Promise<T>;
};

let p: Promise<SampleFn | null> | null = null;
export function getSample(): Promise<SampleFn | null> {
  if (!p) {
    const c = (window as unknown as { claude?: { use: (n: string) => Promise<unknown> } }).claude;
    p = c ? (c.use("sample") as Promise<SampleFn | null>).catch(() => null) : Promise.resolve(null);
  }
  return p;
}

export function sampleMessage(code: string | undefined): string {
  switch (code) {
    case "not_granted":
      return "O uso do Claude não foi autorizado nesta página.";
    case "rate_limited":
      return "Muitos pedidos ao Claude agora. Tente de novo em alguns minutos.";
    case "refused":
      return "O Claude recusou este texto.";
    case "session_expired":
      return "Sua sessão no Claude expirou. Entre de novo.";
    case "invalid_json":
      return "A resposta veio fora do formato esperado.";
    case "prompt_too_large":
      return "O texto é grande demais para esta operação.";
    default:
      return "Não foi possível falar com o Claude agora.";
  }
}
