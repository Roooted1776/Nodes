import { useState } from 'react';
import { useStore } from '../store';

/** Search under the brain: one question, one answer with web sources and matching memory, shown in the live chat. */
export default function SearchBar() {
  const [q, setQ] = useState(''),
    busy = useStore(s => s.busy || s.dreaming),
    ready = useStore(s => Object.values(s.keys).some(Boolean)),
    search = useStore(s => s.search);
  const go = () => {
    if (!q.trim() || busy || !ready) return;
    void search(q);
    setQ('');
  };
  return (
    <form
      className="search-bar"
      aria-label="Search the web and memory"
      onSubmit={e => {
        e.preventDefault();
        go();
      }}
    >
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="m10.5 10.5 3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <input
        value={q}
        onChange={e => setQ(e.target.value)}
        maxLength={500}
        disabled={busy || !ready}
        placeholder={ready ? 'Search the web and your memory…' : 'Add an API key to search'}
        aria-label="Search"
      />
      <button type="submit" disabled={!q.trim() || busy || !ready}>
        Search
      </button>
    </form>
  );
}
