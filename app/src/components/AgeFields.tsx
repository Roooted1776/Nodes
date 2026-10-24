import type { Dob } from '../lib/age';
import { MIN_AGE } from '../lib/age';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
export const emptyDob = (): Dob => ({ y: NaN, m: NaN, d: NaN });

/** Date of birth, asked once to check the person is an adult. It is not saved. */
export function AgeFields({ value, onChange }: { value: Dob; onChange(d: Dob): void }) {
  const num = (s: string) => (s === '' ? NaN : +s);
  return (
    <fieldset className="field">
      <legend>Date of birth</legend>
      <div className="dob">
        <select
          aria-label="Month"
          value={Number.isNaN(value.m) ? '' : value.m}
          onChange={e => onChange({ ...value, m: num(e.target.value) })}
        >
          <option value="">Month</option>
          {MONTHS.map((n, i) => (
            <option key={n} value={i + 1}>
              {n}
            </option>
          ))}
        </select>
        <input
          aria-label="Day"
          inputMode="numeric"
          placeholder="Day"
          maxLength={2}
          value={Number.isNaN(value.d) ? '' : value.d}
          onChange={e => onChange({ ...value, d: num(e.target.value.replace(/\D/g, '')) })}
        />
        <input
          aria-label="Year"
          inputMode="numeric"
          placeholder="Year"
          maxLength={4}
          value={Number.isNaN(value.y) ? '' : value.y}
          onChange={e => onChange({ ...value, y: num(e.target.value.replace(/\D/g, '')) })}
        />
      </div>
      <small>Brain is for adults ({MIN_AGE}+). Your date of birth is checked once and is not saved.</small>
    </fieldset>
  );
}
