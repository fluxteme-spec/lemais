import { adminSupabase, currentUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Exclui a conta da pessoa autenticada e todos os dados dela (cascata no banco). */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (body?.confirmacao !== "EXCLUIR") return Response.json({ ok: false, message: "Confirmação ausente." }, { status: 400 });
  const user = await currentUser();
  if (!user) return Response.json({ ok: false, message: "Entre na conta para excluí-la." }, { status: 401 });
  const { error } = await adminSupabase().auth.admin.deleteUser(user.id);
  if (error) return Response.json({ ok: false, message: "Não foi possível excluir a conta agora." }, { status: 500 });
  return Response.json({ ok: true });
}
