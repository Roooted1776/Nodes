// Brain’s Supabase sign-in, encrypted memory/task envelopes, and access log.
// Row-level security in the database decides who may do what: members read, only admins write.
// AI provider keys are never sent here.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AuthError, derivePassword, emailFor, type User } from './auth';
import { ACCOUNTS_URL, SUPABASE_KEY, SUPABASE_URL } from './config';
import type { AuditEvent } from './audit';

export type Db = SupabaseClient;
let client: Db | null = null,
  fetcher: typeof fetch | null = null;
/** Tests hand in a fake client and a fake fetch; the page makes the real client the first time it is needed. */
export function useBackend(d: Db | null, f: typeof fetch | null = null) {
  client = d;
  fetcher = f;
}
export function db(): Db {
  client ??= createClient(SUPABASE_URL, SUPABASE_KEY, {
    // nothing about the sign-in is kept in the browser: a reload or a lock means signing in again
    auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return client;
}

export class CloudError extends Error {
  constructor(
    msg: string,
    public status = 0,
  ) {
    super(msg);
  }
}
const OFFLINE = "Cannot reach Brain's server. Check the internet connection and try again.";
const why = (e: { message?: string } | null | undefined) => String(e?.message || 'unknown error').slice(0, 160);

export async function token(): Promise<string> {
  const { data } = await db().auth.getSession();
  return data.session?.access_token || '';
}

/** Brain's accounts function: status, setup, list, create, reset, role, remove. */
export async function accounts<T = Record<string, unknown>>(action: string, body: object = {}, signed = false) {
  const headers: Record<string, string> = { apikey: SUPABASE_KEY, 'content-type': 'application/json' };
  if (signed) {
    const t = await token();
    if (!t) throw new CloudError('Sign in again.', 401);
    headers.Authorization = `Bearer ${t}`;
  }
  let res: Response;
  try {
    res = await (fetcher ?? globalThis.fetch)(ACCOUNTS_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...body, action }),
    });
  } catch {
    throw new CloudError(OFFLINE);
  }
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j?.error)
    throw new CloudError(
      typeof j?.error === 'string' ? j.error.slice(0, 200) : `Brain's server said no (${res.status}).`,
      res.status,
    );
  return j as T;
}

/** Sign in with the stretched passcode, then read the role from Brain's profiles table. */
export async function signIn(name: string, passcode: string): Promise<{ user: User; kek: CryptoKey }> {
  const { password, kek } = await derivePassword(name, passcode);
  const { data, error } = await db().auth.signInWithPassword({ email: emailFor(name), password });
  if (error || !data.session || !data.user) {
    const st = (error as { status?: number } | null)?.status || 0;
    if (st === 429) throw new AuthError('Too many tries. Wait a minute and try again.', 'blocked');
    if (!st || st >= 500) throw new AuthError(OFFLINE, 'server');
    throw new AuthError('Name or passcode is wrong.', 'wrong');
  }
  const { data: p, error: pe } = await db()
    .from('profiles')
    .select('id, name, role')
    .eq('id', data.user.id)
    .maybeSingle();
  if (pe || !p || p.role !== 'admin') {
    await signOut();
    throw new AuthError(
      pe ? `Brain could not read your account: ${why(pe)}` : 'This sign-in has no Brain account. Ask an admin.',
      'missing',
    );
  }
  return { user: { id: p.id, name: p.name, role: p.role }, kek };
}
/** Ends the sign-in on this device only (other devices stay signed in). */
export async function signOut() {
  try {
    await db().auth.signOut({ scope: 'local' });
  } catch {
    /* already signed out */
  }
}

// ---------- access log ----------
export async function writeAudit(uid: string, who: string, what: string, d: Db = db()) {
  const { error } = await d
    .from('audit_log')
    .insert({ who: uid, who_name: who.slice(0, 32), what: what.slice(0, 200) });
  if (error) throw new CloudError(why(error));
}
/** Newest first. Only admins can read the log. */
export async function readAudit(limit = 60, d: Db = db()): Promise<AuditEvent[]> {
  const { data, error } = await d
    .from('audit_log')
    .select('at, who_name, what')
    .order('at', { ascending: false })
    .limit(limit);
  if (error) throw new CloudError(`The access log could not be read: ${why(error)}`);
  return ((data || []) as { at: string; who_name: string; what: string }[]).map(r => ({
    t: Date.parse(r.at),
    who: r.who_name,
    what: r.what,
  }));
}

// Only ciphertext leaves the tab. Compare-and-swap prevents silent overwrites from another admin.
export async function loadVault() {
  const { data, error } = await db().from('vaults').select('envelope, rev').eq('id', 1).single();
  if (error || !data) throw new CloudError('Encrypted memory could not be loaded. Sign in again.');
  return data as { envelope: import('./vault').Vault; rev: number };
}
export async function saveVault(envelope: import('./vault').Vault, rev: number) {
  const { data, error } = await db()
    .from('vaults')
    .update({ envelope, rev: rev + 1 })
    .eq('id', 1)
    .eq('rev', rev)
    .select('rev')
    .maybeSingle();
  if (error) throw new CloudError('Encrypted memory could not be saved. Keep this tab open and back up your changes.');
  if (!data)
    throw new CloudError('Another admin saved first. Back up your changes, then sign in again before editing.');
  return Number(data.rev);
}
export async function accountWrap(uid: string) {
  const { data, error } = await db().from('account_keys').select('wrap').eq('id', uid).single();
  if (error || !data) throw new CloudError('This account has no encrypted memory key. Ask an admin.');
  return data.wrap as import('./vault').Sealed;
}

export interface SyncResult {
  saved: number;
  failed: number;
  firstError: string;
}
const cut = (t: string, n: number) => (t.length > n ? t.slice(0, n) : t);
const BODY_LIMIT = 200_000; // the sessions table refuses bodies near 256 KB
/** What the database already holds, row by row, so a sync sends only what changed. */
const sent = new Map<string, string>();
export const resetMirror = () => sent.clear();

/**
 * Persist memory entries, projects and task sessions to the database (admin only; RLS + upsert checks).
 * Only admins call this. Reports what really saved.
 */
export async function syncMemoryDatabase(mem: import('./memory').Mem, d: Db = db()): Promise<SyncResult> {
  const out: SyncResult = { saved: 0, failed: 0, firstError: '' };
  // The database answers with an error value instead of throwing, so check it every time.
  const track = async (id: string, row: object, send: () => PromiseLike<{ error: { message?: string } | null }>) => {
    const sig = JSON.stringify(row);
    if (sent.get(id) === sig) return;
    try {
      const { error } = await send();
      if (error) throw new Error(error.message);
      sent.set(id, sig);
      out.saved++;
    } catch (e) {
      out.failed++;
      out.firstError ||= why(e as Error);
    }
  };
  const names = new Set<string>(['Brain']);
  for (const s of mem.sessions) if (s.project) names.add(s.project);
  for (const e of mem.entries) names.add(e.project || (e.type === 'workstream' ? e.title : 'Brain'));
  const now = new Date().toISOString();
  for (const n of names) {
    const id = cut(n, 80);
    await track('p:' + id, { id }, () =>
      d.from('projects').upsert({ id, name: id, updated_at: now }, { onConflict: 'id' }),
    );
  }
  for (const e of mem.entries) {
    const args = {
      p_id: e.id,
      p_key: cut(e.key, 120),
      p_type: e.type,
      p_title: cut(e.title, 80),
      p_note: cut(e.note || '', 600),
      p_project: cut(e.project || (e.type === 'workstream' ? e.title : 'Brain'), 80),
      p_body: {
        links: e.links,
        strength: e.strength,
        status: e.status,
        created: e.created,
        seen: e.seen,
        corrected: e.corrected,
        skill: e.skill,
        prog: e.prog,
        manual: e.manual,
        kws: e.kws,
        sources: e.sources.slice(0, 20),
      },
    };
    await track('m:' + e.id, args, () => d.rpc('upsert_memory', args));
  }
  for (const s of mem.sessions) {
    let body: object = { ...s };
    if (JSON.stringify(body).length > BODY_LIMIT)
      body = { ...s, msgs: s.msgs.map(m => ({ ...m, text: cut(m.text, 2000) })) };
    const args = {
      p_id: s.id,
      p_task: cut(s.q, 300),
      p_project: cut(s.project || 'Brain', 80),
      p_project_id: s.projectId || null,
      p_body: body,
    };
    await track('s:' + s.id, args, () => d.rpc('upsert_session', args));
  }
  return out;
}

/**
 * Read memory back from the admin-only database mirror (the copy `syncMemoryDatabase` keeps).
 * Shaped for `sanitizeMem`. Only admins have SELECT on these tables.
 */
export async function loadMemoryDatabase(d: Db = db()): Promise<{ entries: unknown[]; sessions: unknown[] }> {
  const [m, t] = await Promise.all([
    d.from('memories').select('id, key, type, title, note, project, body').eq('archived', false).limit(10000),
    d.from('sessions').select('body').order('ts', { ascending: false }).limit(25),
  ]);
  if (m.error || t.error) throw new CloudError(`Memory tables could not be read: ${why(m.error || t.error)}`);
  const entries = (m.data || []).map(r => {
    const b = (r.body || {}) as Record<string, unknown>;
    return {
      links: [],
      strength: 1,
      status: 'fresh',
      created: Date.now(),
      seen: Date.now(),
      sources: [],
      ...b,
      id: r.id,
      key: r.key,
      type: r.type,
      title: r.title,
      note: r.note,
      project: r.project,
    };
  });
  const sessions = (t.data || []).map(r => r.body).reverse();
  return { entries, sessions };
}
