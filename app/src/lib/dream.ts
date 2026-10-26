// Dream: Brain's memory pass, modelled on Perplexity Brain's published design (blog, 19 Aug 2026).
// Sessions, files, GitHub imports and Owner's corrections wait in the inbox. One real AI call then works in four
// steps: orient, summarize sessions, attach facts to subjects, update the wiki. Pages link with [[Title]] (context
// edges) and cite inbox items with [cite:N] (evidence edges). The reply is checked before anything is saved.
import { type Tally, tally, upsert } from './learn';
import {
  TYPES,
  keepHistory,
  link,
  weight,
  type Entry,
  type EntryType,
  type Inbox,
  type Mem,
  type Source,
} from './memory';
import { redact } from './redact';
import { clip, fmtDate, keywords } from './text';

export const DREAM_BATCH = 12,
  DREAM_PAGES = 8;
/** How long after a Dream the next automatic one may run. */
export const DREAM_EVERY = 20 * 60 * 60 * 1000;

export const DREAM_SYSTEM =
  "You are Dream, the memory agent of Owner's Brain. You keep a small wiki of what the team knows. Work in four steps. " +
  '1 Orient: read the INDEX of existing pages, the DELETED list and the INBOX. ' +
  '2 Summarize each inbox session in one sentence. ' +
  '3 Attach facts from the inbox to subjects (concepts, entities, workstreams). ' +
  '4 Update the wiki: create pages, update pages, or mark pages stale. ' +
  'Reply with JSON only, no other text: ' +
  '{"summaries":[{"cite":1,"text":"..."}],"pages":[{"op":"create|update|stale","type":"concept|entity|workstream","title":"...","note":"...","cites":[1]}]}. ' +
  `Rules: at most ${DREAM_PAGES} pages. title: at most 6 words; reuse an INDEX title for the same thing. ` +
  'note: at most 60 words, only facts from the inbox; link other pages by writing [[Their Title]]. ' +
  'cites: the inbox numbers the page relies on; every page needs at least one. ' +
  'A CORRECTION is Owner speaking: never contradict it. Never write a page on a DELETED title. ' +
  'Use stale only when the inbox shows a page is no longer true. Never invent anything. ' +
  'If nothing should change, reply {"summaries":[],"pages":[]}.';

export interface Cite {
  n: number;
  item: Inbox;
  source: Source;
  text: string;
}
export interface DreamPage {
  op: 'create' | 'update' | 'stale';
  type: EntryType;
  title: string;
  note: string;
  cites: number[];
  links: string[];
}
export interface DreamPlan {
  summaries: { cite: number; text: string }[];
  pages: DreamPage[];
}

const deletedTitles = (m: Mem) => m.blocked.map(k => k.split(':').slice(2).join(':') || k).filter(Boolean);

/** Step 1, orient: the inbox items this run reads, each with the source a page will cite. */
export function gatherInbox(m: Mem, max = DREAM_BATCH): Cite[] {
  const out: Cite[] = [];
  for (const item of m.inbox) {
    if (out.length >= max) break;
    const n = out.length + 1;
    if (item.kind === 'session') {
      const s = m.sessions.find(x => x.id === item.ref);
      if (!s) continue;
      const replies = s.msgs
        .filter(x => x.tag.startsWith('live'))
        .map(x => `${x.from}: ${clip(x.text.replace(/\s+/g, ' '), 300)}`)
        .join('\n');
      out.push({
        n,
        item,
        source: { kind: 'session', label: `Session ${fmtDate(s.ts)}: ${clip(s.q, 40)}`, ref: s.id },
        text: `SESSION ${fmtDate(s.ts)}${s.project ? ` [${s.project}]` : ''}\nTASK: ${clip(s.q, 300)}\n${clip(replies, 1200)}`,
      });
    } else {
      const e = m.entries.find(x => x.id === item.ref);
      if (!e) continue;
      const kind = item.kind === 'correction' ? 'correction' : item.kind === 'github' ? 'github' : 'file';
      const head = kind === 'correction' ? 'CORRECTION (Owner)' : kind === 'github' ? 'GITHUB' : 'FILE';
      out.push({
        n,
        item,
        source: {
          kind,
          label: `${kind === 'correction' ? 'Your correction' : kind === 'github' ? 'GitHub' : 'File'}: ${clip(e.title, 40)}`,
          ref: e.id,
        },
        text: `${head}: ${e.title}\n${clip(e.note, 600)}`,
      });
    }
  }
  return out;
}

export function dreamPrompt(m: Mem, cites: Cite[], focus = ''): string {
  const index = [...m.entries]
    .filter(e => e.status === 'fresh')
    .sort((a, b) => weight(b) - weight(a))
    .slice(0, 80)
    .map(e => `${e.title} [${e.type}]`);
  const deleted = deletedTitles(m).slice(-40);
  return (
    (focus.trim() ? `OWNER'S FOCUS: ${clip(focus.trim(), 300)}\n\n` : '') +
    `INDEX (${index.length} pages): ${index.length ? index.join(' | ') : 'empty'}\n\n` +
    `DELETED (never write these): ${deleted.length ? deleted.join(' | ') : 'none'}\n\n` +
    'INBOX:\n' +
    cites.map(c => `[${c.n}] ${c.text}`).join('\n\n')
  );
}

/** Reads the AI's reply and checks every page before anything is saved. Anything malformed is dropped. */
export function parseDream(text: string, nCites: number, deleted: string[] = []): DreamPlan {
  const plan: DreamPlan = { summaries: [], pages: [] };
  let j: any;
  try {
    j = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  } catch {
    return plan;
  }
  const okCite = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= nCites;
  const gone = new Set(deleted.map(t => t.toLowerCase()));
  if (Array.isArray(j?.summaries))
    for (const s of j.summaries)
      if (s && okCite(s.cite) && typeof s.text === 'string' && s.text.trim())
        plan.summaries.push({ cite: s.cite, text: redact(s.text.trim()).text.slice(0, 300) });
  if (Array.isArray(j?.pages))
    for (const p of j.pages) {
      if (!p || !['create', 'update', 'stale'].includes(p.op) || !TYPES.includes(p.type)) continue;
      if (typeof p.title !== 'string' || typeof p.note !== 'string') continue;
      const title = redact(p.title.replace(/\[\[|\]\]/g, '').trim()).text.slice(0, 80);
      const cites = Array.isArray(p.cites) ? [...new Set(p.cites.filter(okCite))] : [];
      if (!title || !cites.length || gone.has(title.toLowerCase())) continue;
      if (plan.pages.some(x => x.title.toLowerCase() === title.toLowerCase())) continue;
      const raw = String(p.note);
      const links = [...raw.matchAll(/\[\[([^\]]{1,80})\]\]/g)]
        .map(x => x[1].trim())
        .filter(t => t && t.toLowerCase() !== title.toLowerCase());
      const note = redact(
        raw
          .replace(/\[\[([^\]]{1,80})\]\]/g, '$1')
          .replace(/\s*\[cite:\s*\d+\]/g, '')
          .trim(),
      ).text.slice(0, 600);
      if (p.op !== 'stale' && !note) continue;
      plan.pages.push({ op: p.op, type: p.type, title, note, cites: cites as number[], links: [...new Set(links)] });
      if (plan.pages.length >= DREAM_PAGES) break;
    }
  return plan;
}

const byTitle = (m: Mem, t: string): Entry | undefined =>
  m.entries.find(e => e.title.toLowerCase() === t.toLowerCase());

/** Step 4: write the checked plan into memory, then clear the inbox items this run read. */
export function applyDream(m: Mem, plan: DreamPlan, cites: Cite[], now: number): { t: Tally; pages: Entry[] } {
  const t = tally(),
    pages: Entry[] = [];
  for (const s of plan.summaries) {
    const c = cites[s.cite - 1];
    const sess = c?.item.kind === 'session' ? m.sessions.find(x => x.id === c.item.ref) : undefined;
    if (sess) sess.sum = s.text;
  }
  for (const p of plan.pages) {
    const sources = p.cites.map(n => cites[n - 1].source);
    const old = byTitle(m, p.title);
    if (p.op === 'stale') {
      if (old && !old.corrected && old.status === 'fresh') {
        old.status = 'stale';
        t.stale++;
        t.changed.push(old.id);
      }
      continue;
    }
    const key = old ? old.key : `ai:${p.type}:${p.title.toLowerCase()}`;
    const before = old?.note;
    const e = upsert(
      m,
      {
        key,
        type: old ? old.type : p.type,
        title: old ? old.title : p.title,
        note: p.note,
        kws: keywords(p.title + ' ' + p.note).slice(0, 8),
        sources,
      },
      t,
      now,
    );
    if (!e) continue;
    // Dream rewrites a page as a whole instead of piling lines up, and keeps the old text in the change log
    if (!e.corrected && before !== undefined && e.note !== p.note) {
      if (before && e.hist?.at(-1)?.note !== before) {
        e.note = before;
        keepHistory(e, 'session', now);
      }
      e.note = p.note;
    }
    pages.push(e);
  }
  for (const p of plan.pages) {
    const e = byTitle(m, p.title);
    for (const l of p.links) link(e, byTitle(m, l));
    // a page about a file or correction is linked to that entry too
    for (const n of p.cites) {
      const c = cites[n - 1];
      if (c.item.kind !== 'session')
        link(
          e,
          m.entries.find(x => x.id === c.item.ref),
        );
    }
  }
  const done = new Set(cites.map(c => c.item));
  m.inbox = m.inbox.filter(i => !done.has(i));
  m.lastDream = now;
  return { t, pages };
}

/** Whether an automatic Dream is due: something waits in the inbox and the last run was long enough ago. */
export const dreamDue = (m: Mem, now: number) => m.inbox.length > 0 && now - (m.lastDream || 0) >= DREAM_EVERY;
