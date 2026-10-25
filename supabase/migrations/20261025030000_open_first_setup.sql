-- Simple first run (Owner's choice, Oct 2026): no setup code. While Brain has no accounts, the first
-- visitor picks the admin username and password. A short lease stops two visitors racing each other.
drop function if exists public.issue_setup_code(text);
drop table if exists private.setup_links;

create table if not exists private.setup_lease (
  id int primary key default 1 check (id = 1),
  taken_at timestamptz not null
);

-- true = this request may create the first admin now
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

-- give the lease back if the account could not be made
create or replace function public.release_open_setup() returns void
language sql volatile security definer set search_path = '' as $$
  delete from private.setup_lease
$$;

revoke all on function public.claim_open_setup() from public, anon, authenticated;
revoke all on function public.release_open_setup() from public, anon, authenticated;
grant execute on function public.claim_open_setup() to service_role;
grant execute on function public.release_open_setup() to service_role;
