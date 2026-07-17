// Runner-side workflow orchestration helpers (pure + injectable). The runner
// owns the estimate → confirm → submit → poll → publish dance; these functions
// map the host snapshot into the app's cell-run status and drive the poll loop
// with an injectable clock so the loop is deterministically testable.

import type { BlockWorkflowSnapshot } from '@civitai/app-sdk/blocks';

import type { CellRunStatus } from '../types.js';

const TERMINAL: ReadonlySet<BlockWorkflowSnapshot['status']> = new Set([
  'succeeded',
  'failed',
  'expired',
  'canceled',
]);

export function isTerminalSnapshot(status: BlockWorkflowSnapshot['status']): boolean {
  return TERMINAL.has(status);
}

/** Map a host workflow snapshot status → the app's cell-run status. */
export function mapSnapshotStatus(status: BlockWorkflowSnapshot['status']): CellRunStatus {
  switch (status) {
    case 'pending':
      return 'submitting';
    case 'processing':
      return 'processing';
    case 'succeeded':
      return 'succeeded';
    case 'canceled':
      return 'canceled';
    case 'failed':
    case 'expired':
    default:
      return 'failed';
  }
}

export interface PollOptions {
  onUpdate?: (snap: BlockWorkflowSnapshot) => void;
  /** Injectable clock — tests pass an immediate resolver. */
  sleep?: (ms: number) => Promise<void>;
  delayMs?: number;
  maxDelayMs?: number;
  maxDurationMs?: number;
  maxPolls?: number;
}

export const DEFAULT_DELAY_MS = 2000;
export const DEFAULT_MAX_DELAY_MS = 5000;
/** ~10 minutes: long enough for slow / queued generations to terminate. */
export const DEFAULT_MAX_DURATION_MS = 10 * 60 * 1000;
export const DEFAULT_MAX_POLLS = 1000;

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Poll a just-submitted workflow to a terminal state. Returns the terminal
 * snapshot, OR — if the duration/poll cap trips while still pending/processing —
 * the last NON-terminal snapshot (the caller detects this via
 * `isTerminalSnapshot` and surfaces a "still generating" state). Never throws
 * for a `failed` snapshot — the caller inspects `.status` / `.error`.
 */
export async function pollToTerminal(
  poll: (workflowId: string) => Promise<BlockWorkflowSnapshot>,
  first: BlockWorkflowSnapshot,
  opts: PollOptions = {},
): Promise<BlockWorkflowSnapshot> {
  const sleep = opts.sleep ?? defaultSleep;
  const delayMs = opts.delayMs ?? DEFAULT_DELAY_MS;
  const maxDelayMs = Math.max(delayMs, opts.maxDelayMs ?? DEFAULT_MAX_DELAY_MS);
  const maxDurationMs = opts.maxDurationMs ?? DEFAULT_MAX_DURATION_MS;
  const maxPolls = opts.maxPolls ?? DEFAULT_MAX_POLLS;

  let cur = first;
  let elapsedMs = 0;
  let polls = 0;
  let wait = delayMs;
  while (!isTerminalSnapshot(cur.status) && elapsedMs < maxDurationMs && polls < maxPolls) {
    await sleep(wait);
    elapsedMs += wait;
    cur = await poll(cur.workflowId);
    opts.onUpdate?.(cur);
    polls += 1;
    wait = Math.min(Math.round(wait * 1.5), maxDelayMs);
  }
  return cur;
}
