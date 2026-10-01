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

import { token } from '../theme.js';

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
 * 🔴 AN SVG, NOT THE `▲` CHARACTER IT REPLACED — **ON THIS CONTROL ONLY.** A text
 * triangle is rendered by whatever font the host's theme resolves, so its weight, size
 * and vertical alignment drifted against the count beside it, and on a font without the
 * glyph it fell back to a tofu box. The path below is a filled chevron/arrowhead on a
 * 12×12 box, `fill="currentColor"` so it follows the Button's own text colour in
 * both the `filled` (voted) and `light` (not voted) variants and in either theme —
 * no hardcoded colour anywhere.
 *
 * 🔴 THE CLAIM IS NARROWED TO THIS CONTROL BECAUSE AN EARLIER VERSION OF IT WAS WIDER
 * THAN THE CHANGE. It argued the general case — "a font-resolved glyph drifts and can
 * fall back to tofu" — while text triangles still ship at four other rendered sites,
 * which reads as a tree-wide convention that was never applied. The remaining sites are
 * KNOWN AND DELIBERATE, not an oversight, and they are named here so the next reader
 * does not have to re-find them:
 *
 *   - `components/ResultsGrid.tsx` — `▲ {prompt.count}` on the column header, and
 *     `▲ {row.comboCount}` on the matchup group band;
 *   - `components/ResultsGrid.tsx` — `▸`, the matchup band's `aria-hidden` marker;
 *   - `components/SideNav.tsx` — `▾` / `▸`, the group's `aria-hidden` chevron.
 *
 * ⚠️ DO NOT CONVERT THEM AS A TIDY-UP — but do not read that as "the argument does not
 * apply there", because for two of them it does. The two `▲ {count}` sites sit beside a
 * NUMBER, which is the exact condition the drift argument names, so converting them
 * would be a real improvement; it is simply one nobody asked for. The two chevrons are
 * the weak case: decorative, `aria-hidden`, and with no adjacent number to misalign
 * against. Either way it is a separate, asked-for change with its own visual check,
 * which nothing in this repo can perform (jsdom resolves no fonts and no layout).
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

/**
 * The vote TOTAL, as a node that renders independently of the vote AFFORDANCE.
 *
 * 🔴 THIS EXISTS BECAUSE THE COUNT USED TO BE A CHILD OF THE BUTTON, AND THAT MADE
 * "hide the vote control" MEAN "hide the score". `MatchupBody` hides the control on an
 * author's OWN matchup (see its `canVote`), and for one revision that silently took the
 * number with it — an author could not see their own row's score at all. The operator's
 * answer was to KEEP the count, so the count had to stop being part of the button.
 *
 * 🔴 ONE MARKUP DEFINITION, TWO RENDER POSITIONS — which is the whole point of its
 * being a component rather than a second `<span>` written out in `MatchupBody`.
 * `vote-count` is read by five test files across four surfaces (`gridsView`,
 * `myCommunity`, `myBenchmarks`, `e2e`, `drafts`); a second copy of the element would be
 * a second thing to get wrong, and the two would drift on the next restyle. The testid
 * is a LITERAL here and is never threaded through a prop — `renameWireCompat.test.ts`'s
 * scan reads the testid attribute and the Menu panel prop as source literals, and an id
 * arriving by any third route is invisible to it.
 *
 * ⚠️ AND THIS PARAGRAPH TRIPPED THAT SCAN ONCE, WHICH IS THE BEST EVIDENCE IT WORKS.
 * The first draft spelled the Menu panel prop with an attribute-shaped example — prop
 * name, equals sign, quoted value — and the scan, which reads raw source INCLUDING
 * comments, counted it as a fourth live panel id and went red with a `"…"` entry.
 * `Menu.tsx`'s own docblock warns about exactly that, and the warning was read after the
 * fact rather than before. So: never spell either scanned pattern in prose here.
 *
 * ⚠️ IT CARRIES NO ACCESSIBLE NAME OF ITS OWN. Inside {@link VoteButton} the number is
 * already in the button's `aria-label` ("Upvote (12)"), so a label here would announce
 * it twice; {@link VoteTally} is what supplies one for the standalone position.
 */
export function VoteCount({ count }: { count: number }): React.JSX.Element {
  return (
    <span
      data-testid="vote-count"
      style={{ fontVariantNumeric: 'tabular-nums', minWidth: 14, textAlign: 'center' }}
    >
      {count}
    </span>
  );
}

/**
 * The vote total with NO affordance — the glyph plus {@link VoteCount}, rendered as
 * plain text rather than as a control.
 *
 * 🔴 IT IS NOT A BUTTON, AND NOTHING ABOUT IT MAY SUGGEST IT IS. This is what an
 * author sees in place of the vote control on their own matchup: the score, which they
 * are entitled to, and no affordance, because a self-vote is what the hiding is for. A
 * disabled Button would have been the lazy shape and the wrong one — a disabled control
 * still reads as "an action you cannot take right now", and this action is not coming
 * back. So: a `<span>`, no `role`, no `onClick`, no `tabIndex`, nothing focusable
 * inside. Asserted structurally both here and through the App in `myCommunity`.
 *
 * 🔴 THE GLYPH IS SHARED WITH THE BUTTON, AND IT IS STILL `aria-hidden`. A bare number
 * beside a matchup name says nothing about what it counts, so the arrow has to be
 * there; it carries no information a screen reader needs, because `aria-label` below
 * says "12 votes" in words. Same reasoning, same glyph, same file — see `voteGlyph`
 * for why it is an SVG and not the `▲` character.
 *
 * 🔴 AND THE LABEL IS ON THE WRAPPER, NOT THE NUMBER. `VoteCount` is deliberately
 * unlabelled (it has to be, inside the button), so the standalone position is where the
 * name is supplied. "N votes" rather than "N" — the plural is spelled, because "1" on
 * its own is not a sentence a screen reader can place.
 */
export function VoteTally({ count }: { count: number }): React.JSX.Element {
  return (
    <span
      data-testid="vote-tally"
      aria-label={`${count} vote${count === 1 ? '' : 's'}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        flexShrink: 0,
        fontSize: 13,
        color: token.dimmed,
      }}
    >
      {voteGlyph}
      <VoteCount count={count} />
    </span>
  );
}

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
        {/* 🔴 THE COUNT IS {@link VoteCount}, NOT AN INLINE SPAN, and it is the SAME
            component the standalone {@link VoteTally} renders. It sits in exactly the
            position it always did, so nothing about a foreign row's control changes;
            what changed is that the markup is now reachable without the button. */}
        <VoteCount count={count} />
      </Button>
    </Tooltip>
  );
}
