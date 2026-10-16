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
 * 🔴 IT DOES NOT SAY "TRY AGAIN", AND THE CELL OFFERS NO CHECK STATUS. A `not_eligible`
 * account, a full storage quota, an oversize or rejected document or a write-policy
 * refusal answers the same way every time, so "press Check status to try again" was a
 * loop with no exit (PR #85 round-2 audit, 🟡1).
 */
export const RESULT_SAVE_REFUSED_MESSAGE =
  "Your images were generated, but the grid refused to save this result, and trying again won't change that. You were charged once for this run.";

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

/** Store refusal codes another identical attempt will not change. */
const NON_RETRYABLE_CODES: ReadonlySet<string> = new Set([
  'not_eligible',
  'quota_exceeded',
  'too_large',
  'content_rejected',
  'write_policy',
  'not_author',
  'invalid_request',
]);

/** Is this failure one another attempt cannot fix? */
export function isNonRetryableSaveError(e: unknown): boolean {
  const code = (e as { code?: unknown } | null)?.code;
  return typeof code === 'string' && NON_RETRYABLE_CODES.has(code);
}

/** The copy for a failure to publish the outputs or save the result row. */
export function resultSaveFailedMessage(e: unknown): string {
  if (isNonRetryableSaveError(e)) return RESULT_SAVE_REFUSED_MESSAGE;
  return (e as { code?: unknown } | null)?.code === 'consent_required'
    ? RESULT_SAVE_CONSENT_MESSAGE
    : RESULT_SAVE_FAILED_MESSAGE;
}
