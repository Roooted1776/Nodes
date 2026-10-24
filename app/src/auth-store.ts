import { create } from 'zustand';
import { ageBlockedUntil, type Dob } from './lib/age';
import { audit } from './lib/audit';
import {
  AuthError,
  IDLE_MS,
  createUser,
  loadAuth,
  needsSetup,
  removeUser,
  saveAuth,
  setPasscode,
  verifyLogin,
  type AuthDb,
  type Role,
  type User,
} from './lib/auth';
import { maintain, tally } from './lib/learn';
import { KEY, blankMem, sanitizeMem, type Mem } from './lib/memory';
import type { ProviderId } from './lib/providers';
import { mirror, openChannel, publish, type Hub } from './lib/share';
import {
  VaultError,
  decryptVault,
  encryptVault,
  newSecrets,
  openFor,
  sealFor,
  type Secrets,
  type Vault,
} from './lib/vault';
import { setVault, useStore } from './store';

export const VAULT_KEY = 'brain.vault.v1',
  OLD_KEYS = 'brain.livekeys.v1',
  HIDE_LOCK_MS = 60_000,
  PANIC_MS = 600;
export type Phase = 'setup' | 'login' | 'app';
type Keys = Partial<Record<ProviderId, string>>;
interface AuthState {
  phase: Phase;
  db: AuthDb;
  user: User | null;
  error: string;
  notice: string;
  busy: boolean;
  rev: number;
  session: string;
  lastActive: number;
  setup(i: { name: string; passcode: string; dob: Dob }): Promise<boolean>;
  login(name: string, pass: string): Promise<boolean>;
  logout(why?: string): void;
  addUser(i: { name: string; role: Role; passcode: string; dob: Dob }): Promise<boolean>;
  dropUser(id: string): string;
  resetPasscode(id: string, pass: string): Promise<string>;
  ageBlocked(): number;
}
const ls = localStorage;
const hub: Hub = {
  getState: () => useStore.getState() as never,
  setState: p => useStore.setState(p as never),
  subscribe: fn => useStore.subscribe(fn as never),
};

// ---------- the vault: only this module ever holds the unlocked key, and only while someone is signed in ----------
let secrets: Secrets | null = null,
  counter = 0,
  chain: Promise<unknown> = Promise.resolve();
const readVault = (): Vault | null => {
  try {
    return JSON.parse(ls.getItem(VAULT_KEY) || 'null');
  } catch {
    return null;
  }
};
async function writeVault(data: { mem: Mem; keys: Keys }) {
  if (!secrets?.priv) return false;
  counter = Math.max(counter, readVault()?.n || 0) + 1;
  ls.setItem(VAULT_KEY, JSON.stringify(await encryptVault(secrets, data, counter)));
  return true;
}
async function openVault(): Promise<{ mem: Mem; keys: Keys } | null> {
  const v = readVault();
  if (!v || !secrets) return null;
  const d = (await decryptVault(secrets, v)) as { mem?: unknown; keys?: unknown };
  counter = v.n;
  const keys: Keys = {};
  if (d.keys && typeof d.keys === 'object')
    for (const [p, k] of Object.entries(d.keys)) if (typeof k === 'string') keys[p as ProviderId] = k.slice(0, 300);
  return { mem: sanitizeMem(d.mem) || blankMem(), keys };
}
/** Memory and a remembered key saved in plain text by the earlier version. They are moved into the vault, then deleted. */
function takePlain(): { mem: Mem; keys: Keys } {
  let mem = blankMem();
  const keys: Keys = {};
  try {
    const raw = ls.getItem(KEY),
      m = raw && sanitizeMem(JSON.parse(raw));
    if (m) mem = m;
  } catch {
    /* unreadable */
  }
  try {
    const k = JSON.parse(ls.getItem(OLD_KEYS) || 'null');
    if (k && typeof k === 'object')
      for (const [p, v] of Object.entries(k)) if (typeof v === 'string') keys[p as ProviderId] = v.slice(0, 300);
  } catch {
    /* unreadable */
  }
  return { mem, keys };
}
const hasPlain = () => !!(ls.getItem(KEY) || ls.getItem(OLD_KEYS));
const dropPlain = () => {
  ls.removeItem(KEY);
  ls.removeItem(OLD_KEYS);
};

async function unlock(u: User, s: Secrets, fresh = false) {
  secrets = s;
  let data = fresh ? null : await openVault(),
    notice = '';
  if (!data) {
    if (!s.priv) throw new AuthError('Brain memory is not set up yet. An admin needs to sign in first.', 'missing');
    data = takePlain();
    await writeVault(data);
    if (hasPlain()) {
      dropPlain();
      notice = 'Older unencrypted memory was moved into the encrypted vault.';
    }
  } else if (hasPlain() && s.priv) {
    dropPlain();
    notice = 'An older unencrypted copy of memory was found and deleted. The encrypted copy was kept.';
    audit(ls, u.name, 'Deleted an old unencrypted memory copy');
  }
  maintain(data.mem, tally(), Date.now());
  const live = useStore.getState().live;
  useStore.setState(st => ({
    role: u.role,
    who: u.name,
    mem: data!.mem,
    rev: st.rev + 1,
    keys: live.remember ? data!.keys : {},
    storageOk: true,
  }));
  if (s.priv)
    setVault((mem, keys) => {
      chain = chain.then(() => writeVault({ mem, keys }));
      return chain as Promise<boolean>;
    });
  else setVault(null);
  enter(u);
  return notice;
}

// ---------- while signed in: live sharing, idle lock, panic lock, privacy blur ----------
let stop: (() => void)[] = [];
function enter(u: User) {
  leave(true);
  const ch = openChannel();
  if (ch) stop.push(u.role === 'admin' ? publish(hub, ch) : mirror(hub, ch), () => ch.close());
  if (u.role === 'viewer') {
    const onStorage = (e: StorageEvent) => {
      if (e.key === VAULT_KEY)
        void openVault().then(
          d => d && useStore.setState(st => ({ mem: d.mem, rev: st.rev + 1 })),
          err => useStore.setState({ status: err.message }),
        );
    };
    addEventListener('storage', onStorage);
    stop.push(() => removeEventListener('storage', onStorage));
  }
  const touch = () => {
    const t = Date.now();
    if (t - useAuth.getState().lastActive > 2000) useAuth.setState({ lastActive: t });
  };
  for (const ev of ['pointerdown', 'keydown', 'wheel', 'pointermove']) {
    addEventListener(ev, touch, { passive: true });
    stop.push(() => removeEventListener(ev, touch));
  }
  let lastEsc = 0,
    hiddenAt = 0;
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    const t = Date.now();
    if (t - lastEsc < PANIC_MS) useAuth.getState().logout('Locked.');
    lastEsc = t;
  };
  const onVis = () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      document.body.classList.add('veiled');
      return;
    }
    document.body.classList.remove('veiled');
    if (hiddenAt && Date.now() - hiddenAt > HIDE_LOCK_MS && !useStore.getState().busy)
      useAuth.getState().logout('Locked because the page was hidden for over a minute.');
    hiddenAt = 0;
  };
  addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onVis);
  stop.push(
    () => removeEventListener('keydown', onKey),
    () => document.removeEventListener('visibilitychange', onVis),
    () => document.body.classList.remove('veiled'),
  );
  const timer = setInterval(() => {
    if (useStore.getState().busy)
      useAuth.setState({ lastActive: Date.now() }); // a running task keeps the session open
    else if (Date.now() - useAuth.getState().lastActive > IDLE_MS)
      useAuth.getState().logout(`Locked after ${IDLE_MS / 60000} idle minutes.`);
  }, 5000);
  stop.push(() => clearInterval(timer));
}
/** Forget everything unlocked: the key, memory, remembered keys and the chat on screen. */
function leave(keepKey = false) {
  stop.forEach(f => f());
  stop = [];
  if (keepKey) return;
  secrets = null;
  setVault(null);
  if (useStore.getState().busy) useStore.getState().stop(); // a running task is cancelled on lock
  useStore.setState(st => ({
    role: 'viewer',
    who: '',
    mem: blankMem(),
    rev: st.rev + 1,
    keys: {},
    log: [],
    viewing: null,
    selected: null,
    pulses: [],
    stages: {},
    notes: {},
    active: null,
    status: 'Locked.',
  }));
}
const sessionId = () =>
  Array.from(globalThis.crypto.getRandomValues(new Uint8Array(3)), b => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();

const first = loadAuth(ls);
export const useAuth = create<AuthState>()((set, get) => {
  const bump = () => set(s => ({ rev: s.rev + 1 }));
  const fail = (e: unknown) => {
    set({
      error:
        e instanceof AuthError || e instanceof VaultError || e instanceof Error ? e.message : 'Something went wrong.',
      busy: false,
    });
    return false;
  };
  const signedIn = (u: User, notice: string) =>
    set({ user: u, phase: 'app', busy: false, notice, session: sessionId(), lastActive: Date.now() });
  return {
    phase: needsSetup(first) ? 'setup' : 'login',
    db: first,
    user: null,
    error: '',
    notice: '',
    busy: false,
    rev: 0,
    session: '',
    lastActive: Date.now(),
    ageBlocked: () => ageBlockedUntil(ls, Date.now()),
    async setup(i) {
      set({ busy: true, error: '' });
      try {
        const db = get().db;
        if (!needsSetup(db)) throw new AuthError('Brain is already set up. Sign in instead.', 'blocked');
        const s = await newSecrets();
        const u = await createUser(
          db,
          ls,
          { name: i.name, role: 'admin', passcode: i.passcode, dob: i.dob },
          { now: Date.now(), addedBy: null, secrets: s },
        );
        audit(ls, u.name, 'Set up Brain and created the first admin');
        signedIn(u, await unlock(u, s, true));
        return true;
      } catch (e) {
        return fail(e);
      }
    },
    async login(name, pass) {
      set({ busy: true, error: '', notice: '' });
      try {
        const db = get().db,
          now = Date.now(),
          r = await verifyLogin(db, ls, name, pass, now);
        if (!r.ok) {
          const known = db.users.some(u => u.name.toLowerCase() === name.trim().toLowerCase()); // an unknown name is not written down: it might be a mistyped passcode
          audit(
            ls,
            known ? name.trim() : 'unknown name',
            r.reason === 'locked' ? 'Sign-in refused: waiting after too many tries' : 'Failed sign-in',
          );
          const s = Math.ceil(r.waitMs / 1000);
          bump();
          set({
            busy: false,
            error:
              r.reason === 'locked'
                ? `Too many tries. Wait ${s} seconds.`
                : r.waitMs
                  ? `Name or passcode is wrong. Wait ${s} seconds before the next try.`
                  : 'Name or passcode is wrong.',
          });
          return false;
        }
        let s: Secrets;
        if (r.user.wrap) s = await openFor(r.kek, r.user.wrap);
        else if (r.user.role === 'admin' && !db.users.some(u => u.wrap)) {
          s = await newSecrets();
          r.user.wrap = await sealFor(r.kek, s, true);
          saveAuth(ls, db);
          audit(ls, r.user.name, 'Turned on memory encryption');
        } else
          throw new AuthError(
            'Your account needs a passcode reset by an admin before it can open the encrypted memory.',
            'missing',
          );
        const notice = await unlock(r.user, s, !readVault());
        audit(ls, r.user.name, `Signed in (${r.user.role})`);
        signedIn(r.user, notice);
        return true;
      } catch (e) {
        if (e instanceof VaultError && e.code === 'tampered')
          audit(ls, name.trim(), 'Memory failed its signature check');
        leave();
        return fail(e);
      }
    },
    logout(why = '') {
      const u = get().user;
      if (u) audit(ls, u.name, why ? why.replace(/\.$/, '') : 'Locked');
      leave();
      set({ user: null, phase: 'login', notice: why, error: '' });
    },
    async addUser(i) {
      const me = get().user;
      if (me?.role !== 'admin' || !secrets?.priv)
        return fail(new AuthError('Only admins can add accounts.', 'blocked'));
      set({ busy: true, error: '' });
      try {
        await createUser(get().db, ls, i, { now: Date.now(), addedBy: me.id, secrets });
        audit(ls, me.name, `Added account ${i.name.trim()} (${i.role})`);
        set({ busy: false });
        bump();
        return true;
      } catch (e) {
        return fail(e);
      }
    },
    dropUser(id) {
      const me = get().user;
      if (me?.role !== 'admin') return 'Only admins can remove accounts.';
      const name = get().db.users.find(u => u.id === id)?.name || id;
      try {
        removeUser(get().db, ls, id);
        audit(ls, me.name, `Removed account ${name}`);
        if (id === me.id) get().logout();
        else bump();
        return '';
      } catch (e: any) {
        return e.message;
      }
    },
    async resetPasscode(id, pass) {
      const me = get().user;
      if (me?.role !== 'admin' || !secrets?.priv) return 'Only admins can reset passcodes.';
      const name = get().db.users.find(u => u.id === id)?.name || id;
      try {
        await setPasscode(get().db, ls, id, pass, undefined, secrets);
        audit(ls, me.name, `Reset the passcode for ${name}`);
        bump();
        return '';
      } catch (e: any) {
        return e.message;
      }
    },
  };
});
