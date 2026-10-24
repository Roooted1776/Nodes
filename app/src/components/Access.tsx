import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useAuth } from '../auth-store';
import { AgeFields, emptyDob } from './AgeFields';

/** Small facts under the form, one per box. */
type Tile = [string, string];
function Shell({ title, lead, tiles, children }: { title: string; lead: string; tiles: Tile[]; children: ReactNode }) {
  return (
    <main className="access">
      <section className="card" aria-labelledby="t">
        <p className="terminal" aria-hidden="true">
          ACCESS TERMINAL · ENCRYPTED STORAGE
        </p>
        <h1 id="t">{title}</h1>
        <p className="lead">{lead}</p>
        {children}
        <ul className="tiles" aria-label="About this system">
          {tiles.map(([b, t]) => (
            <li key={b}>
              <b>{b}</b>
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
function useCountdown(until: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (until <= Date.now()) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [until]);
  return Math.max(0, Math.ceil((until - now) / 1000));
}

export function Setup() {
  const { setup, busy, error, ageBlocked } = useAuth();
  const [name, setName] = useState('Owner'),
    [pass, setPass] = useState(''),
    [pass2, setPass2] = useState(''),
    [code, setCode] = useState(''),
    [dob, setDob] = useState(emptyDob()),
    [local, setLocal] = useState('');
  const blocked = ageBlocked();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (pass !== pass2) return setLocal('The two passcodes do not match.');
    setLocal('');
    void setup({ name, passcode: pass, dob, code });
  };
  return (
    <Shell
      title="Set up Brain"
      lead="Create the first admin."
      tiles={[
        ['Admins add', 'Only admins can add to Brain'],
        ['Encrypted', 'Memory is locked with your passcode'],
        ['No recovery', 'A lost passcode cannot be reset'],
      ]}
    >
      {blocked ? (
        <>
          <p className="error" role="alert">
            {error || 'New accounts are paused on this browser. Try again later.'}
          </p>
          {error && <p className="lead">New accounts are now paused on this browser. Try again later.</p>}
        </>
      ) : (
        <form onSubmit={submit} autoComplete="off">
          <label className="field">
            <span>Name</span>
            <input value={name} onChange={e => setName(e.target.value)} autoComplete="username" required />
          </label>
          <label className="field">
            <span>Passcode</span>
            <input
              type="password"
              value={pass}
              onChange={e => setPass(e.target.value)}
              autoComplete="new-password"
              required
            />
            <small>At least 5 characters. There is no way to recover it.</small>
          </label>
          <label className="field">
            <span>Repeat passcode</span>
            <input
              type="password"
              value={pass2}
              onChange={e => setPass2(e.target.value)}
              autoComplete="new-password"
              required
            />
          </label>
          <label className="field">
            <span>Setup code</span>
            <input type="password" value={code} onChange={e => setCode(e.target.value)} autoComplete="off" required />
            <small>The one-time code given to the owner.</small>
          </label>
          <AgeFields value={dob} onChange={setDob} />
          {(local || error) && (
            <p className="error" role="alert">
              {local || error}
            </p>
          )}
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Working…' : 'Create admin'}
          </button>
        </form>
      )}
    </Shell>
  );
}

export function Login() {
  const { login, busy, error, notice, db } = useAuth();
  const [name, setName] = useState(''),
    [pass, setPass] = useState('');
  const wait = useCountdown(db.lockedUntil);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void login(name, pass).then(ok => {
      if (!ok) setPass('');
    });
  };
  return (
    <Shell
      title="Restricted system"
      lead="Authorized personnel only."
      tiles={[
        ['Adults only', 'Accounts are given by an admin'],
        ['Logged', 'Every sign-in attempt is recorded'],
        ['Real AI', 'The team runs on live AI models'],
      ]}
    >
      <form onSubmit={submit}>
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
        <label className="field">
          <span>Name</span>
          {/* biome-ignore lint/a11y/noAutofocus: the sign-in page has one field to start in */}
          <input value={name} onChange={e => setName(e.target.value)} autoComplete="username" autoFocus required />
        </label>
        <label className="field">
          <span>Passcode</span>
          <input
            type="password"
            value={pass}
            onChange={e => setPass(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="primary" disabled={busy || wait > 0}>
          {wait > 0 ? `Wait ${wait}s` : busy ? 'Checking…' : 'Sign in'}
        </button>
      </form>
    </Shell>
  );
}
