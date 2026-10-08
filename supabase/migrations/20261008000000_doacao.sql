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
