import { adminSupabase } from "@/lib/supabase/server";
import { AdminButton } from "../AdminButton";
import { deleteUser, setBlocked, setDonor } from "../actions";

export const dynamic = "force-dynamic";

interface ProfileRow {
  id: string;
  display_name: string | null;
  blocked: boolean;
  created_at: string;
  last_seen_at: string;
  visit_days: number;
  age_confirmed_at: string | null;
  invited_by: string | null;
  donor_since: string | null;
  donation_claimed_at: string | null;
}

const fmt = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { dateStyle: "short" });

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ q?: string; pagina?: string }> }) {
  const { q = "", pagina = "1" } = await searchParams;
  const page = Math.max(1, Number(pagina) || 1);
  const sb = adminSupabase();
  const { data: list } = await sb.auth.admin.listUsers({ page, perPage: 200 });
  const users = (list?.users ?? []).filter((u) => !q || (u.email ?? "").toLowerCase().includes(q.toLowerCase()));
  const { data: profiles } = await sb
    .from("profiles")
    .select("*")
    .in("id", users.map((u) => u.id).length ? users.map((u) => u.id) : ["00000000-0000-0000-0000-000000000000"]);
  const byId = new Map((profiles as ProfileRow[] | null)?.map((p) => [p.id, p]) ?? []);
  const { data: readings } = await sb
    .from("user_records")
    .select("user_id")
    .eq("kind", "session")
    .eq("deleted", false)
    .in("user_id", users.map((u) => u.id).length ? users.map((u) => u.id) : ["00000000-0000-0000-0000-000000000000"]);
  const readCount = new Map<string, number>();
  (readings ?? []).forEach((r) => readCount.set(r.user_id, (readCount.get(r.user_id) ?? 0) + 1));

  return (
    <div>
      <h1 className="font-serif text-3xl font-bold">Usuários</h1>
      <form className="mt-4 flex flex-wrap gap-2" role="search">
        <label className="flex-1">
          <span className="sr-only">Buscar por e-mail</span>
          <input name="q" defaultValue={q} placeholder="Buscar por e-mail" className="field" />
        </label>
        <button className="btn">Buscar</button>
      </form>
      <p className="mt-2 text-sm text-muted">
        Página {page}. {users.length} {users.length === 1 ? "usuário" : "usuários"} nesta página.
      </p>
      <ul className="mt-4 divide-y divide-line border-y border-line">
        {users.map((u) => {
          const p = byId.get(u.id);
          const provider = (u.app_metadata?.provider as string | undefined) ?? "email";
          return (
            <li key={u.id} className="py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold break-all">{u.email ?? "(sem e-mail)"}</p>
                  <p className="text-sm text-muted">
                    {p?.display_name ?? "—"} · {provider === "google" ? "Google" : "E-mail"} · desde {fmt(u.created_at)}
                  </p>
                  <p className="text-sm">
                    Último acesso {p ? fmt(p.last_seen_at) : "—"} · {p?.visit_days ?? 0} {p?.visit_days === 1 ? "dia de uso" : "dias de uso"} ·{" "}
                    {readCount.get(u.id) ?? 0} leituras
                    {p?.invited_by ? " · veio por convite" : ""}
                    {!p?.age_confirmed_at ? " · cadastro incompleto" : ""}
                    {p?.blocked ? " · SUSPENSO" : ""}
                    {p?.donor_since ? " · ★ DOADOR" : p?.donation_claimed_at ? ` · pediu a medalha de doador em ${fmt(p.donation_claimed_at)}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <AdminButton action={setDonor.bind(null, u.id, !p?.donor_since)} label={p?.donor_since ? "Remover medalha" : "Conceder medalha"} />
                  <AdminButton
                    action={setBlocked.bind(null, u.id, !p?.blocked)}
                    label={p?.blocked ? "Reativar" : "Suspender"}
                    confirmText={p?.blocked ? undefined : `Suspender ${u.email}? A pessoa não conseguirá entrar.`}
                  />
                  <AdminButton
                    action={deleteUser.bind(null, u.id)}
                    label="Excluir"
                    danger
                    confirmText={`Excluir ${u.email} e todos os dados? Não é possível desfazer.`}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex gap-3">
        {page > 1 && (
          <a className="btn" href={`/admin/usuarios?pagina=${page - 1}&q=${encodeURIComponent(q)}`}>
            Página anterior
          </a>
        )}
        {(list?.users.length ?? 0) === 200 && (
          <a className="btn" href={`/admin/usuarios?pagina=${page + 1}&q=${encodeURIComponent(q)}`}>
            Próxima página
          </a>
        )}
      </div>
    </div>
  );
}
