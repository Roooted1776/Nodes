// Brain accounts: the only way to create, change or remove a Brain account.
// Public sign-up is never used. While Brain has no accounts, the first visitor picks the admin username
// and password (Owner's choice, Oct 2026); after that only admins act.
// Passwords arrive already stretched by the browser (PBKDF2 of the password), so the password itself never leaves it.
import { createClient } from 'npm:@supabase/supabase-js@2';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

// Only Brain's own pages may call this function from a browser. A `null` origin is the built
// index.html opened from disk. Other sites get no allow-origin header, so the browser blocks them.
// (The real gate is the admin check below; this just keeps the endpoint out of other pages' reach.)
const ORIGINS = new Set([
  'https://redeemed.live',
  'https://www.redeemed.live',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'null',
]);
function cors(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || '';
  return {
    ...(ORIGINS.has(origin) ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}
const NAME_RE = /^[A-Za-z0-9]+(?: [A-Za-z0-9]+)*$/;
const PASS_RE = /^[A-Za-z0-9_-]{43}$/; // 32 bytes, base64url, made in the browser
type Role = 'admin';

class Refuse extends Error {
  constructor(msg: string, public status = 400) {
    super(msg);
  }
}
const reply = (req: Request, status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), 'content-type': 'application/json' } });

export const emailFor = (name: string) => name.trim().toLowerCase().replace(/ /g, '.') + '@users.redeemed.live';
function checkName(n: unknown): string {
  const name = typeof n === 'string' ? n.trim() : '';
  if (name.length < 2 || name.length > 32 || !NAME_RE.test(name))
    throw new Refuse('Names use letters, numbers and single spaces, 2 to 32 characters.');
  return name;
}
function checkPass(p: unknown): string {
  if (typeof p !== 'string' || !PASS_RE.test(p)) throw new Refuse('The passcode was not prepared by Brain.');
  return p;
}
async function caller(req: Request) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) throw new Refuse('Sign in first.', 401);
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new Refuse('Sign in again.', 401);
  const { data: p } = await db.from('profiles').select('id, name, role').eq('id', data.user.id).maybeSingle();
  if (!p) throw new Refuse('No Brain account.', 403);
  return p as { id: string; name: string; role: Role };
}
async function admins() {
  const { count } = await db.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin');
  return count || 0;
}
async function audit(who: { id: string; name: string }, what: string) {
  await db.from('audit_log').insert({ who: who.id, who_name: who.name, what: what.slice(0, 200) });
}
async function makeUser(name: string, password: string, role: Role, wrap: unknown) {
  const { data: same } = await db.from('profiles').select('id').ilike('name', name).maybeSingle();
  if (same) throw new Refuse('That name is taken.', 409);
  const { data, error } = await db.auth.admin.createUser({ email: emailFor(name), password, email_confirm: true, app_metadata: { brain: true } });
  if (error || !data.user) throw new Refuse('Could not create the account: ' + (error?.message || 'unknown'), 409);
  const { error: pe } = await db.from('profiles').insert({ id: data.user.id, name, role });
  if (pe) {
    await db.auth.admin.deleteUser(data.user.id);
    throw new Refuse('Could not save the account: ' + pe.message, 409);
  }
  const { error: ke } = await db.from('account_keys').insert({ id: data.user.id, wrap });
  if (ke) {
    await db.auth.admin.deleteUser(data.user.id);
    throw new Refuse('Could not save the encrypted account key.', 409);
  }
  return { id: data.user.id, name, role };
}

function checkWrap(w: any) {
  if (!w || typeof w.iv !== 'string' || typeof w.ct !== 'string' || w.iv.length !== 16 || w.ct.length < 40 || w.ct.length > 16000 || !/^[A-Za-z0-9+/=]+$/.test(w.iv + w.ct))
    throw new Refuse('An encrypted account key is required.');
  return { iv: w.iv, ct: w.ct };
}
function checkEnvelope(v: any) {
  if (!v || v.v !== 1 || v.n !== 1 || typeof v.sig !== 'string' || typeof v.ct !== 'string' || typeof v.iv !== 'string' || v.ct.length > 1000000)
    throw new Refuse('An encrypted initial vault is required.');
  return { v: 1, n: 1, sig: v.sig, ct: v.ct, iv: v.iv };
}
async function handle(req: Request) {
  const b = await req.json().catch(() => ({}));
  switch (b.action) {
    case 'status': {
      const { data } = await db.rpc('setup_needed');
      return { setupNeeded: data === true };
    }
    case 'setup': {
      const name = checkName(b.name), password = checkPass(b.password);
      const wrap = checkWrap(b.wrap), envelope = checkEnvelope(b.envelope);
      // Setup deletes and recreates the vault, so it must never run on a live Brain: refuse while any
      // account exists (any role), before the vault is touched. Only a brand-new, empty project gets past.
      const { count, error: ce } = await db.from('profiles').select('id', { count: 'exact', head: true });
      if (ce || count === null || count > 0) throw new Refuse('Brain is already set up. Sign in instead.', 409);
      const { data: ok } = await db.rpc('claim_open_setup');
      if (ok !== true) throw new Refuse('Brain is already set up. Sign in instead.', 409);
      let u;
      try {
        u = await makeUser(name, password, 'admin', wrap);
        // No accounts exist yet, so any old vault row is sealed to keys that are gone. Clear it, then start fresh.
        await db.from('vaults').delete().eq('id', 1);
        const { error: ve } = await db.from('vaults').insert({ id: 1, envelope });
        if (ve) {
          await db.auth.admin.deleteUser(u.id);
          throw new Refuse('Could not create encrypted memory.', 409);
        }
      } catch (e) {
        await db.rpc('release_open_setup'); // let setup be tried again if the account could not be made
        throw e;
      }
      await audit(u, 'Created the first admin');
      return { ok: true, email: emailFor(name) };
    }
    case 'list': {
      const me = await caller(req);
      if (me.role !== 'admin') throw new Refuse('Only admins can see accounts.', 403);
      const { data } = await db.from('profiles').select('id, name, role, created_at').order('created_at');
      return { users: data };
    }
    case 'create': {
      const me = await caller(req);
      if (me.role !== 'admin') throw new Refuse('Only admins can add accounts.', 403);
      if (b.role !== 'admin') throw new Refuse('Only admin accounts can be created.');
      const name = checkName(b.name), password = checkPass(b.password), role: Role = 'admin';
      const u = await makeUser(name, password, role, checkWrap(b.wrap));
      await audit(me, `Added ${role} ${name}`);
      return { ok: true, user: u };
    }
    case 'reset': {
      const me = await caller(req);
      if (me.role !== 'admin') throw new Refuse('Only admins can reset passcodes.', 403);
      const password = checkPass(b.password);
      const { data: t } = await db.from('profiles').select('id, name').eq('id', b.id).maybeSingle();
      if (!t) throw new Refuse('No such account.', 404);
      const wrap = checkWrap(b.wrap);
      const { data: old, error: oe } = await db.from('account_keys').select('wrap').eq('id', t.id).single();
      if (oe) throw new Refuse('Cannot read the existing encrypted account key.', 409);
      const { error: ke } = await db.from('account_keys').update({ wrap }).eq('id', t.id);
      if (ke) throw new Refuse('Cannot save the new encrypted account key.', 409);
      const { error } = await db.auth.admin.updateUserById(t.id, { password });
      if (error) {
        await db.from('account_keys').update({ wrap: old.wrap }).eq('id', t.id);
        throw new Refuse('Could not reset the account. Try again.', 409);
      }
      await audit(me, `Reset the passcode of ${t.name}`);
      return { ok: true };
    }
    case 'role': throw new Refuse('Role changes require a new sealed account. Add a new account instead.', 409);
    case 'remove': {
      const me = await caller(req);
      if (me.role !== 'admin') throw new Refuse('Only admins can remove accounts.', 403);
      if (b.id === me.id) throw new Refuse('You cannot remove yourself.', 409);
      const { data: t } = await db.from('profiles').select('id, name, role').eq('id', b.id).maybeSingle();
      if (!t) throw new Refuse('No such account.', 404);
      if (t.role === 'admin' && (await admins()) <= 1) throw new Refuse('Brain needs at least one admin.', 409);
      await db.auth.admin.deleteUser(t.id); // the profile goes with it (on delete cascade)
      await audit(me, `Removed ${t.name}`);
      return { ok: true };
    }
    default:
      throw new Refuse('Unknown action.');
  }
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return reply(req, 405, { error: 'POST only' });
  try {
    return reply(req, 200, await handle(req));
  } catch (e) {
    if (e instanceof Refuse) return reply(req, e.status, { error: e.message });
    console.error('Accounts request failed');
    return reply(req, 500, { error: 'Something went wrong. Nothing was changed.' });
  }
});
