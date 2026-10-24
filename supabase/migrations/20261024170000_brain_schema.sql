-- Brain: accounts, memory, saved tasks, audit and the live channel.
-- Reads need a Brain profile (made only by the accounts Edge Function); writes need the admin role.
-- Dates of birth are never stored. AI provider keys are never stored here.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- people -------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (name ~ '^[A-Za-z0-9]+( [A-Za-z0-9]+)*$' and char_length(name) between 2 and 32),
  role text not null check (role in ('admin', 'viewer')),
  adult boolean not null default true check (adult),
  created_at timestamptz not null default now()
);
create unique index profiles_name_lower on public.profiles (lower(name));

-- role helpers (security definer so policies do not recurse through profiles' own RLS)
create or replace function public.brain_role() returns text
language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p where p.id = (select auth.uid())
$$;
create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()))
$$;
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
$$;
revoke all on function public.brain_role(), public.is_member(), public.is_admin() from public, anon;
grant execute on function public.brain_role(), public.is_member(), public.is_admin() to authenticated;

-- memory: one row per entry, written by Grok Bot (AI) or an admin's own note --------------------
create table public.memories (
  id text primary key check (id ~ '^e[0-9]{1,9}$'),
  key text not null unique check (char_length(key) <= 120),
  type text not null check (type in ('concept', 'entity', 'workstream')),
  title text not null check (char_length(title) between 1 and 80),
  note text not null default '' check (char_length(note) <= 600),
  body jsonb not null default '{}'::jsonb check (pg_column_size(body) < 16384),
  archived boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references auth.users (id) on delete set null
);
create index memories_live on public.memories (archived, updated_at desc);

-- saved tasks: the task, AI replies, coverage, flow and reply times ------------------------------
create table public.sessions (
  id text primary key check (id ~ '^s[0-9]{1,9}$'),
  ts timestamptz not null default now(),
  task text not null check (char_length(task) <= 300),
  body jsonb not null check (pg_column_size(body) < 262144),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);
create index sessions_ts on public.sessions (ts desc);

-- shared settings and counters (one row) -----------------------------------------------------------
create table public.brain_meta (
  id smallint primary key default 1 check (id = 1),
  blocked text[] not null default '{}',
  settings jsonb not null default '{}'::jsonb,
  counters jsonb not null default '{}'::jsonb,
  rev bigint not null default 0,
  updated_at timestamptz not null default now()
);
insert into public.brain_meta (id) values (1) on conflict do nothing;

-- audit: append-only ----------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  who uuid not null default auth.uid() references auth.users (id) on delete set null,
  who_name text not null check (char_length(who_name) <= 32),
  what text not null check (char_length(what) <= 200)
);
create index audit_log_at on public.audit_log (at desc);

-- first admin: a one-time setup code (only its SHA-256 is stored) ------------------------------------
create table private.bootstrap (code_sha256 text primary key, created_at timestamptz not null default now());

create or replace function public.setup_needed() returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from public.profiles)
$$;
revoke all on function public.setup_needed() from public;
grant execute on function public.setup_needed() to anon, authenticated;

-- used only by the accounts Edge Function (service role): checks and spends the setup code
create or replace function public.claim_setup(code_sha256 text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare ok boolean;
begin
  if exists (select 1 from public.profiles) then return false; end if;
  delete from private.bootstrap b where b.code_sha256 = claim_setup.code_sha256 returning true into ok;
  return coalesce(ok, false);
end $$;
revoke all on function public.claim_setup(text) from public, anon, authenticated;
grant execute on function public.claim_setup(text) to service_role;

-- keep updated_at honest and stop clients from rewriting who made a change
create or replace function private.touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if tg_table_name = 'memories' then new.updated_by := auth.uid(); end if;
  if tg_table_name = 'brain_meta' then new.rev := old.rev + 1; end if;
  return new;
end $$;
create trigger memories_touch before update on public.memories for each row execute function private.touch();
create trigger brain_meta_touch before update on public.brain_meta for each row execute function private.touch();
