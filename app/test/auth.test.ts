import { describe, expect, it } from 'vitest';
import { checkNewAccount, derivePassword, emailFor, nameError, passcodeError, backoffMs } from '../src/lib/auth';
import { newSecrets, openFor, sealFor } from '../src/lib/vault';
describe('Supabase account rules', () => {
  it('accepts a username and a 6+ character password, nothing else', () => {
    expect(checkNewAccount({ name: ' Owner ', passcode: 'sixchr' })).toBe('Owner');
    expect(() => checkNewAccount({ name: 'Owner', passcode: 'five5' })).toThrow(/at least 6/);
    expect(() => checkNewAccount({ name: 'a@b', passcode: 'sixchr' })).toThrow(/letters or numbers/);
  });
  it('validates names and passcodes before sending them', () => {
    expect(nameError('Owner Two')).toBeNull();
    for (const name of ['x', 'a@b', 'two  spaces', '<script>']) expect(nameError(name)).toBeTruthy();
    expect(passcodeError('short1')).toBeNull();
    expect(passcodeError('Owner123', 'Owner')).toBeNull();
    for (const pass of ['tiny', 'short', 'aaaaaa', '123456', 'password', 'password123'])
      expect(passcodeError(pass, 'Owner')).toBeTruthy();
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
      wrap = await sealFor(a.kek, sec);
    expect((await openFor(b.kek, wrap)).priv).toBe(sec.priv);
    await expect(openFor(c.kek, wrap)).rejects.toThrow();
  });
});
