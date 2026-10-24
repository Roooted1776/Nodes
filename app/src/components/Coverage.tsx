import type { CSSProperties } from 'react';
import { colorOf } from '../data/colors';
import { AGENT, LIVE_ORDER, type AgentId } from '../data/team';
import type { Session } from '../lib/memory';
import { useStore, type StageState } from '../store';

const MARK: Record<StageState, string> = { waiting: '○', working: '◉', done: '✓', failed: '✕', skipped: '–' };
const WORD: Record<StageState, string> = {
  waiting: 'waiting',
  working: 'working',
  done: 'covered',
  failed: 'failed',
  skipped: 'skipped',
};

export interface Cov {
  states: Partial<Record<AgentId, StageState>>;
  notes: Partial<Record<AgentId, string>>;
}
export function fromSession(s: Session): Cov {
  const states: Cov['states'] = {},
    notes: Cov['notes'] = {};
  for (const [k, v] of Object.entries(s.cover || {})) {
    states[k as AgentId] = v.s === 'done' ? 'done' : v.s;
    if (v.why) notes[k as AgentId] = v.why;
  }
  return { states, notes };
}
export function summary(states: Cov['states']) {
  const v = Object.values(states),
    done = v.filter(x => x === 'done').length,
    failed = v.filter(x => x === 'failed').length,
    skipped = v.filter(x => x === 'skipped').length;
  return { done, failed, skipped, inChain: v.length - skipped };
}

/** Which agents covered this task: done, working, failed or skipped, with the reason when one is known. */
export default function Coverage({ cov }: { cov?: Cov }) {
  const stages = useStore(s => s.stages),
    notes = useStore(s => s.notes),
    c: Cov = cov || { states: stages, notes },
    any = Object.keys(c.states).length > 0;
  if (!any) return <div className="cover empty">Task coverage appears here when a task runs.</div>;
  const sm = summary(c.states);
  return (
    <section className="cover" aria-label="Task coverage">
      <div className="cover-head">
        <b>
          {sm.done} of {sm.inChain} covered
        </b>
        {sm.failed > 0 && <span className="bad">{sm.failed} failed</span>}
        {sm.skipped > 0 && <span>{sm.skipped} skipped</span>}
      </div>
      <div className="chips">
        {LIVE_ORDER.map(id => {
          const st = c.states[id];
          if (!st) return null;
          return (
            <span
              key={id}
              className={'chip ' + st}
              title={c.notes[id] || WORD[st]}
              style={{ '--c': colorOf(id) } as CSSProperties}
            >
              <i>{MARK[st]}</i>
              <b className="sw8" aria-hidden="true" />
              {AGENT[id].name}
              {c.notes[id] && st !== 'done' ? <small>{c.notes[id]}</small> : null}
            </span>
          );
        })}
      </div>
    </section>
  );
}
