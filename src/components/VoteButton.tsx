// A vote/upvote control — a small composition of the pack's Button + Badge.
//
// This is deliberately HAND-ROLLED from existing pack primitives rather than
// added to the pack: an up-vote control is really just a toggle Button carrying
// a count Badge, and its exact affordance (who can vote, the anonymous → sign-in
// nudge, optimistic count) is app-policy, not a generic primitive. It stays on
// the pack's Button/Badge so it's auto-themed and consistent.

import { useState } from 'react';
import { Button } from '@civitai/blocks-react/ui';
import { Tooltip } from '@civitai/components-react';

/**
 * The tooltips, as literals a test pins whole.
 *
 * 🔴 THEY STATE THE ACTION, NOT THE STATE. A tooltip reading "Votes" or "12 votes"
 * would restate what the count beside it already says; what a viewer does not know
 * from looking is what pressing it DOES, and that it is a toggle.
 *
 * 🔴 AND THEY ARE NOT THE ACCESSIBLE NAME. `Tooltip` wires `aria-describedby` to a
 * `role="tooltip"` bubble (measured in `@civitai/components-react`'s
 * `Tooltip.d.ts`), so this text is a DESCRIPTION layered on the button's explicit
 * `aria-label`. That matters twice over: the count lives in the aria-label, so a
 * tooltip that became the name would either announce the count a second time or
 * replace a meaningful name with a decorative one.
 */
export const VOTE_TOOLTIP = 'Upvote — press again to take your vote back';
export const UNVOTE_TOOLTIP = 'Remove your vote';

/**
 * The vote glyph.
 *
 * 🔴 AN SVG, NOT THE `▲` CHARACTER IT REPLACED. A text triangle is rendered by
 * whatever font the host's theme resolves, so its weight, size and vertical
 * alignment drifted against the count beside it, and on a font without the glyph
 * it fell back to a tofu box. The path below is a filled chevron/arrowhead on a
 * 12×12 box, `fill="currentColor"` so it follows the Button's own text colour in
 * both the `filled` (voted) and `light` (not voted) variants and in either theme —
 * no hardcoded colour anywhere.
 *
 * `aria-hidden` because it carries no information the `aria-label` does not: the
 * button's name already says "Upvote (12)" / "Remove your vote (12)". An
 * un-hidden decorative glyph is one more thing a screen reader reads out.
 */
const voteGlyph = (
  <svg
    aria-hidden="true"
    focusable="false"
    width="12"
    height="12"
    viewBox="0 0 12 12"
    fill="currentColor"
  >
    {/* An upward arrowhead over a short stem — readable at 12px, where a thin
        outlined arrow is not. */}
    <path d="M6 1.2 1.4 6.4h2.6v4.4h4V6.4h2.6z" />
  </svg>
);

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
    <Tooltip label={voted ? UNVOTE_TOOLTIP : VOTE_TOOLTIP}>
      <Button
        size="sm"
        variant={voted ? 'filled' : 'light'}
        loading={busy}
        onClick={handle}
        data-testid={testId ?? 'vote-button'}
        data-voted={voted ? 'true' : 'false'}
        aria-pressed={voted}
        /* 🔴 THE ACCESSIBLE NAME, AND IT CARRIES THE COUNT. The `<Tooltip>` above
           contributes `aria-describedby`, never the name — see VOTE_TOOLTIP. */
        aria-label={voted ? `Remove your vote (${count})` : `Upvote (${count})`}
        leftSection={voteGlyph}
      >
        <span
          data-testid="vote-count"
          style={{ fontVariantNumeric: 'tabular-nums', minWidth: 14, textAlign: 'center' }}
        >
          {count}
        </span>
      </Button>
    </Tooltip>
  );
}
