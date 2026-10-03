import { describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { IndexedDbRepository, DEFAULT_SETTINGS, StorageError } from "@/lib/persistence";
import { makeContent, newSession } from "@/lib/session";
import { TRAINING_TEXTS, curatedQuestionSet } from "@/lib/training";

const fresh = () => new IndexedDbRepository(new IDBFactory());

describe("persistência local", () => {
  it("gravações idempotentes não duplicam sessões", async () => {
    const r = fresh();
    const c = makeContent({ sourceType: "pasted", title: "T", blocks: [{ type: "paragraph", text: "um dois três" }] });
    await r.putContent(c);
    const s = newSession(c, DEFAULT_SETTINGS);
    await r.putSession(s);
    await r.putSession({ ...s, currentTokenIndex: 2 });
    const list = await r.listSessions();
    expect(list).toHaveLength(1);
    expect(list[0].currentTokenIndex).toBe(2);
  });

  it("excluir conteúdo remove sessões, questionários e tentativas", async () => {
    const r = fresh();
    const t = TRAINING_TEXTS[0];
    const c = makeContent({ sourceType: "training", title: t.title, blocks: t.blocks, trainingId: t.id });
    await r.putContent(c);
    const s = newSession(c, DEFAULT_SETTINGS);
    await r.putSession(s);
    const qs = curatedQuestionSet(c)!;
    await r.putQuestionSet(qs);
    await r.putAttempt({ id: "a1", sessionId: s.id, questionSetId: qs.id, answers: [], correctCount: null, questionCount: 4, score: null, consultedText: false, attemptNumber: 1, reportedQuestionIds: [], startedAt: "", finishedAt: null });
    expect(await r.findQuestionSet(c.id, c.contentHash)).not.toBeNull();
    expect(await r.findQuestionSet(c.id, "outro-hash")).toBeNull();
    await r.deleteContent(c.id);
    expect(await r.getContent(c.id)).toBeNull();
    expect(await r.listSessions()).toHaveLength(0);
    expect(await r.listAttempts()).toHaveLength(0);
    expect(await r.getQuestionSet(qs.id)).toBeNull();
  });

  it("configurações têm padrão e limpeza total apaga tudo", async () => {
    const r = fresh();
    expect(await r.getSettings()).toEqual(DEFAULT_SETTINGS);
    await r.putSettings({ ...DEFAULT_SETTINGS, targetWpm: 450 });
    expect((await r.getSettings()).targetWpm).toBe(450);
    await r.clearAll();
    expect((await r.getSettings()).targetWpm).toBe(DEFAULT_SETTINGS.targetWpm);
  });

  it("informa claramente quando o armazenamento não existe", async () => {
    const r = new IndexedDbRepository(undefined);
    await expect(r.listSessions()).rejects.toBeInstanceOf(StorageError);
  });
});
