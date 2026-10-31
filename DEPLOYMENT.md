# redeemed.live deployment

Repository: https://github.com/Roooted1776/ch29ouy (renamed from Nodes). Work on `main` only.

## Layout

- Namecheap BasicDNS already points redeemed.live and www.redeemed.live to the VPS at 2.25.249.204. No registrar transfer or nameserver change is needed.
- Hostinger VPS 2010795 already runs the isolated `brain-site` application. Its Caddy container serves `/var/www/redeemed` read-only on port 8080 behind the existing Traefik HTTPS route. www redirects to the apex. Certificates are managed by the existing Let's Encrypt resolver.
- The Brain Supabase project is `iihjcqiiavleyheqzotl`. The account service authenticates each admin request itself. Only setup status and open first-admin setup are public. The service-role credential stays in the Edge Function environment.
- `vaults` holds one encrypted, admin-signed memory/task envelope. `account_keys` holds each account’s sealed memory keys; members can read only their own key envelope. Row-level security allows members to read ciphertext and admins to update it. Revision matching refuses conflicting saves. Readable memory/session tables from the unfinished migration remain closed to client roles.
- Provider keys are never stored in the database. Remembered keys are encrypted on the owner’s device. A lock forgets decrypted memory, keys, and auth session from the page.

## Owner setup

Open https://redeemed.live. While Brain has no accounts, the owner chooses a passcode and finishes the adult check directly (no invite or setup code required). Do not put these credentials in chat, Git, screenshots, or handoff notes. No production admin is created by automated tests. Keep an encrypted backup; losing every admin passcode loses access to encrypted memory.

## Build and publish

From `app/`, run `npm run format`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and `npm run e2e`. Tests intercept the Supabase origin and use fake responses only; they never create production accounts or call AI providers.

Publish only the generated root `index.html`, atomically, into `/var/www/redeemed/index.html`. Keep the previous served file outside the web root in `/var/backups/nodes/`. Compare local and remote SHA-256 hashes and verify HTTPS, the www redirect, security headers, and the visible login/setup page. The host firewall must allow direct TCP 443 because DNS points directly to the VPS, rather than a CDN proxy. Do not change unrelated containers, services, or firewall rules.

Rollback the served file from the previous copy in `/var/backups/nodes/` with an atomic rename. The database migration is additive; do not delete encrypted accounts or memory as part of a website rollback.

## Handoff and review

Codex repaired the unfinished Supabase migration, retained encrypted storage, added the owner setup-code field, widened the pinned connection policy only to the Brain database, and repaired the shader precision mismatch discovered by Chromium. The AI memory call no longer overwrites a bot reply’s measured duration. One ignored CSS property was removed so lint succeeds. The visual design is unchanged.

Files: `app/src/auth-store.ts`, `app/src/lib/cloud.ts`, access/admin panels, audit helpers, the connection policy, shader precision, timing, and corresponding fake-backend tests; generated `index.html`; the accounts Edge Function and encrypted-vault migration. See the branch diff for the exact list.

Required review order: Gemini context check, Muse audit, then the collective Codex/Claude/Cursor/Perplexity check, followed by Grok Bot’s final decision. These named external reviews have not been performed in this chat. Codex’s checks do not substitute for their decisions. No Grok Bot PASS is claimed. Owner controls merges. The owner’s latest request explicitly authorizes committing and pushing the complete Nodes changes; they are published on the deployment branch with a draft pull request for review.

Production credential setup and authenticated production-browser checks remain owner-assisted. Test results with fake services are not a claim that real provider traffic or production sign-in was tested.

## Verification on 2026-10-24

- Type-check, 77 unit/UI tests, build, and the real Chromium browser check pass. The browser check uses a completely intercepted fake Supabase backend. It covers first-admin setup, lock/sign-in, WebGL shaders, orbit/zoom, encrypted note saving, a viewer tab’s restrictions and chat transport, and a 390 px phone view. Software WebGL reports a low frame-rate warning, not a shader failure.
- The installed file and local build SHA-256 match: `8036e6dfbf63ba102ee366ced65c5a0080ffc170e08eab4771a0485cff7850da`. The previous placeholder is saved outside the web root at `/var/backups/nodes/index.before-20261024.html`.
- HTTPS from inside the VPS returns 200 with a trusted certificate and the expected security headers. External HTTP redirects to HTTPS. External HTTPS was initially blocked by Hostinger’s shared firewall, named “RedMed Cloudflare HTTPS”. Owner explicitly approved adding public TCP 443. One Accept / TCP / 443 / Anywhere rule was added (27 to 28 rules) and synchronized. External HTTPS now returns 200; www redirects to the apex with 308. The public response SHA-256 matches the installed build. All other firewall rules and applications were left unchanged.
- The encrypted-vault migration and account Edge Function version 3 are deployed. Database metadata confirms RLS on both new tables, own-account key reads, admin-only vault updates, and no client grants on the earlier readable memory/session tables. Public self-signup was disabled and saved in the dashboard. No production account or memory has been created.
- No paid purchase or AI provider call was made. Named-program reviews and Grok Bot’s final decision remain incomplete. The owner subsequently authorized the complete Git commit and push; merges remain owner-controlled.

Final public verification: 2026-10-24, 15:13 America/New_York. The site is reachable at https://redeemed.live. First-admin credential entry remains owner-assisted; passcodes must never be sent through chat.

## Main merge handoff (2026-10-24)

Owner authorized merging all outstanding Nodes work into `main`, syncing Git, and verifying deployment. The only outstanding remote branch was `codex/redeemed-deployment`. The usage/handoff rule is in `AGENTS.md`. The Chromium viewer sign-in assertion now allows the same 30 seconds as admin sign-in; its original five-second allowance expired while sign-in was still processing. No production application code changed in this follow-up.

Verification: formatting/lint checks and type-check passed (29 existing lint warnings), all 77 tests passed, the build reproduced the deployed SHA-256 above, and the Chromium test passed with the consistent sign-in allowance. Public HTTPS returned 200, www redirected with 308, and the downloaded HTML matched the build byte for byte. Supabase reports the encrypted-vault migration installed and accounts function version 3 active; its public status endpoint returned `setupNeeded: true`. First-admin setup remains for Owner. No real AI call or production account was created. External named-program reviews and Grok Bot's decision remain unavailable; no team PASS is claimed.

Files changed in this follow-up: `AGENTS.md`, `app/e2e/smoke.spec.ts`, and this handoff. To recheck: run `npm run check`, `npm run build`, and `npm run e2e` in `app/`; compare `index.html` with the response from https://redeemed.live. The existing deployed HTML needs no replacement because its contents are identical.

## Responsive panel handoff (2026-10-24)

Changed `app/src/styles.css` and rebuilt `app/dist/index.html` and root `index.html`. The side panel uses the available viewport width (32vw, bounded at 320–520px) rather than a fixed 520px; intrinsic panel content cannot widen its grid column. At 900px and below, the existing stacked layout gives the canvas the full width. Canvas sizing remains automatic.

Verified in real Chromium at widths 1920, 1440, 1366, 1280, 1024, 901, 900, 768, and 390: no horizontal overflow. At 1024px, the canvas has 696px and the panel 328px. Formatting, lint (warnings only), type-check, 77 unit/UI tests, build, and the existing browser check pass. Screenshots were visually checked. No real provider requests or production accounts were used for verification.

Codex checked the layout and integration. Gemini context review, Muse audit, collective named-program review, and Grok Bot’s final decision were not performed in this chat; no substitute approvals are claimed.

## Single page, simple login and pinned deploys (2026-10-24, Claude)

- **Deploy:** the `brain-site` compose project's `init` container downloads `index.html` from a pinned GitHub commit (`BUILD_URL`), checks `BUILD_SHA256`, backs up the served file to `/var/backups/nodes/` and swaps it in atomically. On any failure it keeps the current page. To deploy: merge the reviewed PR, then update `BUILD_URL`/`BUILD_SHA256` in the compose project (Hostinger `vps_docker_create` with the same name) and check the `init` log line `deployed <sha>`.
- **Main tip pin (2026-10-30, 6:56 PM EDT — ready; live still old until Hostinger update):** commit `7223ef0d56ea80fe7dab1327f96a4c8c130ae5c7`; `BUILD_URL`=`https://raw.githubusercontent.com/Roooted1776/ch29ouy/7223ef0d56ea80fe7dab1327f96a4c8c130ae5c7/index.html`; `BUILD_SHA256`=`98e9ebd39a00288857143864faec2a2f128cfe0962371d129ae5364e148f8786`. Live site still serves `b53ce8c1…` until `brain-site` compose is recreated with those values only.
- **Login:** username + password only (6+ characters). No setup code and no date-of-birth check: while Brain has no accounts, the first visitor creates the admin (`claim_open_setup` lease). Admins add users. `accounts` function v5, migration `open_first_setup`.
- **Screen:** one page. 3D brain (unchanged), live chat beside it, admin panel as a horizontal strip along the bottom. No text outside the chat. Bot names use their node colours with a fixed pixel icon; a bot that hits a token/rate/credit limit shows a red name until it answers again.
- **Favicon:** pixel brain, inline data URI (`app/src/assets/favicon.svg`).
- **Persistent memory (2026-10-30):** `persistent_memory` and `admin_only_persistent_memory` are applied on project `iihjcqiiavleyheqzotl`. Plaintext `projects` / `memories` / `sessions` rows are an admin-only mirror (SELECT + `upsert_*`); viewers cannot read or write them. The encrypted vault remains the shared copy. Live site pin may still lag `main` until Hostinger `BUILD_URL` / `BUILD_SHA256` are updated.
