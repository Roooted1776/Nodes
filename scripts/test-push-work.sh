#!/usr/bin/env bash
# scripts/test-push-work.sh — checks that push-work.sh refuses main, pushes only the work branch, and opens a PR.
# Runs entirely in a temp folder with a local fake remote; never touches the real remote.
set -euo pipefail

SCRIPT="$(cd "$(dirname "$0")" && pwd)/push-work.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Stub gh so no real PR is ever opened; it records its arguments.
cat > "$TMP/gh" << 'STUB'
#!/usr/bin/env bash
echo "$*" >> "$GH_LOG"
[[ "$1 $2" == "pr view" ]] && exit 1
exit 0
STUB
chmod +x "$TMP/gh"
export GH_BIN="$TMP/gh" GH_LOG="$TMP/gh.log"

git init -q --bare -b main "$TMP/remote.git"
git clone -q "$TMP/remote.git" "$TMP/work" 2>/dev/null
cd "$TMP/work"
git config user.name test
git config user.email test@example.invalid
git switch -q -c main 2>/dev/null || git switch -q main
mkdir -p scripts
cp "$SCRIPT" scripts/push-work.sh
echo one > file.txt
git add -A
git commit -q -m init
git push -q origin main
MAIN_BEFORE="$(git rev-parse origin/main)"

fail() { echo "FAIL: $1" >&2; exit 1; }

# 1. On main: must exit nonzero, say why, and leave the remote main alone.
echo two >> file.txt
git commit -q -am "change on main"
set +e
OUT="$(./scripts/push-work.sh --no-verify 2>&1)"
CODE=$?
set -e
[[ $CODE -ne 0 ]] || fail "script exited 0 on main"
grep -q "Never push to main" <<<"$OUT" || fail "no clear refusal message on main"
git fetch -q origin
[[ "$(git rev-parse origin/main)" == "$MAIN_BEFORE" ]] || fail "remote main changed"
echo "PASS: refuses on main (exit $CODE)"

# 2. On a work branch: pushes that branch only; remote main unchanged.
git reset -q --hard "$MAIN_BEFORE"
git switch -q -c work/test
echo three >> file.txt
git commit -q -am "work commit"
./scripts/push-work.sh --no-verify >/dev/null 2>&1 || fail "script failed on work branch"
git fetch -q origin
[[ "$(git rev-parse origin/main)" == "$MAIN_BEFORE" ]] || fail "remote main changed from work branch"
[[ "$(git rev-parse origin/work/test)" == "$(git rev-parse HEAD)" ]] || fail "work branch not pushed"
grep -q -- "pr create --draft --base main --head work/test" "$GH_LOG" || fail "draft PR not opened"
echo "PASS: pushes only the work branch and opens a draft PR"

# 3. The auto-push hook option is gone.
[[ ! -e "$(git rev-parse --git-common-dir)/hooks/post-commit" ]] || fail "post-commit hook exists"
! grep -q -- "--install-hook" scripts/push-work.sh || fail "--install-hook still in script"
echo "PASS: no auto-push hook"
