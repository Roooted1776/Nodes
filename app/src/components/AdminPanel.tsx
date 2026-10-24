import { useState, type ReactNode } from 'react';
import { useAuth } from '../auth-store';
import { readAudit } from '../lib/audit';
import { PASS_MIN, ROLE_LABEL, type Role } from '../lib/auth';
import { MODEL_RE, PROV, PROVIDERS, type ProviderId } from '../lib/providers';
import { KEY_GUIDE } from '../lib/keyguide';
import { report, runAll, type Check } from '../lib/selfcheck';
import { fmtDate } from '../lib/text';
import { useMem, useStore } from '../store';
import { AgeFields, emptyDob } from './AgeFields';
import KeyGuide from './KeyGuide';

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
  const [key, setKey] = useState(''),
    [restore, setRestore] = useState(''),
    [phrase, setPhrase] = useState(''),
    [msg, setMsg] = useState(''),
    [sure, setSure] = useState(false);
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
              setKey('');
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
            value={live.models[live.provider]}
            onChange={e => {
              const v = e.target.value.trim();
              if (MODEL_RE.test(v)) s.setLive({ models: { ...live.models, [live.provider]: v } });
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
              s.setKey(e.target.value);
            }}
          />
          <Switch
            on={live.remember}
            set={v => s.setLive({ remember: v })}
            label="Remember on this device (encrypted)"
          />
          <div className="row">
            <button type="button" onClick={() => void s.testProvider()}>
              Test (1 call)
            </button>
            <button type="button" onClick={s.forgetKey}>
              Forget
            </button>
            <a className="btnlink sm" href={KEY_GUIDE[live.provider].url} target="_blank" rel="noopener noreferrer">
              Get a key ↗
            </a>
          </div>
        </Card>
        <Card title="Limits" hint="Per page load. Reload to reset.">
          <label className="mini-field">
            <span>Tokens per reply</span>
            <input
              type="number"
              min={20}
              max={150}
              value={live.maxTokens}
              onChange={e => s.setLive({ maxTokens: Math.max(20, Math.min(150, +e.target.value || 120)) })}
            />
          </label>
          <label className="mini-field">
            <span>Calls</span>
            <input
              type="number"
              min={1}
              max={9}
              value={live.callCap}
              onChange={e => s.setLive({ callCap: Math.max(1, Math.min(9, +e.target.value || 9)) })}
            />
          </label>
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
            defaultValue={mem.settings.instructions}
            onBlur={e => s.setSetting({ instructions: e.target.value })}
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
            placeholder="Paste a backup to restore"
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

      <p className="group">People and safety</p>
      <div className="cards">
        <Accounts />
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
  ['Locked down', 'Only the page script runs, and it can only reach the four AI providers.'],
  ['Auto-lock', 'After 15 idle minutes, a minute hidden, or Esc twice.'],
  ['Adults only', 'Date of birth is checked once and never stored. It cannot prove age.'],
  ['Limits', 'No server and no certification. No recovery if every admin passcode is lost.'],
];

function Accounts() {
  const { db, user, addUser, dropUser, resetPasscode, busy, error } = useAuth();
  useAuth(a => a.rev);
  const [name, setName] = useState(''),
    [role, setRole] = useState<Role>('viewer'),
    [pass, setPass] = useState(''),
    [dob, setDob] = useState(emptyDob()),
    [ok, setOk] = useState(''),
    [note, setNote] = useState('');
  return (
    <Card title="Accounts" hint="Admins add accounts. Adults only. Viewers can only read and watch." wide>
      <ul className="users">
        {db.users.map(u => (
          <li key={u.id}>
            <b>{u.name}</b>
            <span className={'role ' + u.role}>{ROLE_LABEL[u.role]}</span>
            <small>since {fmtDate(u.created)}</small>
            <button
              type="button"
              onClick={() => {
                const p = prompt(`New passcode for ${u.name} (${PASS_MIN}+ characters)`);
                if (p) void resetPasscode(u.id, p).then(m => setNote(m || `Passcode changed for ${u.name}.`));
              }}
            >
              Reset passcode
            </button>
            <button
              type="button"
              className="danger"
              onClick={() => {
                if (confirm(`Remove ${u.name}?`)) setNote(dropUser(u.id));
              }}
              disabled={u.id === user?.id && db.users.filter(x => x.role === 'admin').length <= 1}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      {note && <p className="notice">{note}</p>}
      <form
        className="addnote"
        autoComplete="off"
        onSubmit={e => {
          e.preventDefault();
          setOk('');
          void addUser({ name, role, passcode: pass, dob }).then(done => {
            if (done) {
              setOk(`Added ${name}.`);
              setName('');
              setPass('');
              setDob(emptyDob());
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
          placeholder={`Passcode (${PASS_MIN}+ characters)`}
          autoComplete="new-password"
          aria-label="Passcode"
          required
        />
        <AgeFields value={dob} onChange={setDob} />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {ok && <p className="notice">{ok}</p>}
        <button type="submit" className="primary" disabled={busy}>
          Add account
        </button>
      </form>
    </Card>
  );
}

function AccessLog() {
  const [open, setOpen] = useState(false),
    log = open ? readAudit(localStorage).slice(-60).reverse() : [];
  return (
    <Card title="Access log" hint="Kept on this device. No passcodes or task text." wide>
      <details onToggle={e => setOpen((e.target as HTMLDetailsElement).open)}>
        <summary>Show the last 60 events</summary>
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
