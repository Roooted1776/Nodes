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

-- Fixtures: one admin, one viewer, one sealed key, one encrypted vault.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner@users.redeemed.live'),
  ('22222222-2222-2222-2222-222222222222', 'watcher@users.redeemed.live');
insert into public.profiles (id, name, role) values
  ('11111111-1111-1111-1111-111111111111', 'Owner', 'admin'),
  ('22222222-2222-2222-2222-222222222222', 'Watcher', 'viewer');
insert into public.account_keys (id, wrap) values
  ('11111111-1111-1111-1111-111111111111', jsonb_build_object('iv', repeat('A', 16), 'ct', repeat('B', 44)));
insert into public.vaults (id, envelope) values
  (1, '{"v":1,"n":1,"sig":"sig","ct":"ct","iv":"iv"}'::jsonb);

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

-- 2. A viewer reads ciphertext and nothing else -----------------------------------------------
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
set role authenticated;
select tests.count_is('select 1 from public.profiles', 2, 'viewer reads the member list');
select tests.count_is('select 1 from public.vaults', 1, 'viewer reads the encrypted vault');
select tests.count_is('select 1 from public.account_keys', 0, 'viewer reads an admin sealed key');
select tests.affected(
  $$update public.vaults set envelope = '{"v":1,"n":9,"sig":"s","ct":"c","iv":"i"}'::jsonb where id = 1$$,
  0, 'viewer writes the vault');
select tests.refused($$insert into public.vaults (id, envelope) values (1, '{}')$$, 'viewer inserts a vault row');
select tests.refused('delete from public.vaults where id = 1', 'viewer deletes the vault');
select tests.refused($$update public.account_keys set wrap = '{"iv":"a","ct":"b"}'::jsonb$$, 'viewer writes a sealed key');
select tests.refused('select 1 from public.memories', 'viewer reads the retired readable memory table');
select tests.refused('select 1 from public.sessions', 'viewer reads the retired task table');
select tests.refused('select count(*) from public.brain_meta', 'viewer reads the retired meta table');
select tests.refused($$select public.claim_setup('x')$$, 'viewer spends the setup code');
select tests.refused($$select graphql_public.graphql(null, '{profiles{edges{node{id}}}}')$$, 'viewer calls graphql');
select tests.refused('select private.touch()', 'viewer calls an internal trigger function');
select tests.refused('truncate public.vaults', 'viewer truncates the vault');
-- A member who names somebody else in the row is still logged as themselves.
insert into public.audit_log (who, who_name, what) values
  ('11111111-1111-1111-1111-111111111111', 'Owner', 'Forged sign-in');
insert into public.audit_log (who, who_name, what) values
  ('22222222-2222-2222-2222-222222222222', 'Owner', 'Signed in');
reset role;
select tests.count_is(
  $$select 1 from public.audit_log where what = 'Signed in'
      and who = '22222222-2222-2222-2222-222222222222' and who_name = 'Watcher'$$,
  1, 'the log stamps the caller name');
select tests.count_is(
  $$select 1 from public.audit_log where what = 'Forged sign-in'
      and who = '22222222-2222-2222-2222-222222222222' and who_name = 'Watcher'$$,
  1, 'a forged log row is reattributed to the caller');
select tests.count_is($$select 1 from public.audit_log where who = '11111111-1111-1111-1111-111111111111'$$, 0,
  'a viewer cannot log anything as the owner');

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
reset role;
select tests.count_is($$select 1 from public.vaults where rev = 2 and updated_at > '2001-01-01'$$, 1,
  'the vault keeps the database timestamp');

-- 4. Removing an account keeps its history and works at all -----------------------------------
set request.jwt.claims = '';
delete from auth.users where id = '22222222-2222-2222-2222-222222222222';
select tests.count_is($$select 1 from public.audit_log where who is null and who_name = 'Watcher'$$, 2,
  'a removed account keeps its log rows');
select tests.count_is($$select 1 from public.profiles where id = '22222222-2222-2222-2222-222222222222'$$, 0,
  'a removed account loses its profile');
select tests.count_is($$select 1 from public.account_keys where id = '22222222-2222-2222-2222-222222222222'$$, 0,
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
