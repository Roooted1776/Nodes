import { useState } from 'react';
import { KEY_GUIDE, guessProvider } from '../lib/keyguide';
import { PROV, PROVIDERS } from '../lib/providers';
import { useStore } from '../store';

/** Step-by-step help for attaching a real AI key. Admins can paste and test it right here; viewers are told who can. */
export default function KeyGuide({ wide }: { wide?: boolean }) {
  const role = useStore(s => s.role),
    live = useStore(s => s.live),
    setLive = useStore(s => s.setLive),
    setKey = useStore(s => s.setKey),
    test = useStore(s => s.testProvider),
    status = useStore(s => s.status),
    busy = useStore(s => s.busy);
  const ready = useStore(s => !!s.keys[s.live.provider]),
    dead = useStore(s => !!s.dead[s.live.provider]);
  const [key, setK] = useState(''),
    [tested, setTested] = useState(false);
  const g = KEY_GUIDE[live.provider],
    guess = guessProvider(key);
  if (role !== 'admin')
    return (
      <section className={'card2 keyguide' + (wide ? ' wide' : '')} aria-label="Connect real AI">
        <h3>Real AI is not connected yet</h3>
        <p className="hint2">
          Brain only runs on real AI models. An admin adds an API key in the Admin tab, then the team chat appears here
          live.
        </p>
      </section>
    );
  return (
    <section className={'card2 keyguide' + (wide ? ' wide' : '')} aria-label="Connect real AI">
      <h3>Connect real AI</h3>
      <p className="hint2">Brain only runs on real AI. One key from one provider powers all nine bots.</p>
      <fieldset className="seg sm">
        <legend className="sr">Choose provider</legend>
        {PROVIDERS.map(p => (
          <button
            key={p}
            type="button"
            aria-pressed={live.provider === p}
            onClick={() => {
              setLive({ provider: p });
              setTested(false);
            }}
          >
            {PROV[p].label}
          </button>
        ))}
      </fieldset>
      <ol className="steps">
        {g.steps.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ol>
      <a className="btnlink" href={g.url} target="_blank" rel="noopener noreferrer">
        Open {g.site} ↗
      </a>
      <label className="field">
        <span>Paste {PROV[live.provider].label} key</span>
        <input
          type="password"
          aria-label="Paste API key"
          value={key}
          placeholder={
            ready
              ? 'A key is set. Paste to replace it'
              : g.prefix
                ? 'Starts with ' + g.prefix
                : PROV[live.provider].hint
          }
          autoComplete="off"
          spellCheck={false}
          onChange={e => {
            setK(e.target.value);
            setTested(false);
          }}
        />
      </label>
      {guess && guess !== live.provider && (
        <p className="tip warn">
          This looks like an {PROV[guess].label} key.{' '}
          <button type="button" className="link" onClick={() => setLive({ provider: guess })}>
            Switch to {PROV[guess].label}
          </button>
        </p>
      )}
      <div className="row">
        <button
          type="button"
          className="primary"
          disabled={!key.trim() || busy}
          onClick={() => {
            setKey(key, live.provider);
            setK('');
            setTested(true);
            void test(live.provider);
          }}
        >
          Save and test
        </button>
        {ready && <span className={'pill ' + (dead ? 'warn' : 'ok')}>{dead ? 'Key rejected' : 'Key set'}</span>}
      </div>
      {tested && (
        <p className="mini" role="status">
          {status}
        </p>
      )}
      <ul className="tips">
        <li>
          <b>Stays here</b>Kept for this tab. Turn on Remember to keep it encrypted on this device.
        </li>
        <li>
          <b>Sent only to {PROV[live.provider].label}</b>Brain calls the provider directly. No other server sees it.
        </li>
        <li>
          <b>Set a spend limit</b>Use the provider's billing page. Each task makes at most {live.callCap} calls, plus
          one to save memory.
        </li>
        <li>
          <b>Never in chat</b>Do not paste a key into a task. Revoke it at the provider if it leaks.
        </li>
      </ul>
    </section>
  );
}
