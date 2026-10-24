import { useState } from 'react';
import { PROV } from '../lib/providers';
import { useStore } from '../store';

/** Starting points. They only fill the box; nothing is sent until Send. */
const PROMPTS = [
  'Plan a launch checklist for a small web app',
  'Review this idea and list the risks: ',
  'Design an iPhone screen for searching notes',
  'Explain how our memory system should decide what to keep',
];

export default function Composer() {
  const [q, setQ] = useState(''),
    busy = useStore(s => s.busy),
    live = useStore(s => s.live),
    send = useStore(s => s.send),
    stop = useStore(s => s.stop),
    ready = useStore(s => !!s.keys[s.live.provider]);
  const go = () => {
    if (!q.trim() || busy || !ready) return;
    void send(q);
    setQ('');
  };
  return (
    <form
      className="composer card2"
      onSubmit={e => {
        e.preventDefault();
        go();
      }}
    >
      {ready && !q && !busy && (
        <section className="prompts" aria-label="Example tasks">
          {PROMPTS.map(p => (
            <button key={p} type="button" onClick={() => setQ(p)}>
              {p.replace(/: $/, '…')}
            </button>
          ))}
        </section>
      )}
      <textarea
        value={q}
        onChange={e => setQ(e.target.value)}
        rows={2}
        maxLength={2000}
        placeholder={ready ? 'Give the team a task…' : 'Connect a real AI key above first'}
        disabled={busy || !ready}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            go();
          }
        }}
        aria-label="Task for the team"
      />
      <div className="row">
        <small>
          {ready
            ? `Real AI · ${PROV[live.provider].label} · ${live.models[live.provider]} · Enter sends · Shift+Enter new line`
            : 'Real AI only · no key yet'}
        </small>
        {busy ? (
          <button type="button" className="danger" onClick={stop}>
            Stop
          </button>
        ) : (
          <button type="submit" className="primary" disabled={!q.trim() || !ready}>
            Send
          </button>
        )}
      </div>
    </form>
  );
}
