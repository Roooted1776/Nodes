-- Tighten every client path into Brain's memory. Additive: no memory, task or account row is removed.
-- Run after the encrypted-vault migration; safe to apply twice.

-- 1. Access-log rows are stamped by the database -------------------------------------------------
-- A member could name somebody else in the log, or backdate a row. Now the row's author and time come
-- from the session, never from the request. The accounts Edge Function (service role, no signed-in
-- user) still writes its own trusted name for account changes.
create or replace function private.audit_stamp() returns trigger
language plpgsql security definer set search_path = '' as $$
declare caller uuid := (select auth.uid());
begin
  new.at := now();
  if caller is not null then
    new.who := caller;
    new.who_name := coalesce((select p.name from public.profiles p where p.id = caller), new.who_name);
  end if;
  return new;
end $$;
revoke all on function private.audit_stamp() from public, anon, authenticated;
drop trigger if exists audit_log_stamp on public.audit_log;
create trigger audit_log_stamp before insert on public.audit_log for each row execute function private.audit_stamp();

-- Removing an account used to fail: `who` was not null and the foreign key sets it to null. The log
-- keeps the name (who_name) and drops the id, so history survives and `remove` works.
alter table public.audit_log alter column who drop not null;

-- 2. Nothing in the private schema is callable by a client except the two role checks policies need --
revoke all on function private.audit_stamp(), private.touch(), private.vault_revision()
  from public, anon, authenticated;
revoke all on function private.is_member(), private.is_admin() from public, anon;
grant execute on function private.is_member(), private.is_admin() to authenticated;
grant usage on schema private to authenticated;

-- Only the accounts Edge Function (service role) may spend or restore the one-time setup code.
revoke all on function public.setup_needed(), public.claim_setup(text), public.restore_setup(text)
  from public, anon, authenticated;
grant execute on function public.setup_needed(), public.claim_setup(text), public.restore_setup(text) to service_role;

-- 3. Table privileges: anon gets nothing at all, and members get only what the page uses -----------
revoke all on public.profiles, public.memories, public.sessions, public.brain_meta,
  public.audit_log, public.account_keys, public.vaults from anon;
revoke truncate, references, trigger on public.profiles, public.memories, public.sessions,
  public.brain_meta, public.audit_log, public.account_keys, public.vaults from authenticated;

-- The vault and its account envelopes are read by members and written only through the admin policy
-- (vault) or the accounts function (envelopes). Restate it so a later grant cannot widen it.
revoke all on public.vaults, public.account_keys from authenticated;
grant select on public.vaults, public.account_keys to authenticated;
grant update (envelope, rev, updated_at) on public.vaults to authenticated;

-- 4. Close the GraphQL endpoint ---------------------------------------------------------------
-- pg_graphql adds a second way into the same tables. Brain never calls it; revoking the resolver
-- functions leaves the Data API as the only client path. Skipped silently when pg_graphql is absent.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'graphql_public'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
  end loop;
end $$;

-- 5. Tables added later start closed -----------------------------------------------------------
-- Supabase's cloud default grants every new public table to anon and authenticated. Brain's tables
-- use explicit grants instead (and `auto_expose_new_tables = false` in config.toml for the remote).
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
