// Memory is written by the team itself: after a task, Grok Bot (the team head, a real AI call) files what is worth
// keeping. Brain stores only what the AI wrote. Nothing is made up when the reply cannot be read.
import { byId, ensureProjectNode, link, type Entry, type EntryType, type Mem, type Msg, type Session } from './memory';
import { type Tally, upsert } from './learn';
import { redact } from './redact';
import { clip, fmtDate, keywords } from './text';

export const AI_KEY = 'ai:';
export interface AiMemory {
  type: EntryType;
  title: string;
  note: string;
}
const TYPES = new Set<EntryType>(['concept', 'entity', 'workstream']);

export const MEMORY_SYSTEM =
  "You are Grok Bot, head of Owner's AI team. The team just finished a task. File what the team should remember for future tasks. " +
  'Reply with JSON only, no other text: {"memories":[{"type":"concept|entity|workstream","title":"...","note":"..."}]}. ' +
  'At most 3 memories. type: concept = an idea or rule, entity = a named thing, workstream = an ongoing piece of work. ' +
  'title: at most 6 words; reuse an existing title when it is the same thing. note: at most 25 words, only facts and decisions from the task. ' +
  'Never invent anything. If nothing is worth keeping, reply {"memories":[]}.';

/** The task, the team's replies (clipped) and the titles Brain already holds, so the AI can reinforce instead of duplicate. */
export function memoryPrompt(task: string, msgs: Msg[], known: string[], focus = ''): string {
  const replies = msgs
    .filter(m => m.tag.startsWith('live'))
    .map(m => `${m.from}: ${clip(m.text.replace(/\s+/g, ' '), 500)}`)
    .join('\n');
  return (
    (focus.trim() ? `OWNER'S FOCUS (what to pay attention to): ${clip(focus.trim(), 300)}\n\n` : '') +
    `TASK: ${clip(task, 300)}\n\nTEAM REPLIES:\n${clip(replies, 3200)}\n\n` +
    `ALREADY REMEMBERED (titles): ${known.length ? known.slice(0, 40).join(' | ') : 'none'}`
  );
}

/** Reads the AI's reply. Accepts the JSON even if the reply was cut short; anything malformed is dropped. */
export function parseMemories(text: string): AiMemory[] {
  const out: AiMemory[] = [];
  const take = (o: any) => {
    if (!o || typeof o !== 'object' || !TYPES.has(o.type) || typeof o.title !== 'string' || typeof o.note !== 'string')
      return;
    const title = redact(o.title.trim()).text.slice(0, 80),
      note = redact(o.note.trim()).text.slice(0, 600);
    if (title && !out.some(x => x.title.toLowerCase() === title.toLowerCase())) out.push({ type: o.type, title, note });
  };
  try {
    const j = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    if (Array.isArray(j?.memories)) j.memories.forEach(take);
  } catch {
    for (const m of text.matchAll(/\{[^{}]*"title"[^{}]*\}/g)) {
      try {
        take(JSON.parse(m[0]));
      } catch {
        /* an item cut off mid-way is skipped */
      }
    }
  }
  return out.slice(0, 3);
}

/** Stores what the AI filed: new entries, or a stronger existing one with the same title. Filed items link to each other. */
export function fileMemories(m: Mem, items: AiMemory[], s: Session, t: Tally, now: number): Entry[] {
  const src = {
    kind: 'session' as const,
    label: `Grok Bot (AI), session ${fmtDate(s.ts)}: ${clip(s.q, 40)}`,
    ref: s.id,
  };
  const made: Entry[] = [];
  for (const it of items) {
    const old = m.entries.find(e => e.key.startsWith(AI_KEY) && e.title.toLowerCase() === it.title.toLowerCase());
    const e = upsert(
      m,
      {
        key: old ? old.key : `${AI_KEY}${it.type}:${it.title.toLowerCase()}`,
        type: old ? old.type : it.type,
        title: old ? old.title : it.title,
        note: it.note,
        kws: keywords(it.title + ' ' + it.note).slice(0, 8),
        sources: [src],
      },
      t,
      now,
    );
    if (e) made.push(e);
  }
  for (let i = 0; i < made.length; i++) for (let j = i + 1; j < made.length; j++) link(made[i], made[j]);
  for (const id of s.used || []) for (const e of made) link(e, byId(m, id));
  if (s.project) {
    const projNode = ensureProjectNode(m, s.project, s, now);
    s.projectId = projNode.id;
    for (const e of made) link(e, projNode);
  }
  s.learned = true;
  return made;
}
