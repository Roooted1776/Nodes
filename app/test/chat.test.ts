import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LIVE_TAG, blankMem, sanitizeMem } from '../src/lib/memory';
import { CHAT_SYSTEM, runChat } from '../src/lib/run-chat';
import { ProviderError } from '../src/lib/providers';

describe('chat mode tags and sanitize', () => {
  it('accepts chat · provider tags as live sessions', () => {
    const tag = 'chat · OpenAI · gpt-4o-mini · unverified';
    expect(LIVE_TAG.test(tag)).toBe(true);
    const m = sanitizeMem({
      ...blankMem(),
      nextSession: 2,
      sessions: [
        {
          id: 's1',
          ts: Date.now(),
          q: 'hello',
          kind: 'chat',
          kws: [],
          accepted: [],
          uncovered: [],
          msgs: [
            { from: 'owner', tag: '', text: 'hello' },
            { from: 'chatgpt', tag, text: 'hi' },
          ],
        },
      ],
    });
    expect(m?.sessions).toHaveLength(1);
    expect(m?.sessions[0].kind).toBe('chat');
    expect(m?.sessions[0].msgs[1].tag).toBe(tag);
    expect(m?.inbox).toHaveLength(0);
  });
});

describe('runChat', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('saves a chat session without inbox or wiki entries, and keeps the user message if the provider fails', async () => {
    const mem = blankMem();
    mem.settings.brain = true;
    mem.settings.useMemory = false;
    let state: any = {
      role: 'admin',
      mem,
      keys: { openai: 'sk-test' },
      dead: {},
      live: { provider: 'openai', models: {}, callCap: 9, maxTokens: 400, web: false, on: true },
      busy: false,
      dreaming: false,
      incognito: false,
      calls: 0,
      activeProject: 'Brain',
      chatThreadId: null,
      stopped: false,
    };
    const set = (p: any) => {
      const patch = typeof p === 'function' ? p(state) : p;
      state = { ...state, ...patch };
    };
    const get = () => state;
    const say = vi.fn();
    const commit = (fn: (m: typeof mem) => void) => {
      fn(state.mem);
      state = { ...state, mem: { ...state.mem, sessions: [...state.mem.sessions], inbox: [...state.mem.inbox] } };
    };
    state.commit = commit;

    const fetchImpl = vi.fn(async () => {
      throw new ProviderError('HTTP 500: boom', false);
    });
    vi.stubGlobal('fetch', fetchImpl);

    await runChat('remember coffee preference', {
      get,
      set,
      say,
      clean: t => t,
      addPulse: () => {},
      words: () => 1,
      speedFor: () => undefined,
      liveReady: () => true,
      admin: () => true,
      ctls: new Set(),
      ls: null,
    });

    expect(state.mem.sessions).toHaveLength(1);
    expect(state.mem.sessions[0].kind).toBe('chat');
    expect(state.mem.inbox).toHaveLength(0);
    expect(state.mem.entries).toHaveLength(0);
    expect(state.mem.sessions[0].msgs.some((m: { from: string }) => m.from === 'owner')).toBe(true);
    expect(state.chatThreadId).toBe(state.mem.sessions[0].id);
    expect(CHAT_SYSTEM).toMatch(/cannot run tools/i);
  });

  it('does not count as a team task and does not file memories on success', async () => {
    const mem = blankMem();
    mem.settings.useMemory = false;
    let state: any = {
      role: 'admin',
      mem,
      keys: { openai: 'sk-test' },
      dead: {},
      live: { provider: 'openai', models: { openai: 'gpt-4o-mini' }, callCap: 9, maxTokens: 400, web: true, on: true },
      busy: false,
      dreaming: false,
      incognito: false,
      calls: 0,
      tasks: 0,
      tin: 0,
      tout: 0,
      timing: {},
      flow: [],
      activeProject: 'Brain',
      chatThreadId: null,
      stopped: false,
      commit(fn: (m: typeof mem) => void) {
        fn(this.mem);
        this.mem = { ...this.mem, sessions: [...this.mem.sessions], inbox: [...this.mem.inbox] };
      },
    };
    const set = (p: any) => {
      const patch = typeof p === 'function' ? p(state) : p;
      Object.assign(state, patch);
    };
    // OpenAI Responses streaming shape used by callModel for openai
    const events = [
      { type: 'response.output_text.delta', delta: 'Noted.' },
      { type: 'response.completed', response: { usage: { input_tokens: 2, output_tokens: 1 } } },
    ];
    const body = events.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('') + 'data: [DONE]\n\n';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })),
    );

    await runChat('hi', {
      get: () => state,
      set,
      say: () => {},
      clean: t => t,
      addPulse: () => {},
      words: () => 1,
      speedFor: () => undefined,
      liveReady: () => true,
      admin: () => true,
      ctls: new Set(),
      ls: null,
    });

    expect(state.tasks).toBe(0);
    expect(state.mem.inbox).toHaveLength(0);
    expect(state.mem.entries).toHaveLength(0);
    expect(state.mem.sessions[0].kind).toBe('chat');
    expect(state.mem.sessions[0].msgs.some((m: { tag: string }) => m.tag.startsWith('chat ·'))).toBe(true);
  });
});
