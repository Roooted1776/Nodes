import { colorOf } from '../data/colors';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { AGENTS, TEAM_EDGES, isAgent, type AgentId } from '../data/team';
import { pulseMs, useStore } from '../store';

const DOT = { waiting: '#9aa4c4', working: '#ffffff', done: '#8ff0c0', failed: '#ff7a7a', skipped: '#4a5170' } as const;

/** The node diagram: who hands work to whom. Drag a node to move it. Click to see each bot. */
export default function TeamDiagram() {
  const box = useRef<HTMLDivElement>(null),
    stages = useStore(s => s.stages),
    active = useStore(s => s.active),
    pulses = useStore(s => s.pulses),
    live = useStore(s => s.live),
    inactiveBots = useStore(s => s.inactiveBots || []),
    inspectedBot = useStore(s => s.inspectedBot),
    inspectBot = useStore(s => s.inspectBot);
  const [pos, setPos] = useState<Record<string, { x: number; y: number }>>(() =>
    Object.fromEntries(AGENTS.map(a => [a.id, { x: a.x, y: a.y }])),
  );
  const [, tick] = useState(0),
    drag = useRef<AgentId | null>(null),
    hasMoved = useRef(false);
  useEffect(() => {
    if (!pulses.length) return;
    let id = 0;
    const loop = () => {
      tick(n => n + 1);
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [pulses.length]);
  const move = (e: React.PointerEvent) => {
    if (!drag.current || !box.current) return;
    hasMoved.current = true;
    const r = box.current.getBoundingClientRect();
    const id = drag.current;
    setPos(p => ({
      ...p,
      [id]: {
        x: Math.min(0.94, Math.max(0.06, (e.clientX - r.left) / r.width)),
        y: Math.min(0.92, Math.max(0.06, (e.clientY - r.top) / r.height)),
      },
    }));
  };
  const W = 1000,
    H = 700,
    spot = (id: string) => (isAgent(id) ? { x: pos[id].x * W, y: pos[id].y * H } : null);
  return (
    <div
      className="team"
      ref={box}
      onPointerMove={move}
      onPointerUp={() => (drag.current = null)}
      onPointerLeave={() => (drag.current = null)}
    >
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M1 1 L9 5 L1 9" fill="none" stroke="#7d89c8" strokeWidth="1.4" />
          </marker>
        </defs>
        {TEAM_EDGES.map(([a, b], i) => {
          const isAInactive = inactiveBots.includes(a),
            isBInactive = inactiveBots.includes(b),
            isInactiveEdge = isAInactive || isBInactive,
            isConnected = !inspectedBot || a === inspectedBot || b === inspectedBot;
          const p = spot(a)!,
            q = spot(b)!,
            dx = q.x - p.x,
            dy = q.y - p.y,
            l = Math.hypot(dx, dy) || 1,
            k = 62 / l;
          return (
            <line
              key={i}
              x1={p.x + dx * k}
              y1={p.y + dy * k}
              x2={q.x - dx * k}
              y2={q.y - dy * k}
              className={
                'edge' +
                (a === 'muse' && b === 'claude' ? ' audit' : '') +
                (isInactiveEdge ? ' edge-inactive' : '') +
                (inspectedBot ? (isConnected ? ' edge-spotlight' : ' edge-dimmed') : '')
              }
              markerEnd={isInactiveEdge ? undefined : 'url(#arr)'}
            />
          );
        })}
        {pulses.map(pl => {
          if (
            (pl.from !== 'owner' && isAgent(pl.from) && inactiveBots.includes(pl.from)) ||
            (pl.to !== 'brain' && isAgent(pl.to) && inactiveBots.includes(pl.to))
          ) {
            return null;
          }
          const a = spot(pl.from === 'owner' ? pl.to : pl.from),
            b = spot(pl.to === 'brain' ? pl.from : pl.to);
          if (!a || !b || a === b) return null;
          const dur = pulseMs(pl),
            age = performance.now() - pl.t0,
            t = Math.min(1, age / dur),
            fade = age <= dur ? 1 : Math.max(0, 1 - (age - dur) / 600);
          const L = Math.hypot(b.x - a.x, b.y - a.y),
            pt = (u: number) => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u }),
            h = pt(t);
          return (
            <g key={pl.id} opacity={fade}>
              <defs>
                <linearGradient id={`g${pl.id}`} gradientUnits="userSpaceOnUse" x1={a.x} y1={a.y} x2={b.x} y2={b.y}>
                  <stop offset="0" stopColor={colorOf(pl.from)} />
                  <stop offset="1" stopColor={colorOf(pl.to)} />
                </linearGradient>
              </defs>
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={`url(#g${pl.id})`}
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={L}
                strokeDashoffset={L * (1 - t)}
                opacity="0.85"
              />
              {t < 1 &&
                [0.05, 0.1, 0.15].map((d, k) => {
                  const q = pt(Math.max(0, t - d));
                  return (
                    <circle
                      key={k}
                      cx={q.x}
                      cy={q.y}
                      r={6 - k * 1.5}
                      fill={colorOf(pl.from)}
                      opacity={0.5 - k * 0.14}
                    />
                  );
                })}
              {t < 1 && (
                <>
                  <circle cx={h.x} cy={h.y} r="18" fill={colorOf(pl.from)} opacity="0.3" />
                  <circle cx={h.x} cy={h.y} r="7" fill="#fff" />
                </>
              )}
              {t >= 1 && (
                <circle
                  cx={b.x}
                  cy={b.y}
                  r={22 + 36 * (1 - fade)}
                  fill="none"
                  stroke={colorOf(pl.to)}
                  strokeWidth="2"
                />
              )}
            </g>
          );
        })}
      </svg>
      {AGENTS.map(a => {
        const st = stages[a.id],
          on = active === a.id,
          isInactive = inactiveBots.includes(a.id),
          isInspected = inspectedBot === a.id,
          p = pos[a.id];
        return (
          <button
            type="button"
            key={a.id}
            className={`tnode ${a.kind}${on ? ' on' : ''}${isInspected ? ' inspected' : ''}${st === 'skipped' || isInactive ? ' off' : ''}${isInactive ? ' inactive' : ''}`}
            style={{ left: p.x * 100 + '%', top: p.y * 100 + '%', '--c': colorOf(a.id) } as React.CSSProperties}
            onPointerDown={e => {
              hasMoved.current = false;
              drag.current = a.id;
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            }}
            onClick={() => {
              if (!hasMoved.current) {
                inspectBot(inspectedBot === a.id ? null : a.id);
              }
            }}
            title={
              isInactive
                ? `${a.name} (${a.company}) · Inactive / No Credits · Click to inspect`
                : `${a.name} (${a.company}) · ${a.specialty} · Click to inspect`
            }
          >
            <b>
              <i className="sw8" aria-hidden="true" />
              {a.name}
              {a.company && <small className="bot-co">{a.company}</small>}
            </b>
            <span>{a.role}</span>
            {isInactive && <span className="badge-nocredit">No Credits</span>}
            {st && !isInactive && (
              <i className="dot" style={{ background: on ? 'var(--live)' : DOT[st] }} role="img" aria-label={st} />
            )}
            {on && <em>{live.models[live.provider]}</em>}
          </button>
        );
      })}
      <nav className="team-roster" aria-label="AI Team Roster">
        <span className="roster-title">THE TEAM:</span>
        {AGENTS.map(a => {
          const isSelected = inspectedBot === a.id;
          const isInactive = inactiveBots.includes(a.id);
          return (
            <button
              type="button"
              key={a.id}
              className={`roster-pill${isSelected ? ' on' : ''}${isInactive ? ' inactive' : ''}`}
              style={{ '--c': colorOf(a.id) } as React.CSSProperties}
              onClick={() => inspectBot(isSelected ? null : a.id)}
              title={`${a.name} (${a.company}) · ${a.role}`}
            >
              <b className="sw8" style={{ background: colorOf(a.id) }} aria-hidden="true" />
              <span>{a.name}</span>
              {a.company && <small>{a.company}</small>}
            </button>
          );
        })}
      </nav>
      <p className="hint">
        Pipeline: Collect → Review → Edit → Review → Pass to next → Review. Click any bot to inspect their role and
        handoffs. Drag to move.
      </p>
    </div>
  );
}
