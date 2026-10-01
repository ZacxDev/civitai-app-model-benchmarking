// Unit tests for the results matrix's ROW WINDOWING decision.
//
// 🔴 WHY THIS FILE IS IN THE `node` PROJECT AND NOT BESIDE A RENDER. jsdom
// performs no layout: `getBoundingClientRect()`, `clientHeight` and `scrollTop`
// all return 0, and there is no `IntersectionObserver`. A windowing rule
// observable only through real layout would be structurally untestable here — and
// this repo has already paid for that once (`useNearViewport` initialises
// `near: true` under jsdom, so its deferral branch was bypassed in almost every
// test and a 604-green suite hid a permanently dead placeholder). `rowWindow` is
// therefore a total function of four explicit numbers, and every expectation below
// is a LITERAL computed by hand from the contract — never read back out of the
// implementation.
//
// 🔴 THE FIXTURE CONSTANTS ARE CHOSEN TO BE PAIRWISE DISTINCT FROM THE MODULE'S
// OWN DEFAULTS, so a mutant that ignores a caller's argument and uses the default
// instead cannot survive:
//
//     fixture rowHeight      126   vs  ROW_H_ESTIMATE      127
//     fixture viewportHeight 1000  vs  FALLBACK_VIEWPORT_H 1200
//     fixture overscan         4   vs  DEFAULT_OVERSCAN      3
//
// None of them is a power of two, and 1000 is NOT a multiple of 126 (7.94 rows) —
// so the `Math.ceil` is exercised rather than landing exactly on its own boundary.
// The scroll fixtures OVERSHOOT deliberately: `ROWS * ROW_H` is 12,600 and the
// past-the-end case passes 99,999, which is ~8× the whole grid, so the clamp runs
// well inside its range instead of balancing on it.

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_OVERSCAN,
  FALLBACK_VIEWPORT_H,
  ROW_H_ESTIMATE,
  rowWindow,
  sameWindow,
} from './virtualRows.js';

/** 100 rows — `MAX_CONFIGS`, i.e. the worst case this windowing exists for. */
const ROWS = 100;
const ROW_H = 126;
const VIEW_H = 1000;
const OVER = 4;

/** The fixture matrix's total height: 100 × 126 = 12,600px. */
const TOTAL_H = 12600;

function w(over: Partial<Parameters<typeof rowWindow>[0]> = {}) {
  return rowWindow({
    rowCount: ROWS,
    rowHeight: ROW_H,
    viewportHeight: VIEW_H,
    scrollTop: 0,
    overscan: OVER,
    ...over,
  });
}

// ===========================================================================

describe('rowWindow — the windowing decision, with literal expectations', () => {
  // ceil(1000 / 126) = 8 straddling rows, + 1 for the unaligned top edge = 9
  // visible; + 4 overscan below and 0 available above ⇒ rows [0, 13).
  // padBottom = (100 - 13) × 126 = 87 × 126 = 10,962.
  it('at the TOP of the matrix: mounts 13 of 100 rows and pads only below', () => {
    expect(
      w({ scrollTop: 0 }),
      'top-of-matrix window moved: expected rows [0,13) with padTop 0 / padBottom 10962',
    ).toEqual({ start: 0, end: 13, padTop: 0, padBottom: 10962 });
  });

  // floor(2000 / 126) = 15 (126×15 = 1890, 126×16 = 2016) ⇒ first visible row 15.
  // start = 15 - 4 = 11; end = 15 + 9 + 4 = 28.
  // padTop = 11 × 126 = 1386; padBottom = (100 - 28) × 126 = 72 × 126 = 9072.
  it('MID-SCROLL: the window slides and both pads carry the rows outside it', () => {
    expect(
      w({ scrollTop: 2000 }),
      'mid-scroll window moved: expected rows [11,28) with pads 1386 / 9072',
    ).toEqual({ start: 11, end: 28, padTop: 1386, padBottom: 9072 });
  });

  // 🔴 THE CLAMP CASE. floor(99999 / 126) = 793, which is 8× past the last row.
  // `Math.min(count - 1, …)` pins first-visible to 99, so start = 95, end = 100.
  // Without the clamp: start = 789 > end = 100 ⇒ an EMPTY slice (the matrix blanks
  // itself) and padTop = 789 × 126 = 99,414 ⇒ a page that grows as you scroll.
  it('🔴 scrolled PAST THE END: clamps to the last row instead of emptying the slice', () => {
    const win = w({ scrollTop: 99999 });
    expect(
      win,
      'PAST-END CLAMP BROKEN: scrollTop beyond the matrix must still mount rows [95,100) with padTop 11970 / padBottom 0',
    ).toEqual({ start: 95, end: 100, padTop: 11970, padBottom: 0 });
    // Stated separately, because this is the property the clamp exists for and a
    // reader should not have to derive it from the four numbers above.
    expect(
      win.start < win.end,
      'PAST-END CLAMP BROKEN: start overshot end, so the row slice is EMPTY and the matrix renders no cells',
    ).toBe(true);
  });

  // 126 × 99 = 12,474 is the top of the LAST row, and 12,599 is one px short of
  // the matrix's full height — both floor to 99 WITHOUT needing the clamp. Kept as
  // the control for the case above: it proves the clamp is not the only thing
  // producing row 99, so the past-end case is really testing the clamp.
  it('CONTROL for the clamp: the last row is reached without it at scrollTop 12599', () => {
    expect(
      w({ scrollTop: 12599 }),
      'last-row window moved: expected rows [95,100) with padTop 11970 / padBottom 0',
    ).toEqual({ start: 95, end: 100, padTop: 11970, padBottom: 0 });
  });

  it('a matrix SMALLER than the window mounts entirely, with no pads', () => {
    expect(
      w({ rowCount: 3 }),
      'a 3-row matrix must mount all 3 rows and pad neither side',
    ).toEqual({ start: 0, end: 3, padTop: 0, padBottom: 0 });
  });

  it('an EMPTY matrix is the empty window', () => {
    expect(w({ rowCount: 0 }), 'rowCount 0 must yield the empty window').toEqual({
      start: 0,
      end: 0,
      padTop: 0,
      padBottom: 0,
    });
    expect(w({ rowCount: -5 }), 'a negative rowCount must yield the empty window').toEqual({
      start: 0,
      end: 0,
      padTop: 0,
      padBottom: 0,
    });
    expect(w({ rowCount: Number.NaN }), 'a NaN rowCount must yield the empty window').toEqual({
      start: 0,
      end: 0,
      padTop: 0,
      padBottom: 0,
    });
  });

  it('a NEGATIVE scrollTop (the grid still below the fold) clamps to the top window', () => {
    expect(
      w({ scrollTop: -4000 }),
      'a negative scrollTop must be clamped to 0, i.e. the top-of-matrix window',
    ).toEqual({ start: 0, end: 13, padTop: 0, padBottom: 10962 });
  });

  // 🔴 THE FALLBACK IS A BOUNDED WINDOW, NOT "EVERYTHING". ceil(1200 / 126) = 10,
  // + 1 = 11 visible, + 4 overscan ⇒ rows [0, 15), padBottom = 85 × 126 = 10,710.
  // 15 ≠ 13, so this case cannot be confused with the measured one above — which
  // is the whole reason FALLBACK_VIEWPORT_H is 1200 and the fixture passes 1000.
  it('🔴 an UNREADABLE viewport height falls back to a BOUNDED window, never to all 100 rows', () => {
    const expected = { start: 0, end: 15, padTop: 0, padBottom: 10710 };
    for (const vh of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        w({ viewportHeight: vh }),
        `UNKNOWN VIEWPORT (${String(vh)}) must fall back to the bounded window [0,15), not render all ${ROWS} rows`,
      ).toEqual(expected);
      expect(
        w({ viewportHeight: vh }).end,
        `UNKNOWN VIEWPORT (${String(vh)}) mounted the whole matrix — the bound is not a bound`,
      ).toBeLessThan(ROWS);
    }
  });

  // floor(2000 / 127) = 15 (127×15 = 1905, 127×16 = 2032); ceil(1000 / 127) = 8,
  // + 1 = 9. start = 11, end = 28 — the same indices as the mid-scroll case, but
  // the PADS differ (11 × 127 = 1397; 72 × 127 = 9144), which is what tells the
  // fallback height apart from the fixture's 126.
  it('an UNREADABLE row height falls back to ROW_H_ESTIMATE (127), visible in the pads', () => {
    expect(
      w({ rowHeight: 0, scrollTop: 2000 }),
      'rowHeight 0 must fall back to ROW_H_ESTIMATE 127 — pads 1397 / 9144, not 1386 / 9072',
    ).toEqual({ start: 11, end: 28, padTop: 1397, padBottom: 9144 });
    expect(
      w({ rowHeight: Number.NaN, scrollTop: 2000 }),
      'a NaN rowHeight must fall back to ROW_H_ESTIMATE 127',
    ).toEqual({ start: 11, end: 28, padTop: 1397, padBottom: 9144 });
  });

  // start = 15 (no overscan above), end = 15 + 9 = 24.
  // padTop = 15 × 126 = 1890; padBottom = (100 - 24) × 126 = 76 × 126 = 9576.
  it('OVERSCAN 0 (and non-finite) narrows the window to exactly the visible band', () => {
    const expected = { start: 15, end: 24, padTop: 1890, padBottom: 9576 };
    expect(
      w({ scrollTop: 2000, overscan: 0 }),
      'overscan 0 must mount exactly the visible band, rows [15,24)',
    ).toEqual(expected);
    expect(
      w({ scrollTop: 2000, overscan: Number.NaN }),
      'a NaN overscan must behave as 0',
    ).toEqual(expected);
    expect(
      w({ scrollTop: 2000, overscan: -7 }),
      'a negative overscan must behave as 0, never widen the window',
    ).toEqual(expected);
  });

  // 🔴 THE CONSERVATION LAW, with a literal total. If the pads and the mounted band
  // do not add up to the full matrix height, the scroll extent changes as the
  // window moves — a scrollbar that jumps while you drag it.
  it('🔴 CONSERVES the scroll extent: pads + mounted rows always total 12,600px', () => {
    for (const scrollTop of [0, 1, 999, 2000, 6300, 12474, 12599, 12600, 99999]) {
      const win = w({ scrollTop });
      expect(
        win.padTop + (win.end - win.start) * ROW_H + win.padBottom,
        `SCROLL EXTENT CHANGED at scrollTop ${scrollTop}: pads + mounted band must total ${TOTAL_H}px (100 rows × 126px)`,
      ).toBe(TOTAL_H);
    }
  });

  // The bounds property, swept across the whole scroll range AND past it. A
  // separate claim from the literals: those pin four specific positions, this one
  // says no position can produce a nonsensical window.
  it('BOUNDS: 0 <= start <= end <= rowCount at every scroll position, including past the end', () => {
    for (let scrollTop = -500; scrollTop <= 20000; scrollTop += 173) {
      const win = w({ scrollTop });
      expect(
        win.start >= 0 && win.start <= win.end && win.end <= ROWS,
        `BOUNDS VIOLATED at scrollTop ${scrollTop}: got start=${win.start} end=${win.end} for ${ROWS} rows`,
      ).toBe(true);
      expect(
        win.padTop >= 0 && win.padBottom >= 0,
        `NEGATIVE PAD at scrollTop ${scrollTop}: padTop=${win.padTop} padBottom=${win.padBottom}`,
      ).toBe(true);
    }
  });

  // 🔴 THE POINT OF THE WHOLE CHANGE, stated as an EXACT number rather than a loose
  // ceiling. 20 prompts × 100 configs is 2,000 rows / 40,000 cells; at a 1000px
  // viewport and 126px rows the widest window anywhere in the scroll range is
  // 9 visible + 4 overscan above + 4 below = 17 rows (it is NARROWER at both ends,
  // where one side of the overscan has nowhere to go: 13 at the top, 5 at the
  // bottom). A literal 17 is what catches a mutant that widens the window — a
  // `toBeLessThanOrEqual(40)` would not.
  it('🔴 BOUNDED: the widest window anywhere in the scroll range is exactly 17 of 100 rows', () => {
    let worst = 0;
    let narrowest = Number.POSITIVE_INFINITY;
    for (let scrollTop = -500; scrollTop <= 20000; scrollTop += 61) {
      const win = w({ scrollTop });
      worst = Math.max(worst, win.end - win.start);
      narrowest = Math.min(narrowest, win.end - win.start);
    }
    expect(
      worst,
      `WINDOW NOT BOUNDED: the widest window over the whole scroll range mounted ${worst} rows; at a 1000px viewport and 126px rows it must be exactly 17`,
    ).toBe(17);
    // The positive half: the window is never EMPTY over a non-empty matrix, so the
    // bound above cannot be satisfied by rendering nothing. 5 is the bottom-of-matrix
    // window (rows [95,100)) — the narrowest the sweep reaches.
    expect(
      narrowest,
      `WINDOW COLLAPSED: the narrowest window in the sweep mounted ${narrowest} rows — a bound of 0 is not a bound, it is a blank matrix`,
    ).toBe(5);
  });
});

describe('sameWindow', () => {
  it('is true only when all four fields match', () => {
    const a = { start: 1, end: 2, padTop: 3, padBottom: 4 };
    expect(sameWindow(a, { ...a }), 'identical windows must compare equal').toBe(true);
    expect(sameWindow(a, { ...a, start: 0 }), 'a different start must not compare equal').toBe(false);
    expect(sameWindow(a, { ...a, end: 9 }), 'a different end must not compare equal').toBe(false);
    expect(sameWindow(a, { ...a, padTop: 9 }), 'a different padTop must not compare equal').toBe(false);
    expect(sameWindow(a, { ...a, padBottom: 9 }), 'a different padBottom must not compare equal').toBe(
      false,
    );
  });
});

describe('the module defaults themselves', () => {
  // ⚠️ INVARIANT GUARDS, not regression coverage — no bug ever violated these. They
  // exist because the literals in every case above are computed from the
  // DISTINCTNESS of these three constants from the fixture's 126 / 1000 / 4. If a
  // future bump made ROW_H_ESTIMATE 126, the row-height fallback case would pass
  // whether or not the fallback worked.
  it('INVARIANT GUARD: the defaults stay distinct from the fixture constants', () => {
    expect(ROW_H_ESTIMATE, 'ROW_H_ESTIMATE must differ from the fixture rowHeight 126').not.toBe(ROW_H);
    expect(
      FALLBACK_VIEWPORT_H,
      'FALLBACK_VIEWPORT_H must differ from the fixture viewportHeight 1000',
    ).not.toBe(VIEW_H);
    expect(DEFAULT_OVERSCAN, 'DEFAULT_OVERSCAN must differ from the fixture overscan 4').not.toBe(OVER);
    expect(ROW_H_ESTIMATE, 'ROW_H_ESTIMATE must be a positive height').toBeGreaterThan(0);
    expect(DEFAULT_OVERSCAN, 'DEFAULT_OVERSCAN must leave rows each side of the band').toBeGreaterThan(0);
  });
});
