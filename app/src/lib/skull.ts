import { OUTLINE_PTS, halfWidth, toWorld, type P2, type P3 } from './geometry';

// A generic skull around the brain. Nothing here comes from the scan's face: the dome is the brain's own
// outline pushed outward by a bone gap, and the face is an average human template (in millimetres)
// placed against brain landmarks. It is a schematic, not a reconstruction of any person.

export const SKULL = {
  gap: 30,
  clear: 12,
  rings: 40,
  arc: 220,
  wmax: 345,
  stemCut: 625,
  taper: 230,
  origin: [360, 500] as P2,
}; // rays start between the brain and the face so both are reached in one pass
const xs = OUTLINE_PTS.map(p => p[0]);
const minX = Math.min(...xs),
  maxX = Math.max(...xs);
/** Outline units per millimetre, taking the brain as 180 mm long (a typical adult value). */
export const MM = (maxX - minX) / 180;

// ---------- brain landmarks ----------
const frontPole = OUTLINE_PTS.reduce((a, p) => (p[0] < a[0] ? p : a));
const frontBase = OUTLINE_PTS.filter(p => p[0] < minX + 0.25 * (maxX - minX)).reduce((a, p) => (p[1] > a[1] ? p : a)); // underside of the frontal lobe
/** Nasion: where the nose meets the forehead, just in front of and below the frontal lobe. */
export const NASION: P2 = [frontPole[0] - 0.2 * SKULL.gap, frontBase[1] + 6 * MM];
const at = (dx: number, dy: number): P2 => [NASION[0] + dx * MM, NASION[1] + dy * MM]; // dx back, dy down, in mm

// ---------- signed distance (positive inside) ----------
function sdPoly(poly: P2[], x: number, y: number): number {
  let d = Infinity,
    c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j],
      [bx, by] = poly[i],
      ex = bx - ax,
      ey = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey || 1)));
    d = Math.min(d, Math.hypot(x - ax - t * ex, y - ay - t * ey));
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) c = !c;
  }
  return c ? d : -d;
}
// The brain's side outline with the brainstem cut off where it leaves the skull (the skull base has an opening there).
const STEM: P2[] = OUTLINE_PTS.filter((_, i) => i % 3 === 0).map(([x, y]) => [x, Math.min(y, SKULL.stemCut)]);
const CELL = 8,
  X0 = -120,
  Y0 = -120,
  GW = Math.ceil(1240 / CELL),
  GH = Math.ceil(1240 / CELL);
let grid: Float32Array | null = null;
function sdStem(x: number, y: number) {
  if (!grid) {
    grid = new Float32Array(GW * GH);
    for (let j = 0; j < GH; j++)
      for (let i = 0; i < GW; i++) grid[j * GW + i] = sdPoly(STEM, X0 + i * CELL, Y0 + j * CELL);
  }
  const fx = Math.max(0, Math.min(GW - 1.001, (x - X0) / CELL)),
    fy = Math.max(0, Math.min(GH - 1.001, (y - Y0) / CELL));
  const i = Math.floor(fx),
    j = Math.floor(fy),
    u = fx - i,
    v = fy - j,
    k = j * GW + i;
  return (grid[k] * (1 - u) + grid[k + 1] * u) * (1 - v) + (grid[k + GW] * (1 - u) + grid[k + GW + 1] * u) * v;
}

// ---------- generic face, side view (mm from the nasion; dx back, dy down) ----------
const FACE_MM: [number, number][] = [
  [0, -12],
  [0, 0],
  [-9, 22],
  [1, 36],
  [-5, 50],
  [0, 56],
  [-4, 68],
  [-3, 76],
  [-1, 78],
  [2, 86],
  [5, 97],
  [-1, 110],
  [8, 120], // nose, teeth, chin
  [35, 121],
  [60, 116],
  [85, 100],
  [87, 88],
  [83, 70],
  [78, 52],
  [74, 42], // jaw angle and the back of the jaw
  [95, 45],
  [110, 48],
  [110, -12], // ear region, joining the skull base
];
export const FACE: P2[] = FACE_MM.map(([dx, dy]) => at(dx, dy));
const sdFace = (x: number, y: number) => sdPoly(FACE, x, y);
// half-width of the face in mm: narrow at the front (nose, chin), wide at the cheeks and the jaw angle
const ROWS = [0, 40, 60, 80, 120],
  FRONT = [52, 46, 32, 25, 18],
  BACK = [68, 68, 59, 51, 49];
function faceWidth(x: number, y: number) {
  const dx = (x - NASION[0]) / MM,
    dy = Math.max(0, Math.min(120, (y - NASION[1]) / MM));
  let k = 0;
  while (k < ROWS.length - 2 && dy > ROWS[k + 1]) k++;
  const t = (dy - ROWS[k]) / (ROWS[k + 1] - ROWS[k]),
    f = FRONT[k] + (FRONT[k + 1] - FRONT[k]) * t,
    b = BACK[k] + (BACK[k + 1] - BACK[k]) * t;
  const s = Math.max(0, Math.min(1, dx / 85)),
    sm = s * s * (3 - 2 * s);
  return (f + (b - f) * sm) * MM;
}
const lens = (sd: number, reach: number) => {
  const u = Math.max(0, Math.min(1, sd / reach));
  return Math.sqrt(u * (2 - u));
};

/** Signed distance to the skull's side outline (dome plus face), positive inside. */
export const sdSkull = (x: number, y: number) => Math.max(sdStem(x, y) + SKULL.gap, sdFace(x, y));
/** Left-right half-width of the skull at a point of the side view. */
export function skullWidth(x: number, y: number) {
  const dome = SKULL.wmax * lens(sdStem(x, y) + SKULL.gap, SKULL.taper + SKULL.gap);
  const face = faceWidth(x, y) * lens(sdFace(x, y), 25 * MM);
  return Math.max(dome, face);
}
/** How far a point is from the brain: negative means it is inside the brain. Outline units. */
export function brainClearance([x, y, z]: P3) {
  const hw = halfWidth(x, y);
  return hw > 0 ? Math.abs(z) - hw : Infinity;
}

export interface Skull {
  positions: Float32Array;
  index: Uint32Array;
  count: number;
  dropped: number;
  edge: P2[];
  reentries: number;
}
/** The skull as one closed shell (both sides), with an opening where the brainstem passes. World units. */
export function buildSkull(origin: P2 = SKULL.origin): Skull {
  const { arc, rings, clear } = SKULL,
    edge: P2[] = [];
  let reentries = 0;
  const HUB = { x: origin[0], y: origin[1] };
  for (let i = 0; i < arc; i++) {
    const th = (2 * Math.PI * i) / arc,
      dx = Math.cos(th),
      dy = Math.sin(th);
    let t = 0;
    while (t < 1400 && sdSkull(HUB.x + dx * t, HUB.y + dy * t) > 0) t += 3;
    let lo = Math.max(0, t - 3),
      hi = t;
    for (let k = 0; k < 18; k++) {
      const m = (lo + hi) / 2;
      if (sdSkull(HUB.x + dx * m, HUB.y + dy * m) > 0) lo = m;
      else hi = m;
    }
    edge.push([HUB.x + dx * lo, HUB.y + dy * lo]);
    for (let u = hi + 6; u < 1400; u += 6)
      if (sdSkull(HUB.x + dx * u, HUB.y + dy * u) > 0) {
        reentries++;
        break;
      }
  }
  const pts: P3[] = [],
    idx: number[] = [];
  let dropped = 0;
  for (const side of [-1, 1]) {
    const base = pts.length;
    for (let r = 0; r <= rings; r++) {
      const t = 1 - (1 - r / rings) ** 1.5;
      for (let i = 0; i < arc; i++) {
        const x = HUB.x + (edge[i][0] - HUB.x) * t,
          y = HUB.y + (edge[i][1] - HUB.y) * t;
        pts.push([x, y, r === rings ? 0 : side * skullWidth(x, y)]);
      }
    }
    for (let r = 0; r < rings; r++)
      for (let i = 0; i < arc; i++) {
        const a = base + r * arc + i,
          b = base + r * arc + ((i + 1) % arc),
          c = a + arc,
          d = b + arc;
        for (const tri of side > 0
          ? [
              [a, c, b],
              [b, c, d],
            ]
          : [
              [a, b, c],
              [b, d, c],
            ]) {
          if (tri.some(v => brainClearance(pts[v]) < clear)) {
            dropped++;
            continue;
          } // never pass through the brain
          idx.push(...tri);
        }
      }
  }
  const positions = new Float32Array(pts.length * 3);
  pts.forEach((p, k) => positions.set(toWorld(p), k * 3));
  return { positions, index: new Uint32Array(idx), count: pts.length, dropped, edge, reentries };
}

/** Thin detail lines of the face: eye sockets, nose opening, cheekbones, teeth line, jaw. Outline units, then world. */
export function skullLines(): P3[][] {
  const out: P3[][] = [],
    P = (dx: number, dy: number, zmm: number): P3 => [...at(dx, dy), zmm * MM];
  const curve = (f: (u: number) => [number, number, number], n = 24) =>
    Array.from({ length: n + 1 }, (_, k) => P(...f(k / n)));
  for (const s of [-1, 1]) {
    out.push(
      curve(u => {
        const a = 2 * Math.PI * u,
          z = 32 + 20 * Math.cos(a);
        return [4 + 10 * ((z - 12) / 40) ** 2, 18 + 17.5 * Math.sin(a), s * z];
      }, 40),
    ); // eye socket rim
    out.push(curve(u => [-2 + 6 * u, 24 + 28 * u, s * 12 * Math.sin(Math.PI * u)])); // nose opening
    out.push(
      curve(u => [
        22 + 50 * u,
        40 - 3 * Math.sin(Math.PI * u),
        s * (60 + 6 * Math.sin(Math.PI * Math.min(1, u * 1.3))),
      ]),
    ); // cheekbone arch to the ear
    out.push(curve(u => [10 + 20 * u, 52 - 8 * u, s * (40 + 23 * u)], 12)); // lower edge of the cheekbone
    out.push(curve(u => [-3 + 48 * u, 76 - 4 * u, s * 28 * Math.sin((Math.PI / 2) * u)])); // upper teeth line
    out.push(curve(u => [-1 + 46 * u, 78 + 2 * u, s * 27 * Math.sin((Math.PI / 2) * u)])); // lower teeth line
    out.push(
      curve(u => {
        const a = 1 - u;
        return [8 + 77 * a, 120 - 20 * a * a, s * (49 * Math.sin((Math.PI / 2) * a))];
      }),
    ); // lower border of the jaw
    out.push(curve(u => [72 + 13 * u, 40 + 60 * u, s * (50 - u)], 12)); // back of the jaw (ramus)
  }
  return out.map(l => l.map(toWorld));
}
