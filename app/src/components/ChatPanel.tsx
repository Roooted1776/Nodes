import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { pulseMs, type Pulse } from '../store';
import { colorOf } from '../data/colors';
import { AGENT, isAgent, type AgentId } from '../data/team';
import { useStore } from '../store';
import BotIcon from './BotIcon';
import Composer from './Composer';

/** A bot's name in its node colour; red while it is out of tokens. Click to see its profile. */
function BotName({ id, limited, onOpen }: { id: AgentId; limited: AgentId[]; onOpen(id: AgentId): void }) {
  const out = limited.includes(id);
  return (
    <button
      type="button"
      className={'link bot-name-btn' + (out ? ' limited' : '')}
      onClick={() => onOpen(id)}
      title={out ? `${AGENT[id].name} hit its token limit` : AGENT[id].name}
    >
      <b>{AGENT[id].name}</b>
    </button>
  );
}

export default function ChatPanel() {
  const log = useStore(s => s.log),
    busy = useStore(s => s.busy),
    role = useStore(s => s.role),
    viewing = useStore(s => s.viewing),
    stages = useStore(s => s.stages),
    notes = useStore(s => s.notes),
    limited = useStore(s => s.limited);
  const inspectBot = useStore(s => s.inspectBot);
  const end = useRef<HTMLDivElement>(null),
    msgsRef = useRef<HTMLDivElement>(null),
    [autoScroll, setAutoScroll] = useState(true),
    draft = useStore(s => s.draft),
    flow = useStore(s => s.flow);

  const scrollToBottom = () => {
    const el = msgsRef.current;
    if (typeof el?.scrollTo === 'function') {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    } else if (el) {
      el.scrollTop = el.scrollHeight;
    }
    end.current?.scrollIntoView?.({ block: 'end' });
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: these values trigger the scroll into view
  useEffect(() => {
    if (!autoScroll) return;
    scrollToBottom();
  }, [log.length, viewing, draft?.text, draft?.from, flow.length, stages, autoScroll]);

  const onScroll = () => {
    const el = msgsRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    if (isNearBottom !== autoScroll) {
      setAutoScroll(isNearBottom);
    }
  };

  // the chat shows only what the AI team wrote, plus who is doing what right now
  const msgs = (
    viewing ? viewing.msgs.map((m, i) => ({ ...m, id: i, cls: undefined as 'warn' | undefined })) : log
  ).filter(m => m.from !== 'brain');
  const doing = viewing
    ? []
    : (Object.entries(stages) as [AgentId, string][]).filter(([id, v]) => v === 'working' && id !== draft?.from);
  const stuck = viewing ? [] : (Object.entries(stages) as [AgentId, string][]).filter(([, v]) => v === 'failed');
  return (
    <section className="panel chat grok" aria-label="Live chat">
      {!viewing && <Handoff />}
      <div className="msgs" ref={msgsRef} onScroll={onScroll} aria-live="off">
        {msgs.map(m => {
          const a = isAgent(m.from) ? AGENT[m.from] : null;
          return (
            <article
              key={m.id}
              tabIndex={-1}
              data-scene-entry={a ? `agent:${a.id}` : undefined}
              className={`msg ${a ? 'bot ' + a.kind : m.from}${m.cls === 'warn' ? ' warn' : ''}`}
              style={a ? ({ '--c': colorOf(a.id) } as CSSProperties) : undefined}
            >
              <header>
                {a ? <BotIcon id={a.id} /> : null}
                {a ? (
                  <BotName limited={limited} onOpen={inspectBot} id={a.id} />
                ) : (
                  <b>{m.from === 'owner' ? 'You' : 'Brain'}</b>
                )}
                {a && <span className="doing">{a.role}</span>}
              </header>
              <p>{m.text}</p>
            </article>
          );
        })}
        {doing.map(([id]) => (
          <div key={'doing-' + id} className="activity" style={{ '--c': colorOf(id) } as CSSProperties}>
            <BotIcon id={id} size={16} />
            <BotName limited={limited} onOpen={inspectBot} id={id} />
            <span className="doing">{AGENT[id].role.toLowerCase()}…</span>
          </div>
        ))}
        {stuck.map(([id]) => (
          <div key={'stuck-' + id} className="activity failed" style={{ '--c': colorOf(id) } as CSSProperties}>
            <BotIcon id={id} size={16} />
            <BotName limited={limited} onOpen={inspectBot} id={id} />
            <span className="doing">{notes[id] || 'did not finish'}</span>
          </div>
        ))}
        {!viewing && draft && isAgent(draft.from) && (
          <article
            className={'msg bot streaming ' + AGENT[draft.from].kind}
            style={{ '--c': colorOf(draft.from) } as CSSProperties}
            aria-busy="true"
          >
            <header>
              <BotIcon id={draft.from} />
              <BotName limited={limited} onOpen={inspectBot} id={draft.from} />
              <span className="doing">{AGENT[draft.from].role}</span>
            </header>
            <p>
              {draft.text}
              <i className="caret" aria-hidden="true" />
            </p>
          </article>
        )}
        {!autoScroll && (
          <button
            type="button"
            className="scroll-bottom-pill"
            aria-label="Scroll to the newest message"
            onClick={() => {
              setAutoScroll(true);
              scrollToBottom();
            }}
          >
            ↓
          </button>
        )}
        <div ref={end} />
      </div>
      {role === 'admin' && !viewing && <Composer />}
      {busy ? <span className="sr">The team is working.</span> : null}
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
