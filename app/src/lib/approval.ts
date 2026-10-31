// Security rule (approved by Director): the old approval phrase must never trigger git or deploy.
// The app has no way to mark a PR ready, so an approval is only recorded as state; nothing runs.

/** The old phrase. Kept only so old saved sessions can be recognised and hidden; it never triggers anything. */
export const LEGACY_APPROVAL_PHRASE =
  'squash push merge all main remove all branches post merge make sure to commit and deploy';

/** Recorded approval state: ready for Director's review. No git or deploy action follows it. */
export const APPROVED_FOR_DIRECTOR_REVIEW = 'APPROVED_PENDING_DIRECTOR_REVIEW';

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z]+/g, ' ')
    .trim();

/** True for the old phrase or close variants (case, punctuation, spacing). */
export function isLegacyApprovalPhrase(text: string | undefined | null): boolean {
  if (!text) return false;
  const t = norm(text);
  if (t === norm(LEGACY_APPROVAL_PHRASE)) return true;
  return /\bsquash\b/.test(t) && /\bpush\b/.test(t) && /\bmerge\b/.test(t) && /\bdeploy\b/.test(t);
}

/** The value saved as the final review. Only records state; it is data, never a command. */
export function finalReviewFor(hasFailures: boolean): string {
  return hasFailures ? 'DECLINED: Blocked based on team response.' : APPROVED_FOR_DIRECTOR_REVIEW;
}
