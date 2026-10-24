import { useEffect, useRef, type CSSProperties } from 'react';
import { pulseMs, type Pulse } from '../store';
import { colorOf } from '../data/colors';
import { AGENT, isAgent } from '../data/team';
import { fmtDate } from '../lib/text';
import { useStore } from '../store';
import Composer from './Composer';
import Coverage, { fromSession } from './Coverage';
import KeyGuide from './KeyGuide';
import Tasks, { FlowBox } from './Tasks';

const tagParts = (t: string) => (/^live · /.test(t) ? t.replace(/^live · /, '').replace(' · unverified', '') : '');

export default function ChatPanel() {
  const log = useStore(s => s.log),
    busy = useStore(s => s.busy),
    role = useStore(s => s.role),
    status = useStore(s => s.status),
    viewing = useStore(s => s.viewing),
    viewSession = useStore(s => s.viewSession);
  const ready = useStore(s => !!s.keys[s.live.provider]),
    end = useRef<HTMLDivElement>(null),
    draft = useStore(s => s.draft),
    flow = useStore(s => s.flow),
    timing = useStore(s => s.timing);
  // biome-ignore lint/correctness/useExhaustiveDependencies: these values only trigger the scroll; the effect does not read them
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end' });
  }, [log.length, viewing, draft?.from]);
  // the chat shows only what the AI team wrote; Brain's own notes live in the status line
  const msgs = (
    viewing ? viewing.msgs.map((m, i) => ({ ...m, id: i, cls: undefined as 'warn' | undefined })) : log
  ).filter(m => m.from !== 'brain');
  return (
    <section className="panel chat" aria-label="Live chat">
      {!viewing && !ready && <KeyGuide />}
      <div className="live-line" role="status" aria-live="polite">
        <i className={'pulse' + (busy ? ' on' : '')} />
        <span>
          {viewing
            ? `Saved session · ${fmtDate(viewing.ts)}`
            : busy
              ? status
              : role === 'viewer'
                ? 'Watching live. Nothing is running now.'
                : status}
        </span>
        {viewing && (
          <button type="button" className="link" onClick={() => viewSession(null)}>
            Back to live
          </button>
        )}
      </div>
      {!viewing && <Handoff />}
      <Tasks />
      <Coverage cov={viewing ? fromSession(viewing) : undefined} />
      <div className="msgs" aria-live="off">
        {msgs.length === 0 && (
          <p className="empty">
            {role === 'viewer'
              ? 'When an admin starts a task, the team chat shows up here as it happens.'
              : ready
                ? 'Send a task below, or pick an example. Each bot reviews the last handoff, does its part and passes it on.'
                : 'Connect a key above, then send a task.'}
          </p>
        )}
        {msgs.map(m => {
          const a = isAgent(m.from) ? AGENT[m.from] : null,
            who = a ? a.name : m.from === 'owner' ? 'Owner' : 'Brain',
            t = tagParts(m.tag);
          return (
            <article
              key={m.id}
              className={`msg ${a ? 'bot ' + a.kind : m.from}${m.cls === 'warn' ? ' warn' : ''}`}
              style={a ? ({ '--g1': colorOf(a.id), '--c': colorOf(a.id) } as CSSProperties) : undefined}
            >
              <header>
                <b>{who}</b>
                {a && <span>{a.role}</span>}
                {t && <em>{t}</em>}
              </header>
              <p>{m.text}</p>
            </article>
          );
        })}
        {!viewing && draft && isAgent(draft.from) && (
          <article
            className={'msg bot streaming ' + AGENT[draft.from].kind}
            style={{ '--g1': colorOf(draft.from), '--c': colorOf(draft.from) } as CSSProperties}
            aria-busy="true"
          >
            <header>
              <b>{AGENT[draft.from].name}</b>
              <span>{AGENT[draft.from].role}</span>
              <em>streaming · {draft.text.trim().split(/\s+/).filter(Boolean).length} words</em>
            </header>
            <p>
              {draft.text}
              <i className="caret" aria-hidden="true" />
            </p>
          </article>
        )}
        {viewing ? (
          <FlowBox flow={viewing.flow} ms={viewing.ms} />
        ) : (
          !busy && flow.length > 0 && <FlowBox flow={flow} ms={timing} />
        )}
        <div ref={end} />
      </div>
      {role === 'admin' ? (
        <Composer />
      ) : (
        <p className="ro">You are signed in as a viewer. Only admins can send tasks or change memory.</p>
      )}
    </section>
  );
}

const nameOf = (id: string) =>
  id.startsWith('mem:') ? 'Memory' : isAgent(id) ? AGENT[id].name : id === 'owner' ? 'Owner' : 'Brain';
/** The handoff in flight: a light moves from the sender to the receiver in the same time as the 3D view. */
function Handoff() {
  const p: Pulse | undefined = useStore(s => s.pulses.filter(x => !x.from.startsWith('mem:')).at(-1));
  if (!p) return null;
  return (
    <div
      className="transit"
      key={p.id}
      style={{ '--c': colorOf(p.to), '--c0': colorOf(p.from), '--d': pulseMs(p) + 'ms' } as CSSProperties}
      role="status"
    >
      <b>{nameOf(p.from)}</b>
      <span className="track" aria-hidden="true">
        <i />
      </span>
      <b>{nameOf(p.to)}</b>
      {p.words ? <small className="tag">{p.words} words</small> : null}
      <span className="sr">
        Handoff from {nameOf(p.from)} to {nameOf(p.to)}
      </span>
    </div>
  );
}
