import { ADAPT_OPTIONS, AdaptError, adaptWith, splitForAdaptation } from "../../src/lib/ai/adapt";
import { completeJson } from "./ai-providers";
import { ProviderError } from "@/lib/comprehension/provider";
import type { AdaptStyle, TextBlock } from "@/lib/types";

export { ADAPT_OPTIONS, AdaptError, splitForAdaptation };

export async function adaptText(_conn: unknown, blocks: TextBlock[], style: AdaptStyle, onProgress?: (d: number, t: number) => void) {
  try {
    return await adaptWith((system, user) => completeJson(null, system, user), blocks, style, onProgress);
  } catch (e) {
    if (e instanceof ProviderError) throw new AdaptError(e.message);
    throw e;
  }
}
