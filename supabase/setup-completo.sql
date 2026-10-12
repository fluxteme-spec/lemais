-- LêMais — Fase 1: contas, sincronização, propagandas, textos sugeridos e compartilhamentos.
-- Todas as tabelas usam RLS. O painel do desenvolvedor usa a chave secreta no servidor.

-- ---------- Perfis ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 60),
  age_confirmed_at timestamptz,
  terms_accepted_at timestamptz,
  invited_by uuid references auth.users (id) on delete set null,
  blocked boolean not null default false,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  visit_days integer not null default 1
);
alter table public.profiles enable row level security;

create policy "perfil: ler o próprio" on public.profiles for select using (auth.uid() = id);

-- O usuário só altera nome, confirmações e convite (uma vez); "blocked" é exclusivo do painel.
create or replace function public.update_my_profile(p_display_name text, p_confirm boolean, p_invited_by uuid)
returns public.profiles
language plpgsql security definer set search_path = public as $$
declare r public.profiles;
begin
  if auth.uid() is null then raise exception 'não autenticado'; end if;
  update public.profiles set
    display_name = coalesce(nullif(trim(p_display_name), ''), display_name),
    age_confirmed_at = case when p_confirm and age_confirmed_at is null then now() else age_confirmed_at end,
    terms_accepted_at = case when p_confirm and terms_accepted_at is null then now() else terms_accepted_at end,
    invited_by = case when invited_by is null and p_invited_by is not null and p_invited_by <> auth.uid()
                      and exists (select 1 from public.profiles where id = p_invited_by) then p_invited_by else invited_by end
  where id = auth.uid()
  returning * into r;
  return r;
end $$;

-- Registra visita (conta dias distintos de uso para medir retorno).
create or replace function public.touch_last_seen()
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set
    visit_days = visit_days + case when last_seen_at::date < now()::date then 1 else 0 end,
    last_seen_at = now()
  where id = auth.uid();
end $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)), 60));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and not blocked and age_confirmed_at is not null);
$$;

-- ---------- Sincronização dos dados de leitura ----------
-- Cada registro local (conteúdo, sessão, questionário, tentativa, preferências) vira uma linha.
create table public.user_records (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('content', 'session', 'questionSet', 'attempt', 'settings')),
  id text not null check (char_length(id) <= 200),
  data jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null,
  primary key (user_id, kind, id),
  constraint tamanho check (pg_column_size(data) <= 2000000)
);
alter table public.user_records enable row level security;
create policy "registros: ler os próprios" on public.user_records for select using (auth.uid() = user_id);
create policy "registros: inserir os próprios" on public.user_records for insert with check (auth.uid() = user_id and public.is_active_user());
create policy "registros: alterar os próprios" on public.user_records for update using (auth.uid() = user_id) with check (auth.uid() = user_id and public.is_active_user());
create index user_records_updated on public.user_records (user_id, updated_at);

-- ---------- Propagandas ----------
create table public.ads (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 80),
  body text check (char_length(body) <= 200),
  image_url text check (image_url ~ '^https://'),
  link_url text not null check (link_url ~ '^https?://'),
  cta text check (char_length(cta) <= 30),
  placements text[] not null default '{home}' check (placements <@ array['home', 'resultado', 'progresso', 'treinar']),
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default true,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  created_at timestamptz not null default now()
);
alter table public.ads enable row level security;
create policy "propagandas ativas são públicas" on public.ads for select
  using (active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()));

create or replace function public.track_ad(p_ad uuid, p_kind text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_kind = 'impression' then update public.ads set impressions = impressions + 1 where id = p_ad and active;
  elsif p_kind = 'click' then update public.ads set clicks = clicks + 1 where id = p_ad and active;
  end if;
end $$;

-- ---------- Textos sugeridos (publicados pelo painel) ----------
create table public.suggested_texts (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 200),
  author text check (char_length(author) <= 120),
  source text check (char_length(source) <= 300),
  summary text check (char_length(summary) <= 300),
  difficulty text not null default 'nao_classificada' check (difficulty in ('facil', 'intermediario', 'avancado', 'nao_classificada')),
  blocks jsonb not null,
  questions jsonb,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.suggested_texts enable row level security;
create policy "textos publicados são públicos" on public.suggested_texts for select using (published);

-- ---------- Compartilhamentos ----------
-- Guarda apenas o que a pessoa escolheu mostrar: título, fonte, trecho curto e desempenho.
create table public.shares (
  id text primary key default substr(md5(gen_random_uuid()::text), 1, 10),
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 60),
  title text not null check (char_length(title) <= 200),
  source text check (char_length(source) <= 120),
  excerpt text check (char_length(excerpt) <= 220),
  mode text check (char_length(mode) <= 40),
  observed_wpm integer check (observed_wpm between 0 and 5000),
  wpm_is_estimate boolean not null default false,
  words integer check (words >= 0),
  active_seconds integer check (active_seconds >= 0),
  correct integer check (correct >= 0),
  question_count integer check (question_count between 0 and 10),
  adaptation text check (char_length(adaptation) <= 40),
  created_at timestamptz not null default now()
);
alter table public.shares enable row level security;
create policy "compartilhamentos são públicos" on public.shares for select using (true);
create policy "compartilhar: próprio usuário" on public.shares for insert with check (auth.uid() = user_id and public.is_active_user());
create policy "compartilhar: apagar o próprio" on public.shares for delete using (auth.uid() = user_id);

-- Os papéis anônimo e autenticado não podem gravar em propagandas e textos sugeridos;
-- só o servidor (chave secreta) grava, depois de verificar o e-mail do administrador.
revoke insert, update, delete on public.ads, public.suggested_texts from anon, authenticated;
revoke update (blocked) on public.profiles from anon, authenticated;
grant execute on function public.update_my_profile(text, boolean, uuid) to authenticated;
grant execute on function public.touch_last_seen() to authenticated;
-- Funções security definer não ficam expostas por padrão.
revoke execute on function public.track_ad(uuid, text) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.update_my_profile(text, boolean, uuid) from public, anon;
revoke execute on function public.touch_last_seen() from public, anon;

-- Cursor de sincronização definido pelo servidor (não depende do relógio dos aparelhos).
alter table public.user_records add column synced_at timestamptz not null default now();
create index user_records_synced on public.user_records (user_id, synced_at);
create or replace function public.stamp_synced_at() returns trigger language plpgsql as $$
begin new.synced_at = clock_timestamp(); return new; end $$;
create trigger user_records_synced_at before insert or update on public.user_records
  for each row execute function public.stamp_synced_at();

-- LêMais — doações: medalha de doador liberada pelo painel; o usuário só pode "pedir" a medalha.
alter table public.profiles
  add column donor_since timestamptz,
  add column donation_claimed_at timestamptz;

-- O usuário registra que doou (uma vez). A medalha (donor_since) só o painel concede.
create or replace function public.claim_donation()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'não autenticado'; end if;
  update public.profiles
    set donation_claimed_at = coalesce(donation_claimed_at, now())
  where id = auth.uid() and not blocked and age_confirmed_at is not null;
end $$;

revoke execute on function public.claim_donation() from public, anon;
grant execute on function public.claim_donation() to authenticated;

-- Avisos do Supabase (database linter): search_path fixo no gatilho de sincronização
-- e is_active_user() só para quem está logado (as políticas RLS continuam usando-a).
alter function public.stamp_synced_at() set search_path = public;
revoke execute on function public.is_active_user() from public, anon;
grant execute on function public.is_active_user() to authenticated;

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
