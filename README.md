# Brain

Owner's **Orchestration Brain**: a full 3D brain that shows what a team of AI agents learned, and how work moved between them. Open `index.html` in a browser (double-click it). No install is needed to use it.

Source lives in [`app/`](app) (React, TypeScript, three.js). The root `index.html` is the built, single-file result. The earlier hand-written page was removed in Oct 2026; it is still in git history before this change.

## Look

Every piece of text uses the Minecraft pixel font (Craftron Gaming, from DaFont, listed 100% Free), at 16px, or 32px for titles, which are the two sizes where its pixels stay sharp. It is built into `index.html`, so it works offline.

## Who can do what

Brain asks for a login. Accounts are for adults (18+) only, and only an admin can make one.

| | Admin | Viewer |
| --- | --- | --- |
| See the brain, the team diagram and memory | yes | yes |
| Watch the live chat and task coverage | yes | yes |
| Send a task to the team | yes | no |
| Add, correct or delete memory | yes | no |
| Live AI settings, keys, backup, erase | yes | no |
| Add or remove accounts | yes | no |

The first time you open Brain it asks you to create the admin. After that, only admins can add accounts.

## What you see

- **Home page:** the brain. About 52,000 points fill its whole volume, shaped from the outline traced from your MRI slice (outline numbers only, see `mri/`). Two hemispheres, folds, and a cerebellum. It is a schematic, not an anatomical model or a scan reconstruction.
- **The skull** is a generic, average skull and face (not traced from the scan) drawn as a faint graphite-white outline with a light glass body around the brain. It is never drawn over the brain, and it turns and zooms with it as one piece. Its strength is `SKULL_OPACITY` (0.45) in `app/src/components/BrainScene.tsx`.
- **The brain** is a solid white outline with a soft glow. **Memory nodes** are flat coloured dots behind it, sized by how often they were seen (blue = Concept, green = Entity, orange = Workstream), each with a soft halo. Click one: its links and neighbours stay coloured and labelled, everything else fades to grey.
- **Agents** sit on stations in the brain, with faint paths between them. During a real task, each handoff travels its path as a moving light in the AI provider's colour. Long hops pass through the hub.
- **Team view:** the node diagram of who hands work to whom. Drag a node to move it.
- **Live chat** shows the task as it happens, with a **coverage strip**: which agents covered the task, which were skipped (for example Xcode on a task that is not about iOS) and which failed.

Nothing on the page is invented. Memory starts empty and fills only from tasks an admin runs with Live AI.

## How Brain learns

Only AI writes results. After a task, **Grok Bot** (the team head) makes one more real AI call and files up to three memories: **Concepts** (ideas and rules), **Entities** (named things) and **Workstreams** (ongoing work). Each points back to its task. When it names something already remembered, that memory gets stronger instead of copied. Your own notes (Memory tab → Add a note) are kept too, and help the team learn.

The next task gets the matching memories as context, so the team learns from itself. This call counts in the 9-call limit, so an iOS task (9 bots) has no call left to file memory. If the reply cannot be read, nothing is remembered and nothing is made up. Memories made earlier by the old local text analysis are archived: kept, but not shown or sent.

## Real AI only (always on; provider charges apply)

Choose one provider (Anthropic, OpenAI, Google or xAI), a model ID and one key, in the Admin tab. The same model powers all nine roles. It does not connect to separate apps such as Cursor or Xcode, and the Perplexity role does not browse. Every reply is labelled with its provider and model, is unverified text, and cannot change files.

- Create the key yourself on the provider's website. Until a key is set, the Live chat and Admin tabs show a **Connect real AI** box: steps for the chosen provider, a link to its own key page (Claude Console, OpenAI Platform, Google AI Studio, xAI Console), a paste box with **Save and test**, and a warning if the key looks like another provider's. Never paste a key into a chat. It stays in the tab unless you tick remember (then it is kept in the encrypted vault).
- Brain **only uses real AI** (Owner, Oct 2026). There is no off switch and no scripted fallback. Nothing is sent until an admin with a key presses Send.
- Default models (checked Oct 2026): Anthropic `claude-haiku-4-5`, OpenAI `gpt-4o-mini`, Google `gemini-3.1-flash-lite`, xAI `grok-4.3`. A saved setting that names a retired model (`claude-3-5-haiku-latest`, `gemini-2.0-flash-lite`, `grok-3-mini` and similar) moves to the default. Press **Test** after changing provider.
- Replies **stream**: each bot's text appears in the chat as it arrives, and its dot in the brain flashes with each new piece. If a provider answers without streaming, Brain reads the whole reply as before.
- **Tasks list** (Live chat tab): the running task and saved tasks, newest first, five at a time. Each shows its nine bot dots (filled = covered, ringed = working, red = failed, dashed = skipped), a status and one line of detail. Click one to open it.
- **Flow box**: after a task, the words really passed between each pair of bots and each bot's reply time. Saved with the session.
- Handoff lights travel faster when the sender answered quickly and slower when it took long (its real reply time). Paths that carried more words over all saved sessions glow a little brighter.
- Limits: 9 calls and one task per page load, 120 tokens per reply by default (150 at most). **Stop** cancels calls in progress.
- Matching memory is sent with each task ("Send matching memory with a task", on by default) so the team learns from itself. An admin can turn it off in the Admin tab.
- The task and each handoff go to the provider, including for incognito tasks.
- Works only when `index.html` is opened from your computer; a web preview may block calls.

## Security: what it does and does not do

Brain is built like a restricted system, within what a single file with no server can do.

- **Encrypted at rest.** Memory and any remembered AI key are stored only inside an encrypted vault (AES-256-GCM). Nothing readable is left in the browser's storage, and older plain-text memory is moved into the vault on the first admin sign-in.
- **Names and passcodes:** names are 2 to 32 letters or numbers with single spaces (no symbols). Passcodes need at least 5 characters (Owner's choice); longer is much safer, because the passcode also unlocks the encrypted memory.
- **Each account unlocks with its own passcode.** One PBKDF2 run (600,000 rounds) gives a check value, which is stored, and a key that opens that account's sealed copy of the vault key, which is never stored. Reloading the page locks it again.
- **Only admins can change memory, and the vault enforces it.** Every save is signed with a key only admins hold. Each account checks the signature with the key from its own sealed copy, so a viewer cannot forge or edit memory even with developer tools; a changed vault is refused and logged.
- **Locked down.** A content policy lets only the page's own script run (pinned by hash) and lets the page connect only to the four AI providers, so it cannot send data anywhere else.
- **Locks:** after 15 idle minutes, after a minute hidden, or when you press Esc twice. The screen blurs while the tab is hidden, and printing is blocked.
- **Access log** (Admin tab): sign-ins, failed tries, locks, account and memory changes. It never records passcodes or task text, and an unknown name typed at sign-in is not written down.
- **Encrypted backups** open only with the passphrase chosen when making them.
- **Adults only:** the date of birth is typed in once, checked, and thrown away. A failed check pauses new accounts in this browser for a day. Only admins can create accounts.

What it cannot do: it is not a certified or government-approved system, and there is no server, so it cannot stop someone who controls the computer while an admin is signed in. A viewer can delete the vault (but not change it). The age check cannot prove anyone's age. The banner is Brain's own marking, not a government classification. **There is no recovery:** if every admin passcode is forgotten, the memory cannot be opened, so keep an encrypted backup. Viewers watch the live chat only in the same browser as the admin.

## Build and test (for developers)

```
cd app
npm install
npm run format      # Biome formatter (120 columns)
npm run lint        # Biome linter
npm run typecheck
npm test            # 89 unit and UI tests (Node and a simulated browser)
npm run build       # type-checks, bundles, and writes ../index.html
npm run e2e:install # once: downloads Chromium for the browser test
npm run e2e         # opens the built ../index.html in real Chromium: sets up an admin, draws the brain, runs System check, locks and signs back in
```

GitHub runs all of these on every push (`.github/workflows/check.yml`) and keeps the browser test's screenshot and System check report as a downloadable artifact.

The unit tests run in Node and a simulated browser and do not draw WebGL. The browser test does, and the Admin tab's **System check** runs the GPU, drawing, encryption, policy and storage checks in your own browser with a report to copy. Still look at the page yourself: the brain, memory nodes, orbit and zoom, a task with a real key, phone width, and a viewer tab beside an admin tab.

## Honest limits

- The brain is a schematic, not anatomy. Tract names borrow from real fibre systems, and the layout is designed, not measured.
- Memory is stored in this browser only. Back it up (Admin tab).
- Common password and key patterns are filtered before saving. This is best effort, not a guarantee. Do not paste real secrets.
- Not tested against live AI services. Tests use fake responses only; they check request shape, labelling, limits and key handling, not that a provider accepts the request.
- Model IDs are editable because providers change their catalogs; the examples are starting values.

## Team and rules

See [`AGENTS.md`](AGENTS.md). RedMed is a separate project and is never touched from here.
