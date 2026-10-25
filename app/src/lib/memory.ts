import { isAgent } from '../data/team';
import { redact } from './redact';
import { clip } from './text';

// Same storage format as the earlier single-file page (brain.mem.v2), so saved memory carries over.
export const KEY = 'brain.mem.v2';
export const STALE_DAYS = 30,
  MAX_ENTRIES = 10000,
  MAX_SESSIONS = 25;
export type EntryType = 'concept' | 'entity' | 'workstream';
export const TYPES: EntryType[] = ['concept', 'entity', 'workstream'];
export const TYPE_LABEL: Record<EntryType, string> = { concept: 'Concept', entity: 'Entity', workstream: 'Workstream' };

export interface Source {
  kind: 'session' | 'file' | 'correction' | 'tool';
  label: string;
  ref: string | null;
}
export interface Entry {
  id: string;
  key: string;
  type: EntryType;
  title: string;
  note: string;
  sources: Source[];
  strength: number;
  status: 'fresh' | 'stale';
  created: number;
  seen: number;
  links: string[];
  corrected: boolean;
  skill: boolean;
  prog: string | null;
  corpusId: number | null;
  kws: string[] | null;
  manual: boolean;
}
export interface Msg {
  from: string;
  text: string;
  tag: string;
}
export type Cover = 'done' | 'failed' | 'skipped';
/** What really passed in one handoff: sender, receiver and the number of words. 'memory' and 'brain' are Brain's own ends. */
export type Flow = [string, string, number];
export interface Session {
  id: string;
  ts: number;
  q: string;
  kws: string[];
  accepted: unknown[];
  uncovered: string[];
  msgs: Msg[];
  used?: string[];
  learned?: boolean;
  cover?: Record<string, { s: Cover; why?: string }>;
  flow?: Flow[];
  ms?: Record<string, number>;
  project?: string;
  projectId?: string;
}
export interface Settings {
  brain: boolean;
  sources: boolean;
  docs: boolean;
  msgs: boolean;
  tracker: boolean;
  instructions: string;
  useMemory?: boolean;
}
export interface Inbox {
  kind: 'session' | 'file' | 'correction';
  ref: string;
}
export interface Mem {
  version: 2;
  entries: Entry[];
  sessions: Session[];
  blocked: string[];
  inbox: Inbox[];
  runs: number;
  dayShift: 0;
  nextId: number;
  nextSession: number;
  filtered: number;
  settings: Settings;
  lastRun?: number;
  /** Memories made before Brain went AI-only (local text analysis). Kept so nothing is lost, but never shown or sent. */
  archived: Entry[];
}

export const blankMem = (): Mem => ({
  version: 2,
  entries: [],
  archived: [],
  sessions: [],
  blocked: [],
  inbox: [],
  runs: 0,
  dayShift: 0,
  nextId: 1,
  nextSession: 1,
  filtered: 0,
  settings: { brain: true, sources: true, docs: true, msgs: false, tracker: true, instructions: '', useMemory: true },
});

export const LIVE_TAG = /^live · (Anthropic|OpenAI|Google|xAI) · /;
const TAG_RE = /^(live · (Anthropic|OpenAI|Google|xAI) · [A-Za-z0-9._:-]{1,80}(?: · unverified)?|page|page checks)$/;
const SPEAKER_RE = /^(owner|brain|queue|grok|grokbot|claude|cursor|gemini|chatgpt|perplexity|xcode|muse)$/;
const DEMO_LABEL = /Owner's team chart|Starter skills list|Docs connector \(sample\)|Issue tracker \(sample\)/i;
const okTs = (v: unknown) => {
  const n = +(v as number);
  return Number.isFinite(n) ? Math.max(0, Math.min(8.64e15, n)) : 0;
};
const scrub = (t: unknown) => redact(String(t)).text;

export const isLiveSession = (s: unknown): s is Session =>
  !!s &&
  Array.isArray((s as Session).msgs) &&
  (s as Session).msgs.some(x => x && typeof x.tag === 'string' && LIVE_TAG.test(x.tag));

function validEntry(e: Entry): boolean {
  return (
    !!e &&
    typeof e.id === 'string' &&
    /^e\d{1,9}$/.test(e.id) &&
    typeof e.key === 'string' &&
    TYPES.includes(e.type) &&
    typeof e.title === 'string' &&
    !!e.title.trim() &&
    e.title.length <= 80 &&
    typeof e.note === 'string' &&
    e.note.length <= 600 &&
    Array.isArray(e.sources) &&
    Array.isArray(e.links) &&
    Number.isFinite(e.strength) &&
    Number.isFinite(e.seen) &&
    Number.isFinite(e.created) &&
    (e.status === 'fresh' || e.status === 'stale') &&
    (!e.prog || isAgent(e.prog))
  );
}
/** Entries from the old demo (sample sources, program nodes, or sessions that were not real live sessions) are dropped. */
function isDemoEntry(e: Entry, real: Set<string>): boolean {
  if (
    e.corpusId ||
    /^prog:/.test(e.key) ||
    e.sources.some(s => s && typeof s.label === 'string' && DEMO_LABEL.test(s.label))
  )
    return true;
  return (
    e.sources.some(s => s.kind === 'session') &&
    !e.sources.some(s => s.kind === 'correction' || (s.kind === 'session' && !!s.ref && real.has(s.ref)))
  );
}

/** Clean any stored or pasted memory. Returns null when it is not Brain memory. */
export function sanitizeMem(d: any, fromBackup = false): Mem | null {
  if (!d || typeof d !== 'object' || !Array.isArray(d.entries)) return null;
  const m = blankMem();
  const ids = new Set<string>();
  const sessions: any[] = Array.isArray(d.sessions) ? d.sessions : [];
  const real = new Set<string>(sessions.filter(isLiveSession).map(s => s.id));
  for (const e of (d.entries as Entry[]).filter(validEntry)) {
    if ((isDemoEntry(e, real) && !e.corrected) || ids.has(e.id) || m.entries.length >= MAX_ENTRIES) continue;
    ids.add(e.id);
    m.entries.push({
      id: e.id,
      key: String(e.key).slice(0, 120),
      type: e.type,
      title: scrub(e.title.trim()),
      note: scrub(e.note),
      status: e.status,
      strength: Math.max(1, Math.min(9, Math.round(e.strength))),
      created: okTs(e.created),
      seen: okTs(e.seen),
      corrected: !!e.corrected,
      skill: !!e.skill,
      prog: e.prog || null,
      corpusId: null,
      manual: !!e.manual,
      kws: Array.isArray(e.kws)
        ? e.kws
            .filter(k => typeof k === 'string')
            .slice(0, 12)
            .map(k => scrub(k.slice(0, 30)))
        : null,
      sources: e.sources
        .filter(
          s =>
            s &&
            typeof s.label === 'string' &&
            ['session', 'tool', 'file', 'correction'].includes(s.kind) &&
            !(e.corrected && DEMO_LABEL.test(s.label)),
        )
        .slice(0, 6)
        .map(s => ({
          kind: s.kind,
          label: scrub(s.label.slice(0, 120)),
          ref: typeof s.ref === 'string' && /^[se]\d{1,9}$/.test(s.ref) ? s.ref : null,
        })),
      links: [],
    });
  }
  for (const e of d.entries as Entry[]) {
    const t = e && m.entries.find(x => x.id === e.id);
    if (t && Array.isArray(e.links))
      t.links = e.links.slice(0, 60).filter(l => typeof l === 'string' && ids.has(l) && l !== e.id);
  }
  // only AI-written memories and the Owner's own notes are live; anything else is archived (Owner, Oct 2026: "no results unless AI")
  const isAiOrOwner = (e: Entry) => e.key.startsWith('ai:') || e.manual || e.key.startsWith('note:');
  const arch = m.entries.filter(e => !isAiOrOwner(e));
  m.entries = m.entries.filter(isAiOrOwner);
  const live = new Set(m.entries.map(e => e.id));
  for (const e of m.entries) e.links = e.links.filter(id => live.has(id));
  const prev = Array.isArray(d.archived) ? (d.archived as Entry[]).filter(validEntry) : [];
  m.archived = [...prev, ...arch]
    .filter((e, i, a) => a.findIndex(x => x.id === e.id) === i)
    .slice(-MAX_ENTRIES)
    .map(e => ({ ...e, title: scrub(String(e.title).slice(0, 80)), note: scrub(String(e.note).slice(0, 600)) }));
  m.sessions = sessions
    .filter(
      s => s && typeof s.id === 'string' && /^s\d{1,9}$/.test(s.id) && typeof s.q === 'string' && isLiveSession(s),
    )
    .slice(-MAX_SESSIONS)
    .map(s => ({
      id: s.id,
      ts: okTs(s.ts),
      q: scrub(s.q.slice(0, 300)),
      kws: Array.isArray(s.kws)
        ? s.kws
            .filter((k: unknown) => typeof k === 'string')
            .slice(0, 12)
            .map((k: string) => scrub(k.slice(0, 30)))
        : [],
      accepted: [],
      uncovered: [],
      learned: s.learned !== false,
      cover: cleanCover(s.cover),
      flow: cleanFlow(s.flow),
      ms: cleanMs(s.ms),
      project: typeof s.project === 'string' ? scrub(s.project.slice(0, 80)) : undefined,
      projectId: typeof s.projectId === 'string' ? scrub(s.projectId.slice(0, 40)) : undefined,
      used: Array.isArray(s.used)
        ? s.used.filter((u: unknown) => typeof u === 'string' && ids.has(u as string)).slice(0, 12)
        : [],
      msgs: (s.msgs as Msg[])
        .filter(x => x && SPEAKER_RE.test(x.from) && typeof x.text === 'string')
        .slice(0, 40)
        .map(x => ({
          from: x.from,
          text: scrub(x.text.slice(0, 4000)),
          tag: typeof x.tag === 'string' && TAG_RE.test(x.tag) && (!fromBackup || !LIVE_TAG.test(x.tag)) ? x.tag : '',
        })),
    }));
  if (fromBackup) m.sessions = m.sessions.filter(isLiveSession); // a pasted backup cannot claim live replies
  m.blocked = (Array.isArray(d.blocked) ? d.blocked : [])
    .filter((b: unknown) => typeof b === 'string')
    .slice(0, 2000)
    .map((b: string) => b.slice(0, 120));
  m.runs = Math.max(0, +d.runs || 0);
  m.filtered = Math.max(0, +d.filtered || 0);
  m.lastRun = okTs(d.lastRun) || undefined;
  m.nextId = Math.max(1 + Math.max(0, ...m.entries.map(e => parseInt(e.id.slice(1), 10))), +d.nextId || 1);
  m.nextSession = Math.max(1 + Math.max(0, ...m.sessions.map(s => parseInt(s.id.slice(1), 10))), +d.nextSession || 1);
  const st = d.settings || {};
  m.settings = {
    brain: st.brain !== false,
    sources: st.sources !== false,
    docs: st.docs !== false,
    msgs: !!st.msgs,
    tracker: st.tracker !== false,
    instructions: typeof st.instructions === 'string' ? scrub(st.instructions.slice(0, 400)) : '',
    useMemory: st.useMemory !== false,
  };
  return m;
}

const END = (x: unknown) => typeof x === 'string' && (isAgent(x) || x === 'owner' || x === 'memory' || x === 'brain');
function cleanFlow(f: unknown): Flow[] | undefined {
  if (!Array.isArray(f)) return undefined;
  return f
    .filter(x => Array.isArray(x) && x.length === 3 && END(x[0]) && END(x[1]) && Number.isFinite(x[2]) && x[2] >= 0)
    .slice(0, 40)
    .map(x => [x[0], x[1], Math.min(100000, Math.round(x[2]))] as Flow);
}
function cleanMs(m: unknown): Record<string, number> | undefined {
  if (!m || typeof m !== 'object') return undefined;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(m as Record<string, unknown>))
    if (isAgent(k) && Number.isFinite(v) && (v as number) >= 0) out[k] = Math.min(600000, Math.round(v as number));
  return out;
}
function cleanCover(c: unknown): Session['cover'] {
  if (!c || typeof c !== 'object') return undefined;
  const out: NonNullable<Session['cover']> = {};
  for (const [k, v] of Object.entries(c as Record<string, any>))
    if (isAgent(k) && v && ['done', 'failed', 'skipped'].includes(v.s))
      out[k] = { s: v.s, ...(typeof v.why === 'string' ? { why: scrub(v.why.slice(0, 120)) } : {}) };
  return out;
}
export function loadMem(storage: Pick<Storage, 'getItem'>): { mem: Mem; ok: boolean } {
  try {
    const raw = storage.getItem(KEY);
    const m = raw ? sanitizeMem(JSON.parse(raw)) : null;
    return { mem: m || blankMem(), ok: true };
  } catch {
    return { mem: blankMem(), ok: false };
  }
}
export function saveMem(storage: Pick<Storage, 'setItem'>, mem: Mem): boolean {
  try {
    storage.setItem(KEY, JSON.stringify(mem));
    return true;
  } catch {
    return false;
  }
}

export const byKey = (m: Mem, k: string) => m.entries.find(e => e.key === k);
export const byId = (m: Mem, id: string) => m.entries.find(e => e.id === id);
export function link(a?: Entry, b?: Entry) {
  if (!a || !b || a === b) return;
  if (!a.links.includes(b.id)) a.links.push(b.id);
  if (!b.links.includes(a.id)) b.links.push(a.id);
}
export function mkEntry(
  m: Mem,
  o: Partial<Entry> & Pick<Entry, 'key' | 'type' | 'title' | 'note'>,
  now: number,
): Entry {
  return {
    id: 'e' + m.nextId++,
    key: o.key,
    type: o.type,
    title: o.title,
    note: o.note,
    sources: o.sources || [],
    strength: 1,
    status: 'fresh',
    created: now,
    seen: now,
    links: [],
    corrected: false,
    skill: false,
    prog: null,
    corpusId: null,
    kws: o.kws || null,
    manual: !!o.manual,
  };
}

/** Ensures a project exists as a workstream node in the Brain graph, and links any session to it. */
export function ensureProjectNode(m: Mem, projectName: string, s?: Session, now = Date.now()): Entry {
  const name = projectName.trim() || 'Brain';
  const key = `project:${name.toLowerCase()}`;
  let node = m.entries.find(
    e => (e.type === 'workstream' && e.title.toLowerCase() === name.toLowerCase()) || e.key === key,
  );
  if (!node) {
    node = mkEntry(
      m,
      {
        key,
        type: 'workstream',
        title: name,
        note: `Project ${name}. Tasks and workstreams in Brain.`,
        sources: s ? [{ kind: 'session', label: `Task: ${clip(s.q, 40)}`, ref: s.id }] : [],
        kws: [name.toLowerCase(), 'project', 'workstream'],
      },
      now,
    );
    m.entries.push(node);
  } else {
    node.seen = now;
    node.strength = Math.min(9, node.strength + 1);
    if (s && !node.sources.some(src => src.ref === s.id)) {
      node.sources.push({ kind: 'session', label: `Task: ${clip(s.q, 40)}`, ref: s.id });
      if (node.sources.length > 8) node.sources.shift();
    }
  }
  if (s) {
    s.project = node.title;
    s.projectId = node.id;
  }
  return node;
}
