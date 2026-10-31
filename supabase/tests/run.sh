#!/usr/bin/env bash
# Checks Brain's database access rules without touching the real Supabase project.
# Needs Docker only. Applies every migration in order to a throwaway Postgres 17, then runs the
# assertions in access.sql (anon gets nothing, a login with no Brain account gets nothing, only
# admins exist, admins cannot rewrite history, removing an account keeps the log). Then checks that
# the admin-only migration stops if a viewer exists and applies cleanly when none does.
#
#   bash supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

image="postgres:17-alpine"
name="brain-access-check-$$"

cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --name "$name" -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=brain "$image" >/dev/null

ready=""
for _ in $(seq 1 60); do
  if docker exec "$name" pg_isready -U postgres -d brain >/dev/null 2>&1; then ready=yes; break; fi
  sleep 0.5
done
if [ -z "$ready" ]; then
  echo "Postgres did not start" >&2
  docker logs "$name" >&2
  exit 1
fi

run_sql() { run_sql_on brain; }
run_sql_on() {
  docker exec -i "$name" psql -v ON_ERROR_STOP=1 -q -U postgres -d "$1"
}

echo "applying the Supabase stand-in"
run_sql < supabase/tests/bootstrap.sql

for file in supabase/migrations/*.sql; do
  echo "applying $file"
  run_sql < "$file"
done

echo "checking the access rules"
run_sql < supabase/tests/access.sql

# The admin-only migration on a database that still has the earlier migrations only.
admin_only="supabase/migrations/20261031150000_admin_only_accounts.sql"
before_admin_only() {
  docker exec "$name" createdb -U postgres "$1"
  run_sql_on "$1" < supabase/tests/bootstrap.sql
  for file in supabase/migrations/*.sql; do
    if [ "$file" \< "$admin_only" ]; then run_sql_on "$1" < "$file"; fi
  done
  run_sql_on "$1" <<'SQL'
insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'owner@users.redeemed.live');
insert into public.profiles (id, name, role) values ('11111111-1111-1111-1111-111111111111', 'Owner', 'admin');
insert into public.vaults (id, envelope) values (1, '{"v":1,"n":1,"sig":"sig","ct":"ct","iv":"iv"}'::jsonb);
SQL
}

echo "checking the admin-only migration stops while a viewer exists"
before_admin_only brain_viewer
run_sql_on brain_viewer <<'SQL'
insert into auth.users (id, email) values ('22222222-2222-2222-2222-222222222222', 'watcher@users.redeemed.live');
insert into public.profiles (id, name, role) values ('22222222-2222-2222-2222-222222222222', 'Watcher', 'viewer');
SQL
if out=$(run_sql_on brain_viewer < "$admin_only" 2>&1); then
  echo "FAIL: the admin-only migration ran while a viewer exists" >&2
  exit 1
fi
echo "$out" | grep -q "admin-only migration stopped: 1 non-admin account(s) exist" || {
  echo "FAIL: unexpected error from the admin-only migration: $out" >&2
  exit 1
}
run_sql_on brain_viewer <<'SQL'
do $$
begin
  if (select count(*) from public.profiles where role = 'viewer') <> 1 then raise exception 'FAIL: viewer row changed'; end if;
  if not exists (select 1 from pg_policies where policyname = 'members read ciphertext') then
    raise exception 'FAIL: the stopped migration changed the vault rule';
  end if;
  if pg_get_constraintdef((select oid from pg_constraint where conname = 'profiles_role_check')) not like '%viewer%' then
    raise exception 'FAIL: the stopped migration changed the role check';
  end if;
end $$;
SQL

echo "checking the admin-only migration applies cleanly with 0 viewers, twice"
before_admin_only brain_admins
run_sql_on brain_admins < "$admin_only"
run_sql_on brain_admins < "$admin_only"
run_sql_on brain_admins <<'SQL'
do $$
begin
  if (select rev from public.vaults where id = 1) <> 1 then raise exception 'FAIL: the vault changed'; end if;
  if (select count(*) from public.profiles) <> 1 then raise exception 'FAIL: accounts changed'; end if;
  if public.claim_open_setup() then raise exception 'FAIL: setup claimable with an admin'; end if;
end $$;
SQL

echo "all database checks passed"
