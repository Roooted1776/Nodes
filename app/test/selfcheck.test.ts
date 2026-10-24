import { describe, expect, it } from 'vitest';
import { checkPolicy, checkScene, checkShaders, checkStorage, checkVault, report } from '../src/lib/selfcheck';

const store = (d: Record<string, string>) => ({
  getItem: (k: string) => d[k] ?? null,
  get length() {
    return Object.keys(d).length;
  },
  key: (i: number) => Object.keys(d)[i] ?? null,
});
describe('system check', () => {
  it('reports a missing GPU as a failure, not a crash', () => {
    const doc = { createElement: () => ({ getContext: () => null }) } as unknown as Document;
    expect(checkShaders(doc)).toMatchObject({ status: 'fail' });
  });
  it('reads the scene numbers', () => {
    expect(
      checkScene({
        skullTriangles: 35000,
        stencil: true,
        fps: 0,
        calls: 0,
        points: 0,
        lines: 0,
        triangles: 0,
        width: 0,
        height: 0,
        webgl2: true,
        frames: 0,
      }).status,
    ).toBe('warn');
    expect(
      checkScene({
        skullTriangles: 35000,
        stencil: true,
        fps: 60,
        calls: 30,
        points: 28,
        lines: 400,
        triangles: 20000,
        width: 900,
        height: 700,
        webgl2: true,
        frames: 300,
      }).status,
    ).toBe('pass');
    expect(
      checkScene({
        skullTriangles: 35000,
        stencil: false,
        fps: 60,
        calls: 30,
        points: 28,
        lines: 400,
        triangles: 20000,
        width: 900,
        height: 700,
        webgl2: true,
        frames: 300,
      }).status,
    ).toBe('fail');
    expect(
      checkScene({
        skullTriangles: 35000,
        stencil: true,
        fps: 60,
        calls: 3,
        points: 0,
        lines: 0,
        triangles: 0,
        width: 900,
        height: 700,
        webgl2: true,
        frames: 300,
      }).status,
    ).toBe('fail');
  });
  it('encryption round-trips and refuses a changed copy', async () => {
    expect((await checkVault()).status).toBe('pass');
  });
  it('the content policy must be present and must block outside requests', async () => {
    const doc = (c: string) => ({ querySelector: () => (c ? { getAttribute: () => c } : null) }) as unknown as Document;
    const good = "default-src 'none'; script-src 'sha256-abc'; connect-src https://api.anthropic.com";
    expect((await checkPolicy(doc(''), undefined)).status).toBe('fail');
    expect(
      (
        await checkPolicy(doc(good), (async () => {
          throw new TypeError('blocked');
        }) as unknown as typeof fetch)
      ).status,
    ).toBe('pass');
    expect((await checkPolicy(doc(good), (async () => new Response('')) as unknown as typeof fetch)).status).toBe(
      'fail',
    );
  });
  it('storage passes only when memory is in the vault and nothing is in plain text', () => {
    expect(checkStorage(store({ 'brain.mem.v2': '{}' })).status).toBe('fail');
    expect(checkStorage(store({ 'brain.auth.v1': '{}' })).status).toBe('warn');
    expect(checkStorage(store({ 'brain.vault.v1': 'x'.repeat(2048), 'brain.auth.v1': '{}' })).status).toBe('pass');
  });
  it('writes a short report to paste back', () => {
    const r = report([{ name: 'Encryption', status: 'pass', detail: 'ok' }], 'TestBrowser/1');
    expect(r.split('\n')).toHaveLength(3);
    expect(r).toMatch(/PASS Encryption: ok/);
  });
});
