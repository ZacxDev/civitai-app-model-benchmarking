// A "Report" control for a row the viewer does NOT own — the post-write abuse
// seam for a public, crowdsourced board, shared by CombosView and PromptsView
// (the sibling of VoteButton and WithdrawButton).
//
// 🔴 REPORTING IS ESCALATION, NOT REMOVAL, and the copy here has to say so.
// `shared.report()` files the row for PLATFORM moderator review and its own SDK
// doc-comment states that filing a report does not hide the row — a moderator
// decides. Every string below is written so a viewer cannot come away believing
// they deleted something: the confirm asks about sending it for review, and the
// settled state says "Reported", never "Removed" or "Hidden". The app owner has
// no server-side power to hide a row either (`update`/`withdraw` are
// author-scoped), so there is no stronger action to offer instead.
//
// 🔴 NOT OFFERED TO A SIGNED-OUT VIEWER. `report` rejects for an anonymous
// viewer against the real host, so rendering it signed-out would be offering an
// error. The caller decides who sees it; this component owns the handshake.

import { useState } from 'react';
import { Button, Group } from '@civitai/blocks-react/ui';

import { metaText } from '../theme.js';

export interface ReportButtonProps {
  /** What the row is, for the accessible name + confirm copy. */
  noun: 'combination' | 'prompt';
  /** Fires ONLY after the viewer confirms. Rejects on host failure. */
  onReport: () => Promise<void>;
  'data-testid'?: string;
}

export function ReportButton({
  noun,
  onReport,
  'data-testid': testId,
}: ReportButtonProps): React.JSX.Element {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);

  // Settled. Deliberately inert and deliberately NOT phrased as a removal — the
  // row is still on the board and will stay there unless a moderator acts.
  if (done) {
    return (
      <span style={{ ...metaText, whiteSpace: 'nowrap' }} data-testid="report-done" role="status">
        Reported for review
      </span>
    );
  }

  if (!confirming) {
    return (
      <Button
        size="sm"
        variant="subtle"
        onClick={() => {
          setFailed(false);
          setConfirming(true);
        }}
        data-testid={testId ?? 'report-button'}
        aria-label={`Report this ${noun} to moderators`}
      >
        Report
      </Button>
    );
  }

  const confirm = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await onReport();
      setDone(true);
      setConfirming(false);
    } catch {
      // Stay armed so the viewer can retry — a failed report must not read as a
      // filed one, which is exactly what silently closing the strip would do.
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Group gap={6} align="center" wrap={false} data-testid="report-confirm-prompt">
      <span style={{ ...metaText, whiteSpace: 'nowrap' }}>
        {failed ? 'Could not send — try again?' : 'Send to moderators for review?'}
      </span>
      <Button
        size="sm"
        loading={busy}
        onClick={confirm}
        data-testid="report-confirm"
        aria-label={`Confirm reporting this ${noun} to moderators`}
      >
        Report
      </Button>
      <Button
        size="sm"
        variant="subtle"
        onClick={() => {
          setFailed(false);
          setConfirming(false);
        }}
        data-testid="report-cancel"
        aria-label="Cancel the report"
      >
        Cancel
      </Button>
    </Group>
  );
}
