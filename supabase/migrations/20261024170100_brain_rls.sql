-- Row-level security: members read, admins write, audit is append-only, live channel is admin-send.
alter table public.profiles enable row level security;
alter table public.memories enable row level security;
alter table public.sessions enable row level security;
alter table public.brain_meta enable row level security;
alter table public.audit_log enable row level security;
alter table private.bootstrap enable row level security;

-- clients never touch profiles directly; the accounts Edge Function uses the service role
create policy "members read profiles" on public.profiles for select to authenticated using ((select public.is_member()));

create policy "members read memories" on public.memories for select to authenticated using ((select public.is_member()));
create policy "admins add memories" on public.memories for insert to authenticated with check ((select public.is_admin()));
create policy "admins change memories" on public.memories for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins delete memories" on public.memories for delete to authenticated using ((select public.is_admin()));

create policy "members read sessions" on public.sessions for select to authenticated using ((select public.is_member()));
create policy "admins add sessions" on public.sessions for insert to authenticated with check ((select public.is_admin()) and created_by = (select auth.uid()));
create policy "admins change sessions" on public.sessions for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins delete sessions" on public.sessions for delete to authenticated using ((select public.is_admin()));

create policy "members read meta" on public.brain_meta for select to authenticated using ((select public.is_member()));
create policy "admins change meta" on public.brain_meta for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "members write own audit" on public.audit_log for insert to authenticated
  with check ((select public.is_member()) and who = (select auth.uid()));
create policy "admins read audit" on public.audit_log for select to authenticated using ((select public.is_admin()));

-- table privileges: nothing for anon; no update/delete on audit for anyone
revoke all on public.profiles, public.memories, public.sessions, public.brain_meta, public.audit_log from anon;
revoke update, delete, truncate on public.audit_log from authenticated;
revoke insert, update, delete, truncate on public.profiles from authenticated;
revoke insert, delete, truncate on public.brain_meta from authenticated;

-- live channel "brain:live" (private Realtime broadcast): members listen, admins send
create policy "members listen to brain live" on realtime.messages for select to authenticated
  using ((select realtime.topic()) = 'brain:live' and (select public.is_member()));
create policy "admins send on brain live" on realtime.messages for insert to authenticated
  with check ((select realtime.topic()) = 'brain:live' and (select public.is_admin()));
