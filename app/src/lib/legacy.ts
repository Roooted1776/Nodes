// The one-time upload: memory and tasks that an older Brain kept in this browser (brain.vault.v1, brain.mem.v2,
// with accounts in brain.auth.v1). The old accounts cannot move: their passcodes were hashed differently,
// so an admin adds those people again. After a good upload the old local copies are deleted.
import { blankMem, MAX_SESSIONS, sanitizeMem, type Entry, type Mem } from './memory';
import type { Keys } from './keystore';
import { decryptVault, openFor, type Sealed } from './vault';

export const OLD_VAULT = 'brain.vault.v1',
  OLD_MEM = 'brain.mem.v2',
  OLD_AUTH = 'brain.auth.v1',
  /** Also from the old version: plain remembered keys, the tab session and the local access log. */
  OLD_EXTRA = ['brain.livekeys.v1', 'brain.session.v1', 'brain.audit.v1'],
  UPLOAD_KEY = 'brain.upload.v1';
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export interface LegacyData {
  mem: Mem;
  keys: Keys;
}
interface OldUser {
  name: string;
  salt: string;
  hash: string;
  iter: number;
  v?: number;
  wrap?: Sealed;
}
export class LegacyError extends Error {}

export const hasLegacy = (s: Pick<Storage, 'getItem'>) =>
  [OLD_VAULT, OLD_MEM, OLD_AUTH].some(k => s.getItem(k) !== null);
const oldUsers = (s: Pick<Storage, 'getItem'>): OldUser[] => {
  try {
    const d = JSON.parse(s.getItem(OLD_AUTH) || 'null');
    return Array.isArray(d?.users) ? d.users.filter((u: OldUser) => u && typeof u.name === 'string') : [];
  } catch {
    return [];
  }
};
/** Names of the old accounts on this browser, so the admin knows whom to add again. */
export const legacyNames = (s: Pick<Storage, 'getItem'>) => oldUsers(s).map(u => u.name.slice(0, 32));
/** True when the old memory is encrypted and needs the old account's passcode to open. */
export const legacyLocked = (s: Pick<Storage, 'getItem'>) => s.getItem(OLD_VAULT) !== null;

const unhex = (h: string) => new Uint8Array((h.match(/../g) || []).map(x => parseInt(x, 16)));
const hex = (b: Uint8Array) => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
/** The old sign-in check: PBKDF2-SHA256 with the account's own random salt, 64 bytes (check value, then sealing key). */
async function oldKek(u: OldUser, pass: string): Promise<CryptoKey | null> {
  if (u.v !== 2 || !u.wrap || !Number.isFinite(u.iter) || u.iter < 1000 || u.iter > 5_000_000) return null;
  const c = globalThis.crypto.subtle;
  const base = await c.importKey('raw', new TextEncoder().encode(pass.normalize('NFKC')), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = new Uint8Array(
    await c.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unhex(u.salt), iterations: u.iter }, base, 512),
  );
  if (hex(bits.slice(0, 32)) !== u.hash) return null;
  return c.importKey('raw', bits.slice(32), 'AES-GCM', false, ['decrypt']);
}

/**
 * Open the old local copy. Plain old memory needs nothing; the encrypted vault needs the name and passcode of an old
 * account on this browser. Returns null when there is nothing to upload.
 */
export async function openLegacy(s: Pick<Storage, 'getItem'>, name: string, pass: string): Promise<LegacyData | null> {
  const raw = s.getItem(OLD_VAULT);
  if (raw !== null) {
    const u = oldUsers(s).find(x => x.name.toLowerCase() === name.trim().toLowerCase());
    const kek = u && (await oldKek(u, pass));
    if (!u || !kek) throw new LegacyError('That name and passcode do not open the old memory on this browser.');
    try {
      const sec = await openFor(kek, u.wrap!);
      const d = (await decryptVault(sec, JSON.parse(raw))) as { mem?: unknown; keys?: unknown };
      const keys: Keys = {};
      if (d.keys && typeof d.keys === 'object')
        for (const [p, k] of Object.entries(d.keys)) if (typeof k === 'string') keys[p as keyof Keys] = k.slice(0, 300);
      return { mem: sanitizeMem(d.mem) || blankMem(), keys };
    } catch (e: unknown) {
      throw new LegacyError(e instanceof Error ? e.message : 'The old memory could not be opened.');
    }
  }
  const plain = s.getItem(OLD_MEM);
  if (plain === null) return null;
  try {
    return { mem: sanitizeMem(JSON.parse(plain)) || blankMem(), keys: {} };
  } catch {
    return { mem: blankMem(), keys: {} };
  }
}

export function clearLegacy(s: Store) {
  for (const k of [OLD_VAULT, OLD_MEM, OLD_AUTH, ...OLD_EXTRA]) s.removeItem(k);
}

const isEmpty = (m: Mem) => !m.entries.length && !m.archived.length && !m.sessions.length;
/**
 * Add the old local memory to Brain's shared memory. Nothing already in Brain is changed: an old entry whose key
 * Brain already has is skipped, and old ids are renumbered after Brain's own so nothing collides.
 */
export function mergeMem(cloud: Mem, local: Mem): { mem: Mem; entries: number; sessions: number } {
  const m: Mem = structuredClone(cloud);
  const byKey = new Map([...m.entries, ...m.archived].map(e => [e.key, e.id]));
  const eMap = new Map<string, string>(),
    sMap = new Map<string, string>();
  const known = new Map(m.sessions.map(s => [`${s.ts}|${s.q}`, s.id]));
  const newSessions = local.sessions.filter(s => {
    const hit = known.get(`${s.ts}|${s.q}`);
    if (hit) sMap.set(s.id, hit);
    return !hit;
  });
  for (const s of newSessions) sMap.set(s.id, `s${m.nextSession++}`);
  const take = (list: Entry[]) => {
    const out: Entry[] = [];
    for (const e of list) {
      const hit = byKey.get(e.key);
      if (hit) {
        eMap.set(e.id, hit);
        continue;
      }
      const id = `e${m.nextId++}`;
      eMap.set(e.id, id);
      byKey.set(e.key, id);
      out.push({ ...structuredClone(e), id });
    }
    return out;
  };
  const fresh = take(local.entries),
    old = take(local.archived);
  for (const e of [...fresh, ...old]) {
    e.links = e.links.map(l => eMap.get(l)).filter((l): l is string => !!l && l !== e.id);
    e.sources = e.sources.map(x => ({
      ...x,
      ref: x.ref ? ((x.ref.startsWith('s') ? sMap.get(x.ref) : eMap.get(x.ref)) ?? null) : null,
    }));
  }
  m.entries.push(...fresh);
  m.archived.push(...old);
  m.sessions.push(
    ...newSessions.map(s => ({
      ...structuredClone(s),
      id: sMap.get(s.id)!,
      used: (s.used || []).map(u => eMap.get(u)).filter((u): u is string => !!u),
    })),
  );
  m.sessions.sort((a, b) => a.ts - b.ts);
  m.sessions = m.sessions.slice(-MAX_SESSIONS);
  m.blocked = [...new Set([...m.blocked, ...local.blocked])];
  m.runs += local.runs;
  m.filtered += local.filtered;
  if (isEmpty(cloud)) m.settings = { ...local.settings };
  return { mem: m, entries: fresh.length + old.length, sessions: newSessions.length };
}
