// EmptyState render + inline action. The polish pass requires an empty state to
// carry a title, a muted line, AND the primary action inline (never a lonely
// "nothing here" string) — assert all three render so a copy of this template
// can't silently drop the action.

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EmptyState } from './EmptyState.js';

describe('EmptyState', () => {
  it('renders the title, the muted body line, and the inline action together', () => {
    render(
      <EmptyState
        data-testid="empty"
        title="No combinations yet"
        body="Add a checkpoint combination to start benchmarking."
        action={<button type="button">Add combination</button>}
      />,
    );
    expect(screen.getByText('No combinations yet')).toBeInTheDocument();
    expect(screen.getByText('Add a checkpoint combination to start benchmarking.')).toBeInTheDocument();
    // The primary action is rendered inline, not omitted.
    expect(screen.getByRole('button', { name: 'Add combination' })).toBeInTheDocument();
  });

  it('renders without a body or action (title-only) without crashing', () => {
    render(<EmptyState data-testid="empty" title="Nothing here" />);
    expect(screen.getByTestId('empty')).toBeInTheDocument();
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
