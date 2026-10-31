import { describe, expect, it, vi } from 'vitest';
import { BANTER_MAX_LINES, BANTER_MAX_SESSIONS, pickTopic, runBanter, type BanterDeps } from '../src/lib/banter';

/** A fake Brain state with just what the huddle reads, plus a say() that collects the chat. */
const fakeWorld = (fetchImpl: (n: number, body: any) => Promise<Response>) => {
  const state: any = {
    live: { banter: true, provider: 'openai', models: { openai: 'gpt-4o-mini' }, maxTokens: 220 },
    keys: { openai: 'sk-test' },
    dead: {},
    stopped: false,
    busy: false,
    dreaming: false,
    incognito: false,
    viewing: null,
    bantering: false,
    banterSessions: 0,
    lastBanterAt: 0,
    inactiveBots: [],
    limited: [],
    task: '',
    tin: 0,
    tout: 0,
    draft: null,
    calls: 0,
    mem: { entries: [], sessions: [], inbox: [] },
  };
  const said: any[] = [];
  let calls = 0;
  (globalThis as any).fetch = vi.fn(async (_u: string, init: any) => {
    calls++;
    return fetchImpl(calls, JSON.parse(init.body));
  });
  const deps: BanterDeps = {
    get: () => state,
    set: p => Object.assign(state, typeof p === 'function' ? p(state) : p),
    say: m => said.push(m),
    clean: (t: string) => t,
    admin: () => true,
    ctls: new Set(),
  };
  return { state, said, deps, calls: () => calls };
};

const reply = (text: string) =>
  new Response(JSON.stringify({ output_text: text, usage: { input_tokens: 3, output_tokens: 2 } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
const fast = { firstDelayMs: 0, gapMs: 0, sessionGapMs: 0, rand: () => 0 };

const entry = (over: any = {}) => ({
  id: 'e1',
  key: 'concept:deploy-window',
  type: 'concept',
  title: 'Deploy window',
  note: 'Deploys only happen on Friday afternoons, after the backup check has passed.',
  sources: [{ kind: 'session', label: 's1' }],
  strength: 2,
  status: 'fresh',
  created: 0,
  seen: 1,
  links: [],
  corrected: false,
  skill: false,
  prog: null,
  corpusId: null,
  kws: null,
  manual: false,
  ...over,
});

describe('idle huddles', () => {
  it('Grok Bot opens and closes, teammates answer in between, honestly labelled', async () => {
    const w = fakeWorld(async n => reply('line ' + n));
    const n = await runBanter(w.deps, fast);
    expect(n).toBe(BANTER_MAX_LINES);
    expect(w.calls()).toBe(BANTER_MAX_LINES);
    expect(w.said.map(m => m.text)).toEqual(Array.from({ length: BANTER_MAX_LINES }, (_, i) => 'line ' + (i + 1)));
    expect(w.said.every(m => m.tag === 'live · OpenAI · gpt-4o-mini · unverified')).toBe(true);
    const speakers = w.said.map(m => m.from);
    expect(speakers[0]).toBe('grokbot'); // the team head opens the huddle
    expect(speakers.at(-1)).toBe('grokbot'); // and closes it with the collected summary
    const middle = speakers.slice(1, -1);
    expect(middle).toHaveLength(BANTER_MAX_LINES - 2); // the teammates answer the topic
    expect(new Set(middle).size).toBe(BANTER_MAX_LINES - 2); // each answers once, in turn
    expect(middle).not.toContain('grokbot');
    expect(w.state.tin).toBe(3 * BANTER_MAX_LINES);
    expect(w.state.tout).toBe(2 * BANTER_MAX_LINES);
    expect(w.state.calls).toBe(0); // the task call budget is never touched
    expect(w.state.mem.sessions).toEqual([]); // and nothing is filed as a task or a memory
    expect(w.state.mem.entries).toEqual([]);
  });

  it('the topic comes from Brain memory, and every line is prompted with the huddle so far', async () => {
    const bodies: any[] = [];
    const w = fakeWorld(async (n, body) => {
      bodies.push(body);
      return reply('line ' + n);
    });
    w.state.mem.entries = [entry()];
    await runBanter(w.deps, fast);
    // Grok Bot's opening is briefed with the actual memory page, not an invented subject
    expect(bodies[0].input[0].content).toMatch(/You called this team huddle/);
    expect(bodies[0].input[1].content).toContain('Deploy window');
    expect(bodies[0].input[1].content).toContain('Friday afternoons');
    expect(bodies[0].input[1].content).toMatch(/Open the huddle/);
    // a responder answers the topic, with the opening line in front of it
    expect(bodies[1].input[0].content).toMatch(/answering in a team huddle led by Grok Bot/);
    expect(bodies[1].input[1].content).toContain('Deploy window');
    expect(bodies[1].input[1].content).toContain('line 1');
    // Grok Bot's close collects the whole huddle
    expect(bodies.at(-1).input[0].content).toMatch(/collects what the team surfaced/);
    expect(bodies.at(-1).input[1].content).toContain('line 4');
    expect(bodies[0].max_output_tokens).toBeLessThanOrEqual(120); // huddle lines stay short
  });

  it('rotates to the most recent task and its open thread when memory was the last topic kind', async () => {
    const bodies: any[] = [];
    const w = fakeWorld(async (n, body) => {
      bodies.push(body);
      return reply('line ' + n);
    });
    w.state.mem.entries = [entry()];
    w.state.mem.sessions = [
      {
        id: 's1',
        ts: 1,
        q: 'Fix the deploy script',
        kws: [],
        accepted: [],
        uncovered: ['Windows path check'],
        msgs: [],
      },
    ];
    w.state.banterSessions = 1; // one huddle already ran: the rotation moves on to the task
    await runBanter(w.deps, fast);
    expect(bodies[0].input[1].content).toContain('Fix the deploy script');
    expect(bodies[0].input[1].content).toContain('Windows path check');
  });

  it('pickTopic falls back to attention for stale pages, and to a check-in when Brain holds nothing', () => {
    const stale = fakeWorld(async () => reply('x'));
    stale.state.mem.entries = [entry({ status: 'stale', title: 'Old pricing' })];
    const t1 = pickTopic(stale.state, () => 0);
    expect(t1.kind).toBe('attention');
    expect(t1.text).toContain('Old pricing');

    const empty = fakeWorld(async () => reply('x'));
    const t2 = pickTopic(empty.state, () => 0);
    expect(t2.kind).toBe('checkin');
  });

  it('stays quiet when the switch is off, when there is no key, and when the budget is used', async () => {
    const off = fakeWorld(async () => reply('x'));
    off.state.live.banter = false;
    expect(await runBanter(off.deps, fast)).toBe(0);
    expect(off.calls()).toBe(0);

    const nokey = fakeWorld(async () => reply('x'));
    nokey.state.keys = {};
    expect(await runBanter(nokey.deps, fast)).toBe(0);
    expect(nokey.calls()).toBe(0);

    const spent = fakeWorld(async () => reply('x'));
    spent.state.banterSessions = BANTER_MAX_SESSIONS;
    expect(await runBanter(spent.deps, fast)).toBe(0);
    expect(spent.calls()).toBe(0);

    const nolead = fakeWorld(async () => reply('x'));
    nolead.state.inactiveBots = ['grokbot']; // no team head in the room: no huddle
    expect(await runBanter(nolead.deps, fast)).toBe(0);
    expect(nolead.calls()).toBe(0);
  });

  it('waits out the gap between huddles', async () => {
    const w = fakeWorld(async n => reply('line ' + n));
    expect(await runBanter(w.deps, { ...fast, sessionGapMs: undefined })).toBe(BANTER_MAX_LINES);
    const before = w.calls();
    // a second huddle right away is refused by the default session gap
    expect(await runBanter(w.deps, { firstDelayMs: 0, gapMs: 0, rand: () => 0 })).toBe(0);
    expect(w.calls()).toBe(before);
  });

  it('stops between lines when a task starts, and drops a line still in flight', async () => {
    const w = fakeWorld(async n => reply('line ' + n));
    const say0 = w.deps.say;
    w.deps.say = m => {
      say0(m);
      w.state.busy = true; // the owner pressed Send right after the opening line landed
    };
    expect(await runBanter(w.deps, fast)).toBe(1);
    expect(w.calls()).toBe(1);
    expect(w.said.map(m => m.from)).toEqual(['grokbot']);

    const w2 = fakeWorld(async n => {
      w2.state.busy = true; // the owner pressed Send while the opening line was on its way
      return reply('line ' + n);
    });
    expect(await runBanter(w2.deps, fast)).toBe(0);
    expect(w2.calls()).toBe(1);
    expect(w2.said).toEqual([]);
  });

  it('a provider failure ends the huddle quietly and a rejected key marks the provider dead', async () => {
    const w = fakeWorld(
      async () =>
        new Response(JSON.stringify({ error: { message: 'bad key' } }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
    );
    expect(await runBanter(w.deps, fast)).toBe(0);
    expect(w.said).toEqual([]);
    expect(w.state.dead.openai).toBe(true);
  });
});

describe('idle huddles in the store', () => {
  it('runs through the store without touching the task budget or memory, and obeys the switch', async () => {
    const d = new Map<string, string>();
    (globalThis as any).localStorage = {
      getItem: (k: string) => d.get(k) ?? null,
      setItem: (k: string, v: string) => void d.set(k, v),
      removeItem: (k: string) => void d.delete(k),
    };
    let n = 0;
    const f = vi.fn(async () => reply('store line ' + ++n));
    (globalThis as any).fetch = f;
    vi.resetModules();
    const { useStore } = await import('../src/store');
    useStore.setState({ role: 'admin', keys: { openai: 'sk-test' } });
    useStore.getState().setLive({ provider: 'openai' });
    useStore.setState({ keys: { openai: 'sk-test' } });
    await useStore.getState().banter({ firstDelayMs: 0, gapMs: 0, rand: () => 0 });
    const s = useStore.getState();
    expect(s.log.length).toBe(BANTER_MAX_LINES);
    expect(s.log[0].from).toBe('grokbot');
    expect(s.log.at(-1)?.from).toBe('grokbot');
    expect(s.log.every(m => m.from !== 'brain' && m.from !== 'owner')).toBe(true);
    expect(s.calls).toBe(0);
    expect(s.tasks).toBe(0);
    expect(s.banterSessions).toBe(1);
    expect(s.bantering).toBe(false);
    expect(s.mem.sessions).toEqual([]);
    // the switch off silences the room even with budget left
    s.setLive({ banter: false });
    await useStore.getState().banter({ firstDelayMs: 0, gapMs: 0, sessionGapMs: 0, rand: () => 0 });
    expect(f).toHaveBeenCalledTimes(BANTER_MAX_LINES);
    delete (globalThis as any).localStorage;
  });
});
