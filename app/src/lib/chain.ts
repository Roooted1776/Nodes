import { AGENT, IOS_RE, LIVE_ORDER, stagePrompt, systemPrompt, type AgentId } from '../data/team';
import type { Msg } from './memory';

// The live handoff chain. Each agent reviews the incoming handoff, does its text task and hands on.
// A failed stage is marked as failed; nothing is ever filled in with made-up text.

export type StageCall = (system: string, user: string) => Promise<{ text: string; why: string }>;
export interface ChainHooks {
  say(m: Msg & { cls?: 'warn' }): void;
  active(id: AgentId | null): void;
  handoff(from: string, to: string, payload?: string): void;
  blocked(): string | null; // a reason to stop before the next call, or null
  onCreditFailure?(id: AgentId, reason: string): void;
}
export interface ChainResult {
  msgs: Msg[];
  completed: number;
  failed: AgentId[];
}

export const chainFor = (task: string, inactiveBots?: ReadonlySet<AgentId> | AgentId[]): AgentId[] => {
  const inactiveSet = Array.isArray(inactiveBots) ? new Set(inactiveBots) : inactiveBots;
  return LIVE_ORDER.filter(id => (id !== 'xcode' || IOS_RE.test(task)) && !inactiveSet?.has(id));
};

export async function runChain(
  task: string,
  tag: string,
  call: StageCall,
  hooks: ChainHooks,
  opts: {
    brainContext?: string;
    perTaskCap?: number;
    clean?: (t: string) => string;
    inactiveBots?: ReadonlySet<AgentId> | AgentId[];
    /** Bots may search the web. */
    web?: boolean;
  } = {},
): Promise<ChainResult> {
  const bots = chainFor(task, opts.inactiveBots),
    msgs: Msg[] = [],
    failed: AgentId[] = [];
  const clean = opts.clean || (t => t),
    cap = opts.perTaskCap ?? 9;
  const say = (m: Msg & { cls?: 'warn' }) => {
    msgs.push({ from: m.from, text: m.text, tag: m.tag });
    hooks.say(m);
  };
  say({ from: 'owner', text: task, tag: '' });
  const inactiveCount = opts.inactiveBots
    ? Array.isArray(opts.inactiveBots)
      ? opts.inactiveBots.length
      : opts.inactiveBots.size
    : 0;
  say({
    from: 'brain',
    tag: 'page',
    text:
      'Handoff chain: ' +
      bots.map(b => `${AGENT[b].name} (${AGENT[b].company})`).join(' → ') +
      '.' +
      (IOS_RE.test(task) ? '' : ' Xcode sits this one out because it is not an iOS task.') +
      (inactiveCount > 0 ? ` [${inactiveCount} inactive bot(s) filtered out]` : '') +
      ' One team of people and bots. Pipeline: Collect → Review → Edit → Review → Pass to next → Review. Text only; no files change.',
  });
  let previous = 'Owner task: ' + task,
    calls = 0,
    completed = 0;
  const handoffs: string[] = [];
  for (let i = 0; i < bots.length; i++) {
    const bot = bots[i],
      next = bots[i + 1] || null;
    const why = hooks.blocked() || (calls >= cap ? `The limit of ${cap} model calls for one task was reached.` : null);
    if (why) {
      say({ from: 'brain', tag: 'page', cls: 'warn', text: why + ' The rest of the team was not contacted.' });
      break;
    }
    if (i === 0) hooks.handoff('owner', bot, task);
    calls++;
    const incomingFrom = i === 0 ? 'Owner' : AGENT[bots[i - 1]].name;
    const incoming = bot === 'grokbot' ? handoffs.join('\n\n') || previous : previous;
    const ctx = bot === bots[0] || bot === 'grokbot' ? opts.brainContext || '' : '';
    hooks.active(bot);
    try {
      let r: { text: string; why: string };
      try {
        // the last few replies, so bots can talk to each other and not only to the one before them
        const chatter = msgs
          .filter(x => x.tag === tag && x.from !== bots[i - 1])
          .slice(-3)
          .map(x => `${AGENT[x.from as AgentId]?.name || x.from}: ${x.text.slice(0, 300)}`)
          .join('\n');
        r = await call(
          systemPrompt(bot, !!opts.web),
          stagePrompt(bot, task, incomingFrom, incoming, next, ctx, chatter),
        );
      } finally {
        hooks.active(null);
      }
      const text = clean(r.text.replace(/\s+/g, ' ').trim());
      if (!text)
        throw new Error(r.why ? `the provider returned no text (${r.why})` : 'the provider returned an empty reply');
      say({ from: bot, text, tag });
      completed++;
      previous = `HANDOFF FROM ${AGENT[bot].name}:\n${text}`;
      handoffs.push(previous);
    } catch (e: any) {
      const errStr = String(e?.message || e);
      const isCredits = e?.outOfCredits || /credit|quota|billing|payment|balance|402/i.test(errStr);
      const msg = isCredits
        ? `${AGENT[bot].name} (${AGENT[bot].company}) has no credits/inactive: ${clean(errStr)}. Dynamic brain filters it out.`
        : `${AGENT[bot].name} did not finish: ${clean(errStr)}. Nothing was made up in its place.`;
      say({ from: 'brain', tag: 'page', cls: 'warn', text: msg });
      failed.push(bot);
      if (isCredits) hooks.onCreditFailure?.(bot, errStr);
      previous = `HANDOFF STATUS FOR ${AGENT[bot].name}:\n${msg}\n(Next worker: review the last available handoff above and continue autonomously.)`;
      handoffs.push(previous);
    }
    if (next) hooks.handoff(bot, next, previous);
  }
  if (completed)
    say({
      from: 'brain',
      tag: 'page',
      text: `${completed} stage(s) done. Model text is unverified. Brain changed no files.${opts.web ? ' Bots could search the web; check their links.' : ''}`,
    });
  return { msgs, completed, failed };
}
