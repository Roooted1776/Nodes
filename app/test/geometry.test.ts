import { describe, expect, it } from 'vitest';
import { OUTLINE } from '../src/data/outline';
import { AGENTS, LIVE_ORDER } from '../src/data/team';
import { buildShell, edgeDist, halfWidth, inside, placeMemory, route, station, transitMs } from '../src/lib/geometry';
import { blankMem, mkEntry } from '../src/lib/memory';

describe('brain outline', () => {
  const sh = buildShell(),
    back = (k: number) => [
      sh.positions[k * 3] / 0.01 + OUTLINE.hub.x,
      -sh.positions[k * 3 + 1] / 0.01 + OUTLINE.hub.y,
      sh.positions[k * 3 + 2] / 0.01,
    ];
  it('is one closed mesh for both hemispheres', () => {
    expect(sh.count).toBe(2 * (sh.rings + 1) * sh.arc);
    expect(sh.index.length).toBe(2 * sh.rings * sh.arc * 6);
    expect(Math.max(...sh.index)).toBe(sh.count - 1);
  });
  it('closes on the traced outline: the last ring lies on it, at the midline', () => {
    for (const side of [0, 1])
      for (let i = 0; i < sh.arc; i++) {
        const [x, y, z] = back(side * (sh.rings + 1) * sh.arc + sh.rings * sh.arc + i);
        expect(Math.abs(edgeDist(x, y))).toBeLessThan(4);
        expect(z).toBe(0);
      }
  });
  it('stays inside the outline and on the brain surface', () => {
    let out = 0;
    for (let k = 0; k < sh.count; k++) {
      const [x, y, z] = back(k);
      if (edgeDist(x, y) < -4) out++;
      expect(Math.abs(z)).toBeLessThanOrEqual(halfWidth(x, y) + 0.01);
    } // positions are 32-bit floats
    expect(out).toBe(0);
  });
  it('is wide in the middle and thin at the brainstem', () => {
    expect(halfWidth(OUTLINE.hub.x, 250)).toBeGreaterThan(250);
    expect(halfWidth(540, 650)).toBeLessThan(120);
    expect(halfWidth(5, 5)).toBe(0);
  });
});

describe('live transitions', () => {
  it('take longer on longer paths, within limits', () => {
    const all = [
      ['owner', 'gemini'],
      ['gemini', 'muse'],
      ['claude', 'cursor'],
      ['grok', 'xcode'],
      ['xcode', 'grokbot'],
      ['grokbot', 'brain'],
    ].map(([a, b]) => transitMs(a, b));
    for (const ms of all) {
      expect(ms).toBeGreaterThanOrEqual(1100);
      expect(ms).toBeLessThanOrEqual(3400);
    }
    expect(transitMs('grok', 'xcode')).toBeGreaterThan(transitMs('claude', 'cursor'));
    expect(transitMs('owner', 'brain')).toBe(1100); // no path between the same place
  });
});

describe('pathways in 3D', () => {
  it('every agent has a station inside the volume', () => {
    for (const a of AGENTS) {
      const s = station(a.id)!;
      expect(inside(s[0], s[1])).toBe(true);
      expect(Math.abs(s[2])).toBeLessThan(halfWidth(s[0], s[1]));
    }
  });
  it('every live handoff has a route from station to station', () => {
    const pairs = [
      ['owner', LIVE_ORDER[0]],
      ...LIVE_ORDER.slice(0, -1).map((a, i) => [a, LIVE_ORDER[i + 1]]),
      ['grok', 'grokbot'],
      ['grokbot', 'brain'],
    ];
    for (const [a, b] of pairs) {
      const r = route(a, b)!;
      expect(r.length).toBeGreaterThan(10);
      const A = station(a)!,
        B = station(b)!,
        e = r[r.length - 1];
      [0, 1, 2].forEach(j => {
        expect(r[0][j]).toBeCloseTo(A[j], 6);
        expect(e[j]).toBeCloseTo(B[j], 6);
      });
    }
  });
  it('places memory nodes inside the brain, in their type region', () => {
    const m = blankMem();
    const es = Array.from({ length: 60 }, (_, i) =>
      mkEntry(
        m,
        { key: 'k' + i, type: (['concept', 'entity', 'workstream'] as const)[i % 3], title: 't', note: '' },
        i,
      ),
    );
    const pos = placeMemory(es);
    expect(pos.size).toBe(60);
    for (const [, p] of pos) {
      expect(edgeDist(p[0], p[1])).toBeGreaterThan(0);
      expect(Math.abs(p[2])).toBeLessThanOrEqual(halfWidth(p[0], p[1]) + 1e-6);
    }
  });
  it('the smooth shell keeps the same outline and volume without the fold ripples', () => {
    const a = buildShell(),
      b = buildShell(180, 30, true);
    expect(b.count).toBe(a.count);
    expect(Array.from(b.index)).toEqual(Array.from(a.index));
    let maxDiff = 0,
      edgeSame = true;
    for (let i = 0; i < a.count; i++) {
      maxDiff = Math.max(maxDiff, Math.abs(a.positions[i * 3 + 2] - b.positions[i * 3 + 2]));
      if (a.positions[i * 3] !== b.positions[i * 3] || a.positions[i * 3 + 1] !== b.positions[i * 3 + 1])
        edgeSame = false;
    }
    expect(edgeSame).toBe(true); // x and y never move, so the side outline is unchanged
    expect(maxDiff).toBeGreaterThan(0);
    expect(maxDiff).toBeLessThan(0.5); // only small ripples are removed
  });
});
