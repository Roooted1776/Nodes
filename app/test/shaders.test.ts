import { describe, expect, it } from 'vitest';
import * as S from '../src/lib/shaders';

const code = (src: string) =>
  src
    .split('\n')
    .map(l => l.replace(/\/\/.*$/, ''))
    .join('\n'); // what the GPU compiles once comments are gone
describe('shader sources', () => {
  it('keep their braces and main() outside comments (a // comment hides the rest of its line)', () => {
    for (const [name, src] of Object.entries(S)) {
      const t = code(String(src));
      expect(t.split('{').length, name).toBe(t.split('}').length);
      expect(t, name).toMatch(/void main\(\)\s*\{/);
    }
  });
  it('the check catches the mistake it is for', () => {
    const t = code('void main(){ float a = 1.0; if (a <= 0.0) discard; // note }');
    expect(t.split('{').length).not.toBe(t.split('}').length);
  });
});
