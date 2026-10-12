-- Avisos do Supabase (database linter): search_path fixo no gatilho de sincronização
-- e is_active_user() só para quem está logado (as políticas RLS continuam usando-a).
alter function public.stamp_synced_at() set search_path = public;
revoke execute on function public.is_active_user() from public, anon;
grant execute on function public.is_active_user() to authenticated;
