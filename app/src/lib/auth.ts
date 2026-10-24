import { MIN_AGE, ageBlockedUntil, blockDevice, dobError, isAdult, type Dob } from './age';
import { EMAIL_DOMAIN } from './config';

// Accounts live in Supabase Auth. Only admins make them, through Brain's accounts function.
// The passcode never leaves the browser: it is stretched here (PBKDF2) and only the result is sent as the password.
/** Shortest passcode allowed (Owner's choice, Oct 2026). */
export const PASS_MIN = 5;
export const PASS_ITER = 310_000,
  IDLE_MS = 15 * 60_000,
  FREE_TRIES = 5,
  MAX_BACKOFF_MS = 15 * 60_000;
export type Role = 'admin' | 'viewer';
export const ROLE_LABEL: Record<Role, string> = { admin: 'Admin', viewer: 'Viewer' };
/** The signed-in person. The role comes from Brain's profiles table, not from this browser. */
export interface User {
  id: string;
  name: string;
  role: Role;
}

export class AuthError extends Error {
  constructor(
    msg: string,
    public code: 'age' | 'blocked' | 'name' | 'passcode' | 'missing' | 'crypto' | 'wrong' | 'server' | 'setup',
  ) {
    super(msg);
  }
}

// ---------- rules ----------
const COMMON = [
  'passwordpassword',
  'password123',
  '1234567890',
  'qwertyuiop',
  'letmein123',
  'iloveyou123',
  'adminadmin',
  'brainbrain',
];
/** Names: letters, numbers and single spaces only (no symbols), 2 to 32 characters. */
export const NAME_RE = /^[A-Za-z0-9]+(?: [A-Za-z0-9]+)*$/;
export const nameError = (n: string) => {
  const t = n.trim();
  return t.length >= 2 && t.length <= 32 && NAME_RE.test(t)
    ? null
    : 'Use 2 to 32 letters or numbers, with single spaces between words. No symbols.';
};
export function passcodeError(p: string, name = ''): string | null {
  if (p.length < PASS_MIN) return `Use at least ${PASS_MIN} characters.`;
  if (p.length > 128) return 'Use 128 characters or fewer.';
  if (new Set(p).size < 4) return 'Use a mix of different characters.';
  const low = p.toLowerCase();
  if (name.trim().length >= 3 && low.includes(name.trim().toLowerCase()))
    return 'Do not put your name in the passcode.';
  if (COMMON.some(c => low.includes(c))) return 'That passcode is too easy to guess.';
  return null;
}
/** Checks for a new account before anything is sent. Under 18: refused, and this browser refuses new accounts for a day. */
export function checkNewAccount(
  input: { name: string; passcode: string; dob: Dob },
  store: Pick<Storage, 'getItem' | 'setItem'>,
  now: number,
): string {
  if (ageBlockedUntil(store, now))
    throw new AuthError('New accounts are paused on this browser. Try again later.', 'blocked');
  const bad = dobError(input.dob, now);
  if (bad) throw new AuthError(bad, 'age');
  if (!isAdult(input.dob, now)) {
    blockDevice(store, now);
    throw new AuthError(`Brain is for adults only (${MIN_AGE}+). No account was made.`, 'age');
  }
  const name = input.name.trim(),
    e1 = nameError(name);
  if (e1) throw new AuthError(e1, 'name');
  const e2 = passcodeError(input.passcode, name);
  if (e2) throw new AuthError(e2, 'passcode');
  return name;
}
export const backoffMs = (fails: number) =>
  fails < FREE_TRIES ? 0 : Math.min(MAX_BACKOFF_MS, 30_000 * 2 ** (fails - FREE_TRIES));

// ---------- passcode to password ----------
/** The sign-in address for a name: lower case, spaces become dots. Nothing is ever emailed to it. */
export const emailFor = (name: string) => `${name.trim().toLowerCase().replace(/ /g, '.')}@${EMAIL_DOMAIN}`;
export const saltFor = (name: string) => `brain.redeemed.live:${name.trim().toLowerCase()}`;
export const b64url = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
function subtle(): SubtleCrypto {
  const c = globalThis.crypto?.subtle;
  if (!c)
    throw new AuthError(
      'This browser cannot protect passcodes here. Open Brain in a current Chrome, Edge, Firefox or Safari.',
      'crypto',
    );
  return c;
}
/**
 * One PBKDF2-SHA256 run (310,000 rounds, salt from the name) gives 64 bytes.
 * The first 32 bytes, base64url, are the password Supabase sees (43 characters).
 * The last 32 bytes never leave this browser: they lock the AI keys an admin chooses to remember on this device.
 * PBKDF2 makes each 32-byte block on its own, so the password tells nothing about the local key.
 */
export async function derivePassword(
  name: string,
  passcode: string,
  iter = PASS_ITER,
): Promise<{ password: string; kek: CryptoKey }> {
  const enc = new TextEncoder();
  const base = await subtle().importKey('raw', enc.encode(passcode.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(
    await subtle().deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(saltFor(name)), iterations: iter },
      base,
      512,
    ),
  );
  const kek = await subtle().importKey('raw', bits.slice(32), 'AES-GCM', false, ['encrypt', 'decrypt']);
  return { password: b64url(bits.slice(0, 32)), kek };
}
