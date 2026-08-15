// GatedCell robustness: the per-viewer gated read renders visible outputs through
// the design-system <Image>, shows a clear WITHHELD-HINT for a `hidden` cell
// (never a bare tile / never a url), and — the production-hardening bits — surfaces
// a retryable error when the host round-trip TIMES OUT, recovering on retry.
//
// `useGatedImages` is mocked so we can drive visible / hidden / stalled reads
// deterministically without a mock host (the full run→publish→gated path is also
// covered end-to-end against the real mock host in e2e.test.tsx).

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BlockGatedImage } from '@civitai/app-sdk/blocks';

const { mockGetImages } = vi.hoisted(() => ({ mockGetImages: vi.fn() }));
vi.mock('@civitai/blocks-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@civitai/blocks-react')>();
  return { ...actual, useGatedImages: () => ({ getImages: mockGetImages }) };
});

import { GatedCell, GATED_READ_TIMEOUT_MS } from './GatedCell.js';

const visible = (imageId: number, url: string): BlockGatedImage => ({
  imageId,
  status: 'visible',
  url,
  nsfwLevel: 1,
  contentRating: 'pg',
  width: 100,
  height: 100,
});
const hidden = (imageId: number): BlockGatedImage => ({ imageId, status: 'hidden' });

afterEach(() => {
  vi.useRealTimers();
  mockGetImages.mockReset();
});

describe('GatedCell', () => {
  it('renders a visible output through <Image>, preserving the gated url', async () => {
    mockGetImages.mockResolvedValue([visible(9001, 'https://image.civitai.com/gated-9001.jpeg')]);
    render(<GatedCell imageIds={[9001]} label="cell" />);
    const img = await screen.findByTestId('result-image');
    expect(img).toHaveAttribute('src', 'https://image.civitai.com/gated-9001.jpeg');
    expect(img.tagName).toBe('IMG');
  });

  it('renders the withheld-hint (not a bare tile, never a url) for a hidden output', async () => {
    mockGetImages.mockResolvedValue([hidden(9002)]);
    render(<GatedCell imageIds={[9002]} />);
    const tile = await screen.findByTestId('result-hidden');
    // Reads as a deliberate maturity gate (not a broken cell): a "rated mature"
    // headline + an actionable content-settings hint; the accessible name carries
    // the full reason (still naming the browsing level).
    expect(tile).toHaveTextContent(/rated mature/i);
    expect(screen.getByTestId('result-hidden-hint')).toHaveTextContent(/content settings/i);
    expect(tile.getAttribute('aria-label')).toMatch(/rated mature/i);
    expect(tile.getAttribute('aria-label')).toMatch(/browsing level/i);
    // No <img> / url ever rendered for a withheld cell.
    expect(screen.queryByTestId('result-image')).toBeNull();
  });

  it('surfaces a retryable timeout when the gated read stalls, then recovers on retry', async () => {
    vi.useFakeTimers();
    mockGetImages.mockReturnValue(new Promise<BlockGatedImage[]>(() => {})); // never resolves
    render(<GatedCell imageIds={[9003]} />);
    expect(screen.getByTestId('gated-loading')).toBeInTheDocument();

    // Advance past the timeout → error state with a Retry affordance.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(GATED_READ_TIMEOUT_MS);
    });
    expect(screen.getByTestId('gated-error')).toHaveTextContent(/timed out/i);
    expect(screen.getByTestId('gated-retry')).toBeInTheDocument();

    // Retry: the next read succeeds → the image renders.
    mockGetImages.mockResolvedValueOnce([visible(9003, 'https://image.civitai.com/gated-9003.jpeg')]);
    await act(async () => {
      fireEvent.click(screen.getByTestId('gated-retry'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByTestId('result-image')).toHaveAttribute(
      'src',
      'https://image.civitai.com/gated-9003.jpeg',
    );
  });

  it('surfaces a host error with a retry affordance', async () => {
    mockGetImages.mockRejectedValue(new Error('gated read failed'));
    render(<GatedCell imageIds={[9004]} />);
    expect(await screen.findByTestId('gated-error')).toHaveTextContent('gated read failed');
    expect(screen.getByTestId('gated-retry')).toBeInTheDocument();
  });
});
