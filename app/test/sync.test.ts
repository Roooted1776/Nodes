import { describe, expect, it } from 'vitest';
import { session } from './fixtures';
import { loadMemoryDatabase, resetMirror, syncMemoryDatabase, type Db } from '../src/lib/cloud';
import { blankMem as blank, mkEntry, sanitizeMem } from '../src/lib/memory';

type Call = { name: string; args: Record<string, unknown> };
function fake(failOn = '') {
  const calls: Call[] = [];
  const d = {
    from: (t: string) => ({
      upsert: async (row: Record<string, unknown>) => {
        calls.push({ name: t, args: row });
        return { error: null };
      },
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

  it('sends only what changed, and a backup read returns the same memory', async () => {
    resetMirror();
    const m = blank();
    m.entries.push(
      mkEntry(m, { key: 'note:a', type: 'concept', title: 'Alpha', note: 'first', manual: true, project: 'Brain' }, 5),
    );
    m.sessions.push(session('s1'));
    const rows: { memories: Record<string, unknown>[]; sessions: Record<string, unknown>[] } = {
      memories: [],
      sessions: [],
    };
    let sends = 0;
    const d = {
      from: (t: string) => ({
        upsert: async () => ({ error: null }),
        select: () => {
          const q = {
            eq: () => q,
            order: () => q,
            limit: async () => ({ data: rows[t as 'memories' | 'sessions'], error: null }),
          };
          return q;
        },
      }),
      rpc: async (name: string, a: Record<string, unknown>) => {
        sends++;
        if (name === 'upsert_memory')
          rows.memories.push({
            id: a.p_id,
            key: a.p_key,
            type: a.p_type,
            title: a.p_title,
            note: a.p_note,
            project: a.p_project,
            body: a.p_body,
          });
        else rows.sessions.push({ body: a.p_body });
        return { error: null };
      },
    } as unknown as Db;
    expect((await syncMemoryDatabase(m, d)).failed).toBe(0);
    expect(sends).toBe(2);
    await syncMemoryDatabase(m, d);
    expect(sends).toBe(2); // nothing changed, nothing sent
    m.entries[0].note = 'changed';
    await syncMemoryDatabase(m, d);
    expect(sends).toBe(3);

    const back = sanitizeMem(await loadMemoryDatabase(d));
    expect(back?.entries.map(e => e.title)).toEqual(['Alpha']);
    expect(back?.sessions.map(x => x.q)).toEqual([session('s1').q]);
  });
});
