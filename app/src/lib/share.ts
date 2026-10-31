// Live chat channel. The admin's tab publishes what it shows to other tabs in the same browser.
// There is no server, so this only reaches other tabs or windows on the same computer and browser.
import type { LogMsg, Pulse, StageState } from '../store';
import type { AgentId } from '../data/team';

export const CHANNEL = 'brain.live.v1';
export type Wire =
  | { t: 'hello' }
  | {
      t: 'reset';
      stages: Partial<Record<AgentId, StageState>>;
      notes: Partial<Record<AgentId, string>>;
      status: string;
    }
  | { t: 'msg'; m: LogMsg }
  | {
      t: 'stage';
      stages: Partial<Record<AgentId, StageState>>;
      notes: Partial<Record<AgentId, string>>;
      active: AgentId | null;
      busy: boolean;
      status: string;
    }
  | { t: 'pulse'; p: Omit<Pulse, 't0'> }
  | { t: 'draft'; d: { from: AgentId; text: string } | null }
  | {
      t: 'snapshot';
      log: LogMsg[];
      stages: Partial<Record<AgentId, StageState>>;
      notes: Partial<Record<AgentId, string>>;
      active: AgentId | null;
      busy: boolean;
      status: string;
    };

export interface Chan {
  postMessage(d: unknown): void;
  onmessage: ((e: { data: unknown }) => void) | null;
  close(): void;
}
export interface Live {
  log: LogMsg[];
  stages: Partial<Record<AgentId, StageState>>;
  notes: Partial<Record<AgentId, string>>;
  active: AgentId | null;
  busy: boolean;
  status: string;
  pulses: Pulse[];
  draft: { from: AgentId; text: string } | null;
}
export interface Hub {
  getState(): Live;
  setState(p: Partial<Live> | ((s: Live) => Partial<Live>)): void;
  subscribe(fn: (s: Live, prev: Live) => void): () => void;
}

const valid = (d: unknown): d is Wire =>
  !!d && typeof d === 'object' && 't' in d && typeof (d as { t: unknown }).t === 'string';
/** Admin side: send every change of the live chat. Keys and settings are never part of what is sent. */
export function publish(hub: Hub, ch: Chan): () => void {
  ch.onmessage = e => {
    if (valid(e.data) && e.data.t === 'hello') {
      const s = hub.getState();
      ch.postMessage({
        t: 'snapshot',
        log: s.log,
        stages: s.stages,
        notes: s.notes,
        active: s.active,
        busy: s.busy,
        status: s.status,
      } satisfies Wire);
    }
  };
  const off = hub.subscribe((s, p) => {
    if (s.log !== p.log) {
      if (s.log.length < p.log.length || !s.log.length)
        ch.postMessage({ t: 'reset', stages: s.stages, notes: s.notes, status: s.status } satisfies Wire);
      else for (const m of s.log.slice(p.log.length)) ch.postMessage({ t: 'msg', m } satisfies Wire);
    }
    if (
      s.stages !== p.stages ||
      s.active !== p.active ||
      s.busy !== p.busy ||
      s.status !== p.status ||
      s.notes !== p.notes
    )
      ch.postMessage({
        t: 'stage',
        stages: s.stages,
        notes: s.notes,
        active: s.active,
        busy: s.busy,
        status: s.status,
      } satisfies Wire);
    if (s.draft !== p.draft)
      ch.postMessage({
        t: 'draft',
        d: s.draft ? { from: s.draft.from, text: s.draft.text.slice(0, 4000) } : null,
      } satisfies Wire);
    for (const pl of s.pulses.slice(p.pulses.length))
      ch.postMessage({
        t: 'pulse',
        p: { id: pl.id, from: pl.from, to: pl.to, color: pl.color, words: pl.words, dur: pl.dur },
      } satisfies Wire);
  });
  return () => {
    off();
    ch.onmessage = null;
  };
}
export const openChannel = (): Chan | null =>
  typeof BroadcastChannel === 'undefined' ? null : (new BroadcastChannel(CHANNEL) as unknown as Chan);
