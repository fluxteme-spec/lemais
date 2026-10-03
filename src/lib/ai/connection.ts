"use client";
/** Conexão de IA do usuário, guardada somente neste navegador. */
import { repo } from "@/lib/persistence";
import type { AIConnection } from "./providers";

const KEY = "aiConnection";

export async function getConnection(): Promise<AIConnection | null> {
  const v = (await repo().getFlag(KEY).catch(() => null)) as AIConnection | null;
  return v && v.apiKey && v.model ? v : null;
}

export async function saveConnection(c: AIConnection): Promise<void> {
  await repo().setFlag(KEY, c);
}

export async function removeConnection(): Promise<void> {
  await repo().setFlag(KEY, null);
  await repo().setFlag("aiConsent", null);
}
