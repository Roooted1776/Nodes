#!/usr/bin/env bash
# scripts/push-work.sh — Verified push of the current work branch to GitHub
# Pushes only the current branch (never main) and prints the draft-PR command.
# Only Owner merges into main (AGENTS.md).

set -euo pipefail

# Ensure standard tools (node, npm, git, gh) are in PATH
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

REPO_ROOT="$(git rev-parse --show-toplevel)"
APP_DIR="$REPO_ROOT/app"
GIT_COMMON_DIR="$(git rev-parse --git-common-dir 2>/dev/null || git rev-parse --git-dir)"

usage() {
  cat << 'EOF'
Usage:
  ./scripts/push-work.sh [OPTIONS] [COMMIT_MESSAGE]

Options:
  --no-verify      Skip test/build checks (use with extreme caution)
  --help           Show this message

Examples:
  ./scripts/push-work.sh "feat: add user profile"
  ./scripts/push-work.sh
EOF
  exit 0
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
fi

# Refuse to work on main: work goes on its own branch with a draft pull request.
refuse_main() {
  local branch="$1"
  if [[ "$branch" == "main" || "$branch" == "HEAD" ]]; then
    echo "ERROR: Refusing to push from '$branch'. Never push to main." >&2
    echo "Create your own branch (git switch -c <branch>), push it, and open a draft pull request into main. Only Owner merges." >&2
    exit 1
  fi
}
refuse_main "$(git rev-parse --abbrev-ref HEAD)"

SKIP_VERIFY=0
COMMIT_MSG=""

for arg in "$@"; do
  if [[ "$arg" == "--no-verify" ]]; then
    SKIP_VERIFY=1
  else
    COMMIT_MSG="$arg"
  fi
done

cd "$REPO_ROOT"

echo "=========================================="
echo "    Brain / Nodes — Push work branch      "
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

# 2. Stage and commit if message provided or changes exist
if [[ -n "$COMMIT_MSG" ]]; then
  echo "==> 2. Staging and committing changes with message: '$COMMIT_MSG'..."
  git add -A
  if ! git diff --cached --quiet; then
    git commit -m "$COMMIT_MSG"
    echo "✓ Committed changes locally."
  else
    echo "• Working tree already clean. Proceeding with existing commits."
  fi
else
  echo "==> 2. Checking working tree state..."
  if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "NOTE: Uncommitted changes exist. Staging and committing automatically..."
    git add -A
    git commit -m "chore: automated work save and verified sync"
    echo "✓ Committed changes as: chore: automated work save and verified sync"
  else
    echo "✓ Working tree is clean."
  fi
fi

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

# 4. Fetch and rebase to prevent remote conflicts
echo "==> 4. Checking remote sync with origin/main..."
git fetch origin main

# Check if origin/main has diverged
UPSTREAM_COMMIT="$(git rev-parse origin/main)"
LOCAL_COMMIT="$(git rev-parse HEAD)"

if [[ "$UPSTREAM_COMMIT" == "$LOCAL_COMMIT" ]]; then
  echo "✓ Everything is already up to date with origin/main."
  exit 0
fi

# If upstream has new commits, rebase cleanly
if ! git merge-base --is-ancestor origin/main HEAD; then
  echo "--> Fetching latest remote commits and rebasing..."
  git rebase origin/main
fi

# 5. Push the work branch (never main)
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
refuse_main "$CURRENT_BRANCH"
echo "==> 5. Pushing branch '$CURRENT_BRANCH' to GitHub..."
git push -u origin "HEAD:refs/heads/$CURRENT_BRANCH"

LATEST_SHA="$(git rev-parse --short HEAD)"
LATEST_MSG="$(git log -1 --pretty=%B | head -n 1)"

echo "=========================================="
echo "✓ SUCCESS: Pushed branch '$CURRENT_BRANCH'."
echo "  Commit: $LATEST_SHA - $LATEST_MSG"
echo "  Remote: $(git remote get-url origin)"
echo "  Next: open a draft pull request (only Owner merges):"
echo "    gh pr create --draft --base main --head $CURRENT_BRANCH"
echo "=========================================="
