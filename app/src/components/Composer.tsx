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
    activeProject = useStore(s => s.activeProject),
    setActiveProject = useStore(s => s.setActiveProject),
    mem = useStore(s => s.mem),
    ready = useStore(s => Object.values(s.keys).some(Boolean));
  const [showNew, setShowNew] = useState(false);
  const [newProj, setNewProj] = useState('');

  const projects = Array.from(
    new Set([
      'Brain',
      ...mem.entries.filter(e => e.type === 'workstream').map(e => e.title),
      ...mem.sessions.map(s => s.project).filter((p): p is string => Boolean(p)),
    ]),
  );

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
      <div className="composer-proj-row">
        {showNew ? (
          <>
            <label htmlFor="new-project-input">New Project:</label>
            <input
              id="new-project-input"
              value={newProj}
              onChange={e => setNewProj(e.target.value)}
              placeholder="Project name"
              disabled={busy}
              maxLength={60}
              aria-label="New Project Name"
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (newProj.trim()) {
                    setActiveProject(newProj.trim());
                    setShowNew(false);
                    setNewProj('');
                  }
                }
              }}
            />
            <button
              type="button"
              className="btnlink sm"
              onClick={() => {
                if (newProj.trim()) {
                  setActiveProject(newProj.trim());
                  setShowNew(false);
                  setNewProj('');
                }
              }}
              disabled={!newProj.trim()}
            >
              Set
            </button>
            <button
              type="button"
              className="link"
              onClick={() => {
                setShowNew(false);
                setNewProj('');
              }}
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <label htmlFor="composer-project">Project Node:</label>
            <select
              id="composer-project"
              value={activeProject}
              onChange={e => {
                if (e.target.value === '__new__') {
                  setShowNew(true);
                } else {
                  setActiveProject(e.target.value);
                }
              }}
              disabled={busy}
              aria-label="Active Project"
            >
              {projects.map(p => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
              <option value="__new__">+ New project…</option>
            </select>
          </>
        )}
      </div>
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
