// VoteButton a11y + toggle affordances. A pure-props component (pack Button +
// Badge), so it renders without providers. Asserts the toggle exposes an accurate
// accessible name and `aria-pressed` in BOTH states — the affordances a screen
// reader relies on, and the ones the design-system pass added.

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { VoteButton } from './VoteButton.js';

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
