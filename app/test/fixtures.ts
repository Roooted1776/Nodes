import type { Session } from '../src/lib/memory';
export const TAG = 'live · OpenAI · gpt-4o-mini · unverified';
export function session(id = 's1', ts = Date.UTC(2026, 9, 20)): Session {
  return {
    id,
    ts,
    kws: [],
    accepted: [],
    uncovered: [],
    used: [],
    q: 'Rebuild the Brain page in TypeScript with React and keep the memory graph in index.html.',
    msgs: [
      {
        from: 'owner',
        text: 'Rebuild the Brain page in TypeScript with React and keep the memory graph in index.html.',
        tag: 'prompt',
      },
      {
        from: 'gemini',
        tag: TAG,
        text: 'REVIEW OF INCOMING HANDOFF: Owner wants TypeScript and React. YOUR WORK: The memory graph must keep working. The build must still produce one index.html file. HANDOFF TO MUSE: check the memory graph storage.',
      },
      {
        from: 'muse',
        tag: TAG,
        text: 'REVIEW OF INCOMING HANDOFF: Gemini listed the needs. YOUR WORK: Risk: the memory graph storage key must stay the same or saved memory is lost. React state must not send keys anywhere. OPEN BLOCKERS: none.',
      },
      {
        from: 'claude',
        tag: TAG,
        text: 'YOUR WORK: Use Vite with React and TypeScript. The memory graph lives in a store. A single file build writes index.html for double-click use.',
      },
      {
        from: 'grok',
        tag: '',
        text: 'This untagged line is not a live reply and must be ignored: Zebra Unicorn Platform.',
      },
      {
        from: 'grokbot',
        tag: TAG,
        text: 'FINAL SITUATION REPORT: PASS. TypeScript and React plan is sound; keep the memory graph storage key.',
      },
    ],
  };
}
