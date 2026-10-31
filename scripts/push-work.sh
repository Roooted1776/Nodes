#!/usr/bin/env bash
# scripts/push-work.sh — Verified push of the current branch plus a pull request
# Never pushes to main; Owner and Director merge after Audits and Security sign off.

set -euo pipefail

# Ensure standard tools (node, npm, git, gh) are in PATH
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

GH_BIN="${GH_BIN:-gh}"  # override only for tests
REPO_ROOT="$(git rev-parse --show-toplevel)"
APP_DIR="$REPO_ROOT/app"
GIT_COMMON_DIR="$(git rev-parse --git-common-dir 2>/dev/null || git rev-parse --git-dir)"

usage() {
  cat << 'EOF'
Usage:
  ./scripts/push-work.sh [OPTIONS]   (commit your work first; the script never commits it for you)

Options:
  --no-verify      Skip test/build checks (use with extreme caution)
  --help           Show this message

Examples:
  ./scripts/push-work.sh
EOF
  exit 0
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
fi

SKIP_VERIFY=0

for arg in "$@"; do
  if [[ "$arg" == "--no-verify" ]]; then
    SKIP_VERIFY=1
  else
    echo "ERROR: Unknown argument '$arg'. Commit your changes yourself first; see --help." >&2
    exit 1
  fi
done

cd "$REPO_ROOT"

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$CURRENT_BRANCH" == "main" || "$CURRENT_BRANCH" == "HEAD" ]]; then
  echo "ERROR: On '$CURRENT_BRANCH'. Never push to main. Switch to a work branch first." >&2
  exit 1
fi

echo "=========================================="
echo "    Brain / Nodes — Automated GitHub Push "
echo "=========================================="

# 1. Hard rule check: RedMed isolation
echo "==> 1. Checking isolation (RedMed protection)..."
STAGED_DIFF="$(git diff --cached --name-only || true)"
UNSTAGED_DIFF="$(git diff --name-only || true)"
ALL_CHANGED="$STAGED_DIFF $UNSTAGED_DIFF"

if echo "$ALL_CHANGED" | grep -qi "RedMed"; then
  echo "ERROR: RedMed file detected in working changes! Standing rule: RedMed stays untouched." >&2
  exit 1
fi
echo "✓ Isolation verified: No RedMed content."

# 2. Refuse to run with uncommitted or untracked changes (no automatic commits)
echo "==> 2. Checking working tree state..."
if [[ -n "$(git status --porcelain)" ]]; then
  echo "ERROR: Uncommitted or untracked changes found. Commit or stash them yourself, then rerun. Nothing was committed." >&2
  git status --short >&2
  exit 1
fi
echo "✓ Working tree is clean."

# 3. Verification checks in app/
if [[ "$SKIP_VERIFY" -eq 0 && -d "$APP_DIR" ]]; then
  echo "==> 3. Running verification checks in app/..."
  cd "$APP_DIR"
  
  echo "--> Running format check..."
  npm run format
  
  echo "--> Running lint check..."
  npm run lint
  
  echo "--> Running typecheck..."
  npm run typecheck
  
  echo "--> Running unit & integration tests..."
  npm test
  
  echo "--> Building single-file distribution..."
  npm run build
  
  cd "$REPO_ROOT"
  
  # If build updated index.html or dist, stage and amend or commit
  if ! git diff --quiet index.html app/dist/index.html 2>/dev/null; then
    echo "--> Staging fresh production build artifacts..."
    git add index.html app/dist/index.html
    git commit -m "build: compile fresh production bundle for push"
  fi
  echo "✓ All verification checks passed."
else
  echo "==> 3. Verification skipped."
fi

# 4. Push the current branch (never main)
echo "==> 4. Pushing branch '$CURRENT_BRANCH' to GitHub..."
git push -u origin "$CURRENT_BRANCH:$CURRENT_BRANCH"

# 5. Open a draft pull request to main (skip if one already exists)
echo "==> 5. Opening pull request..."
if "$GH_BIN" pr view "$CURRENT_BRANCH" >/dev/null 2>&1; then
  echo "• A pull request for '$CURRENT_BRANCH' already exists."
else
  "$GH_BIN" pr create --draft --base main --head "$CURRENT_BRANCH" --fill
fi

LATEST_SHA="$(git rev-parse --short HEAD)"
echo "=========================================="
echo "✓ Pushed '$CURRENT_BRANCH' ($LATEST_SHA). Owner and Director merge after Audits and Security sign off."
echo "=========================================="
