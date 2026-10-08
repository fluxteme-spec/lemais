"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adminSupabase, requireAdmin } from "@/lib/supabase/server";
import { parsePlainText, tokenize, validateText } from "@/lib/text";
import { validateQuestions } from "@/lib/comprehension/validate";
import { AI } from "@/lib/config";

export interface ActionResult {
  ok: boolean;
  message: string;
}

const fail = (message: string): ActionResult => ({ ok: false, message });

// ---------- Usuários ----------

export async function setBlocked(userId: string, blocked: boolean): Promise<ActionResult> {
  const me = await requireAdmin();
  if (!z.string().uuid().safeParse(userId).success) return fail("Usuário inválido.");
  if (userId === me.id) return fail("Você não pode suspender a própria conta.");
  const sb = adminSupabase();
  const { error } = await sb.from("profiles").update({ blocked }).eq("id", userId);
  if (error) return fail("Não foi possível alterar o usuário.");
  // impede novos logins enquanto suspenso
  await sb.auth.admin.updateUserById(userId, {
    ban_duration: blocked ? "876000h" : "none",
  });
  revalidatePath("/admin/usuarios");
  return {
    ok: true,
    message: blocked ? "Usuário suspenso." : "Suspensão removida.",
  };
}

export async function setDonor(userId: string, donor: boolean): Promise<ActionResult> {
  await requireAdmin();
  if (!z.string().uuid().safeParse(userId).success) return fail("Usuário inválido.");
  const { error } = await adminSupabase()
    .from("profiles")
    .update({ donor_since: donor ? new Date().toISOString() : null })
    .eq("id", userId);
  if (error) return fail("Não foi possível alterar a medalha.");
  revalidatePath("/admin/usuarios");
  return {
    ok: true,
    message: donor ? "Medalha de doador concedida." : "Medalha removida.",
  };
}

export async function deleteUser(userId: string): Promise<ActionResult> {
  const me = await requireAdmin();
  if (!z.string().uuid().safeParse(userId).success) return fail("Usuário inválido.");
  if (userId === me.id) return fail("Use Minha conta para excluir a própria conta.");
  const { error } = await adminSupabase().auth.admin.deleteUser(userId);
  if (error) return fail("Não foi possível excluir o usuário.");
  revalidatePath("/admin/usuarios");
  revalidatePath("/admin");
  return {
    ok: true,
    message: "Usuário e todos os dados dele foram excluídos.",
  };
}

// ---------- Propagandas ----------

const PLACEMENTS = ["home", "resultado", "progresso", "treinar"] as const;
const httpsUrl = z
  .string()
  .trim()
  .url()
  .refine((u) => u.startsWith("https://"), "Use um endereço https://");

const AdSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1, "Informe o título.").max(80),
  body: z.string().trim().max(200).optional(),
  image_url: z.union([httpsUrl, z.literal("")]).optional(),
  link_url: z
    .string()
    .trim()
    .url("Informe o link de destino.")
    .refine((u) => /^https?:\/\//.test(u), "Link inválido."),
  cta: z.string().trim().max(30).optional(),
  placements: z.array(z.enum(PLACEMENTS)).min(1, "Escolha ao menos um local."),
  starts_at: z.string().optional(),
  ends_at: z.string().optional(),
  active: z.boolean(),
});

function toIso(v?: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export async function saveAd(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = AdSchema.safeParse({
    id: (form.get("id") as string) || undefined,
    title: form.get("title"),
    body: (form.get("body") as string) || undefined,
    image_url: (form.get("image_url") as string) ?? "",
    link_url: form.get("link_url"),
    cta: (form.get("cta") as string) || undefined,
    placements: form.getAll("placements"),
    starts_at: (form.get("starts_at") as string) || undefined,
    ends_at: (form.get("ends_at") as string) || undefined,
    active: form.get("active") === "on",
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  const d = parsed.data;
  const row = {
    title: d.title,
    body: d.body ?? null,
    image_url: d.image_url || null,
    link_url: d.link_url,
    cta: d.cta ?? null,
    placements: d.placements,
    starts_at: toIso(d.starts_at),
    ends_at: toIso(d.ends_at),
    active: d.active,
  };
  if (row.starts_at && row.ends_at && row.ends_at <= row.starts_at) return fail("O fim precisa ser depois do início.");
  const sb = adminSupabase();
  const { error } = d.id ? await sb.from("ads").update(row).eq("id", d.id) : await sb.from("ads").insert(row);
  if (error) return fail("Não foi possível salvar a propaganda.");
  revalidatePath("/admin/propagandas");
  return {
    ok: true,
    message: d.id ? "Propaganda atualizada." : "Propaganda criada.",
  };
}

export async function toggleAd(id: string, active: boolean): Promise<ActionResult> {
  await requireAdmin();
  const { error } = await adminSupabase().from("ads").update({ active }).eq("id", id);
  if (error) return fail("Não foi possível alterar a propaganda.");
  revalidatePath("/admin/propagandas");
  return {
    ok: true,
    message: active ? "Propaganda ativada." : "Propaganda pausada.",
  };
}

export async function deleteAd(id: string): Promise<ActionResult> {
  await requireAdmin();
  const { error } = await adminSupabase().from("ads").delete().eq("id", id);
  if (error) return fail("Não foi possível excluir a propaganda.");
  revalidatePath("/admin/propagandas");
  return { ok: true, message: "Propaganda excluída." };
}

// ---------- Textos sugeridos ----------

const TextSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1, "Informe o título.").max(200),
  author: z.string().trim().max(120).optional(),
  source: z.string().trim().max(300).optional(),
  summary: z.string().trim().max(300).optional(),
  difficulty: z.enum(["facil", "intermediario", "avancado", "nao_classificada"]),
  text: z.string().min(1, "Cole o texto."),
  questions: z.string().optional(),
  published: z.boolean(),
});

export async function saveSuggestedText(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = TextSchema.safeParse({
    id: (form.get("id") as string) || undefined,
    title: form.get("title"),
    author: (form.get("author") as string) || undefined,
    source: (form.get("source") as string) || undefined,
    summary: (form.get("summary") as string) || undefined,
    difficulty: form.get("difficulty"),
    text: form.get("text"),
    questions: (form.get("questions") as string) || undefined,
    published: form.get("published") === "on",
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  const d = parsed.data;
  const blocks = parsePlainText(d.text);
  const v = validateText(blocks, d.text.length);
  if (!v.ok) return fail(v.message);

  let questions: unknown[] | null = null;
  if (d.questions) {
    let raw: unknown;
    try {
      raw = JSON.parse(d.questions);
    } catch {
      return fail("Perguntas em formato inválido.");
    }
    const list = Array.isArray(raw) ? raw.filter((q) => q && String((q as { prompt?: string }).prompt ?? "").trim()) : [];
    if (list.length > AI.questionCount) return fail(`Use no máximo ${AI.questionCount} perguntas.`);
    if (list.length) {
      const report = validateQuestions({ questions: list }, tokenize(blocks), "adm");
      if (report.rejected.length) {
        const r = report.rejected[0];
        return fail(
          r.index >= 0
            ? `Pergunta ${r.index + 1}: ${r.reason}. A evidência precisa ser um trecho copiado do texto.`
            : "Perguntas incompletas: preencha enunciado, 4 alternativas, resposta, explicação e evidência.",
        );
      }
      questions = list;
    }
  }

  const row = {
    title: d.title,
    author: d.author ?? null,
    source: d.source ?? null,
    summary: d.summary ?? null,
    difficulty: d.difficulty,
    blocks,
    questions,
    published: d.published,
    updated_at: new Date().toISOString(),
  };
  const sb = adminSupabase();
  const { error } = d.id ? await sb.from("suggested_texts").update(row).eq("id", d.id) : await sb.from("suggested_texts").insert(row);
  if (error) return fail("Não foi possível salvar o texto.");
  revalidatePath("/admin/textos");
  return {
    ok: true,
    message: d.published ? "Texto salvo e publicado em Treinar." : "Texto salvo como rascunho.",
  };
}

export async function deleteSuggestedText(id: string): Promise<ActionResult> {
  await requireAdmin();
  const { error } = await adminSupabase().from("suggested_texts").delete().eq("id", id);
  if (error) return fail("Não foi possível excluir o texto.");
  revalidatePath("/admin/textos");
  return { ok: true, message: "Texto excluído." };
}
