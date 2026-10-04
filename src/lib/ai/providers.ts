/**
 * IA do próprio usuário. As chamadas saem DIRETO do navegador para o provedor escolhido;
 * a chave fica só neste navegador e nunca passa pelo servidor do LêMais.
 *
 * Provedores:
 *  - openrouter: login com a conta OpenRouter (OAuth PKCE; dá para entrar com Google).
 *                Acesso a modelos da OpenAI, Anthropic, Google e outros.
 *  - gemini / openai / anthropic: chave de API colada pelo usuário.
 */
import { AI } from "@/lib/config";
import { parseJsonObject, systemPrompt, userPrompt } from "@/lib/comprehension/prompt";
import { ProviderError, type QuestionProvider } from "@/lib/comprehension/provider";

export type AIProviderId = "openrouter" | "gemini" | "openai" | "anthropic";

export interface AIConnection {
  provider: AIProviderId;
  apiKey: string;
  model: string;
  connectedAt: string;
}

export interface ProviderInfo {
  id: AIProviderId;
  name: string;
  keyUrl: string | null;
  keyHint: string;
  keyPattern: RegExp;
}

export const PROVIDERS: Record<AIProviderId, ProviderInfo> = {
  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    keyUrl: "https://openrouter.ai/settings/keys",
    keyHint: "sk-or-…",
    keyPattern: /^sk-or-/,
  },
  gemini: {
    id: "gemini",
    name: "Google Gemini",
    keyUrl: "https://aistudio.google.com/apikey",
    keyHint: "AIza…",
    keyPattern: /^AIza/,
  },
  openai: {
    id: "openai",
    name: "OpenAI (ChatGPT)",
    keyUrl: "https://platform.openai.com/api-keys",
    keyHint: "sk-…",
    keyPattern: /^sk-/,
  },
  anthropic: {
    id: "anthropic",
    name: "Anthropic (Claude)",
    keyUrl: "https://console.anthropic.com/settings/keys",
    keyHint: "sk-ant-…",
    keyPattern: /^sk-ant-/,
  },
};

export interface ModelOption {
  id: string;
  label: string;
}

type Fetch = typeof fetch;

async function getJson(f: Fetch, url: string, init: RequestInit): Promise<unknown> {
  let res: Response;
  try {
    res = await f(url, init);
  } catch (e) {
    if (init.signal?.aborted) throw new ProviderError("timeout", "O provedor demorou demais para responder.");
    throw new ProviderError("upstream", "Não foi possível falar com o provedor. Verifique sua conexão.");
  }
  if (res.status === 400) {
    const text = await res.text().catch(() => "");
    if (/api[ _-]?key|API_KEY_INVALID|invalid.*key/i.test(text)) throw new ProviderError("upstream", "A chave foi recusada pelo provedor. Confira se ela está correta e ativa.");
    throw new ProviderError("upstream", "O provedor recusou a requisição (erro 400). Tente outro modelo.");
  }
  if (res.status === 404) throw new ProviderError("upstream", "O modelo escolhido não foi encontrado na sua conta. Escolha outro em Conectar minha IA.");
  if (res.status === 401 || res.status === 403) throw new ProviderError("upstream", "A chave foi recusada pelo provedor. Confira se ela está correta e ativa.");
  if (res.status === 402) throw new ProviderError("upstream", "O provedor informou falta de créditos na sua conta.");
  if (res.status === 429) throw new ProviderError("upstream", "O provedor limitou o uso no momento. Tente de novo em instantes.");
  if (!res.ok) throw new ProviderError("upstream", `O provedor respondeu com erro ${res.status}.`);
  return res.json();
}

function appHeaders(): Record<string, string> {
  const origin = typeof location !== "undefined" ? location.origin : "http://localhost";
  return { "HTTP-Referer": origin, "X-Title": "LêMais" };
}

/** Lista os modelos de texto disponíveis para a conta (também serve como teste da conexão). */
export async function listModels(provider: AIProviderId, apiKey: string, f: Fetch = fetch): Promise<ModelOption[]> {
  const signal = AbortSignal.timeout(15_000);
  if (provider === "openrouter") {
    const data = (await getJson(f, "https://openrouter.ai/api/v1/models", { signal, headers: { Authorization: `Bearer ${apiKey}` } })) as {
      data?: { id: string; name?: string; architecture?: { output_modalities?: string[] } }[];
    };
    // confirma a chave (a lista de modelos é pública)
    await getJson(f, "https://openrouter.ai/api/v1/key", { signal, headers: { Authorization: `Bearer ${apiKey}` } });
    return (data.data ?? [])
      .filter((m) => !m.architecture?.output_modalities || m.architecture.output_modalities.includes("text"))
      .map((m) => ({ id: m.id, label: m.name ?? m.id }));
  }
  if (provider === "gemini") {
    const data = (await getJson(f, "https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { signal, headers: { "x-goog-api-key": apiKey } })) as {
      models?: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[];
    };
    return (data.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent") && /gemini/i.test(m.name) && !/embedding|image|tts|vision|audio/i.test(m.name))
      .map((m) => ({ id: m.name.replace(/^models\//, ""), label: m.displayName ?? m.name }));
  }
  if (provider === "openai") {
    const data = (await getJson(f, "https://api.openai.com/v1/models", { signal, headers: { Authorization: `Bearer ${apiKey}` } })) as { data?: { id: string }[] };
    return (data.data ?? [])
      .filter((m) => /^(gpt-|o\d)/.test(m.id) && !/audio|realtime|image|tts|transcribe|search|instruct/.test(m.id))
      .map((m) => ({ id: m.id, label: m.id }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }
  const data = (await getJson(f, "https://api.anthropic.com/v1/models?limit=100", {
    signal,
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
  })) as { data?: { id: string; display_name?: string }[] };
  return (data.data ?? []).map((m) => ({ id: m.id, label: m.display_name ?? m.id }));
}

/**
 * Sugere um modelo rápido e barato, adequado para gerar perguntas.
 * A lista vem da conta do usuário, então nada fica preso a nomes de modelos que mudam com o tempo.
 */
export function suggestModel(provider: AIProviderId, models: ModelOption[]): string | null {
  if (!models.length) return null;
  const prefs: Record<AIProviderId, RegExp[]> = {
    openrouter: [/^google\/gemini-[\d.]+-flash(?!.*(lite|image|thinking))/, /^openai\/gpt-[\d.]+-mini$/, /^anthropic\/claude-haiku/, /flash|mini|haiku/],
    gemini: [/^gemini-[\d.]+-flash$/, /^gemini-[\d.]+-flash(?!.*(lite|image|thinking|exp))/, /flash/],
    openai: [/^gpt-[\d.]+-mini$/, /mini/],
    anthropic: [/haiku/, /sonnet/],
  };
  const notFree = models.filter((m) => !/:free$/.test(m.id));
  const pool = notFree.length ? notFree : models;
  for (const re of prefs[provider]) {
    const hits = pool.filter((m) => re.test(m.id));
    // entre vários, prefere a versão mais recente (ordem lexical decrescente do id)
    if (hits.length) return hits.sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }))[0].id;
  }
  return pool[0].id;
}

/**
 * Chamada genérica ao provedor do usuário, pedindo resposta em JSON.
 * Retorna o texto bruto da resposta (o chamador interpreta o JSON).
 */
export async function completeJson(
  conn: AIConnection,
  system: string,
  user: string,
  signal: AbortSignal,
  f: Fetch = fetch,
  maxTokens: number = AI.maxOutputTokens,
): Promise<string> {
      let out = "";
      if (conn.provider === "openrouter" || conn.provider === "openai") {
        const url = conn.provider === "openrouter" ? "https://openrouter.ai/api/v1/chat/completions" : "https://api.openai.com/v1/chat/completions";
        const data = (await getJson(f, url, {
          method: "POST",
          signal,
          headers: {
            "content-type": "application/json",
            Authorization: `Bearer ${conn.apiKey}`,
            ...(conn.provider === "openrouter" ? appHeaders() : {}),
          },
          body: JSON.stringify({
            model: conn.model,
            messages: [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
            response_format: { type: "json_object" },
            // modelos com raciocínio consomem tokens extras
            ...(conn.provider === "openai" ? { max_completion_tokens: maxTokens * 3 } : { max_tokens: maxTokens * 3 }),
          }),
        })) as { choices?: { message?: { content?: string | null; refusal?: string | null } }[] };
        const msg = data.choices?.[0]?.message;
        if (msg?.refusal) throw new ProviderError("refused", "O modelo recusou gerar questões para este texto.");
        out = msg?.content ?? "";
      } else if (conn.provider === "gemini") {
        const data = (await getJson(f, `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(conn.model)}:generateContent`, {
          method: "POST",
          signal,
          headers: { "content-type": "application/json", "x-goog-api-key": conn.apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: "user", parts: [{ text: user }] }],
            generationConfig: { responseMimeType: "application/json", temperature: 0.3, maxOutputTokens: maxTokens * 3 },
          }),
        })) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[] };
        const cand = data.candidates?.[0];
        if (cand?.finishReason === "SAFETY") throw new ProviderError("refused", "O modelo recusou gerar questões para este texto.");
        out = (cand?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("");
      } else {
        const data = (await getJson(f, "https://api.anthropic.com/v1/messages", {
          method: "POST",
          signal,
          headers: {
            "content-type": "application/json",
            "x-api-key": conn.apiKey,
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true",
          },
          body: JSON.stringify({ model: conn.model, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
        })) as { content?: { type: string; text?: string }[]; stop_reason?: string };
        if (data.stop_reason === "refusal") throw new ProviderError("refused", "O modelo recusou gerar questões para este texto.");
        out = data.content?.filter((c) => c.type === "text").map((c) => c.text ?? "").join("") ?? "";
      }
      return out;
}

/** Provedor de questões que roda no navegador com a conexão do usuário. */
export function browserProvider(conn: AIConnection, f: Fetch = fetch): QuestionProvider {
  return {
    name: conn.provider,
    model: conn.model,
    async generate({ title, text, count }, signal) {
      const out = await completeJson(conn, systemPrompt(count), userPrompt(title, text, count), signal, f);
      try {
        return parseJsonObject(out);
      } catch {
        throw new ProviderError("invalid_output", "O modelo devolveu uma resposta fora do formato esperado.");
      }
    },
  };
}
