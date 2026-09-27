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
 * TWO published grids, and the Top Grid card carries NO strip.
 *
 * 🔴 EVERY CLAIM IN THIS FILE IS ABOUT A **CLOSED** CARD, because a closed card is
 * the only kind that previews. The open grid's card renders no strip at all — its
 * cells are displayed full-size by the matrix above the list, and previewing them
 * again made the one grid the viewer is looking at read its images TWICE (see
 * `gridPreviewSeam.test.tsx`, which pins that relationship). The system Top Grid is
 * open by construction (`openKey === null`), so the cards under test here are the
 * two published ones.
 *
 * 🔴 THEIR MEMBER SETS ARE DELIBERATELY DIFFERENT. If both named the same members
 * they would issue IDENTICAL id arrays, and no assertion could tell "one call per
 * card" from "two calls for one card" — indistinguishable when the arguments match.
 * `gk-all` spans all four cells, `gk-one` a single one, so every call is
 * attributable to exactly one card and the counts below can be equalities.
 *
 * Vote counts order them after the pinned Top Grid: `__system__`, `gk-all`, `gk-one`.
 */
const GRID_ALL: GridRow = {
  key: 'gk-all',
  count: 5,
  authorUserId: VIEWER_ID,
  name: 'Every cell',
  description: '',
  data: { v: 1, kind: 'grid', matchupKeys: ['mk-a', 'mk-b'], promptKeys: ['qk-1', 'qk-2'] },
};
const GRID_ONE: GridRow = {
  key: 'gk-one',
  count: 3,
  authorUserId: VIEWER_ID,
  name: 'One cell',
  description: '',
  data: { v: 1, kind: 'grid', matchupKeys: ['mk-b'], promptKeys: ['qk-2'] },
};

// ---------------------------------------------------------------------------
// IntersectionObserver control
// ---------------------------------------------------------------------------

type Mode = 'intersecting' | 'never';

/**
 * What the stub observer was actually ASKED to do.
 *
 * 🔴 THE ONLY WINDOW ONTO THE ARMING STEP. Under `'never'` the DOM is IDENTICAL
 * whether or not an observer exists — both states show the inert
 * `grid-preview-deferred` placeholder — so a DOM assertion cannot tell "deferred,
 * waiting on the observer" from "no observer was ever constructed, and this
 * placeholder is permanent". The construction count and the observed elements can.
 */
interface ObserverLog {
  /** One entry per `new IntersectionObserver(...)`. */
  constructed: number;
  /** Every element handed to `observe()`, in call order. */
  observed: Element[];
}

/**
 * Install a stub `IntersectionObserver`, and return a log of what it was asked.
 *
 * 🔴 BOTH MODES ARE NEEDED, AND NEITHER IS THE jsdom DEFAULT. jsdom implements no
 * `IntersectionObserver` at all, and the component treats "no observer" as "mount
 * immediately" — which is the right degradation but makes the deferral
 * unobservable. `'never'` is the only way to tell "not scrolled to yet" from "no
 * observer", so it is what the deferral case uses; `'intersecting'` reports the
 * element as visible on `observe()` and is what the budget cases use.
 */
function installObserver(mode: Mode): ObserverLog {
  const log: ObserverLog = { constructed: 0, observed: [] };
  class Stub implements IntersectionObserver {
    readonly root = null;
    readonly rootMargin = '';
    readonly thresholds: ReadonlyArray<number> = [];
    constructor(private cb: IntersectionObserverCallback) {
      log.constructed += 1;
    }
    observe(target: Element): void {
      log.observed.push(target);
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
  return log;
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
function gridsElement(opts: { grids?: GridRow[]; results?: ResultRow[] } = {}) {
  return (
    <GridsView
      grids={opts.grids ?? [GRID_ALL, GRID_ONE]}
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
    />
  );
}

/** Returns the render result, so a case can RE-RENDER the same mounted cards
 * with new props — which is how the late-arriving-ids transition is driven. */
function renderGrids(opts: { grids?: GridRow[]; results?: ResultRow[] } = {}) {
  return render(gridsElement(opts));
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

    // THREE cards are on screen; exactly TWO carry a strip — the open Top Grid
    // card carries none, which is the seam guard's business and asserted there.
    await waitFor(() => expect(screen.getAllByTestId('grid-card')).toHaveLength(3));
    await waitFor(() => expect(screen.getAllByTestId('grid-preview')).toHaveLength(2));
    await new Promise((r) => setTimeout(r, 0));

    // 🔴 TWO CALLS TOTAL — one per STRIP-BEARING CARD. Per-cell would be five
    // (4 + 1). The equality is the whole assertion; a `>= 2` is satisfied by the
    // defect this file exists to prevent.
    expect(mockGetImages).toHaveBeenCalledTimes(2);
    // …and the ids are BATCHED, in row-major cell order, attributable per card
    // because the two grids name different members (see GRID).
    expect(readIdSets()).toEqual(expect.arrayContaining([[11, 12, 21, 22], [22]]));
    expect(within(card('gk-all')).getByTestId('grid-preview')).toHaveAttribute(
      'data-preview-count',
      '4',
    );
    expect(within(card('gk-one')).getByTestId('grid-preview')).toHaveAttribute(
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
    await waitFor(() => expect(screen.getAllByTestId('grid-card')).toHaveLength(3));
    // Let any effect that wanted to fire, fire.
    await new Promise((r) => setTimeout(r, 0));

    // 🔴 The POSITIVE CONTROL for this zero is the case above, in this same file
    // and against this same mock: it proves `mockGetImages` CAN be called, so this
    // zero is a fact about the component and not about a mock wired to nothing.
    expect(mockGetImages).toHaveBeenCalledTimes(0);
    // …and only then the DOM: no strip at all, an honest "nothing yet" instead.
    expect(within(card('gk-one')).queryByTestId('grid-preview')).toBeNull();
    expect(within(card('gk-one')).getByTestId('grid-preview-empty')).toBeInTheDocument();
    expect(within(card('gk-all')).getByTestId('grid-preview-empty')).toBeInTheDocument();
    // …and the OPEN card has neither — no strip and no "nothing yet" line, because
    // it says where its (absent) images would be instead. Asserted so this case
    // cannot be read as a claim about the open card.
    expect(within(card('__system__')).queryByTestId('grid-preview')).toBeNull();
    expect(within(card('__system__')).getByTestId('grid-preview-shown-above')).toBeInTheDocument();
  });

  it('skips the UNRUN cells: one filled cell of four means one id and one call', async () => {
    installObserver('intersecting');
    mockGetImages.mockResolvedValue([visible(11)]);
    renderGrids({ results: [result('mk-a', 'cfg-a', 'qk-1', [11])] });

    // The Top Grid's four cells hold ONE result between them…
    await waitFor(() =>
      expect(within(card('gk-all')).getByTestId('grid-preview')).toBeInTheDocument(),
    );
    await new Promise((r) => setTimeout(r, 0));
    // …so exactly one id is read, and exactly once. Three unrun cells cost nothing.
    expect(mockGetImages).toHaveBeenCalledTimes(1);
    expect(readIdSets()).toEqual([[11]]);
    // 🔴 AND THE OTHER STRIP-BEARING CARD, whose single cell is unrun, contributes
    // ZERO — the zero and the non-zero in one frame, against one mock.
    expect(within(card('gk-one')).getByTestId('grid-preview-empty')).toBeInTheDocument();
    expect(within(card('gk-one')).queryByTestId('grid-preview')).toBeNull();
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

    const preview = await waitFor(() => within(card('gk-all')).getByTestId('grid-preview'));
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

    const preview = await waitFor(() => within(card('gk-all')).getByTestId('grid-preview'));
    // The slot is reserved and inert — no spinner, because nothing is loading.
    expect(within(preview).getByTestId('grid-preview-deferred')).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 0));
    expect(mockGetImages).toHaveBeenCalledTimes(0);
  });
});

// ===========================================================================
// The lazy mount, when the ids are NOT there on the first render
// ===========================================================================

/**
 * 🔴 THE CASE 604 GREEN TESTS COULD NOT SEE, AND WHY.
 *
 * `useNearViewport` starts `near === true` when `IntersectionObserver` is
 * undefined, and jsdom implements none — so almost every case in this repo bypasses
 * the deferral path entirely. `gridPreviewSeam.test.tsx` deletes the global
 * outright; the deferral case above installs a stub but with the ids ALREADY
 * PRESENT on the first render. The suite was config-blind on the one dimension that
 * exists in every real browser.
 *
 * What that hid: the host div carrying the ref is inside the id-bearing branch, so a
 * grid with nothing to preview renders `grid-preview-empty` and there IS no element
 * to observe. When a shared cell is later run and published the ids arrive on the
 * SAME mounted card — the card's React key is the grid key, so the component
 * instance survives the transition — the host div mounts, and the effect keyed on a
 * REF OBJECT never re-ran, because neither `near` nor the ref's identity had
 * changed. No observer was ever constructed and the card kept an inert dashed
 * placeholder forever: no read, no spinner, no error, no Retry.
 *
 * Both cases below drive that exact transition on a mounted card. They are RED on
 * the pre-fix code — the first at `constructed: 0`, the second at `getImages: 0`
 * calls with the placeholder still on screen.
 */
describe('🔴 ids arriving AFTER the first render still arm the lazy mount', () => {
  it('🔴 arms the observer on a host that mounts LATE — zero ids → non-zero ids', async () => {
    // `'never'`, per the deferral contract: the placeholder is on screen in BOTH
    // the broken and the fixed state, so the log is the only discriminator.
    const log = installObserver('never');
    const view = renderGrids({ results: [] });

    // ---- PREMISE: nothing to preview, so no host element and nothing observed.
    //      Also the POSITIVE half of the log's own control: it must be able to
    //      stay at zero for an honest reason before a non-zero means anything.
    await waitFor(() => expect(screen.getAllByTestId('grid-preview-empty')).toHaveLength(2));
    await new Promise((r) => setTimeout(r, 0));
    expect(log.constructed, 'an observer was armed with no host to observe').toBe(0);
    expect(log.observed).toEqual([]);

    // ---- THE TRANSITION: a shared cell is run and published, so ids arrive on
    //      the cards that are already mounted. `rerender` keeps those instances.
    view.rerender(gridsElement({ results: [result('mk-b', 'cfg-b', 'qk-2', [22])] }));

    // The host div is now on screen, with the deferred placeholder inside it —
    // both strip-bearing cards contain the mk-b × qk-2 cell.
    await waitFor(() => expect(screen.getAllByTestId('grid-preview')).toHaveLength(2));
    const hosts = screen.getAllByTestId('grid-preview');
    for (const host of hosts) {
      expect(within(host).getByTestId('grid-preview-deferred')).toBeInTheDocument();
    }
    await new Promise((r) => setTimeout(r, 0));

    // 🔴 THE CLAIM, as an EQUALITY: exactly one observer per late-mounted host.
    // Pre-fix this is 0. A `>= 1` would be satisfied by one card arming and the
    // other not, which is the same defect on half the list.
    expect(log.constructed, 'the lazy mount was never armed for the late host').toBe(hosts.length);
    // …and it is armed on THE HOSTS THEMSELVES, not on some other element that
    // happened to be observed. A count alone cannot tell those apart.
    expect(log.observed).toEqual(expect.arrayContaining(hosts));
  });

  it('🔴 and then READS, once the late host is reported visible', async () => {
    // The behavioural half: what a viewer actually gets. With `'intersecting'` the
    // stub reports the element visible the moment it is observed, so an armed
    // observer becomes a real read and a real thumbnail.
    installObserver('intersecting');
    mockGetImages.mockResolvedValue([visible(22)]);
    const view = renderGrids({ results: [] });

    await waitFor(() => expect(screen.getAllByTestId('grid-preview-empty')).toHaveLength(2));
    await new Promise((r) => setTimeout(r, 0));
    // PREMISE: an empty grid reads nothing — the zero this file already owns.
    expect(mockGetImages).toHaveBeenCalledTimes(0);

    view.rerender(gridsElement({ results: [result('mk-b', 'cfg-b', 'qk-2', [22])] }));

    // 🔴 THE READ HAPPENS, and the placeholder is REPLACED rather than kept
    // alongside. Pre-fix: `grid-preview-deferred` is still here, `getImages` was
    // never called, and the card shows an inert dashed box with no way out of it.
    await waitFor(() => expect(mockGetImages).toHaveBeenCalledTimes(2));
    expect(readIdSets()).toEqual([[22], [22]]);
    await waitFor(() =>
      expect(within(card('gk-one')).getByTestId('result-image')).toBeInTheDocument(),
    );
    expect(screen.queryAllByTestId('grid-preview-deferred')).toEqual([]);
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

      const preview = await waitFor(() => within(card('gk-all')).getByTestId('grid-preview'));

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
      // an unbounded loop against a rate-limited host. Only ONE card issues a read
      // here (gk-one's single cell is unrun, and the open Top Grid card has no
      // strip at all), so the global count is that one card's.
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
    const preview = await waitFor(() => within(card('gk-all')).getByTestId('grid-preview'));
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

    const preview = await waitFor(() => within(card('gk-all')).getByTestId('grid-preview'));
    await waitFor(() => expect(within(preview).getAllByTestId('result-image')).toHaveLength(2));
    expect(within(preview).getAllByTestId('result-image')[0]).toHaveAttribute(
      'src',
      'https://image.civitai.com/gated-11.jpeg',
    );
  });
});
