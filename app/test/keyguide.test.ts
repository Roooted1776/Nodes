import { describe, expect, it } from 'vitest';
import { KEY_GUIDE, guessProvider } from '../src/lib/keyguide';
import { PROVIDERS } from '../src/lib/providers';
import { runChain } from '../src/lib/chain';

describe('key guide', () => {
  it('has https steps for every provider and spots a key pasted under the wrong one', () => {
    for (const p of PROVIDERS) {
      expect(KEY_GUIDE[p].url).toMatch(/^https:\/\//);
      expect(KEY_GUIDE[p].steps.length).toBeGreaterThanOrEqual(3);
    }
    expect(guessProvider('sk-ant-api03-x')).toBe('anthropic');
    expect(guessProvider('sk-proj-x')).toBe('openai');
    expect(guessProvider('AIzaSyX')).toBe('google');
    expect(guessProvider('xai-123')).toBe('xai');
    expect(guessProvider('hello')).toBeNull();
  });
  it('each handoff carries the real text that was passed on', async () => {
    const got: [string, string, string | undefined][] = [];
    await runChain('write a plan', 'live · OpenAI · m', async () => ({ text: 'one two three', why: '' }), {
      say: () => {},
      active: () => {},
      handoff: (a, b, t) => got.push([a, b, t]),
      blocked: () => null,
    });
    expect(got[0]).toEqual(['owner', 'gemini', 'write a plan']);
    expect(got[1][2]).toBe('HANDOFF FROM Gemini:\none two three');
  });
});
