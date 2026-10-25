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
  },
  {
    id: 'gemini',
    name: 'Gemini',
    role: 'Context · multi-file code',
    kind: 'collab',
    x: 0.46,
    y: 0.55,
    specialty: 'Ingests vast context, whole codebases, multi-file architectures, and writes robust code',
    skills: ['code architecture', 'repo ingestion', 'cross-checking', 'code analysis'],
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
  },
  {
    id: 'chatgpt',
    name: 'Codex',
    role: 'Code engine · tools · synthesis',
    kind: 'collab',
    x: 0.78,
    y: 0.62,
    specialty: 'Deep code synthesis, precision implementations, refactoring, and technical tool work',
    skills: ['code synthesis', 'refactoring', 'algorithms', 'tool use'],
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
    'FIRST CHECK. Ingest the request, full codebase context, and requirements. Outline the architectural code approach and highlight any blocks.',
  muse: 'SECOND CHECK. Audit the incoming context and handoff on your own. Name gaps, contradictions, risks and missing evidence. Do not write code; leave code creation to the coding engines and focus purely on finding bugs and flaws.',
  chatgpt:
    'CODE & PLAN ENGINE. Turn the reviewed handoff into a concrete, ordered technical plan and production-grade code deliverable.',
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
    'TEAM LEAD. Review the whole chain, settle conflicts, list missing or failed stages, and write the final report with a PASS or FAIL recommendation. Owner controls repo changes, push and merge.',
};

const TASK: Record<AgentId, string> = {
  gemini: 'Ingest codebase context, identify requirements, edge cases, and architectural code approach.',
  muse: 'Audit the incoming context and handoff for gaps, risks, contradictions and flaws. Do not generate code.',
  chatgpt: 'Write an actionable plan and production-grade code deliverable from the reviewed handoff.',
  claude: 'Write the requested reasoning, writing, design or code proposal.',
  cursor: 'Check repo integration risks using only the material provided.',
  perplexity: 'Check citations and source quality using supplied material only.',
  grok: 'Challenge assumptions and surface risks or alternatives.',
  xcode: 'Give an iOS build and test plan if relevant. Do not claim to run builds.',
  grokbot:
    'Review every handoff. Combine the work, list open issues and missing checks, and give the final team report and recommendation.',
};

export function systemPrompt(id: AgentId): string {
  const a = AGENT[id];
  return (
    `You are ${a.name} (${a.role.toLowerCase()}), one of nine agents on Owner's team. Your specialty: ${a.specialty}. ${STAGE[id]}` +
    ' First review the incoming handoff before your own work. Do only your assigned task, as text, and end with a clear handoff for the next agent.' +
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
    `INCOMING HANDOFF FROM ${incomingFrom.toUpperCase()} (REVIEW THIS FIRST):\n${incoming}\n\n` +
    `YOUR ASSIGNED WORK:\n${TASK[id]}\n\n` +
    `Reply with these labeled sections: REVIEW OF INCOMING HANDOFF; YOUR WORK; HANDOFF TO ${handTo}; OPEN BLOCKERS. Be specific and short. Text only.`
  );
}
