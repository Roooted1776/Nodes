import { useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '../auth-store';
import { readAudit } from '../lib/cloud';
import type { AuditEvent } from '../lib/audit';
import { PASS_MIN, ROLE_LABEL } from '../lib/auth';
import { MODEL_RE, PROV, PROVIDERS, type ProviderId } from '../lib/providers';
import { KEY_GUIDE } from '../lib/keyguide';
import { report, runAll, type Check } from '../lib/selfcheck';
import { AGENTS } from '../data/team';
import { useMem, useStore } from '../store';
import { downloadFile } from '../lib/file-import';

/** One small box: a short title, one line of help, then its controls. */
function Card({
  title,
  hint,
  children,
  wide,
  tone,
}: {
  title: string;
  hint?: string;
  children?: ReactNode;
  wide?: boolean;
  tone?: 'warn';
}) {
  return (
    <section className={'card2' + (wide ? ' wide' : '') + (tone ? ' ' + tone : '')}>
      <h3>{title}</h3>
      {hint && <p className="hint2">{hint}</p>}
      {children}
    </section>
  );
}
const Switch = ({ on, set, label }: { on: boolean; set(v: boolean): void; label: string }) => (
  <label className="sw">
    <input type="checkbox" checked={on} onChange={e => set(e.target.checked)} />
    <span>{label}</span>
  </label>
);

export default function AdminPanel() {
  const s = useStore(),
    mem = useMem(),
    { live } = s;
  const [modelText, setModelText] = useState(live.models[live.provider] || PROV[live.provider].model),
    [focusText, setFocusText] = useState(mem.settings.instructions || ''),
    [restore, setRestore] = useState(''),
    [phrase, setPhrase] = useState(''),
    [msg, setMsg] = useState(''),
    [sure, setSure] = useState(false),
    [ghRepo, setGhRepo] = useState(s.githubRepo),
    [ghToken, setGhToken] = useState(s.githubToken),
    [ghTesting, setGhTesting] = useState(false),
    [ghSyncing, setGhSyncing] = useState(false),
    [ghResult, setGhResult] = useState(''),
    [ghDifferential, setGhDifferential] = useState(true),
    [ghIncReleases, setGhIncReleases] = useState(true);

  useEffect(() => {
    setGhRepo(s.githubRepo);
    setGhToken(s.githubToken);
  }, [s.githubRepo, s.githubToken]);

  useEffect(() => {
    setModelText(live.models[live.provider] || PROV[live.provider].model);
  }, [live.provider, live.models[live.provider]]);

  useEffect(() => {
    setFocusText(mem.settings.instructions || '');
  }, [mem.settings.instructions]);

  const ready = !!s.keys[live.provider];
  return (
    <section className="panel admin" aria-label="Admin">
      <p className="group">Real AI</p>
      <div className="cards">
        <Card
          title="Status"
          hint={ready ? 'A task is sent only when you press Send.' : 'Add a key under API keys to start.'}
        >
          <p className={'pill ' + (ready && !s.dead[live.provider] ? 'ok' : 'warn')}>
            {s.dead[live.provider] ? 'Key rejected' : ready ? `${PROV[live.provider].label} ready` : 'Add a key'}
          </p>
          <p className="stat">
            {s.calls}
            <small> of {live.callCap} calls</small>
          </p>
          <p className="mini">
            tokens in {s.tin} · out {s.tout}
            {s.stopped ? ' · stopped' : ''}
          </p>
        </Card>
        <Card title="Provider" hint="One provider powers all nine roles.">
          <Switch
            on={live.web}
            set={v => s.setLive({ web: v })}
            label="Bots can search the web (Anthropic, OpenAI, Google, xAI, Groq)"
          />
          <select
            aria-label="Provider"
            value={live.provider}
            onChange={e => {
              s.setLive({ provider: e.target.value as ProviderId });
            }}
          >
            {PROVIDERS.map(p => (
              <option key={p} value={p}>
                {PROV[p].label}
              </option>
            ))}
          </select>
          <input
            aria-label="Model"
            value={modelText}
            onChange={e => {
              setModelText(e.target.value);
              const v = e.target.value.trim();
              if (MODEL_RE.test(v)) s.setLive({ models: { ...live.models, [live.provider]: v } });
            }}
            onBlur={() => {
              const v = modelText.trim();
              if (MODEL_RE.test(v)) {
                s.setLive({ models: { ...live.models, [live.provider]: v } });
              } else {
                setModelText(live.models[live.provider] || PROV[live.provider].model);
              }
            }}
          />
        </Card>
        <Card
          title="API keys"
          hint="Paste a key for any company, then press Test. Each bot uses its own company's key when there is one. Keys are saved encrypted."
          wide
        >
          {s.status && (
            <p className="mini key-status" role="status">
              {s.status}
            </p>
          )}
          <div className="company-keys-list">
            {PROVIDERS.map(p => {
              const has = !!s.keys[p];
              const isDead = !!s.dead[p];
              const g = KEY_GUIDE[p];
              return (
                <div key={p} className="company-key-card">
                  <div className="company-key-head">
                    <span className="company-tag" style={{ borderLeftColor: PROV[p].color }}>
                      <b style={{ color: PROV[p].color }}>{PROV[p].label}</b>
                      <small>{PROV[p].roles}</small>
                    </span>
                    <span className={`pill ${has ? (isDead ? 'warn' : 'ok') : ''}`}>
                      {isDead ? 'Key rejected' : has ? 'Key set' : 'Not set'}
                    </span>
                  </div>
                  <div className="company-key-row">
                    <input
                      type="password"
                      aria-label={`${PROV[p].label} key`}
                      value={s.keys[p] || ''}
                      placeholder={has ? 'Key is set (encrypted)' : g.prefix ? `Starts with ${g.prefix}` : PROV[p].hint}
                      autoComplete="off"
                      onChange={e => {
                        s.setKey(e.target.value, p);
                      }}
                    />
                    <button type="button" className="sm" disabled={!s.keys[p]} onClick={() => void s.testProvider(p)}>
                      Test
                    </button>
                    <button
                      type="button"
                      className="sm"
                      disabled={!s.keys[p]}
                      onClick={() => {
                        s.forgetKey(p);
                      }}
                    >
                      Clear
                    </button>
                    <a className="btnlink sm" href={g.url} target="_blank" rel="noopener noreferrer">
                      Get key ↗
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
        <Card
          title="GitHub Connector"
          hint="Connect GitHub repositories to import documentation, README files, issues, and recent commits into Brain's neural graph."
          wide
        >
          <div className="gh-connector-box">
            {s.githubRecentRepos && s.githubRecentRepos.length > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span className="mini" style={{ color: 'var(--sub, #999)' }}>
                  Recent:
                </span>
                <select
                  className="sm"
                  value={ghRepo}
                  onChange={e => {
                    const r = e.target.value;
                    if (r) {
                      setGhRepo(r);
                      s.setGithubConfig({ repo: r });
                      s.setActiveProject(r);
                    }
                  }}
                  aria-label="Recent Repositories"
                  style={{
                    background: 'var(--card-bg, #1e1e24)',
                    color: 'var(--txt, #fff)',
                    border: '1px solid var(--tile-border, #333)',
                    padding: '2px 6px',
                  }}
                >
                  {s.githubRecentRepos.map(r => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="gh-row" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <label className="mini-field" style={{ flex: '1 1 240px' }}>
                <span>Repository (owner/repo)</span>
                <input
                  type="text"
                  value={ghRepo}
                  placeholder="e.g. Roooted1776/Brain"
                  onChange={e => {
                    setGhRepo(e.target.value);
                    s.setGithubConfig({ repo: e.target.value });
                  }}
                  aria-label="GitHub Repository"
                />
              </label>
              <label className="mini-field" style={{ flex: '2 1 320px' }}>
                <span>Personal Access Token</span>
                <input
                  type="password"
                  value={ghToken}
                  placeholder="Optional for public repos (ghp_... or github_pat_...)"
                  autoComplete="off"
                  onChange={e => {
                    setGhToken(e.target.value);
                    s.setGithubConfig({ token: e.target.value });
                  }}
                  aria-label="GitHub Personal Access Token"
                />
              </label>
            </div>
            <div
              className="gh-options-row"
              style={{
                display: 'flex',
                gap: '14px',
                flexWrap: 'wrap',
                alignItems: 'center',
                margin: '8px 0',
              }}
            >
              <label className="sw sm">
                <input type="checkbox" checked={ghIncReleases} onChange={e => setGhIncReleases(e.target.checked)} />
                <span>Releases & Milestones</span>
              </label>
              <label className="sw sm">
                <input type="checkbox" checked={ghDifferential} onChange={e => setGhDifferential(e.target.checked)} />
                <span>Sync changes only</span>
              </label>
              {s.githubLastSync[ghRepo] && (
                <span
                  className="pill ok"
                  style={{ fontSize: '11px' }}
                  title={`Last synced: ${new Date(s.githubLastSync[ghRepo].date).toLocaleString()}`}
                >
                  Synced {new Date(s.githubLastSync[ghRepo].date).toLocaleDateString()}
                </span>
              )}
            </div>
            <div className="row" style={{ marginTop: '8px', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <button
                type="button"
                className="sm"
                disabled={ghTesting || !ghRepo.trim()}
                onClick={async () => {
                  setGhTesting(true);
                  try {
                    const r = await s.testGithub(ghRepo, ghToken);
                    setGhResult(r.message);
                  } catch (e: unknown) {
                    const errMsg = e instanceof Error ? e.message : String(e);
                    setGhResult(errMsg || 'Connection check failed.');
                  } finally {
                    setGhTesting(false);
                  }
                }}
              >
                {ghTesting ? 'Testing…' : 'Test Connection'}
              </button>
              <button
                type="button"
                className="sm primary"
                disabled={ghSyncing || !ghRepo.trim()}
                onClick={async () => {
                  setGhSyncing(true);
                  try {
                    const res = await s.syncGithub({
                      includeReleases: ghIncReleases,
                      differential: ghDifferential,
                    });
                    setGhResult(`✓ Synced ${res.total} items (${res.added} new, ${res.updated} updated).`);
                  } catch (e: unknown) {
                    const errMsg = e instanceof Error ? e.message : String(e);
                    setGhResult(`Sync failed: ${errMsg}`);
                  } finally {
                    setGhSyncing(false);
                  }
                }}
              >
                {ghSyncing ? 'Syncing…' : 'Sync to Brain'}
              </button>
              <button
                type="button"
                className="sm"
                disabled={!ghToken && !ghRepo}
                onClick={() => {
                  setGhToken('');
                  s.setGithubConfig({ token: '' });
                  setGhResult('Token cleared.');
                }}
              >
                Clear Token
              </button>
              <a
                className="btnlink sm"
                href="https://github.com/settings/tokens/new?scopes=repo&description=Brain+Connector"
                target="_blank"
                rel="noopener noreferrer"
              >
                Get GitHub token ↗
              </a>
              {ghResult && (
                <span className="mini" style={{ color: 'var(--txt)' }}>
                  {ghResult}
                </span>
              )}
            </div>
          </div>
        </Card>
        <Card
          title="Bots & Credits"
          hint="Dynamically filters out bots whose providers have no credits, rearranging the 3D brain and live handoff chain so work continues autonomously."
          wide
        >
          <div className="bot-auto-update-bar">
            <Switch on={s.autoUpdateBots} set={s.setAutoUpdateBots} label="Auto update enabled for all bots" />
            <button type="button" className="sm" onClick={s.updateAllBots}>
              Update all bots now
            </button>
          </div>
          <div className="bot-credits-list">
            {AGENTS.map(a => {
              const active = !s.inactiveBots.includes(a.id);
              return (
                <div key={a.id} className="bot-credit-item">
                  <Switch
                    on={active}
                    set={val => s.setBotActive(a.id, val)}
                    label={`${a.name} (${a.company}) — ${a.role}`}
                  />
                  <span className={`pill ${active ? 'ok' : 'warn'}`}>{active ? 'Active' : 'No Credits'}</span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <p className="group">Brain</p>
      <div className="cards">
        <Card
          title="Memory"
          hint="Works like Perplexity Brain: tasks, files, GitHub and your corrections wait in an inbox. Dream (one AI call) turns them into linked pages that cite their sources. It runs by itself once a day."
        >
          <p className="mini">
            Inbox: {mem.inbox.length} waiting · {mem.entries.length} pages · last Dream{' '}
            {mem.lastDream ? new Date(mem.lastDream).toLocaleString() : 'never'}
          </p>
          <div className="row">
            <button type="button" disabled={s.dreaming || !mem.inbox.length} onClick={() => void s.dream()}>
              {s.dreaming ? 'Dreaming…' : 'Dream now'}
            </button>
          </div>
          <Switch on={mem.settings.brain} set={v => s.setSetting({ brain: v })} label="Save new tasks" />
          <Switch
            on={!!mem.settings.useMemory}
            set={v => s.setSetting({ useMemory: v })}
            label="Send matching memory with a task (the team learns from itself)"
          />
          {mem.archived.length > 0 && (
            <p className="mini">
              {mem.archived.length} older memories made without AI are archived: not shown, not sent.
            </p>
          )}
          <Switch on={s.incognito} set={v => s.set({ incognito: v })} label="Incognito (save nothing)" />
        </Card>
        <Card title="Focus" hint="What Brain should pay attention to.">
          <textarea
            aria-label="Focus"
            rows={3}
            maxLength={400}
            value={focusText}
            onChange={e => setFocusText(e.target.value)}
            onBlur={() => s.setSetting({ instructions: focusText })}
          />
        </Card>
        <Card title="Backup" hint="Encrypted with a passphrase you choose.">
          <input
            type="password"
            aria-label="Backup passphrase"
            value={phrase}
            onChange={e => setPhrase(e.target.value)}
            autoComplete="off"
            placeholder="Passphrase, 10+ characters"
          />
          <small className="mini">
            {phrase.length < 10 ? `${phrase.length}/10 characters minimum` : 'Passphrase ready'}
          </small>
          <div className="row">
            <button
              type="button"
              disabled={phrase.length < 10}
              onClick={() => {
                void s
                  .backup(phrase)
                  .then(t => navigator.clipboard?.writeText(t))
                  .then(
                    () => setMsg('Encrypted backup copied.'),
                    e => setMsg(e?.message || 'Backup failed.'),
                  );
              }}
            >
              Copy backup
            </button>
            <button
              type="button"
              disabled={phrase.length < 10}
              onClick={() => {
                void s
                  .backup(phrase)
                  .then(t => downloadFile(`brain-backup-${new Date().toISOString().slice(0, 10)}.json`, t))
                  .then(
                    () => setMsg('Encrypted backup downloaded.'),
                    e => setMsg(e?.message || 'Backup failed.'),
                  );
              }}
            >
              Download file
            </button>
            <label className="btn-file">
              Load file
              <input
                type="file"
                accept=".json,.txt"
                style={{ display: 'none' }}
                onChange={async e => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const text = await file.text();
                  setRestore(text);
                  setMsg(`Loaded backup file (${(text.length / 1024).toFixed(1)} KB)`);
                  e.target.value = '';
                }}
              />
            </label>
            <button
              type="button"
              disabled={!restore.trim() || !phrase}
              onClick={() => {
                void s.restore(restore, phrase).then(setMsg);
              }}
            >
              Restore
            </button>
          </div>
          <textarea
            rows={2}
            value={restore}
            onChange={e => setRestore(e.target.value)}
            placeholder="Paste a backup or load file to restore"
            aria-label="Backup text"
          />
          <p className="mini">{msg || (s.storageOk ? '' : 'This browser is blocking storage.')}</p>
        </Card>
        <Card title="Erase" hint="Deletes all memory on this device." tone="warn">
          {sure ? (
            <div className="row">
              <button
                type="button"
                className="danger"
                onClick={() => {
                  s.erase();
                  setSure(false);
                  setMsg('Memory erased.');
                }}
              >
                Yes, erase
              </button>
              <button type="button" onClick={() => setSure(false)}>
                Keep
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setSure(true)}>
              Erase memory
            </button>
          )}
        </Card>
      </div>

      <p className="group">Logins</p>
      <div className="cards">
        <Accounts />
      </div>

      <p className="group">Safety</p>
      <div className="cards">
        <SystemCheck />
        <AccessLog />
      </div>
    </section>
  );
}

function Accounts() {
  const { db, user, addUser, dropUser, resetPasscode, busy, error } = useAuth();
  useAuth(a => a.rev);
  const [name, setName] = useState(''),
    [pass, setPass] = useState(''),
    [ok, setOk] = useState(''),
    [note, setNote] = useState('');
  return (
    <Card title="Accounts" hint="Create admin logins connected to the database.">
      <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
        <p className="pill ok" style={{ margin: 0 }}>
          Database connected
        </p>
        <span className="mini">
          {db.users.length} login{db.users.length === 1 ? '' : 's'}
        </span>
      </div>
      <form
        className="addnote"
        autoComplete="off"
        onSubmit={e => {
          e.preventDefault();
          setOk('');
          void addUser({ name, role: 'admin', passcode: pass }).then(done => {
            if (done) {
              setOk(`Added ${name}.`);
              setName('');
              setPass('');
            }
          });
        }}
      >
        <div className="row">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Name" aria-label="Name" required />
        </div>
        <input
          type="password"
          value={pass}
          onChange={e => setPass(e.target.value)}
          placeholder={`Password (${PASS_MIN}+ characters)`}
          autoComplete="new-password"
          aria-label="Password"
          required
        />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {ok && <p className="notice">{ok}</p>}
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Saving…' : 'Add account'}
        </button>
      </form>
      {note && <p className="notice">{note}</p>}
      <ul className="users" style={{ margin: '4px 0 0', padding: 0 }}>
        {db.users.map(u => (
          <li key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <b style={{ marginRight: 'auto' }}>{u.name}</b>
            <span className={'pill ' + (u.role === 'admin' ? 'ok' : '')}>{ROLE_LABEL[u.role]}</span>
            <button
              type="button"
              className="sm"
              onClick={() => {
                const p = prompt(`New password for ${u.name} (${PASS_MIN}+ characters)`);
                if (p) void resetPasscode(u.id, p).then(m => setNote(m || `Password changed for ${u.name}.`));
              }}
            >
              Reset
            </button>
            <button
              type="button"
              className="sm danger"
              onClick={() => {
                if (confirm(`Remove ${u.name}?`)) void dropUser(u.id).then(setNote);
              }}
              disabled={u.id === user?.id && db.users.filter(x => x.role === 'admin').length <= 1}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function AccessLog() {
  const [open, setOpen] = useState(false),
    [log, setLog] = useState<AuditEvent[]>([]),
    [error, setError] = useState('');
  useEffect(() => {
    if (open) void readAudit().then(setLog, () => setError('The access log could not be loaded.'));
  }, [open]);
  return (
    <Card title="Access log" hint="Kept in the database. No passcodes or task text." wide>
      <details onToggle={e => setOpen((e.target as HTMLDetailsElement).open)}>
        <summary>Show the last 60 events</summary>
        {error && <p role="alert">{error}</p>}
        <ol className="audit">
          {log.map((a, i) => (
            <li key={i}>
              <time>{new Date(a.t).toISOString().slice(0, 19).replace('T', ' ')}Z</time>
              <b>{a.who}</b>
              <span>{a.what}</span>
            </li>
          ))}
        </ol>
      </details>
    </Card>
  );
}

/** Runs in this browser the checks the build cannot: GPU shaders, drawing, encryption, the content policy and storage. */
function SystemCheck() {
  const [list, setList] = useState<Check[] | null>(null),
    [busy, setBusy] = useState(false),
    [copied, setCopied] = useState(false);
  const run = async () => {
    setBusy(true);
    setCopied(false);
    try {
      setList(await runAll());
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card
      title="System check"
      hint="GPU shaders, drawing, encryption, content policy, storage. Open the Brain view first."
      wide
    >
      <div className="row">
        <button type="button" className="primary" onClick={() => void run()} disabled={busy}>
          {busy ? 'Checking…' : 'Run system check'}
        </button>
        {list && (
          <button
            type="button"
            onClick={() => void navigator.clipboard?.writeText(report(list)).then(() => setCopied(true))}
          >
            {copied ? 'Copied' : 'Copy report'}
          </button>
        )}
      </div>
      {list && (
        <ul className="checks">
          {list.map(c => (
            <li key={c.name} className={c.status}>
              <b>
                {c.status === 'pass' ? '✓' : c.status === 'fail' ? '✕' : c.status === 'warn' ? '!' : '–'} {c.name}
              </b>
              <span>{c.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
