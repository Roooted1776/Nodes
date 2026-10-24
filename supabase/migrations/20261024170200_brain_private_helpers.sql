-- Move the role helpers out of the API schema (security advisor 0028/0029). Policies call them from private.
grant usage on schema private to authenticated;

create or replace function private.is_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()))
$$;
create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
$$;
revoke all on function private.is_member(), private.is_admin() from public, anon;
grant execute on function private.is_member(), private.is_admin() to authenticated;

alter policy "members read profiles" on public.profiles using ((select private.is_member()));
alter policy "members read memories" on public.memories using ((select private.is_member()));
alter policy "admins add memories" on public.memories with check ((select private.is_admin()));
alter policy "admins change memories" on public.memories using ((select private.is_admin())) with check ((select private.is_admin()));
alter policy "admins delete memories" on public.memories using ((select private.is_admin()));
alter policy "members read sessions" on public.sessions using ((select private.is_member()));
alter policy "admins add sessions" on public.sessions with check ((select private.is_admin()) and created_by = (select auth.uid()));
alter policy "admins change sessions" on public.sessions using ((select private.is_admin())) with check ((select private.is_admin()));
alter policy "admins delete sessions" on public.sessions using ((select private.is_admin()));
alter policy "members read meta" on public.brain_meta using ((select private.is_member()));
alter policy "admins change meta" on public.brain_meta using ((select private.is_admin())) with check ((select private.is_admin()));
alter policy "members write own audit" on public.audit_log with check ((select private.is_member()) and who = (select auth.uid()));
alter policy "admins read audit" on public.audit_log using ((select private.is_admin()));
alter policy "members listen to brain live" on realtime.messages using ((select realtime.topic()) = 'brain:live' and (select private.is_member()));
alter policy "admins send on brain live" on realtime.messages with check ((select realtime.topic()) = 'brain:live' and (select private.is_admin()));

drop function public.brain_role();
drop function public.is_member();
drop function public.is_admin();
-- the accounts Edge Function answers "is setup needed?" with the service role instead
drop function public.setup_needed();
create or replace function public.setup_needed() returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from public.profiles)
$$;
revoke all on function public.setup_needed() from public, anon, authenticated;
grant execute on function public.setup_needed() to service_role;
