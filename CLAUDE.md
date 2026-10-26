# Claude

Owner's Brain. Read `@AGENTS.md` first.

## Standard Team Workflow (For You and Everyone)
1. **Audit the folder**: Check repository status, file hygiene, boundaries (RedMed untouched), and ensure zero secrets/credentials are leaked.
2. **Review**: Inspect existing code, diffs, and context before touching anything.
3. **Revise**: Plan precise surgical changes with no extra moving parts.
4. **Edit**: Implement minimal necessary modifications and verify all 6 checks (`npm run format`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run e2e`).
5. **Push**: Document in `HANDOFF.md`, push verified work to its own branch and open a draft pull request, and follow the multi-agent review sequence (Claude builds, Cursor gets handoff, Gemini/ChatGPT/Muse review, Grok Bot verifies and calls pass/fail).

- Write code in `app/src` (React, TypeScript, three.js) and tests in `app/test`. Never hand-edit the root `index.html`: it is the built single-file page. Rebuild it with `npm run build` in `app/`.
- Before committing, run in `app/`: `npm run format`, `npm run lint`, `npm run typecheck`, `npm test`, then `npm run build`. GitHub runs the same checks on every push.
- Brain uses only real AI and real data. Never add sample, scripted or example tasks to the app.
- Grok Bot leads the full team across projects and makes the final team decision after three checks: Gemini, Muse, then Codex/Claude/Cursor/Perplexity together. Grok Bot can decline based on the team's response. When approved, save this as the final thing he says: "approved: ready for Owner to merge" (saved with the review record; not included in chat). When declined, the task is marked DECLINED and git actions are blocked.
- Keep explanations in plain words, one idea at a time.
- Auto-scroll chats: Always auto-scroll chat views to follow streaming output and new messages. Never leave viewports stuck at the top or stall waiting for manual scrolling. To be fully autonomous, auto-scrolling is required so tasks run faster without wasting time.
- Velocity (We don't move slow): Move with decisive speed and momentum. Complete every task start to finish without stalling, wasting cycles, or handing back half-done steps. Verify cleanly and push across the desk immediately.

