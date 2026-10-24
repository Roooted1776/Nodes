// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Tasks, { FlowBox } from '../src/components/Tasks';
import { blankMem } from '../src/lib/memory';
import { useStore } from '../src/store';

const sess = (
  id: string,
  q: string,
  cover: Record<string, any>,
  msgs: any[] = [{ from: 'gemini', text: 'hi', tag: 'live · OpenAI · m · unverified' }],
  flow?: any,
) => ({ id, ts: Date.now(), q, kws: [], accepted: [], uncovered: [], msgs, cover, flow });

describe('tasks list', () => {
  it('shows only real saved sessions, newest first, five at a time', () => {
    const mem = blankMem();
    mem.sessions = [
      sess(
        's1',
        'Plan a launch',
        { gemini: { s: 'done' }, xcode: { s: 'skipped', why: 'Not an iOS task' }, grokbot: { s: 'done' } },
        undefined,
        [
          ['owner', 'gemini', 3],
          ['gemini', 'grokbot', 40],
        ],
      ),
      sess('s2', 'Review risks', { gemini: { s: 'done' }, perplexity: { s: 'failed' } }, [
        { from: 'brain', text: 'Perplexity did not finish: HTTP 429. Nothing was made up in its place.', tag: 'page' },
      ]),
      sess('s3', 'Summarise', {
        gemini: { s: 'done' },
        muse: { s: 'skipped', why: 'Not reached: stopped, limit or key' },
      }),
      sess('s4', 'Four', { gemini: { s: 'done' } }),
      sess('s5', 'Five', { gemini: { s: 'done' } }),
      sess('s6', 'Six', { gemini: { s: 'done' } }),
    ] as any;
    useStore.setState({ mem, busy: false });
    render(<Tasks />);
    const cards = screen.getAllByRole('button', { name: /^Task: / });
    expect(cards.map(c => c.getAttribute('aria-label'))).toEqual([
      'Task: Six',
      'Task: Five',
      'Task: Four',
      'Task: Summarise',
      'Task: Review risks',
    ]);
    expect(within(cards[3]).getByText(/Stopped/)).toBeTruthy();
    expect(within(cards[4]).getByText(/1 failed/)).toBeTruthy();
    expect(within(cards[4]).getByText(/HTTP 429/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Show all 6' })).toBeTruthy();
  });
  it('the flow box adds up repeated pairs and shows reply times', () => {
    render(
      <FlowBox
        flow={[
          ['gemini', 'muse', 10],
          ['gemini', 'muse', 5],
          ['muse', 'grokbot', 20],
        ]}
        ms={{ gemini: 2400 }}
      />,
    );
    expect(screen.getByText('Gemini → Muse').parentElement!.textContent).toMatch(/15$/);
    expect(screen.getByText(/Gemini 2.4 s/)).toBeTruthy();
  });
});
