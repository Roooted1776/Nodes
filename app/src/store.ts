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
import { GITHUB_ENTRY, type Keys } from './lib/keystore';
import type { Role } from './lib/auth';
import { DREAM_SYSTEM, applyDream, dreamPrompt, gatherInbox, parseDream } from './lib/dream';
import { tally } from './lib/learn';
import { SEARCH_NO_WEB, SEARCH_SYSTEM, searchMemory, searchPrompt } from './lib/search';
import { CAN_SEARCH } from './lib/providers';
import { MODEL_RE, PROV, PROVIDERS, ProviderError, callModel, type ProviderId, RETIRED } from './lib/providers';
import { redact } from './lib/redact';
import { transitMs } from './lib/geometry';
import { runChat } from './lib/run-chat';
import { NOT_ADMIN, runTask } from './lib/run-task';
import { runBanter, type BanterOpts } from './lib/banter';
import { importMemoryItems, type RawMemoryItem } from './lib/file-import';
import {
  testGitHubConnection,
  fetchAndConvertGitHub,
  type GitHubTestResult,
  type GitHubImportOptions,
} from './lib/github';

const LKEY = 'brain.live.v1';
/** Saves memory into the encrypted vault. Set by the sign-in code while an admin is unlocked. */
export type VaultSave = (mem: Mem) => Promise<boolean>;
let vaultSave: VaultSave | null = null;
export const setVault = (fn: VaultSave | null) => {
  vaultSave = fn;
};
/**
 * Seals remembered keys and the GitHub token on this device only (keystore.ts), never in the shared vault.
 * Set by the sign-in code while an admin is unlocked.
 */
export type KeySave = (keys: Keys) => Promise<void>;
let keySave: KeySave | null = null;
export const setKeySave = (fn: KeySave | null) => {
  keySave = fn;
};
/** What is kept on this device: the remembered provider keys plus the GitHub token. */
const deviceKeys = (st: Pick<State, 'live' | 'keys' | 'githubToken'>): Keys => ({
  ...(st.live.remember !== false ? st.keys : {}),
  ...(st.githubToken ? { [GITHUB_ENTRY]: st.githubToken } : {}),
});
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
  /** Bots may search the web with their company's own search tool. */
  web: boolean;
  /** Idle huddles: Grok Bot leads short working talks on its own small budget when no task runs (Owner, Oct 2026). */
  banter: boolean;
  callCap: number;
  remember: boolean;
}
export type StageState = 'waiting' | 'working' | 'done' | 'failed' | 'skipped';
export { NOT_ADMIN };

export interface State {
  mem: Mem;
  rev: number;
  storageOk: boolean;
  role: Role | null; // null while locked: only a signed-in admin has a role
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
  /** Idle free chat: a stretch is running, how many ran this page load, and when the last one started. */
  bantering: boolean;
  banterSessions: number;
  lastBanterAt: number;
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
  memoryOpen: boolean;
  setMemoryOpen(v: boolean): void;
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
  /** Composer mode: team task (multi-bot) or single-model chat. */
  composerMode: 'task' | 'chat';
  /** Active chat thread session id (kind chat); null starts a new thread. */
  chatThreadId: string | null;
  // actions
  inspectBot(id: AgentId | null): void;
  setPromptDraft(q: string): void;
  setComposerMode(mode: 'task' | 'chat'): void;
  newChatThread(): void;
  commit(fn?: (m: Mem) => void): void;
  setLive(p: Partial<LiveCfg>): void;
  setKey(k: string, provider?: ProviderId): void;
  forgetKey(provider?: ProviderId): void;
  send(q: string): Promise<void>;
  /** One stretch of idle free chat, if the room is idle and the budget allows. Driven by a timer in Home. */
  banter(opts?: BanterOpts): Promise<void>;
  stop(): void;
  testProvider(provider?: ProviderId): Promise<void>;
  /** Run Dream: one real AI call turns the inbox into cited, linked wiki pages. */
  dream(auto?: boolean): Promise<void>;
  /** One AI call that answers like Perplexity, with web search and matching memory. */
  search(q: string): Promise<void>;
  dreaming: boolean;
  dreams: number;
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
  githubRecentRepos: string[];
  githubLastSync: Record<string, GitHubSyncRecord>;
  setGithubConfig(cfg: { repo?: string; token?: string }): void;
  addRecentGithubRepo(repo: string): void;
  testGithub(repo?: string, token?: string): Promise<GitHubTestResult>;
  syncGithub(options?: GitHubImportOptions): Promise<{ added: number; updated: number; total: number }>;
}

let logN = 0,
  pulseN = 0;
const ctls = new Set<AbortController>();
const DREAM_RUNS = 3;
const ls: Storage | null = typeof localStorage !== 'undefined' ? localStorage : null;

function loadLive(): { live: LiveCfg; keys: Partial<Record<ProviderId, string>> } {
  const live: LiveCfg = {
    on: true,
    provider: 'openai',
    models: Object.fromEntries(PROVIDERS.map(p => [p, PROV[p].model])) as Record<ProviderId, string>,
    maxTokens: 220,
    web: true,
    banter: true,
    callCap: 9,
    remember: true,
  };
  const keys: Partial<Record<ProviderId, string>> = {};
  try {
    const d = JSON.parse(ls?.getItem(LKEY) || 'null');
    if (d && typeof d === 'object') {
      live.remember = !!d.remember;
      if (d.provider in PROV) live.provider = d.provider;
      // 120 was the old default; replies now get room to talk
      if (Number.isFinite(d.maxTokens) && d.maxTokens !== 120)
        live.maxTokens = Math.max(20, Math.min(400, Math.round(d.maxTokens)));
      if (typeof d.web === 'boolean') live.web = d.web;
      if (typeof d.banter === 'boolean') live.banter = d.banter;
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
        web: live.web,
        banter: live.banter,
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
export interface GitHubSyncRecord {
  date: string;
  count: number;
}

function loadGithub(): {
  repo: string;
  token: string;
  recentRepos: string[];
  lastSync: Record<string, GitHubSyncRecord>;
} {
  try {
    const raw = ls?.getItem(GH_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (d && typeof d === 'object') {
        const repo = typeof d.repo === 'string' && d.repo ? d.repo : 'Roooted1776/Brain';
        const recent = Array.isArray(d.recentRepos)
          ? d.recentRepos.filter((r: unknown): r is string => typeof r === 'string' && !!r.trim())
          : [repo];
        const out = {
          repo,
          token: typeof d.token === 'string' ? d.token : '',
          recentRepos: Array.from(new Set([repo, ...recent])).slice(0, 10),
          lastSync: d.lastSync && typeof d.lastSync === 'object' ? d.lastSync : {},
        };
        // An older Brain kept the token here in plain text. Delete that copy now; the token stays in memory
        // only until an admin unlocks, which seals it on this device (keystore.ts).
        if ('token' in d) saveGithub(out);
        return out;
      }
    }
  } catch {
    /* storage blocked */
  }
  return { repo: 'Roooted1776/Brain', token: '', recentRepos: ['Roooted1776/Brain'], lastSync: {} };
}

/** Saves the repo list and sync times. The token is never written here: it is sealed by keystore.ts. */
function saveGithub(data: {
  repo: string;
  token?: string;
  recentRepos: string[];
  lastSync: Record<string, GitHubSyncRecord>;
}) {
  const { repo, recentRepos, lastSync } = data;
  try {
    ls?.setItem(GH_KEY, JSON.stringify({ repo, recentRepos, lastSync }));
  } catch {
    /* storage blocked */
  }
}

const lv = loadLive();
const gh = loadGithub();
let plainGithubToken = gh.token;
/** Hands over (once) a GitHub token found in plain text on load, so the admin's unlock can seal it on this device. */
export const takePlainGithubToken = () => {
  const t = plainGithubToken;
  plainGithubToken = '';
  return t;
};

export const useStore = create<State>()((set, get) => {
  const keyList = () => Object.values(get().keys).filter(Boolean) as string[];
  const clean = (t: string) => {
    const r = redact(t, keyList()).text;
    const closed = r.replace(/```(?:[a-zA-Z0-9_-]+)?\n?([\s\S]*?)```/g, (_m, code) => {
      const trimmed = code.trim().replace(/\s+/g, ' ');
      return trimmed ? `[${trimmed.length > 100 ? trimmed.slice(0, 97) + '…' : trimmed}]` : '';
    });
    return closed.replace(/```(?:[a-zA-Z0-9_-]+)?\n?([\s\S]*)$/g, (_m, code) => {
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
    dreaming: false,
    dreams: 0,
    role: null,
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
    bantering: false,
    banterSessions: 0,
    lastBanterAt: 0,
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
    memoryOpen: false,
    setMemoryOpen(v) {
      set({ memoryOpen: v });
    },
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
    composerMode: 'task',
    chatThreadId: null,
    setComposerMode: mode => set({ composerMode: mode }),
    newChatThread: () =>
      set({ chatThreadId: null, log: [], viewing: null, status: 'New chat. Messages stay out of wiki memory.' }),
    activeProject: 'Brain',
    setActiveProject: p => set({ activeProject: p.trim() || 'Brain' }),
    githubRepo: gh.repo,
    githubToken: '', // filled from this device's sealed keys when an admin unlocks
    githubStatus: '',
    githubRecentRepos: gh.recentRepos,
    githubLastSync: gh.lastSync,

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
        void vaultSave(m).then(
          ok => set({ storageOk: ok }),
          () => set({ storageOk: false }),
        );
      if (keySave) void keySave(deviceKeys(st)).catch(() => set({ storageOk: false }));
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
      // Switching huddles off ends an in-flight huddle at once (same as Stop for that stream).
      if (p.banter === false && get().bantering) {
        ctls.forEach(c => c.abort());
        ctls.clear();
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
      const deps = { get, set, say, clean, addPulse, words, speedFor, liveReady, admin, ctls, ls };
      if (get().composerMode === 'chat') return runChat(raw, deps);
      return runTask(raw, deps);
    },
    async banter(opts) {
      if (get().bantering) return;
      set({ bantering: true });
      try {
        await runBanter({ get, set, say, clean, admin, ctls }, opts);
      } finally {
        set({ bantering: false });
      }
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
    async search(raw) {
      if (!admin()) return set({ status: NOT_ADMIN });
      const s = get();
      const q = redact(raw.trim(), Object.values(s.keys).filter(Boolean) as string[]).text.slice(0, 500);
      if (!q || s.busy || s.dreaming) return;
      const pv =
        s.keys[s.live.provider] && !s.dead[s.live.provider]
          ? s.live.provider
          : PROVIDERS.find(p => !!s.keys[p] && !s.dead[p]);
      if (!pv) return set({ status: 'Search needs a working API key. Add one under API keys.' });
      if (s.calls >= s.live.callCap + 3)
        return set({ status: 'The call budget for this page load is used. Reload to reset it.' });
      // End any idle huddle in flight so search owns the draft stream.
      ctls.forEach(c => c.abort());
      ctls.clear();
      const web = s.live.web && CAN_SEARCH.has(pv),
        model = s.live.models[pv] || PROV[pv].model,
        tag = `live · ${PROV[pv].label} · ${model} · unverified`;
      const hits = s.mem.settings.useMemory === false ? [] : searchMemory(s.mem, q);
      set({
        busy: true,
        stopped: false,
        calls: s.calls + 1,
        active: 'perplexity',
        status: `Searching with ${PROV[pv].label}${web ? ' and the web' : ''}…`,
      });
      say({ from: 'owner', tag: '', text: '🔎 ' + q });
      if (hits.length) say({ from: 'brain', tag: 'page', text: 'From memory: ' + hits.map(e => e.title).join(' · ') });
      const ctl = new AbortController();
      ctls.add(ctl);
      try {
        const r = await callModel({
          provider: pv,
          key: s.keys[pv]!,
          model,
          system: SEARCH_SYSTEM + (web ? '' : SEARCH_NO_WEB),
          user: searchPrompt(s.mem, q),
          maxTokens: 700,
          web,
          signal: ctl.signal,
          onDelta: t => set({ draft: { from: 'perplexity', text: clean(t) } }),
        });
        const text = clean(r.text.trim());
        if (!text) throw new Error(r.why ? `no text (${r.why})` : 'an empty reply');
        say({ from: 'perplexity', tag, text });
        set(x => ({
          tin: x.tin + r.tin,
          tout: x.tout + r.tout,
          status:
            `Search answered by ${PROV[pv].label}.` +
            (hits.length ? ` Memory used: ${hits.map(e => e.title).join(' · ')}.` : ' No memory matched.'),
        }));
        if (!get().incognito && get().mem.settings.brain)
          get().commit(m => {
            const sess = {
              id: 's' + m.nextSession++,
              ts: Date.now(),
              q: 'Search: ' + q.slice(0, 290),
              kws: [],
              accepted: [],
              uncovered: [],
              used: hits.map(e => e.id),
              learned: false,
              msgs: [
                { from: 'owner', tag: '', text: q },
                { from: 'perplexity', tag, text: text.slice(0, 4000) },
              ],
            };
            m.sessions.push(sess);
            if (m.sessions.length > 25) m.sessions.shift();
            m.inbox.push({ kind: 'session', ref: sess.id });
          });
      } catch (e: unknown) {
        if (e instanceof ProviderError && e.rejected) set(x => ({ dead: { ...x.dead, [pv]: true } }));
        say({
          from: 'brain',
          tag: 'page',
          cls: 'warn',
          text: 'Search failed: ' + clean(e instanceof Error ? e.message : String(e)),
        });
        set({ status: 'Search failed. Nothing was made up.' });
      } finally {
        ctls.delete(ctl);
        set({ busy: false, active: null, draft: null });
      }
    },
    async dream(auto = false) {
      if (!admin()) {
        if (!auto) set({ status: NOT_ADMIN });
        return;
      }
      const s = get();
      if (s.dreaming || s.busy || s.incognito) return;
      if (!s.mem.inbox.length) {
        if (!auto) set({ status: 'Dream: the inbox is empty, so there is nothing new to file.' });
        return;
      }
      // Dream has its own small budget, apart from the task calls
      if (s.dreams >= DREAM_RUNS) {
        if (!auto) set({ status: 'Dream already ran three times this page load. Reload to run it again.' });
        return;
      }
      const pv =
        s.keys[s.live.provider] && !s.dead[s.live.provider]
          ? s.live.provider
          : PROVIDERS.find(p => !!s.keys[p] && !s.dead[p]);
      if (!pv) {
        if (!auto) set({ status: 'Dream needs a working API key. Add one under API keys.' });
        return;
      }
      const cites = gatherInbox(s.mem);
      if (!cites.length) return;
      set({
        dreaming: true,
        dreams: s.dreams + 1,
        status: `Dream: reading ${cites.length} inbox item(s) with ${PROV[pv].label}…`,
      });
      try {
        const r = await callModel({
          provider: pv,
          key: s.keys[pv]!,
          model: s.live.models[pv] || PROV[pv].model,
          system: DREAM_SYSTEM,
          user: dreamPrompt(s.mem, cites, s.mem.settings.instructions),
          maxTokens: 900,
          timeoutMs: 60000,
        });
        const plan = parseDream(
          r.text,
          cites.length,
          s.mem.blocked.map(k => k.split(':').slice(2).join(':')),
        );
        let made = 0,
          t = tally();
        get().commit(m => {
          const out = applyDream(m, plan, gatherInbox(m), Date.now());
          made = out.pages.length;
          t = out.t;
        });
        set(x => ({
          tin: x.tin + r.tin,
          tout: x.tout + r.tout,
          status: `Dream filed ${made} page(s): ${t.fresh} new, ${t.updated + t.reinforced} updated, ${t.stale} marked stale, from ${cites.length} inbox item(s).`,
        }));
      } catch (e: unknown) {
        if (e instanceof ProviderError && e.rejected) set(x => ({ dead: { ...x.dead, [pv]: true } }));
        set({
          status: 'Dream could not run: ' + clean(e instanceof Error ? e.message : String(e)) + '. The inbox was kept.',
        });
      } finally {
        set({ dreaming: false });
      }
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
      saveGithub({
        repo: nextRepo,
        recentRepos: get().githubRecentRepos,
        lastSync: get().githubLastSync,
      });
      if (cfg.token !== undefined && keySave) void keySave(deviceKeys(get())).catch(() => set({ storageOk: false }));
    },
    addRecentGithubRepo(repoInput) {
      const repo = repoInput.trim();
      if (!repo) return;
      const current = get().githubRecentRepos;
      const updated = Array.from(new Set([repo, ...current])).slice(0, 10);
      set({ githubRecentRepos: updated });
      saveGithub({
        repo: get().githubRepo,
        recentRepos: updated,
        lastSync: get().githubLastSync,
      });
    },
    async testGithub(repoInput, tokenInput) {
      if (!admin()) {
        set({ status: NOT_ADMIN });
        return { ok: false, status: 'error', message: NOT_ADMIN };
      }
      const repo = (repoInput ?? get().githubRepo).trim();
      const token = (tokenInput ?? get().githubToken).trim();
      const res = await testGitHubConnection(repo, token);
      if (res.ok) {
        get().addRecentGithubRepo(repo);
      }
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
        const lastSyncRecord = get().githubLastSync[repo];
        const effectiveOptions: GitHubImportOptions = {
          ...options,
          since: options?.differential && lastSyncRecord?.date ? lastSyncRecord.date : undefined,
        };
        const { items, summary } = await fetchAndConvertGitHub(repo, effectiveOptions, token, proj);
        const res = get().importItems(items, proj, { sourceKind: 'github', repo, summary });

        const updatedSync = {
          ...get().githubLastSync,
          [repo]: { date: new Date().toISOString(), count: res.total },
        };
        set({ githubLastSync: updatedSync });
        get().addRecentGithubRepo(repo);
        saveGithub({
          repo,
          recentRepos: get().githubRecentRepos,
          lastSync: updatedSync,
        });

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
