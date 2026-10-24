#!/usr/bin/env bash
# Checks Brain's database access rules without touching the real Supabase project.
# Needs Docker only. Applies every migration in order to a throwaway Postgres 17, then runs the
# assertions in access.sql (anon gets nothing, viewers read ciphertext only, admins cannot rewrite
# history, removing an account keeps the log).
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

run_sql() {
  docker exec -i "$name" psql -v ON_ERROR_STOP=1 -q -U postgres -d brain
}

echo "applying the Supabase stand-in"
run_sql < supabase/tests/bootstrap.sql

for file in supabase/migrations/*.sql; do
  echo "applying $file"
  run_sql < "$file"
done

echo "checking the access rules"
run_sql < supabase/tests/access.sql
