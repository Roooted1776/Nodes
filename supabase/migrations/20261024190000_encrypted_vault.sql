-- Encrypted memory only. Account envelopes contain sealed keys, never the passcode.
create table public.account_keys (
  id uuid primary key references public.profiles(id) on delete cascade,
  wrap jsonb not null check (jsonb_typeof(wrap) = 'object' and wrap ? 'iv' and wrap ? 'ct' and pg_column_size(wrap) < 16384)
);
create table public.vaults (
  id smallint primary key default 1 check (id = 1),
  envelope jsonb not null check (envelope->>'v' = '1' and envelope ? 'sig' and envelope ? 'ct' and envelope ? 'iv' and pg_column_size(envelope) < 16777216),
  rev bigint not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.account_keys enable row level security;
alter table public.vaults enable row level security;
revoke all on public.account_keys, public.vaults from anon, authenticated;
grant select on public.account_keys, public.vaults to authenticated;
grant update (envelope, rev, updated_at) on public.vaults to authenticated;
grant all on public.account_keys, public.vaults to service_role;
create policy "read own sealed keys" on public.account_keys for select to authenticated
  using (id = (select auth.uid()) and (select private.is_member()));
create policy "members read ciphertext" on public.vaults for select to authenticated
  using ((select private.is_member()));
create policy "admins update ciphertext" on public.vaults for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create function private.vault_revision() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.rev <> old.rev + 1 then raise exception 'Vault revision must increase by one'; end if;
  new.updated_at := now();
  return new;
end $$;
create trigger vault_revision before update on public.vaults for each row execute function private.vault_revision();
-- Retain previous empty tables, but close all client paths for readable memory or task text.
revoke all on public.memories, public.sessions, public.brain_meta from anon, authenticated;
