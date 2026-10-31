import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useAuth } from '../auth-store';
import { PASS_MIN } from '../lib/auth';

/** Minimal access card: just the fields. The heading is for screen readers only. */
function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="access">
      <section className="card minimal" aria-labelledby="t">
        <h1 id="t" className="sr-only">
          {title}
        </h1>
        {children}
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

/** First run: whoever opens Brain first picks the admin username and password. */
export function Setup() {
  const { setup, busy, error, setPhase } = useAuth();
  const [name, setName] = useState(''),
    [pass, setPass] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void setup({ name, passcode: pass });
  };
  return (
    <Shell title="Set up Brain">
      <form onSubmit={submit} autoComplete="off">
        <label className="field">
          <span>Username</span>
          {/* biome-ignore lint/a11y/noAutofocus: the setup page has one field to start in */}
          <input value={name} onChange={e => setName(e.target.value)} autoComplete="username" autoFocus required />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={pass}
            onChange={e => setPass(e.target.value)}
            autoComplete="new-password"
            minLength={PASS_MIN}
            required
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Working…' : 'Create admin'}
        </button>
        <button type="button" className="toggle-mode" onClick={() => setPhase('login')}>
          Already an admin? Sign in
        </button>
      </form>
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
    <Shell title="Sign in to Brain">
      <form onSubmit={submit}>
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
        <label className="field">
          <span>Username</span>
          {/* biome-ignore lint/a11y/noAutofocus: the sign-in page has one field to start in */}
          <input value={name} onChange={e => setName(e.target.value)} autoComplete="username" autoFocus required />
        </label>
        <label className="field">
          <span>Password</span>
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
        <p className="lead">Admin sign-in only.</p>
      </form>
    </Shell>
  );
}
