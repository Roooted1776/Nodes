# Agents

Brain is Owner's personal "Orchestration Brain": one page (`index.html`) that shows his AI programs working together, plus a small memory that learns from those sessions the way the Perplexity help article "What is Brain?" describes.

Canonical repo: **`Roooted1776/Brain`**.

## Standard Team Workflow (For Every AI and Tool)

Every bot, agent, and tool on this team must follow this exact 5-step workflow on every task:
1. **Audit the folder**: Check repository status, file cleanliness, boundaries (RedMed stays untouched), and ensure zero secrets/credentials are leaked.
2. **Review**: Inspect existing code, diffs, requirements, and test suites before touching anything.
3. **Revise**: Plan precise surgical changes with no extra moving parts.
4. **Edit**: Implement minimal necessary modifications and verify all 6 checks (`npm run format`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run e2e`).
5. **Push**: Push a branch and open a PR; Owner and Director merge after Audits and Security sign off.

> **Standing Team Principle: We don't move slow.** Move with decisive momentum and surgeon-level precision. Complete every task start to finish, never stall or hand back half-done work, verify rapidly, and push across the desk immediately.

## Owner's usage and handoff rule (2026-10-24)

- When reported AI usage reaches 90%, try to finish the current task within the remaining allowance. Use an available usage indicator; never invent a percentage or claim continuous monitoring when it is unavailable.
- Finish only the assigned work, run the relevant checks, and leave a short handoff stating what changed, files touched, checks and results, and anything unfinished. Then step back so the next AI can continue without competing edits. Never mark unfinished work complete just to meet the threshold.
- Push a branch and open a PR; Owner and Director merge after Audits and Security sign off.
- Before pushing, verify the repository and remote, fetch the latest `main`, inspect the working tree and outgoing commits, and ensure the push contains only the assigned task. Preserve other AIs' files, branches, uncommitted changes, and commits; never bundle unrelated work, force-push, reset, or overwrite their work. If isolation, checks, conflicts, permissions, or branch protection prevent a safe push, leave the completed work and handoff locally and report the blocker.
- Push only after the task is actually complete and checked. Review stages that are unavailable must be reported honestly; never fabricate another program's approval.

## Hard rule: RedMed stays untouched

Owner also has a separate project called RedMed. **Do not read, copy from, change, branch, or open pull requests on RedMed from this repo or this work.** Nothing from RedMed goes into Brain, including text, file names, skills lists or sample data. If a task seems to need RedMed, stop and ask Owner.

## Who does what (Owner's chart)

| Program | Role and strength | Look on the page | In this repo |
| --- | --- | --- | --- |
| **Grok Bot** | Team head across every project; gathers the three checks and makes the final team decision. | filled white | Routes the work, logs hand-offs, and gives the final PASS or FAIL. |
| **Grok (xAI)** | Strategy reviewer; challenges assumptions, risks, and missed options. | thin line | Gives an independent challenge; does not overrule Grok Bot. |
| **Claude (Anthropic)** | Careful reasoning, writing, and code. | double line | Plans and builds the single-file page. |
| **Cursor** | Repository editing and code integration. | thin line | Reviews the actual changed files and integration risks. |
| **Gemini (Google)** | Multimodal and long-context cross-checking. | thin line | First review check: inspect relevant context, documents, images, and UI. |
| **Codex (OpenAI)** | Tool use, coding, planning, and synthesis. | thin line | Consolidates findings from the third review check. |
| **Perplexity** | Web research and citations. | thin line | Checks claims against sources; scripted in this page, not connected to its service. |
| **Xcode (Apple)** | iOS builds and device work. | thin line | Checks iPhone-related work when relevant. |
| **Muse** | Independent audit and issue finding. | dashed line | Second review check: report errors, risks, and missing evidence. |

Grok Bot is the head of the AI team across projects and has the final team decision after the review checks. Owner remains the repository owner and controls Git push and merge.

## Three-check review order

1. **Gemini:** first pass for context, long documents, images, and whether the work fits the request.
2. **Muse:** second pass, independently checking errors, gaps, risks, and evidence.
3. **Collective review:** Codex synthesizes; Claude checks reasoning and implementation; Cursor checks the repository changes; Perplexity checks source quality and citations. They combine their findings as the third check.

Codex brings the three-check report to Grok Bot. Grok Bot makes and records the final team decision (PASS or FAIL) for every project. Keep this order even when a program is scripted or unavailable; state clearly when a review was unavailable or only modeled by a role prompt. Owner controls repository ownership and external Git actions.

For a live task, each connected agent must review the incoming handoff before doing its own assigned work, then return a concrete text deliverable and handoff to the next agent. Continue in order through the chain to Grok Bot, who reviews the complete set and gives the final situation report. Unmapped or failed stages are visibly marked unavailable/incomplete; never replace them with fake success. In this single-file page, model work is limited to plans, reviews, and handoff text: it cannot edit the repository, use tools, browse, or run builds. Grok Bot's report is not permission to change files, push, or merge.

## Specialties (each bot thinks differently on purpose)

Use each program's name and actual strength in reports; do not label every program as a generic reviewer. For this page, the brief descriptions above are the starting point. Keep `NODES` (`index.html`) in step with this table. Grok Bot's leadership applies across projects, not only this Brain repo.

## What the page models (from the Perplexity article)

1. **Watch.** This page processes prompts and replies sent through it, plus notes and corrections the Owner adds. It does not watch other apps or connected tools. Incognito sessions are ignored.
2. **Write.** It writes what it learns as linked entries, each pointing at its source: Concepts, Entities, Workstreams.
3. **Maintain.** Each run reinforces what is still true, updates what changed, and marks what is stale.
4. **You stay in charge.** Any entry can be opened, edited or deleted. Your corrections feed forward into the next run.
5. **Memory only.** Brain does not take actions or message you.

Wording checked against the live article on 2026-10-21 (it says it was last modified October 2, 2026). The article shows the Connected sources toggle and Instructions field only in a screenshot and does not explain them. **This page's own ideas, not in the article:** the full-volume 3D brain, the animations and moving handoffs, the agent stations and paths, the team diagram, the nine-agent team and the specialties above, the task-coverage strip, the admin-only login and the adults-only check, the incognito switch and "Run Brain now" button, the 30-day stale rule (the article gives no time rule), the rule that a deleted entry is not learned again, the optional Live AI mode, the text analysis that turns a real session into Concepts, Entities and a Workstream, and the password filter (simple pattern matching, not the AI-based filtering the article describes). There are no sample sources, scripted agents, sample connectors or demo clock any more.

## Working rules

- **MRI privacy:** traced dimensions from Owner's own MRI are in `mri/`; the visible paired-hemisphere diagram is a schematic, not a scan reconstruction. Only the traced outline numbers belong in this repo. Never add DICOM files, scan pictures (a side view shows the face), names, dates or IDs.
- One branch per piece of work. Open a **draft** pull request. Nobody merges except Owner.
- Never commit passwords, API keys or private data. The page filters common key and password patterns before saving (best effort, not a guarantee) and warns when it sees one. If a real secret shows up in a file, stop and tell Owner.
- **Build:** source is in `app/` (React, TypeScript, three.js). `npm run build` in `app/` writes the root `index.html` as one self-contained file Owner can open by double-click. Never edit the root `index.html` by hand. The earlier hand-written page and its Playwright checks live in `legacy/`.
- **Real AI only, always on** (Owner, Oct 2026: "always use real ai by default", then "only use real ai"). There is no off switch. The page makes no provider call until an admin with a key presses Send. It never uses web search. Any scripted lines or sample sources must be labeled as such and must never be presented as live research.
- Every fact in an answer carries a citation, citations are never reused across sources, and an unanswerable point uses the fixed sentence "The provided source documentation does not contain enough verified information to confidently answer …".
- **Look (changed by Owner, Oct 2026):** dark, glowing, free-floating full-volume brain. The home page is only the brain and its memory. About 52,000 points fill the volume, shaped from the traced outline (`mri/brain-outline.json`, shared with `app/src/data/outline.ts`). The brain is a solid white outline with a soft edge glow, drawn over the nodes. Nodes are flat dots in the format of the Brain video (size by weight, thin grey links, small grey labels, the focused one bold, unrelated ones grey), each with a soft halo. Keep distinct, persistent colours for Concepts, Entities and Workstreams, visible titles on the strongest memories and on any selected one, and visible links between related memories. Agents sit on `stations`, a live handoff travels its `route`, and idle paths stay faint and never animate. Show a coloured pulse and a moving handoff only during a real live provider request. The team node diagram stays as a second view. A generic skull and face (average template fitted to brain landmarks in `app/src/lib/skull.ts`, never traced from the MRI) surrounds the brain as one piece: graphite-white outline (#9aa3b4, opacity 0.45) with a faint glass body, masked by the stencil buffer so it is never drawn over the brain. Never trace a face from the scan. It is a schematic, not an anatomical model or MRI reconstruction. Change the look only when Owner says so.
- **Access (Owner, Oct 2026):** the page needs a login. Accounts are for adults (18+) only; only admins create accounts. Only admins can send tasks, add, correct or delete memory, change Live AI settings, back up, restore or erase, and manage accounts. There is one role: admin. There are no viewer accounts. The date of birth is checked once and never stored. Do not claim the login encrypts memory or proves age; the README says what it does and does not do. Do not add a self-signup path, a password-reset-by-anyone path, or any non-admin role. **Security (Owner, Oct 2026, "treat it as a secret government project"):** keep memory and remembered keys only in the encrypted, admin-signed vault (`brain.vault.v1`); never write them in plain text; keep the hashed Content Security Policy from `app/scripts/publish.mjs`; keep the idle, hidden-tab and double-Esc locks and the access log (no passcodes or task text in it). Use Brain's own RESTRICTED banner, never real government classification markings, and never claim the page is certified or government-approved.
- A live task starts only when an admin with a key presses Send. Brain's memory-maintenance run does not send prompts. Nothing on the page may be scripted or sample data.

## Live AI rules (Owner chose to build it on 2026-10-21; on by default since Oct 2026)

- **Always on, no off switch** (Owner, Oct 2026). `setLive` ignores `on: false`. Nothing ever sends a task by itself: every live task needs an admin to press Send, and the call caps stay.
- **Keys:** Owner creates them. **Never ask Owner to paste a key into a chat**, never put a key in a file, commit, test, screenshot, log, backup, transcript, or pull request. Keys live in the browser tab (or the device, only if Owner ticks "remember"). If a key ever appears anywhere in the repo, stop and tell Owner to rotate it.
- **One provider, one key:** the selected API provider/model powers all nine distinct role prompts. This is not a connection to separate apps such as Cursor, Muse, or Xcode; the Perplexity role does not browse or call Perplexity's service.
- **Spending:** retain the 9-call maximum per task and page load, the conservative output-token cap, and "Stop live now". Do not raise a limit or add a loop that makes calls without Owner pressing Send prompt.
- **Honesty:** every model-written message is labeled with its company and model. Live model stages review the incoming handoff, perform their role's text-only task, then hand off. Failed stages are marked incomplete and never replaced with success-shaped scripted text. The selected model has no repo, browser, or build tools in this page. Facts, citations, and deterministic pass/fail checks come from this page's own code; Grok Bot's report is a recommendation, not an edit or merge. Do not claim real services were tested: only fake servers have been (`tests/live-check.mjs`).
- Never send real keys or real traffic from tests. Tests use fake servers only.

## Before saying "done"

1. In `app/`: `npm run typecheck`, `npm test` and `npm run build` all pass, and the root `index.html` is the fresh build.
2. Open `index.html` in a real browser (tests do not render WebGL): create the admin, sign out and in, orbit and zoom the brain, click a memory, add a note as admin, then confirm the Accounts card only offers admin logins. Check phone width. Keep provider calls off unless Owner enables them and sends a task.
3. Complete the review sequence above: Gemini checks context, Muse independently audits, then Codex, Claude, Cursor and Perplexity combine their specialty reviews. Codex brings the findings to Grok Bot, who makes the final team PASS or FAIL decision. Report unavailable checks plainly.

## Look of the panels and handoffs (Owner, Oct 2026)
- All text sits in small bordered boxes (Cloudflare-style tiles): admin settings are cards in a grid, the login has small fact tiles, scene labels are boxed.
- Side panel panes only: dark glass with a faint Gemini-like gradient glow on the left and right edges (blue #4285f4, purple #9b72cb, rose #d96570). Do not put the glow on the login card or the 3D view.
- Each bot has its own colour (`AGENT_COLOR` in app/src/data/colors.ts): its brain dot, Team node, chat box glow, coverage chip and handoffs use it. Memory dots keep their type colours (Owner chose this, Oct 2026).
- Handoffs: the path colour melts from the sender's colour into the receiver's, the light eases in and out, the path keeps a 1.4 s afterglow, and agent dots ease between colours (no snapping). Each handoff shows the real word count passed. Memories sent as context fly from their dot to the first bot, and every finished bot sends its part to Grok Bot. No packet is ever drawn for data that was not really passed.
- Streaming, the Tasks list, the Flow box, reply-time speed and history glow (Owner: "do all above", Oct 2026) use only what really happened: streamed text, measured reply times (ms per bot) and word counts of real handoffs (`Session.flow`, `Session.ms`, cleaned by `cleanFlow`/`cleanMs` in lib/memory.ts). Never seed example tasks into the app; the five-task picture was a labelled mockup image only.
- **Checks (Oct 2026):** in `app/`, `npm run format`, `npm run lint` (Biome; ESLint's TypeScript plugin does not support TypeScript 7), `npm run typecheck`, `npm test`, `npm run build`, `npm run e2e` (Playwright, real Chromium on the built page). `.github/workflows/check.yml` runs them on every push. After any change in `supabase/`, run `bash supabase/tests/run.sh` (Docker only, throwaway Postgres): it applies every migration and asserts the access rules. The live task steps are in `app/src/lib/run-task.ts`; `store.ts` holds state only.
- **Typeface (Owner, Oct 2026): Minecraft font only** ("Minecraft" by Craftron Gaming, DaFont, listed 100% Free; file and notes in `app/src/assets/`). It is embedded as a data URL (the policy allows `font-src data:`). Its pixel grid is 1/16 em, so use only 16px for all text and 32px for titles (login heading, Brain name, big numbers); other sizes blur. One weight only: no bold, emphasis by colour. Characters it lacks (✓ ✕ · → …) fall back to system monospace.
- **No results unless AI (Owner, Oct 2026; "we are all one team", "adding memory helps brain learn", "I like the hive mind learning off itself"):** memory is written only by Grok Bot in one extra real AI call after a task (`app/src/lib/ai-memory.ts`, counted in the call limit); the local text learner and "Run Brain now" were removed. The chat shows only AI replies; Brain's own notes go to the status line and coverage reasons. Owner notes stay. Non-AI entries from before are moved to `Mem.archived` on load (kept, never shown or sent). Matching memory is sent as context by default.

## Cursor Cloud specific instructions

- Product code is `app/` on Node 22. Install with `npm ci --prefix app`, then `npm --prefix app exec -- playwright install --with-deps chromium`.
- The dev server is `npm run dev -- --host 0.0.0.0 --port 5173` from `app/`. It talks to the Supabase project named in `app/src/lib/config.ts`. Do not create accounts, type a real passcode, or press Send on that server.
- The safe browser check is `npm run build` and then `npm run e2e` in `app/`. Playwright opens the built root `index.html` and uses a fake backend. Do not hand-edit root `index.html`.
- `bash supabase/tests/run.sh` needs Docker, which this environment does not start. Run it only after a `supabase/` change when Docker is available.
- Root `package.json`, `test.mjs`, and `archil-project/` are not the Brain page. They need `ARCHIL_API_KEY` and stay out of the default setup.
