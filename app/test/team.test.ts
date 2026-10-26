import { describe, expect, it } from 'vitest';
import { AGENTS, TONE_LINE, huddleSystem, stagePrompt, systemPrompt, toneLine, toneOf } from '../src/data/team';

describe('agent tones (Owner: register assigned from personality, fixed per bot)', () => {
  it('every one of the nine agents has a tone on the scale', () => {
    expect(AGENTS).toHaveLength(9);
    for (const a of AGENTS) expect(['serious', 'balanced', 'casual']).toContain(toneOf(a.id));
  });

  it('the roster actually mixes registers: at least one serious and one casual bot', () => {
    const tones = new Set(AGENTS.map(a => toneOf(a.id)));
    expect(tones.has('serious')).toBe(true);
    expect(tones.has('balanced')).toBe(true);
    expect(tones.has('casual')).toBe(true);
  });

  it('assignments follow the voices: deadpan and no-fluff bots are serious, cheeky and upbeat ones casual', () => {
    expect(toneOf('muse')).toBe('serious'); // a blunt, deadpan auditor
    expect(toneOf('grokbot')).toBe('serious'); // a dry, decisive captain
    expect(toneOf('cursor')).toBe('serious'); // no patience for fluff
    expect(toneOf('grok')).toBe('casual'); // a cheeky contrarian
    expect(toneOf('gemini')).toBe('casual'); // curious and upbeat
    expect(toneOf('claude')).toBe('balanced'); // thoughtful and warm
  });

  it('tone is a stable trait, not re-rolled: the same bot always maps to the same register line', () => {
    for (const a of AGENTS) {
      expect(toneOf(a.id)).toBe(toneOf(a.id));
      expect(toneLine(a.id)).toBe(TONE_LINE[toneOf(a.id)]);
    }
    expect(TONE_LINE.serious).not.toBe(TONE_LINE.casual);
  });

  it('huddle prompts differ by register: a serious bot and a casual bot get different instructions', () => {
    const serious = huddleSystem('muse', 'respond');
    const casual = huddleSystem('grok', 'respond');
    expect(serious).toContain('Your register is serious');
    expect(casual).toContain('Your register is casual');
    expect(serious).not.toContain('Your register is casual');
    expect(casual).not.toContain('Your register is serious');
    // the huddle job wording itself is untouched by tone
    expect(serious).toMatch(/answering in a team huddle led by Grok Bot/);
    expect(casual).toMatch(/answering in a team huddle led by Grok Bot/);
    // and Grok Bot leads in its own serious register, opening and closing
    expect(huddleSystem('grokbot', 'open')).toContain('Your register is serious');
    expect(huddleSystem('grokbot', 'close')).toContain('Your register is serious');
  });

  it('task chat prompts carry the same register, in the system prompt and the stage prompt', () => {
    expect(systemPrompt('muse')).toContain(toneLine('muse'));
    expect(systemPrompt('gemini')).toContain(toneLine('gemini'));
    expect(systemPrompt('muse')).toContain('Your register is serious');
    expect(systemPrompt('gemini')).toContain('Your register is casual');
    const stage = stagePrompt('cursor', 'do the thing', 'Claude', 'the handoff', 'grokbot', '');
    expect(stage).toContain(toneLine('cursor'));
    expect(stage).toContain('Your register is serious');
    const warmStage = stagePrompt('claude', 'do the thing', 'Gemini', 'the handoff', 'cursor', '');
    expect(warmStage).toContain('Your register is balanced');
  });
});
