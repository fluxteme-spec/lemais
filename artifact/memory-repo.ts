/** Armazenamento em memória, usado quando o navegador bloqueia o IndexedDB na página de teste. */
import { DEFAULT_SETTINGS, type DirtyEntry, type Repository } from "@/lib/persistence";
import type { Content, QuestionSet, QuizAttempt, ReadingSession, ReadingSettings } from "@/lib/types";

export class MemoryRepository implements Repository {
  contents = new Map<string, Content>();
  sessions = new Map<string, ReadingSession>();
  sets = new Map<string, QuestionSet>();
  attempts = new Map<string, QuizAttempt>();
  kv = new Map<string, unknown>();

  async putContent(c: Content) { this.contents.set(c.id, structuredClone(c)); }
  async getContent(id: string) { return structuredClone(this.contents.get(id) ?? null); }
  async findContentByTraining(t: string) {
    return [...this.contents.values()].filter((c) => c.trainingId === t).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
  }
  async listContents() { return [...this.contents.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
  async deleteContent(id: string) {
    for (const s of [...this.sessions.values()].filter((s) => s.contentId === id)) await this.deleteSession(s.id);
    for (const q of [...this.sets.values()].filter((q) => q.contentId === id)) this.sets.delete(q.id);
    this.contents.delete(id);
  }
  async putSession(s: ReadingSession) { this.sessions.set(s.id, structuredClone(s)); }
  async getSession(id: string) { return structuredClone(this.sessions.get(id) ?? null); }
  async listSessions() { return [...this.sessions.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt)); }
  async deleteSession(id: string) {
    for (const a of [...this.attempts.values()].filter((a) => a.sessionId === id)) this.attempts.delete(a.id);
    this.sessions.delete(id);
  }
  async putQuestionSet(q: QuestionSet) { this.sets.set(q.id, structuredClone(q)); }
  async getQuestionSet(id: string) { return structuredClone(this.sets.get(id) ?? null); }
  async findQuestionSet(contentId: string, hash: string) {
    return [...this.sets.values()].find((q) => q.contentId === contentId && q.contentHash === hash) ?? null;
  }
  async putAttempt(a: QuizAttempt) { this.attempts.set(a.id, structuredClone(a)); }
  async listAttempts(sessionId?: string) { return [...this.attempts.values()].filter((a) => !sessionId || a.sessionId === sessionId); }
  async getSettings() { return { ...DEFAULT_SETTINGS, ...((this.kv.get("settings") as ReadingSettings) ?? {}) }; }
  async putSettings(s: ReadingSettings) { this.kv.set("settings", { ...s }); }
  async getFlag(k: string) { return this.kv.get(`flag:${k}`) ?? null; }
  async setFlag(k: string, v: unknown) { this.kv.set(`flag:${k}`, v); }
  async clearAll() {
    this.contents.clear(); this.sessions.clear(); this.sets.clear(); this.attempts.clear(); this.kv.clear();
  }
  async listDirty(): Promise<DirtyEntry[]> { return []; }
  async clearDirty() {}
  async getRaw() { return null; }
  async applyRemote() { return false; }
  async markAllDirty() { return 0; }
}
