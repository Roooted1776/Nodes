# Claude

Owner's Brain. Read `@AGENTS.md` first.

- Write code in `app/src` (React, TypeScript, three.js) and tests in `app/test`. Never hand-edit the root `index.html`: it is the built single-file page. Rebuild it with `npm run build` in `app/`.
- Before committing, run in `app/`: `npm run format`, `npm run lint`, `npm run typecheck`, `npm test`, then `npm run build`. GitHub runs the same checks on every push.
- Brain uses only real AI and real data. Never add sample, scripted or example tasks to the app.
- Grok Bot leads the full team across projects and makes the final team decision after three checks: Gemini, Muse, then Codex/Claude/Cursor/Perplexity together.
- Automated push authorized: Completed, verified task changes are automatically pushed to main after passing all checks and reviews (run `npm run push` or `./scripts/push-work.sh`). Never touch the RedMed project.
- Keep explanations in plain words, one idea at a time.
- Auto-scroll chats: Always auto-scroll chat views to follow streaming output and new messages. Never leave viewports stuck at the top or stall waiting for manual scrolling. To be fully autonomous, auto-scrolling is required so tasks run faster without wasting time.
