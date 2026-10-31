// Idle huddles: when no task is running, Grok Bot (the team head) calls a short working huddle
// in the live chat. It opens with a real topic drawn from Brain's own records — a memory page,
// an open thread from the last task, or what deserves Owner's attention — two or three teammates
// answer it in their voices, and Grok Bot closes with a one-line collected summary.
// Real AI only, through the same provider plumbing as tasks, on its own small budget:
// never touching the task call count, never filing memory. Starting a task (busy), pressing
// Stop, locking the page or switching huddles off ends it at once.
import {
  AGENT,
  AGENTS,
  huddlePrompt,
  huddleSystem,
  type AgentId,
  type HuddleRole,
  type HuddleTopic,
} from '../data/team';
import type { State } from '../store';
import { TYPE_LABEL, weight, type Msg } from './memory';
import { PROV, PROVIDERS, ProviderError, callModel, isLimitError, type ProviderId } from './providers';
import { clip } from './text';

/** Lines in one idle huddle: Grok Bot opens, teammates answer, Grok Bot closes. */
export const BANTER_MAX_LINES = 6;
/** Idle huddles per page load. */
export const BANTER_MAX_SESSIONS = 6;
/** One huddle line never gets more output room than this, however the task setting is set. */
export const BANTER_MAX_TOKENS = 120;
/** Quiet time after the page settles before the first line. */
export const BANTER_FIRST_DELAY_MS = 5_000;
/** Pause between lines, so the chat reads like people talking, not a dump. */
export const BANTER_GAP_MS = 5_000;
/** Quiet time between two huddles. */
export const BANTER_SESSION_GAP_MS = 30_000;

type SetFn = (p: Partial<State> | ((s: State) => Partial<State>)) => void;
export interface BanterDeps {
  get: () => State;
  set: SetFn;
  say: (m: Msg & { cls?: 'warn' }) => void;
  clean: (t: string) => string;
  admin: () => boolean;
  ctls: Set<AbortController>;
}
export interface BanterOpts {
  firstDelayMs?: number;
  gapMs?: number;
  sessionGapMs?: number;
  rand?: () => number;
}

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>(done => {
    if (ms <= 0 || signal.aborted) return done();
    const t = setTimeout(done, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        done();
      },
      { once: true },
    );
  });

/**
 * The topic Grok Bot puts to the team, taken only from what Brain actually holds.
 * Rotates through the kinds that have real material: a memory page, the most recent
 * task's open thread, or what deserves Owner's attention (stale pages, a waiting inbox).
 * With nothing stored yet, the huddle is a plain team check-in.
 */
export function pickTopic(s: State, rand: () => number): HuddleTopic {
  const mem = s.mem;
  const fresh = mem.entries.filter(e => e.status === 'fresh');
  const stale = mem.entries.filter(e => e.status === 'stale');
  // Chat sessions are casual talk, not team tasks — only real tasks (or legacy sessions without kind) feed the "task" huddle topic.
  const lastTask = [...mem.sessions].reverse().find(x => x.kind !== 'chat');
  const kinds: HuddleTopic['kind'][] = [];
  if (fresh.length) kinds.push('memory');
  if (lastTask) kinds.push('task');
  if (stale.length || mem.inbox.length) kinds.push('attention');
  if (!kinds.length)
    return {
      kind: 'checkin',
      text: 'Brain holds no saved memory and no past tasks yet, so there is no record to work from. Run a general team check-in: how is the team set up, and what should Owner know about the room?',
    };
  const kind = kinds[(s.banterSessions + Math.floor(rand() * kinds.length)) % kinds.length];
  if (kind === 'memory') {
    const top = [...fresh].sort((a, b) => weight(b) - weight(a)).slice(0, 3);
    const e = top[Math.min(top.length - 1, Math.floor(rand() * top.length))];
    return {
      kind,
      text:
        `A page in Brain's memory — ${TYPE_LABEL[e.type]} · "${e.title}": ${clip(e.note.replace(/\s+/g, ' '), 280)} ` +
        'Ask the team: is this still true, what is missing from it, and what should be checked?',
    };
  }
  if (kind === 'task' && lastTask) {
    const sum = lastTask.sum ? ` One-line summary of that session: ${lastTask.sum}` : '';
    const open = lastTask.uncovered?.length
      ? ` Left uncovered last time: ${lastTask.uncovered.slice(0, 3).join('; ')}.`
      : '';
    return {
      kind,
      text: `The team's most recent task was: "${clip(lastTask.q, 200)}".${sum}${open} Revisit the open thread: what still needs an answer?`,
    };
  }
  if (stale.length)
    return {
      kind: 'attention',
      text:
        `Brain has ${stale.length} memory page(s) marked stale: ${stale
          .slice(0, 3)
          .map(e => `"${e.title}"`)
          .join(', ')}. ` + "Stale pages can mislead the next task. Ask the team what here deserves Owner's attention.",
    };
  return {
    kind: 'attention',
    text:
      `Brain's inbox holds ${mem.inbox.length} unprocessed item(s): sessions, files or corrections waiting to be learned from. ` +
      "Ask the team what here deserves Owner's attention.",
  };
}

/** Runs one Grok Bot-led idle huddle. Returns how many lines were actually said. */
export async function runBanter(d: BanterDeps, opts: BanterOpts = {}): Promise<number> {
  const { get, set, say, clean, admin, ctls } = d;
  const rand = opts.rand ?? Math.random;
  const halted = (): boolean => {
    const s = get();
    return !admin() || !s.live.banter || s.stopped || s.busy || s.dreaming || s.incognito || !!s.viewing;
  };
  const blocked = (): boolean => {
    const s = get();
    return (
      halted() ||
      s.banterSessions >= BANTER_MAX_SESSIONS ||
      (s.banterSessions > 0 && Date.now() - s.lastBanterAt < (opts.sessionGapMs ?? BANTER_SESSION_GAP_MS))
    );
  };
  if (blocked()) return 0;
  const s0 = get();
  // the main provider, picked the same way a task picks it; each bot still prefers its own company, then its free service
  const usable = (p?: string): p is ProviderId =>
    !!p && p in PROV && !!get().keys[p as ProviderId] && !get().dead[p as ProviderId];
  let pv: ProviderId | undefined =
    s0.keys[s0.live.provider] && !s0.dead[s0.live.provider]
      ? s0.live.provider
      : PROVIDERS.find(p => !!s0.keys[p] && !s0.dead[p]);
  if (!pv) pv = PROVIDERS.find(p => usable(p) && AGENTS.some(a => a.provider === p || a.free === p));
  if (!pv) return 0; // no key anywhere: the room stays quiet
  const ctl = new AbortController();
  ctls.add(ctl);
  const lines: { from: AgentId; text: string }[] = [];
  try {
    await wait(opts.firstDelayMs ?? BANTER_FIRST_DELAY_MS, ctl.signal);
    if (halted() || ctl.signal.aborted) return 0;
    // The huddle is Grok Bot's: no lead in the room, or nobody to answer, means no huddle.
    const eligible = () =>
      AGENTS.map(a => a.id).filter(id => !get().inactiveBots.includes(id) && !get().limited.includes(id));
    const room = eligible();
    if (!room.includes('grokbot')) return 0;
    const bag = room.filter(id => id !== 'grokbot');
    if (!bag.length) return 0;
    const responders: AgentId[] = [];
    while (responders.length < Math.min(BANTER_MAX_LINES - 2, bag.length))
      responders.push(bag.splice(Math.min(bag.length - 1, Math.floor(rand() * bag.length)), 1)[0]);
    const plan: { bot: AgentId; role: HuddleRole }[] = [
      { bot: 'grokbot', role: 'open' },
      ...responders.map(bot => ({ bot, role: 'respond' as const })),
      { bot: 'grokbot', role: 'close' },
    ];
    const topic = pickTopic(get(), rand);
    set(x => ({ banterSessions: x.banterSessions + 1, lastBanterAt: Date.now() }));
    for (let i = 0; i < plan.length; i++) {
      if (i > 0) await wait(opts.gapMs ?? BANTER_GAP_MS, ctl.signal);
      if (halted() || ctl.signal.aborted) break;
      const { bot, role } = plan[i];
      const st = get();
      const own = AGENT[bot].provider,
        free = AGENT[bot].free;
      const activeProv: ProviderId = usable(own) ? own : usable(free) ? free : pv;
      const key = st.keys[activeProv] || st.keys[pv] || '';
      if (!key) break;
      const model = st.live.models[activeProv] || PROV[activeProv].model,
        tag = `live · ${PROV[activeProv].label} · ${model} · unverified`;
      let shown = 0;
      const onDelta = (t: string) => {
        const n = performance.now();
        if (n - shown < 80) return;
        shown = n;
        if (!get().busy) set({ draft: { from: bot, text: clean(t) } });
      };
      try {
        const res = await callModel({
          provider: activeProv,
          key,
          model,
          system: huddleSystem(bot, role),
          user: huddlePrompt(bot, role, topic, lines),
          maxTokens: Math.min(st.live.maxTokens, BANTER_MAX_TOKENS),
          web: false,
          signal: ctl.signal,
          onDelta,
        });
        set(x => ({
          tin: x.tin + res.tin,
          tout: x.tout + res.tout,
          ...(x.limited.includes(bot) ? { limited: x.limited.filter(b => b !== bot) } : {}),
        }));
        const text = clean(res.text.replace(/\s+/g, ' ').trim());
        // a task may have started while this line was written; then the line is dropped, never mixed into the task
        if (!text || get().busy || get().stopped || ctl.signal.aborted) break;
        say({ from: bot, tag, text });
        lines.push({ from: bot, text });
      } catch (e) {
        if (e instanceof ProviderError && e.rejected) set(x => ({ dead: { ...x.dead, [activeProv]: true } }));
        if (isLimitError(e)) set(x => ({ limited: x.limited.includes(bot) ? x.limited : [...x.limited, bot] }));
        break; // a failed line ends the huddle quietly; nothing is filled in
      } finally {
        if (get().draft?.from === bot) set({ draft: null });
      }
    }
  } finally {
    ctls.delete(ctl);
  }
  return lines.length;
}
