import { TYPE_LABEL, type Entry, type Mem } from './memory';
import { clip, keywords, stem, words } from './text';

/** Saved entries that share words with a new prompt, best first. Only fresh entries. */
export function relevant(m: Mem, prompt: string, k = 6): { e: Entry; score: number }[] {
  const q = new Set(keywords(prompt).map(stem));
  if (!q.size) return [];
  const hit = (s: string) =>
    words(s)
      .map(stem)
      .filter(w => q.has(w)).length;
  return m.entries
    .filter(e => e.status === 'fresh')
    .map(e => {
      const score =
        (3 * hit(e.title) + 2 * hit((e.kws || []).join(' ')) + Math.min(3, hit(e.note))) * (1 + 0.1 * e.strength);
      return { e, score };
    })
    .filter(x => x.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
export function contextBlock(list: Entry[]): string {
  if (!list.length) return '';
  return (
    'BRAIN CONTEXT (saved memory from earlier sessions; it may be out of date, so check it):\n' +
    list.map(e => `- ${TYPE_LABEL[e.type]} · ${e.title}: ${clip(e.note.replace(/\s+/g, ' '), 180)}`).join('\n')
  );
}
