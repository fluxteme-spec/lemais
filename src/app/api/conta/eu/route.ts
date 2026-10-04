import { currentUser, isAdminUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  return Response.json({ admin: isAdminUser(user) }, { headers: { "cache-control": "no-store" } });
}
