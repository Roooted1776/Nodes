---
name: team-handoff
description: >-
  Prepares and records multi-agent task handoffs for the Brain/Nodes project.
  Use when completing tasks, before handing off to Cursor, Gemini, Muse, and Grok Bot.
---

# Team Workflow & Handoff Runbook

## Standard Team Workflow (For Everyone, Every Task)
1. **Audit the folder**: Check repository status, file cleanliness, boundaries (RedMed stays untouched), and ensure zero secrets/credentials are leaked.
2. **Review**: Inspect existing code, diffs, and context before touching anything.
3. **Revise**: Plan precise surgical changes with no extra moving parts.
4. **Edit**: Implement minimal necessary modifications and verify all 6 checks (`npm run format`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run e2e`).
5. **Push**: Push a branch and open a PR; Owner and Director merge after Audits and Security sign off.

> **Standing Team Principle: We don't move slow.** Move with decisive momentum and surgeon-level precision. Complete every task start to finish, never stall or hand back half-done work, verify rapidly, and push across the desk immediately.

## Review Sequence
1. Claude builds, verifies, and records the handoff.
2. Cursor receives the handoff to inspect code diffs and repository integration.
3. Gemini, ChatGPT, and Muse perform independent reviews (context, code quality, audit).
4. Approval means the PR is ready for Director to merge after Audits and Security sign off; never delete branches. Director has the final say after the three review checks. Director can decline a task. A declined task is marked DECLINED and git actions are blocked.

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
6. **Git State**: Push a branch and open a PR; Owner and Director merge after Audits and Security sign off.
