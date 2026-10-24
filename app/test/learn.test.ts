import { describe, expect, it } from 'vitest';
import { fileMemories, memoryPrompt, parseMemories } from '../src/lib/ai-memory';
import { correctEntry, deleteEntry, maintain, tally } from '../src/lib/learn';
import { blankMem, byKey } from '../src/lib/memory';
import { contextBlock, relevant } from '../src/lib/retrieve';
import { DAY } from '../src/lib/text';
import { session } from './fixtures';

const reply = (items: object[]) => JSON.stringify({ memories: items });
const graph = { type: 'concept', title: 'Memory graph', note: 'The team stores memory as a linked graph.' };
const react = { type: 'entity', title: 'React', note: 'The page is built with React.' };

describe('memory written by the AI team', () => {
  it('reads the reply, even when it was cut short, and drops anything malformed', () => {
    expect(parseMemories(reply([graph, react]))).toHaveLength(2);
    const cut = reply([graph, react]).slice(0, -12); // the second item is cut off mid-way
    expect(parseMemories(cut).map(m => m.title)).toEqual(['Memory graph']);
    expect(
      parseMemories(
        reply([
          { type: 'gossip', title: 'x', note: 'y' },
          { type: 'concept', note: 'no title' },
        ]),
      ),
    ).toEqual([]);
    expect(parseMemories('I think we should remember the graph.')).toEqual([]); // prose is not a memory
    expect(parseMemories(reply([graph, react, { ...graph, title: 'A' }, { ...graph, title: 'B' }]))).toHaveLength(3);
    expect(
      parseMemories(reply([{ ...graph, note: 'key sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123' }]))[0].note,
    ).not.toMatch(/sk-ant-api03/);
  });
  it('the prompt carries the task, the team replies and the titles already remembered', () => {
    const p = memoryPrompt('plan the graph', session().msgs, ['Memory graph']);
    expect(p).toMatch(/^TASK: plan the graph/);
    expect(p).toMatch(/ALREADY REMEMBERED \(titles\): Memory graph/);
  });
  it('files linked entries that point back to their session and to the memories that were used', () => {
    const m = blankMem(),
      s = session(),
      t = tally();
    m.sessions.push(s);
    const made = fileMemories(m, parseMemories(reply([graph, react])), s, t, s.ts);
    expect(made.map(e => e.key)).toEqual(['ai:concept:memory graph', 'ai:entity:react']);
    expect(made[0].sources[0]).toMatchObject({ kind: 'session', ref: s.id });
    expect(made[0].sources[0].label).toMatch(/^Grok Bot \(AI\)/);
    expect(made[0].links).toContain(made[1].id);
    expect(t.fresh).toBe(2);
    expect(s.learned).toBe(true);
  });
  it('the same title from a later task makes the memory stronger instead of a copy', () => {
    const m = blankMem(),
      a = session('s1'),
      b = session('s2', a.ts + DAY);
    fileMemories(m, parseMemories(reply([graph])), a, tally(), a.ts);
    const t = tally();
    fileMemories(
      m,
      parseMemories(reply([{ ...graph, title: 'memory GRAPH', note: 'Links are kept both ways.' }])),
      b,
      t,
      b.ts,
    );
    const e = byKey(m, 'ai:concept:memory graph')!;
    expect(m.entries).toHaveLength(1);
    expect(e.strength).toBe(2);
    expect(e.note).toMatch(/both ways/);
    expect(t.updated + t.reinforced).toBe(1);
  });
  it('keeps your correction, never refiles what you deleted, and marks old memory stale on the real clock', () => {
    const m = blankMem(),
      s = session();
    fileMemories(m, parseMemories(reply([graph, react])), s, tally(), s.ts);
    correctEntry(m, byKey(m, 'ai:concept:memory graph')!.id, { note: 'Owner: the graph is the main view.' }, s.ts + 1);
    deleteEntry(m, byKey(m, 'ai:entity:react')!.id);
    const t = tally(),
      s2 = session('s2', s.ts + DAY);
    fileMemories(m, parseMemories(reply([graph, react])), s2, t, s2.ts);
    expect(byKey(m, 'ai:concept:memory graph')!.note).toBe('Owner: the graph is the main view.');
    expect(byKey(m, 'ai:entity:react')).toBeUndefined();
    expect(t.blocked).toBe(1);
    const st = tally();
    maintain(m, st, s2.ts + 31 * DAY);
    expect(st.stale).toBe(1);
  });
  it('finds relevant memory for a new prompt, so the team learns from what it filed before', () => {
    const m = blankMem(),
      s = session();
    fileMemories(m, parseMemories(reply([graph])), s, tally(), s.ts);
    const hits = relevant(m, 'How should the memory graph store data?');
    expect(hits[0].e.title).toBe('Memory graph');
    expect(contextBlock(hits.map(h => h.e))).toMatch(/^BRAIN CONTEXT/);
    expect(relevant(m, 'zzz qqq')).toEqual([]);
  });
});
