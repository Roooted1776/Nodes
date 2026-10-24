// Filter secrets before anything is saved or sent. Best effort pattern matching, not a guarantee.
const SECRET_RES = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
  /\b(?:sk|pk|rk)[-_](?:live[-_]|test[-_]|ant[-_])?[A-Za-z0-9_-]{12,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g,
  /\bxai-[A-Za-z0-9]{20,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
  /\bAIza[0-9A-Za-z_-]{30,}/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi,
  /:\/\/[^/\s:@]+:[^/\s@]+@/g,
  /[A-Za-z0-9_]*(?:password|passwd|pwd|passcode|secret|token|api[_ -]?key|private[_ -]?key)[A-Za-z0-9_]*\s*(?:is|=|:)\s*(?:"[^"]*"|'[^']*'|\S+)/gi,
  /\bmy\s+(?:password|passcode|pin)\s+(?:is\s+)?\S+/gi,
];

/** Replace secrets with [filtered]. `keys` are the exact API keys in use, so an echoed key is caught too. */
export function redact(text: string, keys: string[] = []): { text: string; n: number } {
  let n = 0;
  let t = String(text);
  for (const re of SECRET_RES)
    t = t.replace(re, () => {
      n++;
      return '[filtered]';
    });
  for (const k of keys)
    if (k && k.length >= 8 && t.includes(k)) {
      t = t.split(k).join('[filtered]');
      n++;
    }
  return { text: t, n };
}
