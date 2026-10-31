import { splitLinks } from '../lib/search';
import { Fragment, useEffect, useRef, useState, type CSSProperties } from 'react';
import { pulseMs, type Pulse } from '../store';
import { colorOf } from '../data/colors';
import { AGENT, isAgent, type AgentId } from '../data/team';
import { useStore } from '../store';
import { PROV } from '../lib/providers';
import { isLegacyApprovalPhrase } from '../lib/approval';
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

const nameOf = (id: string) =>
  id.startsWith('mem:') ? 'Memory' : isAgent(id) ? AGENT[id].name : id === 'owner' ? 'You' : 'Brain';

/** Ensures no raw code blocks (```) clutter the live chat, turning them into plain conversational text. */
/** Chat text with web links made clickable; they open the source in a new tab. */
function Linked({ text }: { text: string }) {
  return (
    <>
      {splitLinks(text).map((p, i) =>
        p.href ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: parts of one fixed string
          <a key={i} href={p.href} target="_blank" rel="noopener noreferrer">
            {p.t}
          </a>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: parts of one fixed string
          <span key={i}>{p.t}</span>
        ),
      )}
    </>
  );
}
export function cleanChatText(text: string): string {
  if (!text) return '';
  const closed = text.replace(/```(?:[a-zA-Z0-9_-]+)?\n?([\s\S]*?)```/g, (_m, code) => {
    const trimmed = code.trim().replace(/\s+/g, ' ');
    if (!trimmed) return '';
    return trimmed.length > 100 ? `[Action: ${trimmed.slice(0, 97)}…]` : `[Action: ${trimmed}]`;
  });
  return closed.replace(/```(?:[a-zA-Z0-9_-]+)?\n?([\s\S]*)$/g, (_m, code) => {
    const trimmed = code.trim().replace(/\s+/g, ' ');
    if (!trimmed) return '';
    return trimmed.length > 100 ? `[Action: ${trimmed.slice(0, 97)}…]` : `[Action: ${trimmed}]`;
  });
}

export default function ChatPanel() {
  const log = useStore(s => s.log),
    busy = useStore(s => s.busy),
    role = useStore(s => s.role),
    viewing = useStore(s => s.viewing),
    stages = useStore(s => s.stages),
    notes = useStore(s => s.notes),
    limited = useStore(s => s.limited),
    ranOn = useStore(s => s.ranOn);
  /** "via Groq" when a free service stood in for the bot's own company. */
  const via = (id: AgentId) => {
    const p = ranOn[id];
    return p && p !== AGENT[id].provider ? (
      <small className="via">via {PROV[p].label.replace(' (free)', '')}</small>
    ) : null;
  };
  const inspectBot = useStore(s => s.inspectBot);
  const end = useRef<HTMLDivElement>(null),
    msgsRef = useRef<HTMLDivElement>(null),
    [autoScroll, setAutoScroll] = useState(true),
    draft = useStore(s => s.draft),
    flow = useStore(s => s.flow),
    activePulse = useStore(s => s.pulses.filter(p => !p.from.startsWith('mem:')).at(-1));

  const scrollToBottom = (smooth = false) => {
    const el = msgsRef.current;
    if (el) {
      if (smooth && typeof el.scrollTo === 'function') {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      } else {
        el.scrollTop = el.scrollHeight;
      }
    }
    end.current?.scrollIntoView?.({ block: 'end', behavior: smooth ? 'smooth' : 'auto' });
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: these values trigger the scroll into view
  useEffect(() => {
    if (!autoScroll && !busy) return;
    // Fast instant scroll keeps streaming viewports pinned to the latest message without stalling
    scrollToBottom(false);
  }, [log.length, viewing, draft?.text, draft?.from, flow.length, stages, autoScroll, busy]);

  const onScroll = () => {
    const el = msgsRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    if (isNearBottom !== autoScroll) {
      setAutoScroll(isNearBottom);
    }
  };

  const mem = useStore(s => s.mem);
  const latestSession = !log.length && mem.sessions.length ? mem.sessions[mem.sessions.length - 1] : null;
  const currentSession = viewing || latestSession;
  // the chat shows only what the AI team wrote, plus who is doing what right now
  const msgs = (
    currentSession ? currentSession.msgs.map((m, i) => ({ ...m, id: i, cls: undefined as 'warn' | undefined })) : log
  ).filter(m => m.from !== 'brain' && !isLegacyApprovalPhrase(m.text));
  const doing = currentSession
    ? []
    : (Object.entries(stages) as [AgentId, string][]).filter(([id, v]) => v === 'working' && id !== draft?.from);
  const stuck = currentSession ? [] : (Object.entries(stages) as [AgentId, string][]).filter(([, v]) => v === 'failed');
  return (
    <section className="panel chat grok" aria-label="Live chat">
      {!currentSession && <Handoff />}
      {currentSession && !log.length && (
        <div
          className="session-banner"
          style={{
            padding: '6px 12px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            fontSize: 12,
            color: '#888',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>
            {viewing
              ? currentSession.kind === 'chat'
                ? 'Past chat: '
                : 'Past task: '
              : currentSession.kind === 'chat'
                ? 'Latest chat: '
                : 'Latest task: '}
            <strong style={{ color: '#fff' }}>{currentSession.q}</strong>
            {currentSession.kind === 'chat' ? (
              <small style={{ marginLeft: 8, color: '#888' }}>not wiki memory</small>
            ) : null}
          </span>
          {viewing ? (
            <button
              type="button"
              className="sm link"
              onClick={() => useStore.getState().viewSession(null)}
              style={{ color: '#aaa', cursor: 'pointer' }}
            >
              Close
            </button>
          ) : (
            <span style={{ fontSize: 11, color: '#4ade80' }}>Completed</span>
          )}
        </div>
      )}
      <div className="msgs" ref={msgsRef} onScroll={onScroll} aria-live="off">
        {msgs.map((m, idx) => {
          const a = isAgent(m.from) ? AGENT[m.from] : null;
          const prevMsg = idx > 0 ? msgs[idx - 1] : null;
          const showPass = a && prevMsg;
          const passFrom = prevMsg ? prevMsg.from : 'owner';
          const passTo = m.from;
          return (
            <Fragment key={m.id}>
              {showPass && !(typeof m.tag === 'string' && m.tag.startsWith('chat ·')) && (
                <div className="chat-pass" role="status">
                  <span className="pass-pill">PASS</span>
                  <span className="pass-end" style={{ color: colorOf(passFrom) }}>
                    {isAgent(passFrom) && <BotIcon id={passFrom} size={14} />}
                    <b>{nameOf(passFrom)}</b>
                  </span>
                  <span className="pass-arrow" aria-hidden="true">
                    →
                  </span>
                  <span className="pass-end" style={{ color: colorOf(passTo) }}>
                    <BotIcon id={a.id} size={14} />
                    <b>{a.name}</b>
                  </span>
                </div>
              )}
              <article
                tabIndex={-1}
                data-scene-entry={a ? `agent:${a.id}` : undefined}
                className={`msg ${a ? 'bot ' + a.kind : m.from}${m.cls === 'warn' ? ' warn' : ''}${typeof m.tag === 'string' && m.tag.startsWith('chat ·') ? ' chat-turn' : ''}`}
                style={a ? ({ '--c': colorOf(a.id) } as CSSProperties) : undefined}
              >
                <header>
                  {a ? <BotIcon id={a.id} /> : null}
                  {a ? (
                    <BotName limited={limited} onOpen={inspectBot} id={a.id} />
                  ) : (
                    <b>{m.from === 'owner' ? 'You' : 'Brain'}</b>
                  )}
                  {a && (
                    <span className="doing">
                      {typeof m.tag === 'string' && m.tag.startsWith('chat ·') ? 'chat' : a.role}
                    </span>
                  )}
                  {a && !viewing && via(a.id)}
                </header>
                <p>
                  <Linked text={cleanChatText(m.text)} />
                </p>
              </article>
            </Fragment>
          );
        })}
        {!currentSession && busy && activePulse && (
          <div className="chat-pass in-flight" role="status">
            <span className="pass-pill pulse">PASSING</span>
            <span className="pass-end" style={{ color: colorOf(activePulse.from) }}>
              {isAgent(activePulse.from) && <BotIcon id={activePulse.from as AgentId} size={14} />}
              <b>{nameOf(activePulse.from)}</b>
            </span>
            <span className="pass-arrow" aria-hidden="true">
              →
            </span>
            <span className="pass-end" style={{ color: colorOf(activePulse.to) }}>
              {isAgent(activePulse.to) && <BotIcon id={activePulse.to as AgentId} size={14} />}
              <b>{nameOf(activePulse.to)}</b>
            </span>
            {activePulse.words ? <small className="pass-words">{activePulse.words}w</small> : null}
          </div>
        )}
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
              {via(draft.from)}
            </header>
            <p>
              {cleanChatText(draft.text)}
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
      {role === 'admin' && <BanterBar />}
      {role === 'admin' && <Composer />}
      {busy ? <span className="sr">The team is working.</span> : null}
    </section>
  );
}

/** The huddle switch, right by the chat: on, Grok Bot leads team huddles when idle; off, the room stays quiet. */
function BanterBar() {
  const on = useStore(s => s.live.banter),
    setLive = useStore(s => s.setLive),
    bantering = useStore(s => s.bantering),
    stop = useStore(s => s.stop);
  return (
    <div className="banter-bar">
      <label className="sw">
        <input type="checkbox" checked={on} onChange={e => setLive({ banter: e.target.checked })} />
        <span>Team huddles when idle</span>
      </label>
      {on && bantering ? (
        <>
          <span className="doing">huddling…</span>
          <button type="button" className="sm link" onClick={() => stop()} title="Stop this huddle">
            Stop
          </button>
        </>
      ) : null}
    </div>
  );
}

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
