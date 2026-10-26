import { TYPE_LABEL, weight, type Entry, type Mem } from './memory';
import { clip, keywords, stem, words } from './text';

/** Saved entries that share words with a new prompt, best first. Only fresh entries. */
export function relevant(m: Mem, prompt: string, k = 6, targetProject?: string): { e: Entry; score: number }[] {
  const matchProj = prompt.match(/^\[([^\]]+)\]/);
  const activeProj = (matchProj ? matchProj[1].trim() : targetProject)?.toLowerCase();
  const q = new Set(keywords(prompt).map(stem));
  if (!q.size) return [];
  const hit = (s: string) =>
    words(s)
      .map(stem)
      .filter(w => q.has(w)).length;
  return m.entries
    .filter(e => e.status === 'fresh')
    .map(e => {
      let score =
        (3 * hit(e.title) + 2 * hit((e.kws || []).join(' ')) + Math.min(3, hit(e.note))) *
        (1 + 0.1 * (e.strength || 1));
      // Give relevance boost if entry belongs to the active or requested project
      if (activeProj && e.project && e.project.toLowerCase() === activeProj && score > 0) {
        score += 2;
      }
      return { e, score };
    })
    .filter(x => x.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
/** Titles of Brain's pages, most linked and cited first: the wiki's index. */
export function indexTitles(m: Mem, max = 60): string[] {
  return m.entries
    .filter(e => e.status === 'fresh')
    .sort((a, b) => weight(b) - weight(a))
    .slice(0, max)
    .map(e => e.title);
}
export function contextBlock(list: Entry[], index: string[] = []): string {
  const idx = index.length ? `BRAIN INDEX (pages Brain holds): ${index.join(' | ')}\n\n` : '';
  if (!list.length) return idx.trim();
  return (
    idx +
    'BRAIN CONTEXT (saved memory from earlier sessions; it may be out of date, so check it):\n' +
    list
      .map(e => {
        const proj = e.project ? `[Project: ${e.project}] ` : '';
        const note = clip(e.note.replace(/\s+/g, ' '), 600);
        return `- ${proj}${TYPE_LABEL[e.type]} · ${e.title}: ${note}`;
      })
      .join('\n')
  );
}
