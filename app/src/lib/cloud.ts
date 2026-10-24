// Brain's shared data in Supabase: sign-in, memory, saved tasks, settings, the access log and the live channel.
// Row-level security in the database decides who may do what: members read, only admins write.
// AI provider keys are never sent here.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AuthError, derivePassword, emailFor, type User } from './auth';
import { ACCOUNTS_URL, LIVE_TOPIC, SUPABASE_KEY, SUPABASE_URL } from './config';
import { MAX_SESSIONS, sanitizeMem, type Entry, type Mem, type Session } from './memory';
import type { Chan } from './share';
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
  if (pe || !p || (p.role !== 'admin' && p.role !== 'viewer')) {
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

// ---------- rows ----------
export interface MemRow {
  id: string;
  key: string;
  type: Entry['type'];
  title: string;
  note: string;
  body: Omit<Entry, 'id' | 'key' | 'type' | 'title' | 'note'>;
  archived: boolean;
}
export interface SesRow {
  id: string;
  ts: string;
  task: string;
  body: Session;
}
export interface MetaRow {
  blocked: string[];
  settings: Mem['settings'];
  counters: { nextId: number; nextSession: number; runs: number; filtered: number };
}
export function memRow(e: Entry, archived: boolean): MemRow {
  const { id, key, type, title, note, ...body } = e;
  return { id, key, type, title: title.slice(0, 80), note: note.slice(0, 600), body, archived };
}
export const sesRow = (s: Session): SesRow => ({
  id: s.id,
  ts: new Date(s.ts).toISOString(),
  task: s.q.slice(0, 300),
  body: s,
});
export const metaRow = (m: Mem): MetaRow => ({
  blocked: m.blocked,
  settings: m.settings,
  counters: { nextId: m.nextId, nextSession: m.nextSession, runs: m.runs, filtered: m.filtered },
});
/** Turn database rows back into Brain's memory, cleaned the same way any stored memory is. */
export function memFrom(mems: MemRow[], sessions: SesRow[], meta: Partial<MetaRow> | null): Mem {
  const entry = (r: MemRow) => ({ ...(r.body || {}), id: r.id, key: r.key, type: r.type, title: r.title, note: r.note });
  const c = meta?.counters || ({} as Partial<MetaRow['counters']>);
  return sanitizeMem({
    entries: mems.filter(r => !r.archived).map(entry),
    archived: mems.filter(r => r.archived).map(entry),
    sessions: sessions.map(r => ({ ...(r.body || {}), id: r.id })),
    blocked: meta?.blocked || [],
    settings: meta?.settings || {},
    nextId: c.nextId,
    nextSession: c.nextSession,
    runs: c.runs,
    filtered: c.filtered,
  })!;
}
interface Snap {
  mems: Map<string, string>;
  ses: Map<string, string>;
  meta: string;
}
function rowsOf(m: Mem) {
  const mems = new Map<string, MemRow>();
  for (const e of m.archived) mems.set(e.id, memRow(e, true));
  for (const e of m.entries) mems.set(e.id, memRow(e, false)); // a live entry wins over an archived copy
  return { mems, ses: new Map(m.sessions.map(s => [s.id, sesRow(s)])), meta: metaRow(m) };
}
/** JSON with sorted keys and no undefined values, so a row reads the same however Postgres ordered its fields. */
export function stable(v: unknown): string {
  return JSON.stringify(v, (_k, x) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(
          Object.keys(x)
            .sort()
            .filter(k => x[k] !== undefined)
            .map(k => [k, x[k]]),
        )
      : x,
  );
}
const memKey = (r: MemRow) =>
  stable({ id: r.id, key: r.key, type: r.type, title: r.title, note: r.note, body: r.body, archived: !!r.archived });
const sesKey = (r: SesRow) => stable({ id: r.id, ts: new Date(r.ts).toISOString(), task: r.task, body: r.body });
const metaKey = (r: Partial<MetaRow>) =>
  stable({ blocked: r.blocked ?? [], settings: r.settings ?? {}, counters: r.counters ?? {} });
export type SaveResult = 'same' | 'saved' | 'conflict';
/** What one save would write. */
export interface Changes {
  upsert: MemRow[];
  remove: string[];
  addSessions: SesRow[];
  changeSessions: SesRow[];
  removeSessions: string[];
  meta: boolean;
}

/**
 * Keeps one signed-in tab in step with the database. It remembers what was last loaded or saved, and a save writes
 * only what changed. Every save first moves brain_meta on by one revision, but only if nobody else did since this
 * tab last loaded or saved (the `rev` check). If someone did, nothing is written and the caller reloads.
 */
export class Sync {
  rev = 0;
  private snap: Snap = { mems: new Map(), ses: new Map(), meta: '' };
  constructor(
    private uid: string,
    private d: Db = db(),
  ) {}
  async load(): Promise<Mem> {
    const [m, s, meta] = await Promise.all([
      this.d.from('memories').select('id, key, type, title, note, body, archived').limit(2000),
      this.d.from('sessions').select('id, ts, task, body').order('ts', { ascending: false }).limit(MAX_SESSIONS),
      this.d.from('brain_meta').select('blocked, settings, counters, rev').eq('id', 1).maybeSingle(),
    ]);
    const err = m.error || s.error || meta.error;
    if (err) throw new CloudError(`Brain's memory could not be loaded: ${why(err)}`);
    if (!meta.data) throw new CloudError('Brain could not read its settings. Your account may have been removed.');
    this.rev = Number(meta.data.rev) || 0;
    const mems = (m.data || []) as MemRow[],
      ses = [...((s.data || []) as SesRow[])].reverse();
    // remember the rows exactly as stored: anything the cleaner drops or fixes is written on the next admin save
    this.snap = {
      mems: new Map(mems.map(r => [r.id, memKey(r)])),
      ses: new Map(ses.map(r => [r.id, sesKey(r)])),
      meta: metaKey(meta.data),
    };
    return memFrom(mems, ses, meta.data);
  }
  changes(mem: Mem): Changes {
    const now = rowsOf(mem),
      was = this.snap;
    return {
      upsert: [...now.mems.values()].filter(r => was.mems.get(r.id) !== memKey(r)),
      remove: [...was.mems.keys()].filter(id => !now.mems.has(id)),
      addSessions: [...now.ses.values()].filter(r => !was.ses.has(r.id)),
      changeSessions: [...now.ses.values()].filter(r => was.ses.has(r.id) && was.ses.get(r.id) !== sesKey(r)),
      removeSessions: [...was.ses.keys()].filter(id => !now.ses.has(id)),
      meta: metaKey(now.meta) !== was.meta,
    };
  }
  async save(mem: Mem): Promise<SaveResult> {
    const c = this.changes(mem),
      was = this.snap;
    if (
      !c.meta &&
      !c.upsert.length &&
      !c.remove.length &&
      !c.addSessions.length &&
      !c.changeSessions.length &&
      !c.removeSessions.length
    )
      return 'same';
    const meta = metaRow(mem);
    const u = await this.d.from('brain_meta').update(meta).eq('id', 1).eq('rev', this.rev).select('rev');
    if (u.error) throw new CloudError(`Brain could not save: ${why(u.error)}`);
    if (!u.data?.length) return 'conflict';
    this.rev = Number(u.data[0].rev);
    was.meta = metaKey(meta);
    const check = (r: { error: { message?: string } | null }) => {
      if (r.error) throw new CloudError(`Brain could not save: ${why(r.error)}`);
    };
    // removals first, so a new entry may reuse a removed entry's key
    if (c.remove.length) {
      check(await this.d.from('memories').delete().in('id', c.remove));
      for (const id of c.remove) was.mems.delete(id);
    }
    if (c.upsert.length) {
      check(await this.d.from('memories').upsert(c.upsert, { onConflict: 'id' }));
      for (const r of c.upsert) was.mems.set(r.id, memKey(r));
    }
    if (c.removeSessions.length) {
      check(await this.d.from('sessions').delete().in('id', c.removeSessions));
      for (const id of c.removeSessions) was.ses.delete(id);
    }
    if (c.addSessions.length) {
      check(
        await this.d
          .from('sessions')
          .upsert(
            c.addSessions.map(r => ({ ...r, created_by: this.uid })),
            { onConflict: 'id' },
          ),
      );
      for (const r of c.addSessions) was.ses.set(r.id, sesKey(r));
    }
    for (const r of c.changeSessions) {
      check(await this.d.from('sessions').update({ ts: r.ts, task: r.task, body: r.body }).eq('id', r.id));
      was.ses.set(r.id, sesKey(r));
    }
    return 'saved';
  }
}

// ---------- access log ----------
export async function writeAudit(uid: string, who: string, what: string, d: Db = db()) {
  const { error } = await d.from('audit_log').insert({ who: uid, who_name: who.slice(0, 32), what: what.slice(0, 200) });
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

// ---------- live channel ----------
/** The private broadcast channel `brain:live`, shaped like the old same-browser channel so share.ts works on it. */
export function liveChan(d: Db = db(), onStatus?: (status: string) => void): Chan {
  const ch = d.channel(LIVE_TOPIC, { config: { private: true, broadcast: { self: false } } });
  let closed = false;
  const c: Chan = {
    onmessage: null,
    postMessage: data => {
      if (!closed) void ch.send({ type: 'broadcast', event: 'live', payload: data }).catch(() => {});
    },
    close: () => {
      closed = true;
      void d.removeChannel(ch);
    },
  };
  ch.on('broadcast', { event: 'live' }, m => c.onmessage?.({ data: (m as { payload?: unknown }).payload }));
  void d.realtime.setAuth().then(() => {
    if (!closed) ch.subscribe(status => onStatus?.(String(status)));
  });
  return c;
}
