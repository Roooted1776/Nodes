import { describe, expect, it } from 'vitest';
import { AGENT_COLOR, STAGE_COLOR, TYPE_COLOR, colorOf } from '../src/data/colors';
import { AGENTS } from '../src/data/team';

describe('bot colours', () => {
  it('every bot has its own colour, none reused by memory types or the failed red', () => {
    const bot = AGENTS.map(a => AGENT_COLOR[a.id]);
    expect(bot.every(Boolean)).toBe(true);
    expect(new Set(bot).size).toBe(AGENTS.length);
    for (const c of [...Object.values(TYPE_COLOR), STAGE_COLOR.failed]) expect(bot).not.toContain(c);
    expect(colorOf('claude')).toBe(AGENT_COLOR.claude);
    expect(colorOf('owner')).toBe('#ffffff');
  });
});
