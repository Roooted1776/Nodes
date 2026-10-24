import { describe, expect, it } from 'vitest';
import { ageOn, dobError, isAdult } from '../src/lib/age';
import { checkNewAccount, derivePassword, emailFor, nameError, passcodeError, backoffMs } from '../src/lib/auth';
import { newSecrets, openFor, sealFor } from '../src/lib/vault';
const NOW = new Date(2026, 9, 23, 12).getTime();
const store = () => {
  const d: Record<string, string> = {};
  return {
    getItem: (k: string) => d[k] ?? null,
    setItem: (k: string, v: string) => {
      d[k] = v;
    },
  };
};
describe('Supabase account rules', () => {
  it('accepts adults and rejects invalid dates and underage accounts without storing a birth date', () => {
    const s = store();
    const input = { name: 'Owner', passcode: 'correct horse battery', dob: { y: 1980, m: 5, d: 17 } };
    expect(checkNewAccount(input, s, NOW)).toBe('Owner');
    expect(s.getItem('brain.agegate.v1')).toBeNull();
    expect(() => checkNewAccount({ ...input, dob: { y: 2012, m: 1, d: 1 } }, s, NOW)).toThrow(/adults only/);
    expect(() => checkNewAccount(input, s, NOW)).toThrow(/paused/);
    expect(dobError({ y: 2000, m: 2, d: 30 }, NOW)).toMatch(/real/);
    expect(isAdult({ y: 2008, m: 10, d: 24 }, NOW)).toBe(false);
    expect(ageOn({ y: 2008, m: 10, d: 23 }, NOW)).toBe(18);
  });
  it('validates names and passcodes before sending them', () => {
    expect(nameError('Owner Two')).toBeNull();
    for (const name of ['x', 'a@b', 'two  spaces', '<script>']) expect(nameError(name)).toBeTruthy();
    expect(passcodeError('short')).toBeNull();
    for (const pass of ['tiny', 'aaaaa', 'password123', 'Owner123']) expect(passcodeError(pass, 'Owner')).toBeTruthy();
    expect(emailFor('Owner Two')).toBe('owner.two@users.redeemed.live');
    expect(backoffMs(5)).toBe(30000);
  });
  it('separates the remote password from the local encryption key and normalizes account names', async () => {
    const a = await derivePassword('Owner', 'correct horse battery', 1000);
    const b = await derivePassword(' owner ', 'correct horse battery', 1000);
    const c = await derivePassword('Owner', 'different passcode', 1000);
    expect(a.password).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.password).toBe(b.password);
    expect(a.password).not.toBe(c.password);
    const sec = await newSecrets(),
      wrap = await sealFor(a.kek, sec, false);
    expect((await openFor(b.kek, wrap)).priv).toBeUndefined();
    await expect(openFor(c.kek, wrap)).rejects.toThrow();
  });
});
