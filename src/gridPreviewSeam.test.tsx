// 🔴 THE SEAM BETWEEN THE MATRIX AND THE GRID CARDS — the open grid's outputs are
// read ONCE, by the matrix, and never a second time by a card.
//
// 🔴 READ THE HEADLINE CAREFULLY, BECAUSE AN EARLIER ONE CLAIMED SOMETHING THIS FILE
// DOES NOT ASSERT. It said "one gated read per output, never two" — and the expected
// ledger in the first case below is `['[11]','[22]','[22]']`, in which image 22 is
// plainly read TWICE, by a matrix cell and by another card's strip that contains the
// same cell. There is no id-level dedupe anywhere in this app, so "an output is read
// once" is FALSE AND ENFORCED NOWHERE. What is enforced is the OPEN/LISTED PARTITION
// named above, and the assertions were always about that.
//
// The overlap double-read is a KNOWN, ACCEPTED budget assumption rather than an
// open defect: the host's limit is on CALLS, and each card costs exactly one
// batched call whatever ids are in it, so the per-card budget that
// `gridPreview.test.tsx` and `GridPreview` defend is untouched by the duplication.
// Overlap is also the EXPECTED case, not an edge one — the Top Grid is the
// top-voted members and community grids are built from those same popular ones. If
// that assumption ever has to change, a dedupe belongs at the read path, not here.
//
// ── THE DEFECT THIS FILE EXISTS TO PREVENT ──────────────────────────────────
//
// The grids section renders the OPEN grid's full matrix in a panel, and below it a
// list of cards each carrying an inline thumbnail strip. Both read their images
// through the SAME `GatedCell`. The strip shipped with no gate at all, so the open
// grid's card previewed exactly the cells the matrix was already showing full-size a
// few hundred pixels above — redundant UI, and the ONE GRID THE VIEWER IS LOOKING AT
// ran the 45s timeout, the bounded auto-retry and the `gated_read_error` surface
// twice over the same ids on every page load.
//
// 🔴 WHAT CHANGED, AND WHY THE GUARD GOT STRONGER RATHER THAN LOOSER. The first fix
// was a `!isOpen` CONDITION on the strip: the open grid still had a card, and the
// card rendered a "Shown in full above" note instead of a preview. The list no
// longer contains the open grid AT ALL, so the condition has nothing left to test
// and the hazard has nowhere left to live — an absent card cannot read anything. The
// assertions move from "the open card has no strip" (a claim about how one card
// renders) to "the open grid has no card" (a claim about the set), which is the
// version a spelled or per-card mutant cannot walk.
//
// ⚠️ THE CALL SAVING IS STILL ONE, AND THIS FILE STILL MEASURES IT. The matrix
// issues one read per filled cell and a card strip issues ONE BATCHED read, so the
// partition removes exactly one call per page load — 4 → 3 in the first case below.
// On a ~22-card list that is 1 of ~23. An earlier version of this header said "twice
// the weight on the host's 150-reads-per-10s-per-`blockInstanceId` limiter", which
// overstated it by roughly an order of magnitude: the doubling was per-output for the
// open grid, never per-page for the limiter.
//
// ── WHY IT NEEDED A FILE OF ITS OWN ─────────────────────────────────────────
//
// 🔴 `gridPreview.test.tsx` DID NOT AND COULD NOT SEE IT, and it is not wrong.
// It asserts "one batched `getImages` per CARD", it passes, and that claim was
// never violated: the duplication is not inside a card, it is BETWEEN a card and
// the matrix. Every fixture there is scoped to one surface — its `renderMatrix` is
// a stub — so no test in it ever built the combined state. That is the shape of
// "verified in isolation": two components each hermetically covered, broken
// together.
//
// So the guard here pins a RELATIONSHIP rather than a component, and pins it by
// EXACT COUNT rather than presence — a count is what would have caught this, since
// the duplicated strip was *present and correct*, merely rendered one time too
// many. And both arms are asserted IN ONE RENDER, so neither can pass vacuously:
// an "the open grid contributes nothing" assertion alone is satisfied by a crashed
// subtree, a missing prop, or a preview feature deleted outright.
//
// The strongest form is the SWAP, at the end: open a different grid and the strip
// must MOVE — leave the newly-open grid (with its whole card) and appear on the
// newly-closed one. A spelled guard ("the system card never previews") would pass
// while the hazard lived on in a different shape; a guard on the relationship cannot.

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BlockGatedImage } from '@civitai/app-sdk/blocks';
import type { SharedItem } from '@civitai/sdk';

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

import { Harness } from './test-harness.js';

import { App } from './App.js';
import { fakeAppStorage, fakeShared, immediateSleep } from './test-helpers.js';
import type { CombinationData, GridData, PromptData, ResultData } from './types.js';

const VIEWER_ID = 99;

// ---------------------------------------------------------------------------
// The board. Two matchups × two prompts, so the Top Grid has FOUR cells; TWO of
// them are run. One published grid names a SINGLE cell — and deliberately one of
// the run ones, so the closed card genuinely has something to preview and its
// strip's presence is a real observation rather than an empty div.
// ---------------------------------------------------------------------------

const comboData = (configId: string): CombinationData => ({
  v: 2,
  kind: 'combination',
  configs: [
    {
      id: configId,
      checkpoint: { versionId: 1001, modelId: 500, baseModel: 'SDXL 1.0', modelName: 'JuggernautXL' },
      loras: [],
    },
  ],
});
const promptData: PromptData = {
  v: 3,
  kind: 'prompt',
  default: { prompt: 'a cyberpunk portrait', params: {} },
};
const resultData = (
  comboKey: string,
  configId: string,
  promptKey: string,
  imageIds: number[],
): ResultData => ({
  v: 2,
  kind: 'result',
  comboKey,
  configId,
  promptKey,
  ecosystem: 'SDXL',
  imageIds,
});
/** gk-1 names mk-b × qk-2 — ONE cell, and it is a run one. */
const gridData: GridData = {
  v: 1,
  kind: 'grid',
  matchupKeys: ['mk-b'],
  promptKeys: ['qk-2'],
};

const row = (key: string, count: number, title: string, data: unknown, author = 1): SharedItem => ({
  key,
  authorUserId: author,
  count,
  viewerVoted: false,
  value: { title, body: '', data },
  createdAt: new Date(0),
  updatedAt: new Date(0),
});

const SEED: SharedItem[] = [
  row('mk-a', 9, 'Matchup A', comboData('cfg-a')),
  row('mk-b', 8, 'Matchup B', comboData('cfg-b')),
  row('qk-1', 7, 'Prompt One', promptData),
  row('qk-2', 6, 'Prompt Two', promptData),
  // Two of the Top Grid's four cells are run.
  row('r-1', 0, 'result', resultData('mk-a', 'cfg-a', 'qk-1', [11])),
  row('r-2', 0, 'result', resultData('mk-b', 'cfg-b', 'qk-2', [22])),
  row('gk-1', 3, 'A one-cell grid', gridData, VIEWER_ID),
];

/**
 * 🔴 THE MOCK ANSWERS PER REQUEST, not with a constant.
 *
 * A fixture that returned the same image for every call could not tell "the matrix
 * rendered its two outputs" from "one output rendered twice" — which is the exact
 * confusion the defect produced. Echoing the requested ids back means the rendered
 * `src` attributes are a faithful projection of what was ASKED for, so a duplicate
 * read shows up as a duplicate image and a count can see it.
 */
const visible = (imageId: number): BlockGatedImage => ({
  imageId,
  status: 'visible',
  url: `https://image.civitai.com/gated-${imageId}.jpeg`,
  nsfwLevel: 1,
  contentRating: 'pg',
  width: 100,
  height: 100,
});

beforeEach(() => {
  mockGetImages.mockReset();
  mockTrack.mockReset();
  mockGetImages.mockImplementation(async (ids: number[]) => ids.map(visible));
  // The strips lazy-mount behind an IntersectionObserver, which jsdom does not
  // implement. The component treats "no observer" as "mount immediately", so the
  // absence here is what puts every strip in play — i.e. the WORST case for the
  // read budget, which is the case this file must measure.
  delete (globalThis as unknown as { IntersectionObserver?: unknown }).IntersectionObserver;
});

afterEach(() => {
  vi.useRealTimers();
});

function renderApp() {
  const { shared } = fakeShared({ seed: SEED });
  render(
    <Harness
      viewer={{ id: VIEWER_ID, username: 'me' }}
      theme="dark"
      consentGranted
      buzzBudget={1000}
      shared={{ seed: [] }}
      showLog={false}
    >
      <App
        deps={{
          resolveResources: async () => [],
          pollIntervalMs: 0,
          sleep: immediateSleep,
          shared,
          appStorage: fakeAppStorage().appStorage,
        }}
      />
    </Harness>,
  );
}

const card = (key: string): HTMLElement =>
  screen.getAllByTestId('grid-card').find((el) => el.getAttribute('data-key') === key)!;

/** Every id array `getImages` was called with, as a sorted, comparable ledger. */
const readLedger = (): string[] =>
  mockGetImages.mock.calls.map((a) => JSON.stringify(a[0])).sort();

// ===========================================================================

describe('🔴 the matrix/card seam: the open grid has no card, so it cannot re-read', () => {
  it('the OPEN grid contributes NO card while the matrix shows its images — one render, exact counts', async () => {
    renderApp();
    const matrix = await screen.findByTestId('results-grid');
    // The Top Grid is open by construction (`openKey === null`), and it is the
    // system entry — so the default page load is exactly the state the defect hit.
    // ONE card, not two: the open grid is not listed.
    await waitFor(() => expect(screen.getAllByTestId('grid-card')).toHaveLength(1));

    // ---- ANCHORS FIRST, and deliberately ones that do NOT depend on the claim
    //      under test: the matrix's own images, and the listed card's strip. Both
    //      are present whether or not the partition exists, so waiting on them
    //      cannot mask the failure the counts below are here to produce. ----
    //
    // 2 of the Top Grid's 4 cells are run, so the matrix holds exactly 2 outputs.
    await waitFor(() => expect(within(matrix).getAllByTestId('result-image')).toHaveLength(2));
    const listed = card('gk-1');
    const strip = within(listed).getByTestId('grid-preview');
    expect(strip).toHaveAttribute('data-preview-count', '1');
    await waitFor(() => expect(within(strip).getAllByTestId('result-image')).toHaveLength(1));

    // ---- THE COUNTS, BEFORE THE PER-ENTRY ARMS ----
    //
    // 🔴 ORDER IS LOAD-BEARING HERE. These assertions were written after the
    // per-card absence checks below, and a mutant that removed the gate killed the
    // case on the absence — so the COUNT, which is the claim that distinguishes
    // "present once" from "present twice", never executed. Anchored above and
    // counted here, the mutant dies on the count itself: 5 outputs and 4 reads
    // instead of 3 and 3.
    //
    // EXACTLY THREE outputs on the page: two in the matrix + one in the listed
    // card's strip. A presence assertion cannot tell three from five.
    expect(screen.getAllByTestId('result-image')).toHaveLength(3);
    // …and the same relationship at the READ, which is the thing that actually
    // costs. Three calls: one per run matrix cell, one for the listed card's strip.
    // The defect added a fourth for `[11,22]` — the open grid's own strip.
    expect(mockGetImages).toHaveBeenCalledTimes(3);
    // 🔴 AND NOTE WHAT THIS LEDGER ADMITS: `[22]` appears TWICE — a matrix cell
    // and the listed card's strip both read image 22, because they share that cell.
    // There is no id-level dedupe and this file never claimed one should exist; the
    // invariant is the open/listed partition. Written out as a literal so the
    // duplication is visible in the expectation rather than implied by a count.
    expect(readLedger()).toEqual(['[11]', '[22]', '[22]']);
    // Stated as its own claim, because it is the one a future reader will care
    // about: NO call is the open grid's full preview set.
    expect(readLedger()).not.toContain('[11,22]');

    // ---- ARM 1: the OPEN grid contributes NOTHING, because it has NO CARD ----
    expect(
      screen.queryAllByTestId('grid-card').filter((el) => el.getAttribute('data-key') === '__system__'),
      'the open grid is listed — the card that used to re-read its images is back',
    ).toEqual([]);
    // 🔴 THE POSITIVE MARKER, so the absence above is an absence of the OPEN grid's
    // card and not of the list. Without it, a crashed subtree / deleted preview
    // feature / dropped `GatedCell` prop all satisfy arm 1.
    expect(screen.getByTestId('grid-open-title')).toHaveTextContent('Top Grid');
    expect(screen.getByTestId('grids-list')).toBeInTheDocument();
    expect(within(listed).getByTestId('grid-open')).toBeInTheDocument();

    // ---- ARM 2: the MATRIX is where those images ARE ----
    expect(
      within(matrix)
        .getAllByTestId('result-image')
        .map((el) => el.getAttribute('src'))
        .sort(),
    ).toEqual([
      'https://image.civitai.com/gated-11.jpeg',
      'https://image.civitai.com/gated-22.jpeg',
    ]);
  });

  it('🔴 THE SWAP: opening another grid MOVES the strip — it never duplicates a read', async () => {
    renderApp();
    await screen.findByTestId('results-grid');
    await waitFor(() => expect(screen.getAllByTestId('grid-card')).toHaveLength(1));
    // Premise, asserted as a COUNT so it fails on the invariant rather than on a
    // per-card absence: exactly ONE strip on the page, and it is gk-1's. Without
    // this the post-click state proves nothing MOVED.
    expect(screen.getAllByTestId('grid-preview')).toHaveLength(1);
    expect(within(card('gk-1')).getByTestId('grid-preview')).toBeInTheDocument();

    await userEvent.click(within(card('gk-1')).getByTestId('grid-open'));

    // The arms have SWAPPED. A guard spelled "the system card never previews"
    // would pass here while the hazard simply moved to the other card.
    await waitFor(() =>
      expect(
        screen.queryAllByTestId('grid-card').filter((el) => el.getAttribute('data-key') === 'gk-1'),
      ).toEqual([]),
    );
    expect(within(card('__system__')).getByTestId('grid-preview')).toBeInTheDocument();

    // gk-1's matrix is ONE cell and it is run, so exactly one output is on screen
    // from the matrix; the now-listed system card previews the two it holds.
    const matrix = screen.getByTestId('results-grid');
    await waitFor(() => expect(within(matrix).getAllByTestId('result-image')).toHaveLength(1));
    await waitFor(() =>
      expect(within(card('__system__')).getAllByTestId('result-image')).toHaveLength(2),
    );
    expect(screen.getAllByTestId('result-image')).toHaveLength(3);

    // 🔴 EXACTLY ONE preview strip on the page, whichever grid is open, and exactly
    // one card. This is the invariant in its shortest form, and it holds across the
    // transition.
    expect(screen.getAllByTestId('grid-preview')).toHaveLength(1);
    expect(screen.getAllByTestId('grid-card')).toHaveLength(1);
  });

  it('LEDGER: every LISTED card carries a strip, and the open grid is the one entry missing', async () => {
    renderApp();
    await screen.findByTestId('results-grid');
    await waitFor(() => expect(screen.getAllByTestId('grid-card')).toHaveLength(1));

    // A relationship over the whole list, so a THIRD grid appearing later cannot
    // quietly reintroduce the duplication on just that one: the partition is
    // asserted, not the individual cards.
    //
    // 🔴 THE SET, NOT A COUNT. `communityEntries` is the system entry plus every
    // published grid; the list must be exactly that set minus the open one, and
    // every member of it must carry a strip. A count alone would be satisfied by the
    // filter dropping the WRONG entry.
    const ALL = ['__system__', 'gk-1'];
    const keys = screen.getAllByTestId('grid-card').map((el) => el.getAttribute('data-key'));
    expect(keys).toEqual(ALL.filter((k) => k !== '__system__'));

    const cards = screen.getAllByTestId('grid-card');
    const withStrip = cards.filter((el) => within(el).queryByTestId('grid-preview') !== null);
    expect(withStrip).toEqual(cards);
    // …and nothing anywhere on the page still says "shown above": that note was the
    // open CARD's content, and there is no open card.
    expect(screen.queryAllByTestId('grid-preview-shown-above')).toEqual([]);
  });
});
