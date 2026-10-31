-- Admin-only Brain (Owner, Oct 31 2026: "only admin able to logon"). No viewer accounts any more.
-- Live data had 0 viewers (Security, read-only, Oct 31), so no row changes. If any non-admin account
-- exists, this migration stops at the first statement and changes nothing, so it can never silently
-- lock someone out. Safe to apply twice. Rollback steps: see the admin-only note in the PR.

-- 0. Refuse to run while any non-admin account exists ------------------------------------------
do $$
declare n bigint;
begin
  select count(*) into n from public.profiles where role <> 'admin';
  if n > 0 then
    raise exception 'admin-only migration stopped: % non-admin account(s) exist; nothing was changed', n;
  end if;
end $$;

-- 1. The only role is admin ---------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role = 'admin');

-- 2. "Members" become admins on the encrypted vault and the brain:live channel ------------------
-- (Policy names are kept: Supabase does not let the migration role rename policies on realtime.messages.)
alter policy "members read ciphertext" on public.vaults
  using ((select private.is_admin()));
alter policy "members listen to brain live" on realtime.messages
  using ((select realtime.topic()) = 'brain:live' and (select private.is_admin()));

-- 3. First-admin setup is refused once ANY account exists (it used to check admins only) ---------
create or replace function public.claim_open_setup() returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare ok boolean;
begin
  if exists (select 1 from public.profiles) then return false; end if;
  insert into private.setup_lease (id, taken_at) values (1, now())
    on conflict (id) do update set taken_at = excluded.taken_at
    where private.setup_lease.taken_at < now() - interval '2 minutes'
  returning true into ok;
  return coalesce(ok, false);
end $$;
revoke all on function public.claim_open_setup() from public, anon, authenticated;
grant execute on function public.claim_open_setup() to service_role;
