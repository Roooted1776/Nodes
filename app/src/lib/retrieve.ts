import { TYPE_LABEL, type Entry, type Mem } from './memory';
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
export function contextBlock(list: Entry[]): string {
  if (!list.length) return '';
  return (
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
