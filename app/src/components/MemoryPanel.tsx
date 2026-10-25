import { useEffect, useMemo, useState } from 'react';
import { TYPE_COLOR } from '../data/colors';
import {
  downloadFile,
  exportMemoryJson,
  exportMemoryMarkdown,
  parseCsvMemory,
  parseJsonMemory,
  parseMarkdownMemory,
  parseMemoryFile,
  type RawMemoryItem,
} from '../lib/file-import';
import { TYPE_LABEL, byId, type Entry, type EntryType } from '../lib/memory';
import { fmtDate } from '../lib/text';
import { useMem, useStore } from '../store';
import { fetchAndConvertGitHub } from '../lib/github';

const SHAPE: Record<EntryType, string> = { concept: '●', entity: '●', workstream: '●' };

export default function MemoryPanel() {
  const mem = useMem(),
    role = useStore(s => s.role),
    selected = useStore(s => s.selected),
    select = useStore(s => s.select),
    viewSession = useStore(s => s.viewSession);
  const [type, setType] = useState<EntryType | 'all'>('all'),
    [q, setQ] = useState(''),
    [sort, setSort] = useState<'recent' | 'strong' | 'alpha'>('recent'),
    [importOpen, setImportOpen] = useState(false),
    [importTab, setImportTab] = useState<'files' | 'paste' | 'github'>('files');
  const list = useMemo(
    () =>
      mem.entries
        .filter(
          e =>
            (type === 'all' || e.type === type) &&
            (!q.trim() || (e.title + ' ' + e.note).toLowerCase().includes(q.trim().toLowerCase())),
        )
        .sort((a, b) => {
          if (sort === 'alpha') return a.title.localeCompare(b.title);
          if (sort === 'strong') return b.strength - a.strength;
          return b.seen - a.seen;
        }),
    [mem.entries, type, q, sort],
  );
  const cur = selected ? byId(mem, selected) : undefined;
  const counts = { concept: 0, entity: 0, workstream: 0 };
  mem.entries.forEach(e => counts[e.type]++);
  const activeWorkstreams = mem.entries.filter(e => e.type === 'workstream' && e.status !== 'stale').length;
  const completedWorkstreams = mem.entries.filter(e => e.type === 'workstream' && e.status === 'stale').length;
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
                {t === 'entity' ? 'Entities' : `${TYPE_LABEL[t]}s`} {counts[t]}
              </>
            )}
          </button>
        ))}
      </div>

      {type === 'workstream' && (
        <div className="work-tracker-banner card2">
          <div className="wt-stats">
            <span className="wt-title">WORK TRACKER</span>
            <div className="row">
              <span className="badge-active">● {activeWorkstreams} Active</span>
              <span className="badge-stale">○ {completedWorkstreams} Completed</span>
            </div>
          </div>
          <small className="muted">Track ongoing projects, initiatives and team milestones</small>
        </div>
      )}

      <div className="mem-toolbar">
        <input
          className="search"
          placeholder="Search memory…"
          value={q}
          onChange={e => setQ(e.target.value)}
          aria-label="Search memory"
        />
        <fieldset className="mem-sort-group">
          <legend className="sr">Sort memories</legend>
          {(['recent', 'strong', 'alpha'] as const).map(s => (
            <button type="button" key={s} className={`sort-btn${sort === s ? ' on' : ''}`} onClick={() => setSort(s)}>
              {s === 'recent' ? 'Recent' : s === 'strong' ? 'Strong' : 'A–Z'}
            </button>
          ))}
        </fieldset>
      </div>

      <div className="memory-actions">
        {role === 'admin' && (
          <>
            <button
              type="button"
              className="action-btn import-btn"
              onClick={() => {
                setImportTab('files');
                setImportOpen(true);
              }}
              title="Import memory files (.json, .md, .txt, .csv)"
            >
              📥 Import Files
            </button>
            <button
              type="button"
              className="action-btn gh-btn"
              onClick={() => {
                setImportTab('github');
                setImportOpen(true);
              }}
              title="Connect and import GitHub repository"
            >
              🐙 GitHub
            </button>
          </>
        )}
        <button
          type="button"
          className="action-btn export-btn"
          onClick={() => {
            const json = exportMemoryJson(mem);
            downloadFile(`brain-memories-${new Date().toISOString().slice(0, 10)}.json`, json);
          }}
          title="Export all memories as JSON"
        >
          📤 Export JSON
        </button>
        <button
          type="button"
          className="action-btn export-btn"
          onClick={() => {
            const md = exportMemoryMarkdown(mem);
            downloadFile(`brain-memories-${new Date().toISOString().slice(0, 10)}.md`, md, 'text/markdown');
          }}
          title="Export all memories as Markdown"
        >
          📤 Export MD
        </button>
      </div>
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
      {role === 'admin' && <AddNote onOpenImport={() => setImportOpen(true)} />}
      {importOpen && <ImportModal onClose={() => setImportOpen(false)} initialTab={importTab} />}
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
    <article
      tabIndex={-1}
      data-scene-entry={`memory:${e.id}`}
      className="detail"
      style={{ borderColor: TYPE_COLOR[e.type] }}
    >
      <header>
        <span className="type" style={{ color: TYPE_COLOR[e.type] }}>
          {TYPE_LABEL[e.type]}
        </span>
        <span className="strength">Strength {e.strength}/9</span>
        <button type="button" className="close" onClick={() => select(null)} aria-label="Close detail">
          ✕
        </button>
      </header>
      {edit ? (
        <form
          className="edit"
          onSubmit={ev => {
            ev.preventDefault();
            correct(e.id, { title, note });
            setEdit(false);
          }}
        >
          <input value={title} maxLength={80} onChange={ev => setTitle(ev.target.value)} aria-label="Title" required />
          <textarea
            value={note}
            maxLength={600}
            rows={4}
            onChange={ev => setNote(ev.target.value)}
            aria-label="Note"
            required
          />
          <div className="row">
            <button type="submit" className="primary">
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setTitle(e.title);
                setNote(e.note);
                setEdit(false);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          <h4>{e.title}</h4>
          <p className="note">{e.note}</p>
        </>
      )}
      <dl className="meta">
        <div>
          <dt>Status</dt>
          <dd>{e.status}</dd>
        </div>
        <div>
          <dt>First learned</dt>
          <dd>{fmtDate(e.created)}</dd>
        </div>
        <div>
          <dt>Last reinforced</dt>
          <dd>{fmtDate(e.seen)}</dd>
        </div>
        {e.sources.length > 0 && (
          <div>
            <dt>Sources</dt>
            <dd>
              {e.sources.map(s =>
                s.kind === 'session' && s.ref ? (
                  <button
                    type="button"
                    key={`${s.label}-${s.ref}`}
                    className="link"
                    onClick={() => s.ref && onSession(s.ref)}
                  >
                    {s.label}
                  </button>
                ) : s.kind === 'github' && s.ref && s.ref.startsWith('https://github.com') ? (
                  <a
                    key={`${s.label}-${s.ref}`}
                    href={s.ref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link gh-source-link"
                  >
                    {s.label} ↗
                  </a>
                ) : (
                  <span key={`${s.label}-${s.kind}`}>{s.label}</span>
                ),
              )}
            </dd>
          </div>
        )}
        {e.links.length > 0 && (
          <div>
            <dt>Connected to</dt>
            <dd className="links">
              {e.links.map(id => {
                const linkEntry = byId(mem, id);
                if (!linkEntry) return null;
                return (
                  <button
                    type="button"
                    key={id}
                    className="chip"
                    style={{ borderColor: TYPE_COLOR[linkEntry.type] }}
                    onClick={() => select(id)}
                  >
                    <i style={{ color: TYPE_COLOR[linkEntry.type] }}>{SHAPE[linkEntry.type]}</i>
                    {linkEntry.title}
                  </button>
                );
              })}
            </dd>
          </div>
        )}
      </dl>
      {role === 'admin' ? (
        !edit && (
          <div className="actions">
            <button
              type="button"
              onClick={() => {
                setTitle(e.title);
                setNote(e.note);
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

function AddNote({ onOpenImport }: { onOpenImport: () => void }) {
  const note = useStore(s => s.note),
    [open, setOpen] = useState(false),
    [type, setType] = useState<EntryType>('concept'),
    [title, setTitle] = useState(''),
    [text, setText] = useState(''),
    [msg, setMsg] = useState('');
  if (!open)
    return (
      <div className="memory-bottom-actions">
        <button type="button" className="addbtn" onClick={() => setOpen(true)}>
          + Add a note to memory
        </button>
        <button type="button" className="addbtn import-alt-btn" onClick={onOpenImport}>
          📥 Batch Import
        </button>
      </div>
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

interface ParsedFileInfo {
  name: string;
  count: number;
  items: RawMemoryItem[];
}

function ImportModal({
  onClose,
  initialTab = 'files',
}: {
  onClose: () => void;
  initialTab?: 'files' | 'paste' | 'github';
}) {
  const mem = useMem();
  const importItems = useStore(s => s.importItems);
  const activeProj = useStore(s => s.activeProject);
  const sGithubRepo = useStore(s => s.githubRepo);
  const sGithubToken = useStore(s => s.githubToken);

  const [tab, setTab] = useState<'files' | 'paste' | 'github'>(initialTab);
  const [project, setProject] = useState(activeProj || 'Brain');
  const [customProject, setCustomProject] = useState('');
  const [parsedFiles, setParsedFiles] = useState<ParsedFileInfo[]>([]);
  const [pasteText, setPasteText] = useState('');
  const [pasteFormat, setPasteFormat] = useState<'json' | 'md' | 'csv'>('json');
  const [pastedItems, setPastedItems] = useState<RawMemoryItem[]>([]);
  const [ghRepo, setGhRepo] = useState(sGithubRepo);
  const [ghToken, setGhToken] = useState(sGithubToken);
  const [ghIncReadme, setGhIncReadme] = useState(true);
  const [ghIncIssues, setGhIncIssues] = useState(true);
  const [ghIssueState, setGhIssueState] = useState<'open' | 'closed' | 'all'>('open');
  const [ghIncCommits, setGhIncCommits] = useState(true);
  const [ghItems, setGhItems] = useState<RawMemoryItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Collect existing project workstreams
  const projects = useMemo(() => {
    const set = new Set<string>(['Brain']);
    mem.entries.forEach(e => {
      if (e.type === 'workstream') set.add(e.title);
    });
    return Array.from(set);
  }, [mem.entries]);

  const targetProject = (project === '__custom__' ? customProject : project).trim() || 'Brain';

  const handleFiles = async (fileList: FileList | File[]) => {
    setBusy(true);
    setStatus('');
    const list: ParsedFileInfo[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      try {
        const items = await parseMemoryFile(file, targetProject);
        list.push({ name: file.name, count: items.length, items });
      } catch {
        list.push({ name: file.name, count: 0, items: [] });
      }
    }
    setParsedFiles(prev => [...prev, ...list]);
    setBusy(false);
  };

  const handleParsePaste = () => {
    const text = pasteText.trim();
    if (!text) return;
    let items: RawMemoryItem[] = [];
    if (pasteFormat === 'json') {
      items = parseJsonMemory(text, targetProject);
    } else if (pasteFormat === 'csv') {
      items = parseCsvMemory(text, targetProject);
    } else {
      items = parseMarkdownMemory(text, 'pasted-note.md', targetProject);
    }
    setPastedItems(items);
    setStatus(`Parsed ${items.length} items from pasted text.`);
  };

  const handleFetchGitHub = async () => {
    if (!ghRepo.trim()) return;
    setBusy(true);
    setStatus('');
    try {
      const { items, summary } = await fetchAndConvertGitHub(
        ghRepo,
        {
          includeReadme: ghIncReadme,
          includeIssues: ghIncIssues,
          issueState: ghIssueState,
          includeCommits: ghIncCommits,
          maxIssues: 15,
          maxCommits: 8,
        },
        ghToken,
        targetProject,
      );
      setGhItems(items);
      setStatus(`✓ ${summary}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(`GitHub error: ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  const allItems = useMemo(() => {
    if (tab === 'files') {
      return parsedFiles.flatMap(f => f.items);
    }
    if (tab === 'paste') {
      return pastedItems;
    }
    return ghItems;
  }, [tab, parsedFiles, pastedItems, ghItems]);

  const doImport = () => {
    if (!allItems.length) return;
    setBusy(true);
    const res = importItems(allItems, targetProject, {
      sourceKind: tab === 'github' ? 'github' : 'import',
      repo: tab === 'github' ? ghRepo.trim() : undefined,
      summary: tab === 'github' ? `${allItems.length} GitHub memories` : `${allItems.length} memories`,
    });
    setBusy(false);
    setStatus(
      `✓ Successfully imported ${res.added} new and updated ${res.updated} memories into project "${targetProject}". Saved under tasks.`,
    );
    setParsedFiles([]);
    setPastedItems([]);
    setPasteText('');
    setGhItems([]);
  };

  return (
    <div className="import-overlay">
      <button type="button" className="import-backdrop" onClick={onClose} aria-label="Close modal backdrop" />
      <div className="import-modal" role="dialog" aria-modal="true" aria-label="Import Memory Files">
        <header className="import-header">
          <div>
            <h3>Import Memory Files</h3>
            <p className="import-sub">Upload notes, docs, and datasets into Brain’s 3D neural memory.</p>
          </div>
          <button type="button" className="close-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="import-project-row">
          <label htmlFor="import-proj-select">Target Project:</label>
          <select id="import-proj-select" value={project} onChange={e => setProject(e.target.value)}>
            {projects.map(p => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
            <option value="__custom__">+ New project…</option>
          </select>
          {project === '__custom__' && (
            <input
              type="text"
              placeholder="e.g. Research, Mobile, Audio"
              value={customProject}
              maxLength={50}
              onChange={e => setCustomProject(e.target.value)}
              aria-label="New project name"
            />
          )}
        </div>

        <div className="import-tabs">
          <button type="button" className={tab === 'files' ? 'on' : ''} onClick={() => setTab('files')}>
            📁 Files (.json, .md, .txt, .csv)
          </button>
          <button type="button" className={tab === 'paste' ? 'on' : ''} onClick={() => setTab('paste')}>
            📝 Paste Text
          </button>
          <button type="button" className={tab === 'github' ? 'on' : ''} onClick={() => setTab('github')}>
            🐙 GitHub
          </button>
        </div>

        {tab === 'files' ? (
          <div className="import-files-section">
            <label
              className={`dropzone ${isDragging ? 'dragging' : ''}`}
              onDragOver={e => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={async e => {
                e.preventDefault();
                setIsDragging(false);
                if (e.dataTransfer.files) void handleFiles(e.dataTransfer.files);
              }}
            >
              <div className="dropzone-icon">📥</div>
              <p className="dropzone-text">Drag and drop memory files here, or</p>
              <span className="btn-browse">Browse Files</span>
              <input
                type="file"
                multiple
                accept=".json,.md,.markdown,.txt,.csv"
                style={{ display: 'none' }}
                onChange={e => {
                  if (e.target.files) void handleFiles(e.target.files);
                  e.target.value = '';
                }}
              />
              <p className="dropzone-hint">
                Supports: JSON (backups, lists, dictionaries), Markdown (sections, docs), CSV tables, Text notes.
              </p>
            </label>

            {parsedFiles.length > 0 && (
              <div className="parsed-list">
                <h4>Detected Files ({parsedFiles.length})</h4>
                <ul>
                  {parsedFiles.map(f => (
                    <li key={`${f.name}-${f.items.length}`}>
                      <span className="file-name">{f.name}</span>
                      <span className="file-count">
                        {f.count > 0 ? `${f.count} ${f.count === 1 ? 'memory' : 'memories'}` : '0 items found'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : tab === 'paste' ? (
          <div className="import-paste-section">
            <div className="paste-format-row">
              <span className="format-label">Format:</span>
              {(['json', 'md', 'csv'] as const).map(fmt => (
                <button
                  type="button"
                  key={fmt}
                  className={pasteFormat === fmt ? 'on' : ''}
                  onClick={() => setPasteFormat(fmt)}
                >
                  {fmt.toUpperCase()}
                </button>
              ))}
            </div>
            <textarea
              className="paste-area"
              rows={6}
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}
              placeholder={
                pasteFormat === 'json'
                  ? '{\n  "entries": [\n    {"title": "Concept", "note": "Description..."}\n  ]\n}'
                  : pasteFormat === 'md'
                    ? '# Concept Title\nDetailed note about this concept...\n\n# Second Concept\nAnother note...'
                    : 'title,note,type\n"Concept","Description",concept'
              }
            />
            <button type="button" className="parse-btn" disabled={!pasteText.trim()} onClick={handleParsePaste}>
              Parse Text
            </button>
          </div>
        ) : (
          <div className="import-gh-section">
            <div
              className="gh-inputs-row"
              style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}
            >
              <label className="mini-field" style={{ flex: '1 1 200px' }}>
                <span>Repository (owner/repo)</span>
                <input
                  type="text"
                  value={ghRepo}
                  placeholder="e.g. Roooted1776/Brain"
                  onChange={e => setGhRepo(e.target.value)}
                  aria-label="GitHub Repository"
                />
              </label>
              <label className="mini-field" style={{ flex: '1 1 240px' }}>
                <span>Personal Access Token</span>
                <input
                  type="password"
                  value={ghToken}
                  placeholder="Optional for public repos"
                  autoComplete="off"
                  onChange={e => setGhToken(e.target.value)}
                  aria-label="GitHub Token"
                />
              </label>
            </div>

            <div
              className="gh-options-row"
              style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'center', margin: '8px 0 12px' }}
            >
              <label className="sw sm">
                <input type="checkbox" checked={ghIncReadme} onChange={e => setGhIncReadme(e.target.checked)} />
                <span>README & Docs</span>
              </label>

              <label className="sw sm">
                <input type="checkbox" checked={ghIncIssues} onChange={e => setGhIncIssues(e.target.checked)} />
                <span>Issues</span>
              </label>
              {ghIncIssues && (
                <select
                  value={ghIssueState}
                  onChange={e => setGhIssueState(e.target.value as 'open' | 'closed' | 'all')}
                  className="sm"
                  aria-label="Issue State Filter"
                  style={{
                    background: 'var(--card-bg, #1e1e24)',
                    color: 'var(--txt, #fff)',
                    border: '1px solid var(--tile-border, #333)',
                    padding: '2px 6px',
                    fontSize: '13px',
                  }}
                >
                  <option value="open">Open Issues</option>
                  <option value="closed">Closed Issues</option>
                  <option value="all">All Issues</option>
                </select>
              )}

              <label className="sw sm">
                <input type="checkbox" checked={ghIncCommits} onChange={e => setGhIncCommits(e.target.checked)} />
                <span>Recent Commits</span>
              </label>
            </div>

            <button
              type="button"
              className="parse-btn gh-fetch-btn"
              disabled={busy || !ghRepo.trim()}
              onClick={handleFetchGitHub}
            >
              {busy ? 'Connecting to GitHub…' : 'Fetch from GitHub'}
            </button>

            {ghItems.length > 0 && (
              <div className="parsed-list gh-preview-list">
                <h4>Detected GitHub Memories ({ghItems.length})</h4>
                <ul>
                  {ghItems.map((it, idx) => (
                    <li key={`${it.title}-${idx}`}>
                      <span className="file-name">{it.title}</span>
                      <span
                        className="file-count"
                        style={{
                          color:
                            it.type === 'concept'
                              ? 'var(--blue, #4285f4)'
                              : it.type === 'workstream'
                                ? 'var(--green, #34a853)'
                                : 'var(--purple, #9b72cb)',
                        }}
                      >
                        [{it.type}]
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {status && <div className="import-status">{status}</div>}

        <footer className="import-footer">
          <button
            type="button"
            className="primary import-confirm-btn"
            disabled={allItems.length === 0 || busy}
            onClick={doImport}
          >
            {busy ? 'Importing…' : `Import ${allItems.length} Memories into "${targetProject}"`}
          </button>
          <button type="button" onClick={onClose}>
            {allItems.length === 0 && status ? 'Done' : 'Cancel'}
          </button>
        </footer>
      </div>
    </div>
  );
}
