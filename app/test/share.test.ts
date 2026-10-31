import { describe, expect, it } from 'vitest';
import { publish, type Chan, type Hub, type Live } from '../src/lib/share';

function hub(init: Partial<Live> = {}): Hub & { set(p: Partial<Live>): void } {
  let s: Live = {
    log: [],
    stages: {},
    notes: {},
    active: null,
    busy: false,
    status: '',
    pulses: [],
    draft: null,
    ...init,
  } as Live;
  const subs = new Set<(n: Live, p: Live) => void>();
  const set = (p: Partial<Live> | ((x: Live) => Partial<Live>)) => {
    const prev = s;
    s = { ...s, ...(typeof p === 'function' ? p(s) : p) };
    subs.forEach(f => f(s, prev));
  };
  return {
    getState: () => s,
    setState: set,
    set,
    subscribe: f => {
      subs.add(f);
      return () => subs.delete(f);
    },
  };
}
const msg = (id: number, text: string) => ({ id, from: 'gemini', text, tag: 'live · OpenAI · m · unverified' });

describe('live chat sharing', () => {
  it('sends no keys or settings, and another tab cannot push anything to the admin', async () => {
    const sent: unknown[] = [],
      ch: Chan = { postMessage: d => sent.push(d), onmessage: null, close() {} },
      admin = hub();
    publish(admin, ch);
    admin.set({ log: [msg(1, 'x')], status: 'Live: OpenAI · gpt' });
    expect(JSON.stringify(sent)).not.toMatch(/key|secret|passcode|settings/i);
    const before = admin.getState();
    ch.onmessage?.({ data: { t: 'msg', m: msg(9, 'spoof') } });
    ch.onmessage?.({ data: { t: 'reset' } });
    expect(admin.getState()).toBe(before);
  });
});

describe('memory snapshots', () => {
  it('every commit publishes new array identities and hands the memory to the vault', async () => {
    const store = new Map<string, string>();
    (globalThis as any).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
    const { useStore, setVault } = await import('../src/store');
    const saved: string[] = [];
    setVault(async m => {
      saved.push(m.entries.map(e => e.title).join(','));
      return true;
    });
    useStore.setState({ role: 'admin' });
    const before = useStore.getState().mem.entries;
    const id = useStore.getState().note({ type: 'concept', title: 'Fresh', note: 'x' });
    expect(id).toBeTruthy();
    expect(useStore.getState().mem.entries).not.toBe(before);
    expect(saved.at(-1)).toContain('Fresh');
    expect([...store.keys()].some(k => k === 'brain.mem.v2')).toBe(false); // nothing is written in plain text
    setVault(null);
    delete (globalThis as any).localStorage;
  });
});
