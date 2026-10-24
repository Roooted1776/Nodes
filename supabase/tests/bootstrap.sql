-- Stand-in for the parts of Supabase's database that Brain's migrations expect, so the access rules
-- can be checked on a plain Postgres 17 (see run.sh). Test-only: never applied to a real project.
\set ON_ERROR_STOP on

-- Roles Supabase gives every project.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

-- auth.users and auth.uid(), as Supabase defines them.
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key,
  email text unique,
  raw_app_meta_data jsonb not null default '{}'::jsonb
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;

-- realtime.messages and realtime.topic(), used by the live-channel policies.
create schema if not exists realtime;
create table if not exists realtime.messages (
  id bigint generated always as identity primary key,
  topic text not null,
  payload jsonb
);
alter table realtime.messages enable row level security;
create or replace function realtime.topic() returns text language sql stable as $$
  select coalesce(current_setting('realtime.topic', true), '')
$$;
grant usage on schema realtime to authenticated;
grant select, insert on realtime.messages to authenticated;

-- pg_graphql's resolver, to prove Brain closes it.
create schema if not exists graphql_public;
create or replace function graphql_public.graphql(
  operationName text default null,
  query text default null,
  variables jsonb default null,
  extensions jsonb default null
) returns jsonb language sql as $$ select '{}'::jsonb $$;
grant usage on schema graphql_public to anon, authenticated;

-- The cloud's default privileges: new public objects are granted to the API roles.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
