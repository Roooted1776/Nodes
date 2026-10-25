// Owner's team. Roles come from Owner's chart. Specialties are Owner's assignments, not claims about the products.
export type Kind = 'lead' | 'hub' | 'collab' | 'audit';
export type AgentId = 'grok' | 'grokbot' | 'claude' | 'cursor' | 'gemini' | 'chatgpt' | 'perplexity' | 'xcode' | 'muse';

export interface Agent {
  id: AgentId;
  name: string;
  role: string;
  kind: Kind;
  x: number;
  y: number; // position on the team diagram (0..1)
  specialty: string;
  skills: string[];
  company: string;
  provider?: string;
  /** The free service this bot runs on when there is no key for its own company (Owner wants free bots, Oct 2026). */
  free?: 'groq' | 'google';
}

export const AGENTS: Agent[] = [
  {
    id: 'grokbot',
    name: 'Grok Bot',
    role: 'Team head · final call',
    kind: 'lead',
    x: 0.62,
    y: 0.1,
    specialty: 'Leads the team and makes the final call after the three checks',
    skills: ['sets review order', 'collects findings', 'final pass or fail'],
    company: 'xAI',
    provider: 'xai',
    free: 'groq',
  },
  {
    id: 'grok',
    name: 'Grok',
    role: 'Strategy · challenges',
    kind: 'collab',
    x: 0.3,
    y: 0.1,
    specialty: 'Finds weak assumptions, risks and missed options',
    skills: ['strategy', 'contrarian review', 'risk spotting'],
    company: 'xAI',
    provider: 'xai',
    free: 'groq',
  },
  {
    id: 'claude',
    name: 'Claude',
    role: 'Reasoning · writing · build',
    kind: 'hub',
    x: 0.46,
    y: 0.33,
    specialty: 'Careful reasoning, clear writing and code',
    skills: ['step-by-step plans', 'clear writing', 'building'],
    company: 'Anthropic',
    provider: 'anthropic',
    free: 'google',
  },
  {
    id: 'xcode',
    name: 'Xcode',
    role: 'iOS · device builds',
    kind: 'collab',
    x: 0.8,
    y: 0.33,
    specialty: 'Builds and tests iPhone apps',
    skills: ['iOS builds', 'device testing', 'archives'],
    company: 'Apple',
    free: 'groq',
  },
  {
    id: 'gemini',
    name: 'Gemini',
    role: 'Context · long documents',
    kind: 'collab',
    x: 0.46,
    y: 0.55,
    specialty: 'Reads a lot at once and cross-checks it, including images and long documents',
    skills: ['long documents', 'images', 'cross-checking'],
    company: 'Google',
    provider: 'google',
    free: 'google',
  },
  {
    id: 'cursor',
    name: 'Cursor',
    role: 'Code · repo fit',
    kind: 'collab',
    x: 0.16,
    y: 0.55,
    specialty: 'Edits code in the repo and reviews changes',
    skills: ['editing files', 'merging work', 'code review'],
    company: 'Anysphere',
    free: 'groq',
  },
  {
    id: 'chatgpt',
    name: 'Codex',
    role: 'Tools · synthesis',
    kind: 'collab',
    x: 0.78,
    y: 0.62,
    specialty: 'Uses tools on code, then pulls the findings together',
    skills: ['tool use', 'coding', 'planning', 'synthesis'],
    company: 'OpenAI',
    provider: 'openai',
    free: 'groq',
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    role: 'Sources · citations',
    kind: 'collab',
    x: 0.2,
    y: 0.8,
    specialty: 'Checks sources and citations',
    skills: ['source quality', 'citations', 'fact checking'],
    company: 'Perplexity',
    free: 'groq',
  },
  {
    id: 'muse',
    name: 'Muse',
    role: 'Independent audit',
    kind: 'audit',
    x: 0.5,
    y: 0.88,
    specialty: 'Audits everyone and finds what is wrong',
    skills: ['audits', 'finding bugs', 'honesty checks'],
    company: 'Independent',
    free: 'groq',
  },
];

export const AGENT: Record<AgentId, Agent> = Object.fromEntries(AGENTS.map(a => [a.id, a])) as Record<AgentId, Agent>;
export const isAgent = (id: string): id is AgentId => id in AGENT;

/** Who passes work to whom on the team diagram. */
export const TEAM_EDGES: [AgentId, AgentId][] = [
  ['grokbot', 'claude'],
  ['claude', 'grok'],
  ['claude', 'gemini'],
  ['gemini', 'muse'],
  ['muse', 'chatgpt'],
  ['muse', 'cursor'],
  ['muse', 'perplexity'],
  ['chatgpt', 'grokbot'],
  ['cursor', 'grokbot'],
  ['perplexity', 'chatgpt'],
  ['claude', 'xcode'],
  ['muse', 'claude'],
];

/** The order of a live task: three checks, then the team lead. */
export const LIVE_ORDER: AgentId[] = [
  'gemini',
  'muse',
  'chatgpt',
  'claude',
  'cursor',
  'perplexity',
  'grok',
  'xcode',
  'grokbot',
];
export const IOS_RE = /\b(ios|iphone|ipad|xcode|swift|app store)\b/i;

const STAGE: Record<AgentId, string> = {
  gemini:
    'FIRST CHECK. Read the request and any context. List the concrete requirements, limits and anything unclear that blocks the work.',
  muse: 'SECOND CHECK. Audit the incoming context and handoff on your own. Name gaps, contradictions, risks and missing evidence.',
  chatgpt: 'COLLECTIVE CHECK. Turn the reviewed handoff into a concrete step of attack, ordered plan, and deliverable.',
  claude:
    'BUILDER. Produce the reasoning, writing, design or code proposal as text. Do not claim to have edited files.',
  cursor:
    'INTEGRATION REVIEW. Check the proposal for repo fit, integration risks and missing checks, using only what you were given. Do not claim to have opened files.',
  perplexity:
    'SOURCE CHECK. Judge source quality and what needs a citation, using only supplied material. Do not browse or invent citations; mark unsupported claims.',
  grok: 'STRATEGY REVIEW. Challenge assumptions, name risks and one option the team missed.',
  xcode:
    'PLATFORM CHECK. For an iOS task, give a concrete build and device-test plan. Otherwise say this stage does not apply. Do not claim to run builds.',
  grokbot:
    "TEAM LEAD. Review the whole chain, settle conflicts, list missing or failed stages, and write the final report with a PASS or FAIL recommendation. You can decline based on the team's response. Owner controls repo changes, push and merge.",
};

const TASK: Record<AgentId, string> = {
  gemini: 'Pull out requirements, given context and open questions. Deliver a context check.',
  muse: 'Audit the incoming context and handoff for gaps, risks, contradictions and unsupported claims.',
  chatgpt: 'Deploy the concrete step of attack and ordered plan from the reviewed handoff.',
  claude: 'Write the requested reasoning, writing, design or code proposal.',
  cursor: 'Check repo integration risks using only the material provided.',
  perplexity: 'Check citations and source quality using supplied material only.',
  grok: 'Challenge assumptions and surface risks or alternatives.',
  xcode: 'Give an iOS build and test plan if relevant. Do not claim to run builds.',
  grokbot:
    "Review every handoff. Combine the work, list open issues and missing checks, and give the final team report and recommendation. You can decline based on the team's response.",
};

export function systemPrompt(id: AgentId): string {
  const a = AGENT[id];
  return (
    `You are ${a.name} (${a.company}) (${a.role.toLowerCase()}), one of nine agents on Owner's team. Your specialty: ${a.specialty}. ${STAGE[id]}` +
    ' We are all one team of people and bots. Never hide information out of emotion; complete your task fully and push it across the desk to the next teammate.' +
    " Follow Owner's pipeline: Collect --> Review --> Edit --> Review --> Pass to next --> Review." +
    ' Deploy the concrete step of attack: examine target, review incoming handoff, execute surgical edit, review output, and pass to next worker.' +
    ' LIVE CHAT RULE: The live chat is for passes, common interactions, and team chatter. DO NOT OUTPUT CODE BLOCKS (never use ``` or raw code dumps). Describe any logic or edits in plain conversational words.' +
    ' You have no tools or repo access here: never claim to read files, make changes, browse or run tests. State blockers and uncertainty. Do not invent sources, results, keys or passwords.'
  );
}

export function stagePrompt(
  id: AgentId,
  task: string,
  incomingFrom: string,
  incoming: string,
  next: AgentId | null,
  brainContext: string,
): string {
  const handTo = next
    ? AGENT[next].name.toUpperCase()
    : id === 'grokbot'
      ? 'OWNER (FINAL SITUATION REPORT)'
      : 'GROK BOT';
  return (
    `OWNER TASK:\n${task}\n\n` +
    (brainContext ? `${brainContext}\n\n` : '') +
    `INCOMING HANDOFF FROM ${incomingFrom.toUpperCase()} (COLLECT & REVIEW FIRST):\n${incoming}\n\n` +
    `YOUR ASSIGNED WORK:\n${TASK[id]}\n\n` +
    'ONE TEAM PRINCIPLE: We are all one team of people and bots. Never hide information out of emotion. Complete your task and push across the desk to the next person.\n' +
    'OPERATING PIPELINE: Collect --> Review --> Edit --> Review --> Pass to next --> Review.\n' +
    'STEP OF ATTACK DEPLOYED: Target Recon -> Threat Audit -> Tactical Plan -> Surgical Strike -> Verification.\n' +
    'CRITICAL FORMAT RULE: NO CODE BLOCKS. Never output markdown code fences (```). The live chat is for common interactions, team chatter, and passes between teammates. Explain your work and plans in natural conversational words.\n' +
    `Reply with common teammate interactions and conversational chatter: acknowledge what ${incomingFrom} passed, state your work concisely in natural words, and pass to ${handTo}. Text only, no code blocks.`
  );
}
