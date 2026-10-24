export const DAY = 864e5;
export const clip = (s: string, n: number) => {
  const t = String(s);
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
};
export const norm = (s: string) => String(s).toLowerCase().replace(/\s+/g, ' ').trim();
export const fmtDate = (ts: number) => {
  try {
    return new Date(ts).toISOString().slice(0, 10);
  } catch {
    return 'unknown date';
  }
};

export const STOP = new Set(
  (
    'a an the of to in on at is are was were be been being do does did done how what who whom whose which when where why can could ' +
    'should would will shall may might must you your yours me my we our us it its this that these those and or but for with from about into over under ' +
    'tell explain give show please there their they them than then also not no yes any some more most much many very just only like if as by so such ' +
    'each every all both either neither own same other another here i he she his her him have has had having get got make made use used using one two ' +
    'three first second next last new need needs needed want wants let lets via per etc e.g i.e out up down off again further once while because before ' +
    'after above below between through during without within across toward towards upon already still even ever never always often sure way ways thing things ' +
    'work review handoff incoming owner task section sections open blockers blocker none n/a note notes yet now current currently today well good better best ' +
    'clear clearly specific short text based provided given supplied stage agent agents team final report recommendation pass fail plan check checks'
  ).split(/\s+/),
);

/** Section labels that every stage reply carries; they are formatting, not content. */
export const SECTION_RE =
  /\b(REVIEW OF INCOMING HANDOFF|YOUR WORK|HANDOFF TO [A-Z .()]+?|OPEN BLOCKERS|FINAL SITUATION REPORT)\s*[:\-–—]?/g;

export function words(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9][a-z0-9.+#-]*/g) || []).map(w => w.replace(/[.-]+$/g, '')).filter(Boolean);
}
export function keywords(s: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const w of words(s)) {
    if (w.length < 3 || STOP.has(w) || /^\d+$/.test(w) || seen.has(w)) continue;
    seen.add(w);
    out.push(w);
  }
  return out;
}
export function stem(k: string) {
  const m = k.replace(/(ies)$/, 'y').replace(/(ing|ed|es|s)$/, '');
  return m.length >= 3 ? m : k;
}
export function sentences(s: string): string[] {
  return s
    .replace(SECTION_RE, '\n')
    .split(/(?<=[.!?])\s+|\n+|\s+[•·]\s+|\s-\s(?=[A-Z])/)
    .map(x => x.trim())
    .filter(x => x.length > 2);
}
