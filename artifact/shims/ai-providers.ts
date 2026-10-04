import { ProviderError } from "@/lib/comprehension/provider";
import { systemPrompt, userPrompt } from "@/lib/comprehension/prompt";
import { getSample, sampleMessage } from "../claude-ai";

export const PROVIDERS: Record<string, { id: string; name: string; keyUrl: string | null; keyHint: string; keyPattern: RegExp }> = {
  claude: { id: "claude", name: "Claude", keyUrl: null, keyHint: "", keyPattern: /./ },
};

export async function listModels() {
  return [{ id: "Claude", label: "Claude" }];
}
export function suggestModel() {
  return "Claude";
}

export async function completeJson(_conn: unknown, system: string, user: string): Promise<string> {
  const sample = await getSample();
  if (!sample) throw new ProviderError("upstream", "O Claude não está disponível nesta página.");
  try {
    const r = await sample(`${system}\n\n${user}`);
    return r.text;
  } catch (e) {
    const code = (e as { code?: string })?.code;
    throw new ProviderError(code === "refused" || code === "not_granted" ? "refused" : "upstream", sampleMessage(code));
  }
}

export function browserProvider() {
  return {
    name: "claude",
    model: "Claude",
    async generate({ title, text, count }: { title: string; text: string; count: number }) {
      const sample = await getSample();
      if (!sample) throw new ProviderError("upstream", "O Claude não está disponível nesta página.");
      try {
        return await sample.json(`${systemPrompt(count)}\n\n${userPrompt(title, text, count)}`, { cache: false });
      } catch (e) {
        const code = (e as { code?: string })?.code;
        if (code === "invalid_json") throw new ProviderError("invalid_output", sampleMessage(code));
        throw new ProviderError(code === "refused" || code === "not_granted" ? "refused" : "upstream", sampleMessage(code));
      }
    },
  };
}
