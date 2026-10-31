// Runs one live task: checks, memory context, the bot chain with streaming replies, then saving and learning.
// Moved out of store.ts so the store holds state and this file holds the task steps.
import { AGENT, IOS_RE, LIVE_ORDER, type AgentId } from '../data/team';
import { TYPE_COLOR } from '../data/colors';
import type { State } from '../store';
import { finalReviewFor } from './approval';
import { audit } from './audit';
import { chainFor, runChain } from './chain';
import { tally } from './learn';
import { AI_KEY, MEMORY_SYSTEM, fileMemories, memoryPrompt, parseMemories } from './ai-memory';
import { ensureProjectNode, findMostWorkedNode, type Cover, type Flow, type Msg, type Session } from './memory';
import { PROV, PROVIDERS, ProviderError, callModel, isLimitError, type ProviderId } from './providers';
import { redact } from './redact';
import { contextBlock, indexTitles, relevant } from './retrieve';
import { clip } from './text';

export const NOT_ADMIN = 'Only admins can change Brain. You can watch the live chat and read the memory.';

type SetFn = (p: Partial<State> | ((s: State) => Partial<State>)) => void;
export interface TaskDeps {
  get: () => State;
  set: SetFn;
  say: (m: Msg & { cls?: 'warn' }) => void;
  clean: (t: string) => string;
  addPulse: (from: string, to: string, color: string, extra?: { words?: number; dur?: number; delay?: number }) => void;
  words: (t?: string) => number | undefined;
  speedFor: (a: string, b: string) => number | undefined;
  liveReady: () => boolean;
  admin: () => boolean;
  ctls: Set<AbortController>;
  ls: Storage | null;
}

export async function runTask(raw: string, d: TaskDeps): Promise<void> {
  const { get, set, say, clean, addPulse, words, speedFor, liveReady, admin, ctls, ls } = d;
  if (!admin()) {
    set({ status: NOT_ADMIN });
    return;
  }
  const s = get(),
    r = redact(raw.trim(), Object.values(get().keys).filter(Boolean) as string[]),
    q = r.text;
  if (!q) return set({ status: 'Write a prompt first.' });
  if (r.n) {
    s.commit(m => {
      m.filtered += r.n;
    });
  }
  const pv: ProviderId =
    s.keys[s.live.provider] && !s.dead[s.live.provider]
      ? s.live.provider
      : PROVIDERS.find(p => !!s.keys[p] && !s.dead[p]) || s.live.provider;
  if (!s.keys[pv]) return set({ status: `Add your ${PROV[s.live.provider].label} key in Settings. Nothing was sent.` });
  if (s.dead[pv]) return set({ status: `${PROV[pv].label} rejected the key. Reload to try again.` });
  if (s.tasks >= 1) return set({ status: 'One live task per page load. Reload to start another.' });
  if (s.calls >= s.live.callCap)
    return set({ status: 'The call budget for this page load is used. Reload to reset it.' });
  if (s.busy) return;
  if (ls) audit(ls, s.who, 'Sent a task to the team');
  // End any idle huddle in flight so its draft and tokens never mix into this task.
  ctls.forEach(c => c.abort());
  ctls.clear();
  const model = s.live.models[pv] || PROV[pv].model,
    tag = `live · ${PROV[pv].label} · ${model} · unverified`,
    color = PROV[pv].color;
  let inactive = s.inactiveBots;
  if (s.autoUpdateBots && s.keys[pv] && !s.dead[pv] && inactive.length > 0) {
    inactive = [];
    set({ inactiveBots: [] });
  }
  const bots = chainFor(q, inactive);
  set({
    busy: true,
    stopped: false,
    tasks: s.tasks + 1,
    log: [],
    viewing: null,
    tab: 'chat',
    used: [],
    task: clip(q, 300),
    draft: null,
    timing: {},
    flow: [],
    ranOn: {},
    stages: Object.fromEntries(LIVE_ORDER.map(b => [b, bots.includes(b) ? 'waiting' : 'skipped'])),
    notes: Object.fromEntries(
      LIVE_ORDER.filter(b => !bots.includes(b)).map(b => [
        b,
        s.inactiveBots.includes(b) ? 'Inactive / no credits' : IOS_RE.test(q) ? 'Not used' : 'Not an iOS task',
      ]),
    ),
    status: `Live: ${PROV[pv].label} · ${model}`,
    autoRotate: false,
  });
  const notes: string[] = []; // Brain's own notes go to the status line; the chat holds only AI replies
  const matchProj = q.match(/^\[([^\]]+)\]/);
  const assignedProj = matchProj ? matchProj[1].trim() : s.activeProject || 'Brain';
  let ctxBlock = '';
  if (s.mem.settings.brain && s.mem.settings.useMemory) {
    const hits = relevant(s.mem, q, 6, assignedProj);
    set({ used: hits.map(h => h.e.id) });
    hits.slice(0, 6).forEach((h, i) =>
      addPulse('mem:' + h.e.id, bots[0], TYPE_COLOR[h.e.type], {
        dur: 1300,
        delay: 90 * i,
        words: words(h.e.title + ' ' + h.e.note),
      }),
    );
    if (hits.length)
      set(x => ({
        flow: [
          ...x.flow,
          ['memory', bots[0], hits.reduce((n, h) => n + (words(h.e.title + ' ' + h.e.note) || 0), 0)] as Flow,
        ],
      }));
    ctxBlock = contextBlock(
      hits.map(h => h.e),
      indexTitles(s.mem),
    );
    notes.push(hits.length ? `${hits.length} memories sent as context` : 'no memory matched');
  }
  const callAs = async (system: string, user: string, isStage = true) => {
    const st = get();
    // Filing memory gets one call of its own on top of the cap, so a full nine-bot task can still be remembered
    const cap = st.live.callCap + (isStage ? 0 : 1);
    if (st.calls >= cap) throw new Error(`the page call budget (${st.live.callCap}) is used`);
    set({ calls: st.calls + 1 });
    const ctl = new AbortController();
    ctls.add(ctl);
    const bot = st.active,
      t0 = performance.now();
    let shown = 0;
    // the reply streams in: the chat shows it growing, at most about 12 updates a second
    const onDelta = bot
      ? (t: string) => {
          const n = performance.now();
          if (n - shown < 80) return;
          shown = n;
          set({ draft: { from: bot, text: clean(t) } });
        }
      : undefined;
    // the bot's own company if there is a key for it, else its free service, else the main provider
    const usable = (p?: string): p is ProviderId =>
      !!p && p in PROV && !!st.keys[p as ProviderId] && !st.dead[p as ProviderId];
    const own = bot ? AGENT[bot]?.provider : undefined,
      free = bot ? AGENT[bot]?.free : undefined;
    const activeProv: ProviderId = usable(own) ? own : usable(free) ? free : pv;
    if (bot) set(x => ({ ranOn: { ...x.ranOn, [bot]: activeProv } }));
    const activeKey = st.keys[activeProv] || st.keys[pv] || '';
    const activeModel = st.live.models[activeProv] || PROV[activeProv].model;
    try {
      const res = await callModel({
        provider: activeProv,
        key: activeKey,
        model: activeModel,
        system,
        user,
        maxTokens: st.live.maxTokens,
        web: isStage && st.live.web,
        signal: ctl.signal,
        onDelta,
      });
      set(x => ({
        tin: x.tin + res.tin,
        tout: x.tout + res.tout,
        ...(bot && x.limited.includes(bot) ? { limited: x.limited.filter(b => b !== bot) } : {}),
      }));
      return res;
    } catch (e) {
      if (e instanceof ProviderError && e.rejected) set(x => ({ dead: { ...x.dead, [activeProv]: true } }));
      if (bot && isLimitError(e)) set(x => ({ limited: x.limited.includes(bot) ? x.limited : [...x.limited, bot] }));
      throw e;
    } finally {
      ctls.delete(ctl);
      if (bot && isStage)
        set(x => ({ timing: { ...x.timing, [bot]: Math.round(performance.now() - t0) }, draft: null }));
      else if (bot) set({ draft: null });
    }
  };
  if (notes.length) set({ status: `Live: ${PROV[pv].label} · ${model} · ${notes.join(' · ')}` });
  /** One more real AI call: Grok Bot files what the team should remember. Counted in the call limit. */
  const fileByAi = async (sess: Session, msgs: Msg[]) => {
    const st = get();
    if (!liveReady() || st.calls >= st.live.callCap + 1) {
      set({ status: 'Grok Bot: no AI call left for memory this page load, so nothing new was remembered.' });
      return;
    }
    set(x => ({ active: 'grokbot', stages: { ...x.stages, grokbot: 'working' } }));
    addPulse('grokbot', 'brain', color, { words: words(msgs.filter(x => x.from === 'grokbot').at(-1)?.text) });
    try {
      const known = st.mem.entries.filter(e => e.key.startsWith(AI_KEY)).map(e => e.title);
      const res = await callAs(
        MEMORY_SYSTEM,
        memoryPrompt(sess.q, sess.msgs, known, st.mem.settings.instructions),
        false,
      );
      const items = parseMemories(res.text),
        t = tally();
      let made = 0;
      get().commit(mm => {
        const ss = mm.sessions.find(x => x.id === sess.id) || sess;
        made = fileMemories(mm, items, ss, t, Date.now()).length;
      });
      say({
        from: 'grokbot',
        tag,
        text: items.length
          ? 'Filed to memory:\n' + items.map(i => `${i.title}: ${i.note}`).join('\n')
          : 'Nothing from this task is worth remembering.',
      });
      set({
        status: `Grok Bot filed ${made} memor${made === 1 ? 'y' : 'ies'} (${t.fresh} new, ${t.reinforced + t.updated} strengthened${t.blocked ? `, ${t.blocked} you deleted before` : ''}).`,
      });
    } catch (e: any) {
      set({ status: `Grok Bot could not file memory: ${clip(String(e?.message || e), 120)}. Nothing was made up.` });
    } finally {
      set(x => ({
        active: null,
        stages: { ...x.stages, grokbot: x.stages.grokbot === 'working' ? 'done' : x.stages.grokbot },
      }));
    }
  };
  const result = await runChain(
    q,
    tag,
    callAs,
    {
      say: m => {
        if (m.from === 'brain') {
          // a stage that did not finish: its reason goes on its coverage chip and the Tasks list, not in the chat
          const f = /^(.+?) did not finish: (.*?)\.? Nothing was made up/.exec(m.text);
          const id = f && Object.values(AGENT).find(a => a.name === f[1])?.id;
          if (id)
            set(x => ({ stages: { ...x.stages, [id]: 'failed' }, notes: { ...x.notes, [id]: clip(f![2], 110) } }));
          else set({ status: clip(m.text, 160) });
          return;
        }
        say(m);
        if (m.from in AGENT && m.tag.startsWith('live')) set(x => ({ stages: { ...x.stages, [m.from]: 'done' } }));
      },
      active: id => set(x => ({ active: id, stages: id ? { ...x.stages, [id]: 'working' } : x.stages })),
      handoff: (a, b, payload) => {
        if (!liveReady()) return;
        const w = words(payload) || 0;
        set(x => ({ flow: [...x.flow, [a, b, w] as Flow].slice(-40) }));
        addPulse(a, b, color, { words: w || undefined, dur: speedFor(a, b) });
        // Grok Bot reads every earlier handoff, so each finished bot sends its part in as well
        if (b === 'grokbot')
          Object.entries(get().stages)
            .filter(([k, v]) => k !== a && k !== 'grokbot' && (v === 'done' || v === 'failed'))
            .forEach(([k], i) => {
              const w =
                words(
                  get()
                    .log.filter(m => m.from === k)
                    .at(-1)?.text,
                ) || 0;
              set(x => ({ flow: [...x.flow, [k, b, w] as Flow].slice(-40) }));
              addPulse(k, b, color, { delay: 120 * (i + 1), words: w || undefined });
            });
      },
      blocked: () => {
        const x = get();
        return x.stopped
          ? 'Stopped by you.'
          : x.dead[pv]
            ? `${PROV[pv].label} rejected the key.`
            : x.calls >= x.live.callCap
              ? 'The page call budget is used.'
              : null;
      },
      onCreditFailure: (id: AgentId) => {
        set(x => ({
          inactiveBots: Array.from(new Set([...(x.inactiveBots || []), id])),
        }));
      },
    },
    { brainContext: ctxBlock, clean, inactiveBots: get().inactiveBots, web: get().live.web },
  );
  set(x => ({
    stages: Object.fromEntries(Object.entries(x.stages).map(([k, v]) => [k, v === 'waiting' ? 'skipped' : v])),
    notes: {
      ...x.notes,
      ...Object.fromEntries(
        Object.entries(x.stages)
          .filter(([, v]) => v === 'waiting')
          .map(([k]) => [k, 'Not reached: stopped, limit or key']),
      ),
    },
  }));
  const m = get().mem;
  if (result.completed && !get().incognito && m.settings.brain) {
    const fin = words(result.msgs.filter(x => x.from === 'grokbot').at(-1)?.text) || 0;
    if (fin) set(x => ({ flow: [...x.flow, ['grokbot', 'brain', fin] as Flow] }));
    const matchProj = q.match(/^\[([^\]]+)\]/);
    const assignedProj = matchProj ? matchProj[1].trim() : get().activeProject || 'Brain';
    const lastGrokBotMsg = result.msgs.filter(x => x.from === 'grokbot').at(-1)?.text || '';
    const hasFailures =
      result.failed.length > 0 ||
      Object.values(get().stages).some(s => s === 'failed') ||
      /\b(fail|failed|decline|declined|declines|reject|rejected|rejects|block|blocked|abort|aborted)\b/i.test(
        lastGrokBotMsg,
      );
    // Approval only records state for Director's review; it never runs git or deploy.
    const grokFinalReview = finalReviewFor(hasFailures);
    const sess: Session = {
      id: 's' + m.nextSession++,
      ts: Date.now(),
      q: clip(q, 300),
      kind: 'task',
      project: assignedProj,
      kws: [],
      accepted: [],
      uncovered: [],
      used: get().used,
      learned: false,
      flow: get().flow,
      ms: get().timing,
      grokFinalReview,
      msgs: result.msgs.map(x => ({
        from: x.from,
        text: clean(x.text).slice(0, 4000),
        tag: x.tag.startsWith('live') ? x.tag : x.tag === 'page' ? 'page' : '',
      })),
      cover: Object.fromEntries(
        Object.entries(get().stages)
          .filter(([, v]) => v === 'done' || v === 'failed' || v === 'skipped')
          .map(([k, v]) => [
            k,
            { s: v as Cover, ...(get().notes[k as AgentId] ? { why: get().notes[k as AgentId] } : {}) },
          ]),
      ),
    };
    get().commit(mm => {
      ensureProjectNode(mm, assignedProj, sess, sess.ts);
      const targetNode = findMostWorkedNode(mm, assignedProj);
      sess.projectId = targetNode.id;
      mm.sessions.push(sess);
      if (mm.sessions.length > 25) mm.sessions.shift();
      mm.inbox.push({ kind: 'session', ref: sess.id }); // Dream reads it later
    });
    await fileByAi(sess, result.msgs);
  } else if (result.completed)
    set({
      status: get().incognito ? 'Incognito: nothing from this task was saved.' : 'Memory is off: nothing was saved.',
    });
  else set({ status: 'No model replied. Check the messages above and your settings.' });
  set({
    busy: false,
    active: null,
    status: result.completed
      ? `Done: ${result.completed} stage(s) replied.${get().status.startsWith('Grok Bot') ? ' ' + get().status : ''}`
      : get().status,
  });
}
