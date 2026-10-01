// 🔴 THE READ BUDGET FOR MY BENCHMARKS ▸ GRIDS — the surface that grew thumbnail
// strips, and the one the existing preview guards could not see.
//
// ── WHY A SECOND BUDGET FILE AND NOT A CASE IN AN EXISTING ONE ──────────────
//
// `gridPreview.test.tsx` counts the reads on the COMMUNITY grids board and
// `gridPreviewSeam.test.tsx` pins the open/listed partition on that same surface.
// Neither can see this one: My Benchmarks is a different sidebar destination, so
// `MyGridsView`'s cards never coexist with `GridsView`'s, and every fixture in both
// of those files renders the community board. Adding a strip here is therefore a NEW
// image-reading surface with NO counted assertion anywhere — the "verified in
// isolation" shape, where each component is covered and the system is not.
//
// ── THE CLAIMS, AND WHY EVERY ONE IS AN EQUALITY ────────────────────────────
//
// The host rate-limits gated reads at 150 per 10s per `blockInstanceId`. So:
//
//   - a card whose grid has results makes EXACTLY ONE `getImages` call, whatever the
//     tile count. `toHaveBeenCalledTimes(n)`, never `toHaveBeenCalled()` — an "at
//     least once" is satisfied by the per-tile defect this budget exists to prevent.
//   - a card whose grid has NO previewable cell makes EXACTLY ZERO.
//   - 🔴 AND THE TWO LIVE IN ONE CASE, because a reassuring zero is indistinguishable
//     from a mock wired to nothing. Every zero below is preceded or followed, IN THE
//     SAME CASE, by a render that makes the same counter move.
//
// ── PRIVATE MEMBERS AND WHY THEY COST NOTHING ──────────────────────────────
//
// 🔴 A PRIVATE grid row previews only cells whose members are on the BOARD, and that
// is the same property that keeps a per-viewer local id out of every result row: the
// resolver (`resolveMemberRows`) matches member keys against board rows only, so a
// private member contributes no row and no column and therefore no cell. A grid of
// only private members has nothing to preview and reads NOTHING — asserted here as a
// zero with a non-zero control beside it.
//
// ── WHAT THIS FILE DOES NOT CLAIM ──────────────────────────────────────────
//
// ⚠️ jsdom performs no layout: nothing here is evidence about how a strip LOOKS, how
// big it is, or whether it overflows. `data-preview-count` and the call log are the
// observables.
//
// ⚠️ jsdom also implements no `IntersectionObserver`, which the strip uses to defer
// below-the-fold reads. It is STUBBED per case; the deferral itself is pinned on the
// community board in `gridPreview.test.tsx` (with an observer LOG, because under a
// never-firing stub the DOM is identical in both states).

import { render, screen, waitFor, within } from '@testing-library/react';
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
import { MyGridsView } from './components/MyGridsView.js';
import type {
  CombinationRow,
  GridRow,
  PromptRow,
  ResultRow,
  UnpublishedGrid,
} from './types.js';

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
// The board: TWO matchups × TWO prompts, so a whole-grid card is a 1-vs-4
// difference rather than 1-vs-1 and "one call per card" is actually falsifiable.
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

const result = (
  comboKey: string,
  configId: string,
  promptKey: string,
  imageIds: number[],
): ResultRow => ({
  key: `r-${comboKey}-${promptKey}`,
  authorUserId: 1,
  data: { v: 2, kind: 'result', comboKey, configId, promptKey, ecosystem: 'SDXL', imageIds },
});

/** All four cells run, each with a DISTINCT image id so a call is attributable. */
const ALL_RESULTS = [
  result('mk-a', 'cfg-a', 'qk-1', [11]),
  result('mk-a', 'cfg-a', 'qk-2', [12]),
  result('mk-b', 'cfg-b', 'qk-1', [21]),
  result('mk-b', 'cfg-b', 'qk-2', [22]),
];

/**
 * TWO published own grids with DELIBERATELY DIFFERENT member sets.
 *
 * 🔴 If both named the same members they would issue IDENTICAL id arrays and no
 * assertion could tell "one call per card" from "two calls for one card" — the two
 * are indistinguishable when the arguments match.
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

/** A PRIVATE grid naming board members — one cell, distinct from both above. */
const PRIVATE_BOARD: UnpublishedGrid = {
  v: 1,
  localId: 'ug-board',
  name: 'Private, board members',
  description: '',
  matchupKeys: ['mk-a'],
  promptKeys: ['qk-1'],
  updatedAt: '2026-09-30T00:00:00.000Z',
};
/** A PRIVATE grid naming only the viewer's own PRIVATE members. */
const PRIVATE_ONLY: UnpublishedGrid = {
  v: 1,
  localId: 'ug-private',
  name: 'Private, private members',
  description: '',
  matchupKeys: ['dm-1'],
  promptKeys: ['dp-1'],
  updatedAt: '2026-09-30T00:00:00.000Z',
};

// ---------------------------------------------------------------------------
// IntersectionObserver: report every observed element as visible, which is the
// WORST case for the read budget and therefore the one to measure.
// ---------------------------------------------------------------------------

function installIntersectingObserver(): void {
  class Stub implements IntersectionObserver {
    readonly root = null;
    readonly rootMargin = '';
    readonly thresholds: ReadonlyArray<number> = [];
    constructor(private cb: IntersectionObserverCallback) {}
    observe(target: Element): void {
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
  mockGetImages.mockImplementation(async (ids: number[]) => ids.map(visible));
  installIntersectingObserver();
});

afterEach(() => {
  delete (globalThis as unknown as { IntersectionObserver?: unknown }).IntersectionObserver;
});

function renderMine(
  opts: {
    ownGrids?: GridRow[];
    unpublished?: UnpublishedGrid[];
    results?: ResultRow[];
  } = {},
) {
  return render(
    <MyGridsView
      ownGrids={opts.ownGrids ?? [GRID_ALL, GRID_ONE]}
      combinations={MATCHUPS}
      prompts={PROMPTS}
      results={opts.results ?? []}
      /* 🔴 THE REAL `GatedCell`, NOT A STUB. The whole claim is that the strip reuses
         that component's one batched read; a stub would make every count below a
         fact about the stub instead. */
      GatedCell={GatedCell}
      viewerId={VIEWER_ID}
      loading={false}
      error={null}
      archivedKeys={new Set()}
      unpublished={opts.unpublished ?? []}
      onRequireAuth={vi.fn()}
      onWithdraw={vi.fn()}
      onArchive={vi.fn()}
      onUnarchive={vi.fn()}
      onNewUnpublished={vi.fn()}
      onEditUnpublished={vi.fn()}
      onDiscardUnpublished={vi.fn()}
      onPublishUnpublished={vi.fn()}
      onEditPublished={vi.fn()}
    />,
  );
}

/** The published card for one grid key. */
const pubCard = (key: string): HTMLElement =>
  screen.getAllByTestId('grid-card').find((el) => el.getAttribute('data-key') === key)!;
/** The private row for one local id. */
const privCard = (localId: string): HTMLElement =>
  screen
    .getAllByTestId('unpublished-card')
    .find((el) => el.getAttribute('data-local-id') === localId)!;

/** Every id array `getImages` was called with, sorted for comparison. */
const readLedger = (): string[] =>
  mockGetImages.mock.calls.map((a) => JSON.stringify(a[0])).sort();

// ===========================================================================

describe('🔴 My Benchmarks ▸ Grids: ONE batched read per card, with the zero anchored', () => {
  it('🔴 THE BUDGET AND ITS POSITIVE CONTROL IN ONE CASE: 0 reads with no results, 3 with', async () => {
    // ---- PART 1: the ZERO. Three cards, no published outputs anywhere. ----
    const { unmount } = renderMine({ unpublished: [PRIVATE_BOARD] });
    await waitFor(() => expect(screen.getAllByTestId('grid-card')).toHaveLength(2));
    expect(screen.getAllByTestId('unpublished-card')).toHaveLength(1);
    // 🔴 EVERY card is in the zero-read state STRUCTURALLY — `grid-preview-empty` is a
    // different node from `grid-preview`, so there is no id array a refactor could
    // hand to the hook by accident.
    await waitFor(() => expect(screen.getAllByTestId('grid-preview-empty')).toHaveLength(3));
    expect(screen.queryAllByTestId('grid-preview')).toEqual([]);
    expect(mockGetImages, 'an empty grid still issued a gated read').toHaveBeenCalledTimes(0);
    unmount();

    // ---- PART 2: THE CONTROL. The SAME counter, the SAME three cards, results now. ----
    //
    // 🔴 THIS IS WHAT MAKES PART 1 AN OBSERVATION. Without it, `0` is exactly what a
    // `getImages` wired to nothing — or a `GatedCell` prop that never reached the strip
    // — would report, and the zero above would certify a dead feature.
    renderMine({ unpublished: [PRIVATE_BOARD], results: ALL_RESULTS });
    await waitFor(() => expect(screen.getAllByTestId('grid-preview')).toHaveLength(3));
    await waitFor(() => expect(mockGetImages).toHaveBeenCalledTimes(3));

    // 🔴 ONE CALL PER CARD, AS AN EQUALITY. Per-tile would be 4 + 1 + 1 = 6.
    expect(mockGetImages).toHaveBeenCalledTimes(3);
    // …and each call's ids are attributable, because the three grids name different
    // members. `gk-all` spans every cell in row-major order; `gk-one` one cell;
    // the private board-member grid one other cell.
    expect(readLedger()).toEqual(['[11,12,21,22]', '[11]', '[22]'].sort());

    // The per-card tile counts, read off the DOM rather than inferred from the log.
    expect(within(pubCard('gk-all')).getByTestId('grid-preview')).toHaveAttribute(
      'data-preview-count',
      '4',
    );
    expect(within(pubCard('gk-one')).getByTestId('grid-preview')).toHaveAttribute(
      'data-preview-count',
      '1',
    );
    expect(within(privCard('ug-board')).getByTestId('grid-preview')).toHaveAttribute(
      'data-preview-count',
      '1',
    );
  });

  it('🔴 the strip renders REAL images, through the real GatedCell, on BOTH card kinds', async () => {
    // Presence of the host element is not enough: a strip that mounted and rendered
    // nothing would satisfy `data-preview-count`. The images are what the operator
    // asked for.
    renderMine({ unpublished: [PRIVATE_BOARD], results: ALL_RESULTS });

    const pub = await waitFor(() => within(pubCard('gk-one')).getByTestId('grid-preview'));
    await waitFor(() => expect(within(pub).getAllByTestId('result-image')).toHaveLength(1));
    expect(within(pub).getByTestId('result-image')).toHaveAttribute(
      'src',
      'https://image.civitai.com/gated-22.jpeg',
    );

    const priv = within(privCard('ug-board')).getByTestId('grid-preview');
    await waitFor(() => expect(within(priv).getAllByTestId('result-image')).toHaveLength(1));
    // 🔴 A DIFFERENT IMAGE FROM THE PUBLISHED CARD'S. If both cards rendered the same
    // id this case could not tell "the private card has its own strip" from "the
    // published card's strip was found twice".
    expect(within(priv).getByTestId('result-image')).toHaveAttribute(
      'src',
      'https://image.civitai.com/gated-11.jpeg',
    );
  });

  it('🔴 a PRIVATE grid of only PRIVATE members previews NOTHING and reads NOTHING', async () => {
    // 🔴 THE SAME PROPERTY THAT KEEPS A LOCAL ID OUT OF EVERY RESULT ROW, observed from
    // the other end: a private member is not on the board, so it resolves to no row and
    // no column, so the grid has no cell, so there is no image id and no call.
    //
    // The CONTROL is in the same render: a sibling private grid naming BOARD members
    // does preview and does read. Without it this zero is indistinguishable from "the
    // private rows render no strip at all".
    renderMine({
      ownGrids: [],
      unpublished: [PRIVATE_ONLY, PRIVATE_BOARD],
      results: ALL_RESULTS,
    });

    await waitFor(() => expect(screen.getAllByTestId('unpublished-card')).toHaveLength(2));
    // The control FIRST, so the counter is known to move in this render.
    await waitFor(() =>
      expect(within(privCard('ug-board')).getByTestId('grid-preview')).toBeInTheDocument(),
    );
    await waitFor(() => expect(mockGetImages).toHaveBeenCalledTimes(1));
    expect(readLedger()).toEqual(['[11]']);

    // …and the private-member-only grid: the empty node, no strip, and NO second call.
    const only = privCard('ug-private');
    expect(
      within(only).queryByTestId('grid-preview'),
      'a grid whose only members are private rendered a read-bearing strip',
    ).toBeNull();
    const empty = within(only).queryByTestId('grid-preview-empty');
    expect(empty, 'the private-members-only grid rendered no preview node at all').not.toBeNull();
    expect(mockGetImages, 'a private member contributed a gated read').toHaveBeenCalledTimes(1);
  });

  it('a card discloses that its strip is a SUBSET, and the cap is the read budget', async () => {
    // `GRID_PREVIEW_MAX` is 6; four cells carrying two ids each is 8, so the strip is
    // capped at 6 and the disclosure has to say so — the same rule as the community
    // board's, on this surface.
    renderMine({
      ownGrids: [GRID_ALL],
      results: [
        result('mk-a', 'cfg-a', 'qk-1', [11, 12]),
        result('mk-a', 'cfg-a', 'qk-2', [13, 14]),
        result('mk-b', 'cfg-b', 'qk-1', [15, 16]),
        result('mk-b', 'cfg-b', 'qk-2', [17, 18]),
      ],
    });
    const strip = await waitFor(() => within(pubCard('gk-all')).getByTestId('grid-preview'));
    expect(strip).toHaveAttribute('data-preview-count', '6');
    expect(within(strip).getByTestId('grid-preview-more')).toHaveTextContent(
      '+2 more outputs in this grid.',
    );
    // 🔴 AND IT IS STILL ONE CALL, carrying SIX ids — not eight, and not six calls.
    expect(mockGetImages).toHaveBeenCalledTimes(1);
    expect(readLedger()).toEqual(['[11,12,13,14,15,16]']);
  });
});
