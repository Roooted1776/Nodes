import { describe, expect, it } from 'vitest';
import { OUTLINE } from '../src/data/outline';
import { halfWidth, inside, OUTLINE_PTS } from '../src/lib/geometry';
import { FACE, MM, NASION, SKULL, brainClearance, buildSkull, sdSkull, skullLines } from '../src/lib/skull';

const s = buildSkull(),
  unit = (k: number): [number, number, number] => [
    s.positions[k * 3] / 0.01 + OUTLINE.hub.x,
    -s.positions[k * 3 + 1] / 0.01 + OUTLINE.hub.y,
    s.positions[k * 3 + 2] / 0.01,
  ];
const toUnit = (p: number[]): [number, number, number] => [
  p[0] / 0.01 + OUTLINE.hub.x,
  -p[1] / 0.01 + OUTLINE.hub.y,
  p[2] / 0.01,
];

describe('skull', () => {
  it('is one valid mesh for both sides', () => {
    expect(s.count).toBe(2 * (SKULL.rings + 1) * SKULL.arc);
    expect(s.index.length % 3).toBe(0);
    expect(Math.max(...s.index)).toBeLessThan(s.count);
    expect(s.index.length / 3).toBeGreaterThan(30000);
  });
  it('goes around the brain and never through it', () => {
    for (let i = 0; i < s.index.length; i++)
      expect(brainClearance(unit(s.index[i]))).toBeGreaterThanOrEqual(SKULL.clear);
  });
  it('encloses the whole brain outline, with a bone gap, except where the brainstem leaves the skull', () => {
    for (const [x, y] of OUTLINE_PTS) if (y < SKULL.stemCut - 5) expect(sdSkull(x, y)).toBeGreaterThan(SKULL.gap * 0.8);
  });
  it('opens only at the skull base, where the brainstem passes', () => {
    let opening = 0;
    for (let k = 0; k < s.count; k++) {
      const p = unit(k);
      if (brainClearance(p) < SKULL.clear) {
        opening++;
        expect(p[1]).toBeGreaterThan(SKULL.stemCut - 10);
      }
    }
    expect(opening).toBeGreaterThan(0);
    expect(s.dropped).toBeLessThan(400);
  });
  it('puts the face in front of and below the brain, from brain landmarks, at a human scale', () => {
    expect(MM).toBeGreaterThan(4);
    expect(MM).toBeLessThan(5);
    const frontBrainX = Math.min(...OUTLINE_PTS.map(p => p[0]));
    expect(NASION[0]).toBeLessThan(frontBrainX); // nose bridge in front of the brain
    const chin = FACE.reduce((a, p) => (p[1] > a[1] ? p : a));
    expect(chin[1] - NASION[1]).toBeGreaterThan(110 * MM);
    expect(chin[1] - NASION[1]).toBeLessThan(130 * MM); // nose bridge to chin about 120 mm
    const visible = FACE.slice(0, FACE.length - 3); // the last 3 points only join the face to the skull base, inside the dome
    for (const [x, y] of visible) expect(inside(x, y) && halfWidth(x, y) > 0 && y > NASION[1] + 10).toBe(false); // no visible face point inside the brain
  });
  it('face detail lines stay outside the brain', () => {
    const lines = skullLines();
    expect(lines.length).toBe(16);
    for (const l of lines) for (const p of l) expect(brainClearance(toUnit(p))).toBeGreaterThan(SKULL.clear);
  });
  it('the skull is wider than the brain but not by much', () => {
    let maxZ = 0;
    for (let k = 0; k < s.count; k++) maxZ = Math.max(maxZ, Math.abs(unit(k)[2]));
    expect(maxZ).toBeGreaterThan(320);
    expect(maxZ).toBeLessThan(360);
  });
});

describe('head is one piece', () => {
  it('the skull and the brain are parts of the same group', async () => {
    const { HEAD_PARTS } = await import('../src/components/BrainScene');
    expect(HEAD_PARTS).toEqual(expect.arrayContaining(['skull', 'brain']));
    expect(HEAD_PARTS[0]).toBe('skull');
  });
});
