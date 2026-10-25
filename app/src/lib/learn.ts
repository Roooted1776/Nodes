import { DAY, clip, fmtDate, keywords } from './text';
import {
  STALE_DAYS,
  MAX_ENTRIES,
  byId,
  byKey,
  link,
  mkEntry,
  type Entry,
  type EntryType,
  type Mem,
  type Source,
} from './memory';
import { redact } from './redact';

export interface Tally {
  fresh: number;
  reinforced: number;
  updated: number;
  stale: number;
  blocked: number;
  touched: Set<string>;
  changed: string[];
}
export const tally = (): Tally => ({
  fresh: 0,
  reinforced: 0,
  updated: 0,
  stale: 0,
  blocked: 0,
  touched: new Set(),
  changed: [],
});

function addSource(e: Entry, s: Source) {
  if (e.sources.some(x => x.kind === s.kind && x.label === s.label && x.ref === (s.ref || null))) return;
  e.sources.push({ kind: s.kind, label: s.label, ref: s.ref || null });
  if (e.sources.length > 6) e.sources.shift();
}
function mergeNote(fresh: string, old: string) {
  const lines = [...new Set([...fresh.split('\n'), ...old.split('\n')].map(l => l.trim()).filter(Boolean))];
  return clip(lines.join('\n'), 600);
}

interface Spec {
  key: string;
  type: EntryType;
  title: string;
  note: string;
  sources: Source[];
  kws?: string[];
}
/** Write or refresh one entry. A key Owner deleted is never learned again. */
export function upsert(m: Mem, spec: Spec, t: Tally, now: number): Entry | null {
  if (m.blocked.includes(spec.key)) {
    t.blocked++;
    return null;
  }
  let e = byKey(m, spec.key);
  if (e && t.touched.has(e.id)) {
    spec.sources.forEach(s => addSource(e!, s));
    return e;
  }
  if (!e) {
    if (m.entries.length >= MAX_ENTRIES) {
      t.blocked++;
      return null;
    }
    e = mkEntry(m, spec, now);
    m.entries.push(e);
    t.fresh++;
  } else {
    const wasStale = e.status === 'stale';
    e.strength = Math.min(9, e.strength + 1);
    e.seen = now;
    e.status = 'fresh';
    spec.sources.forEach(s => addSource(e!, s));
    if (spec.kws) e.kws = [...new Set([...(spec.kws || []), ...(e.kws || [])])].slice(0, 12);
    const merged = e.corrected ? e.note : mergeNote(spec.note, e.note);
    if (merged !== e.note) {
      e.note = merged;
      t.updated++;
    } else if (wasStale) t.updated++;
    else t.reinforced++;
  }
  t.touched.add(e.id);
  t.changed.push(e.id);
  return e;
}

/** Mark entries not seen for STALE_DAYS as stale. Uses the real clock. */
export function maintain(m: Mem, t: Tally, now: number) {
  const cutoff = now - STALE_DAYS * DAY;
  for (const e of m.entries)
    if (e.status === 'fresh' && e.seen < cutoff) {
      e.status = 'stale';
      t.stale++;
      t.changed.push(e.id);
    }
}

export function addNote(m: Mem, o: { type: EntryType; title: string; note: string }, now: number): Entry | null {
  const title = redact(o.title.trim()).text.slice(0, 80),
    note = redact(o.note.trim()).text.slice(0, 600);
  if (!title) return null;
  const key = `note:${o.type}:${title.toLowerCase()}`;
  if (byKey(m, key) || m.entries.length >= MAX_ENTRIES) return null;
  const e = mkEntry(
    m,
    {
      key,
      type: o.type,
      title,
      note,
      manual: true,
      kws: keywords(title + ' ' + note).slice(0, 8),
      sources: [{ kind: 'file', label: 'Your note, ' + fmtDate(now), ref: null }],
    },
    now,
  );
  m.entries.push(e);
  m.inbox.push({ kind: 'file', ref: e.id });
  for (const other of m.entries)
    if (other !== e && other.kws && e.kws && other.kws.filter(k => e.kws!.includes(k)).length >= 2) link(e, other);
  return e;
}
export function correctEntry(m: Mem, id: string, fix: { title?: string; note: string }, now: number) {
  const e = byId(m, id);
  if (!e) return;
  if (fix.title?.trim()) e.title = redact(fix.title.trim()).text.slice(0, 80);
  e.note = redact(fix.note).text.slice(0, 600);
  e.corrected = true;
  e.seen = now;
  e.status = 'fresh';
  e.sources.push({ kind: 'correction', label: 'Your correction, ' + fmtDate(now), ref: null });
  if (e.sources.length > 6) e.sources.shift();
  m.inbox.push({ kind: 'correction', ref: e.id });
}
/** Delete an entry. Its key is blocked so Brain does not learn it again. */
export function deleteEntry(m: Mem, id: string) {
  const e = byId(m, id);
  if (!e) return;
  if (!m.blocked.includes(e.key)) m.blocked.push(e.key);
  m.entries = m.entries.filter(x => x.id !== id);
  for (const x of m.entries) x.links = x.links.filter(l => l !== id);
  for (const s of m.sessions) if (s.used) s.used = s.used.filter(u => u !== id);
}
