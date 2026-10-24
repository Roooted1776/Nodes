// AI provider keys an admin chose to remember. They stay on this device only, sealed (AES-256-GCM) with a key
// made from that admin's passcode at sign-in. They are never sent to Brain's database.
import type { ProviderId } from './providers';

export const KEYS_KEY = 'brain.keys.v1';
export type Keys = Partial<Record<ProviderId, string>>;
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
interface Sealed {
  iv: string;
  ct: string;
}
const enc = new TextEncoder(),
  dec = new TextDecoder();
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const ad = (uid: string) => enc.encode(`brain-keys-v1|${uid}`);
const read = (s: Store): Record<string, Sealed> => {
  try {
    const d = JSON.parse(s.getItem(KEYS_KEY) || '{}');
    return d && typeof d === 'object' && !Array.isArray(d) ? d : {};
  } catch {
    return {};
  }
};
const write = (s: Store, all: Record<string, Sealed>) => {
  if (Object.keys(all).length) s.setItem(KEYS_KEY, JSON.stringify(all));
  else s.removeItem(KEYS_KEY);
};
const clean = (d: unknown): Keys => {
  const out: Keys = {};
  if (d && typeof d === 'object')
    for (const [p, k] of Object.entries(d)) if (typeof k === 'string' && k) out[p as ProviderId] = k.slice(0, 300);
  return out;
};

/** Seal the keys for one account, or forget them when `keys` is null or empty. */
export async function sealKeys(s: Store, kek: CryptoKey, uid: string, keys: Keys | null): Promise<void> {
  const all = read(s),
    k = clean(keys);
  if (!Object.keys(k).length) delete all[uid];
  else {
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(
      await globalThis.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, additionalData: ad(uid) },
        kek,
        enc.encode(JSON.stringify(k)),
      ),
    );
    all[uid] = { iv: b64(iv), ct: b64(ct) };
  }
  try {
    write(s, all);
  } catch {
    /* storage blocked: the key stays for this tab only */
  }
}
/** Open this account's remembered keys. A copy that does not open (passcode was reset, or it was changed) is dropped. */
export async function openKeys(s: Store, kek: CryptoKey, uid: string): Promise<Keys> {
  const all = read(s),
    w = all[uid];
  if (!w || typeof w.iv !== 'string' || typeof w.ct !== 'string') return {};
  try {
    const pt = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: unb64(w.iv), additionalData: ad(uid) },
      kek,
      unb64(w.ct),
    );
    return clean(JSON.parse(dec.decode(pt)));
  } catch {
    delete all[uid];
    write(s, all);
    return {};
  }
}
export function dropKeys(s: Store, uid: string) {
  const all = read(s);
  delete all[uid];
  write(s, all);
}
