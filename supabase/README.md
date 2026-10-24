# Brain on Supabase

The Brain project is `iihjcqiiavleyheqzotl`, in us-east-1. This deployment uses only that project.

- Migrations preserve the initial schema and add `vaults` and `account_keys` for encrypted memory and sealed account keys. No client can write the earlier readable memory/session tables.
- `functions/accounts/` creates, resets, and removes accounts after checking the caller. It creates the first admin only with the one-time setup code. Deploy with JWT verification off because the function validates authenticated requests itself and setup/status must work before sign-in.
- The setup code's hash remains in `private.bootstrap` until first use. Never record the code or passcodes in Git, chat, or screenshots.
- Only the owner can finish first-admin setup on the deployed site. Only admins create subsequent accounts; dates of birth are checked and discarded. No admin is created by tests.
- Public sign-up should remain disabled. Even if enabled at the auth service, it cannot create a Brain profile or a sealed memory key and cannot read the database vault.
- Provider keys are sealed on the device and never uploaded to the database.

See [DEPLOYMENT.md](../DEPLOYMENT.md) for deployment, rollback, verification, and review status.
