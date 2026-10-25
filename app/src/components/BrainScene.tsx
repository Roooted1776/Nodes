import { Html as DreiHtml, Line, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import type React from 'react';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { STAGE_COLOR, TYPE_COLOR, colorOf } from '../data/colors';
import { AGENT, AGENTS, isAgent } from '../data/team';
import { OUTLINE } from '../data/outline';
import { buildSkull, skullLines } from '../lib/skull';
import { buildShell, midline, placeMemory, route, station, surfaceFolds, toWorld, type P3 } from '../lib/geometry';
import { TYPE_LABEL, type Session } from '../lib/memory';
import { PULSE_AFTERGLOW, pulseMs, useMem, useStore, type Pulse } from '../store';
import { DOT_FRAG, DOT_VERT, RIM_FRAG, RIM_VERT } from '../lib/shaders';
import { sceneStats } from '../lib/stats';

/** Keep label roots on one DOM parent while Canvas disconnects during lock/unlock. */
function Html(props: React.ComponentProps<typeof DreiHtml>) {
  const gl = useThree(s => s.gl);
  const portal = useRef<HTMLElement>(gl.domElement.parentElement!);
  return <DreiHtml {...props} portal={portal} />;
}

type V3 = [number, number, number];

// ---------- dots, in the format of the Brain video: flat, solid, sized by weight, with a clean edge ----------
const DOT_U = { uDpr: { value: 1 }, uFocus: { value: 11 }, uScale: { value: 1000 }, uHalo: { value: 1 } };
const dotMaterial = () =>
  new THREE.ShaderMaterial({
    vertexShader: DOT_VERT,
    fragmentShader: DOT_FRAG,
    uniforms: DOT_U,
    transparent: true,
    depthWrite: false,
    depthTest: false,
  });
function dotGeometry(n: number) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(n), 1));
  g.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(n), 1));
  return g;
}
function setDot(
  g: THREE.BufferGeometry,
  i: number,
  p: V3 | THREE.Vector3,
  c: THREE.Color,
  size: number,
  alpha: number,
) {
  const a = g.attributes,
    q = Array.isArray(p) ? p : [p.x, p.y, p.z];
  (a.position as THREE.BufferAttribute).setXYZ(i, q[0], q[1], q[2]);
  (a.aColor as THREE.BufferAttribute).setXYZ(i, c.r, c.g, c.b);
  (a.aSize as THREE.BufferAttribute).setX(i, size);
  (a.aAlpha as THREE.BufferAttribute).setX(i, alpha);
}
const touched = (g: THREE.BufferGeometry) => {
  for (const k of ['position', 'aColor', 'aSize', 'aAlpha'])
    (g.attributes[k] as THREE.BufferAttribute).needsUpdate = true;
};

/** Frame rate and draw counts, read by the System check. */
function Probe() {
  const acc = useRef({ t: 0, n: 0 });
  useFrame(({ gl, size }, dt) => {
    const a = acc.current;
    a.t += dt;
    a.n++;
    if (a.t >= 1) {
      const r = gl.info.render;
      Object.assign(sceneStats, {
        fps: Math.round(a.n / a.t),
        calls: r.calls,
        points: r.points,
        lines: r.lines,
        triangles: r.triangles,
        width: Math.round(size.width),
        height: Math.round(size.height),
        webgl2: gl.capabilities.isWebGL2,
        stencil: !!gl.getContext().getContextAttributes()?.stencil,
        frames: sceneStats.frames + a.n,
      });
      a.t = 0;
      a.n = 0;
    }
  });
  return null;
}

/** Keeps dot size and focus in step with the camera and screen. */
function Focus() {
  const { camera, size, gl, controls } = useThree() as unknown as {
    camera: THREE.PerspectiveCamera;
    size: { height: number };
    gl: THREE.WebGLRenderer;
    controls?: { target: THREE.Vector3 };
  };
  useFrame(() => {
    DOT_U.uDpr.value = gl.getPixelRatio();
    DOT_U.uScale.value = size.height / (2 * Math.tan((camera.fov * Math.PI) / 360));
    DOT_U.uFocus.value = camera.position.distanceTo(controls?.target ?? new THREE.Vector3());
  });
  return null;
}

// ---------- the brain: a solid white outline, drawn over the nodes ----------
const Outline = memo(function Outline() {
  // smooth shell: the fold ripples are drawn as faint lines, so the glowing outline stays one clean line
  const geo = useMemo(() => {
    const s = buildShell(180, 30, true),
      g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(s.positions, 3));
    g.setIndex(new THREE.BufferAttribute(s.index, 1));
    g.computeVertexNormals();
    return g;
  }, []);
  const uniforms = useMemo(
    () => ({
      uLo: { value: 0.7 },
      uHi: { value: 0.9 },
      uGain: { value: 1 },
      uFill: { value: 0 },
      uTint: { value: new THREE.Color('#ffffff') },
    }),
    [],
  ); // about a 2.5 px line, measured in a raster simulation
  const glow = useMemo(
    () => ({
      uLo: { value: 0.55 },
      uHi: { value: 0.9 },
      uGain: { value: 0.3 },
      uFill: { value: 0 },
      uTint: { value: new THREE.Color('#ffffff') },
    }),
    [],
  ); // halo that hugs the edge
  const folds = useMemo(() => surfaceFolds(), []),
    mid = useMemo(() => midline(), []);
  const tracts = useMemo(
    () =>
      OUTLINE.tracts
        .map(t => ({ t, pts: (route(t.from, t.to) || []).map(p => toWorld(p)) }))
        .filter(x => x.pts.length > 1),
    [],
  );
  return (
    <group>
      {tracts.map(({ t, pts }) => (
        <Line
          key={t.id}
          points={pts}
          color="#ffffff"
          lineWidth={1}
          transparent
          opacity={0.07}
          depthTest={false}
          renderOrder={1}
        />
      ))}
      {/* depth only: lets just the nearest surface glow, so folds behind it do not show through as streaks */}
      <mesh geometry={geo} renderOrder={8}>
        <meshBasicMaterial colorWrite={false} depthWrite side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={geo} renderOrder={9}>
        <shaderMaterial
          vertexShader={RIM_VERT}
          fragmentShader={RIM_FRAG}
          uniforms={glow}
          transparent
          depthWrite={false}
          depthFunc={THREE.LessEqualDepth}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <mesh geometry={geo} renderOrder={10}>
        <shaderMaterial
          vertexShader={RIM_VERT}
          fragmentShader={RIM_FRAG}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          depthFunc={THREE.LessEqualDepth}
          side={THREE.DoubleSide}
        />
      </mesh>
      <Line
        points={mid}
        color="#ffffff"
        lineWidth={1.2}
        transparent
        opacity={0.35}
        depthTest={false}
        renderOrder={11}
      />
      {folds.map((f, i) => (
        <Line
          key={i}
          points={f}
          color="#ffffff"
          lineWidth={1}
          transparent
          opacity={0.14}
          depthTest={false}
          renderOrder={11}
        />
      ))}
    </group>
  );
});

// ---------- the skull: a faint, generic outline around the brain, never drawn over it ----------
/** How visible the skull is (0 to 1). The brain outline is 1. Change here to make the skull fainter or stronger. */
export const SKULL_OPACITY = 0.45;
/** A darker, cool "graphite" white, so the brain's pure white stays the brightest line (chosen by Owner, Oct 2026). */
const SKULL_TINT = '#9aa3b4',
  SKULL_GLASS = 0.03;
/** The brain marks its screen area in the stencil buffer; the skull is drawn only outside that area. */
const BEHIND_BRAIN = {
  stencilWrite: true,
  stencilRef: 1,
  stencilFunc: THREE.NotEqualStencilFunc,
  stencilFail: THREE.KeepStencilOp,
  stencilZFail: THREE.KeepStencilOp,
  stencilZPass: THREE.KeepStencilOp,
} as const;
const Skull = memo(function Skull({ opacity = SKULL_OPACITY }: { opacity?: number }) {
  const mask = useMemo(() => {
    const s = buildShell(),
      g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(s.positions, 3));
    g.setIndex(new THREE.BufferAttribute(s.index, 1));
    const m = new THREE.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      stencilWrite: true,
      stencilRef: 1,
      stencilFunc: THREE.AlwaysStencilFunc,
      stencilZPass: THREE.ReplaceStencilOp,
      stencilFail: THREE.ReplaceStencilOp,
      stencilZFail: THREE.ReplaceStencilOp,
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.renderOrder = -1;
    mesh.frustumCulled = false;
    return mesh;
  }, []);
  const shell = useMemo(() => {
    const s = buildSkull(),
      g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(s.positions, 3));
    g.setIndex(new THREE.BufferAttribute(s.index, 1));
    g.computeVertexNormals();
    sceneStats.skullTriangles = s.index.length / 3;
    const m = new THREE.ShaderMaterial({
      vertexShader: RIM_VERT,
      fragmentShader: RIM_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      ...BEHIND_BRAIN,
      uniforms: {
        uLo: { value: 0.74 },
        uHi: { value: 0.93 },
        uGain: { value: opacity },
        uFill: { value: SKULL_GLASS },
        uTint: { value: new THREE.Color(SKULL_TINT) },
      },
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.renderOrder = 7;
    mesh.frustumCulled = false;
    return mesh;
  }, [opacity]);
  const lines = useMemo(() => {
    const seg: number[] = [];
    for (const l of skullLines()) for (let i = 1; i < l.length; i++) seg.push(...l[i - 1], ...l[i]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(seg), 3));
    const ls = new THREE.LineSegments(
      g,
      new THREE.LineBasicMaterial({
        color: SKULL_TINT,
        transparent: true,
        opacity: opacity * 0.75,
        depthWrite: false,
        depthTest: false,
        ...BEHIND_BRAIN,
      }),
    );
    ls.renderOrder = 7;
    ls.frustumCulled = false;
    return ls;
  }, [opacity]);
  useEffect(
    () => () => {
      for (const o of [mask, shell, lines]) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    },
    [mask, shell, lines],
  );
  return (
    <group>
      <primitive object={mask} />
      <primitive object={shell} />
      <primitive object={lines} />
    </group>
  );
});

// ---------- agents: warm dots on their stations ----------
function Agents({ locked }: { locked: boolean }) {
  const active = useStore(s => s.active),
    stages = useStore(s => s.stages);
  const list = useMemo(
    () => [
      ...AGENTS.map(a => ({ id: a.id as string, name: a.name, p: toWorld(station(a.id) as P3) })),
      { id: 'hub', name: '', p: toWorld(station('hub') as P3) },
    ],
    [],
  );
  const geo = useMemo(() => dotGeometry(list.length), [list]),
    mat = useMemo(dotMaterial, []),
    c = useMemo(() => new THREE.Color(), []);
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );
  const ease = useMemo(
    () => list.map(a => ({ c: new THREE.Color(colorOf(a.id)), size: 0.2, alpha: 1, spark: 0, len: 0 })),
    [list],
  );
  useFrame(({ clock }, dt) => {
    const s = useStore.getState(),
      t = clock.elapsedTime,
      k = 1 - Math.exp(-Math.min(dt, 0.1) * 4.5); // about 0.5 s to settle
    list.forEach((a, i) => {
      if (a.id === 'hub') {
        c.set('#ffffff');
        setDot(geo, i, a.p, c, 0.17 + (s.busy ? 0.025 * Math.sin(t * 3) : 0), locked ? 0.5 : 1);
        return;
      }
      const st = s.stages[a.id as keyof typeof s.stages],
        on = s.active === a.id,
        e = ease[i];
      c.set(st === 'failed' ? STAGE_COLOR.failed : colorOf(a.id));
      if (on) c.lerp(WHITE, 0.2 + 0.15 * Math.sin(t * 3)); // its own colour; the working bot breathes toward white
      // while its reply streams in, every new piece of text makes the dot flash a little (real arrivals, not a timer)
      const dl = s.draft?.from === a.id ? s.draft.text.length : 0;
      if (dl > e.len) e.spark = Math.min(1, e.spark + 0.35 + (dl - e.len) / 400);
      e.len = dl;
      e.spark *= Math.exp(-Math.min(dt, 0.1) * 5);
      if (e.spark > 0.01) c.lerp(WHITE, 0.5 * e.spark);
      e.c.lerp(c, k);
      e.size += ((on ? 0.25 + 0.03 * Math.sin(t * 3) : 0.2) + 0.08 * e.spark - e.size) * k;
      e.alpha += ((locked ? 0.45 : st === 'skipped' ? 0.3 : st === 'waiting' ? 0.7 : 1) - e.alpha) * k;
      setDot(geo, i, a.p, e.c, e.size, e.alpha);
    });
    touched(geo);
  });
  return (
    <group>
      <points geometry={geo} material={mat} frustumCulled={false} renderOrder={3} />
      {!locked &&
        list
          .filter(a => a.name)
          .map(a => (
            <group key={a.id} position={a.p}>
              {/* biome-ignore lint/a11y/noStaticElementInteractions: three.js mesh; label button offers keyboard access */}
              <mesh
                onClick={ev => {
                  ev.stopPropagation();
                  if (isAgent(a.id))
                    useStore.setState(s => ({
                      tab: 'chat',
                      sceneFocus: { kind: 'agent', id: a.id, sequence: (s.sceneFocus?.sequence || 0) + 1 },
                    }));
                }}
              >
                <sphereGeometry args={[0.18, 12, 12]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>
              <Html center distanceFactor={9} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    useStore.setState(s => ({
                      tab: 'chat',
                      sceneFocus: { kind: 'agent', id: a.id, sequence: (s.sceneFocus?.sequence || 0) + 1 },
                      inspectedBot: isAgent(a.id) ? (a.id as any) : null,
                    }));
                  }}
                  className={
                    'agent-tag' +
                    (active === a.id ? ' on' : '') +
                    (stages[a.id as keyof typeof stages] === 'skipped' ? ' off' : '')
                  }
                  style={{ '--c': colorOf(a.id), pointerEvents: 'auto', cursor: 'pointer' } as React.CSSProperties}
                  title={`${a.name} · Click to inspect`}
                >
                  {a.name}
                  {isAgent(a.id) && AGENT[a.id].company && (
                    <span className="bot-company"> · {AGENT[a.id].company}</span>
                  )}
                </button>
              </Html>
            </group>
          ))}
    </group>
  );
}

// ---------- memory: coloured dots by type, linked by faint lines ----------
function Memories() {
  const mem = useMem(),
    selected = useStore(s => s.selected),
    select = useStore(s => s.select),
    viewing = useStore(s => s.viewing),
    viewSession = useStore(s => s.viewSession),
    [hover, setHover] = useState<string | null>(null),
    [hoverTask, setHoverTask] = useState<string | null>(null);
  const pos = useMemo(() => placeMemory(mem.entries), [mem.entries]);
  const top = useMemo(
    () =>
      new Set(
        [...mem.entries]
          .sort((a, b) => b.strength - a.strength)
          .slice(0, 12)
          .map(e => e.id),
      ),
    [mem.entries],
  );
  const sel = selected ? mem.entries.find(e => e.id === selected) : undefined;
  const list = useMemo(() => mem.entries.filter(e => pos.has(e.id)), [mem.entries, pos]);

  const taskNodes = useMemo(() => {
    const items: {
      session: Session;
      pos: V3;
      parentPos: V3;
    }[] = [];
    const linkPoints: number[] = [];

    const byProject = new Map<string, Session[]>();
    for (const s of mem.sessions) {
      const projKey = (s.projectId || s.project || 'Brain').toLowerCase();
      const arr = byProject.get(projKey) || [];
      arr.push(s);
      byProject.set(projKey, arr);
    }

    for (const [projKey, sessions] of byProject.entries()) {
      const pNode =
        list.find(
          e => e.type === 'workstream' && (e.id.toLowerCase() === projKey || e.title.toLowerCase() === projKey),
        ) || list.find(e => e.type === 'workstream');

      if (!pNode || !pos.has(pNode.id)) continue;
      const parentP3 = toWorld(pos.get(pNode.id)!);
      const parentPos: V3 = [parentP3[0], parentP3[1], parentP3[2]];

      const total = sessions.length;
      sessions.forEach((s, idx) => {
        const phi = (idx / Math.max(1, total)) * Math.PI * 2 + 0.35;
        const rad = 0.28 + (idx % 2) * 0.08;
        const taskPos: V3 = [
          parentPos[0] + Math.cos(phi) * rad,
          parentPos[1] + Math.sin(phi) * rad * 0.8,
          parentPos[2] + Math.sin(phi * 2) * 0.12,
        ];
        items.push({ session: s, pos: taskPos, parentPos });
        linkPoints.push(...parentPos, ...taskPos);
      });
    }

    return { items, linkLines: new Float32Array(linkPoints) };
  }, [mem.sessions, list, pos]);
  const mat = useMemo(dotMaterial, []);
  const geo = useMemo(() => {
    const g = dotGeometry(list.length),
      c = new THREE.Color();
    list.forEach((e, i) => {
      const on = e.id === selected,
        linked = !!sel?.links.includes(e.id),
        grey = !!sel && !on && !linked;
      c.set(grey ? '#6b6b72' : TYPE_COLOR[e.type]);
      setDot(
        g,
        i,
        toWorld(pos.get(e.id)!),
        c,
        (0.1 + 0.02 * e.strength) * (on ? 1.5 : grey ? 0.8 : e.id === hover ? 1.15 : 1),
        e.status === 'stale' ? 0.4 : grey ? 0.7 : 1,
      );
    });
    return g;
  }, [list, pos, selected, sel, hover]);
  useEffect(() => () => geo.dispose(), [geo]);
  useEffect(() => () => mat.dispose(), [mat]);
  const links = useMemo(() => {
    const a: number[] = [],
      b: number[] = [],
      seen = new Set<string>();
    for (const e of list)
      for (const o of e.links) {
        const k = e.id < o ? e.id + o : o + e.id;
        if (seen.has(k) || !pos.has(o)) continue;
        seen.add(k);
        (selected && (e.id === selected || o === selected) ? b : a).push(
          ...toWorld(pos.get(e.id)!),
          ...toWorld(pos.get(o)!),
        );
      }
    return { a: new Float32Array(a), b: new Float32Array(b) };
  }, [list, pos, selected]);
  return (
    <group>
      {links.a.length > 0 && (
        <lineSegments key={'a' + links.a.length} renderOrder={2}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[links.a, 3]} />
          </bufferGeometry>
          <lineBasicMaterial
            color="#9a9aa2"
            transparent
            opacity={selected ? 0.05 : 0.16}
            depthTest={false}
            depthWrite={false}
          />
        </lineSegments>
      )}
      {links.b.length > 0 && (
        <lineSegments key={'b' + links.b.length + selected} renderOrder={2}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[links.b, 3]} />
          </bufferGeometry>
          <lineBasicMaterial color="#dcdce2" transparent opacity={0.6} depthTest={false} depthWrite={false} />
        </lineSegments>
      )}
      <points geometry={geo} material={mat} frustumCulled={false} renderOrder={4} />
      {list.map(e => {
        const on = e.id === selected,
          show =
            on || e.id === hover || !!sel?.links.includes(e.id) || (!selected && (top.has(e.id) || list.length <= 12)); // like the video: the focused cluster is labelled
        return (
          <group key={e.id} position={toWorld(pos.get(e.id)!)}>
            {/* biome-ignore lint/a11y/noStaticElementInteractions: a three.js mesh, not a DOM element; the Memory tab offers the same choice as buttons */}
            <mesh
              onClick={ev => {
                ev.stopPropagation();
                select(e.id);
                useStore.setState(s => ({
                  tab: 'memory',
                  sceneFocus: { kind: 'memory', id: e.id, sequence: (s.sceneFocus?.sequence || 0) + 1 },
                }));
              }}
              onPointerOver={ev => {
                ev.stopPropagation();
                setHover(e.id);
                document.body.style.cursor = 'pointer';
              }}
              onPointerOut={() => {
                setHover(null);
                document.body.style.cursor = '';
              }}
            >
              <sphereGeometry args={[0.14, 8, 8]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
            {show && (
              <Html center distanceFactor={9} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
                <div className={'mem-tag ' + e.type + (on ? ' on' : '')} title={TYPE_LABEL[e.type]}>
                  {e.title.length > 26 ? e.title.slice(0, 25) + '…' : e.title}
                </div>
              </Html>
            )}
          </group>
        );
      })}
      {taskNodes.linkLines.length > 0 && (
        <lineSegments renderOrder={3}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[taskNodes.linkLines, 3]} />
          </bufferGeometry>
          <lineBasicMaterial color="#38bdf8" transparent opacity={0.35} depthTest={false} depthWrite={false} />
        </lineSegments>
      )}
      {taskNodes.items.map(({ session: s, pos: tPos }) => {
        const isViewing = viewing?.id === s.id;
        const isHovered = hoverTask === s.id;
        const showTag = isViewing || isHovered;
        return (
          <group key={s.id} position={tPos}>
            {/* Visual smaller node */}
            <mesh renderOrder={5}>
              <sphereGeometry args={[0.055, 12, 12]} />
              <meshBasicMaterial
                color={isViewing ? '#ffffff' : isHovered ? '#7dd3fc' : '#38bdf8'}
                transparent
                opacity={isViewing ? 1 : 0.85}
              />
            </mesh>
            {/* Hit area for clicking the smaller node to view the task */}
            {/* biome-ignore lint/a11y/noStaticElementInteractions: a three.js mesh, not a DOM element */}
            <mesh
              onClick={ev => {
                ev.stopPropagation();
                viewSession(viewing?.id === s.id ? null : s.id);
                useStore.setState(st => ({
                  tab: 'chat',
                  sceneFocus: { kind: 'memory', id: s.projectId || s.id, sequence: (st.sceneFocus?.sequence || 0) + 1 },
                }));
              }}
              onPointerOver={ev => {
                ev.stopPropagation();
                setHoverTask(s.id);
                document.body.style.cursor = 'pointer';
              }}
              onPointerOut={() => {
                setHoverTask(null);
                document.body.style.cursor = '';
              }}
            >
              <sphereGeometry args={[0.09, 8, 8]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
            {showTag && (
              <Html center distanceFactor={9} zIndexRange={[25, 0]} style={{ pointerEvents: 'none' }}>
                <div className={'task-node-tag' + (isViewing ? ' on' : '')}>
                  {s.q.length > 28 ? s.q.slice(0, 26) + '…' : s.q}
                </div>
              </Html>
            )}
          </group>
        );
      })}
    </group>
  );
}

// ---------- live handoff: a comet of light runs the path, its colour melting from sender to receiver ----------
const TRAIL = 8,
  SAMPLES = 72,
  WHITE = new THREE.Color('#ffffff');
const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const easeInOut = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : 0.5 - 0.5 * Math.cos(Math.PI * t)); // leaves gently, arrives gently
function endColor(id: string, memColor: (id: string) => string | undefined) {
  if (id.startsWith('mem:')) return new THREE.Color(memColor(id.slice(4)) || '#ffffff');
  return new THREE.Color(colorOf(id));
}
function Transit({ p }: { p: Pulse }) {
  const mem = useMem(),
    memPos = useMemo(() => placeMemory(mem.entries), [mem.entries]);
  const data = useMemo(() => {
    let pts: THREE.Vector3[] | null = null;
    if (p.from.startsWith('mem:')) {
      const m = memPos.get(p.from.slice(4)),
        b = station(p.to),
        h = station('hub');
      if (!m || !b || !h) return null;
      const A = new THREE.Vector3(...toWorld(m)),
        B = new THREE.Vector3(...toWorld(b as P3)),
        H = new THREE.Vector3(...toWorld(h as P3));
      pts = new THREE.QuadraticBezierCurve3(A, A.clone().lerp(B, 0.5).lerp(H, 0.35), B).getSpacedPoints(SAMPLES - 1);
    } else {
      const r = route(p.from, p.to);
      if (!r || r.length < 2) return null;
      const raw = r.map(q => new THREE.Vector3(...toWorld(q)));
      pts =
        raw.length > 2
          ? new THREE.CatmullRomCurve3(raw, false, 'centripetal').getSpacedPoints(SAMPLES - 1)
          : new THREE.LineCurve3(raw[0], raw[1]).getSpacedPoints(SAMPLES - 1);
    }
    const typeOf = (id: string) => {
      const e = mem.entries.find(x => x.id === id);
      return e ? TYPE_COLOR[e.type] : undefined;
    };
    const from = endColor(p.from, typeOf),
      to = endColor(p.to, typeOf),
      mid = from.clone().lerp(to, 0.5).lerp(WHITE, 0.2);
    // colour along the path melts from the sender's colour into the receiver's, a little brighter in the middle, with no hard steps
    const base = pts.map((_, k) => {
      const u = k / (pts!.length - 1);
      return from
        .clone()
        .lerp(to, smooth(0, 1, u))
        .lerp(WHITE, 0.2 * Math.sin(Math.PI * u));
    });
    return { pts, base, from, to, mid, dur: pulseMs(p) };
  }, [p, memPos, mem.entries]);
  const line = useMemo(() => {
    if (!data) return null;
    const g = new THREE.BufferGeometry().setFromPoints(data.pts);
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(data.pts.length * 3), 3));
    const l = new THREE.Line(
      g,
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
      }),
    );
    l.renderOrder = 5;
    l.frustumCulled = false;
    return l;
  }, [data]);
  const dots = useMemo(() => dotGeometry(TRAIL + 2), []),
    mat = useMemo(dotMaterial, []),
    c = useMemo(() => new THREE.Color(), []),
    v = useMemo(() => new THREE.Vector3(), []);
  const tag = useRef<THREE.Group>(null),
    tagEl = useRef<HTMLDivElement>(null);
  useEffect(
    () => () => {
      dots.dispose();
      mat.dispose();
      line?.geometry.dispose();
      (line?.material as THREE.Material | undefined)?.dispose();
    },
    [dots, mat, line],
  );
  const n = data ? data.pts.length - 1 : 1;
  const at = (u: number, out: THREE.Vector3) => {
    const x = Math.max(0, Math.min(1, u)) * n,
      k = Math.min(n - 1, Math.floor(x));
    return out.copy(data!.pts[k]).lerp(data!.pts[k + 1], x - k);
  };
  const colAt = (u: number, out: THREE.Color) => {
    const x = Math.max(0, Math.min(1, u)) * n,
      k = Math.min(n - 1, Math.floor(x));
    return out.copy(data!.base[k]).lerp(data!.base[k + 1], x - k);
  };
  useFrame(() => {
    if (!data || !line) return;
    const ms = performance.now() - p.t0,
      t = ms / data.dur,
      h = easeInOut(t);
    const fadeIn = smooth(0, 160, ms),
      fade = t <= 1 ? fadeIn : 1 - smooth(0, PULSE_AFTERGLOW, ms - data.dur);
    const col = line.geometry.attributes.color as THREE.BufferAttribute;
    for (let k = 0; k <= n; k++) {
      // lit behind the head, brightest at the head, dark ahead of it; the path keeps a soft afterglow
      const u = k / n,
        behind = h - u,
        lit = behind < -0.01 ? 0 : (0.3 + 0.7 * Math.exp(-Math.max(0, behind) / 0.12)) * smooth(-0.01, 0.01, behind),
        b = data.base[k];
      col.setXYZ(k, b.r * lit * fade, b.g * lit * fade, b.b * lit * fade);
    }
    col.needsUpdate = true;
    const moving = t >= 0 && t <= 1 ? fadeIn : 0;
    for (let j = 0; j < TRAIL; j++) {
      const u = h - j * 0.016;
      colAt(u, c);
      if (j === 0) c.lerp(WHITE, 0.4);
      setDot(dots, j, at(u, v), c, 0.14 - j * 0.012, u >= 0 ? moving * (1 - j / TRAIL) : 0);
    }
    const send = 1 - smooth(0, 0.3, t),
      recv = smooth(0.82, 1, t) * (t <= 1 ? 1 : fade);
    c.copy(data.from).lerp(data.mid, smooth(0, 0.3, t));
    setDot(dots, TRAIL, data.pts[0], c, 0.24 + 0.12 * (1 - send), t >= 0 ? send * 0.55 * fadeIn : 0);
    c.copy(data.mid).lerp(data.to, smooth(0.9, 1.6, t));
    setDot(dots, TRAIL + 1, data.pts[n], c, 0.26 + 0.22 * smooth(0.85, 1.5, t), recv * 0.6);
    touched(dots);
    if (tag.current) at(h, tag.current.position);
    if (tagEl.current) tagEl.current.style.opacity = String(moving * (1 - smooth(0.85, 1, t)));
  });
  if (!data || !line) return null;
  return (
    <group>
      <primitive object={line} />
      <points geometry={dots} material={mat} frustumCulled={false} renderOrder={6} />
      {p.words ? (
        <group ref={tag}>
          <Html center distanceFactor={9} zIndexRange={[25, 0]} style={{ pointerEvents: 'none' }}>
            <div ref={tagEl} className="packet" style={{ opacity: 0, borderColor: colorOf(p.to) }}>
              {p.words} words
            </div>
          </Html>
        </group>
      ) : null}
    </group>
  );
}
// ---------- history: paths that carried more words over all saved sessions glow a little brighter ----------
function History() {
  const mem = useMem();
  const lines = useMemo(() => {
    const tot = new Map<string, number>();
    for (const s of mem.sessions)
      for (const [a, b, w] of s.flow || []) if (w > 0) tot.set(a + '>' + b, (tot.get(a + '>' + b) || 0) + w);
    const max = Math.max(1, ...tot.values()),
      out: THREE.Line[] = [];
    for (const [k, w] of tot) {
      const [a, b] = k.split('>'),
        r = route(a, b);
      if (!r || r.length < 2) continue;
      const raw = r.map(q => new THREE.Vector3(...toWorld(q))),
        pts = raw.length > 2 ? new THREE.CatmullRomCurve3(raw, false, 'centripetal').getSpacedPoints(47) : raw;
      const lvl = 0.05 + (0.2 * Math.log1p(w)) / Math.log1p(max),
        A = new THREE.Color(colorOf(a)),
        Bc = new THREE.Color(colorOf(b)),
        col = new Float32Array(pts.length * 3);
      pts.forEach((_, j) => {
        const c = A.clone()
          .lerp(Bc, j / (pts.length - 1))
          .multiplyScalar(lvl);
        col.set([c.r, c.g, c.b], j * 3);
      });
      const g = new THREE.BufferGeometry().setFromPoints(pts);
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const l = new THREE.Line(
        g,
        new THREE.LineBasicMaterial({
          vertexColors: true,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthTest: false,
          depthWrite: false,
        }),
      );
      l.renderOrder = 4;
      l.frustumCulled = false;
      out.push(l);
    }
    return out;
  }, [mem.sessions]);
  useEffect(
    () => () =>
      lines.forEach(l => {
        l.geometry.dispose();
        (l.material as THREE.Material).dispose();
      }),
    [lines],
  );
  return (
    <>
      {lines.map((l, i) => (
        <primitive key={i} object={l} />
      ))}
    </>
  );
}
const Transits = () => {
  const pulses = useStore(s => s.pulses);
  return (
    <>
      {pulses.map(p => (
        <Transit key={p.id} p={p} />
      ))}
    </>
  );
};

function Rig() {
  const controls = useRef<{ target: THREE.Vector3 } | null>(null),
    selected = useStore(s => s.selected),
    auto = useStore(s => s.autoRotate),
    mem = useMem();
  const target = useRef(new THREE.Vector3(...HEAD_CENTER));
  useEffect(() => {
    const e = selected ? mem.entries.find(x => x.id === selected) : undefined,
      p = e && placeMemory(mem.entries).get(e.id);
    if (p) target.current.set(...(toWorld(p).map(v => v * 0.7) as V3));
    else target.current.set(...HEAD_CENTER);
  }, [selected, mem.entries]);
  useFrame((_, dt) => {
    controls.current?.target.lerp(target.current, Math.min(1, dt * 3));
  });
  return (
    <OrbitControls
      ref={controls as never}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      autoRotate={auto}
      autoRotateSpeed={0.55}
      minDistance={3}
      maxDistance={32}
      target={HEAD_CENTER}
      enablePan={false}
    />
  );
}

/** Parts of the head, all in one group (the skull is drawn first, outside the brain's screen area). */
/** Middle of the whole head (skull and brain), so the camera frames all of it. World units. */
export const HEAD_CENTER: V3 = [-0.2, -1.0, 0];
export const HEAD_PARTS = ['skull', 'agents', 'memories', 'transits', 'brain'] as const;

/** The brain as a solid white outline, with flat coloured memory dots and warm agent dots behind it, and live handoffs travelling between agents. */
export default function BrainScene({ locked = false }: { locked?: boolean }) {
  const select = useStore(s => s.select);
  return (
    <Canvas
      camera={{ position: [3.8, 0.9, 18.5], fov: 40 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true, stencil: true, powerPreference: 'high-performance' }}
      onPointerMissed={() => select(null)}
      aria-label="Brain outline with memory and agent dots"
    >
      <Probe />
      <Focus />
      {/* One piece: the skull, the brain and everything inside it share one group, so they turn and zoom together. */}
      <group name="head">
        <Skull />
        <Agents locked={locked} />
        {!locked && <Memories />}
        {!locked && <History />}
        <Transits />
        <Outline />
      </group>
      <Rig />
    </Canvas>
  );
}
