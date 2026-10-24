import { OUTLINE } from '../data/outline';
import type { Entry } from './memory';

// A full-volume brain built from the traced side-view outline. The outline is measured; the width,
// folds and fissure are designed (a schematic, not a reconstruction of the scan).

export type P2 = [number, number];
export type P3 = [number, number, number];
const HUB = OUTLINE.hub;
export const UNIT = 0.01; // outline units -> world units
export const toWorld = (p: P3): P3 => [(p[0] - HUB.x) * UNIT, -(p[1] - HUB.y) * UNIT, p[2] * UNIT];

export function flattenPath(d: string, n = 16): P2[] {
  const t = d.match(/[MCLZ]|-?\d+(?:\.\d+)?/g) || [];
  const pts: P2[] = [];
  let i = 0,
    cur: P2 = [0, 0],
    cmd = '';
  while (i < t.length) {
    if (/[MCLZ]/.test(t[i])) cmd = t[i++];
    if (cmd === 'M' || cmd === 'L') {
      cur = [+t[i], +t[i + 1]];
      pts.push(cur);
      i += 2;
    } else if (cmd === 'C') {
      const p1: P2 = [+t[i], +t[i + 1]],
        p2: P2 = [+t[i + 2], +t[i + 3]],
        p3: P2 = [+t[i + 4], +t[i + 5]];
      i += 6;
      for (let s = 1; s < n; s++) {
        const u = s / (n - 1),
          v = 1 - u;
        pts.push([
          v * v * v * cur[0] + 3 * v * v * u * p1[0] + 3 * v * u * u * p2[0] + u * u * u * p3[0],
          v * v * v * cur[1] + 3 * v * v * u * p1[1] + 3 * v * u * u * p2[1] + u * u * u * p3[1],
        ]);
      }
      cur = p3;
    } else break;
  }
  return pts;
}
export const OUTLINE_PTS = flattenPath(OUTLINE.outline);
export const FOLD_PTS = OUTLINE.folds.map(f => flattenPath(f, 12));

export function inside(x: number, y: number, poly: P2[] = OUTLINE_PTS): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i],
      [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

// distance fields on a coarse grid, filled once
const CELL = 5,
  GW = Math.ceil(OUTLINE.w / CELL) + 2,
  GH = Math.ceil(OUTLINE.h / CELL) + 2;
let edgeGrid: Float32Array | null = null,
  foldGrid: Float32Array | null = null;
function fill() {
  edgeGrid = new Float32Array(GW * GH);
  foldGrid = new Float32Array(GW * GH);
  const folds = FOLD_PTS.flat();
  for (let gy = 0; gy < GH; gy++)
    for (let gx = 0; gx < GW; gx++) {
      const x = gx * CELL,
        y = gy * CELL;
      let d = Infinity,
        f = Infinity;
      for (const p of OUTLINE_PTS) {
        const dd = (p[0] - x) ** 2 + (p[1] - y) ** 2;
        if (dd < d) d = dd;
      }
      for (const p of folds) {
        const dd = (p[0] - x) ** 2 + (p[1] - y) ** 2;
        if (dd < f) f = dd;
      }
      edgeGrid[gy * GW + gx] = inside(x, y) ? Math.sqrt(d) : -Math.sqrt(d);
      foldGrid[gy * GW + gx] = Math.sqrt(f);
    }
}
function sample(g: Float32Array, x: number, y: number) {
  const fx = Math.max(0, Math.min(GW - 1.001, x / CELL)),
    fy = Math.max(0, Math.min(GH - 1.001, y / CELL));
  const ix = Math.floor(fx),
    iy = Math.floor(fy),
    u = fx - ix,
    v = fy - iy,
    i = iy * GW + ix;
  return (g[i] * (1 - u) + g[i + 1] * u) * (1 - v) + (g[i + GW] * (1 - u) + g[i + GW + 1] * u) * v;
}
export const edgeDist = (x: number, y: number) => {
  if (!edgeGrid) fill();
  return sample(edgeGrid!, x, y);
};
export const foldDist = (x: number, y: number) => {
  if (!foldGrid) fill();
  return sample(foldGrid!, x, y);
};

const sig = (v: number) => 1 / (1 + Math.exp(-v));
/** 0 in the cerebrum, 1 in the cerebellum (below the traced tentorium fold, at the back). */
export function cerebellum(x: number, y: number) {
  const yt = 462 + (x - 558) * (46 / 255);
  return sig((y - yt - 8) / 10) * sig((x - 575) / 14);
}
export function gyri(x: number, y: number) {
  const cb = cerebellum(x, y);
  const cortex = Math.sin(0.052 * x + 1.7 * Math.sin(0.021 * y)) * Math.cos(0.047 * y + 1.3 * Math.sin(0.026 * x));
  const folia = Math.sin(0.16 * (y - 0.18 * x));
  return cortex * (1 - cb) + folia * cb;
}
export const WMAX = 300;
/** Left-right half-width of the brain at a point of the side view. 0 outside. */
export function halfWidth(x: number, y: number, smooth = false): number {
  const d = edgeDist(x, y);
  if (d <= 0) return 0;
  const u = Math.min(1, d / 230),
    base = WMAX * Math.sqrt(u * (2 - u));
  const cb = cerebellum(x, y);
  if (smooth) return base * (1 - 0.2 * cb); // the same volume without the small ripples of the folds
  const fd = foldDist(x, y);
  return base * (1 - 0.2 * cb) * (1 + 0.035 * gyri(x, y) - 0.07 * Math.exp(-(fd * fd) / 180) * (1 - cb));
}
/** Gap between the hemispheres (the longitudinal fissure), only in the upper cerebrum. */
export const fissure = (x: number, y: number) => 13 * (1 - cerebellum(x, y)) * sig((400 - y) / 18);

/** Even samples along a closed polyline. */
function resample(poly: P2[], n: number): P2[] {
  const cum = [0];
  for (let i = 1; i <= poly.length; i++) {
    const a = poly[i - 1],
      b = poly[i % poly.length];
    cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const L = cum[cum.length - 1],
    out: P2[] = [];
  let k = 1;
  for (let s = 0; s < n; s++) {
    const d = (L * s) / n;
    while (k < cum.length - 1 && cum[k] < d) k++;
    const a = poly[k - 1],
      b = poly[k % poly.length],
      u = (d - cum[k - 1]) / (cum[k] - cum[k - 1] || 1);
    out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
  }
  return out;
}
export interface Shell {
  positions: Float32Array;
  index: Uint32Array;
  count: number;
  arc: number;
  rings: number;
}
/** The outer surface of both hemispheres as one mesh. It closes along the traced outline, so a rim shader draws the brain as a white outline from any angle. World units. */
/** The brain's surface. `smooth` drops the fold ripples so the glowing outline stays one clean line from every side. */
export function buildShell(arc = 180, rings = 30, smooth = false): Shell {
  const edge = resample(OUTLINE_PTS, arc),
    pos: number[] = [],
    idx: number[] = [];
  for (const side of [-1, 1]) {
    const base = pos.length / 3;
    for (let r = 0; r <= rings; r++) {
      const t = 1 - (1 - r / rings) ** 1.5; // denser near the edge, where the outline glows
      for (let i = 0; i < arc; i++) {
        const x = HUB.x + (edge[i][0] - HUB.x) * t,
          y = HUB.y + (edge[i][1] - HUB.y) * t;
        pos.push(...toWorld([x, y, r === rings ? 0 : side * halfWidth(x, y, smooth)]));
      }
    }
    for (let r = 0; r < rings; r++)
      for (let i = 0; i < arc; i++) {
        const a = base + r * arc + i,
          b = base + r * arc + ((i + 1) % arc),
          c = a + arc,
          d = b + arc;
        if (side > 0) idx.push(a, c, b, b, c, d);
        else idx.push(a, b, c, b, d, c);
      }
  }
  return { positions: new Float32Array(pos), index: new Uint32Array(idx), count: pos.length / 3, arc, rings };
}

/** Traced folds lifted onto both hemisphere surfaces, as world-space polylines. */
export function surfaceFolds(): P3[][] {
  const out: P3[][] = [];
  for (const side of [-1, 1])
    for (const f of FOLD_PTS)
      out.push(f.map(([x, y]) => toWorld([x, y, side * (fissure(x, y) + (halfWidth(x, y) - fissure(x, y)) * 1.004)])));
  return out;
}
export const midline = (): P3[] => OUTLINE_PTS.map(([x, y]) => toWorld([x, y, 0]));

// ---------- stations, tracts and routes (designed in mri/brain-outline.json) ----------
export const stationKey = (id: string) => (id === 'owner' || id === 'brain' || id === 'hub' ? 'hub' : id);
export function station(id: string): P3 | null {
  const k = stationKey(id);
  if (k === 'hub') return [HUB.x, HUB.y, 0];
  const s = OUTLINE.stations[k];
  if (!s) return null;
  return [s.x, s.y, s.side * (fissure(s.x, s.y) + halfWidth(s.x, s.y) * 0.3)];
}
function catmull(P: P2[], steps = 14): P2[] {
  const p = [P[0], ...P, P[P.length - 1]],
    out: P2[] = [];
  for (let i = 1; i < p.length - 2; i++)
    for (let s = 0; s < steps; s++) {
      const t = s / steps,
        t2 = t * t,
        t3 = t2 * t,
        a = p[i - 1],
        b = p[i],
        c = p[i + 1],
        d = p[i + 2];
      out.push(
        [0, 1].map(
          j =>
            0.5 *
            (2 * b[j] +
              (c[j] - a[j]) * t +
              (2 * a[j] - 5 * b[j] + 4 * c[j] - d[j]) * t2 +
              (3 * b[j] - a[j] - 3 * c[j] + d[j]) * t3),
        ) as P2,
      );
    }
  out.push(P[P.length - 1]);
  return out;
}
/** A curve between two stations through waypoints; it sinks toward the midline on the way. Outline units. */
export function liftTract(a: string, b: string, via: P2[]): P3[] | null {
  const A = station(a),
    B = station(b);
  if (!A || !B) return null;
  const flat = catmull([[A[0], A[1]], ...via, [B[0], B[1]]]),
    n = flat.length - 1;
  return flat.map(([x, y], i) => {
    const t = n ? i / n : 0;
    return [x, y, (A[2] + (B[2] - A[2]) * t) * (1 - 0.35 * Math.sin(Math.PI * t))] as P3;
  });
}
const tractCache = new Map<string, P3[] | null>();
export function tract(id: string): P3[] | null {
  if (!tractCache.has(id)) {
    const t = OUTLINE.tracts.find(x => x.id === id);
    tractCache.set(id, t ? liftTract(t.from, t.to, t.via) : null);
  }
  return tractCache.get(id)!;
}
/** The points a handoff from a to b travels, in outline units. Unmapped pairs get one curve that bows toward the hub. */
export function route(a: string, b: string): P3[] | null {
  const ka = stationKey(a),
    kb = stationKey(b);
  if (ka === kb) return null;
  const r = OUTLINE.routes.find(x => x.from === ka && x.to === kb);
  if (r) {
    let cur = ka,
      out: P3[] = [];
    for (const id of r.tracts) {
      const t = OUTLINE.tracts.find(x => x.id === id),
        pts = tract(id);
      if (!t || !pts || (t.from !== cur && t.to !== cur)) {
        out = [];
        break;
      }
      const seg = t.from === cur ? pts : [...pts].reverse();
      cur = t.from === cur ? t.to : t.from;
      out = out.concat(out.length ? seg.slice(1) : seg);
    }
    if (out.length > 1 && cur === kb) return out;
  }
  const A = station(ka),
    B = station(kb);
  if (!A || !B) return null;
  const mx = (A[0] + B[0]) / 2,
    my = (A[1] + B[1]) / 2;
  return liftTract(ka, kb, [[mx + (HUB.x - mx) * 0.4, my + (HUB.y - my) * 0.4]]);
}

// ---------- memory nodes: each type lives in its region of the outline ----------
const DEPTH = { concept: 0.96, workstream: 0.9, entity: 0.72 } as const;
export function placeMemory(entries: Entry[]): Map<string, P3> {
  const out = new Map<string, P3>();
  for (const type of ['concept', 'entity', 'workstream'] as const) {
    const list = entries.filter(e => e.type === type).sort((a, b) => a.created - b.created || (a.id < b.id ? -1 : 1));
    const reg = OUTLINE.regions[type],
      N = list.length,
      grow = Math.min(2.4, Math.max(1, Math.sqrt(N / 14)));
    list.forEach((e, k) => {
      let r = Math.sqrt((k + 0.5) / Math.max(1, N)) * 0.95 * grow,
        th = k * 2.399963,
        x = reg.cx,
        y = reg.cy;
      for (let tries = 0; tries < 8; tries++) {
        x = reg.cx + reg.rx * r * Math.cos(th);
        y = reg.cy + reg.ry * r * Math.sin(th);
        if (edgeDist(x, y) > 14) break;
        r *= 0.82;
        th += 0.7;
      }
      if (edgeDist(x, y) <= 14) {
        x = reg.cx;
        y = reg.cy;
      }
      const side = k % 2 ? 1 : -1,
        hw = halfWidth(x, y),
        gap = Math.min(fissure(x, y), hw * 0.5);
      out.set(e.id, [x, y, side * (gap + (hw - gap) * DEPTH[type])]);
    });
  }
  return out;
}

/** Length of a handoff path in world units. */
export function routeLength(a: string, b: string): number {
  const r = route(a, b);
  if (!r) return 0;
  let L = 0;
  for (let i = 1; i < r.length; i++) {
    const p = toWorld(r[i - 1]),
      q = toWorld(r[i]);
    L += Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
  }
  return L;
}
const transitCache = new Map<string, number>();
/** How long a handoff takes to travel, in ms. Longer paths take longer; the same value drives every view. */
export function transitMs(a: string, b: string): number {
  const k = a + '>' + b;
  if (!transitCache.has(k)) transitCache.set(k, Math.round(Math.max(1100, Math.min(3400, routeLength(a, b) * 380))));
  return transitCache.get(k)!;
}
