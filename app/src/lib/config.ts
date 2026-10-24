// Where Brain's shared data lives: the Supabase project "Brain".
// The publishable key is meant to be in the page. It can only do what the database's row-level security allows.
// No secret or service key is ever put in the page.
export const SUPABASE_URL = 'https://iihjcqiiavleyheqzotl.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_GMDUAJrBveqvoHY8IqBmKA_bqvHhp67';
export const ACCOUNTS_URL = `${SUPABASE_URL}/functions/v1/accounts`;
/** The private Realtime channel for the live chat: members listen, only admins send. */
export const LIVE_TOPIC = 'brain:live';
/** Sign-in addresses are made from the name. They are never emailed. */
export const EMAIL_DOMAIN = 'users.redeemed.live';
