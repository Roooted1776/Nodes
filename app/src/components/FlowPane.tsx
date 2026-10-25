import { useEffect, useRef, type CSSProperties } from 'react';
import { colorOf } from '../data/colors';
import { AGENT, isAgent } from '../data/team';
import { pulseMs, useStore } from '../store';
import BotIcon from './BotIcon';

const label = (id: string) =>
  isAgent(id)
    ? AGENT[id].name
    : id === 'owner'
      ? 'You'
      : id === 'brain'
        ? 'Memory'
        : id.startsWith('mem')
          ? 'Memory'
          : id;

function End({ id, limited }: { id: string; limited: string[] }) {
  return (
    <span className={'end' + (limited.includes(id) ? ' limited' : '')} style={{ '--c': colorOf(id) } as CSSProperties}>
      {isAgent(id) && <BotIcon id={id} size={14} />}
      <b>{label(id)}</b>
    </span>
  );
}

/** Starting point → which bot the work goes to next, one line per handoff, newest at the bottom. */
export default function FlowPane() {
  const live = useStore(s => s.flow),
    viewing = useStore(s => s.viewing),
    busy = useStore(s => s.busy),
    limited = useStore(s => s.limited),
    pulse = useStore(s => s.pulses.filter(p => !p.from.startsWith('mem:')).at(-1));
  const flow = viewing?.flow || live;
  const end = useRef<HTMLDivElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: follow each new handoff
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end' });
  }, [flow.length]);
  return (
    <section className="flow-pane" aria-label="Handoffs">
      <ol>
        {flow.map(([from, to, words], i) => (
          <li
            key={`${i}-${from}-${to}`}
            className={busy && !viewing && i === flow.length - 1 ? 'now' : undefined}
            style={
              {
                '--c0': colorOf(from),
                '--c1': colorOf(to),
                '--d': `${pulse && pulse.from === from && pulse.to === to ? pulseMs(pulse) : 0}ms`,
              } as CSSProperties
            }
          >
            <End id={from} limited={limited} />
            <span className="arrow" aria-hidden="true">
              →
            </span>
            <span className="sr">goes to</span>
            <End id={to} limited={limited} />
            {words ? <small>{words}w</small> : null}
          </li>
        ))}
      </ol>
      <div ref={end} />
    </section>
  );
}
