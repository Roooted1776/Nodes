# Brain on Supabase

Project `Brain` (ref `iihjcqiiavleyheqzotl`, us-east-1), in the Supabase organisation named RedMed.
The other project in that organisation, "RedMed Secure Data", is never touched from Brain.

- `migrations/`: applied in order to the Brain project (tables, row-level security, private helpers, indexes).
- `functions/accounts/`: the only way to create, change or remove accounts (deployed with JWT check off; it checks the caller itself).
- First admin: a one-time setup code. Only its SHA-256 is stored, in `private.bootstrap`, and it is spent on first use.
- Turn off public sign-up in the dashboard (Authentication → Sign In / Providers → "Allow new users to sign up"). Even if it is on, a self-made account has no Brain profile and can read nothing.
