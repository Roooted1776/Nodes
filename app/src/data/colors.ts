export const TYPE_COLOR = { concept: '#93c5fd', entity: '#5eead4', workstream: '#fdba74' } as const;
export const STAGE_COLOR = {
  waiting: '#71717a',
  working: '#fafafa',
  done: '#4ade80',
  failed: '#f87171',
  skipped: '#3f3f46',
} as const;
export const AGENT_DOT = '#fff3df';

/** Each bot has its own colour (Owner, Oct 2026). Used for its dot in the brain, its Team node, its chat box, its coverage chip and its handoffs.
 * Chosen to stay apart from each other, from the memory type colours above and from the failed red. */
export const AGENT_COLOR = {
  grokbot: '#fbbf24',
  grok: '#a3e635',
  claude: '#f0916a',
  xcode: '#60a5fa',
  gemini: '#a78bfa',
  cursor: '#94a3b8',
  chatgpt: '#34d399',
  perplexity: '#22d3ee',
  muse: '#f472b6',
} as const;
/** Colour for any endpoint of a handoff: a bot, the Owner, or Brain itself. */
export const colorOf = (id: string): string =>
  id in AGENT_COLOR ? AGENT_COLOR[id as keyof typeof AGENT_COLOR] : '#ffffff';
