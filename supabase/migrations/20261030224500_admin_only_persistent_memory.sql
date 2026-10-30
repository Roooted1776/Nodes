-- Persistent memory tables: admins only.
-- The encrypted vault stays the shared copy viewers may open. The plaintext
-- projects / memories / sessions mirror is for admin backup and restore only.
-- Additive: safe to apply twice.

-- 1. Read policies: members out, admins in ----------------------------------------------------
drop policy if exists "members read memories" on public.memories;
drop policy if exists "admins read memories" on public.memories;
create policy "admins read memories" on public.memories for select to authenticated
  using ((select private.is_admin()));

drop policy if exists "members read sessions" on public.sessions;
drop policy if exists "admins read sessions" on public.sessions;
create policy "admins read sessions" on public.sessions for select to authenticated
  using ((select private.is_admin()));

drop policy if exists "members read projects" on public.projects;
drop policy if exists "admins read projects" on public.projects;
create policy "admins read projects" on public.projects for select to authenticated
  using ((select private.is_admin()));

-- 2. Table privileges: authenticated may select (RLS still blocks non-admins).
-- Direct insert/update/delete on memories and sessions stays revoked; admins
-- write those rows only through upsert_memory / upsert_session (admin-checked).
grant select on public.memories, public.sessions to authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.memories, public.sessions from authenticated;

-- Projects: admins keep write grants from persistent_memory; anon stays out.
revoke all on public.projects from anon;
grant select, insert, update, delete on public.projects to authenticated;
revoke truncate, references, trigger on public.projects from authenticated;

-- 3. Upsert helpers stay admin-only (restate so a later grant cannot widen them)
revoke all on function public.upsert_memory(text, text, text, text, text, text, text, jsonb)
  from public, anon;
revoke all on function public.upsert_session(text, text, text, text, jsonb)
  from public, anon;
grant execute on function public.upsert_memory(text, text, text, text, text, text, text, jsonb)
  to authenticated;
grant execute on function public.upsert_session(text, text, text, text, jsonb)
  to authenticated;
