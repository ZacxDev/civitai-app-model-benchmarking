// RootBoundary: an unhandled render error is caught, reported to `onError`, and
// shown as a RECOVERABLE fallback whose "Try again" button re-mounts the subtree.

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RootBoundary } from './RootBoundary.js';

/** A child that throws while `throwing.value` is true (so a reset can recover). */
function Boom({ throwing }: { throwing: { value: boolean } }) {
  if (throwing.value) throw new Error('kaboom');
  return <div data-testid="ok">recovered</div>;
}

describe('RootBoundary', () => {
  // React logs caught errors to console.error — silence it for the throwing renders.
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  it('catches a render error, reports it to onError, and shows the recoverable fallback', () => {
    const onError = vi.fn();
    render(
      <RootBoundary onError={onError}>
        <Boom throwing={{ value: true }} />
      </RootBoundary>,
    );

    expect(screen.getByTestId('root-boundary-fallback')).toBeInTheDocument();
    expect(screen.getByTestId('root-boundary-message')).toHaveTextContent('kaboom');
    expect(screen.getByTestId('root-boundary-retry')).toBeInTheDocument();
    expect(onError).toHaveBeenCalledTimes(1);
    expect((onError.mock.calls[0][0] as Error).message).toBe('kaboom');
  });

  it('recovers when "Try again" is clicked after the cause is resolved', async () => {
    // Shared mutable flag: throws on first mount, then the click flips it off so
    // the reset re-mount succeeds.
    const throwing = { value: true };
    render(
      <RootBoundary>
        <Boom throwing={throwing} />
      </RootBoundary>,
    );

    expect(screen.getByTestId('root-boundary-fallback')).toBeInTheDocument();
    throwing.value = false; // the underlying cause is gone
    await userEvent.click(screen.getByTestId('root-boundary-retry'));

    expect(await screen.findByTestId('ok')).toHaveTextContent('recovered');
    expect(screen.queryByTestId('root-boundary-fallback')).toBeNull();
  });

  it('renders children unchanged on the happy path', () => {
    render(
      <RootBoundary>
        <Boom throwing={{ value: false }} />
      </RootBoundary>,
    );
    expect(screen.getByTestId('ok')).toBeInTheDocument();
    expect(screen.queryByTestId('root-boundary-fallback')).toBeNull();
  });
});
