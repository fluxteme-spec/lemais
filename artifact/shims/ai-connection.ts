import { getSample } from "../claude-ai";

/** Na página de teste, a "IA conectada" é o Claude de quem está usando. */
export async function getConnection() {
  const s = await getSample();
  return s ? { provider: "claude", apiKey: "", model: "Claude", connectedAt: "" } : null;
}
export async function saveConnection() {}
export async function removeConnection() {}
