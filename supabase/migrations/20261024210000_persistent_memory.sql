-- Persistent Memory: First-class database persistence for memory entries, project nodes, and task sessions.
-- Maintains project node hierarchy, orbital task relationships, and continuous database updates.

-- 1. Projects table: each project is a distinct persistent node
create table if not exists public.projects (
  id text primary key check (char_length(id) between 1 and 80),
  name text not null unique check (char_length(name) between 1 and 80),
  color text not null default '#38bdf8' check (char_length(color) between 4 and 32),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Seed default Brain project node
insert into public.projects (id, name, color)
values ('Brain', 'Brain', '#38bdf8')
on conflict (id) do nothing;

-- 2. Add project tracking to memories and sessions
alter table public.memories add column if not exists project text default 'Brain';
alter table public.memories add column if not exists project_id text;
create index if not exists memories_project on public.memories (project);
create index if not exists memories_project_id on public.memories (project_id);

alter table public.sessions add column if not exists project text default 'Brain';
alter table public.sessions add column if not exists project_id text;
create index if not exists sessions_project on public.sessions (project);
create index if not exists sessions_project_id on public.sessions (project_id);

-- 3. Row-level security for projects
alter table public.projects enable row level security;
revoke all on public.projects from anon;
grant select on public.projects to authenticated;
grant insert, update, delete on public.projects to authenticated;

create policy "members read projects" on public.projects for select to authenticated
  using ((select private.is_member()));

create policy "admins write projects" on public.projects for insert to authenticated
  with check ((select private.is_admin()));

create policy "admins update projects" on public.projects for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "admins delete projects" on public.projects for delete to authenticated
  using ((select private.is_admin()));

-- 4. Database helper: save or update a memory entry atomically
create or replace function public.upsert_memory(
  p_id text,
  p_key text,
  p_type text,
  p_title text,
  p_note text,
  p_project text default 'Brain',
  p_project_id text default null,
  p_body jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (select private.is_admin()) then
    raise exception 'Only admins may update memory';
  end if;

  insert into public.memories (id, key, type, title, note, project, project_id, body, updated_at, updated_by)
  values (p_id, p_key, p_type, p_title, p_note, p_project, p_project_id, p_body, now(), (select auth.uid()))
  on conflict (key) do update set
    type = excluded.type,
    title = excluded.title,
    note = excluded.note,
    project = excluded.project,
    project_id = excluded.project_id,
    body = excluded.body,
    updated_at = now(),
    updated_by = (select auth.uid());
end $$;

-- 5. Database helper: save task session atomically
create or replace function public.upsert_session(
  p_id text,
  p_task text,
  p_project text default 'Brain',
  p_project_id text default null,
  p_body jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (select private.is_admin()) then
    raise exception 'Only admins may save sessions';
  end if;

  insert into public.sessions (id, task, project, project_id, body, ts, created_by)
  values (p_id, p_task, p_project, p_project_id, p_body, now(), (select auth.uid()))
  on conflict (id) do update set
    task = excluded.task,
    project = excluded.project,
    project_id = excluded.project_id,
    body = excluded.body,
    ts = now();
end $$;

revoke all on function public.upsert_memory, public.upsert_session from public, anon;
grant execute on function public.upsert_memory, public.upsert_session to authenticated;
