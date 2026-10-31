import { describe, expect, it, vi } from 'vitest';
import {
  APPROVED_FOR_DIRECTOR_REVIEW,
  LEGACY_APPROVAL_PHRASE,
  finalReviewFor,
  isLegacyApprovalPhrase,
} from '../src/lib/approval';
import * as github from '../src/lib/github';

const GIT_OR_DEPLOY = /\b(push|merge|squash|commit|deploy|remove all branches)\b/i;

describe('approval phrase triggers no git or deploy', () => {
  it('approval records only a review state, never the old phrase', () => {
    const v = finalReviewFor(false);
    expect(v).toBe(APPROVED_FOR_DIRECTOR_REVIEW);
    expect(isLegacyApprovalPhrase(v)).toBe(false);
    expect(v).not.toMatch(GIT_OR_DEPLOY);
    expect(finalReviewFor(true)).toMatch(/^DECLINED/);
  });

  it('recognises the phrase and close variants', () => {
    expect(isLegacyApprovalPhrase(LEGACY_APPROVAL_PHRASE)).toBe(true);
    expect(isLegacyApprovalPhrase(`  ${LEGACY_APPROVAL_PHRASE.toUpperCase()}.`)).toBe(true);
    expect(
      isLegacyApprovalPhrase(
        'Squash, push; merge all main -- remove all branches post-merge: make sure to commit AND\n deploy!',
      ),
    ).toBe(true);
    expect(isLegacyApprovalPhrase('Squash, push, merge all to main; commit and deploy!')).toBe(false);
    expect(isLegacyApprovalPhrase('looks good')).toBe(false);
    expect(isLegacyApprovalPhrase(undefined)).toBe(false);
  });

  it('an ordinary message using those words is not hidden', () => {
    expect(isLegacyApprovalPhrase('Should we squash, push, merge and deploy later?')).toBe(false);
    expect(isLegacyApprovalPhrase(`${LEGACY_APPROVAL_PHRASE} tomorrow`)).toBe(false);
  });

  it('handling the phrase makes no network, git, or deploy calls', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const spies = Object.entries(github)
      .filter(([, f]) => typeof f === 'function')
      .map(([k]) => vi.spyOn(github as any, k));
    for (const t of [LEGACY_APPROVAL_PHRASE, LEGACY_APPROVAL_PHRASE.toUpperCase()]) {
      isLegacyApprovalPhrase(t);
      finalReviewFor(false);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    for (const s of spies) expect(s).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('the app source no longer uses the phrase as a value outside the approval module', async () => {
    const { readFileSync } = await import('node:fs');
    for (const f of ['../src/lib/run-task.ts', '../src/components/ChatPanel.tsx']) {
      const src = readFileSync(new URL(f, import.meta.url), 'utf8');
      expect(src).not.toContain(LEGACY_APPROVAL_PHRASE);
      expect(src).not.toMatch(/child_process|execSync|spawn\(/);
    }
  });
});
