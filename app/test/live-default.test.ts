import { describe, expect, it, vi } from 'vitest';

describe('Live AI default', () => {
  it('is on after load, even if an earlier page turned it off, and nothing is sent until Send', async () => {
    const d = new Map<string, string>([
      ['brain.live.v1', JSON.stringify({ on: false, provider: 'anthropic', remember: false })],
    ]);
    (globalThis as any).localStorage = {
      getItem: (k: string) => d.get(k) ?? null,
      setItem: (k: string, v: string) => void d.set(k, v),
      removeItem: (k: string) => void d.delete(k),
    };
    const fetchSpy = vi.fn();
    (globalThis as any).fetch = fetchSpy;
    vi.resetModules();
    const { useStore } = await import('../src/store');
    const s = useStore.getState();
    expect(s.live.on).toBe(true);
    expect(s.live.provider).toBe('anthropic');
    expect(s.calls).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    useStore.setState({ role: 'admin' });
    await s.send('a task'); // no key yet: refused before any call
    expect(useStore.getState().status).toMatch(/Add your Anthropic key/);
    expect(fetchSpy).not.toHaveBeenCalled();
    delete (globalThis as any).localStorage;
  });
  it('has no off switch and moves retired model ids to current ones', async () => {
    const d = new Map<string, string>([
      [
        'brain.live.v1',
        JSON.stringify({
          provider: 'google',
          models: { google: 'gemini-2.0-flash-lite', xai: 'grok-3-mini', openai: 'my-own-model' },
        }),
      ],
    ]);
    (globalThis as any).localStorage = {
      getItem: (k: string) => d.get(k) ?? null,
      setItem: (k: string, v: string) => void d.set(k, v),
      removeItem: (k: string) => void d.delete(k),
    };
    vi.resetModules();
    const { useStore } = await import('../src/store');
    const { PROV } = await import('../src/lib/providers');
    const s = useStore.getState();
    expect(s.live.models.google).toBe(PROV.google.model);
    expect(s.live.models.xai).toBe(PROV.xai.model);
    expect(s.live.models.openai).toBe('my-own-model');
    useStore.setState({ role: 'admin' });
    s.setLive({ on: false } as any);
    expect(useStore.getState().live.on).toBe(true);
    delete (globalThis as any).localStorage;
  });
});
