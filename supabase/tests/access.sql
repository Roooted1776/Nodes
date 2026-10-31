-- Brain's access rules, checked after every migration (see run.sh).
-- Fails loudly: any statement that should be refused but succeeds raises 'FAIL'.
\set ON_ERROR_STOP on

create schema if not exists tests;

create or replace function tests.refused(q text, label text) returns void language plpgsql as $$
begin
  begin
    execute q;
  exception when others then
    return;
  end;
  raise exception 'FAIL: % should have been refused', label;
end $$;

create or replace function tests.count_is(q text, want bigint, label text) returns void language plpgsql as $$
declare got bigint;
begin
  execute format('select count(*) from (%s) s', q) into got;
  if got <> want then
    raise exception 'FAIL: % expected % row(s), got %', label, want, got;
  end if;
end $$;

create or replace function tests.affected(q text, want bigint, label text) returns void language plpgsql as $$
declare n bigint;
begin
  execute q;
  get diagnostics n = row_count;
  if n <> want then
    raise exception 'FAIL: % expected % row(s) changed, got %', label, want, n;
  end if;
end $$;

grant usage on schema tests to anon, authenticated;
grant execute on all functions in schema tests to anon, authenticated;

-- Fixtures: the owner admin, a spare admin, a signed-up login with no Brain account, one sealed
-- key, one encrypted vault. Brain is admin-only (20261031150000): there are no viewer accounts.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner@users.redeemed.live'),
  ('22222222-2222-2222-2222-222222222222', 'stranger@users.redeemed.live'),
  ('33333333-3333-3333-3333-333333333333', 'spare@users.redeemed.live');
insert into public.profiles (id, name, role) values
  ('11111111-1111-1111-1111-111111111111', 'Owner', 'admin'),
  ('33333333-3333-3333-3333-333333333333', 'Spare', 'admin');
insert into public.account_keys (id, wrap) values
  ('11111111-1111-1111-1111-111111111111', jsonb_build_object('iv', repeat('A', 16), 'ct', repeat('B', 44)));
insert into public.vaults (id, envelope) values
  (1, '{"v":1,"n":1,"sig":"sig","ct":"ct","iv":"iv"}'::jsonb);

-- 0. Admin-only: a viewer account cannot be created, and setup is refused once any account exists
select tests.refused(
  $$insert into public.profiles (id, name, role) values ('22222222-2222-2222-2222-222222222222', 'Watcher', 'viewer')$$,
  'creating a viewer account');
select tests.refused(
  $$update public.profiles set role = 'viewer' where id = '33333333-3333-3333-3333-333333333333'$$,
  'turning an admin into a viewer');
select tests.count_is($$select 1 where public.claim_open_setup()$$, 0, 'setup claimed while admins exist');
-- Even a non-admin row (only possible with the role check lifted) blocks setup: ANY account counts.
begin;
delete from auth.users where id <> '22222222-2222-2222-2222-222222222222';
alter table public.profiles drop constraint profiles_role_check;
insert into public.profiles (id, name, role) values ('22222222-2222-2222-2222-222222222222', 'Watcher', 'viewer');
select tests.count_is($$select 1 where public.claim_open_setup()$$, 0, 'setup claimed while a non-admin account exists');
delete from public.profiles;
select tests.count_is($$select 1 where public.claim_open_setup()$$, 1, 'setup on an empty project');
rollback;
select tests.count_is('select 1 from private.setup_lease', 0, 'the rolled-back setup lease');
select tests.count_is('select 1 from public.profiles', 2, 'fixtures after the setup checks');

-- 1. Nobody signed in (anon) gets nothing ------------------------------------------------------
set role anon;
select tests.refused('select 1 from public.profiles', 'anon reads profiles');
select tests.refused('select 1 from public.vaults', 'anon reads the vault');
select tests.refused('select 1 from public.account_keys', 'anon reads sealed keys');
select tests.refused('select 1 from public.audit_log', 'anon reads the access log');
select tests.refused('select 1 from public.memories', 'anon reads memory');
select tests.refused($$select public.claim_setup('x')$$, 'anon spends the setup code');
select tests.refused($$select public.setup_needed()$$, 'anon probes setup through the database');
select tests.refused($$select graphql_public.graphql(null, '{profiles{edges{node{id}}}}')$$, 'anon calls graphql');
reset role;

-- 2. A signed-up login with no Brain account (a direct sign-up) gets nothing ---------------------
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
set role authenticated;
select tests.count_is('select 1 from public.profiles', 0, 'stranger reads the member list');
select tests.count_is('select 1 from public.vaults', 0, 'stranger reads the encrypted vault');
select tests.count_is('select 1 from public.account_keys', 0, 'stranger reads a sealed key');
select tests.count_is('select 1 from public.memories', 0, 'stranger reads the persistent memory table');
select tests.count_is('select 1 from public.sessions', 0, 'stranger reads the persistent session table');
select tests.count_is('select 1 from public.projects', 0, 'stranger reads the persistent projects table');
select tests.affected(
  $$update public.vaults set envelope = '{"v":1,"n":9,"sig":"s","ct":"c","iv":"i"}'::jsonb where id = 1$$,
  0, 'stranger writes the vault');
select tests.refused($$insert into public.vaults (id, envelope) values (1, '{}')$$, 'stranger inserts a vault row');
select tests.refused('delete from public.vaults where id = 1', 'stranger deletes the vault');
select tests.refused(
  $$insert into public.profiles (id, name, role) values ('22222222-2222-2222-2222-222222222222', 'Intruder', 'admin')$$,
  'stranger makes themselves an admin');
select tests.refused(
  $$insert into public.audit_log (who, who_name, what) values ('22222222-2222-2222-2222-222222222222', 'x', 'Signed in')$$,
  'stranger writes the access log');
select tests.refused(
  $$select public.upsert_memory('e1','k','concept','t','n','Brain',null,'{}'::jsonb)$$,
  'stranger writes persistent memory');
select tests.refused($$select public.claim_open_setup()$$, 'stranger claims first-run setup');
select tests.refused($$select graphql_public.graphql(null, '{profiles{edges{node{id}}}}')$$, 'stranger calls graphql');
select tests.refused('truncate public.vaults', 'stranger truncates the vault');
reset role;
select tests.count_is($$select 1 from realtime.messages$$, 0, 'no live messages yet');
insert into realtime.messages (topic, payload) values ('brain:live', '{}');
set realtime.topic = 'brain:live';
set role authenticated;
select tests.count_is('select 1 from realtime.messages', 0, 'stranger listens to brain live');
reset role;

-- 2b. The spare admin is a full member; the log stamps who really wrote a row ---------------------
set request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
set role authenticated;
select tests.count_is('select 1 from public.profiles', 2, 'spare admin reads the member list');
select tests.count_is('select 1 from public.vaults', 1, 'spare admin reads the encrypted vault');
select tests.count_is('select 1 from realtime.messages', 1, 'spare admin listens to brain live');
select tests.count_is('select 1 from public.account_keys', 0, 'spare admin reads the owner sealed key');
-- An admin who names somebody else in the row is still logged as themselves.
insert into public.audit_log (who, who_name, what) values
  ('11111111-1111-1111-1111-111111111111', 'Owner', 'Forged sign-in');
insert into public.audit_log (who, who_name, what) values
  ('33333333-3333-3333-3333-333333333333', 'Owner', 'Signed in');
reset role;
reset realtime.topic;
select tests.count_is(
  $$select 1 from public.audit_log where what = 'Signed in'
      and who = '33333333-3333-3333-3333-333333333333' and who_name = 'Spare'$$,
  1, 'the log stamps the caller name');
select tests.count_is(
  $$select 1 from public.audit_log where what = 'Forged sign-in'
      and who = '33333333-3333-3333-3333-333333333333' and who_name = 'Spare'$$,
  1, 'a forged log row is reattributed to the caller');
select tests.count_is($$select 1 from public.audit_log where who = '11111111-1111-1111-1111-111111111111'$$, 0,
  'another admin cannot log anything as the owner');

-- 3. An admin saves memory but cannot rewrite history -----------------------------------------
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set role authenticated;
select tests.count_is('select 1 from public.account_keys', 1, 'admin reads their own sealed key');
select tests.affected(
  $$update public.vaults set envelope = '{"v":1,"n":2,"sig":"s2","ct":"c2","iv":"i2"}'::jsonb,
    rev = 2, updated_at = '2000-01-01T00:00:00Z' where id = 1$$,
  1, 'admin saves the vault');
select tests.refused($$update public.vaults set rev = 9 where id = 1$$, 'admin skips a vault revision');
select tests.refused($$update public.vaults set id = 2 where id = 1$$, 'admin moves the vault row');
select tests.refused('update public.audit_log set what = $q$x$q$', 'admin rewrites the access log');
select tests.refused('delete from public.audit_log', 'admin deletes the access log');
-- Persistent memory mirror: admin can read and upsert; direct table writes stay closed.
select public.upsert_memory('e1', 'note:a', 'concept', 'Alpha', 'first', 'Brain', null, '{"strength":1}'::jsonb);
select public.upsert_session('s1', 'first task', 'Brain', null, '{"id":"s1","ts":1,"q":"first task","msgs":[]}'::jsonb);
select tests.count_is('select 1 from public.memories where key = $q$note:a$q$', 1, 'admin reads persistent memory');
select tests.count_is('select 1 from public.sessions where id = $q$s1$q$', 1, 'admin reads persistent sessions');
select tests.count_is('select 1 from public.projects where id = $q$Brain$q$', 1, 'admin reads persistent projects');
select tests.refused(
  $$insert into public.memories (id, key, type, title) values ('e2','k2','concept','x')$$,
  'admin cannot insert memory rows directly');
select tests.refused(
  $$insert into public.sessions (id, task) values ('s2','x')$$,
  'admin cannot insert session rows directly');
reset role;
select tests.count_is($$select 1 from public.vaults where rev = 2 and updated_at > '2001-01-01'$$, 1,
  'the vault keeps the database timestamp');

-- 4. Removing an account keeps its history and works at all -----------------------------------
set request.jwt.claims = '';
delete from auth.users where id = '33333333-3333-3333-3333-333333333333';
select tests.count_is($$select 1 from public.audit_log where who is null and who_name = 'Spare'$$, 2,
  'a removed account keeps its log rows');
select tests.count_is($$select 1 from public.profiles where id = '33333333-3333-3333-3333-333333333333'$$, 0,
  'a removed account loses its profile');
select tests.count_is($$select 1 from public.account_keys where id = '33333333-3333-3333-3333-333333333333'$$, 0,
  'a removed account loses its sealed key');

-- 5. Every table in the API schema is behind row-level security -------------------------------
do $$
declare t text;
begin
  select string_agg(c.relname, ', ') into t
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if t is not null then raise exception 'FAIL: row-level security is off on %', t; end if;
end $$;

\echo 'all access-rule checks passed'
