# Brain on Supabase

The Brain project is `iihjcqiiavleyheqzotl`, in us-east-1. This deployment uses only that project.

- Migrations preserve the initial schema and add `vaults` and `account_keys` for encrypted memory and sealed account keys. The plaintext `projects` / `memories` / `sessions` mirror is admin-only (`20261030224500_admin_only_persistent_memory`): admins write memories/sessions only through `upsert_*`.
- `20261024200000_tighten_access.sql` closes the remaining client paths: access-log rows are stamped by the database (author and time, so a member cannot name or backdate somebody else), removing an account finally works (the log kept a `not null` user id while its foreign key tried to null it), nothing in the `private` schema is callable by a client except the two role checks policies need, `anon` has no table grant at all, the GraphQL resolver is closed, and new tables are no longer auto-granted to `anon`.
- `functions/accounts/` creates, resets, and removes accounts after checking the caller. Setup only works while Brain has no accounts at all; once any account exists it is refused and the vault is never touched. Deploy with JWT verification off because the function validates authenticated requests itself and setup/status must work before sign-in. Browser calls are answered only for Brain's own origins (`redeemed.live`, `www.redeemed.live`, local dev and the built file's `null` origin).
- Only the owner can finish first-admin setup on the deployed site. Only admins create subsequent accounts; dates of birth are checked and discarded. No admin is created by tests.
- Public sign-up is off in `config.toml` and must stay off in the dashboard. Even if it were enabled, a sign-up could not create a Brain profile or a sealed memory key, and could not read the database vault.
- Provider keys are sealed on the device and never uploaded to the database.
- Recovery: keep a spare admin login that only the owner uses. A lone admin who forgets the passcode cannot reopen memory any other way.

## Config (`config.toml`)

`supabase/config.toml` is the source of truth for the settings that are not SQL. It is written to keep
Brain's surface small:

| Setting | Value | Why |
| --- | --- | --- |
| `auth.enable_signup`, `auth.email.enable_signup`, `auth.sms.enable_signup` | `false` | Accounts exist only when an admin makes one through the accounts function. |
| `auth.enable_anonymous_sign_ins`, `auth.enable_manual_linking` | `false` | No anonymous or linked identities. |
| `auth.minimum_password_length` | `32` | The page sends a 43-character PBKDF2 password; anything shorter did not come from Brain. |
| `auth.email.enable_confirmations` | `true` | Accounts are created already confirmed, so a hand-made auth user is not a usable back door. |
| `auth.site_url`, `additional_redirect_urls` | `https://redeemed.live`, `www` | Exact URLs only. |
| `auth.jwt_expiry` | `3600` | Short-lived tokens, rotated refresh tokens. |
| `api.schemas` | `["public"]` | No `graphql_public`: Brain has no GraphQL client, and the resolver is revoked in SQL too. |
| `api.auto_expose_new_tables` | `false` | New tables need an explicit grant instead of the cloud default of granting first. |
| `api.max_rows` | `200` | The page reads at most 60 log rows and a handful of profiles. |
| `storage.*` | `false` | Brain stores no files; the vault is a row, and remembered keys never leave the device. |
| `functions.accounts.verify_jwt` | `false` | The function checks every admin caller itself (`getUser` + `profiles.role`). |

Apply it to the project from the repo root, reviewing the diff first:

```bash
supabase login                                  # once, with a scoped personal access token
supabase config diff --project-ref iihjcqiiavleyheqzotl
supabase config push --project-ref iihjcqiiavleyheqzotl
supabase db push --project-ref iihjcqiiavleyheqzotl    # the tighten_access migration
```

`config push` only writes the properties this file declares; anything it does not support is reported
and left alone. Settings that exist only in the dashboard and are **not** in `config.toml`:

1. **Auth → Passwords → leaked password protection**: enable it (checks new passwords against Have I
   Been Pwned). Brain's derived passwords never match, so it costs nothing.
2. **Database → Network restrictions**: once `supabase db push` is no longer run from Owner's own
   network, allow **no** CIDRs. The page and the Edge Function reach Postgres only over HTTPS.
3. **Auth → Rate limits**: confirm the email and sign-in limits shown in `config.toml`.
4. **Backups**: confirm the plan's daily backups are on. Losing every admin passcode still loses the
   memory, so the encrypted offline backup in the Admin tab stays the real recovery path.

Re-enable `storage` only if Brain ever stores a file. If a future admin tool needs a new table in
`public`, give it `enable row level security`, explicit policies, and explicit grants: nothing is
granted automatically any more.

## Checks

`bash supabase/tests/run.sh` applies every migration, in order, to a throwaway Postgres 17 (Docker
only, no Supabase account) and then asserts the access rules: `anon` gets nothing, a non-admin role cannot be created, an admin cannot rewrite the log or skip a vault revision, an account can be removed
and keeps its history, and every table in `public` has row-level security. Run it after any change to
`supabase/`.

See [DEPLOYMENT.md](../DEPLOYMENT.md) for deployment, rollback, verification, and review status.
