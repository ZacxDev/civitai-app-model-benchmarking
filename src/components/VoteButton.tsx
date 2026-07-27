// A vote/upvote control — a small composition of the pack's Button + Badge.
//
// This is deliberately HAND-ROLLED from existing pack primitives rather than
// added to the pack: an up-vote control is really just a toggle Button carrying
// a count Badge, and its exact affordance (who can vote, the anonymous → sign-in
// nudge, optimistic count) is app-policy, not a generic primitive. It stays on
// the pack's Button/Badge so it's auto-themed and consistent.

import { useState } from 'react';
import { Button } from '@civitai/blocks-react/ui';

export interface VoteButtonProps {
  count: number;
  /** Whether THIS viewer has already voted (drives the filled/outline state). */
  voted: boolean;
  /** Disabled (e.g. anonymous viewer) — clicking calls `onRequireAuth`. */
  disabled?: boolean;
  onVote: () => Promise<number> | void;
  onUnvote: () => Promise<number> | void;
  onRequireAuth?: () => void;
  'data-testid'?: string;
}

export function VoteButton({
  count,
  voted,
  disabled = false,
  onVote,
  onUnvote,
  onRequireAuth,
  'data-testid': testId,
}: VoteButtonProps): React.JSX.Element {
  const [busy, setBusy] = useState(false);

  const handle = async () => {
    if (disabled) {
      onRequireAuth?.();
      return;
    }
    setBusy(true);
    try {
      await (voted ? onUnvote() : onVote());
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      size="sm"
      variant={voted ? 'filled' : 'light'}
      loading={busy}
      onClick={handle}
      data-testid={testId ?? 'vote-button'}
      data-voted={voted ? 'true' : 'false'}
      aria-pressed={voted}
      aria-label={voted ? `Remove your vote (${count})` : `Upvote (${count})`}
      leftSection={<span aria-hidden="true">▲</span>}
    >
      <span
        data-testid="vote-count"
        style={{ fontVariantNumeric: 'tabular-nums', minWidth: 14, textAlign: 'center' }}
      >
        {count}
      </span>
    </Button>
  );
}
