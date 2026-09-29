// VoteButton a11y + toggle affordances. A pure-props component (pack Button +
// Badge), so it renders without providers. Asserts the toggle exposes an accurate
// accessible name and `aria-pressed` in BOTH states — the affordances a screen
// reader relies on, and the ones the design-system pass added.

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { UNVOTE_TOOLTIP, VOTE_TOOLTIP, VoteButton } from './VoteButton.js';

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
