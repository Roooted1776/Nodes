// Adults only. The date of birth is checked once and then thrown away; only "adult" is kept.
export const MIN_AGE = 18;
export const AGE_BLOCK_MS = 24 * 3600 * 1000;
export const AGE_KEY = 'brain.agegate.v1';
export interface Dob {
  y: number;
  m: number;
  d: number;
} // m is 1..12

/** An error message when the date is not a real past date, otherwise null. */
export function dobError(dob: Dob, now: number): string | null {
  const { y, m, d } = dob;
  if (![y, m, d].every(Number.isInteger)) return 'Enter the full date of birth.';
  if (y < 1900 || m < 1 || m > 12 || d < 1 || d > 31) return 'That is not a real date.';
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return 'That is not a real date.';
  if (dt.getTime() > now) return 'That date is in the future.';
  return null;
}
/** Whole years old on the day `now`. */
export function ageOn(dob: Dob, now: number): number {
  const t = new Date(now);
  let age = t.getFullYear() - dob.y;
  if (t.getMonth() + 1 < dob.m || (t.getMonth() + 1 === dob.m && t.getDate() < dob.d)) age--;
  return age;
}
export const isAdult = (dob: Dob, now: number) => !dobError(dob, now) && ageOn(dob, now) >= MIN_AGE;

type Store = Pick<Storage, 'getItem' | 'setItem'>;
/** After a failed age check this browser refuses new accounts for a day. A speed bump, not a lock: clearing site data removes it. */
export function ageBlockedUntil(s: Store, now: number): number {
  try {
    const u = +(JSON.parse(s.getItem(AGE_KEY) || '{}').until || 0);
    return u > now ? u : 0;
  } catch {
    return 0;
  }
}
export function blockDevice(s: Store, now: number) {
  try {
    s.setItem(AGE_KEY, JSON.stringify({ until: now + AGE_BLOCK_MS }));
  } catch {
    /* storage blocked */
  }
}
