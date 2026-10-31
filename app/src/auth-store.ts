import { create } from 'zustand';
import { audit, setAuditSink } from './lib/audit';
import { AuthError, IDLE_MS, checkNewAccount, derivePassword, passcodeError, type Role, type User } from './lib/auth';
import {
  accounts,
  signIn,
  signOut,
  accountWrap,
  loadVault,
  saveVault,
  loadMemoryDatabase,
  resetMirror,
  syncMemoryDatabase,
  writeAudit,
} from './lib/cloud';
import { blankMem, sanitizeMem } from './lib/memory';
import { openChannel, publish, type Hub } from './lib/share';
import { VaultError, decryptVault, encryptVault, newSecrets, openFor, sealFor, type Secrets } from './lib/vault';
import { GITHUB_ENTRY, KEYS_KEY, type Keys, openKeys, sealKeys } from './lib/keystore';
import { setKeySave, setVault, takePlainGithubToken, useStore } from './store';

export const VAULT_KEY = 'brain.vault.v1',
  HIDE_LOCK_MS = 60_000,
  PANIC_MS = 600;
export type Phase = 'setup' | 'login' | 'app';
interface Listed extends User {
  created: number;
}
interface AuthState {
  phase: Phase;
  db: { users: Listed[]; lockedUntil: number };
  user: User | null;
  error: string;
  notice: string;
  busy: boolean;
  rev: number;
  session: string;
  lastActive: number;
  ready: boolean;
  init(): Promise<void>;
  setPhase(phase: Phase): void;
  setup(i: { name: string; passcode: string }): Promise<boolean>;
  login(name: string, pass: string): Promise<boolean>;
  logout(why?: string): void;
  addUser(i: { name: string; role: Role; passcode: string }): Promise<boolean>;
  dropUser(id: string): Promise<string>;
  resetPasscode(id: string, pass: string): Promise<string>;
}
const ls = localStorage;
const hub: Hub = {
  getState: () => useStore.getState() as never,
  setState: p => useStore.setState(p as never),
  subscribe: fn => useStore.subscribe(fn as never),
};
let secrets: Secrets | null = null,
  counter = 0,
  revision = 0;
let chain: Promise<unknown> = Promise.resolve();
let generation = 0;
/**
 * Keep the database copy of memory current for as long as an admin is unlocked.
 * A moment after any change it sends only the rows that changed. If something fails it says so,
 * tries again with a growing wait, and a 30 second check catches anything left over.
 */
function startMirror() {
  let timer: ReturnType<typeof setTimeout> | undefined,
    running = false,
    dirty = true,
    wait = 5000;
  const run = async () => {
    if (running) {
      dirty = true;
      return;
    }
    running = true;
    dirty = false;
    let failed = 0;
    try {
      const r = await syncMemoryDatabase(useStore.getState().mem);
      failed = r.failed;
      if (r.failed)
        useStore.setState({ status: `Memory: ${r.failed} item(s) not saved to the database (${r.firstError}).` });
    } catch (e) {
      failed = 1;
      useStore.setState({
        status: `Memory could not reach the database: ${String((e as Error)?.message || e).slice(0, 120)}`,
      });
    }
    running = false;
    if (failed) {
      dirty = true;
      schedule(wait);
      wait = Math.min(wait * 2, 60_000);
    } else wait = 5000;
  };
  const schedule = (ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => void run(), ms);
  };
  const off = useStore.subscribe((st, prev) => {
    if (st.rev !== prev.rev && st.role === 'admin') {
      dirty = true;
      schedule(1500);
    }
  });
  const tick = setInterval(() => dirty && !running && void run(), 30_000);
  const onHide = () => document.hidden && dirty && void run(); // push anything pending before the tab goes away
  document.addEventListener('visibilitychange', onHide);
  schedule(0);
  stop.push(
    off,
    () => clearInterval(tick),
    () => clearTimeout(timer),
    () => document.removeEventListener('visibilitychange', onHide),
  );
}
async function unlock(u: User, kek: CryptoKey) {
  secrets = await openFor(kek, await accountWrap(u.id));
  const s = secrets,
    remote = await loadVault();
  const data = (await decryptVault(s, remote.envelope)) as { mem?: unknown; keys?: unknown; deviceKeys?: unknown };
  let mem = sanitizeMem(data.mem);
  if (!mem) throw new VaultError('The encrypted memory has an invalid format.', 'format');
  // The vault came back empty (wiped or new). The admin-only database mirror is the backup: rebuild from it.
  // Only an unlocked admin reads those tables and restores.
  let restored = 0;
  if (u.role === 'admin' && !mem.entries.length && !mem.sessions.length) {
    try {
      const back = sanitizeMem(await loadMemoryDatabase());
      if (back && (back.entries.length || back.sessions.length)) {
        mem = back;
        restored = back.entries.length + back.sessions.length;
      }
    } catch {
      /* the database copy is only a backup; an empty memory is still a valid start */
    }
  }
  counter = remote.envelope.n;
  revision = remote.rev;
  chain = Promise.resolve();
  // Provider keys and the GitHub token stay on this device only, sealed with this admin's passcode
  // (keystore.ts). They never go into the shared vault in the database.
  let saved: Keys = {};
  if (s.priv) {
    // An older Brain kept the sealed copy inside the local vault cache (`deviceKeys`): move it to the keystore.
    try {
      const cached = JSON.parse(ls.getItem(VAULT_KEY) || 'null');
      if (cached && ls.getItem(KEYS_KEY) === null) {
        const old = (await decryptVault(s, cached)) as { deviceKeys?: unknown };
        if (typeof old.deviceKeys === 'string' && old.deviceKeys !== '{}') ls.setItem(KEYS_KEY, old.deviceKeys);
      }
    } catch {
      /* an unusable cache never replaces the verified database copy */
    }
    const onDevice = await openKeys(ls, kek, u.id);
    // An older vault may still hold keys: keep them on this device, then take them out of the vault below.
    const fromVault: Keys = {};
    if (data.keys && typeof data.keys === 'object')
      for (const [p, k] of Object.entries(data.keys)) if (typeof k === 'string' && k) fromVault[p as keyof Keys] = k;
    const plainToken = takePlainGithubToken(); // a plain copy found in this browser on load
    saved = {
      ...(plainToken ? { [GITHUB_ENTRY]: plainToken } : {}),
      ...fromVault,
      ...onDevice,
    };
    if (Object.keys(fromVault).length || (plainToken && !onDevice[GITHUB_ENTRY])) await sealKeys(ls, kek, u.id, saved);
    // Re-save the shared vault without keys, so the database copy no longer holds any.
    if ('keys' in data || 'deviceKeys' in data) {
      try {
        const clean = await encryptVault(s, { mem }, counter + 1);
        revision = await saveVault(clean, revision);
        counter = clean.n;
      } catch {
        /* tried again on the next save, which also writes memory only */
      }
    }
    ls.setItem(VAULT_KEY, JSON.stringify(await encryptVault(s, { mem }, counter)));
  } else if (!ls.getItem(VAULT_KEY)) ls.setItem(VAULT_KEY, JSON.stringify(remote.envelope));
  const { [GITHUB_ENTRY]: githubToken = '', ...providerKeys } = saved;
  useStore.setState(st => ({
    role: u.role,
    who: u.name,
    mem,
    rev: st.rev + 1,
    keys: u.role === 'admin' ? providerKeys : {},
    githubToken: u.role === 'admin' ? githubToken : '',
    live: u.role === 'admin' && Object.keys(providerKeys).length > 0 ? { ...st.live, remember: true } : st.live,
    storageOk: true,
  }));
  setAuditSink((who, what) => writeAudit(u.id, who, what));
  if (s.priv) {
    const epoch = generation;
    setVault(m => {
      // Capture now: queued writes must never read a later mutable memory object.
      const snapshot = structuredClone(m);
      const job = chain.then(async () => {
        if (epoch !== generation) return false;
        const envelope = await encryptVault(s, { mem: snapshot }, counter + 1);
        if (epoch !== generation) return false;
        revision = await saveVault(envelope, revision);
        counter = envelope.n;
        if (epoch !== generation) return false;
        const local = await encryptVault(s, { mem: snapshot }, envelope.n);
        if (epoch !== generation) return false;
        ls.setItem(VAULT_KEY, JSON.stringify(local));
        return true;
      });
      // A failed chain stays failed: later edits must not overwrite a conflicting remote save.
      chain = job;
      return job;
    });
    // Keys are sealed one save at a time, so a slower earlier save never overwrites a newer one.
    let keyChain: Promise<void> = Promise.resolve();
    setKeySave(keys => {
      const copy = { ...keys };
      keyChain = keyChain
        .catch(() => undefined)
        .then(async () => {
          if (epoch === generation) await sealKeys(ls, kek, u.id, copy);
        });
      return keyChain;
    });
  } else {
    setVault(null);
    setKeySave(null);
  }
  enter(u);
  if (restored) {
    useStore.setState({ status: `Memory restored from the database backup (${restored} items).` });
    useStore.getState().commit(); // write it back into the encrypted vault
  }
}
// ---------- while signed in: live sharing, idle lock, panic lock, privacy blur ----------
let stop: (() => void)[] = [];
function enter(u: User) {
  leave(true);
  const ch = openChannel();
  if (ch) stop.push(publish(hub, ch), () => ch.close());
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
  if (u.role === 'admin') startMirror();
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
  resetMirror();
  setAuditSink(null);
  setVault(null);
  setKeySave(null);
  if (useStore.getState().busy) useStore.getState().stop(); // a running task is cancelled on lock
  useStore.setState(st => ({
    role: null,
    who: '',
    mem: blankMem(),
    rev: st.rev + 1,
    keys: {},
    githubToken: '',
    log: [],
    viewing: null,
    selected: null,
    pulses: [],
    stages: {},
    notes: {},
    active: null,
    chatThreadId: null,
    composerMode: 'task',
    status: 'Locked.',
  }));
}
const sessionId = () =>
  Array.from(globalThis.crypto.getRandomValues(new Uint8Array(3)), b => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();

export const useAuth = create<AuthState>()((set, get) => {
  const fail = (e: unknown) => {
    set({ error: e instanceof Error ? e.message : 'Something went wrong.', busy: false });
    return false;
  };
  const refresh = async () => {
    if (get().user?.role !== 'admin') return;
    const r = await accounts<{ users: (User & { created_at: string })[] }>('list', {}, true);
    set({
      db: { users: r.users.map(u => ({ ...u, created: Date.parse(u.created_at) })), lockedUntil: 0 },
      rev: get().rev + 1,
    });
  };
  const login = async (name: string, pass: string) => {
    set({ busy: true, error: '', notice: '' });
    const epoch = ++generation;
    try {
      const { user, kek } = await signIn(name, pass);
      if (epoch !== generation) return false;
      await unlock(user, kek);
      if (epoch !== generation) {
        leave();
        return false;
      }
      set({ user, phase: 'app', busy: false, session: sessionId(), lastActive: Date.now() });
      await refresh();
      void audit(user.name, `Signed in (${user.role})`);
      return true;
    } catch (e) {
      leave();
      void signOut();
      set({ user: null, phase: 'login', db: { users: [], lockedUntil: 0 } });
      return fail(e);
    }
  };
  return {
    phase: 'login',
    db: { users: [], lockedUntil: 0 },
    user: null,
    error: '',
    notice: '',
    busy: false,
    rev: 0,
    session: '',
    lastActive: Date.now(),
    ready: false,
    setPhase: (phase: Phase) => set({ phase, error: '', notice: '', ready: true }),
    async init() {
      if (get().ready || get().busy) return;
      set({ busy: true, error: '' });
      try {
        const r = await accounts<{ setupNeeded: boolean }>('status');
        if (r.setupNeeded) {
          try {
            ls.removeItem(VAULT_KEY);
            for (let i = ls.length - 1; i >= 0; i--) {
              const k = ls.key(i);
              if (k && (k.startsWith('sb-') || k.includes('supabase.auth.token'))) ls.removeItem(k);
            }
          } catch {
            /* ignore */
          }
        }
        set({ phase: r.setupNeeded ? 'setup' : 'login', ready: true, busy: false });
      } catch (e) {
        fail(e);
      }
    },
    async setup(i) {
      set({ busy: true, error: '' });
      try {
        const name = checkNewAccount(i);
        const { password, kek } = await derivePassword(name, i.passcode);
        const sec = await newSecrets();
        await accounts('setup', {
          name,
          password,
          wrap: await sealFor(kek, sec),
          envelope: await encryptVault(sec, { mem: blankMem() }, 1),
        });
        return await login(name, i.passcode);
      } catch (e) {
        return fail(e);
      }
    },
    login,
    logout(why = '') {
      const u = get().user;
      if (u) void audit(u.name, why || 'Locked');
      ++generation;
      leave();
      setAuditSink(null);
      void signOut();
      set({ user: null, phase: 'login', notice: why, error: '', busy: false, db: { users: [], lockedUntil: 0 } });
    },
    async addUser(i) {
      if (get().user?.role !== 'admin' || !secrets?.priv)
        return fail(new AuthError('Only admins can add accounts.', 'blocked'));
      set({ busy: true, error: '' });
      try {
        const name = checkNewAccount(i);
        const { password, kek } = await derivePassword(name, i.passcode);
        await accounts('create', { name, password, role: i.role, wrap: await sealFor(kek, secrets) }, true);
        await refresh();
        set({ busy: false });
        return true;
      } catch (e) {
        return fail(e);
      }
    },
    async dropUser(id) {
      if (get().user?.role !== 'admin') return 'Only admins can remove accounts.';
      try {
        await accounts('remove', { id }, true);
        await refresh();
        return '';
      } catch (e) {
        return e instanceof Error ? e.message : 'Could not remove account.';
      }
    },
    async resetPasscode(id, pass) {
      if (get().user?.role !== 'admin' || !secrets?.priv) return 'Only admins can reset passcodes.';
      const u = get().db.users.find(u => u.id === id);
      if (!u) return 'No such account.';
      const bad = passcodeError(pass, u.name);
      if (bad) return bad;
      try {
        const { password, kek } = await derivePassword(u.name, pass);
        await accounts('reset', { id, password, wrap: await sealFor(kek, secrets) }, true);
        if (id === get().user?.id) get().logout('Passcode changed. Sign in again.');
        return '';
      } catch (e) {
        return e instanceof Error ? e.message : 'Could not reset passcode.';
      }
    },
  };
});
