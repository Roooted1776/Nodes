// Search: one real AI call that answers like Perplexity, with web search on where the provider has it, plus the
// memory pages that match. The question and answer are saved as a session, so Dream learns from them later.
import { type Mem } from './memory';
import { contextBlock, indexTitles, relevant } from './retrieve';

export const SEARCH_SYSTEM =
  "You are Perplexity, the search specialist on Owner's AI team, answering a direct search from Owner. " +
  'Answer the question directly first, then add the key details. Be clear and plain; no code blocks. ' +
  'Search the web when current facts matter, and end with a short "Sources:" list of the links you used. ' +
  'Use the BRAIN CONTEXT when it helps and say when you do; it may be out of date. ' +
  'Never invent a link, a source or a result. If you cannot find it, say so.';
export const SEARCH_NO_WEB =
  ' You cannot browse with this provider: answer from what you know and say that you could not check the web.';

/** The memory pages that match a search, best first. */
export const searchMemory = (m: Mem, q: string, k = 5) => relevant(m, q, k).map(h => h.e);

export function searchPrompt(m: Mem, q: string): string {
  const hits = m.settings.useMemory === false ? [] : searchMemory(m, q, 6);
  const ctx = contextBlock(hits, indexTitles(m, 40));
  return `${ctx ? ctx + '\n\n' : ''}SEARCH: ${q}`;
}

const URL_RE = /https?:\/\/[^\s<>()"']+[^\s<>()"'.,;:!?]/g;
/** Splits text into plain parts and links, so the chat can make the links clickable. */
export function splitLinks(text: string): { t: string; href?: string }[] {
  const out: { t: string; href?: string }[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    if (m.index! > last) out.push({ t: text.slice(last, m.index) });
    out.push({ t: m[0], href: m[0] });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ t: text.slice(last) });
  return out;
}
