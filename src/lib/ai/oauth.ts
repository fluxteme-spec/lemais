/**
 * Login com OpenRouter (OAuth com PKCE). O usuário entra na conta dele (pode ser com Google)
 * e autoriza o LêMais; recebemos uma chave controlada por ele, que pode ser revogada lá.
 */

const VERIFIER = "lemais-or-verifier";
const STATE = "lemais-or-state";

function base64url(bytes: Uint8Array): string {
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomVerifier(bytes = 48): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return base64url(a);
}

export async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

export function callbackUrl(origin: string): string {
  return `${origin}/conectar-ia/retorno`;
}

export async function buildAuthUrl(origin: string, storage: Pick<Storage, "setItem">): Promise<string> {
  const verifier = randomVerifier();
  const state = randomVerifier(16);
  storage.setItem(VERIFIER, verifier);
  storage.setItem(STATE, state);
  const u = new URL("https://openrouter.ai/auth");
  u.searchParams.set("callback_url", callbackUrl(origin));
  u.searchParams.set("code_challenge", await challengeFor(verifier));
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("state", state);
  u.searchParams.set("key_label", "LêMais");
  return u.toString();
}

export async function exchangeCode(
  code: string,
  state: string | null,
  storage: Pick<Storage, "getItem" | "removeItem">,
  f: typeof fetch = fetch,
): Promise<string> {
  const verifier = storage.getItem(VERIFIER);
  const expected = storage.getItem(STATE);
  storage.removeItem(VERIFIER);
  storage.removeItem(STATE);
  if (!verifier) throw new Error("O login expirou ou foi iniciado em outra aba. Tente entrar de novo.");
  if (expected && state !== expected) throw new Error("A resposta do login não confere. Tente entrar de novo.");
  const res = await f("https://openrouter.ai/api/v1/auth/keys", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: "S256" }),
  }).catch(() => {
    throw new Error("Não foi possível falar com o OpenRouter. Verifique sua conexão.");
  });
  if (!res.ok) throw new Error("O OpenRouter não confirmou o login. O código pode ter expirado; tente entrar de novo.");
  const body = (await res.json()) as { key?: string };
  if (!body.key) throw new Error("O OpenRouter não devolveu uma chave.");
  return body.key;
}
