---
name: team-handoff
description: >-
  Prepares and records multi-agent task handoffs for the Brain/Nodes project.
  Use when completing tasks, before handing off to Cursor, Gemini, Muse, and Grok Bot.
---

# Team Handoff Runbook

## Review Sequence
1. Claude builds, verifies, and records the handoff.
2. Cursor receives the handoff to inspect code diffs and repository integration.
3. Gemini, ChatGPT, and Muse perform independent reviews (context, code quality, audit).
4. Grok Bot (in charge) verifies real results and issues the final team PASS/FAIL decision.

## Handoff File Requirements
Create or update `HANDOFF.md` in the project root with these exact sections:
1. **Overview & Request**: Plain-language description of the task and user directives.
2. **What Changed & Why**: Surgeon-precise explanation for every change.
3. **Files Touched**: Absolute or repository links for every modified file.
4. **Checks & Real Results**: Exact command outputs and runtimes:
   - `npm run format`
   - `npm run lint` (report baseline vs new warnings)
   - `npm run typecheck`
   - `npm test` (exact suite/test count)
   - `npm run build` (confirm single-file bundle generation)
   - `npm run e2e` (Chromium browser test duration)
5. **How the Next AI Should Check It**: Exact CLI reproduction commands.
6. **Git State**: Confirm working tree state and verified push to main per Owner's Oct 24 auto-push rule.
