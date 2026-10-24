import { useMemo, useState } from 'react';
import { TYPE_LABEL, byId, type Entry, type EntryType } from '../lib/memory';
import { fmtDate } from '../lib/text';
import { useMem, useStore } from '../store';
import { TYPE_COLOR } from '../data/colors';

const SHAPE: Record<EntryType, string> = { concept: '●', entity: '●', workstream: '●' };

export default function MemoryPanel() {
  const mem = useMem(),
    role = useStore(s => s.role),
    selected = useStore(s => s.selected),
    select = useStore(s => s.select),
    viewSession = useStore(s => s.viewSession);
  const [type, setType] = useState<EntryType | 'all'>('all'),
    [q, setQ] = useState('');
  const list = useMemo(
    () =>
      mem.entries
        .filter(
          e =>
            (type === 'all' || e.type === type) &&
            (!q.trim() || (e.title + ' ' + e.note).toLowerCase().includes(q.trim().toLowerCase())),
        )
        .sort((a, b) => b.seen - a.seen),
    [mem.entries, type, q],
  );
  const cur = selected ? byId(mem, selected) : undefined;
  const counts = { concept: 0, entity: 0, workstream: 0 };
  mem.entries.forEach(e => counts[e.type]++);
  return (
    <section className="panel memory" aria-label="Memory">
      <div className="filters" role="tablist" aria-label="Memory type">
        {(['all', 'concept', 'entity', 'workstream'] as const).map(t => (
          <button
            type="button"
            key={t}
            role="tab"
            aria-selected={type === t}
            className={type === t ? 'on' : ''}
            onClick={() => setType(t)}
          >
            {t === 'all' ? (
              `All ${mem.entries.length}`
            ) : (
              <>
                <i style={{ color: TYPE_COLOR[t] }}>{SHAPE[t]}</i>
                {TYPE_LABEL[t]}s {counts[t]}
              </>
            )}
          </button>
        ))}
      </div>
      <input
        className="search"
        placeholder="Search memory"
        value={q}
        onChange={e => setQ(e.target.value)}
        aria-label="Search memory"
      />
      {cur && <Detail e={cur} onSession={viewSession} />}
      <ul className="entries">
        {list.length === 0 && (
          <li className="empty">
            {mem.entries.length
              ? 'Nothing matches.'
              : 'Memory is empty. It fills in from real sessions that an admin runs.'}
          </li>
        )}
        {list.map(e => (
          <li key={e.id}>
            <button
              type="button"
              className={e.id === selected ? 'on' : ''}
              onClick={() => select(e.id === selected ? null : e.id)}
            >
              <i style={{ color: TYPE_COLOR[e.type] }}>{SHAPE[e.type]}</i>
              <span>{e.title}</span>
              {e.status === 'stale' && <em>stale</em>}
              <small>{'▮'.repeat(Math.min(5, Math.ceil(e.strength / 2)))}</small>
            </button>
          </li>
        ))}
      </ul>
      {role === 'admin' && <AddNote />}
    </section>
  );
}

function Detail({ e, onSession }: { e: Entry; onSession(id: string): void }) {
  const mem = useMem(),
    role = useStore(s => s.role),
    select = useStore(s => s.select),
    correct = useStore(s => s.correct),
    remove = useStore(s => s.remove);
  const [edit, setEdit] = useState(false),
    [note, setNote] = useState(e.note),
    [title, setTitle] = useState(e.title),
    [sure, setSure] = useState(false);
  return (
    <article className="detail" style={{ borderColor: TYPE_COLOR[e.type] }}>
      <header>
        <span style={{ color: TYPE_COLOR[e.type] }}>
          {SHAPE[e.type]} {TYPE_LABEL[e.type]}
        </span>
        <small>
          {e.status === 'stale' ? 'stale · ' : ''}seen {e.strength}× · last {fmtDate(e.seen)}
          {e.corrected ? ' · corrected' : ''}
        </small>
      </header>
      {edit ? (
        <>
          <input value={title} maxLength={80} onChange={ev => setTitle(ev.target.value)} aria-label="Title" />
          <textarea value={note} maxLength={600} rows={5} onChange={ev => setNote(ev.target.value)} aria-label="Note" />
          <div className="row">
            <button
              type="button"
              className="primary"
              onClick={() => {
                correct(e.id, { title, note });
                setEdit(false);
              }}
            >
              Save correction
            </button>
            <button type="button" onClick={() => setEdit(false)}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <h3>{e.title}</h3>
          <p className="note">{e.note}</p>
        </>
      )}
      {e.sources.length > 0 && (
        <div className="srcs">
          <b>From</b>
          {e.sources.map((s, i) =>
            s.ref && s.kind === 'session' && mem.sessions.some(x => x.id === s.ref) ? (
              <button type="button" key={i} className="link" onClick={() => onSession(s.ref!)}>
                {s.label}
              </button>
            ) : (
              <span key={i}>{s.label}</span>
            ),
          )}
        </div>
      )}
      {e.links.length > 0 && (
        <div className="srcs">
          <b>Linked</b>
          {e.links.map(id => {
            const o = byId(mem, id);
            return o ? (
              <button
                type="button"
                key={id}
                className="link"
                onClick={() => select(id)}
                style={{ color: TYPE_COLOR[o.type] }}
              >
                {o.title}
              </button>
            ) : null;
          })}
        </div>
      )}
      {role === 'admin' ? (
        !edit && (
          <div className="row">
            <button
              type="button"
              onClick={() => {
                setNote(e.note);
                setTitle(e.title);
                setEdit(true);
              }}
            >
              Correct
            </button>
            {sure ? (
              <>
                <button type="button" className="danger" onClick={() => remove(e.id)}>
                  Yes, delete. Brain will not relearn it.
                </button>
                <button type="button" onClick={() => setSure(false)}>
                  Keep
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setSure(true)}>
                Delete
              </button>
            )}
          </div>
        )
      ) : (
        <p className="ro">Read only. Admins can correct or delete.</p>
      )}
    </article>
  );
}

function AddNote() {
  const note = useStore(s => s.note),
    [open, setOpen] = useState(false),
    [type, setType] = useState<EntryType>('concept'),
    [title, setTitle] = useState(''),
    [text, setText] = useState(''),
    [msg, setMsg] = useState('');
  if (!open)
    return (
      <button type="button" className="addbtn" onClick={() => setOpen(true)}>
        + Add a note to memory
      </button>
    );
  return (
    <form
      className="addnote"
      onSubmit={e => {
        e.preventDefault();
        const id = note({ type, title, note: text });
        setMsg(id ? 'Added.' : 'Not added. Use a new title.');
        if (id) {
          setTitle('');
          setText('');
        }
      }}
    >
      <div className="row">
        <select value={type} onChange={e => setType(e.target.value as EntryType)} aria-label="Type">
          {(['concept', 'entity', 'workstream'] as const).map(t => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <input
          value={title}
          maxLength={80}
          onChange={e => setTitle(e.target.value)}
          placeholder="Title"
          required
          aria-label="Title"
        />
      </div>
      <textarea
        value={text}
        maxLength={600}
        rows={3}
        onChange={e => setText(e.target.value)}
        placeholder="What should Brain remember?"
        aria-label="Note"
      />
      <div className="row">
        <button type="submit" className="primary">
          Add
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setMsg('');
          }}
        >
          Close
        </button>
        <small>{msg}</small>
      </div>
    </form>
  );
}
