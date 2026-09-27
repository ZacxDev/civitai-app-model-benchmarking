// 🔴 THE READ BUDGET FOR THE GRID CARDS' INLINE PREVIEWS — the load-bearing half
// of "show real thumbnails on every card".
//
// The host rate-limits gated reads at 150 per 10 seconds per `blockInstanceId`,
// and there is one card per grid on a list that is already ~22 rows long. So the
// claims below are about EXACT CALL COUNTS, and every one of them is an equality:
//
//   - a card whose grid HAS results makes exactly ONE `getImages` call, whatever
//     the number of tiles. `toHaveBeenCalledTimes(1)`, never `toHaveBeenCalled()`
//     — an "at least once" is satisfied by the per-tile bug this file exists to
//     prevent, which is the whole point of writing it this way.
//   - a card whose grid has NO results makes exactly ZERO.
//   - and the two live in the SAME FILE, because a reassuring zero is
//     indistinguishable from a mock wired to nothing until something in the same
//     harness makes the number move. The non-zero case IS the positive control
//     for the zero one.
//
// The preview also inherits `GatedCell`'s hardening rather than forking it (the
// 45s timeout, the ONE bounded auto-retry, the manual Retry, the
// `gated_read_error` telemetry — all added in 0.4.6), so a failing preview read
// must surface THAT error UI. Asserted here too: a preview that showed a bare
// spinner forever would look fine in a screenshot and be broken in production.
//
// `useGatedImages` is mocked (the same way `GatedCell.test.tsx` mocks it) so the
// call COUNT is observable at all. `IntersectionObserver` does not exist in jsdom,
// so it is installed per-case — which is also what makes the lazy-mount claim
// testable in both directions.

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

import { GatedCell } from './components/GatedCell.js';
import { GridsView } from './components/GridsView.js';
import { GRID_PREVIEW_MAX } from './lib/gridEntries.js';
import type { CombinationRow, GridRow, PromptRow, ResultRow } from './types.js';

const VIEWER_ID = 99;

const visible = (imageId: number): BlockGatedImage => ({
  imageId,
  status: 'visible',
  url: `https://image.civitai.com/gated-${imageId}.jpeg`,
  nsfwLevel: 1,
  contentRating: 'pg',
  width: 100,
  height: 100,
});

// ---------------------------------------------------------------------------
// The board: TWO matchups × TWO prompts, so a grid has FOUR cells and "one call
// per card, not one per cell" is a 1-vs-4 difference rather than 1-vs-1.
// ---------------------------------------------------------------------------

const matchup = (key: string, configId: string): CombinationRow => ({
  key,
  count: 5,
  authorUserId: 1,
  name: `Matchup ${key}`,
  description: '',
  data: {
    v: 2,
    kind: 'combination',
    configs: [
      {
        id: configId,
        checkpoint: { versionId: 1001, modelId: 500, baseModel: 'SDXL 1.0', modelName: 'JuggernautXL' },
        loras: [],
      },
    ],
  },
});
const prompt = (key: string): PromptRow => ({
  key,
  count: 4,
  authorUserId: 1,
  name: `Prompt ${key}`,
  description: '',
  data: { v: 3, kind: 'prompt', default: { prompt: 'x', params: {} } },
});

const MATCHUPS = [matchup('mk-a', 'cfg-a'), matchup('mk-b', 'cfg-b')];
const PROMPTS = [prompt('qk-1'), prompt('qk-2')];

const result = (comboKey: string, configId: string, promptKey: string, imageIds: number[]): ResultRow => ({
  key: `r-${comboKey}-${promptKey}`,
  authorUserId: 1,
  data: { v: 2, kind: 'result', comboKey, configId, promptKey, ecosystem: 'SDXL', imageIds },
});

/**
 * One published grid naming a SINGLE cell (mk-b × qk-2).
 *
 * 🔴 IT IS DELIBERATELY NOT THE SAME SET AS THE TOP GRID. The list always renders
 * the system Top Grid first, and the Top Grid is the top-voted matchups × the
 * top-voted prompts — i.e. all four cells here. If this grid named the same members
 * the two cards would issue IDENTICAL id arrays, and no assertion could tell "one
 * call per card" from "two calls for one card": the two are indistinguishable when
 * the arguments match. A one-cell subset makes every call attributable to exactly
 * one card, which is what lets the counts below be equalities.
 */
const GRID: GridRow = {
  key: 'gk-1',
  count: 3,
  authorUserId: VIEWER_ID,
  name: 'A grid',
  description: '',
  data: { v: 1, kind: 'grid', matchupKeys: ['mk-b'], promptKeys: ['qk-2'] },
};

// ---------------------------------------------------------------------------
// IntersectionObserver control
// ---------------------------------------------------------------------------

type Mode = 'intersecting' | 'never';

/**
 * Install a stub `IntersectionObserver`.
 *
 * 🔴 BOTH MODES ARE NEEDED, AND NEITHER IS THE jsdom DEFAULT. jsdom implements no
 * `IntersectionObserver` at all, and the component treats "no observer" as "mount
 * immediately" — which is the right degradation but makes the deferral
 * unobservable. `'never'` is the only way to tell "not scrolled to yet" from "no
 * observer", so it is what the deferral case uses; `'intersecting'` reports the
 * element as visible on `observe()` and is what the budget cases use.
 */
function installObserver(mode: Mode): void {
  class Stub implements IntersectionObserver {
    readonly root = null;
    readonly rootMargin = '';
    readonly thresholds: ReadonlyArray<number> = [];
    constructor(private cb: IntersectionObserverCallback) {}
    observe(target: Element): void {
      if (mode === 'never') return;
      this.cb(
        [{ isIntersecting: true, target } as unknown as IntersectionObserverEntry],
        this as unknown as IntersectionObserver,
      );
    }
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }
  (globalThis as unknown as { IntersectionObserver?: unknown }).IntersectionObserver = Stub;
}

beforeEach(() => {
  mockGetImages.mockReset();
  mockTrack.mockReset();
  mockGetImages.mockResolvedValue([]);
});

afterEach(() => {
  delete (globalThis as unknown as { IntersectionObserver?: unknown }).IntersectionObserver;
});

/**
 * Render ONLY the grids browse surface, with the REAL `GatedCell`.
 *
 * 🔴 THE REAL COMPONENT, NOT A STUB. The whole claim is that the preview reuses
 * `GatedCell`'s read path — its one batched call, its timeout, its retry, its
 * telemetry. A stubbed cell would make every count below a fact about the stub.
 * `renderMatrix` is a placeholder: the matrix is the App's business and would drag
 * the money path into a browse-surface test for nothing.
 */
function renderGrids(opts: { grids?: GridRow[]; results?: ResultRow[] } = {}) {
  render(
    <GridsView
      grids={opts.grids ?? [GRID]}
      combinations={MATCHUPS}
      prompts={PROMPTS}
      results={opts.results ?? []}
      GatedCell={GatedCell}
      votedKeys={new Set()}
      viewerId={VIEWER_ID}
      loading={false}
      error={null}
      onVote={vi.fn()}
      onUnvote={vi.fn()}
      onRequireAuth={vi.fn()}
      onWithdraw={vi.fn()}
      onReport={vi.fn()}
      renderMatrix={() => <div data-testid="matrix-stub" />}
    />,
  );
}

/** The card for one grid key (`__system__` for the Top Grid). */
const card = (key: string): HTMLElement =>
  screen.getAllByTestId('grid-card').find((el) => el.getAttribute('data-key') === key)!;

/** Every id array `getImages` was called with, in call order. */
const readIdSets = (): number[][] => mockGetImages.mock.calls.map((a) => a[0] as number[]);

// ===========================================================================
// The budget
// ===========================================================================

describe('🔴 the preview read budget — exact counts, both directions', () => {
  it('a card with FOUR filled cells makes EXACTLY ONE getImages call, with every id', async () => {
    installObserver('intersecting');
    mockGetImages.mockResolvedValue([visible(11), visible(12), visible(21), visible(22)]);
    renderGrids({
      results: [
        result('mk-a', 'cfg-a', 'qk-1', [11]),
        result('mk-a', 'cfg-a', 'qk-2', [12]),
        result('mk-b', 'cfg-b', 'qk-1', [21]),
        result('mk-b', 'cfg-b', 'qk-2', [22]),
      ],
    });

    // TWO cards are on screen: the Top Grid (all four cells) and gk-1 (one cell).
    await waitFor(() => expect(screen.getAllByTestId('grid-preview')).toHaveLength(2));
    await new Promise((r) => setTimeout(r, 0));

    // 🔴 TWO CALLS TOTAL — one per CARD. Per-cell would be five (4 + 1). The
    // equality is the whole assertion; a `>= 2` is satisfied by the defect.
    expect(mockGetImages).toHaveBeenCalledTimes(2);
    // …and the ids are BATCHED, in row-major cell order, attributable per card
    // because the two grids name different members (see GRID).
    expect(readIdSets()).toEqual(expect.arrayContaining([[11, 12, 21, 22], [22]]));
    expect(within(card('__system__')).getByTestId('grid-preview')).toHaveAttribute(
      'data-preview-count',
      '4',
    );
    expect(within(card('gk-1')).getByTestId('grid-preview')).toHaveAttribute(
      'data-preview-count',
      '1',
    );
  });

  it('🔴 a card whose grid has NO results makes EXACTLY ZERO calls', async () => {
    installObserver('intersecting');
    renderGrids({ results: [] });

    // 🔴 THE COUNT ASSERTION COMES FIRST, AND THAT IS NOT A STYLE CHOICE. It was
    // written after a `waitFor` on `grid-preview-empty`, and a mutation that made
    // an unrun cell contribute an id killed this case on THAT lookup — so the
    // assertion the case is named for was never reached, and the mutant died for
    // the wrong reason. Anchor on the cards being rendered (which does not depend
    // on the claim under test), flush, then COUNT.
    await waitFor(() => expect(screen.getAllByTestId('grid-card')).toHaveLength(2));
    // Let any effect that wanted to fire, fire.
    await new Promise((r) => setTimeout(r, 0));

    // 🔴 The POSITIVE CONTROL for this zero is the case above, in this same file
    // and against this same mock: it proves `mockGetImages` CAN be called, so this
    // zero is a fact about the component and not about a mock wired to nothing.
    expect(mockGetImages).toHaveBeenCalledTimes(0);
    // …and only then the DOM: no strip at all, an honest "nothing yet" instead.
    expect(within(card('gk-1')).queryByTestId('grid-preview')).toBeNull();
    expect(within(card('gk-1')).getByTestId('grid-preview-empty')).toBeInTheDocument();
    expect(within(card('__system__')).getByTestId('grid-preview-empty')).toBeInTheDocument();
  });

  it('skips the UNRUN cells: one filled cell of four means one id and one call', async () => {
    installObserver('intersecting');
    mockGetImages.mockResolvedValue([visible(11)]);
    renderGrids({ results: [result('mk-a', 'cfg-a', 'qk-1', [11])] });

    // The Top Grid's four cells hold ONE result between them…
    await waitFor(() =>
      expect(within(card('__system__')).getByTestId('grid-preview')).toBeInTheDocument(),
    );
    await new Promise((r) => setTimeout(r, 0));
    // …so exactly one id is read, and exactly once. Three unrun cells cost nothing.
    expect(mockGetImages).toHaveBeenCalledTimes(1);
    expect(readIdSets()).toEqual([[11]]);
    // 🔴 AND THE OTHER CARD, whose single cell is unrun, contributes ZERO — the
    // zero and the non-zero in one frame, against one mock.
    expect(within(card('gk-1')).getByTestId('grid-preview-empty')).toBeInTheDocument();
    expect(within(card('gk-1')).queryByTestId('grid-preview')).toBeNull();
  });

  it(`caps the strip at ${GRID_PREVIEW_MAX} tiles and DISCLOSES the remainder`, async () => {
    installObserver('intersecting');
    // 8 ids across the four cells — two over the cap, so `hidden` is 2. Chosen so
    // the total is NOT a multiple of the cap: a fixture landing exactly ON the
    // boundary cannot see an off-by-one in the slice.
    mockGetImages.mockResolvedValue([]);
    renderGrids({
      results: [
        result('mk-a', 'cfg-a', 'qk-1', [11, 12]),
        result('mk-a', 'cfg-a', 'qk-2', [13, 14]),
        result('mk-b', 'cfg-b', 'qk-1', [15, 16]),
        result('mk-b', 'cfg-b', 'qk-2', [17, 18]),
      ],
    });

    const preview = await waitFor(() => within(card('__system__')).getByTestId('grid-preview'));
    expect(preview).toHaveAttribute('data-preview-count', String(GRID_PREVIEW_MAX));
    const capped = readIdSets().filter((ids) => ids.length === GRID_PREVIEW_MAX);
    expect(capped).toHaveLength(1);
    expect(capped[0]).toEqual([11, 12, 13, 14, 15, 16]);
    // …and it SAYS the strip is a subset — the same disclosure rule as
    // `cell-publish-more`. A silent 6-of-8 understates the grid.
    expect(within(preview).getByTestId('grid-preview-more')).toHaveTextContent(
      '+2 more outputs in this grid.',
    );
  });

  it('🔴 reads NOTHING below the fold: an observer that never fires means zero calls', async () => {
    installObserver('never');
    renderGrids({ results: [result('mk-a', 'cfg-a', 'qk-1', [11])] });

    const preview = await waitFor(() => within(card('__system__')).getByTestId('grid-preview'));
    // The slot is reserved and inert — no spinner, because nothing is loading.
    expect(within(preview).getByTestId('grid-preview-deferred')).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 0));
    expect(mockGetImages).toHaveBeenCalledTimes(0);
  });
});

// ===========================================================================
// The hardened read path
// ===========================================================================

describe('🔴 the preview inherits GatedCell’s hardened read, rather than forking it', () => {
  it('surfaces the error + Retry on a failing read — never a bare spinner', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      installObserver('intersecting');
      mockGetImages.mockRejectedValue(new Error('gated read failed'));
      renderGrids({ results: [result('mk-a', 'cfg-a', 'qk-1', [11])] });

      const preview = await waitFor(() => within(card('__system__')).getByTestId('grid-preview'));

      // ONE bounded auto-retry first: the read is retried once and SAYS so, so a
      // transient stall self-heals without the viewer seeing an error.
      await waitFor(() => expect(within(preview).getByTestId('gated-retrying')).toBeInTheDocument());
      await vi.advanceTimersByTimeAsync(3_000);

      // Only the SECOND consecutive failure surfaces the error state — with a
      // manual Retry, which is what makes a dead read recoverable without a reload.
      const err = await waitFor(() => within(preview).getByTestId('gated-error'));
      expect(err).toHaveTextContent('gated read failed');
      expect(within(preview).getByTestId('gated-retry')).toBeInTheDocument();
      // …and the failure is TELEMETERED, so the mechanism is diagnosable.
      expect(mockTrack).toHaveBeenCalledWith('gated_read_error', { message: 'gated read failed' });

      // Exactly two attempts: the read plus its ONE auto-retry. A third would be
      // an unbounded loop against a rate-limited host. Only ONE card has a strip
      // here (gk-1's single cell is unrun), so the global count is per-card.
      expect(mockGetImages).toHaveBeenCalledTimes(2);
      expect(readIdSets()).toEqual([[11], [11]]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('the manual Retry re-issues the read', async () => {
    installObserver('intersecting');
    mockGetImages.mockRejectedValue(new Error('gated read failed'));
    renderGrids({ results: [result('mk-a', 'cfg-a', 'qk-1', [11])] });
    const preview = await waitFor(() => within(card('__system__')).getByTestId('grid-preview'));
    const err = await waitFor(() => within(preview).getByTestId('gated-error'), { timeout: 5_000 });
    expect(err).toBeInTheDocument();

    const before = mockGetImages.mock.calls.length;
    mockGetImages.mockResolvedValue([visible(11)]);
    await userEvent.click(within(preview).getByTestId('gated-retry'));

    await waitFor(() => expect(within(preview).getByTestId('result-image')).toBeInTheDocument());
    expect(mockGetImages.mock.calls.length).toBeGreaterThan(before);
  });

  it('renders the gated tiles it got back, through GatedCell', async () => {
    installObserver('intersecting');
    mockGetImages.mockResolvedValue([visible(11), visible(12)]);
    renderGrids({ results: [result('mk-a', 'cfg-a', 'qk-1', [11, 12])] });

    const preview = await waitFor(() => within(card('__system__')).getByTestId('grid-preview'));
    await waitFor(() => expect(within(preview).getAllByTestId('result-image')).toHaveLength(2));
    expect(within(preview).getAllByTestId('result-image')[0]).toHaveAttribute(
      'src',
      'https://image.civitai.com/gated-11.jpeg',
    );
  });
});
