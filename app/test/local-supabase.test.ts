// @vitest-environment jsdom
// Admin-only checks against a LOCAL Supabase (`supabase start`), never the real project. Skipped unless
// BRAIN_LOCAL_SUPABASE_URL points at localhost/127.0.0.1 and the local anon and service keys are set:
//   set -a; . <(supabase status -o env); set +a
//   BRAIN_LOCAL_SUPABASE_URL=$API_URL BRAIN_LOCAL_ANON_KEY=$ANON_KEY BRAIN_LOCAL_SERVICE_KEY=$SERVICE_ROLE_KEY \
//     npx vitest run test/local-supabase.test.ts
// The local project must be fresh (no accounts): the test creates the first admin itself.
import { createClient } from '@supabase/supabase-js';
import { webcrypto } from 'node:crypto';
import { describe, expect, it } from 'vitest';

const URL_ = process.env.BRAIN_LOCAL_SUPABASE_URL || '';
const ANON = process.env.BRAIN_LOCAL_ANON_KEY || '';
const SERVICE = process.env.BRAIN_LOCAL_SERVICE_KEY || '';
const local = /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(URL_);
if (URL_ && !local) throw new Error('BRAIN_LOCAL_SUPABASE_URL must be a local Supabase (http://127.0.0.1:port).');

Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });

/** Every request must go to the local stack. The page's accounts URL and key are swapped for local ones. */
const localFetch: typeof fetch = async (input, init = {}) => {
  let url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
  if (/\/functions\/v1\/accounts$/.test(url)) {
    url = `${URL_}/functions/v1/accounts`;
    headers.set('apikey', ANON);
  }
  if (!url.startsWith(`${URL_}/`)) throw new Error(`Blocked a request that was not to the local Supabase: ${url}`);
  return fetch(url, { ...init, headers });
};
const opts = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: localFetch },
};

describe.skipIf(!local || !ANON || !SERVICE)('admin-only Brain on a local Supabase', () => {
  const service = () => createClient(URL_, SERVICE, opts);
  const rev = async () => (await service().from('vaults').select('rev').eq('id', 1).single()).data?.rev as number;
  const call = (body: object, token = '') =>
    localFetch(`${URL_}/functions/v1/accounts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });

  it('a direct sign-up is refused', async () => {
    const { data, error } = await createClient(URL_, ANON, opts).auth.signUp({
      email: 'intruder@users.redeemed.live',
      password: 'x'.repeat(43),
    });
    expect(data.user).toBeNull();
    expect(error?.status).toBe(422);
    expect(error?.message).toMatch(/Signups not allowed/);
  });

  it('first admin, spare admin, spare resets the main passcode, memory opens with the same content', async () => {
    const cloud = await import('../src/lib/cloud');
    cloud.useBackend(createClient(URL_, ANON, opts), localFetch);
    const { useAuth } = await import('../src/auth-store');
    const { useStore } = await import('../src/store');
    const auth = () => useAuth.getState();

    await auth().init();
    expect(auth().phase).toBe('setup');
    const made = await auth().setup({ name: 'Owner', passcode: 'main passcode 1' });
    expect(auth().error).toBe('');
    expect(made).toBe(true);
    expect(useStore.getState().role).toBe('admin');
    useStore.getState().note({ type: 'concept', title: 'Spare admin reset check', note: 'kept through a reset' });
    await expect.poll(rev, { timeout: 15000 }).toBeGreaterThan(1);
    const before = structuredClone(useStore.getState().mem.entries);
    expect(before.map(e => e.title)).toEqual(['Spare admin reset check']);

    // A viewer cannot be created; a spare admin can.
    const tok = (await cloud.db().auth.getSession()).data.session!.access_token;
    const v = await call(
      { action: 'create', name: 'Watcher', role: 'viewer', password: 'a'.repeat(43), wrap: {} },
      tok,
    );
    expect(v.status).toBe(400);
    expect((await v.json()).error).toBe('Only admin accounts can be created.');
    expect(await auth().addUser({ name: 'Spare', role: 'admin', passcode: 'spare passcode 1' })).toBe(true);
    const owner = auth().db.users.find(u => u.name === 'Owner')!;
    expect(auth().db.users.map(u => [u.name, u.role])).toEqual([
      ['Owner', 'admin'],
      ['Spare', 'admin'],
    ]);

    // Setup on a project that has accounts: 409, and the vault is untouched.
    const r0 = await rev();
    const s = await call({
      action: 'setup',
      name: 'Again',
      password: 'a'.repeat(43),
      wrap: { iv: 'A'.repeat(16), ct: 'B'.repeat(44) },
      envelope: { v: 1, n: 1, sig: 's', ct: 'c', iv: 'i' },
    });
    expect(s.status).toBe(409);
    expect((await s.json()).error).toBe('Brain is already set up. Sign in instead.');
    expect(await rev()).toBe(r0);
    expect((await service().rpc('claim_open_setup')).data).toBe(false);

    // The spare admin resets the main admin's passcode.
    auth().logout();
    expect(await auth().login('Spare', 'spare passcode 1')).toBe(true);
    expect(useStore.getState().mem.entries).toEqual(before);
    expect(await auth().resetPasscode(owner.id, 'new main passcode 2')).toBe('');
    auth().logout();

    expect(await auth().login('Owner', 'main passcode 1')).toBe(false);
    expect(auth().error).toBe('Name or passcode is wrong.');
    expect(await auth().login('Owner', 'new main passcode 2')).toBe(true);
    expect(useStore.getState().role).toBe('admin');
    expect(useStore.getState().mem.entries).toEqual(before);
    auth().logout();
  }, 60000);

  it('a login with no Brain account (made outside Brain) is refused at sign-in and reads nothing', async () => {
    const { derivePassword, emailFor } = await import('../src/lib/auth');
    const { password } = await derivePassword('Stranger', 'stranger passcode 1');
    const made = await service().auth.admin.createUser({ email: emailFor('Stranger'), password, email_confirm: true });
    expect(made.error).toBeNull();
    const c = createClient(URL_, ANON, opts);
    expect((await c.auth.signInWithPassword({ email: emailFor('Stranger'), password })).error).toBeNull();
    expect((await c.from('vaults').select('id')).data ?? []).toEqual([]);
    expect((await c.from('profiles').select('id')).data ?? []).toEqual([]);
    const cloud = await import('../src/lib/cloud');
    cloud.useBackend(createClient(URL_, ANON, opts), localFetch);
    await expect(cloud.signIn('Stranger', 'stranger passcode 1')).rejects.toThrow(
      'This sign-in has no Brain account. Ask an admin.',
    );
  });
});
