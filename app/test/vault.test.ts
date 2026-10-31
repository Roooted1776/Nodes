import { describe, expect, it } from 'vitest';
import { AUDIT_MAX, audit, readAudit } from '../src/lib/audit';
import {
  decryptVault,
  encryptVault,
  exportBackup,
  importBackup,
  newSecrets,
  openFor,
  sealFor,
  VaultError,
} from '../src/lib/vault';

const kek = () => crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
const DATA = { mem: { entries: [{ title: 'secret plan' }] }, keys: { openai: 'sk-test-123' } };

describe('vault', () => {
  it('encrypts: the stored text does not contain the data', async () => {
    const s = await newSecrets(),
      v = await encryptVault(s, DATA, 1);
    expect(JSON.stringify(v)).not.toMatch(/secret plan|sk-test/);
    expect(await decryptVault(s, v)).toEqual(DATA);
  });
  it('rejects a vault changed outside Brain', async () => {
    const s = await newSecrets(),
      v = await encryptVault(s, DATA, 1);
    const flip = { ...v, ct: v.ct.slice(0, 10) + (v.ct[10] === 'A' ? 'B' : 'A') + v.ct.slice(11) };
    await expect(decryptVault(s, flip)).rejects.toMatchObject({ code: 'tampered' });
    await expect(decryptVault(s, { ...v, n: 2 })).rejects.toMatchObject({ code: 'tampered' }); // the counter is signed too
  });
  it('every account is sealed as an admin (no read-only viewer seal), and keys without the signer cannot write or forge', async () => {
    const s = await newSecrets(),
      k = await kek();
    expect(await openFor(k, await sealFor(k, s))).toEqual(s);
    const readOnly = { dek: s.dek, pub: s.pub };
    await expect(encryptVault(readOnly, DATA, 2)).rejects.toMatchObject({ code: 'read-only' });
    const other = await newSecrets();
    const forged = await encryptVault({ ...other, dek: s.dek }, { mem: 'forged' }, 3);
    await expect(decryptVault(readOnly, forged)).rejects.toMatchObject({ code: 'tampered' });
  });
  it('a sealed copy only opens with the right account key', async () => {
    const s = await newSecrets(),
      w = await sealFor(await kek(), s);
    await expect(openFor(await kek(), w)).rejects.toBeInstanceOf(VaultError);
  });
  it('backups are encrypted with a passphrase', async () => {
    const t = await exportBackup('long backup phrase', DATA, 1000);
    expect(t).not.toMatch(/secret plan/);
    expect(await importBackup('long backup phrase', t)).toEqual(DATA);
    await expect(importBackup('wrong phrase here', t)).rejects.toMatchObject({ code: 'passphrase' });
    await expect(exportBackup('short', DATA)).rejects.toMatchObject({ code: 'passphrase' });
  });
});

describe('access log', () => {
  it('keeps the newest entries and ignores junk', () => {
    const d: Record<string, string> = {},
      s = {
        getItem: (k: string) => d[k] ?? null,
        setItem: (k: string, v: string) => {
          d[k] = v;
        },
      };
    for (let i = 0; i < AUDIT_MAX + 5; i++) audit(s, 'Owner', 'event ' + i, i);
    const log = readAudit(s);
    expect(log.length).toBe(AUDIT_MAX);
    expect(log.at(-1)!.what).toBe('event ' + (AUDIT_MAX + 4));
    d['brain.audit.v1'] = 'not json';
    expect(readAudit(s)).toEqual([]);
  });
});
