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
import { MyList } from './components/MyList.js';
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
      publishError={null}
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
      /* ⚠️ Stubs — the Open routes are measured in `src/gridOpenPrivate.test.tsx`
         against the real `App`. Adding the control does not change this file's claim:
         the read budget is one batched `getImages` per CARD, and a button issues
         none. */
      onOpenUnpublished={vi.fn()}
      onOpenPublished={vi.fn()}
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
    // 🔴 NAMED ANCHORS, NOT A BARE `getAllByTestId` INSIDE `waitFor`. A
    // testing-library "unable to find" kills the case with ITS message and this
    // case's own diagnostics never execute — the pre-emption this repo has measured
    // repeatedly. Throwing a named Error inside the `waitFor` keeps the message.
    await waitFor(() => {
      const empties = screen.queryAllByTestId('grid-preview-empty');
      if (empties.length !== 3)
        throw new Error(
          `expected one zero-read placeholder per card (3), found ${empties.length} — a card is missing its strip`,
        );
    });
    expect(screen.queryAllByTestId('grid-preview')).toEqual([]);
    expect(mockGetImages, 'an empty grid still issued a gated read').toHaveBeenCalledTimes(0);
    unmount();

    // ---- PART 2: THE CONTROL. The SAME counter, the SAME three cards, results now. ----
    //
    // 🔴 THIS IS WHAT MAKES PART 1 AN OBSERVATION. Without it, `0` is exactly what a
    // `getImages` wired to nothing — or a `GatedCell` prop that never reached the strip
    // — would report, and the zero above would certify a dead feature.
    renderMine({ unpublished: [PRIVATE_BOARD], results: ALL_RESULTS });
    await waitFor(() => {
      const strips = screen.queryAllByTestId('grid-preview');
      if (strips.length !== 3)
        throw new Error(
          `expected one read-bearing strip per card (3), found ${strips.length} — a card is missing its strip`,
        );
    });
    await waitFor(() => {
      if (mockGetImages.mock.calls.length < 3)
        throw new Error(
          `the per-card reads have not all landed: ${mockGetImages.mock.calls.length} of 3`,
        );
    });

    // 🔴 ONE CALL PER CARD, AS AN EQUALITY. Per-tile would be 4 + 1 + 1 = 6.
    expect(mockGetImages, 'the read count is not exactly one per card').toHaveBeenCalledTimes(3);
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

    const pub = await waitFor(() => {
      const el = within(pubCard('gk-one')).queryByTestId('grid-preview');
      if (el === null) throw new Error('the PUBLISHED own-grid card has no thumbnail strip');
      return el;
    });
    await waitFor(() => {
      const imgs = within(pub).queryAllByTestId('result-image');
      if (imgs.length !== 1)
        throw new Error(`the published card's strip rendered ${imgs.length} images, not 1`);
    });
    expect(within(pub).getByTestId('result-image')).toHaveAttribute(
      'src',
      'https://image.civitai.com/gated-22.jpeg',
    );

    const priv = await waitFor(() => {
      const el = within(privCard('ug-board')).queryByTestId('grid-preview');
      if (el === null) throw new Error('the PRIVATE grid row has no thumbnail strip');
      return el;
    });
    await waitFor(() => {
      const imgs = within(priv).queryAllByTestId('result-image');
      if (imgs.length !== 1)
        throw new Error(`the private row's strip rendered ${imgs.length} images, not 1`);
    });
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
    await waitFor(() => {
      const el = within(privCard('ug-board')).queryByTestId('grid-preview');
      if (el === null)
        throw new Error('the control row (private grid of BOARD members) has no strip');
    });
    await waitFor(() => {
      if (mockGetImages.mock.calls.length < 1)
        throw new Error('the control row issued no gated read — this case cannot see a zero');
    });
    expect(readLedger(), 'the control row did not read exactly its own cell').toEqual(['[11]']);

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

  // ⚠️ A CAP / SUBSET-DISCLOSURE CASE WAS DELETED FROM HERE, AND SAYING SO IS WORTH
  // MORE THAN KEEPING IT. It asserted that eight outputs cap to six, disclose
  // "+2 more outputs in this grid." and still cost ONE call.
  //
  // Why it had no reason to exist on THIS surface: `GRID_PREVIEW_MAX` is applied inside
  // `gridPreviewIds`, which takes NO `cap` parameter — its own docblock records that
  // the parameter was removed because there was one call site and no test ever passed a
  // third argument. So the cap cannot differ per caller, and a second surface cannot
  // get it wrong. It is already pinned where it is decided (`lib/gridEntries.test.ts`)
  // and where it is rendered (`gridPreview.test.tsx`), and no mutant in this feature's
  // sweep was killed only by it. Three samples of one claim is two too many.
  //
  // What remains asserted here, and is genuinely this surface's: one batched read per
  // card, the zero, and that a PRIVATE member contributes nothing.
});

// ===========================================================================
// 🔴 THE SEAM: `MyGridsView` BUILDS the strip, `MyList` RENDERS it
// ===========================================================================
//
// 🔴 WHY THIS IS A SEPARATE CASE AND NOT A STRONGER ASSERTION IN THE ONES ABOVE.
// The private row's strip crosses a component boundary: `MyGridsView` constructs a
// `GridPreview` node and hands it to `MyList` as `MyDraftItem.preview`, and `MyList`
// renders `{item.preview}`. TWO mutants break that strip — one deleting the node at
// the producer, one deleting `{item.preview}` at the consumer — and against the cases
// above they died on the IDENTICAL message, so the sweep's real resolution was 15 of
// 16 and the seam was not separately diagnosable from its neighbour.
//
// This case watches the CONSUMER alone, with a sentinel node no production component
// could supply, so a mutation at the seam fails here with a message that names the
// seam. The producer keeps its own message in the cases above.
//
// ⚠️ The probe's testid is TEST-ONLY and never reaches production, so it is outside
// `renameWireCompat.test.ts`'s ledger by construction rather than by exemption.
//
// ⚠️ BOTH CASES BELOW ARE **INVARIANT GUARDS**, NOT REGRESSION COVERAGE, and the
// measurement is written down: they are GREEN against the pre-fix tree (`7b8e592`),
// because `MyList` already rendered `{item.preview}` correctly. What they buy is
// DIAGNOSABILITY — the two mutants that break the private row's strip previously died
// on an identical message, so the sweep's real resolution was 15 of 16 and the seam
// was indistinguishable from its neighbour. They do not count as coverage of a defect.
describe('🔴 MyList renders the draft row’s `preview` node it was handed', () => {
  it('a sentinel node supplied by the caller reaches the DOM', () => {
    render(
      <MyList
        noun="grid"
        drafts={[
          {
            localId: 'ug-probe',
            name: 'Probed grid',
            meta: '1 × 1',
            preview: <div data-testid="my-list-preview-probe" />,
          },
        ]}
        rows={[]}
        keyOf={(r: { key: string }) => r.key}
        archivedKeys={new Set()}
        loading={false}
        onNew={vi.fn()}
        onEditDraft={vi.fn()}
        onDiscardDraft={vi.fn()}
        onPublishDraft={vi.fn()}
        onEditPublished={vi.fn()}
        onWithdraw={vi.fn()}
        renderCard={() => null}
      />,
    );
    // POSITIVE CONTROL on the premise: the row itself rendered, so a null below is
    // about the `preview` slot and not about a list that rendered nothing.
    expect(screen.getByTestId('unpublished-card')).toBeInTheDocument();
    expect(
      screen.queryByTestId('my-list-preview-probe'),
      'MyList dropped the draft row’s `preview` node — the producer/consumer seam is cut',
    ).not.toBeNull();
  });

  it('a draft row with NO `preview` renders unchanged — the slot is optional', () => {
    // The other direction, so the assertion above cannot be satisfied by a `MyList`
    // that renders some node unconditionally. Matchup and prompt callers pass nothing.
    render(
      <MyList
        noun="matchup"
        drafts={[{ localId: 'dm-probe', name: 'No preview', meta: '2 models' }]}
        rows={[]}
        keyOf={(r: { key: string }) => r.key}
        archivedKeys={new Set()}
        loading={false}
        onNew={vi.fn()}
        onEditDraft={vi.fn()}
        onDiscardDraft={vi.fn()}
        onPublishDraft={vi.fn()}
        onEditPublished={vi.fn()}
        onWithdraw={vi.fn()}
        renderCard={() => null}
      />,
    );
    expect(screen.getByTestId('unpublished-card')).toBeInTheDocument();
    expect(
      screen.queryByTestId('my-list-preview-probe'),
      'MyList rendered a preview node for a row that supplied none',
    ).toBeNull();
    expect(screen.queryAllByTestId('grid-preview')).toEqual([]);
  });
});
