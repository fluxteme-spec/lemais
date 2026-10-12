-- LêMais — Gravador: texto sincronizado, caixa de entrada dos Atalhos e links públicos.

-- ---------- Texto das gravações (o áudio nunca vem para cá) ----------
create table public.gravacoes (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null check (char_length(id) <= 80),
  dados jsonb,
  excluido boolean not null default false,
  atualizado_em timestamptz not null,
  primary key (user_id, id),
  constraint tamanho check (pg_column_size(dados) <= 3000000)
);
alter table public.gravacoes enable row level security;
create policy "gravações: ler as próprias" on public.gravacoes for select using (auth.uid() = user_id);
create policy "gravações: inserir as próprias" on public.gravacoes for insert with check (auth.uid() = user_id and public.is_active_user());
create policy "gravações: alterar as próprias" on public.gravacoes for update using (auth.uid() = user_id) with check (auth.uid() = user_id and public.is_active_user());
create index gravacoes_atualizado on public.gravacoes (user_id, atualizado_em);

-- ---------- Caixa de entrada: áudios enviados pelos Atalhos do iPhone ----------
-- Cada usuário tem um código pessoal (revogável). O Atalho envia o áudio para a pasta
-- com esse código; só o dono lê e apaga. O áudio sai da nuvem depois de processado.
create table public.gravador_tokens (
  token text primary key check (token ~ '^[a-f0-9]{32}$'),
  user_id uuid not null references auth.users (id) on delete cascade,
  criado_em timestamptz not null default now()
);
alter table public.gravador_tokens enable row level security;
create policy "códigos: ler os próprios" on public.gravador_tokens for select using (auth.uid() = user_id);
create policy "códigos: criar os próprios" on public.gravador_tokens for insert with check (auth.uid() = user_id and public.is_active_user());
create policy "códigos: apagar os próprios" on public.gravador_tokens for delete using (auth.uid() = user_id);

create or replace function public.gravador_token_valido(p_token text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.gravador_tokens t join public.profiles p on p.id = t.user_id
                 where t.token = p_token and not p.blocked);
$$;
revoke execute on function public.gravador_token_valido(text) from public;
grant execute on function public.gravador_token_valido(text) to anon, authenticated;

create or replace function public.gravador_token_do_usuario(p_token text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.gravador_tokens where token = p_token and user_id = auth.uid());
$$;
revoke execute on function public.gravador_token_do_usuario(text) from public, anon;
grant execute on function public.gravador_token_do_usuario(text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('entrada', 'entrada', false, 209715200,
        array['audio/mp4','audio/m4a','audio/x-m4a','audio/mpeg','audio/wav','audio/x-wav','audio/aac','audio/webm','audio/ogg','video/mp4','application/octet-stream'])
on conflict (id) do nothing;

create policy "entrada: enviar com código válido" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'entrada' and public.gravador_token_valido((storage.foldername(name))[1]));
create policy "entrada: dono lê" on storage.objects for select to authenticated
  using (bucket_id = 'entrada' and public.gravador_token_do_usuario((storage.foldername(name))[1]));
create policy "entrada: dono apaga" on storage.objects for delete to authenticated
  using (bucket_id = 'entrada' and public.gravador_token_do_usuario((storage.foldername(name))[1]));

-- ---------- Links públicos (só leitura, com validade, sem áudio) ----------
create table public.gravador_publicos (
  id text primary key default substr(md5(gen_random_uuid()::text), 1, 12),
  user_id uuid not null references auth.users (id) on delete cascade,
  titulo text not null check (char_length(titulo) <= 200),
  conteudo jsonb not null,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null default now() + interval '7 days',
  revogado boolean not null default false,
  constraint tamanho check (pg_column_size(conteudo) <= 1000000),
  constraint validade check (expira_em <= criado_em + interval '90 days')
);
alter table public.gravador_publicos enable row level security;
create policy "links: qualquer um lê os válidos" on public.gravador_publicos for select
  using (not revogado and expira_em > now());
create policy "links: dono lê os seus" on public.gravador_publicos for select using (auth.uid() = user_id);
create policy "links: dono cria" on public.gravador_publicos for insert with check (auth.uid() = user_id and public.is_active_user());
create policy "links: dono revoga" on public.gravador_publicos for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "links: dono apaga" on public.gravador_publicos for delete using (auth.uid() = user_id);
