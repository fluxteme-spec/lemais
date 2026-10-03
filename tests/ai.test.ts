import { describe, expect, it } from "vitest";
import { browserProvider, listModels, suggestModel, type AIConnection } from "@/lib/ai/providers";
import { buildAuthUrl, challengeFor, exchangeCode } from "@/lib/ai/oauth";
import { generateQuestionSet } from "@/lib/comprehension/generate";
import { TRAINING_TEXTS } from "@/lib/training";

const quizJson = JSON.stringify({ questions: TRAINING_TEXTS[2].questions });
const input = { contentId: "c", contentVersion: 1, title: "Ilhas", blocks: TRAINING_TEXTS[2].blocks };

function mockFetch(handler: (url: string, init: RequestInit) => { status?: number; body: unknown }) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    const r = handler(url, init);
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { f, calls };
}

const conn = (provider: AIConnection["provider"], model: string): AIConnection => ({ provider, apiKey: "k", model, connectedAt: "" });

describe("IA do usuário no navegador", () => {
  it("OpenRouter/OpenAI: formato chat completions, sem passar pelo servidor", async () => {
    for (const p of ["openrouter", "openai"] as const) {
      const { f, calls } = mockFetch(() => ({ body: { choices: [{ message: { content: "```json\n" + quizJson + "\n```" } }] } }));
      const set = await generateQuestionSet(browserProvider(conn(p, "m"), f), input, 120);
      expect(set.questions).toHaveLength(5);
      expect(calls[0].url).toMatch(p === "openrouter" ? /^https:\/\/openrouter\.ai\// : /^https:\/\/api\.openai\.com\//);
      const body = JSON.parse(String(calls[0].init.body));
      expect(body.messages[0].role).toBe("system");
      expect(body.messages[1].content).toContain("<documento>");
      expect(set.providerMetadata).toEqual({ provider: p, model: "m" });
    }
  });

  it("Gemini: chave no cabeçalho (nunca na URL) e partes de raciocínio ignoradas", async () => {
    const { f, calls } = mockFetch(() => ({
      body: { candidates: [{ content: { parts: [{ text: "pensando…", thought: true }, { text: quizJson }] }, finishReason: "STOP" }] },
    }));
    const set = await generateQuestionSet(browserProvider(conn("gemini", "gemini-x-flash"), f), input, 120);
    expect(set.questions.length).toBeGreaterThanOrEqual(3);
    expect(calls[0].url).not.toContain("key=");
    expect((calls[0].init.headers as Record<string, string>)["x-goog-api-key"]).toBe("k");
  });

  it("Anthropic: cabeçalho de acesso direto do navegador", async () => {
    const { f, calls } = mockFetch(() => ({ body: { content: [{ type: "text", text: quizJson }] } }));
    await generateQuestionSet(browserProvider(conn("anthropic", "claude-x"), f), input, 120);
    expect((calls[0].init.headers as Record<string, string>)["anthropic-dangerous-direct-browser-access"]).toBe("true");
  });

  it("erros do provedor viram mensagens claras", async () => {
    const { f } = mockFetch(() => ({ status: 402, body: {} }));
    await expect(generateQuestionSet(browserProvider(conn("openrouter", "m"), f), input, 120)).rejects.toThrow(/créditos/);
    const bad = mockFetch(() => ({ status: 401, body: {} }));
    await expect(listModels("openai", "x", bad.f)).rejects.toThrow(/chave foi recusada/);
  });

  it("lista modelos e sugere um modelo econômico sem nomes fixos", async () => {
    const { f } = mockFetch((url) =>
      url.includes("generativelanguage")
        ? {
            body: {
              models: [
                { name: "models/gemini-9.0-pro", supportedGenerationMethods: ["generateContent"] },
                { name: "models/gemini-9.0-flash", supportedGenerationMethods: ["generateContent"] },
                { name: "models/gemini-9.0-flash-image", supportedGenerationMethods: ["generateContent"] },
                { name: "models/text-embedding-9", supportedGenerationMethods: ["embedContent"] },
              ],
            },
          }
        : { body: {} },
    );
    const list = await listModels("gemini", "k", f);
    expect(list.map((m) => m.id)).toEqual(["gemini-9.0-pro", "gemini-9.0-flash"]);
    expect(suggestModel("gemini", list)).toBe("gemini-9.0-flash");
    expect(suggestModel("openai", [{ id: "gpt-9", label: "" }, { id: "gpt-9-mini", label: "" }])).toBe("gpt-9-mini");
    expect(suggestModel("anthropic", [{ id: "claude-opus-9", label: "" }, { id: "claude-haiku-9", label: "" }])).toBe("claude-haiku-9");
    expect(suggestModel("openrouter", [{ id: "x/y", label: "" }])).toBe("x/y");
  });
});

describe("login OpenRouter (PKCE)", () => {
  it("calcula o code_challenge S256 conforme a RFC 7636", async () => {
    expect(await challengeFor("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("monta a URL de login e troca o código usando o verificador guardado", async () => {
    const mem = new Map<string, string>();
    const storage = { setItem: (k: string, v: string) => void mem.set(k, v), getItem: (k: string) => mem.get(k) ?? null, removeItem: (k: string) => void mem.delete(k) };
    const url = new URL(await buildAuthUrl("http://localhost:3000", storage));
    expect(url.origin).toBe("https://openrouter.ai");
    expect(url.searchParams.get("callback_url")).toBe("http://localhost:3000/conectar-ia/retorno");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    const state = url.searchParams.get("state");
    const { f, calls } = mockFetch(() => ({ body: { key: "sk-or-abc" } }));
    expect(await exchangeCode("codigo", state, storage, f)).toBe("sk-or-abc");
    const body = JSON.parse(String(calls[0].init.body));
    expect(await challengeFor(body.code_verifier)).toBe(url.searchParams.get("code_challenge"));
    // verificador é de uso único
    await expect(exchangeCode("codigo", state, storage, f)).rejects.toThrow(/expirou/);
  });

  it("rejeita state divergente", async () => {
    const mem = new Map<string, string>();
    const storage = { setItem: (k: string, v: string) => void mem.set(k, v), getItem: (k: string) => mem.get(k) ?? null, removeItem: (k: string) => void mem.delete(k) };
    await buildAuthUrl("http://localhost:3000", storage);
    const { f } = mockFetch(() => ({ body: { key: "x" } }));
    await expect(exchangeCode("c", "outro", storage, f)).rejects.toThrow(/não confere/);
  });
});
