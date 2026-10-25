import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { pulseMs, type Pulse } from '../store';
import { colorOf } from '../data/colors';
import { AGENT, isAgent } from '../data/team';
import { fmtDate } from '../lib/text';
import type { Msg } from '../lib/memory';
import { useStore } from '../store';
import Composer from './Composer';
import Coverage, { fromSession } from './Coverage';
import KeyGuide from './KeyGuide';
import Tasks, { FlowBox } from './Tasks';

const tagParts = (t: string) => (/^live · /.test(t) ? t.replace(/^live · /, '').replace(' · unverified', '') : '');

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="copy-btn"
      title="Copy message"
      onClick={() => {
        void navigator.clipboard?.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

export default function ChatPanel() {
  const log = useStore(s => s.log),
    busy = useStore(s => s.busy),
    role = useStore(s => s.role),
    status = useStore(s => s.status),
    viewing = useStore(s => s.viewing),
    viewSession = useStore(s => s.viewSession);
  const sceneFocus = useStore(s => s.sceneFocus);
  const focusedAgent = sceneFocus?.kind === 'agent' && isAgent(sceneFocus.id) ? AGENT[sceneFocus.id] : null;
  const ready = useStore(s => !!s.keys[s.live.provider]),
    end = useRef<HTMLDivElement>(null),
    msgsRef = useRef<HTMLDivElement>(null),
    [autoScroll, setAutoScroll] = useState(true),
    draft = useStore(s => s.draft),
    flow = useStore(s => s.flow),
    timing = useStore(s => s.timing);

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
  }, [log.length, viewing, draft?.text, draft?.from, flow.length, autoScroll]);

  const onScroll = () => {
    const el = msgsRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    if (isNearBottom !== autoScroll) {
      setAutoScroll(isNearBottom);
    }
  };

  // the chat shows only what the AI team wrote; Brain's own notes live in the status line
  const msgs = (
    viewing ? viewing.msgs.map((m, i) => ({ ...m, id: i, cls: undefined as 'warn' | undefined })) : log
  ).filter(m => m.from !== 'brain');
  return (
    <section className="panel chat" aria-label="Live chat">
      {focusedAgent && !msgs.some(m => m.from === focusedAgent.id) && (
        <article
          key={sceneFocus?.sequence}
          className="agent-detail"
          tabIndex={-1}
          data-scene-entry={`agent:${focusedAgent.id}`}
          style={{ '--c': colorOf(focusedAgent.id) } as CSSProperties}
        >
          <header>
            <b>{focusedAgent.name}</b>
            <span>{focusedAgent.role}</span>
          </header>
          <p>{focusedAgent.specialty}</p>
        </article>
      )}
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
        <button
          type="button"
          className={`link auto-scroll-btn${autoScroll ? ' on' : ''}`}
          onClick={() => {
            const next = !autoScroll;
            setAutoScroll(next);
            if (next) scrollToBottom();
          }}
          title={autoScroll ? 'Auto-scroll is on (click to pause)' : 'Click to turn auto-scroll on'}
          aria-pressed={autoScroll}
        >
          {autoScroll ? 'Auto-scroll on' : 'Auto-scroll off'}
        </button>
        {viewing && (
          <button type="button" className="link" onClick={() => viewSession(null)}>
            Back to live
          </button>
        )}
      </div>
      {!viewing && <Handoff />}
      <Tasks />
      <Coverage cov={viewing ? fromSession(viewing) : undefined} />
      <div className="msgs" ref={msgsRef} onScroll={onScroll} aria-live="off">
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
              tabIndex={-1}
              data-scene-entry={a ? `agent:${a.id}` : undefined}
              className={`msg ${a ? 'bot ' + a.kind : m.from}${m.cls === 'warn' ? ' warn' : ''}`}
              style={a ? ({ '--g1': colorOf(a.id), '--c': colorOf(a.id) } as CSSProperties) : undefined}
            >
              <header>
                <b>{who}</b>
                {a && <span>{a.role}</span>}
                {t && <em>{t}</em>}
                <CopyButton text={m.text} />
                {a && role === 'admin' && <TeamLearnAction msg={m} who={who} />}
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
        {!autoScroll && (
          <button
            type="button"
            className="scroll-bottom-pill"
            onClick={() => {
              setAutoScroll(true);
              scrollToBottom();
            }}
            title="Scroll to bottom and turn auto-scroll on"
          >
            ↓ Auto-scroll
          </button>
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

function TeamLearnAction({ msg, who }: { msg: Msg; who: string }) {
  const [open, setOpen] = useState<'idea' | 'mistake' | null>(null);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState('');
  const noteFn = useStore(s => s.note);

  const onOpen = (type: 'idea' | 'mistake') => {
    setOpen(type);
    setTitle(type === 'idea' ? `${who}: Breakthrough` : `Fix: ${who}`);
    setNote(msg.text.slice(0, 240));
    setStatus('');
  };

  const onSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !note.trim()) return;
    const id = noteFn({
      type: 'concept',
      title: title.trim(),
      note: (open === 'mistake' ? '[MISTAKE & CORRECTION] ' : '[TEAM BREAKTHROUGH] ') + note.trim(),
    });
    if (id) {
      setStatus(open === 'idea' ? 'Idea saved to memory!' : 'Lesson recorded! Team will remember this.');
      setTimeout(() => setOpen(null), 1800);
    } else {
      setStatus('Could not save (duplicate title).');
    }
  };

  return (
    <>
      <div className="msg-learn-actions">
        <button
          type="button"
          className="learn-btn idea"
          title="Save this breakthrough so the whole team learns it"
          onClick={() => onOpen('idea')}
        >
          💡 Save Idea
        </button>
        <button
          type="button"
          className="learn-btn mistake"
          title="Flag a mistake & teach the team how to fix it"
          onClick={() => onOpen('mistake')}
        >
          ⚠️ Teach Mistake
        </button>
      </div>
      {open && (
        <form className={`msg-learn-box ${open}`} onSubmit={onSave}>
          <div className="msg-learn-header">
            <b>{open === 'idea' ? '💡 Teach Team Great Idea' : '⚠️ Record Mistake & Correction'}</b>
            <button type="button" className="link" onClick={() => setOpen(null)}>
              Cancel
            </button>
          </div>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={open === 'idea' ? 'Idea Title' : 'What was the mistake?'}
            maxLength={80}
            required
            aria-label="Title"
          />
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder={
              open === 'idea'
                ? 'What should the team remember from this?'
                : 'How should the team fix this in the future?'
            }
            maxLength={500}
            rows={2}
            required
            aria-label="Note"
          />
          <div className="row">
            <button type="submit" className={open === 'idea' ? 'primary' : 'danger'}>
              {open === 'idea' ? 'Save to Memory' : 'Commit Correction'}
            </button>
            {status && <span className="learn-status">{status}</span>}
          </div>
        </form>
      )}
    </>
  );
}
