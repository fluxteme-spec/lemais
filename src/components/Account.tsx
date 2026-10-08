"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/browser";
import { accountsEnabled } from "@/lib/supabase/env";
import { repo } from "@/lib/persistence";
import { SyncController, type SyncStatus } from "@/lib/sync/client";

export interface Profile {
  id: string;
  display_name: string | null;
  age_confirmed_at: string | null;
  terms_accepted_at: string | null;
  invited_by: string | null;
  blocked: boolean;
  created_at: string;
  donor_since?: string | null;
  donation_claimed_at?: string | null;
}

interface AccountState {
  enabled: boolean;
  loading: boolean;
  user: User | null;
  profile: Profile | null;
  isAdmin: boolean;
  needsOnboarding: boolean;
  blocked: boolean;
  sync: SyncStatus | null;
  syncNow: () => Promise<boolean>;
  refreshProfile: () => Promise<void>;
  signOut: (opts?: { force?: boolean }) => Promise<{ ok: boolean; pending?: number }>;
}

const Ctx = createContext<AccountState | null>(null);
const INVITE_KEY = "lemais-convite";

export function rememberInvite(shareId: string) {
  try {
    localStorage.setItem(INVITE_KEY, shareId);
  } catch {
    /* ignora */
  }
}
export function pendingInvite(): string | null {
  try {
    return localStorage.getItem(INVITE_KEY);
  } catch {
    return null;
  }
}
export function clearInvite() {
  try {
    localStorage.removeItem(INVITE_KEY);
  } catch {
    /* ignora */
  }
}

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const sb = supabase();
  const [loading, setLoading] = useState(accountsEnabled);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [sync, setSync] = useState<SyncStatus | null>(null);
  const [banned, setBanned] = useState(false);
  const controller = useRef<SyncController | null>(null);

  // convite vindo de um link compartilhado
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get("convite");
    if (c && /^[a-z0-9]{6,20}$/.test(c)) rememberInvite(c);
  }, []);

  const loadProfile = useCallback(
    async (u: User | null) => {
      if (!sb || !u) {
        setProfile(null);
        setIsAdmin(false);
        return;
      }
      const { data } = await sb.from("profiles").select("*").eq("id", u.id).maybeSingle();
      setProfile((data as Profile) ?? null);
      fetch("/api/conta/eu")
        .then((r) => r.json())
        .then((b) => setIsAdmin(!!b.admin))
        .catch(() => setIsAdmin(false));
    },
    [sb],
  );

  useEffect(() => {
    if (!sb) return;
    let alive = true;
    sb.auth.getUser().then(async ({ data, error }) => {
      if (!alive) return;
      // conta suspensa pelo painel: o servidor recusa a sessão
      if (error && (error.status === 403 || /banned/i.test(error.message))) {
        setBanned(true);
        await sb.auth.signOut({ scope: "local" }).catch(() => {});
        setLoading(false);
        return;
      }
      setUser(data.user ?? null);
      await loadProfile(data.user ?? null);
      setLoading(false);
    });
    const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION") return;
      const u = session?.user ?? null;
      setUser(u);
      void loadProfile(u);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [sb, loadProfile]);

  const active = !!(user && profile && profile.age_confirmed_at && !profile.blocked && !banned);

  // sincronização e registro de visita
  useEffect(() => {
    if (!sb || !user || !active) return;
    void sb.rpc("touch_last_seen");
    const c = new SyncController(sb, user.id);
    controller.current = c;
    const off = c.onStatus(setSync);
    void c.start();
    return () => {
      off();
      c.stop();
      controller.current = null;
    };
  }, [sb, user, active]);

  const syncNow = useCallback(async () => {
    const r = await controller.current?.run();
    return !!r;
  }, []);

  const signOut = useCallback(
    async (opts?: { force?: boolean }) => {
      if (!sb) return { ok: true };
      if (controller.current && !opts?.force) {
        await controller.current.run();
        const pending = (await repo().listDirty().catch(() => [])).length;
        if (pending > 0) return { ok: false, pending };
      }
      controller.current?.stop();
      await sb.auth.signOut();
      // os dados ficam na conta; este aparelho volta a ficar limpo para outra pessoa
      await repo().clearAll().catch(() => {});
      window.location.href = "/";
      return { ok: true };
    },
    [sb],
  );

  const value = useMemo<AccountState>(
    () => ({
      enabled: accountsEnabled,
      loading,
      user,
      profile,
      isAdmin,
      needsOnboarding: !!(user && profile && !profile.age_confirmed_at),
      blocked: banned || !!profile?.blocked,
      sync,
      syncNow,
      refreshProfile: () => loadProfile(user),
      signOut,
    }),
    [loading, user, profile, isAdmin, sync, syncNow, loadProfile, signOut, banned],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAccount(): AccountState {
  const c = useContext(Ctx);
  if (!c) throw new Error("AccountProvider ausente");
  return c;
}

/** Recarrega dados de uma página quando a sincronização trouxer novidades. */
export function useOnSynced(fn: () => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const h = () => ref.current();
    window.addEventListener("lemais:synced", h);
    return () => window.removeEventListener("lemais:synced", h);
  }, []);
}
