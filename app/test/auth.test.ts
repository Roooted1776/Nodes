import { describe, expect, it } from 'vitest';
import { AGE_KEY, ageOn, dobError, isAdult } from '../src/lib/age';
import { hashPasscode } from '../src/lib/auth';
import { newSecrets, openFor } from '../src/lib/vault';
import { nameError } from '../src/lib/auth';
import {
  AUTH_KEY,
  AuthError,
  IDLE_MS,
  adminCount,
  backoffMs,
  blankAuth,
  createUser,
  endSession,
  loadAuth,
  passcodeError,
  readSession,
  removeUser,
  setPasscode,
  startSession,
  verifyLogin,
} from '../src/lib/auth';

const mem = () => {
  const d: Record<string, string> = {};
  return {
    getItem: (k: string) => d[k] ?? null,
    setItem: (k: string, v: string) => {
      d[k] = v;
    },
    removeItem: (k: string) => {
      delete d[k];
    },
    d,
  };
};
const NOW = new Date(2026, 9, 23, 12).getTime(),
  ITER = 1000,
  ADULT = { y: 1980, m: 5, d: 17 };
const make = async (
  st = mem(),
  db = blankAuth(),
  role: 'admin' | 'viewer' = 'admin',
  name = 'Owner',
  pass = 'correct horse battery',
) => ({
  st,
  db,
  u: await createUser(db, st, { name, role, passcode: pass, dob: ADULT }, { now: NOW, addedBy: null, iter: ITER }),
});

describe('age gate', () => {
  it('counts whole years and flips on the 18th birthday', () => {
    expect(ageOn({ y: 2008, m: 10, d: 23 }, NOW)).toBe(18);
    expect(isAdult({ y: 2008, m: 10, d: 23 }, NOW)).toBe(true);
    expect(ageOn({ y: 2008, m: 10, d: 24 }, NOW)).toBe(17);
    expect(isAdult({ y: 2008, m: 10, d: 24 }, NOW)).toBe(false);
    expect(isAdult({ y: 2012, m: 1, d: 1 }, NOW)).toBe(false);
  });
  it('rejects impossible and future dates', () => {
    expect(dobError({ y: 1990, m: 2, d: 30 }, NOW)).toMatch(/real date/);
    expect(dobError({ y: 2027, m: 1, d: 1 }, NOW)).toMatch(/future/);
    expect(dobError({ y: NaN, m: 1, d: 1 }, NOW)).toMatch(/full date/);
    expect(dobError({ y: 1850, m: 1, d: 1 }, NOW)).toMatch(/real date/);
    expect(isAdult({ y: 1990, m: 2, d: 30 }, NOW)).toBe(false);
  });
  it('refuses an under-18 account, makes none, and pauses new accounts for a day', async () => {
    const st = mem(),
      db = blankAuth();
    const kid = {
      name: 'Kid',
      role: 'viewer' as const,
      passcode: 'a long enough passcode',
      dob: { y: 2012, m: 6, d: 1 },
    };
    await expect(createUser(db, st, kid, { now: NOW, addedBy: null, iter: ITER })).rejects.toMatchObject({
      code: 'age',
    });
    expect(db.users).toEqual([]);
    expect(st.d[AGE_KEY]).toBeDefined();
    await expect(
      createUser(db, st, { ...kid, dob: ADULT }, { now: NOW + 3600_000, addedBy: null, iter: ITER }),
    ).rejects.toMatchObject({ code: 'blocked' });
    await expect(
      createUser(db, st, { ...kid, dob: ADULT }, { now: NOW + 25 * 3600_000, addedBy: null, iter: ITER }),
    ).resolves.toMatchObject({ name: 'Kid' });
  });
  it('never stores the date of birth', async () => {
    const { st } = await make();
    const raw = st.d[AUTH_KEY];
    expect(raw).not.toMatch(/1980|dob|birth/i);
    expect(JSON.parse(raw).users[0].adult).toBe(true);
  });
});

describe('accounts and login', () => {
  it('hashes the passcode (no plain text) and accepts it', async () => {
    const { st, db } = await make();
    expect(st.d[AUTH_KEY]).not.toContain('correct horse');
    const r = await verifyLogin(db, st, 'owner', 'correct horse battery', NOW);
    expect(r.ok).toBe(true);
  });
  it('rejects a wrong passcode and an unknown name the same way', async () => {
    const { st, db } = await make();
    expect(await verifyLogin(db, st, 'Owner', 'nope nope nope', NOW)).toMatchObject({ ok: false, reason: 'wrong' });
    expect(await verifyLogin(db, st, 'Nobody', 'correct horse battery', NOW)).toMatchObject({
      ok: false,
      reason: 'wrong',
    });
  });
  it('slows down after five misses, then resets after a good login', async () => {
    const { st, db } = await make();
    let r: any;
    for (let i = 0; i < 5; i++) r = await verifyLogin(db, st, 'Owner', 'wrong wrong wrong', NOW);
    expect(r.waitMs).toBe(30_000);
    expect(await verifyLogin(db, st, 'Owner', 'correct horse battery', NOW + 1000)).toMatchObject({
      ok: false,
      reason: 'locked',
    });
    expect((await verifyLogin(db, st, 'Owner', 'correct horse battery', NOW + 31_000)).ok).toBe(true);
    expect(db.fails).toBe(0);
    expect([4, 5, 6, 7, 20].map(backoffMs)).toEqual([0, 30_000, 60_000, 120_000, 900_000]);
  });
  it('enforces name and passcode rules and unique names', async () => {
    expect(passcodeError('abc1')).toMatch(/5/);
    expect(passcodeError('ab3cd')).toBeNull();
    expect(passcodeError('aaaaaaaaaaaa')).toMatch(/mix/);
    expect(passcodeError('my owner secret!', 'Owner')).toMatch(/name/);
    expect(passcodeError('passwordpassword1')).toMatch(/easy/);
    expect(passcodeError('correct horse battery')).toBeNull();
    const { st, db } = await make();
    await expect(
      createUser(
        db,
        st,
        { name: 'OWNER', role: 'viewer', passcode: 'another long passcode', dob: ADULT },
        { now: NOW, addedBy: 'u1', iter: ITER },
      ),
    ).rejects.toMatchObject({ code: 'taken' });
    for (const bad of ['Ow.ner', "Robert'); DROP TABLE users;--", 'a_b', 'x-y', 'two  spaces', 'é'])
      expect(nameError(bad)).toMatch(/No symbols/);
    expect(nameError('Max 2')).toBeNull();
    expect(nameError('Owner')).toBeNull();
    await expect(
      createUser(
        db,
        st,
        { name: '<b>', role: 'viewer', passcode: 'another long passcode', dob: ADULT },
        { now: NOW, addedBy: 'u1', iter: ITER },
      ),
    ).rejects.toMatchObject({ code: 'name' });
  });
  it('keeps at least one admin and lets an admin reset a passcode', async () => {
    const { st, db, u } = await make();
    const v = await createUser(
      db,
      st,
      { name: 'Guest', role: 'viewer', passcode: 'visitor pass phrase', dob: ADULT },
      { now: NOW, addedBy: u.id, iter: ITER },
    );
    expect(() => removeUser(db, st, u.id)).toThrow(AuthError);
    removeUser(db, st, v.id);
    expect(db.users.length).toBe(1);
    expect(adminCount(db)).toBe(1);
    await setPasscode(db, st, u.id, 'a brand new passcode', ITER);
    expect((await verifyLogin(db, st, 'Owner', 'correct horse battery', NOW)).ok).toBe(false);
    expect((await verifyLogin(loadAuth(st), st, 'Owner', 'a brand new passcode', NOW + 999_999)).ok).toBe(true);
  });
  it('sessions expire after 15 idle minutes and end on lock', async () => {
    const { st, db, u } = await make(),
      ss = mem();
    startSession(ss, u, NOW);
    expect(readSession(ss, db, NOW + IDLE_MS - 1)?.id).toBe(u.id);
    expect(readSession(ss, db, NOW + IDLE_MS + 1)).toBeNull();
    startSession(ss, u, NOW);
    endSession(ss);
    expect(readSession(ss, db, NOW)).toBeNull();
    void st;
  });
  it('an account opens its own sealed key; an older account is upgraded on sign-in', async () => {
    const st = mem(),
      db = blankAuth(),
      s = await newSecrets();
    const u = await createUser(
      db,
      st,
      { name: 'Owner', role: 'admin', passcode: 'correct horse battery', dob: ADULT },
      { now: NOW, addedBy: null, iter: ITER, secrets: s },
    );
    const v = await createUser(
      db,
      st,
      { name: 'Guest', role: 'viewer', passcode: 'visitor pass phrase', dob: ADULT },
      { now: NOW, addedBy: u.id, iter: ITER, secrets: s },
    );
    const ra = await verifyLogin(db, st, 'Owner', 'correct horse battery', NOW),
      rv = await verifyLogin(db, st, 'Guest', 'visitor pass phrase', NOW);
    if (!ra.ok || !rv.ok) throw new Error('login failed');
    expect((await openFor(ra.kek, u.wrap!)).priv).toBe(s.priv);
    expect((await openFor(rv.kek, v.wrap!)).priv).toBeUndefined();
    const old = { ...(await hashPasscode('an older passcode', undefined, ITER)) },
      legacy = {
        id: 'u9',
        name: 'Old',
        role: 'viewer' as const,
        ...old,
        created: NOW,
        adult: true as const,
        addedBy: null,
      };
    db.users.push(legacy);
    const r = await verifyLogin(db, st, 'Old', 'an older passcode', NOW);
    expect(r.ok).toBe(true);
    expect(db.users.find(x => x.id === 'u9')!.v).toBe(2);
    expect((await verifyLogin(db, st, 'Old', 'an older passcode', NOW)).ok).toBe(true);
  });
});
