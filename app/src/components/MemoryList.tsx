import { AGENT } from '../data/team';
import { TYPE_LABEL, type Entry, type Mem } from '../lib/memory';
import { useMem, useStore } from '../store';

const stamp = (ts: number) => {
  try {
    return new Date(ts).toISOString().slice(0, 16).replace('T', ' ');
  } catch {
    return 'unknown';
  }
};

/** The bot behind a memory: the first teammate who spoke in the session it came from. */
function botOf(mem: Mem, e: Entry): string {
  const ref = e.sources.find(s => s.kind === 'session' && s.ref)?.ref,
    ses = ref ? mem.sessions.find(x => x.id === ref) : undefined,
    from = ses?.msgs.find(m => m.from in AGENT)?.from;
  return from ? AGENT[from as keyof typeof AGENT].name : '—';
}

/** Opens when the middle of the brain is clicked: every memory, newest first. */
export default function MemoryList() {
  const open = useStore(s => s.memoryOpen),
    close = useStore(s => s.setMemoryOpen),
    mem = useMem();
  if (!open) return null;
  const rows = [...mem.entries].sort((a, b) => b.created - a.created);
  return (
    <section className="memory-list" aria-label="Memory list">
      <header>
        <b>Memory ({rows.length})</b>
        <button type="button" className="icon-btn" onClick={() => close(false)} aria-label="Close memory list">
          ×
        </button>
      </header>
      <div className="memory-rows">
        <table>
          <thead>
            <tr>
              <th>Date and time</th>
              <th>Name</th>
              <th>Description</th>
              <th>Type</th>
              <th>Bot</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(e => (
              <tr key={e.id}>
                <td>{stamp(e.created)}</td>
                <td>{e.title}</td>
                <td>{e.note}</td>
                <td>{TYPE_LABEL[e.type]}</td>
                <td>{botOf(mem, e)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p>No memories yet.</p>}
      </div>
    </section>
  );
}
