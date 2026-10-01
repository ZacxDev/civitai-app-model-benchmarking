// 🔴 THE MATRIX MOUNTS A BOUNDED NUMBER OF CELLS, and the matchup bands are the
// SAME ones the unwindowed render produced.
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
//
// `MAX_CONFIGS` went from 8 to 100 in the same change that added the windowing.
// A grid holds up to `MAX_GRID_MATCHUPS` × `MAX_GRID_PROMPTS` (both 20), and the
// matrix renders one ROW per config, so the worst case went from 20×8 = 160 rows /
// 3,200 cells to 20×100 = 2,000 rows / 40,000 cells. Every cell is a potential
// Buzz spend and a filled one issues a gated image read, so that is a cost surface
// as well as a frame-time one.
//
// ── WHAT THIS FILE CANNOT DO, STATED PLAINLY ───────────────────────────────
//
// ⚠️ jsdom performs NO LAYOUT. `getBoundingClientRect()` returns all zeros, no
// `scroll` event ever fires on its own, and `window.innerHeight` is a constant
// unrelated to any box on the page. So NOTHING here observes real scrolling, real
// row heights, or whether the window tracks the viewer's eye — that needs a human
// in a real browser. The measurement is driven by STUBBING the one rect the hook
// reads and dispatching the `scroll` event by hand, which proves the WIRING
// (measure → `rowWindow` → slice) and nothing about layout. The windowing
// ARITHMETIC is pinned separately, with literal expected values, in
// `src/lib/virtualRows.test.ts` (the `node` project) precisely because it must not
// depend on any of this.
//
// 🔴 AND THE COUNTS BELOW ARE REAL COUNTS, NOT AN ABSENCE. Each case renders a
// SMALL matrix first and asserts its exact cell count, so the query is proven able
// to find cells before it is used to assert there are few of them. A count that
// can only ever come back low is indistinguishable from a broken selector — this
// repo has shipped exactly that shape before (see the header of
// `gridPreviewSeam.test.tsx`).

import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ResultsGrid } from './ResultsGrid.js';
import { palette } from '../theme.js';
import { fakeGatedCell } from '../test-helpers.js';
import { flattenConfigs } from '../lib/benchmark.js';
import { DEFAULT_OVERSCAN, ROW_H_ESTIMATE } from '../lib/virtualRows.js';
import type { CombinationRow, PromptRow } from '../types.js';

const c = palette();

/** The viewport this file pins, so the window size is not jsdom's 768 by luck. */
const VIEW_H = 1000;
/** The grid's sticky header row, subtracted by the hook to get the band offset. */
const HEADER_H = 56;

// ---------------------------------------------------------------------------
// The fixture board: 10 matchups × 10 configs = 100 rows (MAX_CONFIGS), and 20
// prompts (MAX_GRID_PROMPTS) — i.e. the ceiling this change exists for, minus the
// matchup axis which the grid caps elsewhere.
//
// 🔴 TEN GROUPS OF TEN, NOT ONE GROUP OF A HUNDRED, and that shape is the point of
// the band case below: a window that opens in the MIDDLE of a group must not
// promote its first visible row to a band. One flat group could not tell the
// global row index apart from the slice index.
// ---------------------------------------------------------------------------

const MATCHUPS = 10;
const CONFIGS_PER = 10;
const PROMPTS = 20;

function matchup(m: number): CombinationRow {
  return {
    key: `mk-${m}`,
    count: 100 - m,
    authorUserId: 1,
    name: `Matchup ${m}`,
    description: '',
    data: {
      v: 2,
      kind: 'combination',
      configs: Array.from({ length: CONFIGS_PER }, (_, k) => ({
        id: `cfg-${m}-${k}`,
        label: `cfg ${m}.${k}`,
        checkpoint: {
          versionId: 1000 + m * 100 + k,
          modelId: 500,
          baseModel: 'SDXL 1.0',
          modelName: `Model ${m}.${k}`,
        },
        loras: [],
      })),
    },
  };
}

function prompt(i: number): PromptRow {
  return {
    key: `qk-${i}`,
    count: 50 - i,
    authorUserId: 1,
    name: `Prompt ${i}`,
    description: '',
    data: { v: 3, kind: 'prompt', default: { prompt: `p${i}`, params: {} } },
  };
}

const BIG_CONFIGS = flattenConfigs(Array.from({ length: MATCHUPS }, (_, m) => matchup(m)));
const BIG_PROMPTS = Array.from({ length: PROMPTS }, (_, i) => prompt(i));

/** A deliberately TINY matrix, used only as the positive control for the queries. */
const SMALL_CONFIGS = flattenConfigs([matchup(0)]).slice(0, 3);
const SMALL_PROMPTS = BIG_PROMPTS.slice(0, 2);

function renderGrid(configs: typeof BIG_CONFIGS, prompts: PromptRow[]) {
  return render(
    <ResultsGrid
      configs={configs}
      prompts={prompts}
      results={[]}
      runs={{}}
      c={c}
      buzzTotal={5000}
      GatedCell={fakeGatedCell()}
      onRunCell={vi.fn()}
      onConfirmRun={vi.fn()}
      onResumeRun={vi.fn()}
      onCancelRun={vi.fn()}
      onOpenMatchup={vi.fn()}
      onOpenPrompt={vi.fn()}
    />,
  );
}

/**
 * Pretend the grid container's top edge sits `px` ABOVE the viewport top, then
 * fire the `scroll` event the hook listens for. This is the ONLY way to move the
 * window in jsdom — no box has a size and no scroll happens on its own.
 */
function scrollGridTo(px: number): void {
  const body = screen.getByTestId('grid-body');
  Object.defineProperty(body, 'getBoundingClientRect', {
    configurable: true,
    value: () =>
      ({ top: -px, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: -px }) as DOMRect,
  });
  // `act` because the hook's listener calls `setState` from outside React's own
  // event handling — without it the re-render is still queued when the assertions
  // read the DOM, and the case fails claiming the listener never ran.
  act(() => {
    window.dispatchEvent(new Event('scroll'));
  });
}

let originalInnerHeight = 0;

beforeEach(() => {
  originalInnerHeight = window.innerHeight;
  // jsdom's default is 768; pinned so every literal below is computed from a
  // number this file states rather than one the environment happens to have.
  (window as { innerHeight: number }).innerHeight = VIEW_H;
});

afterEach(() => {
  (window as { innerHeight: number }).innerHeight = originalInnerHeight;
});

// ===========================================================================

describe('🔴 the results matrix mounts a BOUNDED number of cells', () => {
  // ceil(1000 / 127) = 8 straddling rows + 1 for the unaligned edge = 9 visible;
  // the hook's offset is `-rect.top - 56`, which at the unscrolled top is -56 and
  // clamps to 0, so there is no overscan above and 3 below ⇒ rows [0, 12).
  const TOP_ROWS = 12;

  it('🔴 100 configs × 20 prompts mounts 240 cells, not 2,000 — with the cell query proven first', () => {
    // ---- POSITIVE CONTROL, IN THIS TEST, BEFORE THE BOUND ----
    // 3 configs × 2 prompts = 6 cells, all of them inside the window. If this came
    // back 0 the bound below would be meaningless: a selector that can never match
    // reports a beautifully small number.
    const control = renderGrid(SMALL_CONFIGS, SMALL_PROMPTS);
    expect(
      screen.getAllByTestId('grid-cell'),
      'POSITIVE CONTROL FAILED: the grid-cell query found no cells in a 3×2 matrix, so every count below is unreadable',
    ).toHaveLength(6);
    control.unmount();

    // ---- THE BOUND ----
    renderGrid(BIG_CONFIGS, BIG_PROMPTS);
    const body = screen.getByTestId('grid-body');
    expect(body, 'the matrix must know its full row count').toHaveAttribute(
      'data-row-count',
      String(MATCHUPS * CONFIGS_PER),
    );

    const cells = screen.getAllByTestId('grid-cell');
    expect(
      cells,
      `MATRIX NOT WINDOWED: expected ${TOP_ROWS} rows × ${PROMPTS} prompts = ${TOP_ROWS * PROMPTS} mounted cells at a ${VIEW_H}px viewport; a full render would be ${MATCHUPS * CONFIGS_PER * PROMPTS}`,
    ).toHaveLength(TOP_ROWS * PROMPTS);
    // Said again as the relationship a future reader cares about, so the literal
    // above is not the only thing standing between this and a full render.
    expect(
      cells.length,
      `MATRIX NOT WINDOWED: mounted ${cells.length} cells out of a possible ${MATCHUPS * CONFIGS_PER * PROMPTS}`,
    ).toBeLessThan(MATCHUPS * CONFIGS_PER * PROMPTS / 4);

    expect(
      screen.getAllByTestId('grid-row-header'),
      `expected exactly ${TOP_ROWS} mounted row headers`,
    ).toHaveLength(TOP_ROWS);
    // Every prompt column is still present — windowing is on ROWS only, and a
    // dropped column would change which cell is which.
    expect(
      screen.getAllByTestId('grid-col-header'),
      'COLUMN LOST: all 20 prompt columns must still render — the rows are windowed, the columns are not',
    ).toHaveLength(PROMPTS);
  });

  it('the spacers stand in for the rows outside the window, so the scroll extent is preserved', () => {
    renderGrid(BIG_CONFIGS, BIG_PROMPTS);
    // At the top of the matrix there is nothing above, so no top spacer at all.
    expect(
      screen.queryByTestId('grid-pad-top'),
      'a top spacer at scroll offset 0 would push the first row down by phantom rows',
    ).toBeNull();
    // (100 - 12) × 127 = 88 × 127 = 11,176.
    expect(
      screen.getByTestId('grid-pad-bottom'),
      'BOTTOM SPACER WRONG: the 88 unmounted rows must reserve 88 × 127 = 11176px, or the page gets shorter as you scroll',
    ).toHaveAttribute('data-height', '11176');
  });

  it('a matrix SMALLER than the window renders whole, with no spacers at all', () => {
    renderGrid(SMALL_CONFIGS, SMALL_PROMPTS);
    expect(screen.getAllByTestId('grid-cell'), 'a 3×2 matrix must mount all 6 cells').toHaveLength(6);
    expect(screen.queryByTestId('grid-pad-top'), 'no top spacer on a 3-row matrix').toBeNull();
    expect(screen.queryByTestId('grid-pad-bottom'), 'no bottom spacer on a 3-row matrix').toBeNull();
  });
});

// ===========================================================================

describe('🔴 windowing does not change WHICH rows get a matchup band', () => {
  /**
   * 🔴 THE CASE THE GLOBAL-INDEX READ EXISTS FOR. Pretend the container top is
   * 3,500px above the viewport: the hook's offset is 3500 - 56 = 3444, and
   * floor(3444 / 127) = 27, so the window is rows [24, 39) — 15 rows, OPENING
   * MID-GROUP (matchup 2 owns rows 20–29).
   *
   * Within those 15 rows exactly ONE is a group start: row 30, the first config of
   * matchup 3. Row 24 is NOT, because row 23 is also matchup 2.
   *
   * If `groupStart` were computed from the SLICE index instead of the global one,
   * the first mounted row would always get a band and the comparisons behind it
   * would be against the wrong neighbours — producing a band on nearly every
   * mounted row. That is the mutant this case kills.
   */
  it('🔴 a window that opens MID-GROUP gives its first row NO band — only the real group start gets one', () => {
    // ---- POSITIVE CONTROL: the band query can find bands at all ----
    const control = renderGrid(SMALL_CONFIGS, SMALL_PROMPTS);
    expect(
      screen.getAllByTestId('grid-group-matchup'),
      'POSITIVE CONTROL FAILED: the band query found none in a single-matchup matrix, so the counts below are unreadable',
    ).toHaveLength(1);
    control.unmount();

    renderGrid(BIG_CONFIGS, BIG_PROMPTS);
    scrollGridTo(3500);

    const body = screen.getByTestId('grid-body');
    expect(
      [body.getAttribute('data-window-start'), body.getAttribute('data-window-end')],
      'SCROLL WIRING BROKEN: a rect 3500px above the fold must window rows [24,39) — if this is still [0,12) the scroll listener never ran',
    ).toEqual(['24', '39']);

    const headers = screen.getAllByTestId('grid-row-header');
    expect(headers, 'the mid-scroll window mounts 15 rows').toHaveLength(15);
    // Rows 24–38: matchup 2 owns 20–29, matchup 3 owns 30–39.
    expect(
      headers.map((el) => el.getAttribute('data-config-id')),
      'WRONG SLICE: the mounted rows must be global indices 24–38, in order',
    ).toEqual([
      'cfg-2-4', 'cfg-2-5', 'cfg-2-6', 'cfg-2-7', 'cfg-2-8', 'cfg-2-9',
      'cfg-3-0', 'cfg-3-1', 'cfg-3-2', 'cfg-3-3', 'cfg-3-4', 'cfg-3-5',
      'cfg-3-6', 'cfg-3-7', 'cfg-3-8',
    ]);

    const bands = screen.getAllByTestId('grid-group-matchup');
    expect(
      bands.map((el) => el.getAttribute('data-combo-key')),
      'BAND MISPLACED: a window opening mid-matchup must band ONLY the real group start (mk-3 at global row 30) — a band on the first MOUNTED row means groupStart is reading the slice index, not the global one',
    ).toEqual(['mk-3']);
  });

  it('at the TOP of the matrix the bands are exactly the group starts inside the window', () => {
    renderGrid(BIG_CONFIGS, BIG_PROMPTS);
    // Window [0,12): matchup 0 owns rows 0–9, matchup 1 owns 10–19, so the group
    // starts inside the window are row 0 and row 10.
    expect(
      screen.getAllByTestId('grid-group-matchup').map((el) => el.getAttribute('data-combo-key')),
      'the top window spans two matchups, so exactly two bands belong in it',
    ).toEqual(['mk-0', 'mk-1']);
  });

  it('the drill-in control is still the BAND and still carries the matchup name', () => {
    renderGrid(BIG_CONFIGS, BIG_PROMPTS);
    const band = screen.getAllByTestId('grid-group-matchup')[0];
    expect(band.tagName, 'the band must still be a real button').toBe('BUTTON');
    expect(band, 'the band must still name the matchup it opens').toHaveAttribute(
      'aria-label',
      'Open matchup: Matchup 0',
    );
  });
});

// ===========================================================================

describe('the windowing constants this file computes its literals from', () => {
  // ⚠️ INVARIANT GUARD, not regression coverage. Every literal above (12 rows, 240
  // cells, 11176px, the [24,39) slice) is arithmetic over ROW_H_ESTIMATE,
  // DEFAULT_OVERSCAN, VIEW_H and HEADER_H. Changing a constant without recomputing
  // the literals would turn this file red for the right reason — this case just
  // makes the dependency explicit instead of leaving it in the comments.
  it('⚠️ INVARIANT GUARD: the literals above assume ROW_H_ESTIMATE 127, overscan 3, header 56', () => {
    expect(ROW_H_ESTIMATE, 'recompute this file’s literals if the row height estimate moves').toBe(127);
    expect(DEFAULT_OVERSCAN, 'recompute this file’s literals if the overscan moves').toBe(3);
    expect(HEADER_H, 'HEADER_H must match ROW_H_HEADER in ResultsGrid.tsx').toBe(56);
    expect(Math.ceil(VIEW_H / ROW_H_ESTIMATE) + 1 + DEFAULT_OVERSCAN, 'the top window is 12 rows').toBe(12);
  });
});
