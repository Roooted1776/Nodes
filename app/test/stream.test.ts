import { describe, expect, it, vi } from 'vitest';
import { buildRequest, callModel, ProviderError, type ProviderId } from '../src/lib/providers';
import { sanitizeMem } from '../src/lib/memory';

/** A fake provider that answers with server-sent events, split at awkward places like a real network. */
const sse = (events: unknown[], cut = 7) => {
  const text = events.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('') + 'data: [DONE]\n\n',
    enc = new TextEncoder();
  const parts: string[] = [];
  for (let i = 0; i < text.length; i += cut) parts.push(text.slice(i, i + cut));
  return vi.fn(
    async () =>
      new Response(
        new ReadableStream({
          start(c) {
            parts.forEach(p => c.enqueue(enc.encode(p)));
            c.close();
          },
        }),
        { status: 200, headers: { 'content-type': 'text/event-stream' } },
      ),
  );
};
const EVENTS: Record<ProviderId, unknown[]> = {
  anthropic: [
    { type: 'message_start', message: { usage: { input_tokens: 11 } } },
    { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello ' } },
    { type: 'content_block_delta', delta: { type: 'text_delta', text: 'team' } },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 3 } },
  ],
  openai: [
    { type: 'response.output_text.delta', delta: 'Hello ' },
    { type: 'response.output_text.delta', delta: 'team' },
    { type: 'response.completed', response: { usage: { input_tokens: 11, output_tokens: 3 } } },
  ],
  xai: [
    { type: 'response.output_text.delta', delta: 'Hello ' },
    { type: 'response.output_text.delta', delta: 'team' },
    { type: 'response.completed', response: { usage: { input_tokens: 11, output_tokens: 3 } } },
  ],
  google: [
    { candidates: [{ content: { parts: [{ text: 'Hello ' }] } }] },
    {
      candidates: [{ content: { parts: [{ text: 'team' }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 3 },
    },
  ],
};
const base = { key: 'k-123', model: 'm', system: 's', user: 'u', maxTokens: 50 };

describe('streaming replies', () => {
  it('asks each provider to stream', () => {
    expect((buildRequest({ provider: 'anthropic', ...base }, true).body as any).stream).toBe(true);
    expect((buildRequest({ provider: 'openai', ...base }, true).body as any).stream).toBe(true);
    expect((buildRequest({ provider: 'xai', ...base }, true).body as any).stream).toBe(true);
    expect(buildRequest({ provider: 'google', ...base }, true).url).toMatch(/:streamGenerateContent\?alt=sse&key=/);
    expect((buildRequest({ provider: 'openai', ...base }).body as any).stream).toBeUndefined();
  });
  for (const p of ['anthropic', 'openai', 'xai', 'google'] as ProviderId[])
    it(`${p}: text grows as it arrives and the totals are kept`, async () => {
      const seen: string[] = [];
      const r = await callModel({ provider: p, ...base, fetchImpl: sse(EVENTS[p]) as any, onDelta: t => seen.push(t) });
      expect(r.text).toBe('Hello team');
      expect(r.tin).toBe(11);
      expect(r.tout).toBe(3);
      expect(seen).toEqual(['Hello ', 'Hello team']);
    });
  it('a stream error is reported honestly, not as a blocked call', async () => {
    const f = sse([
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hi' } },
      { type: 'error', error: { message: 'Overloaded' } },
    ]);
    await expect(callModel({ provider: 'anthropic', ...base, fetchImpl: f as any, onDelta: () => {} })).rejects.toThrow(
      /Overloaded/,
    );
    await expect(
      callModel({
        provider: 'anthropic',
        ...base,
        fetchImpl: sse([{ type: 'error', error: { message: 'x' } }]) as any,
        onDelta: () => {},
      }),
    ).rejects.toBeInstanceOf(ProviderError);
  });
  it('a JSON answer still works when streaming was asked for', async () => {
    const f = vi.fn(
      async () =>
        new Response(JSON.stringify({ output_text: 'plain' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    expect((await callModel({ provider: 'openai', ...base, fetchImpl: f as any, onDelta: () => {} })).text).toBe(
      'plain',
    );
  });
});

describe('saved flow', () => {
  it('keeps real handoff sizes and reply times, and drops anything malformed', () => {
    const live = {
      id: 's1',
      ts: Date.now(),
      q: 'plan',
      kws: [],
      accepted: [],
      uncovered: [],
      msgs: [{ from: 'gemini', text: 'hi', tag: 'live · OpenAI · m · unverified' }],
      flow: [
        ['owner', 'gemini', 2],
        ['gemini', 'muse', 40],
        ['hacker', 'muse', 5],
        ['gemini', 'muse', -1],
        ['gemini', 'muse', 'x'],
        ['grokbot', 'brain', 12],
      ],
      ms: { gemini: 2400, evil: 1, muse: -5 },
    };
    const m = sanitizeMem({ entries: [], sessions: [live] })!;
    expect(m.sessions[0].flow).toEqual([
      ['owner', 'gemini', 2],
      ['gemini', 'muse', 40],
      ['grokbot', 'brain', 12],
    ]);
    expect(m.sessions[0].ms).toEqual({ gemini: 2400 });
  });
});
