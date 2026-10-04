/**
 * Sincronização entre o armazenamento local (IndexedDB) e a conta (Supabase).
 *
 * - Cada alteração local fica marcada como pendente (com data/hora) até ser enviada.
 * - Envio: registros pendentes são gravados na conta, exceto quando a conta tem uma
 *   versão mais nova (alteração feita em outro aparelho depois) — nesse caso vale a mais nova.
 * - Recebimento: busca o que mudou na conta desde o último cursor (definido pelo servidor)
 *   e aplica localmente, sem sobrescrever alterações locais ainda não enviadas.
 * - Exclusões viajam como marcações ("deleted"), para que outros aparelhos também apaguem.
 */
import type { DirtyEntry, Repository, SyncKind } from "@/lib/persistence";

export interface RemoteRow {
  kind: SyncKind;
  id: string;
  data: unknown | null;
  deleted: boolean;
  updated_at: string;
  synced_at: string;
}

export interface Remote {
  /** Datas de atualização na conta para os registros informados. */
  updatedAt(keys: { kind: SyncKind; id: string }[]): Promise<Map<string, string>>;
  upsert(rows: { kind: SyncKind; id: string; data: unknown | null; deleted: boolean; updated_at: string }[]): Promise<void>;
  /** Registros alterados depois do cursor, em ordem, no máximo `limit`. */
  changedSince(cursor: string | null, limit: number): Promise<RemoteRow[]>;
}

export interface CursorStore {
  get(): Promise<string | null>;
  set(cursor: string): Promise<void>;
}

export interface SyncResult {
  pushed: number;
  pulled: number;
  skippedOlder: number;
}

const k = (kind: string, id: string) => `${kind}|${id}`;
const BATCH = 50;

export async function syncOnce(repo: Repository, remote: Remote, cursor: CursorStore): Promise<SyncResult> {
  let pushed = 0;
  let skippedOlder = 0;

  // ---- envio ----
  const dirty = await repo.listDirty();
  for (let i = 0; i < dirty.length; i += BATCH) {
    const batch = dirty.slice(i, i + BATCH);
    const remoteDates = await remote.updatedAt(batch);
    const rows: Parameters<Remote["upsert"]>[0] = [];
    const sent: DirtyEntry[] = [];
    for (const e of batch) {
      const remoteAt = remoteDates.get(k(e.kind, e.id));
      if (remoteAt && remoteAt > e.at) {
        // a conta tem versão mais nova: descarta a pendência para o recebimento aplicar a da conta
        skippedOlder++;
        await repo.clearDirty(e);
        continue;
      }
      const data = e.deleted ? null : await repo.getRaw(e.kind, e.id);
      if (!e.deleted && data == null) {
        await repo.clearDirty(e);
        continue;
      }
      rows.push({ kind: e.kind, id: e.id, data, deleted: e.deleted, updated_at: e.at });
      sent.push(e);
    }
    if (rows.length) await remote.upsert(rows);
    for (const e of sent) await repo.clearDirty(e);
    pushed += sent.length;
  }

  // ---- recebimento ----
  let pulled = 0;
  let cur = await cursor.get();
  for (;;) {
    const rows = await remote.changedSince(cur, 200);
    for (const r of rows) {
      if (await repo.applyRemote(r.kind, r.id, r.deleted ? null : r.data)) pulled++;
    }
    if (!rows.length) break;
    cur = rows[rows.length - 1].synced_at;
    await cursor.set(cur);
    if (rows.length < 200) break;
  }
  return { pushed, pulled, skippedOlder };
}
