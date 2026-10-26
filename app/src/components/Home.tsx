import { Component, lazy, Suspense, useEffect, type ReactNode } from 'react';
import { dreamDue } from '../lib/dream';
import { useAuth } from '../auth-store';
import { useStore } from '../store';
import AdminPanel from './AdminPanel';
import AgentInspector from './AgentInspector';
import ChatPanel from './ChatPanel';
import FlowPane from './FlowPane';
import SearchBar from './SearchBar';

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
      </div>
    ) : (
      this.props.children
    );
  }
}

/** One page: the 3D brain, the live chat beside it and (for admins) the admin panel along the bottom. */
export default function Home() {
  const { user, logout } = useAuth(),
    inspectedBot = useStore(s => s.inspectedBot),
    inspectBot = useStore(s => s.inspectBot);
  const admin = user?.role === 'admin';
  // Dream runs by itself at most once a day, after sign-in, when something waits in the inbox
  const ready = useStore(s => !!s.keys[s.live.provider] || Object.values(s.keys).some(Boolean)),
    due = useStore(s => dreamDue(s.mem, Date.now()));
  useEffect(() => {
    if (admin && ready && due) void useStore.getState().dream(true);
  }, [admin, ready, due]);
  return (
    <div className={'home single' + (admin ? ' with-admin' : '')}>
      <section className="workspace" aria-label="Visualization">
        <main className="stage" aria-label="Brain view">
          <Boundary>
            <Suspense fallback={null}>
              <BrainScene />
            </Suspense>
          </Boundary>
          {admin && <SearchBar />}
          {inspectedBot && <AgentInspector id={inspectedBot} onClose={() => inspectBot(null)} />}
          <button type="button" className="icon-btn lock-btn" onClick={() => logout()} aria-label="Lock" title="Lock">
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" shapeRendering="crispEdges">
              <path d="M5 7V5a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <rect x="3" y="7" width="10" height="7" fill="currentColor" />
            </svg>
          </button>
        </main>
      </section>
      <aside className="flow-side">
        <FlowPane />
      </aside>
      <aside className="side">
        <ChatPanel />
      </aside>
      {admin && (
        <section className="admin-bar" aria-label="Admin panel">
          <AdminPanel />
        </section>
      )}
    </div>
  );
}
