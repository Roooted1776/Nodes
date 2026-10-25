import { useEffect, useState } from 'react';
import { useStore } from '../store';

export default function Composer() {
  const [q, setQ] = useState(''),
    busy = useStore(s => s.busy),
    send = useStore(s => s.send),
    stop = useStore(s => s.stop),
    ready = useStore(s => Object.values(s.keys).some(Boolean)),
    promptDraft = useStore(s => s.promptDraft),
    setPromptDraft = useStore(s => s.setPromptDraft);

  useEffect(() => {
    if (promptDraft) {
      setQ(promptDraft);
      setPromptDraft('');
    }
  }, [promptDraft, setPromptDraft]);
  const go = () => {
    if (!q.trim() || busy || !ready) return;
    void send(q);
    setQ('');
  };
  return (
    <form
      className="composer minimal"
      onSubmit={e => {
        e.preventDefault();
        go();
      }}
    >
      <textarea
        value={q}
        onChange={e => setQ(e.target.value)}
        rows={1}
        maxLength={2000}
        disabled={busy || !ready}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            go();
          }
        }}
        aria-label="Task for the team"
      />
      {busy ? (
        <button type="button" className="icon-btn stop" onClick={stop} aria-label="Stop" title="Stop">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <rect x="3" y="3" width="10" height="10" fill="currentColor" />
          </svg>
        </button>
      ) : (
        <button type="submit" className="icon-btn send" disabled={!q.trim() || !ready} aria-label="Send" title="Send">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" shapeRendering="crispEdges">
            <path d="M8 2 3 7h3v7h4V7h3z" fill="currentColor" />
          </svg>
        </button>
      )}
    </form>
  );
}
