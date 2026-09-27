// GatedCell robustness: the per-viewer gated read renders visible outputs through
// the design-system <Image>, shows a clear WITHHELD-HINT for a `hidden` cell
// (never a bare tile / never a url), and — the production-hardening bits — the
// host round-trip is raced against a LONG timeout (45s: the read follows a
// multi-minute generate+publish, so the window is cold) with ONE bounded
// automatic retry before the error state surfaces, and every SURFACED error is
// tracked (`gated_read_error`) so the mechanism (timeout vs transport vs host
// error) is diagnosable from telemetry instead of another indistinguishable
// "error + manual retry worked" observation.
//
// The read is a no-spend path, so the auto-retry carries no money-path risk;
// the at-most-ONE cap is still pinned below.
//
// `useGatedImages` is mocked so we can drive visible / hidden / stalled reads
// deterministically without a mock host (the full run→publish→gated path is also
// covered end-to-end against the real mock host in e2e.test.tsx).
//
// Timing shape: `GATED_READ_TIMEOUT_MS` is imported (it exists in both trees —
// 15s pre-change, 45s post) so the at-most-one cases stay meaningful either way;
// the backoff is a LOCAL constant because the auto-retry does not exist on the
// pre-change tree at all, and importing a not-yet-existing constant would make
// every advance NaN and the red arm dishonest.

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BlockGatedImage } from '@civitai/app-sdk/blocks';

const { mockGetImages, mockTrack } = vi.hoisted(() => ({
  mockGetImages: vi.fn(),
  mockTrack: vi.fn(),
}));
vi.mock('@civitai/blocks-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@civitai/blocks-react')>();
  return {
    ...actual,
    useGatedImages: () => ({ getImages: mockGetImages }),
    useBlockAnalytics: () => ({ track: mockTrack }),
  };
});

import { GATED_READ_TIMEOUT_MS, GatedCell } from './GatedCell.js';

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

const never = () => new Promise<BlockGatedImage[]>(() => {});

afterEach(() => {
  vi.useRealTimers();
  mockGetImages.mockReset();
  mockTrack.mockReset();
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

  it('a stalled read is still LOADING at the old 15s mark — the timeout moved to 45s', async () => {
    vi.useFakeTimers();
    mockGetImages.mockReturnValue(never());
    render(<GatedCell imageIds={[9003]} />);
    // Exactly the OLD constant: at 15s the cell must NOT have given up — and
    // must not be auto-retrying either, which would prove the timeout fired
    // early (this pins the constant itself; the retrying state would mask the
    // early timeout as ordinary loading otherwise).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(screen.getByTestId('gated-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('gated-error')).toBeNull();
    expect(screen.queryByTestId('gated-retrying')).toBeNull();
  });

  it('the first stall announces ONE auto-retry and it recovers — no error ever surfaces', async () => {
    vi.useFakeTimers();
    mockGetImages.mockReturnValue(never()); // the first read never resolves
    render(<GatedCell imageIds={[9004]} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(GATED_READ_TIMEOUT_MS);
    });
    // Timeout fired → the ONE automatic re-read is scheduled; the cell SAYS SO
    // (a "retrying" state under the spinner) instead of erroring.
    expect(mockGetImages).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('gated-loading')).toBeInTheDocument();
    expect(screen.getByTestId('gated-retrying')).toBeInTheDocument();
    expect(screen.queryByTestId('gated-error')).toBeNull();

    // Backoff elapses → the retry's read runs and succeeds → the image renders.
    mockGetImages.mockResolvedValueOnce([visible(9004, 'https://image.civitai.com/gated-9004.jpeg')]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(mockGetImages).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('result-image')).toHaveAttribute(
      'src',
      'https://image.civitai.com/gated-9004.jpeg',
    );
    expect(screen.queryByTestId('gated-error')).toBeNull();
    // A transient failure that SELF-HEALED is not surfaced to analytics — only a
    // surfaced error is.
    expect(mockTrack).not.toHaveBeenCalled();
  });

  it('a second consecutive failure surfaces the retryable error — and ONLY one auto-retry ran', async () => {
    vi.useFakeTimers();
    mockGetImages.mockReturnValue(never()); // every read stalls
    render(<GatedCell imageIds={[9005]} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(GATED_READ_TIMEOUT_MS);
    });
    expect(screen.getByTestId('gated-retrying')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(mockGetImages).toHaveBeenCalledTimes(2); // the auto-retry
    await act(async () => {
      await vi.advanceTimersByTimeAsync(GATED_READ_TIMEOUT_MS);
    });
    // Second timeout → error + manual Retry. No second auto-retry, ever.
    expect(screen.getByTestId('gated-error')).toHaveTextContent(/timed out/i);
    expect(screen.getByTestId('gated-retry')).toBeInTheDocument();
    expect(mockGetImages).toHaveBeenCalledTimes(2);
    // Still nothing after a further full window: the auto-retry is SPENT.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(GATED_READ_TIMEOUT_MS + 2_000);
    });
    expect(mockGetImages).toHaveBeenCalledTimes(2);
    // The surfacing is tracked, with the message, exactly once.
    expect(mockTrack).toHaveBeenCalledTimes(1);
    expect(mockTrack).toHaveBeenCalledWith('gated_read_error', {
      message: expect.stringMatching(/timed out/i),
    });
  });

  it('a transient HOST error also auto-retries once and recovers without surfacing', async () => {
    vi.useFakeTimers();
    mockGetImages.mockRejectedValueOnce(new Error('gated read failed'));
    mockGetImages.mockResolvedValueOnce([visible(9006, 'https://image.civitai.com/gated-9006.jpeg')]);
    render(<GatedCell imageIds={[9006]} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0); // the first read rejects immediately
    });
    expect(screen.getByTestId('gated-retrying')).toBeInTheDocument();
    expect(screen.queryByTestId('gated-error')).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(mockGetImages).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('result-image')).toHaveAttribute(
      'src',
      'https://image.civitai.com/gated-9006.jpeg',
    );
    expect(mockTrack).not.toHaveBeenCalled();
  });

  it('after a surfaced error, the manual Retry starts a FRESH sequence with its own auto-retry', async () => {
    vi.useFakeTimers();
    mockGetImages.mockReturnValue(never()); // stall, stall → error
    render(<GatedCell imageIds={[9007]} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(GATED_READ_TIMEOUT_MS);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(GATED_READ_TIMEOUT_MS);
    });
    expect(screen.getByTestId('gated-error')).toBeInTheDocument();
    const callsAfterFirstSequence = mockGetImages.mock.calls.length;
    expect(callsAfterFirstSequence).toBe(2);

    // Manual retry → a new read (stalls again by the default mock); its fresh
    // sequence gets its OWN auto-retry, which then succeeds.
    await act(async () => {
      fireEvent.click(screen.getByTestId('gated-retry'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mockGetImages).toHaveBeenCalledTimes(3);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(GATED_READ_TIMEOUT_MS);
    });
    expect(screen.getByTestId('gated-retrying')).toBeInTheDocument(); // the fresh budget
    mockGetImages.mockResolvedValueOnce([visible(9007, 'https://image.civitai.com/gated-9007.jpeg')]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(mockGetImages).toHaveBeenCalledTimes(4);
    expect(screen.getByTestId('result-image')).toHaveAttribute(
      'src',
      'https://image.civitai.com/gated-9007.jpeg',
    );
    // Only the FIRST sequence's surfacing was tracked; the recovered retry was not.
    expect(mockTrack).toHaveBeenCalledTimes(1);
  });

  it('surfaces a host error with a retry affordance after its one auto-retry', async () => {
    vi.useFakeTimers();
    mockGetImages.mockRejectedValue(new Error('gated read failed')); // every read rejects
    render(<GatedCell imageIds={[9008]} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByTestId('gated-retrying')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(screen.getByTestId('gated-error')).toHaveTextContent('gated read failed');
    expect(screen.getByTestId('gated-retry')).toBeInTheDocument();
    expect(mockGetImages).toHaveBeenCalledTimes(2);
  });

  it('a NEW id set is a fresh sequence: its failure gets the auto-retry the first set spent', async () => {
    vi.useFakeTimers();
    mockGetImages.mockReturnValue(never());
    const { rerender } = render(<GatedCell imageIds={[9009]} />);
    // Sequence 1 spends its budget: stall → auto-retry → stall → error.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(GATED_READ_TIMEOUT_MS);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(GATED_READ_TIMEOUT_MS);
    });
    expect(screen.getByTestId('gated-error')).toBeInTheDocument();
    expect(mockGetImages).toHaveBeenCalledTimes(2);

    // New id set → fresh read with a RESTORED budget: its first failure
    // schedules the auto-retry again (call 4, not a dead error).
    rerender(<GatedCell imageIds={[9010]} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mockGetImages).toHaveBeenCalledTimes(3);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(GATED_READ_TIMEOUT_MS);
    });
    expect(screen.getByTestId('gated-retrying')).toBeInTheDocument();
    mockGetImages.mockResolvedValueOnce([visible(9010, 'https://image.civitai.com/gated-9010.jpeg')]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(mockGetImages).toHaveBeenCalledTimes(4);
    expect(screen.getByTestId('result-image')).toHaveAttribute(
      'src',
      'https://image.civitai.com/gated-9010.jpeg',
    );
  });
});
