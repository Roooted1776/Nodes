import { create } from 'zustand';
import { AGENT, type AgentId } from './data/team';
import { addNote, correctEntry, deleteEntry } from './lib/learn';
import {
  blankMem,
  loadMem,
  sanitizeMem,
  saveMem,
  saveImportedListAsTask,
  type EntryType,
  type Flow,
  type Mem,
  type Msg,
  type Session,
  type TaskListMeta,
} from './lib/memory';
import { audit } from './lib/audit';
import { exportBackup, importBackup } from './lib/vault';
import type { Role } from './lib/auth';
import { MODEL_RE, PROV, PROVIDERS, ProviderError, callModel, type ProviderId, RETIRED } from './lib/providers';
import { redact } from './lib/redact';
import { transitMs } from './lib/geometry';
import { NOT_ADMIN, runTask } from './lib/run-task';
import { importMemoryItems, type RawMemoryItem } from './lib/file-import';
import {
  testGitHubConnection,
  fetchAndConvertGitHub,
  type GitHubTestResult,
  type GitHubImportOptions,
} from './lib/github';

const LKEY = 'brain.live.v1';
/** Saves memory and remembered keys into the encrypted vault. Set by the sign-in code while an admin is unlocked. */
export type VaultSave = (mem: Mem, keys: Partial<Record<ProviderId, string>>) => Promise<boolean>;
let vaultSave: VaultSave | null = null;
export const setVault = (fn: VaultSave | null) => {
  vaultSave = fn;
};
export type View = 'brain' | 'team';
export type Tab = 'chat' | 'memory' | 'admin';
export interface LogMsg extends Msg {
  id: number;
  cls?: 'warn';
}
/** One handoff light. `words` is the real size of what was passed; `from` may be `mem:<id>` when a saved memory is sent as context. */
export interface Pulse {
  id: number;
  from: string;
  to: string;
  t0: number;
  color: string;
  words?: number;
  dur?: number;
}
export const PULSE_AFTERGLOW = 1400;
export const pulseMs = (p: Pick<Pulse, 'from' | 'to' | 'dur'>) => p.dur ?? transitMs(p.from, p.to);
export interface LiveCfg {
  on: boolean;
  provider: ProviderId;
  models: Record<ProviderId, string>;
  maxTokens: number;
  callCap: number;
  remember: boolean;
}
export type StageState = 'waiting' | 'working' | 'done' | 'failed' | 'skipped';
export { NOT_ADMIN };

export interface State {
  mem: Mem;
  rev: number;
  storageOk: boolean;
  role: Role;
  who: string;
  notes: Partial<Record<AgentId, string>>;
  live: LiveCfg;
  keys: Partial<Record<ProviderId, string>>;
  dead: Partial<Record<ProviderId, boolean>>;
  calls: number;
  tasks: number;
  tin: number;
  tout: number;
  stopped: boolean;
  busy: boolean;
  incognito: boolean;
  log: LogMsg[];
  viewing: Session | null;
  active: AgentId | null;
  pulses: Pulse[];
  stages: Partial<Record<AgentId, StageState>>;
  used: string[];
  status: string;
  view: View;
  tab: Tab;
  selected: string | null;
  sceneFocus: { kind: 'memory' | 'agent'; id: string; sequence: number } | null;
  autoRotate: boolean;
  /** The current task: its text, the reply streaming in now, how long each bot took (ms) and what really passed between them. */
  task: string;
  draft: { from: AgentId; text: string } | null;
  timing: Partial<Record<AgentId, number>>;
  flow: Flow[];
  inactiveBots: AgentId[];
  /** Bots that hit a token, rate or credit limit. Their name shows red in the chat until they answer again. */
  limited: AgentId[];
  /** Which company actually answered for each bot in this task (a free stand-in shows as 'via …'). */
  ranOn: Partial<Record<AgentId, ProviderId>>;
  autoUpdateBots: boolean;
  inspectedBot: AgentId | null;
  promptDraft: string;
  // actions
  inspectBot(id: AgentId | null): void;
  setPromptDraft(q: string): void;
  commit(fn?: (m: Mem) => void): void;
  setLive(p: Partial<LiveCfg>): void;
  setKey(k: string, provider?: ProviderId): void;
  forgetKey(provider?: ProviderId): void;
  send(q: string): Promise<void>;
  stop(): void;
  testProvider(provider?: ProviderId): Promise<void>;
  note(o: { type: EntryType; title: string; note: string; links?: string[] }): string | null;
  importItems(
    items: RawMemoryItem[],
    defaultProject?: string,
    meta?: TaskListMeta,
  ): { added: number; updated: number; total: number };
  correct(id: string, fix: { title?: string; note: string; links?: string[]; status?: 'fresh' | 'stale' }): void;
  remove(id: string): void;
  setSetting(p: Partial<Mem['settings']>): void;
  restore(text: string, passphrase: string): Promise<string>;
  backup(passphrase: string): Promise<string>;
  erase(): void;
  select(id: string | null): void;
  setView(v: View): void;
  setTab(t: Tab): void;
  setBotActive(id: AgentId, active: boolean): void;
  toggleBotActive(id: AgentId): void;
  setAutoUpdateBots(auto: boolean): void;
  updateAllBots(): void;
  set(p: Partial<State>): void;
  viewSession(id: string | null): void;
  activeProject: string;
  setActiveProject(p: string): void;
  githubRepo: string;
  githubToken: string;
  githubStatus: string;
  setGithubConfig(cfg: { repo?: string; token?: string }): void;
  testGithub(repo?: string, token?: string): Promise<GitHubTestResult>;
  syncGithub(options?: GitHubImportOptions): Promise<{ added: number; updated: number; total: number }>;
}

let logN = 0,
  pulseN = 0;
const ctls = new Set<AbortController>();
const ls: Storage | null = typeof localStorage !== 'undefined' ? localStorage : null;

function loadLive(): { live: LiveCfg; keys: Partial<Record<ProviderId, string>> } {
  const live: LiveCfg = {
    on: true,
    provider: 'openai',
    models: Object.fromEntries(PROVIDERS.map(p => [p, PROV[p].model])) as Record<ProviderId, string>,
    maxTokens: 120,
    callCap: 9,
    remember: true,
  };
  const keys: Partial<Record<ProviderId, string>> = {};
  try {
    const d = JSON.parse(ls?.getItem(LKEY) || 'null');
    if (d && typeof d === 'object') {
      live.remember = !!d.remember;
      if (d.provider in PROV) live.provider = d.provider;
      if (Number.isFinite(d.maxTokens)) live.maxTokens = Math.max(20, Math.min(150, Math.round(d.maxTokens)));
      if (Number.isFinite(d.callCap)) live.callCap = Math.max(1, Math.min(9, Math.round(d.callCap)));
      for (const p of PROVIDERS)
        if (typeof d.models?.[p] === 'string' && MODEL_RE.test(d.models[p]) && !RETIRED.has(d.models[p]))
          live.models[p] = d.models[p];
    }
    // a remembered key is restored from the encrypted vault after sign-in, never from plain storage
  } catch {
    /* fresh start */
  }
  return { live: { ...live, on: true }, keys }; // always real AI (Owner, Oct 2026); a task is still sent only when an admin presses Send
}
function saveLive(live: LiveCfg, keys: Partial<Record<ProviderId, string>>) {
  try {
    ls?.setItem(
      LKEY,
      JSON.stringify({
        remember: live.remember,
        provider: live.provider,
        maxTokens: live.maxTokens,
        callCap: live.callCap,
        models: live.models,
      }),
    );
    void keys;
    ls?.removeItem('brain.livekeys.v1'); // remembered keys are saved in the encrypted vault
  } catch {
    /* storage blocked */
  }
}

const GH_KEY = 'brain.github.v1';
function loadGithub(): { repo: string; token: string } {
  try {
    const raw = ls?.getItem(GH_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (d && typeof d === 'object') {
        return {
          repo: typeof d.repo === 'string' && d.repo ? d.repo : 'Roooted1776/Brain',
          token: typeof d.token === 'string' ? d.token : '',
        };
      }
    }
  } catch {
    /* storage blocked */
  }
  return { repo: 'Roooted1776/Brain', token: '' };
}

const lv = loadLive();
const gh = loadGithub();

export const useStore = create<State>()((set, get) => {
  const keyList = () => Object.values(get().keys).filter(Boolean) as string[];
  const clean = (t: string) => {
    const r = redact(t, keyList()).text;
    return r.replace(/```(?:[a-zA-Z0-9_-]+)?\n?([\s\S]*?)```/g, (_m, code) => {
      const trimmed = code.trim().replace(/\s+/g, ' ');
      return trimmed ? `[${trimmed.length > 100 ? trimmed.slice(0, 97) + '…' : trimmed}]` : '';
    });
  };
  const say = (m: Msg & { cls?: 'warn' }) =>
    set(s => ({ log: [...s.log, { ...m, text: clean(m.text), id: ++logN }].slice(-200) }));
  const admin = () => get().role === 'admin';
  /** A handoff light from one agent to the next. It is removed when its travel animation ends. */
  const addPulse = (
    from: string,
    to: string,
    color: string,
    extra: { words?: number; dur?: number; delay?: number } = {},
  ) => {
    const id = ++pulseN,
      { delay = 0, ...rest } = extra,
      p: Pulse = { id, from, to, t0: performance.now() + delay, color, ...rest };
    set(x => ({ pulses: [...x.pulses, p] }));
    setTimeout(() => set(x => ({ pulses: x.pulses.filter(q => q.id !== id) })), delay + pulseMs(p) + PULSE_AFTERGLOW);
  };
  /** A handoff travels faster when the sender answered quickly, slower when it took long (its real reply time). */
  const speedFor = (a: string, b: string) => {
    const ms = get().timing[a as AgentId];
    if (!ms) return undefined;
    return Math.round(
      Math.max(900, Math.min(4200, transitMs(a, b) * Math.max(0.7, Math.min(1.5, Math.sqrt(ms / 3000))))),
    );
  };
  const words = (t?: string) => (t ? t.trim().split(/\s+/).filter(Boolean).length : undefined);
  const liveReady = () => {
    const s = get();
    return !s.stopped && !!s.keys[s.live.provider] && !s.dead[s.live.provider];
  };

  return {
    // persistent memory restored from storage, or blank if first run / locked
    mem: ls ? loadMem(ls).mem : blankMem(),
    rev: 0,
    storageOk: true,
    role: 'viewer',
    who: '',
    notes: {},
    live: lv.live,
    keys: lv.keys,
    dead: {},
    calls: 0,
    tasks: 0,
    tin: 0,
    tout: 0,
    stopped: false,
    busy: false,
    incognito: false,
    log: [],
    viewing: null,
    active: null,
    pulses: [],
    stages: {},
    used: [],
    status: 'Waiting for a prompt.',
    view: 'brain',
    tab: 'chat',
    selected: null,
    sceneFocus: null,
    autoRotate: true,
    task: '',
    draft: null,
    timing: {},
    flow: [],
    inactiveBots: [],
    limited: [],
    ranOn: {},
    autoUpdateBots: true,
    inspectedBot: null,
    inspectBot: (id: AgentId | null) => set({ inspectedBot: id }),
    promptDraft: '',
    setPromptDraft: (promptDraft: string) => set({ promptDraft }),
    activeProject: 'Brain',
    setActiveProject: p => set({ activeProject: p.trim() || 'Brain' }),
    githubRepo: gh.repo,
    githubToken: gh.token,
    githubStatus: '',

    set: p => set(p),
    /** Change memory, save it, and publish a fresh snapshot so every view (list, 3D brain) updates. */
    commit(fn) {
      const m = get().mem;
      fn?.(m);
      set(s => ({
        mem: {
          ...m,
          entries: [...m.entries],
          sessions: [...m.sessions],
          blocked: [...m.blocked],
          inbox: [...m.inbox],
          settings: { ...m.settings },
        },
        rev: s.rev + 1,
      }));
      const st = get();
      if (!vaultSave && ls) saveMem(ls, m);
      if (vaultSave)
        void vaultSave(m, st.live.remember !== false ? st.keys : {}).then(
          ok => set({ storageOk: ok }),
          () => set({ storageOk: false }),
        );
    },
    setLive(p) {
      if (!admin()) {
        set({ status: NOT_ADMIN });
        return;
      }
      const live = {
        ...get().live,
        ...p,
        on: true,
      }; /* Brain only uses real AI (Owner, Oct 2026): there is no off switch */
      if (p.provider && p.provider !== get().live.provider) {
        set({ dead: {} });
      }
      set({ live });
      saveLive(live, get().keys);
      if ('remember' in p || p.provider) get().commit();
    },
    setKey(k, prov) {
      if (!admin()) {
        set({ status: NOT_ADMIN });
        return;
      }
      const p = prov || get().live.provider;
      const val = k.trim().slice(0, 300);
      const keys = { ...get().keys };
      if (val) {
        keys[p] = val;
      } else {
        delete keys[p];
      }
      const dead = { ...get().dead };
      delete dead[p];
      set(s => ({
        keys,
        dead,
        ...(s.autoUpdateBots && val ? { inactiveBots: s.inactiveBots.filter(b => AGENT[b]?.provider !== p) } : {}),
      }));
      saveLive(get().live, keys);
      get().commit();
    },
    forgetKey(prov) {
      if (!admin()) {
        set({ status: NOT_ADMIN });
        return;
      }
      if (prov) {
        const keys = { ...get().keys };
        delete keys[prov];
        const dead = { ...get().dead };
        delete dead[prov];
        set({ keys, dead });
        saveLive(get().live, keys);
        get().commit();
      } else {
        set({ keys: {}, dead: {} });
        saveLive({ ...get().live, remember: false }, {});
        set(s => ({ live: { ...s.live, remember: false } }));
        get().commit();
      }
    },

    async send(raw) {
      return runTask(raw, { get, set, say, clean, addPulse, words, speedFor, liveReady, admin, ctls, ls });
    },
    stop() {
      if (!admin()) {
        set({ status: NOT_ADMIN });
        return;
      }
      set({ stopped: true, status: 'Stopped. No more calls will be made.' });
      ctls.forEach(c => c.abort());
      ctls.clear();
    },
    async testProvider(prov) {
      if (!admin()) {
        set({ status: NOT_ADMIN });
        return;
      }
      const s = get(),
        pv = prov || s.live.provider,
        key = s.keys[pv];
      if (!key) return set({ status: `Add a ${PROV[pv].label} key first.` });
      if (s.calls >= s.live.callCap) return set({ status: 'The call budget for this page load is used.' });
      set({ calls: s.calls + 1, status: `Testing ${PROV[pv].label}… (uses one call)` });
      try {
        const r = await callModel({
          provider: pv,
          key,
          model: s.live.models[pv] || PROV[pv].model,
          system: 'Reply with the single word OK.',
          user: 'Connection test.',
          maxTokens: 20,
        });
        set(x => ({
          tin: x.tin + r.tin,
          tout: x.tout + r.tout,
          status: `Connected to ${PROV[pv].label} · ${s.live.models[pv] || PROV[pv].model}. Reply: ${clean(r.text).slice(0, 40) || '(empty)'}`,
          ...(x.autoUpdateBots ? { inactiveBots: x.inactiveBots.filter(b => AGENT[b]?.provider !== pv) } : {}),
        }));
      } catch (e: unknown) {
        if (e instanceof ProviderError && e.rejected) set(x => ({ dead: { ...x.dead, [pv]: true } }));
        const msg = e instanceof Error ? e.message : String(e);
        set({ status: `Test failed for ${PROV[pv].label}: ` + clean(msg) });
      }
    },
    note(o) {
      if (!admin()) {
        set({ status: NOT_ADMIN });
        return null;
      }
      let id: string | null = null;
      get().commit(m => {
        id = addNote(m, o, Date.now())?.id ?? null;
      });
      return id;
    },
    importItems(items, defaultProject, meta) {
      if (!admin()) {
        set({ status: NOT_ADMIN });
        return { added: 0, updated: 0, total: 0 };
      }
      const proj = (defaultProject || get().activeProject || 'Brain').trim();
      let result = { added: 0, updated: 0, total: 0 };
      get().commit(m => {
        result = importMemoryItems(m, items, proj, Date.now());
        if (items.length > 0) {
          saveImportedListAsTask(m, items, proj, meta, Date.now());
        }
      });
      set({
        status: `Imported ${result.added} new and updated ${result.updated} memories into project "${proj}". Saved under tasks.`,
      });
      if (ls) audit(ls, get().who, `Imported ${result.total} memory items into project "${proj}"`);
      return result;
    },
    correct(id, fix) {
      if (!admin()) {
        set({ status: NOT_ADMIN });
        return;
      }
      get().commit(m => correctEntry(m, id, fix, Date.now()));
    },
    remove(id) {
      if (!admin()) {
        set({ status: NOT_ADMIN });
        return;
      }
      get().commit(m => deleteEntry(m, id));
      if (get().selected === id) set({ selected: null });
    },
    setSetting(p) {
      if (!admin()) {
        set({ status: NOT_ADMIN });
        return;
      }
      get().commit(m => {
        m.settings = {
          ...m.settings,
          ...p,
          instructions: clean((p.instructions ?? m.settings.instructions).slice(0, 400)),
        };
      });
    },
    async backup(passphrase) {
      if (!admin()) {
        set({ status: NOT_ADMIN });
        return '';
      }
      const t = await exportBackup(passphrase, get().mem);
      if (ls) audit(ls, get().who, 'Made an encrypted backup');
      return t;
    },
    async restore(text, passphrase) {
      if (!admin()) {
        set({ status: NOT_ADMIN });
        return NOT_ADMIN;
      }
      let d: unknown;
      try {
        d = await importBackup(passphrase, text);
      } catch (e: unknown) {
        return e instanceof Error ? e.message : 'That backup could not be opened.';
      }
      const m = sanitizeMem(d, true);
      if (!m) return 'That is not Brain memory.';
      set({ mem: m, selected: null });
      get().commit();
      if (ls) audit(ls, get().who, `Restored memory from a backup (${m.entries.length} entries)`);
      return `Restored ${m.entries.length} entries.`;
    },
    erase() {
      if (!admin()) {
        set({ status: NOT_ADMIN });
        return;
      }
      const keep = get().mem.settings;
      const m = blankMem();
      m.settings = keep;
      set({ mem: m, selected: null });
      get().commit();
      if (ls) audit(ls, get().who, 'Erased all memory');
    },
    select(id) {
      set({ selected: id, autoRotate: id ? false : get().autoRotate });
    },
    setView(v) {
      set({ view: v });
    },
    setTab(t) {
      set({ tab: t });
    },
    viewSession(id) {
      set({ viewing: id ? get().mem.sessions.find(x => x.id === id) || null : null, tab: 'chat' });
    },
    setBotActive(id, active) {
      set(s => ({
        inactiveBots: active
          ? s.inactiveBots.filter(b => b !== id)
          : s.inactiveBots.includes(id)
            ? s.inactiveBots
            : [...s.inactiveBots, id],
      }));
    },
    toggleBotActive(id) {
      set(s => ({
        inactiveBots: s.inactiveBots.includes(id) ? s.inactiveBots.filter(b => b !== id) : [...s.inactiveBots, id],
      }));
    },
    setAutoUpdateBots(auto) {
      set({
        autoUpdateBots: auto,
        ...(auto ? { inactiveBots: [] } : {}),
      });
    },
    updateAllBots() {
      const s = get();
      const updatedModels = { ...s.live.models };
      for (const p of PROVIDERS) {
        if (!updatedModels[p] || RETIRED.has(updatedModels[p])) {
          updatedModels[p] = PROV[p].model;
        }
      }
      set({
        inactiveBots: [],
        autoUpdateBots: true,
        live: { ...s.live, models: updatedModels },
        status: 'Auto update enabled: all bots refreshed and active.',
      });
    },
    setGithubConfig(cfg) {
      if (!admin()) {
        set({ status: NOT_ADMIN });
        return;
      }
      const nextRepo = cfg.repo !== undefined ? cfg.repo.trim() : get().githubRepo;
      const nextToken = cfg.token !== undefined ? cfg.token.trim() : get().githubToken;
      set({ githubRepo: nextRepo, githubToken: nextToken });
      try {
        ls?.setItem(GH_KEY, JSON.stringify({ repo: nextRepo, token: nextToken }));
      } catch {
        /* storage blocked */
      }
    },
    async testGithub(repoInput, tokenInput) {
      const repo = (repoInput ?? get().githubRepo).trim();
      const token = (tokenInput ?? get().githubToken).trim();
      const res = await testGitHubConnection(repo, token);
      set({ githubStatus: res.message, status: `GitHub: ${res.message}` });
      return res;
    },
    async syncGithub(options) {
      if (!admin()) {
        set({ status: NOT_ADMIN });
        return { added: 0, updated: 0, total: 0 };
      }
      const repo = get().githubRepo.trim();
      const token = get().githubToken.trim();
      const proj = get().activeProject || 'Brain';
      set({ status: `Fetching data from GitHub repository "${repo}"...` });
      try {
        const { items, summary } = await fetchAndConvertGitHub(repo, options, token, proj);
        const res = get().importItems(items, proj, { sourceKind: 'github', repo, summary });
        set({
          status: `GitHub sync complete: ${summary}. ${res.added} new, ${res.updated} updated in "${proj}". Saved under tasks.`,
        });
        return res;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        set({ status: `GitHub sync failed: ${msg}` });
        return { added: 0, updated: 0, total: 0 };
      }
    },
  };
});

/** Re-render when memory changes. */
export const useMem = () => {
  useStore(s => s.rev);
  return useStore.getState().mem;
};
