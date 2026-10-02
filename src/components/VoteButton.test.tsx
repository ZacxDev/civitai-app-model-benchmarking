// VoteButton a11y + toggle affordances. A pure-props component (pack Button +
// Badge), so it renders without providers. Asserts the toggle exposes an accurate
// accessible name and `aria-pressed` in BOTH states — the affordances a screen
// reader relies on, and the ones the design-system pass added.

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { UNVOTE_TOOLTIP, VOTE_TOOLTIP, VoteButton, VoteCount, VoteTally } from './VoteButton.js';

describe('VoteButton a11y', () => {
  it('exposes aria-pressed=false and an "Upvote" accessible name when NOT voted', () => {
    render(<VoteButton count={12} voted={false} onVote={vi.fn()} onUnvote={vi.fn()} />);
    const btn = screen.getByRole('button', { name: 'Upvote (12)' });
    expect(btn).toHaveAttribute('aria-pressed', 'false');
  });

  it('exposes aria-pressed=true and a "Remove your vote" accessible name when voted', () => {
    render(<VoteButton count={13} voted onVote={vi.fn()} onUnvote={vi.fn()} />);
    const btn = screen.getByRole('button', { name: 'Remove your vote (13)' });
    expect(btn).toHaveAttribute('aria-pressed', 'true');
  });
});

// ---------------------------------------------------------------------------
// The glyph and the tooltip (the third IA pass: `▲` → an SVG, plus a tooltip).
//
// 🔴 THE ACCESSIBLE NAME IS THE INVARIANT, AND IT IS THE ONE THING THAT MUST NOT
// MOVE. It carries the COUNT (`Upvote (12)`), so there are two ways to break it and
// they fail in opposite directions:
//
//   - the SVG becoming part of the name — noise before the real label;
//   - the TOOLTIP becoming the name — either the count announced twice (because the
//     tooltip repeated it) or a meaningful name replaced by a decorative one.
//
// `Tooltip` wires `aria-describedby`, not `aria-labelledby`, which is what makes the
// second impossible — but "the component we import behaves that way today" is a
// claim about a dependency, so it is asserted here rather than assumed.
//
// ⚠️ THE FIRST TWO CASES ABOVE ARE THE BEFORE-AND-AFTER PAIR: they predate this
// change, they pin the exact same two names, and they are GREEN AT BASE. That is the
// point — they are the invariant, and the cases below add the two new claims without
// disturbing it.
// ---------------------------------------------------------------------------

describe('VoteButton — the glyph', () => {
  it('renders an inline SVG, not the `▲` character it replaced', () => {
    render(<VoteButton count={4} voted={false} onVote={vi.fn()} onUnvote={vi.fn()} />);
    const btn = screen.getByTestId('vote-button');
    const svg = btn.querySelector('svg');
    expect(svg, 'the vote control renders no SVG glyph').not.toBeNull();
    // 🔴 THE OLD GLYPH IS GONE FROM THE CONTROL'S TEXT. Asserting only "an SVG
    // exists" would stay green with both rendered, which is a visible defect (two
    // arrows) that no other case here could see.
    expect(btn.textContent ?? '').not.toContain('▲');
  });

  it('🔴 marks the glyph aria-hidden, so the accessible name is unchanged', () => {
    render(<VoteButton count={12} voted={false} onVote={vi.fn()} onUnvote={vi.fn()} />);
    const svg = screen.getByTestId('vote-button').querySelector('svg')!;
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    // The invariant, re-asserted right next to the thing that could break it.
    expect(screen.getByTestId('vote-button')).toHaveAccessibleName('Upvote (12)');
  });

  it('takes its colour from `currentColor`, so it follows the theme', () => {
    // No hardcoded colour anywhere: the control renders in two Button variants
    // (`filled` when voted, `light` when not) and in two themes.
    render(<VoteButton count={4} voted onVote={vi.fn()} onUnvote={vi.fn()} />);
    expect(screen.getByTestId('vote-button').querySelector('svg')).toHaveAttribute(
      'fill',
      'currentColor',
    );
  });
});

describe('VoteButton — the tooltip', () => {
  it('states the ACTION, in both states, as whole pinned strings', () => {
    // Literals typed out here rather than read off the exports: an expectation
    // derived from the implementation passes whatever the implementation says, which
    // is exactly wrong for copy. A reword must come here too.
    expect(VOTE_TOOLTIP).toBe('Upvote — press again to take your vote back');
    expect(UNVOTE_TOOLTIP).toBe('Remove your vote');
  });

  it('describes the control rather than naming it, in the NOT-voted state', () => {
    render(<VoteButton count={12} voted={false} onVote={vi.fn()} onUnvote={vi.fn()} />);
    const btn = screen.getByTestId('vote-button');

    // 🔴 THE NAME IS UNTOUCHED — this is the assertion the whole tooltip change had
    // to not break, and it is stated before and after (the two cases at the top of
    // this file are the "before", green at base, pinning the same two literals).
    expect(btn).toHaveAccessibleName('Upvote (12)');
    // …and the tooltip arrives as a DESCRIPTION.
    expect(btn).toHaveAccessibleDescription(VOTE_TOOLTIP);
    // 🔴 AND THE COUNT IS ANNOUNCED ONCE. The description must not repeat it, or a
    // screen reader reads "12" twice on one control.
    expect(VOTE_TOOLTIP).not.toContain('12');
  });

  it('describes the control rather than naming it, in the VOTED state', () => {
    render(<VoteButton count={13} voted onVote={vi.fn()} onUnvote={vi.fn()} />);
    const btn = screen.getByTestId('vote-button');
    expect(btn).toHaveAccessibleName('Remove your vote (13)');
    expect(btn).toHaveAccessibleDescription(UNVOTE_TOOLTIP);
    expect(UNVOTE_TOOLTIP).not.toContain('13');
  });
});

// ---------------------------------------------------------------------------
// 🔴 THE COUNT IS INDEPENDENT OF THE AFFORDANCE — the seam, pinned at the unit.
//
// WHY THIS EXISTS. `vote-count` used to be an inline child of the Button, which made
// "hide the vote control" mean "hide the score". `MatchupBody` hides the control on an
// author's own matchup, and for one revision that silently took the number with it.
// The fix was to make the count a component (`VoteCount`) with a second, control-free
// presentation (`VoteTally`).
//
// 🔴 WHAT A UNIT TEST CAN AND CANNOT SETTLE HERE. These cases pin the two
// presentations in isolation; they CANNOT see a `MatchupBody` that forgot to render
// either one, which is the defect that actually shipped. `myCommunity.test.tsx`'s 2×2
// case is what covers the seam, through the real App, with two author ids — this file
// is the unit half and must not be read as the whole claim. ("Verified in isolation"
// is exactly how the first version of this passed its own tests while being broken.)
// ---------------------------------------------------------------------------

describe('VoteCount / VoteTally — the score without the affordance', () => {
  it('🔴 renders ONE `vote-count` in each presentation, and only the button wraps it', () => {
    // Inside the control: the count is a descendant of the button, which is the
    // arrangement a foreign row gets and the one that must not change.
    const inButton = render(<VoteButton count={12} voted={false} onVote={vi.fn()} onUnvote={vi.fn()} />);
    expect(inButton.getAllByTestId('vote-count')).toHaveLength(1);
    expect(inButton.getByTestId('vote-count')).toHaveTextContent('12');
    expect(inButton.getByTestId('vote-count').closest('button')).not.toBeNull();
    inButton.unmount();

    // Standalone: the SAME testid, the same number, and NO button anywhere above it.
    // 🔴 THE `closest('button')` PAIR IS THE DISCRIMINATOR. Asserting only that
    // `vote-count` exists in both would be satisfied by a `VoteTally` that simply
    // rendered a second VoteButton.
    const standalone = render(<VoteTally count={12} />);
    expect(standalone.getAllByTestId('vote-count')).toHaveLength(1);
    expect(standalone.getByTestId('vote-count')).toHaveTextContent('12');
    expect(standalone.getByTestId('vote-count').closest('button')).toBeNull();
  });

  it('🔴 the tally offers NOTHING pressable — not a disabled button, not a fake one', () => {
    render(<VoteTally count={7} />);
    const tally = screen.getByTestId('vote-tally');
    // A disabled Button would still read as "an action you cannot take right now",
    // and this action is not coming back. A `<span onClick>` carries no tag or role a
    // structural check can see, so the sweep covers the three spellings that WOULD:
    // a real button, a link, and anything focusable or button-roled.
    expect(tally.tagName).toBe('SPAN');
    expect(tally).not.toHaveAttribute('role');
    expect(tally).not.toHaveAttribute('tabindex');
    expect(tally.querySelectorAll('button, a[href], [tabindex], [role="button"]')).toHaveLength(0);
    expect(screen.queryByRole('button')).toBeNull();
    // POSITIVE CONTROL on that sweep: the selector list is not simply never matching.
    // `VoteButton` renders a control the SAME query does find, so a zero above is a
    // fact about `VoteTally` rather than about a broken selector.
    const control = render(<VoteButton count={7} voted={false} onVote={vi.fn()} onUnvote={vi.fn()} />);
    expect(
      control.container.querySelectorAll('button, a[href], [tabindex], [role="button"]').length,
      'the pressable-element sweep matches nothing even on a real control',
    ).toBeGreaterThan(0);
  });

  it('🔴 names itself in words, and agrees in number', () => {
    // 🔴 A BARE NUMBER IS NOT AN ACCESSIBLE NAME. Inside the button the count is
    // carried by `aria-label="Upvote (12)"`; standing alone it has nothing, so the
    // tally supplies one. Literals, and the two counts are 1 and 2 so the singular
    // and the plural are different strings — a fixture pinned to one of them cannot
    // see a dropped `s` or a hardcoded word.
    const one = render(<VoteTally count={1} />);
    expect(one.getByTestId('vote-tally')).toHaveAttribute('aria-label', '1 vote');
    one.unmount();

    const two = render(<VoteTally count={2} />);
    expect(two.getByTestId('vote-tally')).toHaveAttribute('aria-label', '2 votes');
    // The glyph is decorative in this position too — `aria-label` above says it in
    // words, so an unhidden arrow would be one more thing a screen reader reads out.
    expect(two.getByTestId('vote-tally').querySelector('svg')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });

  it('VoteCount on its own is the bare number, with no name of its own', () => {
    // It must NOT carry a label: inside the button the name already contains the
    // count, and a second one there would announce it twice.
    render(<VoteCount count={42} />);
    const el = screen.getByTestId('vote-count');
    expect(el).toHaveTextContent('42');
    expect(el).not.toHaveAttribute('aria-label');
    expect(el.tagName).toBe('SPAN');
  });
});
