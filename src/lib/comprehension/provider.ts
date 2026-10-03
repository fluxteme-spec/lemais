/**
 * Interface de provedor para geração de questões (somente no servidor).
 * Implementação incluída: Anthropic Messages API, ativada por ANTHROPIC_API_KEY.
 * O texto do usuário é tratado como DADO: vai delimitado e o modelo não recebe ferramentas.
 */
import { AI } from "@/lib/config";
import { parseJsonObject, systemPrompt, userPrompt } from "./prompt";

export interface QuestionProvider {
  readonly name: string;
  readonly model: string;
  generate(input: { title: string; text: string; count: number }, signal: AbortSignal): Promise<unknown>;
}

export class ProviderError extends Error {
  constructor(public code: "timeout" | "invalid_output" | "upstream" | "refused", message: string) {
    super(message);
  }
}

export class AnthropicProvider implements QuestionProvider {
  readonly name = "anthropic";
  constructor(private apiKey: string, readonly model: string) {}

  async generate(input: { title: string; text: string; count: number }, signal: AbortSignal): Promise<unknown> {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: AI.maxOutputTokens,
        temperature: 0.3,
        system: systemPrompt(input.count),
        messages: [
          {
            role: "user",
            content: userPrompt(input.title, input.text, input.count),
          },
        ],
      }),
    }).catch((e) => {
      if (signal.aborted) throw new ProviderError("timeout", "A geração demorou demais.");
      throw new ProviderError("upstream", `Falha de conexão com o provedor: ${(e as Error).name}`);
    });
    if (!res.ok) throw new ProviderError("upstream", `Provedor respondeu ${res.status}.`);
    const data = (await res.json()) as { content?: { type: string; text?: string }[]; stop_reason?: string };
    if (data.stop_reason === "refusal") throw new ProviderError("refused", "O provedor recusou gerar questões para este texto.");
    const text = data.content?.find((c) => c.type === "text")?.text ?? "";
    try {
      return parseJsonObject(text);
    } catch {
      throw new ProviderError("invalid_output", "O provedor devolveu uma resposta que não é JSON válido.");
    }
  }
}

export function getProvider(): QuestionProvider | null {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) return null;
  return new AnthropicProvider(key, process.env.ANTHROPIC_MODEL?.trim() || "claude-haiku-4-5-20251001");
}
