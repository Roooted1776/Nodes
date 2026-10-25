import { lazy, Suspense, useEffect } from 'react';
import { useAuth } from './auth-store';
import { Login, Setup } from './components/Access';
import Home from './components/Home';

const BrainScene = lazy(() => import('./components/BrainScene'));

/** The old RESTRICTED banners are gone (Owner: no text outside the live chat). Kept as a no-op so callers stay simple. */
export const Banner = (_: { at: 'top' | 'bottom' }) => null;

export default function App() {
  const phase = useAuth(s => s.phase);
  const ready = useAuth(s => s.ready);
  const error = useAuth(s => s.error);
  useEffect(() => {
    void useAuth.getState().init();
  }, []);
  if (phase === 'app')
    return (
      <>
        <Banner at="top" />
        <Home />
        <Banner at="bottom" />
        <div className="veil" aria-hidden="true" />
      </>
    );
  return (
    <>
      <Banner at="top" />
      <Banner at="bottom" />
      <div className="backdrop" aria-hidden="true">
        <Suspense fallback={null}>
          <BrainScene locked />
        </Suspense>
      </div>
      {!ready ? (
        <main className="access">
          <section className="card minimal">
            <p className="notice" style={{ textAlign: 'center', margin: 0 }}>
              {error ? error : 'Connecting to Brain…'}
            </p>
            {error && (
              <button
                type="button"
                className="primary"
                style={{ marginTop: '0.75rem' }}
                onClick={() => void useAuth.getState().init()}
              >
                Retry
              </button>
            )}
          </section>
        </main>
      ) : phase === 'setup' ? (
        <Setup />
      ) : (
        <Login />
      )}
    </>
  );
}
