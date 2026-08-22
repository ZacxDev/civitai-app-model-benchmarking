// A withdraw ("Remove") control for a row the viewer AUTHORED — a two-step,
// confirm-before-firing composition of the pack's Button, shared by CombosView
// and PromptsView (the sibling of VoteButton).
//
// 🔴 The removal is DESTRUCTIVE and PUBLIC (the row leaves the shared grid for
// everyone), and there is no undo — so `onWithdraw` fires only from the armed
// CONFIRM button, never from the trigger. Rendering this control at all is the
// caller's ownership decision (`isOwnRow`); this component owns only the confirm
// handshake.

import { useState } from 'react';
import { Button, Group } from '@civitai/blocks-react/ui';

import { metaText } from '../theme.js';

export interface WithdrawButtonProps {
  /** What the row is, for the accessible name + confirm copy. */
  noun: 'combination' | 'prompt';
  /** Fires ONLY after the viewer confirms. */
  onWithdraw: () => Promise<void> | void;
  'data-testid'?: string;
}

export function WithdrawButton({
  noun,
  onWithdraw,
  'data-testid': testId,
}: WithdrawButtonProps): React.JSX.Element {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!confirming) {
    return (
      <Button
        size="sm"
        variant="subtle"
        color="error"
        onClick={() => setConfirming(true)}
        data-testid={testId ?? 'withdraw-button'}
        aria-label={`Remove your ${noun}`}
      >
        Remove
      </Button>
    );
  }

  const confirm = async () => {
    setBusy(true);
    try {
      await onWithdraw();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Group gap={6} align="center" wrap={false} data-testid="withdraw-confirm-prompt">
      <span style={{ ...metaText, whiteSpace: 'nowrap' }}>Remove for everyone?</span>
      <Button
        size="sm"
        color="error"
        loading={busy}
        onClick={confirm}
        data-testid="withdraw-confirm"
        aria-label={`Confirm removing your ${noun} for everyone`}
      >
        Remove
      </Button>
      <Button
        size="sm"
        variant="subtle"
        onClick={() => setConfirming(false)}
        data-testid="withdraw-cancel"
        aria-label="Keep it"
      >
        Cancel
      </Button>
    </Group>
  );
}
