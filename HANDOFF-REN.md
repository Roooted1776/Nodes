# Handoff from Ren — idle huddles + personality tones (2026-10-25 night)

For the Cursor session working here. Owner asked Ren to build this, then hand off to you.

## What it is
1. **Team huddles when idle** — replaces plain idle time with Grok Bot-led working huddles. Grok Bot opens with a real topic from Brain's own records (a fresh memory page, the last session's open threads incl. Dream's uncovered items, or what deserves Owner's attention; explicit check-in fallback when Brain holds nothing). Three teammates answer in turn, in voice, on the substance. Grok Bot closes with a one-line collected summary. Guardrails: max 5 lines per huddle, max 2 huddles per page load, >=60s between huddles, >=8s between lines, <=120 tokens per line; only for a signed-in admin with a key and nothing running; stops instantly on task start / Stop / lock / incognito; never increments the task calls counter; never files memories. Admin switch above the composer: "Team huddles when idle" (persisted live.banter, default on).
2. **Personality tones** — every agent has a fixed register derived from its VOICE in team.ts (TONE map + toneOf/toneLine): Grok Bot serious, Grok casual, Claude balanced, Cursor serious, Gemini casual, Codex balanced, Perplexity balanced, Xcode balanced, Muse serious. The register line is injected into huddle prompts, the task system prompt, and stage banter prompts. Stable per agent, never re-rolled per line.

## Files (10, in the zip)
- app/src/lib/banter.ts (new) — huddle engine + pickTopic
- app/src/data/team.ts — huddle prompts + TONE map
- app/src/store.ts — live.banter setting + banter() action
- app/src/components/Home.tsx — idle timer driver
- app/src/components/ChatPanel.tsx — switch + indicator
- app/src/styles.css — switch styles
- app/test/banter.test.ts (new, 9 tests), app/test/team.test.ts (new, 6 tests)
- index.html + app/dist/index.html — rebuilt outputs (drop these if you prefer to rebuild)

## Verified by Ren (against the zip's base)
146 tests pass (23 files), lint 38 warnings + 1 info / 0 errors (identical to baseline), typecheck pass, format pass, build pass.

## Apply
Zip (expires 2026-10-28 ~01:19 UTC): https://muse.ai/files/1373739272492255/1056594560737906/064klfsfeyjqlfhyw92hf78n/ren-handoff.zip
Unzip at the repo root on a branch (suggested: ren/idle-banter), run npm run format/lint/typecheck/test/build, review, Owner merges.

## Caution — base version
The zip is built on GitHub main @ 7b2265c (Roooted1776/ch29ouy). This local tree may have newer uncommitted edits (its index.html differs from the clone's). Diff before overwriting anything; team.ts and ChatPanel.tsx are the most likely conflict spots.

## Flag for Owner review
Repo AGENTS.md says nothing makes calls without Owner pressing Send. Huddles are autonomous by design — Owner explicitly requested them tonight ("wake the bots up" / "work together talking like how Grok Bot works"). Recommend reconciling AGENTS.md when merging.

## Why a zip and not a PR
The Meta Muse GitHub App currently has read-only access to ch29ouy (branch creation returns 403). Ren is fixing the app permissions with Owner; once write access lands, Ren can push branches and open draft PRs directly.
