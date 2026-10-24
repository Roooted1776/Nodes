import { lazy, Suspense, useEffect } from 'react';
import { useAuth } from './auth-store';
import { Login, Setup } from './components/Access';
import Home from './components/Home';

const BrainScene = lazy(() => import('./components/BrainScene'));

/** Shown at the top and bottom of every screen. Brain's own marking, not a government classification. */
export const Banner = ({ at }: { at: 'top' | 'bottom' }) => (
  <div className={'banner ' + at} role={at === 'top' ? 'banner' : undefined}>
    <span className="banner-full">RESTRICTED · AUTHORIZED PERSONNEL ONLY · PROJECT BRAIN</span>
    <span className="banner-short">RESTRICTED · PROJECT BRAIN</span>
  </div>
);

export default function App() {
  const phase = useAuth(s => s.phase);
  useEffect(() => {
    void useAuth.getState().init();
  }, []);
  if (phase === 'app')
    return (
      <>
        <Banner at="top" />
        <Home />
        <Banner at="bottom" />
        <div className="veil" aria-hidden="true">
          Screen hidden
        </div>
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
      {phase === 'setup' ? <Setup /> : <Login />}
    </>
  );
}
