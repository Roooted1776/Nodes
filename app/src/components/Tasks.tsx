import { useState, type CSSProperties } from 'react';
import { colorOf } from '../data/colors';
import { AGENT, LIVE_ORDER, isAgent, type AgentId } from '../data/team';
import type { Flow, Mem, Session } from '../lib/memory';
import { fmtDate } from '../lib/text';
import { useMem, useStore, type StageState } from '../store';
import { summary } from './Coverage';

const SHOW = 5;
type Card = {
  id: string | null;
  q: string;
  project: string;
  projectId?: string;
  nodeTitle?: string;
  ts: number;
  states: Partial<Record<AgentId, StageState>>;
  line: string;
  tone: 'run' | 'ok' | 'bad' | 'stop';
  pill: string;
  grokFinalReview?: string;
};

const wordsPassed = (f?: Flow[]) => (f || []).reduce((n, x) => n + x[2], 0);
function fromSession(s: Session, mem?: Mem): Card {
  const project = s.project || 'Brain';
  const projectId = s.projectId;
  const node = projectId && mem ? mem.entries.find(e => e.id === projectId) : undefined;
  const nodeTitle = node?.title;
  const states: Card['states'] = {};
  for (const [k, v] of Object.entries(s.cover || {})) if (isAgent(k)) states[k] = v.s;
  const sm = summary(states),
    ios = states.xcode && states.xcode !== 'skipped';
  const failed = Object.entries(s.cover || {}).find(([, v]) => v.s === 'failed'),
    who = failed ? (isAgent(failed[0]) ? AGENT[failed[0]].name : failed[0]) : '',
    fail = failed?.[1].why
      ? `${who} did not finish: ${failed[1].why}`
      : s.msgs.find(m => m.from === 'brain' && /did not finish/.test(m.text))?.text;
  const notReached = Object.values(s.cover || {}).filter(v => v.why && /^Not reached/.test(v.why)).length;
  const w = wordsPassed(s.flow);
  if (sm.failed)
    return {
      id: s.id,
      q: s.q,
      project,
      projectId,
      nodeTitle,
      ts: s.ts,
      states,
      tone: 'bad',
      pill: `${sm.done} of ${sm.inChain} · ${sm.failed} failed`,
      line: fail ? fail.slice(0, 110) : `${sm.failed} bot did not finish.`,
    };
  if (notReached)
    return {
      id: s.id,
      q: s.q,
      project,
      projectId,
      nodeTitle,
      ts: s.ts,
      states,
      tone: 'stop',
      pill: `Stopped · ${sm.done} of ${sm.inChain + notReached}`,
      line: `Not reached: ${notReached} bot${notReached > 1 ? 's' : ''}.`,
    };
  return {
    id: s.id,
    q: s.q,
    project,
    projectId,
    nodeTitle,
    ts: s.ts,
    states,
    tone: 'ok',
    pill: `${sm.done} of ${sm.inChain}${ios ? ' · iOS' : ''}`,
    line: `Saved · ${s.msgs.length} messages${w ? ` · ${w} words passed` : ''}`,
    grokFinalReview: s.grokFinalReview,
  };
}

/** The current task and the saved ones, newest first. Everything here comes from real sessions on this device. */
export default function Tasks() {
  const mem = useMem(),
    busy = useStore(s => s.busy),
    task = useStore(s => s.task),
    stages = useStore(s => s.stages),
    flow = useStore(s => s.flow),
    used = useStore(s => s.used);
  const viewing = useStore(s => s.viewing),
    viewSession = useStore(s => s.viewSession),
    [all, setAll] = useState(false),
    [taskSearch, setTaskSearch] = useState(''),
    [nodeFilter, setNodeFilter] = useState<string | null>(null);
  const saved = [...mem.sessions].reverse().map(s => fromSession(s, mem));
  const cur: Card[] = busy
    ? [
        {
          id: null,
          q: task,
          project: useStore.getState().activeProject || 'Brain',
          nodeTitle: undefined,
          ts: Date.now(),
          states: stages,
          tone: 'run',
          pill: 'Running',
          line: [
            used.length ? `${used.length} saved memor${used.length > 1 ? 'ies' : 'y'} sent as context` : '',
            `${flow.filter(f => isAgent(f[0]) || f[0] === 'owner').length} handoffs so far`,
          ]
            .filter(Boolean)
            .join(' · '),
        },
      ]
    : [];
  const cards = [...cur, ...saved];
  const nodeFiltered = nodeFilter
    ? cards.filter(
        c =>
          (c.nodeTitle && c.nodeTitle.toLowerCase() === nodeFilter.toLowerCase()) ||
          (c.projectId && c.projectId === nodeFilter),
      )
    : cards;
  const filtered = taskSearch.trim()
    ? nodeFiltered.filter(
        c =>
          c.q.toLowerCase().includes(taskSearch.toLowerCase()) ||
          c.line.toLowerCase().includes(taskSearch.toLowerCase()) ||
          c.project.toLowerCase().includes(taskSearch.toLowerCase()) ||
          (c.nodeTitle && c.nodeTitle.toLowerCase().includes(taskSearch.toLowerCase())),
      )
    : nodeFiltered;
  const shown = all ? filtered : filtered.slice(0, SHOW);
  if (!cards.length) return null;
  return (
    <section className="tasks" aria-label="Tasks">
      <div className="tasks-header">
        <p className="group">
          Tasks · {mem.sessions.length + cur.length}
          <small>one task per page load</small>
        </p>
        {cards.length > 3 && (
          <input
            className="search task-search"
            placeholder="Search work…"
            value={taskSearch}
            onChange={e => setTaskSearch(e.target.value)}
            aria-label="Search tasks"
          />
        )}
      </div>
      {nodeFilter && (
        <div
          className="task-filter-pill"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '3px 8px',
            margin: '2px 0 6px',
            fontSize: '12px',
            background: 'var(--tile-bg, rgba(255,255,255,0.05))',
            border: '1px solid var(--tile-border, #333)',
            borderRadius: '4px',
          }}
        >
          <span>
            Node: <strong>{nodeFilter}</strong>
          </span>
          <button
            type="button"
            className="link"
            style={{ fontSize: '11px', cursor: 'pointer', padding: '0 2px' }}
            onClick={() => setNodeFilter(null)}
          >
            ✕ Clear
          </button>
        </div>
      )}
      {shown.map(c => (
        <button
          type="button"
          key={c.id || 'now'}
          className={'task ' + c.tone + (viewing && viewing.id === c.id ? ' on' : '')}
          onClick={() => {
            if (c.projectId) {
              useStore.setState(st => ({
                sceneFocus: { kind: 'memory', id: c.projectId!, sequence: (st.sceneFocus?.sequence || 0) + 1 },
                selected: c.projectId!,
              }));
            }
            c.id && viewSession(viewing?.id === c.id ? null : c.id);
          }}
          disabled={!c.id}
          aria-label={'Task: ' + c.q}
        >
          <span className="tq">
            <strong className="tproj" title={`Project: ${c.project}${c.nodeTitle ? ` · Node: ${c.nodeTitle}` : ''}`}>
              [{c.project}
              {c.nodeTitle && c.nodeTitle.toLowerCase() !== c.project.toLowerCase() ? (
                <button
                  type="button"
                  className="tnode-badge"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'inherit',
                    padding: 0,
                    font: 'inherit',
                    textDecoration: 'underline',
                    cursor: 'pointer',
                  }}
                  title={`Click to filter tasks by node "${c.nodeTitle}"`}
                  onClick={e => {
                    e.stopPropagation();
                    setNodeFilter(f => (f === c.nodeTitle ? null : c.nodeTitle!));
                  }}
                >
                  {' / ' + c.nodeTitle}
                </button>
              ) : (
                ''
              )}
              ]
            </strong>
            {c.q}
          </span>
          <time>{c.id ? fmtDate(c.ts) : 'now'}</time>
          <span className="tdots" aria-hidden="true">
            {LIVE_ORDER.map(id => (
              <i
                key={id}
                className={c.states[id] || 'waiting'}
                style={{ '--c': colorOf(id) } as CSSProperties}
                title={AGENT[id].name + ': ' + (c.states[id] || 'waiting')}
              />
            ))}
          </span>
          <span className={'pill ' + c.tone}>{c.pill}</span>
          <small className="tl">{c.line}</small>
        </button>
      ))}
      {cards.length > SHOW && (
        <button type="button" className="link" onClick={() => setAll(v => !v)}>
          {all ? 'Show fewer' : `Show all ${cards.length}`}
        </button>
      )}
    </section>
  );
}

const nm = (id: string) =>
  isAgent(id) ? AGENT[id].name : id === 'owner' ? 'Owner' : id === 'memory' ? 'Memory' : 'Brain';
/** What passed between whom in one task, with each bot's real reply time. */
export function FlowBox({ flow, ms }: { flow?: Flow[]; ms?: Partial<Record<string, number>> }) {
  if (!flow?.length) return null;
  const pairs = new Map<string, Flow>();
  for (const [a, b, w] of flow) {
    const k = a + '>' + b,
      p = pairs.get(k);
    pairs.set(k, p ? [a, b, p[2] + w] : [a, b, w]);
  }
  const rows = [...pairs.values()],
    max = Math.max(1, ...rows.map(r => r[2]));
  const times = LIVE_ORDER.filter(id => ms?.[id]);
  return (
    <section className="card2 flowbox" aria-label="Task flow">
      <h3>Flow</h3>
      <p className="hint2">Words really passed between bots in this task.</p>
      <ul>
        {rows.map(([a, b, w]) => (
          <li key={a + b}>
            <span className="fn">
              {nm(a)} → {nm(b)}
            </span>
            <span className="fb">
              <i
                style={{
                  width: Math.max(3, (w / max) * 100) + '%',
                  background: `linear-gradient(90deg, ${colorOf(a)}, ${colorOf(b)})`,
                }}
              />
            </span>
            <span className="fw">{w}</span>
          </li>
        ))}
      </ul>
      {times.length > 0 && (
        <div className="ftimes">
          {times.map(id => (
            <span key={id} style={{ '--c': colorOf(id) } as CSSProperties}>
              <b className="sw8" />
              {AGENT[id].name} {(ms![id]! / 1000).toFixed(1)} s
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
