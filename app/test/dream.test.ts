import { describe, expect, it } from 'vitest';
import { applyDream, dreamDue, dreamPrompt, gatherInbox, parseDream } from '../src/lib/dream';
import { blankMem, mkEntry, nodeSize, sanitizeMem, type Mem, type Session } from '../src/lib/memory';
import { correctEntry } from '../src/lib/learn';

const session = (m: Mem, q: string, tag = 'live · Groq (free) · openai/gpt-oss-120b · unverified'): Session => {
  const s: Session = {
    id: 's' + m.nextSession++,
    ts: Date.now(),
    q,
    kws: [],
    accepted: [],
    uncovered: [],
    msgs: [{ from: 'claude', tag, text: 'We chose Supabase for the vault.' }],
  };
  m.sessions.push(s);
  m.inbox.push({ kind: 'session', ref: s.id });
  return s;
};

describe('Dream (Perplexity-style memory pass)', () => {
  it('reads the inbox, writes cited and linked pages, keeps a change log and clears the inbox', () => {
    const m = blankMem();
    const s = session(m, 'Pick a database for Brain');
    const cites = gatherInbox(m);
    expect(cites).toHaveLength(1);
    expect(dreamPrompt(m, cites)).toContain('[1] SESSION');
    const reply = JSON.stringify({
      summaries: [{ cite: 1, text: 'The team picked Supabase.' }],
      pages: [
        {
          op: 'create',
          type: 'entity',
          title: 'Supabase',
          note: 'Holds the vault for [[Brain]] [cite:1].',
          cites: [1],
        },
        { op: 'create', type: 'workstream', title: 'Brain', note: 'The app.', cites: [1] },
        { op: 'create', type: 'concept', title: 'No cites', note: 'Dropped.', cites: [] },
        { op: 'create', type: 'concept', title: 'Bad cite', note: 'Dropped.', cites: [9] },
      ],
    });
    const plan = parseDream(reply, cites.length);
    expect(plan.pages.map(p => p.title)).toEqual(['Supabase', 'Brain']);
    expect(plan.pages[0].note).toBe('Holds the vault for Brain.');
    const { pages } = applyDream(m, plan, cites, Date.now());
    expect(pages).toHaveLength(2);
    const supa = m.entries.find(e => e.title === 'Supabase')!;
    const brain = m.entries.find(e => e.title === 'Brain')!;
    expect(supa.sources[0]).toMatchObject({ kind: 'session', ref: s.id });
    expect(supa.links).toContain(brain.id);
    expect(s.sum).toBe('The team picked Supabase.');
    expect(m.inbox).toEqual([]);
    expect(m.lastDream).toBeGreaterThan(0);

    // an update rewrites the page and keeps the old text in its history
    session(m, 'Move the vault');
    const c2 = gatherInbox(m);
    applyDream(
      m,
      parseDream(
        JSON.stringify({
          pages: [{ op: 'update', type: 'entity', title: 'supabase', note: 'Now holds memory too.', cites: [1] }],
        }),
        1,
      ),
      c2,
      Date.now(),
    );
    expect(supa.note).toBe('Now holds memory too.');
    expect(supa.hist?.at(-1)?.note).toBe('Holds the vault for Brain.');
    expect(nodeSize(supa)).toBeGreaterThan(
      nodeSize(mkEntry(blankMem(), { key: 'x', type: 'concept', title: 'x', note: '' }, 0)),
    );
  });

  it('never rewrites a deleted title or a page Owner corrected', () => {
    const m = blankMem();
    m.blocked.push('ai:concept:old idea');
    const e = mkEntry(m, { key: 'ai:entity:vault', type: 'entity', title: 'Vault', note: 'Encrypted.' }, 0);
    m.entries.push(e);
    correctEntry(m, e.id, { note: 'AES-256-GCM, owner checked.' }, 1);
    expect(e.hist?.[0].note).toBe('Encrypted.');
    m.inbox = [];
    session(m, 'x');
    const cites = gatherInbox(m);
    const plan = parseDream(
      JSON.stringify({
        pages: [
          { op: 'create', type: 'concept', title: 'Old idea', note: 'Back again.', cites: [1] },
          { op: 'update', type: 'entity', title: 'Vault', note: 'Plain text.', cites: [1] },
          { op: 'stale', type: 'entity', title: 'Vault', note: '', cites: [1] },
        ],
      }),
      cites.length,
      ['old idea'],
    );
    expect(plan.pages.map(p => p.title)).toEqual(['Vault']);
    applyDream(m, plan, cites, 2);
    expect(e.note).toBe('AES-256-GCM, owner checked.');
  });

  it('is due once a day when something waits in the inbox', () => {
    const m = blankMem();
    expect(dreamDue(m, Date.now())).toBe(false);
    session(m, 'x');
    expect(dreamDue(m, Date.now())).toBe(true);
    m.lastDream = Date.now();
    expect(dreamDue(m, Date.now())).toBe(false);
  });

  it('keeps free-provider sessions, their memories, the inbox and page history after a reload', () => {
    const m = blankMem();
    const s = session(m, 'Free provider task');
    const e = mkEntry(
      m,
      {
        key: 'ai:concept:free',
        type: 'concept',
        title: 'Free',
        note: 'v2',
        sources: [{ kind: 'session', label: 'x', ref: s.id }],
      },
      0,
    );
    e.hist = [{ t: 1, note: 'v1', by: 'session' }];
    m.entries.push(e);
    const back = sanitizeMem(JSON.parse(JSON.stringify(m)))!;
    expect(back.sessions.map(x => x.id)).toEqual([s.id]);
    expect(back.sessions[0].msgs[0].tag).toContain('Groq (free)');
    expect(back.entries.map(x => x.title)).toEqual(['Free']);
    expect(back.entries[0].hist?.[0].note).toBe('v1');
    expect(back.inbox).toEqual([{ kind: 'session', ref: s.id }]);
  });
});
