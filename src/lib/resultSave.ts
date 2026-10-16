// What a cell says, and what it offers, once a run has been PAID FOR but its result is
// not on the grid yet — one module so `App.tsx` (which decides the state) and
// `ResultsGrid.tsx` (which renders it) cannot drift into two vocabularies.
//
// The states, by what the in-flight record holds (`InflightRun`):
//   - `workflowId`, no `imageIds` — the generation may still be running, OR it finished
//     and its outputs were never published. Nothing on the record tells the two apart,
//     so the copy names both.
//   - `workflowId` + `imageIds` — finished AND published; only the shared result row
//     is missing. Check status does NOT publish again (each publish mints new public
//     `Image` rows — the host's `persistBlockWorkflowOutputImage` has no per-workflow
//     dedupe); it re-reads the board for the row and creates it only if absent.
//
// 🔴 "Check status won't charge you again" is the claim every message makes, and it is
// true of Check status (a re-poll and a shared write; never a submit). It is NOT true
// of Dismiss, which is why Dismiss on a paid cell carries its own label — see
// {@link PAID_DISMISS_LABEL}.

/** A stalled cell whose run may still be generating, or finished but unpublished. */
export const STALLED_MESSAGE =
  "Still generating, or finished and not yet added to the grid. Check status won't charge you again.";

/** Finished and published; only the grid row is missing (rehydrated, or before a retry). */
export const RESULT_PENDING_MESSAGE =
  "Your images were generated, but they haven't been added to the grid yet. Press Check status to add them — it won't charge you again.";

/** A retryable failure to publish the outputs or save the row (deadline, 429, 503, network). */
export const RESULT_SAVE_FAILED_MESSAGE =
  "Your images were generated, but they couldn't be added to the grid yet. Press Check status to try again — it won't charge you again.";

/** The create was refused `consent_required` — the one refusal the viewer fixes themselves. */
export const RESULT_SAVE_CONSENT_MESSAGE =
  "Your images were generated, but adding them to the grid needs your permission to publish. Approve it, then press Check status — it won't charge you again.";

/**
 * The create was refused for a reason another attempt will not change.
 *
 * 🔴 IT DOES NOT SAY "TRY AGAIN", AND THE CELL OFFERS NO CHECK STATUS — but ONLY for
 * refusals that really are permanent (see {@link classifySaveError}). Round 2 put every
 * `not_eligible` and `quota_exceeded` here, which took Check status away from a viewer
 * who only had to wait out a new account or free some space, leaving them nothing but a
 * Dismiss that throws away the published ids (PR #85 round-3 audit, 🟡1).
 */
export const RESULT_SAVE_REFUSED_MESSAGE =
  "Your images were generated, but the grid refused to save this result, and trying again won't change that. You were charged once for this run.";

/**
 * `not_eligible` reasons the viewer can fix or that clear with time, and what to say.
 *
 * 🔴 OUR WORDS, NOT THE SERVER'S. The reason CODES are a stable contract
 * (`block-write-trust.service.ts`'s `SharedWriteTrustRefusalReason`, surfaced as
 * `details.reason`); the server's message is not viewer copy for this app. `ineligible`
 * (banned / no user) and `restricted` (muted) are deliberately absent: those are
 * permanent, and fall through to {@link RESULT_SAVE_REFUSED_MESSAGE}.
 */
// A `Map`, not an object literal: `details.reason` is server input, and a plain-object
// lookup of `"constructor"` would return `Object.prototype.constructor` — truthy.
const FIXABLE_TRUST_REASONS: ReadonlyMap<string, string> = new Map([
  ['onboarding_incomplete', 'your Civitai account onboarding is not finished'],
  ['email_unverified', 'your email address is not verified'],
  ['account_too_new', 'your account is too new to add to the shared grid — this clears once it is old enough'],
  ['membership_required', 'adding to the shared grid needs a membership'],
]);

/** The copy for a fixable or time-bound refusal: the reason, and that Check status is the way back. */
export function resultSaveBlockedMessage(reason: string): string {
  return `Your images were generated, but the grid can't save this result yet: ${reason}. Once that's resolved, press Check status — it won't charge you again.`;
}

/** The author ceiling: the viewer's own storage, freed by removing their own items. */
export const RESULT_SAVE_QUOTA_MESSAGE = resultSaveBlockedMessage(
  'your storage in this app is full — remove some of your own matchups, prompts or grids',
);

/**
 * Dismiss on a cell that was PAID FOR.
 *
 * 🔴 IT SAYS WHAT IT DOES, BECAUSE WHAT IT DOES COSTS MONEY (round-2 audit, 🟡2).
 * Dismiss clears the in-flight record and makes the cell runnable, so the next Run
 * charges again. Keeping the record forever instead would brick a cell whose result
 * can never be saved; offering the exit with an honest label is the same choice the
 * `unknown` cell already makes ("Dismiss and allow a re-run").
 */
export const PAID_DISMISS_LABEL = 'Dismiss and allow a new run (charges again)';

/** Store refusal codes another identical attempt will not change — before `details` is read. */
const NON_RETRYABLE_CODES: ReadonlySet<string> = new Set([
  'not_eligible',
  'quota_exceeded',
  'too_large',
  'content_rejected',
  'write_policy',
  'not_author',
  'invalid_request',
]);

type SaveErrorLike = { code?: unknown; details?: { reason?: unknown; ceiling?: unknown } } | null;

/**
 * What a failed publish/save means for the cell: the copy, and whether Check status
 * stays (`retry`). The one place the classification lives.
 */
export function classifySaveError(e: unknown): { message: string; retry: boolean } {
  const err = e as SaveErrorLike;
  const code = typeof err?.code === 'string' ? err.code : undefined;
  if (code === 'consent_required') return { message: RESULT_SAVE_CONSENT_MESSAGE, retry: true };
  if (code === 'not_eligible') {
    const reason = err?.details?.reason;
    const fixable = typeof reason === 'string' ? FIXABLE_TRUST_REASONS.get(reason) : undefined;
    if (fixable) return { message: resultSaveBlockedMessage(fixable), retry: true };
    return { message: RESULT_SAVE_REFUSED_MESSAGE, retry: false };
  }
  // The AUTHOR ceiling is the viewer's own storage, which they can free; the APP
  // ceiling is everyone's, which they cannot.
  if (code === 'quota_exceeded' && err?.details?.ceiling === 'author') {
    return { message: RESULT_SAVE_QUOTA_MESSAGE, retry: true };
  }
  if (code !== undefined && NON_RETRYABLE_CODES.has(code)) {
    return { message: RESULT_SAVE_REFUSED_MESSAGE, retry: false };
  }
  return { message: RESULT_SAVE_FAILED_MESSAGE, retry: true };
}

/** Is this failure one another attempt cannot fix? */
export function isNonRetryableSaveError(e: unknown): boolean {
  return !classifySaveError(e).retry;
}

/** The copy for a failure to publish the outputs or save the result row. */
export function resultSaveFailedMessage(e: unknown): string {
  return classifySaveError(e).message;
}
