// Brain's access log: sign-ins, locks, account and memory changes. It never records passcodes or task text.
// Rows go to the audit_log table in Brain's database. Members can only add their own rows; only admins can read them,
// and nobody can change or delete them from the page.
export interface AuditEvent {
  t: number;
  who: string;
  what: string;
}
export type AuditSink = (who: string, what: string) => Promise<void>;
let sink: AuditSink | null = null;
/** Set while someone is signed in (rows need a signed-in member). */
export const setAuditSink = (f: AuditSink | null) => {
  sink = f;
};
export const AUDIT_MAX = 300;
type LogStore = Pick<Storage, 'getItem' | 'setItem'>;
export function readAudit(s: Pick<Storage, 'getItem'>): AuditEvent[] {
  try {
    const rows = JSON.parse(s.getItem('brain.audit.v1') || '[]');
    return Array.isArray(rows)
      ? rows
          .filter(r => r && typeof r.t === 'number' && typeof r.who === 'string' && typeof r.what === 'string')
          .slice(-AUDIT_MAX)
      : [];
  } catch {
    return [];
  }
}
export function audit(who: string, what: string): Promise<void>;
export function audit(s: LogStore, who: string, what: string, now?: number): Promise<void>;
export function audit(a: string | LogStore, b: string, c?: string, now = Date.now()): Promise<void> {
  const who = (typeof a === 'string' ? a : b).slice(0, 32);
  const what = (typeof a === 'string' ? b : c || '').slice(0, 200);
  if (typeof a !== 'string') {
    try {
      a.setItem('brain.audit.v1', JSON.stringify([...readAudit(a), { t: now, who, what }].slice(-AUDIT_MAX)));
    } catch {
      /* storage blocked */
    }
  }
  return sink ? sink(who, what).catch(() => {}) : Promise.resolve();
}
