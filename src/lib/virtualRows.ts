// PURE row windowing for the results matrix. No React, no DOM, no layout reads —
// `rowWindow` is a total function from four explicit numbers to the slice of rows
// that should be mounted plus the two spacer heights that keep the scrollbar
// honest.
//
// 🔴 WHY IT IS A PURE FUNCTION IN THE `node` PROJECT AND NOT A HOOK IN THE `dom`
// ONE. jsdom performs NO LAYOUT: `getBoundingClientRect()`, `clientHeight`,
// `scrollTop` and `scrollWidth` are all 0 and there is no `IntersectionObserver`.
// This repo has already shipped a permanently-dead placeholder behind exactly
// that blind spot — `useNearViewport` in `GridPreview.tsx` initialises
// `near: true` when no observer exists, so the deferral branch was bypassed in
// almost every test and a 604-green suite could not see it. A windowing decision
// reachable ONLY through real layout would be the same defect again. So the
// decision lives here, where literal inputs produce literal outputs, and the
// component's job shrinks to "measure, call this, render the slice".
//
// 🔴 AND WHY THE UNKNOWN-VIEWPORT FALLBACK IS A BOUNDED WINDOW, NOT "RENDER
// EVERYTHING". That is the opposite choice to `useNearViewport`'s, deliberately.
// `near: true` fails OPEN because a preview that never mounts is a dead feature;
// a window that falls open to the whole matrix would make every bounded-node-count
// assertion vacuous — the measurement would pass at 2,000 rows and at 12, and
// nothing in jsdom could tell them apart. Failing to a bounded window makes the
// bound observable in the environment the tests actually run in.
//
// ⚠️ ROW HEIGHT IS AN ESTIMATE, NOT A MEASUREMENT, and the window is therefore
// approximate in a real browser: a group-band row is taller than a plain one, and
// a cell with outputs is taller than an empty one. `DEFAULT_OVERSCAN` rows above
// and below absorb that error. Nothing in this repo can verify the resulting
// scroll feel — that needs a human in a real browser.

/**
 * Assumed height of one rendered config row, in px: the cell's `minHeight: 110`
 * plus its 8px padding top and bottom, plus a 1px top border.
 *
 * Deliberately NOT a round number and NOT a power of two, so a mutant that
 * substitutes a different plausible constant changes the arithmetic visibly.
 */
export const ROW_H_ESTIMATE = 127;

/**
 * Rows rendered beyond each edge of the visible band. Small enough that the node
 * count stays bounded, large enough to cover the row-height estimate's error and
 * a fast scroll between two `scroll` events.
 */
export const DEFAULT_OVERSCAN = 3;

/**
 * Viewport height assumed when the real one is unreadable (`0`, negative or
 * non-finite — i.e. jsdom, or a pre-layout first render).
 *
 * 🔴 IT IS NOT THE SAME NUMBER ANY TEST FIXTURE PASSES. A fallback equal to a
 * fixture's explicit viewport would make the fallback branch indistinguishable
 * from the measured one, so a mutant that ignored the caller's viewport entirely
 * would survive. 1200 against fixtures that pass 1000 keeps the two apart.
 */
export const FALLBACK_VIEWPORT_H = 1200;

export interface RowWindowInput {
  /** Total rows in the matrix (ALL configs, not the window). */
  rowCount: number;
  /** Assumed px height of one row. Non-positive/non-finite ⇒ `ROW_H_ESTIMATE`. */
  rowHeight: number;
  /** Visible px height. Non-positive/non-finite ⇒ `FALLBACK_VIEWPORT_H`. */
  viewportHeight: number;
  /** Px of body scrolled past the top of the row band. Negative ⇒ clamped to 0. */
  scrollTop: number;
  /** Extra rows rendered each side. Non-positive/non-finite ⇒ 0. */
  overscan: number;
}

export interface RowWindow {
  /** First row index to mount, inclusive. */
  start: number;
  /** Last row index to mount, EXCLUSIVE (so `end - start` is the mounted count). */
  end: number;
  /** Px spacer above the mounted rows, standing in for rows `[0, start)`. */
  padTop: number;
  /** Px spacer below the mounted rows, standing in for rows `[end, rowCount)`. */
  padBottom: number;
}

/** The window is unchanged when both edges are — used to suppress re-renders. */
export function sameWindow(a: RowWindow, b: RowWindow): boolean {
  return a.start === b.start && a.end === b.end && a.padTop === b.padTop && a.padBottom === b.padBottom;
}

/**
 * Which rows to mount for a given scroll position.
 *
 * The contract, in full:
 *  - `0 <= start <= end <= rowCount` ALWAYS, for every input including a
 *    `scrollTop` far past the end of the matrix.
 *  - `padTop + (end - start) * rowHeight + padBottom === rowCount * rowHeight`,
 *    so the scroll extent does not change as the window moves.
 *  - `rowCount <= 0` ⇒ the empty window `{0,0,0,0}` and nothing mounted.
 *
 * 🔴 THE `Math.min(count - 1, …)` CLAMP ON `firstVisible` IS LOAD-BEARING, not
 * defensive decoration. Without it, scrolling past the bottom of the matrix (a
 * `scrollTop` larger than `rowCount * rowHeight`, which the document reaches
 * whenever the grid is not the last thing on the page) yields `start > end`: the
 * slice comes back EMPTY, so the matrix blanks itself at the one scroll position
 * where the viewer is looking at its last rows. `padTop` also exceeds the whole
 * grid's height, which in a real browser is a page that keeps growing as you
 * scroll. `virtualRows.test.ts` pins this case with literal values.
 */
export function rowWindow(input: RowWindowInput): RowWindow {
  const count = Number.isFinite(input.rowCount) && input.rowCount > 0 ? Math.floor(input.rowCount) : 0;
  if (count === 0) return { start: 0, end: 0, padTop: 0, padBottom: 0 };

  const h =
    Number.isFinite(input.rowHeight) && input.rowHeight > 0 ? input.rowHeight : ROW_H_ESTIMATE;
  const vh =
    Number.isFinite(input.viewportHeight) && input.viewportHeight > 0
      ? input.viewportHeight
      : FALLBACK_VIEWPORT_H;
  const over =
    Number.isFinite(input.overscan) && input.overscan > 0 ? Math.floor(input.overscan) : 0;
  const top = Number.isFinite(input.scrollTop) && input.scrollTop > 0 ? input.scrollTop : 0;

  // The clamp documented above: a scroll position past the end of the matrix must
  // still name a real row, or `start` overshoots `end` and the slice is empty.
  const firstVisible = Math.min(count - 1, Math.floor(top / h));
  // `+ 1` because a row is almost never aligned to the viewport's top edge, so a
  // band `vh` tall straddles one more row than it is strictly tall enough for.
  const visibleCount = Math.ceil(vh / h) + 1;

  const start = Math.max(0, firstVisible - over);
  const end = Math.min(count, firstVisible + visibleCount + over);
  return { start, end, padTop: start * h, padBottom: (count - end) * h };
}
