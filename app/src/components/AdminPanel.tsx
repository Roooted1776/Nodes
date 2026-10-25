import { useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '../auth-store';
import { readAudit } from '../lib/cloud';
import type { AuditEvent } from '../lib/audit';
import { PASS_MIN, ROLE_LABEL, type Role } from '../lib/auth';
import { MODEL_RE, PROV, PROVIDERS, type ProviderId } from '../lib/providers';
import { KEY_GUIDE } from '../lib/keyguide';
import { report, runAll, type Check } from '../lib/selfcheck';
import { AGENTS } from '../data/team';
import { useMem, useStore } from '../store';
import KeyGuide from './KeyGuide';
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
  const [key, setKey] = useState(s.keys[live.provider] || ''),
    [modelText, setModelText] = useState(live.models[live.provider] || PROV[live.provider].model),
    [maxTokensText, setMaxTokensText] = useState(String(live.maxTokens)),
    [callCapText, setCallCapText] = useState(String(live.callCap)),
    [focusText, setFocusText] = useState(mem.settings.instructions || ''),
    [compKeys, setCompKeys] = useState<Partial<Record<ProviderId, string>>>({}),
    [restore, setRestore] = useState(''),
    [phrase, setPhrase] = useState(''),
    [msg, setMsg] = useState(''),
    [sure, setSure] = useState(false);

  useEffect(() => {
    setKey(s.keys[live.provider] || '');
    setModelText(live.models[live.provider] || PROV[live.provider].model);
  }, [live.provider, s.keys[live.provider], live.models[live.provider]]);

  useEffect(() => {
    setMaxTokensText(String(live.maxTokens));
  }, [live.maxTokens]);

  useEffect(() => {
    setCallCapText(String(live.callCap));
  }, [live.callCap]);

  useEffect(() => {
    setFocusText(mem.settings.instructions || '');
  }, [mem.settings.instructions]);

  const ready = !!s.keys[live.provider];
  return (
    <section className="panel admin" aria-label="Admin">
      <p className="group">Real AI</p>
      <div className="cards">
        {!ready && <KeyGuide wide />}
        <Card title="Status" hint="Brain always uses a real AI model. A task is sent only when you press Send.">
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
        <Card title="API key" hint={`From ${KEY_GUIDE[live.provider].site}. Never paste a key into a chat.`}>
          <input
            aria-label="API key"
            type="password"
            value={key}
            placeholder={ready ? 'Key is set for this tab' : PROV[live.provider].hint}
            autoComplete="off"
            onChange={e => {
              setKey(e.target.value);
              s.setKey(e.target.value, live.provider);
            }}
          />
          <Switch
            on={live.remember}
            set={v => s.setLive({ remember: v })}
            label="Save keys in encrypted vault (persistent)"
          />
          <div className="row">
            <button type="button" onClick={() => void s.testProvider(live.provider)}>
              Test (1 call)
            </button>
            <button
              type="button"
              onClick={() => {
                s.forgetKey(live.provider);
                setKey('');
              }}
            >
              Forget
            </button>
            <a className="btnlink sm" href={KEY_GUIDE[live.provider].url} target="_blank" rel="noopener noreferrer">
              Get a key ↗
            </a>
          </div>
        </Card>
        <Card
          title="All Company API Keys"
          hint="Connect keys for any or all AI companies. When connected, each bot calls its native company directly (Claude -> Anthropic, Codex -> OpenAI, Gemini -> Google, Grok -> xAI)."
          wide
        >
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
                      <small>
                        {p === 'anthropic'
                          ? 'Claude, Artifact'
                          : p === 'openai'
                            ? 'Codex, ChatGPT, Canvas, Muse'
                            : p === 'google'
                              ? 'Gemini'
                              : 'Grok, Grok Bot'}
                      </small>
                    </span>
                    <span className={`pill ${has ? (isDead ? 'warn' : 'ok') : ''}`}>
                      {isDead ? 'Key rejected' : has ? 'Key set' : 'Not set'}
                    </span>
                  </div>
                  <div className="company-key-row">
                    <input
                      type="password"
                      aria-label={`${PROV[p].label} key`}
                      value={compKeys[p] ?? (s.keys[p] || '')}
                      placeholder={has ? 'Key is set (encrypted)' : `Starts with ${g.prefix}`}
                      autoComplete="off"
                      onChange={e => {
                        const val = e.target.value;
                        setCompKeys(prev => ({ ...prev, [p]: val }));
                        s.setKey(val, p);
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
                        setCompKeys(prev => ({ ...prev, [p]: '' }));
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
        <Card title="Limits" hint="Per page load. Reload to reset.">
          <label className="mini-field">
            <span>Tokens per reply</span>
            <input
              type="number"
              min={20}
              max={150}
              value={maxTokensText}
              onChange={e => {
                setMaxTokensText(e.target.value);
                const n = +e.target.value;
                if (Number.isFinite(n) && n >= 20 && n <= 150) s.setLive({ maxTokens: n });
              }}
              onBlur={() => {
                const n = Math.max(20, Math.min(150, Math.round(+maxTokensText || 120)));
                setMaxTokensText(String(n));
                s.setLive({ maxTokens: n });
              }}
            />
          </label>
          <label className="mini-field">
            <span>Calls</span>
            <input
              type="number"
              min={1}
              max={9}
              value={callCapText}
              onChange={e => {
                setCallCapText(e.target.value);
                const n = +e.target.value;
                if (Number.isFinite(n) && n >= 1 && n <= 9) s.setLive({ callCap: n });
              }}
              onBlur={() => {
                const n = Math.max(1, Math.min(9, Math.round(+callCapText || 9)));
                setCallCapText(String(n));
                s.setLive({ callCap: n });
              }}
            />
          </label>
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
        <Card title="Memory" hint="Written by Grok Bot (AI) after each task, plus your own notes.">
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
        {SECURITY.map(([t, h]) => (
          <Card key={t} title={t} hint={h} />
        ))}
      </div>
    </section>
  );
}

/** What the security does and does not do, one short box each. */
const SECURITY: [string, string][] = [
  ['Encrypted', 'Memory and remembered keys are stored only as AES-256-GCM ciphertext.'],
  ['Admin-signed', 'Every save is signed with a key only admins hold. A changed copy is refused.'],
  ['Locked down', 'Only the page script runs. Connections are limited to Brain’s database and the four AI providers.'],
  ['Auto-lock', 'After 15 idle minutes, a minute hidden, or Esc twice.'],
  ['Limits', 'No certification. No memory recovery if every admin password is lost.'],
];

function Accounts() {
  const { db, user, addUser, dropUser, resetPasscode, busy, error } = useAuth();
  useAuth(a => a.rev);
  const [name, setName] = useState(''),
    [role, setRole] = useState<Role>('viewer'),
    [pass, setPass] = useState(''),
    [ok, setOk] = useState(''),
    [note, setNote] = useState('');
  return (
    <Card title="Accounts" hint="Create logins connected to the database. Admins or Viewers.">
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
          void addUser({ name, role, passcode: pass }).then(done => {
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
          <select value={role} onChange={e => setRole(e.target.value as Role)} aria-label="Role">
            <option value="viewer">Viewer</option>
            <option value="admin">Admin</option>
          </select>
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
