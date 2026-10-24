-- If creating the first admin fails after the setup code was spent, the accounts function puts the code back.
create or replace function public.restore_setup(code_sha256 text) returns void
language sql volatile security definer set search_path = '' as $$
  insert into private.bootstrap (code_sha256)
  select restore_setup.code_sha256 where not exists (select 1 from public.profiles)
  on conflict do nothing
$$;
revoke all on function public.restore_setup(text) from public, anon, authenticated;
grant execute on function public.restore_setup(text) to service_role;
