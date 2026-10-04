"use client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { onLocalChange, repo, type SyncKind } from "@/lib/persistence";
import { syncOnce, type CursorStore, type Remote, type RemoteRow, type SyncResult } from "./engine";

export function supabaseRemote(sb: SupabaseClient, userId: string): Remote {
  return {
    async updatedAt(keys) {
      const map = new Map<string, string>();
      const byKind = new Map<SyncKind, string[]>();
      keys.forEach((x) => byKind.set(x.kind, [...(byKind.get(x.kind) ?? []), x.id]));
      for (const [kind, ids] of byKind) {
        const { data, error } = await sb.from("user_records").select("id, updated_at").eq("user_id", userId).eq("kind", kind).in("id", ids);
        if (error) throw error;
        (data ?? []).forEach((r) => map.set(`${kind}|${r.id}`, new Date(r.updated_at).toISOString()));
      }
      return map;
    },
    async upsert(rows) {
      const { error } = await sb.from("user_records").upsert(
        rows.map((r) => ({ ...r, user_id: userId })),
        { onConflict: "user_id,kind,id" },
      );
      if (error) throw error;
    },
    async changedSince(cursor, limit) {
      let q = sb.from("user_records").select("kind, id, data, deleted, updated_at, synced_at").eq("user_id", userId).order("synced_at").limit(limit);
      if (cursor) q = q.gt("synced_at", cursor);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as RemoteRow[];
    },
  };
}

function cursorFor(userId: string): CursorStore {
  return {
    get: async () => ((await repo().getFlag(`syncCursor:${userId}`)) as string | null) ?? null,
    set: (c) => repo().setFlag(`syncCursor:${userId}`, c),
  };
}

export type SyncStatus =
  | { state: "idle"; lastAt: string | null }
  | { state: "syncing" }
  | { state: "error"; message: string; lastAt: string | null };

/** Agenda e executa a sincronização para o usuário conectado. */
export class SyncController {
  private running: Promise<SyncResult | null> | null = null;
  private again = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  private unsub: (() => void) | null = null;
  private status: SyncStatus = { state: "idle", lastAt: null };
  private listeners = new Set<(s: SyncStatus) => void>();

  constructor(private sb: SupabaseClient, private userId: string) {}

  async start() {
    // primeiro login neste navegador: envia o que já existia localmente
    const flag = `syncBootstrapped:${this.userId}`;
    if (!(await repo().getFlag(flag))) {
      await repo().markAllDirty();
      await repo().setFlag(flag, true);
    }
    this.unsub = onLocalChange(() => this.schedule(4000));
    this.interval = setInterval(() => document.visibilityState === "visible" && this.schedule(0), 60_000);
    document.addEventListener("visibilitychange", this.onVisibility);
    return this.run();
  }

  stop() {
    this.unsub?.();
    if (this.interval) clearInterval(this.interval);
    if (this.timer) clearTimeout(this.timer);
    document.removeEventListener("visibilitychange", this.onVisibility);
  }

  private onVisibility = () => {
    this.schedule(document.visibilityState === "hidden" ? 0 : 500);
  };

  onStatus(fn: (s: SyncStatus) => void) {
    this.listeners.add(fn);
    fn(this.status);
    return () => this.listeners.delete(fn);
  }

  private setStatus(s: SyncStatus) {
    this.status = s;
    this.listeners.forEach((l) => l(s));
  }

  schedule(delayMs: number) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.run(), delayMs);
  }

  /** Executa agora (ou ao fim da execução em andamento). */
  run(): Promise<SyncResult | null> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      if (typeof navigator !== "undefined" && !navigator.onLine) return null;
      this.setStatus({ state: "syncing" });
      try {
        const r = await syncOnce(repo(), supabaseRemote(this.sb, this.userId), cursorFor(this.userId));
        this.setStatus({ state: "idle", lastAt: new Date().toISOString() });
        if (r.pulled > 0) window.dispatchEvent(new CustomEvent("lemais:synced"));
        return r;
      } catch {
        const lastAt = "lastAt" in this.status ? this.status.lastAt : null;
        this.setStatus({ state: "error", message: "Não foi possível sincronizar agora. Seus dados continuam salvos neste aparelho.", lastAt });
        return null;
      }
    })().finally(() => {
      this.running = null;
      if (this.again) {
        this.again = false;
        this.schedule(1000);
      }
    });
    return this.running;
  }
}
