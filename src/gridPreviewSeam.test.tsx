// 🔴 THE SEAM BETWEEN THE MATRIX AND THE GRID CARDS — a card previews IF AND ONLY
// IF it is closed.
//
// 🔴 READ THE HEADLINE CAREFULLY, BECAUSE IT USED TO CLAIM SOMETHING THIS FILE DOES
// NOT ASSERT. It said "one gated read per output, never two" — and the expected
// ledger in the first case below is `['[11]','[22]','[22]']`, in which image 22 is
// plainly read TWICE, by the matrix cell and by another card's strip that contains
// the same cell. There is no id-level dedupe anywhere in this app, so "an output is
// read once" is FALSE AND ENFORCED NOWHERE. What is enforced is the CARD-LEVEL
// PARTITION named above, and the assertions were always about that.
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
// through the SAME `GatedCell`. The strip shipped with no `isOpen` condition, so
// the open grid's card previewed exactly the cells the matrix was already showing
// full-size a few hundred pixels above — redundant UI, and the ONE GRID THE VIEWER
// IS LOOKING AT ran the 45s timeout, the bounded auto-retry and the
// `gated_read_error` surface twice over the same ids on every page load.
//
// ⚠️ THE CALL SAVING IS ONE, AND THIS FILE MEASURES IT. The matrix issues one read
// per filled cell and a card strip issues ONE BATCHED read, so the gate removes
// exactly one call per page load — 4 → 3 in the first case below. On a ~22-card
// list that is 1 of ~23. An earlier version of this header said "twice the weight
// on the host's 150-reads-per-10s-per-`blockInstanceId` limiter", which overstated
// it by roughly an order of magnitude: the doubling was per-output for the open
// grid, never per-page for the limiter.
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
// an "open card has no strip" assertion alone is satisfied by a crashed subtree, a
// missing prop, or a preview feature deleted outright.
//
// The strongest form is the SWAP, at the end: open a different grid and the strip
// must MOVE — leave the newly-open card and appear on the newly-closed one. A
// spelled guard ("the system card never previews") would pass while the hazard
// lived on in a different shape; a guard on the relationship cannot.

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BlockGatedImage } from '@civitai/app-sdk/blocks';
import type { SharedListItem } from '@civitai/blocks-react';

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

import { Harness } from '@civitai/blocks-react/testing';

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

const row = (key: string, count: number, title: string, data: unknown, author = 1): SharedListItem => ({
  key,
  authorUserId: author,
  count,
  viewerVoted: false,
  value: { title, body: '', data: data as SharedListItem['value']['data'] },
  createdAt: new Date(0),
  updatedAt: new Date(0),
});

const SEED: SharedListItem[] = [
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

describe('🔴 the matrix/card seam: a card previews IF AND ONLY IF it is closed', () => {
  it('the OPEN card shows no strip while the matrix shows its images — one render, exact counts', async () => {
    renderApp();
    const matrix = await screen.findByTestId('results-grid');
    // The Top Grid is open by construction (`openKey === null`), and it is the
    // system entry — so the default page load is exactly the state the defect hit.
    await waitFor(() => expect(screen.getAllByTestId('grid-card')).toHaveLength(2));

    // ---- ANCHORS FIRST, and deliberately ones that do NOT depend on the claim
    //      under test: the matrix's own images, and the closed card's strip. Both
    //      are present whether or not the gate exists, so waiting on them cannot
    //      mask the failure the counts below are here to produce. ----
    //
    // 2 of the Top Grid's 4 cells are run, so the matrix holds exactly 2 outputs.
    await waitFor(() => expect(within(matrix).getAllByTestId('result-image')).toHaveLength(2));
    const closed = card('gk-1');
    const strip = within(closed).getByTestId('grid-preview');
    expect(strip).toHaveAttribute('data-preview-count', '1');
    await waitFor(() => expect(within(strip).getAllByTestId('result-image')).toHaveLength(1));

    // ---- THE COUNTS, BEFORE THE PER-CARD ARMS ----
    //
    // 🔴 ORDER IS LOAD-BEARING HERE. These assertions were written after the
    // per-card absence checks below, and a mutant that removed the `!isOpen` gate
    // killed the case on the absence — so the COUNT, which is the claim that
    // distinguishes "present once" from "present twice", never executed. Anchored
    // above and counted here, the mutant dies on the count itself: 5 outputs and 4
    // reads instead of 3 and 3.
    //
    // EXACTLY THREE outputs on the page: two in the matrix + one in the closed
    // card's strip. A presence assertion cannot tell three from five.
    expect(screen.getAllByTestId('result-image')).toHaveLength(3);
    // …and the same relationship at the READ, which is the thing that actually
    // costs. Three calls: one per run matrix cell, one for the closed card's strip.
    // The defect added a fourth for `[11,22]` — the open card's own strip.
    expect(mockGetImages).toHaveBeenCalledTimes(3);
    // 🔴 AND NOTE WHAT THIS LEDGER ADMITS: `[22]` appears TWICE — the matrix cell
    // and the closed card's strip both read image 22, because they share that cell.
    // There is no id-level dedupe and this file never claimed one should exist; the
    // invariant is the card-level partition. Written out as a literal so the
    // duplication is visible in the expectation rather than implied by a count.
    expect(readLedger()).toEqual(['[11]', '[22]', '[22]']);
    // Stated as its own claim, because it is the one a future reader will care
    // about: NO call is the open grid's full preview set.
    expect(readLedger()).not.toContain('[11,22]');

    // ---- ARM 1: the OPEN card contributes NOTHING ----
    const open = card('__system__');
    expect(within(open).queryByTestId('grid-preview')).toBeNull();
    expect(within(open).queryAllByTestId('result-image')).toEqual([]);
    // 🔴 THE POSITIVE MARKER, so the absence above is an absence of the STRIP and
    // not of the card. Without it, a crashed subtree / deleted preview feature /
    // dropped `GatedCell` prop all satisfy arm 1.
    expect(within(open).getByTestId('grid-preview-shown-above')).toBeInTheDocument();
    expect(within(open).getByTestId('grid-open')).toHaveAttribute('aria-pressed', 'true');

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
    await waitFor(() => expect(screen.getAllByTestId('grid-card')).toHaveLength(2));
    // Premise, asserted as a COUNT so it fails on the invariant rather than on a
    // per-card absence: exactly ONE strip on the page, and it is gk-1's. Without
    // this the post-click state proves nothing MOVED.
    expect(screen.getAllByTestId('grid-preview')).toHaveLength(1);
    expect(within(card('gk-1')).getByTestId('grid-preview')).toBeInTheDocument();

    await userEvent.click(within(card('gk-1')).getByTestId('grid-open'));

    // The arms have SWAPPED. A guard spelled "the system card never previews"
    // would pass here while the hazard simply moved to the other card.
    await waitFor(() => expect(within(card('gk-1')).queryByTestId('grid-preview')).toBeNull());
    expect(within(card('gk-1')).getByTestId('grid-preview-shown-above')).toBeInTheDocument();
    expect(within(card('__system__')).getByTestId('grid-preview')).toBeInTheDocument();

    // gk-1's matrix is ONE cell and it is run, so exactly one output is on screen
    // from the matrix; the now-closed system card previews the two it holds.
    const matrix = screen.getByTestId('results-grid');
    await waitFor(() => expect(within(matrix).getAllByTestId('result-image')).toHaveLength(1));
    await waitFor(() =>
      expect(within(card('__system__')).getAllByTestId('result-image')).toHaveLength(2),
    );
    expect(screen.getAllByTestId('result-image')).toHaveLength(3);

    // 🔴 EXACTLY ONE preview strip on the page, whichever grid is open. This is
    // the invariant in its shortest form, and it holds across the transition.
    expect(screen.getAllByTestId('grid-preview')).toHaveLength(1);
    expect(screen.getAllByTestId('grid-preview-shown-above')).toHaveLength(1);
  });

  it('LEDGER: exactly one card is open, and exactly the closed ones carry strips', async () => {
    renderApp();
    await screen.findByTestId('results-grid');
    await waitFor(() => expect(screen.getAllByTestId('grid-card')).toHaveLength(2));

    // A relationship over the whole list, so a THIRD grid appearing later cannot
    // quietly reintroduce the duplication on just that one: the partition is
    // asserted, not the individual cards.
    const cards = screen.getAllByTestId('grid-card');
    const open = cards.filter(
      (el) => within(el).getByTestId('grid-open').getAttribute('aria-pressed') === 'true',
    );
    const withStrip = cards.filter((el) => within(el).queryByTestId('grid-preview') !== null);
    const withNote = cards.filter(
      (el) => within(el).queryByTestId('grid-preview-shown-above') !== null,
    );

    expect(open).toHaveLength(1);
    // The open set and the strip set are DISJOINT and together cover every card —
    // the two halves of "a card previews if and only if it is closed".
    expect(withStrip).toEqual(cards.filter((el) => !open.includes(el)));
    expect(withNote).toEqual(open);
    expect(withStrip.length + withNote.length).toBe(cards.length);
  });
});
