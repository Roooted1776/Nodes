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
export function audit(who: string, what: string): Promise<void> {
  if (!sink) return Promise.resolve();
  return sink(who.slice(0, 32), what.slice(0, 200)).catch(() => {
    /* the log is best effort: a failed row never blocks the work */
  });
}
