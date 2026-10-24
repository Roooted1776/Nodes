import { describe, expect, it } from 'vitest';
import { blankMem, loadMem, sanitizeMem, saveMem } from '../src/lib/memory';
import { fileMemories } from '../src/lib/ai-memory';
import { tally } from '../src/lib/learn';
import { redact } from '../src/lib/redact';
import { session } from './fixtures';

const store = () => {
  const d: Record<string, string> = {};
  return {
    getItem: (k: string) => d[k] ?? null,
    setItem: (k: string, v: string) => {
      d[k] = v;
    },
    d,
  };
};

describe('memory storage', () => {
  it('round-trips through brain.mem.v2', () => {
    const m = blankMem(),
      s = session();
    m.sessions.push(s);
    fileMemories(
      m,
      [
        { type: 'concept', title: 'Memory graph', note: 'Linked.' },
        { type: 'entity', title: 'React', note: 'UI.' },
      ],
      s,
      tally(),
      s.ts,
    );
    const st = store();
    saveMem(st, m);
    expect(Object.keys(st.d)).toEqual(['brain.mem.v2']);
    const back = loadMem(st).mem;
    expect(back.entries.length).toBe(m.entries.length);
    expect(back.entries.map(e => e.links.length)).toEqual(m.entries.map(e => e.links.length));
  });
  it('drops old demo entries and sessions that were not live', () => {
    const d = {
      entries: [
        {
          id: 'e1',
          key: 'prog:claude',
          type: 'entity',
          title: 'Claude',
          note: '',
          sources: [],
          links: [],
          strength: 1,
          seen: 1,
          created: 1,
          status: 'fresh',
        },
        {
          id: 'e2',
          key: 'c:corpus:3',
          type: 'concept',
          title: 'Sample',
          note: '',
          sources: [{ kind: 'file', label: 'Docs connector (sample)' }],
          links: [],
          strength: 1,
          seen: 1,
          created: 1,
          status: 'fresh',
        },
        {
          id: 'e3',
          key: 'note:concept:x',
          type: 'concept',
          title: 'My note',
          note: 'kept',
          sources: [{ kind: 'file', label: 'Your note' }],
          links: [],
          strength: 1,
          seen: 1,
          created: 1,
          status: 'fresh',
          manual: true,
        },
      ],
      sessions: [{ id: 's1', q: 'scripted', msgs: [{ from: 'claude', text: 'hi', tag: 'scripted' }] }],
    };
    const m = sanitizeMem(d)!;
    expect(m.entries.map(e => e.id)).toEqual(['e3']);
    expect(m.sessions).toEqual([]);
  });
  it('a pasted backup cannot claim live model replies', () => {
    const m = blankMem(),
      s = session();
    m.sessions.push(s);
    expect(sanitizeMem(JSON.parse(JSON.stringify(m)), true)!.sessions).toEqual([]);
  });
  it('filters keys and passwords', () => {
    const r = redact(
      'my key sk-ant-abcdefghijklmnop123 and password: hunter2 and AIzaSyA1234567890123456789012345678901',
    );
    expect(r.text).not.toMatch(/sk-ant|hunter2|AIza/);
    expect(r.n).toBe(3);
    expect(redact('echo MYSECRETKEY12345', ['MYSECRETKEY12345']).text).toBe('echo [filtered]');
  });
  it('keeps only AI-written memories and your own notes live; older text-analysis memories are archived, not lost', () => {
    const m = blankMem(),
      s = session();
    m.sessions.push(s);
    fileMemories(m, [{ type: 'concept', title: 'Memory graph', note: 'Linked.' }], s, tally(), s.ts);
    const old = { ...m.entries[0], id: 'e99', key: 'concept:old topic', title: 'Old topic', links: [m.entries[0].id] };
    m.entries[0].links.push('e99');
    m.entries.push(old, {
      ...m.entries[0],
      id: 'e98',
      key: 'note:concept:mine',
      title: 'Mine',
      manual: true,
      links: [],
    });
    const back = sanitizeMem(JSON.parse(JSON.stringify(m)))!;
    expect(back.entries.map(e => e.key)).toEqual(['ai:concept:memory graph', 'note:concept:mine']);
    expect(back.archived.map(e => e.key)).toEqual(['concept:old topic']);
    expect(back.entries[0].links).not.toContain('e99');
    expect(sanitizeMem(JSON.parse(JSON.stringify(back)))!.archived).toHaveLength(1); // stays archived on the next load
  });
});
