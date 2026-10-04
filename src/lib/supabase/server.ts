import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { accountsEnabled, adminEmails, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./env";

/** Cliente com a sessão do usuário (cookies). */
export async function serverSupabase(): Promise<SupabaseClient | null> {
  if (!accountsEnabled) return null;
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // chamado a partir de um Server Component: o proxy renova a sessão
        }
      },
    },
  });
}

/** Cliente com a chave secreta. Usar só depois de verificar permissões. */
export function adminSupabase(): SupabaseClient {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!accountsEnabled || !key) throw new Error("SUPABASE_SECRET_KEY não configurada.");
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function currentUser(): Promise<User | null> {
  const sb = await serverSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  return data.user ?? null;
}

export function isAdminUser(user: User | null): boolean {
  if (!user?.email) return false;
  const confirmed = Boolean(user.email_confirmed_at || user.confirmed_at);
  return confirmed && adminEmails().includes(user.email.toLowerCase());
}

/** Lança erro se a pessoa atual não for administradora. */
export async function requireAdmin(): Promise<User> {
  const user = await currentUser();
  if (!isAdminUser(user)) throw new Error("Acesso restrito.");
  return user!;
}
