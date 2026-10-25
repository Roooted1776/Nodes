import { describe, expect, it } from 'vitest';
import { syncMemoryDatabase, type Db } from '../src/lib/cloud';
import { blankMem as blank, mkEntry } from '../src/lib/memory';

type Call = { name: string; args: Record<string, unknown> };
function fake(failOn = '') {
  const calls: Call[] = [];
  const d = {
    from: (t: string) => ({
      upsert: async (row: Record<string, unknown>) => (calls.push({ name: t, args: row }), { error: null }),
    }),
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return { error: name === failOn ? { message: 'denied' } : null };
    },
  };
  return { calls, d: d as unknown as Db };
}

describe('memory database sync', () => {
  it('writes every entry and session', async () => {
    const m = blank();
    m.entries.push(
      mkEntry(m, { key: 'a', type: 'concept', title: 'A very long title '.repeat(10), note: 'note '.repeat(200) }, 1),
    );
    m.sessions.push({ id: 's1', ts: 1, q: 'task', kws: [], accepted: [], uncovered: [], msgs: [] });
    const { d, calls } = fake();
    const r = await syncMemoryDatabase(m, d);
    expect(r.failed).toBe(0);
    const mem = calls.find(c => c.name === 'upsert_memory')!.args;
    expect((mem.p_title as string).length).toBeLessThanOrEqual(80);
    expect((mem.p_note as string).length).toBeLessThanOrEqual(600);
    expect(calls.some(c => c.name === 'upsert_session')).toBe(true);
  });
  it('reports a refused save instead of hiding it', async () => {
    const m = blank();
    m.entries.push(mkEntry(m, { key: 'a', type: 'concept', title: 'A', note: 'n' }, 1));
    const { d } = fake('upsert_memory');
    const r = await syncMemoryDatabase(m, d);
    expect(r.failed).toBe(1);
    expect(r.firstError).toBe('denied');
  });
});
