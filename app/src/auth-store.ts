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
  syncMemoryDatabase,
  writeAudit,
} from './lib/cloud';
import { blankMem, sanitizeMem } from './lib/memory';
import { mirror, openChannel, publish, type Hub } from './lib/share';
import { VaultError, decryptVault, encryptVault, newSecrets, openFor, sealFor, type Secrets } from './lib/vault';
import { openKeys, sealKeys } from './lib/keystore';
import type { ProviderId } from './lib/providers';
import { setVault, useStore } from './store';

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
async function unlock(u: User, kek: CryptoKey) {
  secrets = await openFor(kek, await accountWrap(u.id));
  const s = secrets,
    remote = await loadVault();
  const data = (await decryptVault(s, remote.envelope)) as {
    mem?: unknown;
    keys?: Partial<Record<ProviderId, string>>;
    deviceKeys?: string;
  };
  const mem = sanitizeMem(data.mem);
  if (!mem) throw new VaultError('The encrypted memory has an invalid format.', 'format');
  counter = remote.envelope.n;
  revision = remote.rev;
  chain = Promise.resolve();
  // Provider keys are encrypted inside the database vault (AES-256-GCM) for persistent cross-device restore.
  // Device keys from local cache are also merged as a local fallback:
  let deviceKeys = typeof data.deviceKeys === 'string' ? data.deviceKeys : '{}';
  try {
    const cached = JSON.parse(ls.getItem(VAULT_KEY) || 'null');
    if (cached) {
      const local = (await decryptVault(s, cached)) as {
        deviceKeys?: string;
        keys?: Partial<Record<ProviderId, string>>;
      };
      if (typeof local.deviceKeys === 'string') deviceKeys = local.deviceKeys;
    }
  } catch {
    /* an unusable cache never replaces the verified database copy */
  }
  const deviceStore = {
    getItem: () => deviceKeys,
    setItem: (_key: string, value: string) => {
      deviceKeys = value;
    },
    removeItem: () => {
      deviceKeys = '{}';
    },
  };
  const deviceSaved = s.priv ? await openKeys(deviceStore, kek, u.id) : {};
  const remoteKeys = data.keys && typeof data.keys === 'object' ? data.keys : {};
  const saved: Partial<Record<ProviderId, string>> = s.priv ? { ...deviceSaved, ...remoteKeys } : {};
  if (s.priv) ls.setItem(VAULT_KEY, JSON.stringify(await encryptVault(s, { mem, keys: saved, deviceKeys }, counter)));
  else if (!ls.getItem(VAULT_KEY)) ls.setItem(VAULT_KEY, JSON.stringify(remote.envelope));
  useStore.setState(st => ({
    role: u.role,
    who: u.name,
    mem,
    rev: st.rev + 1,
    keys: u.role === 'admin' ? saved : {},
    live: u.role === 'admin' && Object.keys(saved).length > 0 ? { ...st.live, remember: true } : st.live,
    storageOk: true,
  }));
  setAuditSink((who, what) => writeAudit(u.id, who, what));
  if (s.priv) {
    void syncMemoryDatabase(mem);
    const epoch = generation;
    setVault((m, keys) => {
      // Capture now: queued writes must never read a later mutable memory object.
      const snapshot = structuredClone(m),
        localKeys = { ...keys };
      const job = chain.then(async () => {
        if (epoch !== generation) return false;
        const envelope = await encryptVault(s, { mem: snapshot, keys: localKeys }, counter + 1);
        if (epoch !== generation) return false;
        revision = await saveVault(envelope, revision);
        void syncMemoryDatabase(snapshot);
        counter = envelope.n;
        if (epoch !== generation) return false;
        await sealKeys(deviceStore, kek, u.id, localKeys);
        const local = await encryptVault(s, { mem: snapshot, keys: localKeys, deviceKeys }, envelope.n);
        if (epoch !== generation) return false;
        ls.setItem(VAULT_KEY, JSON.stringify(local));
        return true;
      });
      // A failed chain stays failed: later edits must not overwrite a conflicting remote save.
      chain = job;
      return job;
    });
  } else setVault(null);
  enter(u);
}
// ---------- while signed in: live sharing, idle lock, panic lock, privacy blur ----------
let stop: (() => void)[] = [];
function enter(u: User) {
  leave(true);
  const ch = openChannel();
  if (ch) stop.push(u.role === 'admin' ? publish(hub, ch) : mirror(hub, ch), () => ch.close());
  if (u.role === 'viewer') {
    const onStorage = (e: StorageEvent) => {
      const key = secrets;
      if (e.key === VAULT_KEY && e.newValue && key)
        void decryptVault(key, JSON.parse(e.newValue)).then(
          d => {
            const mem = sanitizeMem((d as { mem?: unknown }).mem);
            if (mem) useStore.setState(st => ({ mem, rev: st.rev + 1 }));
          },
          () => useStore.setState({ status: 'Memory failed its signature check.' }),
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
  setAuditSink(null);
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
          wrap: await sealFor(kek, sec, true),
          envelope: await encryptVault(sec, { mem: blankMem(), keys: {} }, 1),
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
        await accounts(
          'create',
          { name, password, role: i.role, wrap: await sealFor(kek, secrets, i.role === 'admin') },
          true,
        );
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
        await accounts('reset', { id, password, wrap: await sealFor(kek, secrets, u.role === 'admin') }, true);
        if (id === get().user?.id) get().logout('Passcode changed. Sign in again.');
        return '';
      } catch (e) {
        return e instanceof Error ? e.message : 'Could not reset passcode.';
      }
    },
  };
});
