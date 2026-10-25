# Brain — Handoff Log

## Core Ethos (standing rules for every entry below)
> **"We are all one team of people and bots. Never hide information out of emotion: complete the task and push across the desk to the next person."** — Owner, Oct 2026

1. **Zero Concealment / Zero Emotional Filtering**:
   - Never downplay, sugarcoat, or hide errors, risks, failed stages, or credit exhaustion out of fear, pride, or emotion.
   - Report raw facts and blockers directly so the team acts on truth.
2. **Complete the Task Fully**:
   - Complete every assigned task start to finish without passing back half-done steps.
3. **Push Across the Desk**:
   - Package clean, structured handoffs and slide them across the desk so the next teammate can pick up and continue immediately.


---

# Working Website Fields, Multi-Company Keys & Dynamic Filtering — date not recorded (merged from Jerk.md)

## 1. AI Companies: Where To Get Keys & What They Power
| Company | Key Format | Portal / URL | Bots Powered Directly | Specialty in Brain |
| :--- | :--- | :--- | :--- | :--- |
| **Anthropic** | `sk-ant-...` | [console.anthropic.com](https://console.anthropic.com) | Claude, Artifact | Reasoning, structured building, clear writing |
| **OpenAI** | `sk-...` | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | Codex, ChatGPT, Canvas, Muse | Tool usage, synthesis, code edits |
| **Google** | `AIza...` | [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) | Gemini | Large context, long documents, cross-checking |
| **xAI** | `xai-...` | [console.x.ai](https://console.x.ai) | Grok Bot (Lead), Grok | Strategic challenges, reviews, final pass/fail call, memory filing |

*Note*: Secondary tool/editor roles (Cursor/Anysphere, Xcode/Apple, Perplexity) participate in the team handoff chain and run through your configured AI keys. You can connect any one company, or connect all four for native multi-company execution!

## 2. What Was Fixed in Website Fields
1. **Multi-Company Key Management**:
   - In `AdminPanel.tsx`, added a new **"All Company API Keys"** card displaying independent inputs, status pills, Test buttons, Clear buttons, and console links for each of the 4 companies.
   - Fixed `store.ts` so setting or clearing a key for one company preserves all other company keys instead of wiping them.
   - Fixed `store.ts` so switching the default provider dropdown preserves all keys.
2. **Model Input Box**:
   - Converted to controlled input with `onBlur` persistence so users can backspace, delete all text, paste, and type custom model names without regex rejection during keystrokes.
3. **Limits Number Fields (`Tokens per reply`, `Calls`)**:
   - Converted to controlled inputs with `onBlur` clamping so users can type numbers like "50" or "8" without premature keystroke clamping.
4. **Focus Textarea**:
   - Converted to controlled input syncing with `mem.settings.instructions` on load and saving to memory on blur.
5. **Backup Passphrase**:
   - Added live character length counter (`${phrase.length}/10 characters minimum`) so users immediately see when the button becomes active.
6. **Composer Activation**:
   - Fixed `Composer.tsx` so the prompt box activates as soon as ANY company key is set (not blocked if the default provider has no key).
7. **Per-Bot Native Execution**:
   - In `run-task.ts`, each bot dynamically uses its native company provider if that company's key is configured, or seamlessly falls back to whichever provider has a key.

## 3. How to Check It
1. Run typecheck in `app/`:
   ```bash
   cd app && npm run typecheck
   ```
2. Run test suite in `app/`:
   ```bash
   cd app && npm test
   ```
   (17 test suites, 93 tests pass)
3. Build single-file `index.html`:
   ```bash
   cd app && npm run build
   ```
4. Verify in browser (`index.html`):
   - Open `index.html` and go to the Admin tab.
   - In "All Company API Keys", enter keys for Anthropic, OpenAI, Google, or xAI.
   - Verify all keys remain saved, testable, and persistent.

## 4. Multi-Bot Sign-Off (as recorded in Jerk.md)
- **Claude**: Built the multi-company key management, fixed all input fields, and updated tests.
- **Cursor**: Handoff recipient ready to inspect local `main`.
- **Gemini**: Verified company key formats, portals, and field behaviors.
- **ChatGPT**: Verified Composer activation and fallback provider routing.
- **Muse**: Integrity checked; RedMed preserved.
- **Grok Bot (in charge)**: Verified real results (17/17 test suites, 93/93 tests passing, production single-file build verified). Result: **PASS**.

## 5. Open Items For The Next Person
- No date, branch, head commit, or deploy state was recorded for this work. Confirm whether it is in the build currently live at `https://redeemed.live`.
- Test counts don't line up with the other entries: this one says 17 suites / 93 tests; the deployment entry below says 18 files / 88 tests. Re-run `npm test` and record the real numbers.

---

# Personal Collection of Memories, Work Tracker, Team Inspector & Merged Deployment — 2026-10-24

## 1. Directive & Summary
- **Requests**:
  - "polish the site, this is going to be my personal collection of memories going to be used to keep track of work and see you guys"
  - "merge push all main rm rest deploy"
- **Features Implemented & Verified**:
  1. **Personal Collection of Memories**:
     - Instant memory sorting in Memory Panel by **Recent**, **Strongest** (frequency), and **A–Z** alphabetical.
     - Reciprocal memory linking: linking memory A to memory B automatically links memory B back to memory A in both Add and Correct note forms.
     - Work Tracker banner summarizing total, active, and completed workstreams.
     - 1-click status toggles on workstreams between active (`fresh`) and completed (`stale`).
     - Origin badges distinguishing user notes from AI takeaways.
     - "+ Ask Team" button prefilling prompt composer with memory topic.
     - Markdown export button for 1-click clipboard export.
  2. **"See You Guys" (Interactive Bot Inspection & Roster)**:
     - `AgentInspector` modal: profile, avatar, doctrine, stage, active provider key status, specialty, core skills, incoming/outgoing handoffs, and direct task launcher.
     - Clickable 3D floating bot tags in WebGL brain scene that open the inspector.
     - Interactive Team Diagram nodes with spotlighting (focused bot highlights, other connections dim) and an interactive "THE TEAM:" roster bar.
     - Clickable bot name headers in Live Chat messages and Coverage chips.
  3. **Work Tracking**:
     - Live task search filter in Live Chat session history.
  4. **Engine & WebGL Fixes**:
     - Matched uniform `uHalo` precision across VERTEX and FRAGMENT shaders to `precision highp float;`.
     - React 19 / Drei unmount guard on `Node.prototype.removeChild` in `main.tsx`.
  5. **Branch Merge & Clean Untracking**:
     - Untracked `app/node_modules/` from Git repository to remove 11,700 tracked files and keep repo clean.
     - Merged with canonical `Roooted1776/Nodes` origin/main tracking Supabase database, responsive panel (32vw), and file import modal.
     - Cleaned up leftover branches (`rm rest`).
  6. **Production Deployment & Verification**:
     - Compiled single-file production bundle `index.html` (1,593 KB) with script hash pinning.
     - All 18 unit/UI test files (88 tests) pass.
     - Playwright Chromium real-browser test passed (33.0s).
     - Deployed atomically to Hostinger VPS (`/var/www/redeemed/index.html`).
     - Verified live production site `https://redeemed.live` returning HTTP 200 with matching build.

---

# Website Complete Functionality Verification & Deployment — 2026-10-24

## 1. Directive & Summary
- **Request**: "make sure that the website functions with complete function"
- **What Was Done**:
  1. **Full Test Suite & Linter Execution**:
     - `biome check`: Clean (0 errors).
     - `tsc --noEmit`: Clean (0 type errors).
     - Vitest suite: 17/17 test files passed, 78/78 tests passed.
  2. **Playwright Chromium E2E Verification**:
     - Fixed fake backend interceptor in `app/e2e/fake-backend.ts` to handle database persistent memory routes (`/rest/v1/projects`, `/rest/v1/memories`, `/rest/v1/sessions`, `/rest/v1/rpc/*`).
     - Real Chromium headless test passed (`e2e/smoke.spec.ts`, 33.6s):
       - First-run admin setup with adult check and setup code.
       - 3D WebGL brain rendering on canvas (41 draw calls, 10 dots, 368 line segments, 132k outline triangles).
       - System check: shaders, drawing, AES-256-GCM encryption, policy, storage all pass.
       - Lock screen and sign-in re-authentication.
       - 3D canvas orbit and zoom.
       - Memory note creation, node placement, and 3D raycast click selection.
       - Multi-user access control: admin adding viewer account, viewer tab sign-in with restricted permissions.
       - Live chat BroadcastChannel real-time sync across windows.
       - Mobile responsive layout check at 390px viewport.
       - 0 console errors, 0 page errors, 0 CSP violations.
  3. **Interactive Project Node Selector in Composer**:
     - Added "+ New project…" option to the project selector in `app/src/components/Composer.tsx` so users can create and switch projects on the fly.
     - Added immediate database sync on admin sign-in in `app/src/auth-store.ts`.
     - Rebuilt single-file production bundle `app/dist/index.html` and root `index.html` (1,550 KB, SHA-256: `82d76aad9d0a9fed425d5cbe0636342d9477f0bdb66c538c8f62dab19e653757`).
  4. **Live Production Deployment to VPS & Public Verification**:
     - Uploaded and atomically deployed bundle to Hostinger VPS 2010795 (`/var/www/redeemed/index.html`).
     - Previous served version backed up safely in `/var/backups/nodes/`.
     - Verified live production domain `https://redeemed.live`:
       - `http://redeemed.live` -> HTTP 308 redirect to HTTPS.
       - `https://www.redeemed.live` -> HTTP 308 redirect to apex.
       - `https://redeemed.live` -> HTTP 200 (Caddy + Strict-Transport-Security + CSP + X-Frame-Options: DENY).
       - Live response SHA-256 matches local build byte for byte (`82d76aad9d0a...`).
       - Live browser smoke test via Playwright headless Chromium returned HTTP 200, page title "Brain", access terminal visible, and 0 errors.

---

# Persistent Database Memory Handoff — 2026-10-24

## 1. Directive & Summary
- **Request**: "create persistant memory thats the database job"
- **Architectural Implementation**:
  1. **Database Migration (`supabase/migrations/20261024210000_persistent_memory.sql`)**:
     - Establishes first-class persistent tables for project nodes (`public.projects`), memory entries (`public.memories`), and task sessions (`public.sessions`).
     - Added `project` and `project_id` foreign associations and indices to `memories` and `sessions`.
     - Seeded root `'Brain'` project node.
     - Implemented atomic database procedures `public.upsert_memory` and `public.upsert_session` with strict security definer execution.
     - Configured RLS policies: authenticated members read projects, admins manage them, anon is blocked.
  2. **Application Persistence Sync (`app/src/lib/cloud.ts` & `auth-store.ts`)**:
     - Added `syncMemoryDatabase(mem)` to write memory entries, project nodes, and task sessions to database tables in real-time.
     - Wired into `auth-store.ts` write queue so every memory save updates both the authenticated encrypted vault and the database relational tables.
  3. **Local Store Initialization (`app/src/store.ts`)**:
     - Connected `loadMem(ls)` on boot so offline/local memory and sessions are automatically loaded and never lost across browser reloads.
  4. **Verification**:
     - `tsc --noEmit` clean (`0` errors).
     - Biome lint checks passed.
     - 17/17 test suites, 78/78 tests passed.
     - Production single-file bundle rebuilt at `index.html` (1,550 KB).

---

# Auto-Scroll & Archil CLI Tool Handoff — 2026-10-24

## 1. Directive & Summary
- **Requests**:
  - `fix it` (resolving `sudo: archil: command not found` on macOS)
  - `set auto svroll` (setting auto-scroll in the Brain chat interface)
- **What Was Done**:
  1. **Auto-Scroll in Brain Nodes (`ChatPanel.tsx` & `styles.css`)**:
     - Auto-scroll is enabled by default (`true`).
     - Auto-scroll keeps chat pinned to the bottom dynamically during live bot streaming (`draft.text`), when tasks/messages are added (`log.length`, `msgs.length`), when viewing session history, and when flows update.
     - Added an interactive `Auto-scroll on / off` toggle in the `.live-line` bar with pressed state and aria labeling.
     - Added smart manual scroll detection: if the user scrolls up to review previous messages, auto-scroll pauses safely; scrolling near bottom resumes it.
     - Added a floating `↓ Auto-scroll` button when scrolled up, allowing 1-click re-pinning to the newest stream.
     - Tests: Added unit test in `app/test/ui.test.tsx` verifying default auto-scroll and toggle states. 17/17 test suites, 78/78 tests pass.
     - Production bundle rebuilt: `index.html` (1,549 KB).
  2. **Archil CLI Command on macOS (`/opt/homebrew/bin/archil`)**:
     - Built and installed the native CLI tool `/opt/homebrew/bin/archil` with `chmod +x`.
     - Supports commands: `mount`, `unmount`, `list`, `status`, `version`.
     - Parses Linux-style parameters: `archil mount <disk> <mountpoint> --region <region> -t <token>` (or `ARCHIL_MOUNT_TOKEN`).
     - Bridges to macOS FSKit extension using `/usr/local/bin/archil-mount` under `/Volumes/<disk>`, and automatically links target mountpoints like `/mnt/archil` directly to the volume.
     - Registered and enabled `com.archil.Archil.Extension` and `com.archil.Archil.FinderSync` via `pluginkit`.

---

# Project-Node & Smaller Task Node Interaction Handoff — 2026-10-24

## 1. Directive & Architectural Mandate
- **Mandate**: "make sure the memory saves and updates and ech task is in a project and that project is a node" & "so only when you click the smaller node do you see the task"
- **Architecture**:
  - Memory persistence is continuous (`saveMem` local fallback + encrypted vault sync).
  - Every task runs in an assigned Project (default `Brain` or custom project).
  - Each Project is represented as a primary **Workstream Node** (green 3D node) in the Brain graph.
  - Each Task in that project is rendered as a distinct **smaller node** (cyan 3D sphere, radius 0.055) orbiting the parent project node and linked by a fine beam.
  - **Clicking the smaller node** opens that task session in the side panel, displaying the task's prompt, bot stream, handoff word counts, reply times, and coverage.

## 2. Exactly What Changed
1. **`app/src/components/BrainScene.tsx`**:
   - Added calculation of task node coordinates orbiting their respective project node in 3D.
   - Rendered smaller task nodes (`sphereGeometry args={[0.055, 12, 12]}`) and connecting line segments.
   - Attached click handler to the smaller node to trigger `viewSession(task.id)` and focus camera/panel on the task.
   - Added interactive hover tag (`.task-node-tag`).
2. **`app/src/components/Home.tsx`**:
   - Added `Task (smaller node)` to the 3D Brain legend.
   - Updated hint: *"Drag to turn the brain · scroll to zoom · click a smaller node to view task"*.
3. **`app/src/lib/memory.ts` & `ai-memory.ts`**:
   - Added `project` and `projectId` to `Session`.
   - Added `ensureProjectNode()`: creates/strengthens the `workstream` project node and connects newly filed memories.
4. **`app/src/lib/run-task.ts` & `store.ts`**:
   - Tasks stamped with active project and project node ID.
   - `commit()` guarantees continuous storage saving with `saveMem`.
5. **`app/src/components/Composer.tsx`, `Tasks.tsx`, `MemoryPanel.tsx`**:
   - Interactive project node selector in composer.
   - Task cards display green project pill `[Brain]` and focus project node in 3D.
   - Project nodes list all associated tasks with 1-click navigation.
6. **`app/src/styles.css`**:
   - Styled `.task-node-tag`, `.tproj`, and `.composer-proj-row`.
7. **`index.html`**:
   - Recompiled into single-file production asset (`1,547 KB`).

---

# UI Adjustments & Session Handoff Record — 2026-10-24

## 1. Overview & Directive
- **Task**: Audit and apply refined UI adjustments across the application to fix visual, mobile, layout, and ergonomic friction points.
- **Explicit User Constraint**: *"do everything but edit the animated and interactive website template i told you to strip from."*
- **Preserved Components**: `BrainScene.tsx`, `skull.ts`, `shaders.ts`, `geometry.ts`, `outline.ts`, and `TeamDiagram.tsx` were kept 100% untouched.

---

## 2. Exactly What Changed & Why

### A. Memory Filter Pluralization Typo
- **File**: `app/src/components/MemoryPanel.tsx`
- **Issue**: Line 48 used `{TYPE_LABEL[t]}s`. For `entity`, this rendered as `Entitys 0` on the UI.
- **Change**: Changed to `{t === 'entity' ? 'Entities' : `${TYPE_LABEL[t]}s`} {counts[t]}`.
- **Result**: Displays grammatically correct `Entities 0`.

### B. Memory Filter Button Grid Symmetry
- **File**: `app/src/styles.css`
- **Issue**: The four filter buttons (`All`, `Concepts`, `Entities`, `Workstreams`) previously wrapped awkwardly into a 3-and-1 split, leaving `Workstreams 0` stranded alone on its own line.
- **Change**: Updated `.filters button` to `flex: 1 1 calc(50% - 6px)` with centered inline flex layout.
- **Result**: Creates a clean, balanced 2×2 button grid (Row 1: `All` & `Concepts`, Row 2: `Entities` & `Workstreams`) that fits comfortably within the fluid side panel width without clipping text.

### C. Mobile Classification Banner Wrapping & Overlap
- **Files**: `app/src/App.tsx`, `app/src/styles.css`
- **Issue**: On mobile viewports (≤600px width), the 53-character banner `RESTRICTED · AUTHORIZED PERSONNEL ONLY · PROJECT BRAIN` overflowed the fixed 22px `--band` height and wrapped to two lines. This pushed the page down and covered the header bar (hiding brand, session, and panel controls).
- **Change**:
  - In `App.tsx`, wrapped banner text in `.banner-full` and `.banner-short` spans.
  - In `styles.css`, added `white-space: nowrap`, `overflow: hidden`, and `text-overflow: ellipsis`.
  - On screens ≤600px, `.banner-full` is hidden and `.banner-short` displays `RESTRICTED · PROJECT BRAIN`.
- **Result**: Fits cleanly on a single 16px line on phones (tested at 390px iPhone width) with no overflow, leaving the header, brand, and 3D visualization fully visible and interactive.

### D. Desktop Full-Screen Panel Collapse Toggle
- **Files**: `app/src/components/Home.tsx`, `app/src/styles.css`
- **Issue**: The header toggle button (`Hide panel` / `Panel`) was restricted by class `.only-narrow` to screens <900px. Desktop users had no way to collapse the side panel to view the 3D Brain full-screen.
- **Change**: Renamed class to `.panel-toggle` and set `display: inline-block` across all screen widths.
- **Result**: Desktop users can click `Hide panel` to expand the 3D visualization across 100% of the screen, and click `Panel` to bring it back. (Note: Clicking any agent station or memory dot in the 3D scene continues to auto-expand the panel and scroll to that item).

### E. 1-Click Copy Deliverable on Chat Messages
- **Files**: `app/src/components/ChatPanel.tsx`, `app/src/styles.css`
- **Issue**: Copying an agent's technical output, plan, or review required manually drag-selecting pixel text across the card.
- **Change**:
  - Added a `CopyButton` component that writes to `navigator.clipboard` and provides visual `Copied` confirmation.
  - Positioned the button in each message card's `<header>` next to the bot role and timestamp.
  - Styled `.copy-btn` with subtle borders, smooth hover transitions, and dark theme consistency.
- **Result**: 1-click copying of any agent message deliverable.

### F. Audit Log Horizontal Overflow in Side Panel
- **File**: `app/src/styles.css`
- **Issue**: `.audit li` was styled with a 3-column fixed grid (`grid-template-columns: 230px 110px 1fr`). This required 340px just for the timestamp and username, causing long events (e.g. `Restored memory from a backup (12 entries)`) to overflow horizontally off the side panel.
- **Change**: Changed `.audit li` to a responsive 2-line layout:
  - Line 1: `time` on the left, `b` (username) aligned right.
  - Line 2: `span` (event description) spanning full width with `word-break: break-word`.
- **Result**: Fits cleanly in any sidebar width with zero horizontal clipping or scrollbar clutter.

### G. Setup & Login Modal Safe Bottom Padding
- **File**: `app/src/styles.css`
- **Issue**: On shorter viewports, the setup card's bottom tiles (`ADMINS ADD`, `ENCRYPTED`, `NO RECOVERY`) were cut off behind the bottom classification banner.
- **Change**: Added `padding: 24px 20px calc(var(--band) + 24px)` to `.access`.
- **Result**: The entire card and all informational tiles can be scrolled into view without banner interference.

### H. Production Build Artifacts
- **Files**: `app/dist/index.html` and root `index.html`
- **Result**: Recompiled via `npm run build` into a self-contained single-file bundle (1,542 KB) with SHA-256 pinned script tags compliant with the Content Security Policy.

---

## 3. Files Touched Summary

| File | Type | Changes Made |
| :--- | :--- | :--- |
| `app/src/components/MemoryPanel.tsx` | Source | Fixed `Entitys` → `Entities` pluralization. |
| `app/src/components/Home.tsx` | Source | Swapped `.only-narrow` for `.panel-toggle`. |
| `app/src/components/ChatPanel.tsx` | Source | Added `CopyButton` helper & header button. |
| `app/src/App.tsx` | Source | Added `.banner-full` and `.banner-short` spans. |
| `app/src/styles.css` | Stylesheet | Updated `.banner`, `.filters button`, `.panel-toggle`, `.audit li`, `.access`, and added `.copy-btn`. |
| `app/dist/index.html` | Build artifact | Inlined production bundle generated by Vite singlefile. |
| `index.html` | Build artifact | Root production file synced by `publish.mjs`. |
| `HANDOFF-ui-adjustments.md` | Documentation | This handoff record. |

---

## 4. Verification Pipeline & Real Results

Every check specified in `CLAUDE.md` and `AGENTS.md` was executed and verified:

1. **Format Check**:
   - Command: `npm run format`
   - Result: `Formatted 68 files in 32ms. No fixes applied.` (Code formatting clean).
2. **Lint Check**:
   - Command: `npm run lint`
   - Result: `Checked 68 files. 29 warnings.` (Matches existing baseline; 0 new warnings, 0 errors).
3. **Typecheck**:
   - Command: `npm run typecheck`
   - Result: `tsc --noEmit` exited with code 0 (zero TypeScript errors).
4. **Unit & Integration Tests**:
   - Command: `npm test`
   - Result: `17 passed (17), 77 passed (77)` in 2.62s.
5. **Production Build**:
   - Command: `npm run build`
   - Result: `built in 277ms; wrote ../index.html 1542 KB; 1 script(s) pinned by hash`.
6. **Real Browser Chromium E2E**:
   - Command: `npm run e2e`
   - Result: `1 passed (30.2s)` covering admin setup, WebGL drawing, live transport, memory navigation, and 390px mobile responsiveness.
7. **Visual Screenshot Inspection**:
   - Captured and reviewed screenshots:
     - `v2-memory-tab.png`: Verified clean 2×2 grid layout and `Entities 0`.
     - `v2-mobile.png`: Verified single-line `RESTRICTED · PROJECT BRAIN` with full header visibility.
     - `v2-brain-chat.png`: Verified `Hide panel` desktop button and `Copy` button on messages.

---

## 5. Review Sequence Handoff

Per Owner's standing rule:
1. **Claude (Anthropic)**: Built, tested, verified, and recorded all changes (COMPLETED).
2. **Cursor**: Picks up this handoff next to inspect code diffs and integration risks.
3. **Gemini**: First context/UI review check.
4. **ChatGPT**: Independent reasoning & code check.
5. **Muse**: Independent audit check for errors, gaps, or risks.
6. **Grok Bot (In Charge)**: Gathers all checks, reviews the real evidence, and calls final PASS/FAIL.

---

## 6. How the Next AI Should Check It

In directory `/Users/claude/Brain/Nodes/app`:
```bash
# 1. Verify code formatting and linting
npm run format
npm run lint

# 2. Verify types and unit tests
npm run typecheck
npm test

# 3. Verify production build
npm run build

# 4. Verify in real headless Chromium browser
npm run e2e
```

To manually inspect the UI:
- Open `index.html` in any browser.
- Check the Memory tab to confirm the balanced 2×2 button grid and `Entities` label.
- Click `Hide panel` in the top right to verify desktop visualization expansion.
- Check mobile responsive view (press Cmd+Option+I and toggle device toolbar to iPhone 390px).

---

## 7. Git & Deployment State
- **Branch**: `main`
- **Head Commit**: `2d09dac`
- **State**: Uncommitted verified changes in working tree.
- **Rule Compliance**: Never `git push`. Max pushes himself when available. No remote branches or tags were created.
