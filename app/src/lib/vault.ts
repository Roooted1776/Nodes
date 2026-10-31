// Browser-side AES-256-GCM vaults, signed by admins. The database receives memory ciphertext only.
// The vault holds memory only. Provider keys and the GitHub token are kept on the device by keystore.ts.
export class VaultError extends Error {
  constructor(
    msg: string,
    public code: 'crypto' | 'tampered' | 'read-only' | 'passphrase' | 'format',
  ) {
    super(msg);
  }
}

const enc = new TextEncoder(),
  dec = new TextDecoder();
function subtle(): SubtleCrypto {
  const c = globalThis.crypto?.subtle;
  if (!c)
    throw new VaultError(
      'This browser cannot encrypt here. Open index.html from your computer in a current browser.',
      'crypto',
    );
  return c;
}
export const b64 = (b: ArrayBuffer | Uint8Array) => {
  const u = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = '';
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s);
};
export const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const rnd = (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n));
const ECDSA = { name: 'ECDSA', namedCurve: 'P-256' } as const,
  SIGN = { name: 'ECDSA', hash: 'SHA-256' } as const;
const buf = (u: Uint8Array) => u as unknown as BufferSource;

/** Raw key material, base64. Held in memory only while an account is signed in. */
export interface Secrets {
  dek: string;
  pub: string;
  priv?: string;
}
export interface Sealed {
  iv: string;
  ct: string;
}
export interface Vault {
  v: 1;
  n: number;
  iv: string;
  ct: string;
  sig: string;
}

export async function newSecrets(): Promise<Secrets> {
  const kp = (await subtle().generateKey(ECDSA, true, ['sign', 'verify'])) as CryptoKeyPair;
  return {
    dek: b64(rnd(32)),
    pub: b64(await subtle().exportKey('spki', kp.publicKey)),
    priv: b64(await subtle().exportKey('pkcs8', kp.privateKey)),
  };
}
const aes = (raw: Uint8Array, use: KeyUsage[]) => subtle().importKey('raw', buf(raw), 'AES-GCM', false, use);
async function seal(key: CryptoKey, data: Uint8Array, ad?: Uint8Array): Promise<Sealed> {
  const iv = rnd(12);
  const ct = await subtle().encrypt(
    { name: 'AES-GCM', iv: buf(iv), ...(ad ? { additionalData: buf(ad) } : {}) },
    key,
    buf(data),
  );
  return { iv: b64(iv), ct: b64(ct) };
}
async function open(
  key: CryptoKey,
  s: Sealed,
  ad: Uint8Array | undefined,
  why: string,
  code: VaultError['code'],
): Promise<Uint8Array> {
  try {
    return new Uint8Array(
      await subtle().decrypt(
        { name: 'AES-GCM', iv: buf(unb64(s.iv)), ...(ad ? { additionalData: buf(ad) } : {}) },
        key,
        buf(unb64(s.ct)),
      ),
    );
  } catch {
    throw new VaultError(why, code);
  }
}

/** Seal the secrets for one account. Every account is an admin, so it gets the read, public and signing keys. */
export const sealFor = (kek: CryptoKey, s: Secrets) => seal(kek, enc.encode(JSON.stringify(s)));
export async function openFor(kek: CryptoKey, w: Sealed): Promise<Secrets> {
  const j = JSON.parse(
    dec.decode(await open(kek, w, undefined, 'This account could not open the memory key.', 'tampered')),
  );
  if (typeof j?.dek !== 'string' || typeof j?.pub !== 'string')
    throw new VaultError('The memory key is damaged.', 'format');
  return { dek: j.dek, pub: j.pub, ...(typeof j.priv === 'string' ? { priv: j.priv } : {}) };
}

const AD = (n: number) => enc.encode('brain-vault-v1|' + n);
const signed = (n: number, iv: string, ct: string) => enc.encode(`brain-vault-v1|${n}|${iv}|${ct}`);
export async function encryptVault(s: Secrets, data: unknown, n: number): Promise<Vault> {
  if (!s.priv) throw new VaultError('Only admins can change Brain.', 'read-only');
  const sealed = await seal(await aes(unb64(s.dek), ['encrypt']), enc.encode(JSON.stringify(data)), AD(n));
  const priv = await subtle().importKey('pkcs8', buf(unb64(s.priv)), ECDSA, false, ['sign']);
  return { v: 1, n, ...sealed, sig: b64(await subtle().sign(SIGN, priv, buf(signed(n, sealed.iv, sealed.ct)))) };
}
export async function decryptVault(s: Secrets, v: Vault): Promise<unknown> {
  if (
    v?.v !== 1 ||
    !Number.isInteger(v.n) ||
    typeof v.iv !== 'string' ||
    typeof v.ct !== 'string' ||
    typeof v.sig !== 'string'
  )
    throw new VaultError('Saved memory is not in the right format.', 'format');
  const pub = await subtle().importKey('spki', buf(unb64(s.pub)), ECDSA, false, ['verify']);
  if (!(await subtle().verify(SIGN, pub, buf(unb64(v.sig)), buf(signed(v.n, v.iv, v.ct)))))
    throw new VaultError(
      'Saved memory failed its signature check. It was changed outside Brain, so it was not loaded.',
      'tampered',
    );
  return JSON.parse(
    dec.decode(
      await open(await aes(unb64(s.dek), ['decrypt']), v, AD(v.n), 'Saved memory could not be decrypted.', 'tampered'),
    ),
  );
}

/** A backup is encrypted with a passphrase you choose, so it is safe to keep outside the browser. */
export async function exportBackup(passphrase: string, data: unknown, iter = 600_000): Promise<string> {
  if (passphrase.length < 10) throw new VaultError('Use a backup passphrase of at least 10 characters.', 'passphrase');
  const salt = rnd(16),
    key = await passKey(passphrase, salt, iter);
  return JSON.stringify({
    brainBackup: 1,
    iter,
    salt: b64(salt),
    ...(await seal(key, enc.encode(JSON.stringify(data)))),
  });
}
export async function importBackup(passphrase: string, text: string): Promise<unknown> {
  let d: (Sealed & { brainBackup?: number; salt?: string; iter?: number }) | null = null;
  try {
    d = JSON.parse(text);
  } catch {
    throw new VaultError('That is not backup text.', 'format');
  }
  if (
    d?.brainBackup !== 1 ||
    typeof d.salt !== 'string' ||
    typeof d.iter !== 'number' ||
    !Number.isFinite(d.iter) ||
    typeof d.iv !== 'string' ||
    typeof d.ct !== 'string'
  )
    throw new VaultError('That is not an encrypted Brain backup.', 'format');
  const key = await passKey(passphrase, unb64(d.salt), Math.min(5_000_000, Math.max(1000, d.iter)));
  return JSON.parse(
    dec.decode(await open(key, d, undefined, 'Wrong passphrase, or the backup was changed.', 'passphrase')),
  );
}
async function passKey(pass: string, salt: Uint8Array, iter: number) {
  const base = await subtle().importKey('raw', buf(enc.encode(pass.normalize('NFKC'))), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: buf(salt), iterations: iter },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}
