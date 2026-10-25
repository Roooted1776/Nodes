import { describe, expect, it } from 'vitest';
import {
  agentActivityScores,
  blankMem,
  ensureProjectNode,
  findMostWorkedNode,
  loadMem,
  sanitizeMem,
  saveImportedListAsTask,
  saveMem,
} from '../src/lib/memory';
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
  it('supports explicit memory linking and status toggling for workstreams', async () => {
    const { addNote, correctEntry } = await import('../src/lib/learn');
    const m = blankMem();
    const e1 = addNote(m, { type: 'concept', title: 'Modular Architecture', note: 'Clear boundaries.' }, 1000)!;
    const e2 = addNote(
      m,
      { type: 'workstream', title: 'Brain UI Polish', note: 'Personal memory collection.', links: [e1.id] },
      2000,
    )!;
    expect(e2.links).toContain(e1.id);
    expect(e1.links).toContain(e2.id);

    // Correct entry and change status to stale/completed
    correctEntry(m, e2.id, { note: 'Work completed.', status: 'stale' }, 3000);
    expect(e2.status).toBe('stale');
    expect(e2.note).toBe('Work completed.');
  });

  it('findMostWorkedNode returns project node when no sessions exist', () => {
    const m = blankMem();
    const projNode = ensureProjectNode(m, 'Robotics');
    const mostWorked = findMostWorkedNode(m, 'Robotics');
    expect(mostWorked.id).toBe(projNode.id);
  });

  it('findMostWorkedNode finds the node with the highest agent work score', () => {
    const m = blankMem();
    const projNode = ensureProjectNode(m, 'Robotics');
    const concept1 = {
      id: 'c1',
      key: 'concept:vision',
      type: 'concept' as const,
      title: 'Computer Vision',
      note: 'Camera processing',
      sources: [],
      links: [projNode.id],
      strength: 2,
      status: 'fresh' as const,
      created: 1,
      seen: 1,
      corrected: false,
      skill: false,
      prog: null,
      corpusId: null,
      kws: ['robotics', 'vision'],
      manual: false,
    };
    const concept2 = {
      id: 'c2',
      key: 'concept:actuators',
      type: 'concept' as const,
      title: 'Actuators',
      note: 'Motor control',
      sources: [],
      links: [projNode.id],
      strength: 1,
      status: 'fresh' as const,
      created: 1,
      seen: 1,
      corrected: false,
      skill: false,
      prog: null,
      corpusId: null,
      kws: ['robotics', 'actuators'],
      manual: false,
    };
    m.entries.push(concept1, concept2);

    // Add session where agents worked intensively on concept1
    m.sessions.push({
      id: 's1',
      ts: 1000,
      q: 'Calibrate computer vision cameras',
      project: 'Robotics',
      projectId: concept1.id,
      kws: ['vision'],
      accepted: [],
      uncovered: [],
      used: [concept1.id],
      learned: true,
      flow: [['gemini', 'grokbot', 350]],
      msgs: [{ from: 'gemini', text: 'Vision calibrated.', tag: 'live' }],
      cover: { gemini: { s: 'done' }, grokbot: { s: 'done' } },
    });

    const targetNode = findMostWorkedNode(m, 'Robotics');
    expect(targetNode.id).toBe(concept1.id);
    expect(targetNode.title).toBe('Computer Vision');
  });

  it('saveImportedListAsTask saves list under tasks under project and most-worked node', () => {
    const m = blankMem();
    ensureProjectNode(m, 'WebDev');

    const items = [
      { title: 'Responsive Layout', note: 'CSS grid and flexbox', type: 'concept' as const },
      { title: 'Navigation Bug', note: 'Fixed mobile drawer', type: 'entity' as const },
    ];

    const sess = saveImportedListAsTask(m, items, 'WebDev', {
      sourceKind: 'github',
      repo: 'Roooted1776/WebDev',
      summary: '1 concept, 1 entity',
    });

    expect(m.sessions).toHaveLength(1);
    expect(sess.project).toBe('WebDev');
    expect(sess.q).toContain('GitHub: Roooted1776/WebDev');
    expect(sess.cover?.cursor?.s).toBe('done');
    expect(sess.cover?.grokbot?.s).toBe('done');
    expect(sess.msgs).toHaveLength(3);
    expect(sess.msgs[0].from).toBe('cursor');
    expect(sess.msgs[1].from).toBe('codex');
    expect(sess.msgs[2].from).toBe('grokbot');
  });
});

describe('agentActivityScores', () => {
  it('tallies node mentions, session targets, and handoff activity across all sessions', () => {
    const m = blankMem();
    m.entries = [
      { id: 'n1', type: 'concept', title: 'React Framework', note: 'Frontend library', sources: [], links: [] },
      { id: 'n2', type: 'concept', title: 'ThreeJS Canvas', note: '3D rendering', sources: [], links: [] },
    ] as unknown as typeof m.entries;
    m.sessions = [
      {
        id: 's1',
        ts: Date.now(),
        q: 'Setup React components and optimize rendering',
        project: 'Brain',
        nodeId: 'n1',
        nodeTitle: 'React Framework',
        msgs: [{ from: 'cursor', tag: 'live · test', text: 'Checked React Framework implementation in app' }],
      },
    ] as unknown as typeof m.sessions;

    const scores = agentActivityScores(m);
    expect(scores.get('n1')).toBeGreaterThan(0);
    expect(scores.get('n2') || 0).toBe(0);
  });
});

