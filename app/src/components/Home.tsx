import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { IDLE_MS } from '../lib/auth';
import { useAuth } from '../auth-store';
import { ROLE_LABEL } from '../lib/auth';
import { useMem, useStore } from '../store';
import AdminPanel from './AdminPanel';
import ChatPanel from './ChatPanel';
import MemoryPanel from './MemoryPanel';
import TeamDiagram from './TeamDiagram';
import { AGENT_COLOR } from '../data/colors';

const BrainScene = lazy(() => import('./BrainScene'));

class Boundary extends Component<{ children: ReactNode }, { err: string }> {
  state = { err: '' };
  static getDerivedStateFromError(e: Error) {
    return { err: e.message };
  }
  render() {
    return this.state.err ? (
      <div className="fallback">
        <b>The 3D brain could not start.</b>
        <p>{this.state.err}</p>
        <p>Your browser may have WebGL turned off. The Team view still works.</p>
      </div>
    ) : (
      this.props.children
    );
  }
}

export default function Home() {
  const { user, logout } = useAuth(),
    mem = useMem(),
    view = useStore(s => s.view),
    setView = useStore(s => s.setView),
    tab = useStore(s => s.tab),
    setTab = useStore(s => s.setTab),
    busy = useStore(s => s.busy);
  const admin = user?.role === 'admin',
    [open, setOpen] = useState(true);
  const t = admin ? (['chat', 'memory', 'admin'] as const) : (['chat', 'memory'] as const);
  return (
    <div className={'home' + (open ? '' : ' wide')}>
      <header className="bar">
        <div className="brand">
          <span className="mark sm" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <b>Brain</b>
          <small>
            {mem.entries.length} memories · {mem.sessions.length} sessions{busy ? ' · live' : ''}
          </small>
        </div>
        <nav className="seg" aria-label="View">
          <button type="button" aria-pressed={view === 'brain'} onClick={() => setView('brain')}>
            Brain
          </button>
          <button type="button" aria-pressed={view === 'team'} onClick={() => setView('team')}>
            Team
          </button>
        </nav>
        <Readout />
        <div className="who">
          <span className={'role ' + user?.role}>{ROLE_LABEL[user!.role]}</span>
          <span>{user?.name}</span>
          <button type="button" onClick={() => logout()} title="Or press Esc twice">
            Lock
          </button>
          <button type="button" className="only-narrow" onClick={() => setOpen(o => !o)} aria-expanded={open}>
            {open ? 'Hide panel' : 'Panel'}
          </button>
        </div>
      </header>
      <main className="stage" aria-label={view === 'brain' ? 'Brain view' : 'Team view'}>
        {view === 'brain' ? (
          <Boundary>
            <Suspense fallback={<div className="fallback">Growing the brain…</div>}>
              <BrainScene />
            </Suspense>
          </Boundary>
        ) : (
          <TeamDiagram />
        )}
        {view === 'brain' && (
          <>
            <p className="hint">Drag to turn the brain · scroll to zoom · click a memory</p>
            <ul className="legend" aria-label="Legend">
              <li>
                <i style={{ color: '#81b8ff' }}>●</i>Concept
              </li>
              <li>
                <i style={{ color: '#73dfbd' }}>●</i>Entity
              </li>
              <li>
                <i style={{ color: '#ffbd70' }}>●</i>Workstream
              </li>
              <li>
                <i className="bots" aria-hidden="true">
                  {Object.values(AGENT_COLOR).map(c => (
                    <b key={c} style={{ background: c }} />
                  ))}
                </i>
                Bots
              </li>
              <li>
                <i className="ln" />
                Handoff
              </li>
            </ul>
          </>
        )}
      </main>
      {open && (
        <aside className="side">
          <div className="tabs" role="tablist">
            {t.map(x => (
              <button type="button" key={x} role="tab" aria-selected={tab === x} onClick={() => setTab(x)}>
                {x === 'chat' ? 'Live chat' : x === 'memory' ? 'Memory' : 'Admin'}
              </button>
            ))}
          </div>
          {tab === 'chat' && <ChatPanel />}
          {tab === 'memory' && <MemoryPanel />}
          {tab === 'admin' && admin && <AdminPanel />}
        </aside>
      )}
    </div>
  );
}

/** Clearance, session, UTC time and when the screen locks by itself. */
function Readout() {
  const { user, session, lastActive } = useAuth(),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, IDLE_MS - (now - lastActive)),
    mm = String(Math.floor(left / 60000)).padStart(2, '0'),
    ss = String(Math.floor((left % 60000) / 1000)).padStart(2, '0');
  return (
    <section className="readout" aria-label="Session status">
      <span>CLEARANCE {user?.role.toUpperCase()}</span>
      <span>SESSION {session}</span>
      <span>{new Date(now).toISOString().slice(11, 19)} UTC</span>
      <span className={left < 60000 ? 'warn' : ''}>
        AUTO-LOCK {mm}:{ss}
      </span>
    </section>
  );
}
