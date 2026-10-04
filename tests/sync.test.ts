import { describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { IndexedDbRepository, DEFAULT_SETTINGS } from "@/lib/persistence";
import { syncOnce, type Remote, type RemoteRow } from "@/lib/sync/engine";
import { makeContent, newSession } from "@/lib/session";

/** Conta simulada em memória, com cursor definido pelo "servidor". */
class FakeRemote implements Remote {
  rows = new Map<string, RemoteRow>();
  private clock = 0;
  async updatedAt(keys: { kind: string; id: string }[]) {
    const m = new Map<string, string>();
    keys.forEach((k) => {
      const r = this.rows.get(`${k.kind}|${k.id}`);
      if (r) m.set(`${k.kind}|${k.id}`, r.updated_at);
    });
    return m;
  }
  async upsert(rows: Parameters<Remote["upsert"]>[0]) {
    for (const r of rows) this.rows.set(`${r.kind}|${r.id}`, { ...r, synced_at: String(++this.clock).padStart(8, "0") });
  }
  async changedSince(cursor: string | null, limit: number) {
    return [...this.rows.values()].filter((r) => !cursor || r.synced_at > cursor).sort((a, b) => a.synced_at.localeCompare(b.synced_at)).slice(0, limit);
  }
}

function cursorStore() {
  let c: string | null = null;
  return { get: async () => c, set: async (v: string) => void (c = v) };
}

const content = () => makeContent({ sourceType: "pasted", title: "T", blocks: [{ type: "paragraph", text: "um dois três quatro" }] });

describe("sincronização", () => {
  it("envia alterações locais e as entrega a outro aparelho", async () => {
    const remote = new FakeRemote();
    const a = new IndexedDbRepository(new IDBFactory());
    const b = new IndexedDbRepository(new IDBFactory());
    const c = content();
    await a.putContent(c);
    await a.putSession(newSession(c, DEFAULT_SETTINGS));
    await a.putSettings({ ...DEFAULT_SETTINGS, targetWpm: 425 });
    const r1 = await syncOnce(a, remote, cursorStore());
    expect(r1.pushed).toBe(3);
    expect(await a.listDirty()).toHaveLength(0);
    const r2 = await syncOnce(b, remote, cursorStore());
    expect(r2.pulled).toBe(3);
    expect((await b.getContent(c.id))?.title).toBe("T");
    expect((await b.getSettings()).targetWpm).toBe(425);
    expect(await b.listDirty()).toHaveLength(0); // dados recebidos não voltam a ser enviados
  });

  it("exclusões viajam para os outros aparelhos", async () => {
    const remote = new FakeRemote();
    const a = new IndexedDbRepository(new IDBFactory());
    const b = new IndexedDbRepository(new IDBFactory());
    const ca = cursorStore();
    const cb = cursorStore();
    const c = content();
    await a.putContent(c);
    await a.putSession(newSession(c, DEFAULT_SETTINGS));
    await syncOnce(a, remote, ca);
    await syncOnce(b, remote, cb);
    expect(await b.listSessions()).toHaveLength(1);
    await a.deleteContent(c.id);
    await syncOnce(a, remote, ca);
    await syncOnce(b, remote, cb);
    expect(await b.getContent(c.id)).toBeNull();
    expect(await b.listSessions()).toHaveLength(0);
  });

  it("alteração local pendente não é sobrescrita; a mais nova prevalece", async () => {
    const remote = new FakeRemote();
    const a = new IndexedDbRepository(new IDBFactory());
    const b = new IndexedDbRepository(new IDBFactory());
    const ca = cursorStore();
    const cb = cursorStore();
    const c = content();
    await a.putContent(c);
    await syncOnce(a, remote, ca);
    await syncOnce(b, remote, cb);
    await b.putContent({ ...c, title: "Editado em B" });
    await new Promise((r) => setTimeout(r, 5));
    await a.putContent({ ...c, title: "Editado em A (mais novo)" });
    await syncOnce(a, remote, ca);
    // B tem pendência mais antiga: a conta prevalece e B recebe a versão de A
    await syncOnce(b, remote, cb);
    expect((await b.getContent(c.id))?.title).toBe("Editado em A (mais novo)");
  });

  it("primeiro login envia tudo que já existia no aparelho", async () => {
    const a = new IndexedDbRepository(new IDBFactory());
    const c = content();
    await a.putContent(c);
    const remote = new FakeRemote();
    // simula pendências já enviadas a outra conta e depois limpas
    for (const e of await a.listDirty()) await a.clearDirty(e);
    expect(await a.markAllDirty()).toBe(1);
    expect((await syncOnce(a, remote, cursorStore())).pushed).toBe(1);
  });
});
