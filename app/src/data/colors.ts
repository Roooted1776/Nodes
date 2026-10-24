export const TYPE_COLOR = { concept: '#81b8ff', entity: '#73dfbd', workstream: '#ffbd70' } as const;
export const STAGE_COLOR = {
  waiting: '#9aa4c4',
  working: '#ffffff',
  done: '#8ff0c0',
  failed: '#ff7a7a',
  skipped: '#4a5170',
} as const;
export const AGENT_DOT = '#fff3df';

/** Each bot has its own colour (Owner, Oct 2026). Used for its dot in the brain, its Team node, its chat box, its coverage chip and its handoffs.
 * Chosen to stay apart from each other, from the memory type colours above and from the failed red. */
export const AGENT_COLOR = {
  grokbot: '#ffd84d',
  grok: '#c6ff4d',
  claude: '#e3835b',
  xcode: '#4d7cff',
  gemini: '#a87bff',
  cursor: '#b8c0d0',
  chatgpt: '#19c37d',
  perplexity: '#22c3d6',
  muse: '#ff5fb8',
} as const;
/** Colour for any endpoint of a handoff: a bot, the Owner, or Brain itself. */
export const colorOf = (id: string): string =>
  id in AGENT_COLOR ? AGENT_COLOR[id as keyof typeof AGENT_COLOR] : '#ffffff';
