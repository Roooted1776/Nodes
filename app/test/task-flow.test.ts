import { describe, expect, it, vi } from 'vitest';

const sseFetch = () =>
  vi.fn(async (_u: string, init: any) => {
    const filing = /File what the team should remember/.test(init.body);
    const enc = new TextEncoder(),
      body = [
        'data: ' +
          JSON.stringify({
            type: 'response.output_text.delta',
            delta: filing ? '{"memories":[{"type":"concept","title":"Plan first",' : 'one two ',
          }) +
          '\n\n',
        'data: ' +
          JSON.stringify({
            type: 'response.output_text.delta',
            delta: filing ? '"note":"The team plans before building."}]}' : 'three',
          }) +
          '\n\n',
        'data: ' +
          JSON.stringify({ type: 'response.completed', response: { usage: { input_tokens: 5, output_tokens: 3 } } }) +
          '\n\n',
      ];
    return new Response(
      new ReadableStream({
        start(c) {
          body.forEach(b => c.enqueue(enc.encode(b)));
          c.close();
        },
      }),
      { status: 200, headers: { 'content-type': 'text/event-stream' } },
    );
  });

describe('a real task, streamed', () => {
  it('records what passed between bots, each reply time, and saves both with the session', async () => {
    const d = new Map<string, string>();
    (globalThis as any).localStorage = {
      getItem: (k: string) => d.get(k) ?? null,
      setItem: (k: string, v: string) => void d.set(k, v),
      removeItem: (k: string) => void d.delete(k),
    };
    const f = sseFetch();
    (globalThis as any).fetch = f;
    vi.resetModules();
    const { useStore } = await import('../src/store');
    useStore.setState({ role: 'admin', keys: { openai: 'sk-test' } });
    useStore.getState().setLive({ provider: 'openai' });
    useStore.setState({ keys: { openai: 'sk-test' } });
    await useStore.getState().send('write a plan');
    const s = useStore.getState();
    expect(f).toHaveBeenCalledTimes(9); // 8 bots, then Grok Bot files memory
    expect(JSON.parse((f.mock.calls[0] as any)[1].body).stream).toBe(true);
    expect(s.draft).toBeNull();
    expect(s.busy).toBe(false);
    expect(s.flow[0]).toEqual(['owner', 'gemini', 3]); // the owner's task, three words
    expect(s.flow).toContainEqual(['gemini', 'muse', 6]); // "HANDOFF FROM Gemini:" + the three streamed words
    expect(s.flow).toContainEqual(['grokbot', 'brain', 3]);
    expect(Object.keys(s.timing).length).toBe(8);
    const sess = s.mem.sessions.at(-1)!;
    expect(sess.flow).toEqual(s.flow);
    expect(sess.ms).toEqual(s.timing);
    expect(sess.project).toBe('Brain');
    expect(s.log.filter(m => m.from === 'gemini')[0].text).toBe('one two three');
    expect(s.mem.entries.map(e => e.key)).toContain('project:brain');
    expect(s.mem.entries.map(e => e.key)).toContain('ai:concept:plan first');
    expect(s.log.at(-1)).toMatchObject({
      from: 'grokbot',
      text: 'Filed to memory:\nPlan first: The team plans before building.',
    });
    expect(s.log.some(m => m.from === 'brain')).toBe(false); // the chat holds only AI replies
    expect(s.status).toMatch(/Grok Bot filed 1 memory/);
    delete (globalThis as any).localStorage;
  });
});
