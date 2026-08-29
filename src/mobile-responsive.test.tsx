// Task 420 — the narrow-viewport (mobile) layout.
//
// 🔴 WHAT THIS FILE CANNOT DO, STATED PLAINLY: jsdom performs NO LAYOUT. Every
// box in it is 0x0 — `scrollWidth`, `clientWidth` and `getBoundingClientRect()`
// all return 0 — so NOTHING here can observe the horizontal overflow this task
// exists to fix, and no assertion below should be read as covering it. The real
// verification is a LIVE BROWSER MEASUREMENT (headless Chromium driving
// `npm run dev:harness` at a 380px viewport); its numbers are reported on the
// PR, not asserted here. For the record, measured there:
//
//     Grid view, document scrollWidth : 596 → 380   (viewport 380, so 380 = fixed)
//     Combinations view               : 395 → 380   (a pre-existing tooltip overflow)
//     view-switch tab height          :  30 → 44    at 380px, and still 30 at 1709px
//     results-grid scroller           : clientWidth 350, scrollWidth 580, scrollable
//     grid cells / col hdrs / row hdrs: 8 / 2 / 4 — IDENTICAL at 380px and 1709px
//
// What jsdom CAN settle, and what this file therefore pins:
//
//   1. THE CASCADE. jsdom does resolve stylesheet rules through
//      `getComputedStyle`, so the compact stylesheet's tap-target rule is
//      asserted on the REAL rendered tab and vote controls — not on the CSS
//      string. Each selector is separately proven to match live nodes, so a
//      pack rename that silently orphans the rule fails here instead of
//      shipping 30px buttons.
//   2. THE STRUCTURE. Every grid cell and header renders INSIDE the
//      `overflow-x: auto` container, and the cell count is identical on both
//      viewports — "degrade by scrolling, never by deleting".
//   3. THE SEAM. All of it is driven through `useIsMobile()`, so the desktop
//      arm is what proves the compact layout is genuinely conditional.
//
// RED/GREEN, MEASURED — not asserted from the armchair. With this file and
// `src/compact.ts` (a constants-only module with no behaviour of its own)
// restored onto base 180901a, and App.tsx / theme.ts / ResultsGrid.tsx at base:
//
//     Tests  9 failed | 7 passed (16)   at 180901a
//     Tests  16 passed (16)             at HEAD
//
// 🔴 RE-MEASURED at each round, and that is the point of writing it down. The
// audit rounds added cases (12 -> 15 -> 16), and a matrix left at its round-1
// numbers (`7 failed | 5 passed (12)`) silently stopped describing this file:
// anyone re-running the stated experiment gets a different denominator and
// cannot tell whether the file drifted or the original measurement was wrong.
// If you add a case here, re-run the base arm and update these two lines.
//
// The 9 that go red are the regression coverage: the two seam/cascade cases,
// the four >=44px tap-target cases (tabs, vote, run-cell, slider), the two
// style-contract cases and the 44px literal pin. The 7 that were already green
// at base are NOT regression coverage and are labelled
// where they sit — the two INVARIANT GUARDs on the grid's structure, the #16
// no-maxWidth guard, and the two DESKTOP cases, which are green at base for the
// good reason that they assert the compact layout is ABSENT. Their job is to be
// the negative control for the mobile arm: if they ever go red, "compact"
// became unconditional and the seam stopped deciding anything.

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Harness } from '@civitai/blocks-react/testing';
import type { SharedListItem } from '@civitai/blocks-react';

import { App } from './App.js';
import { COMPACT_ATTR, MIN_TAP_TARGET_PX, compactTapTargetCss } from './compact.js';
import { contentStyle, pageStyle, palette } from './theme.js';
import { fakeAppStorage, fakeShared, immediateSleep } from './test-helpers.js';
import { setViewport } from './test-setup.js';

// ---------------------------------------------------------------------------
// Fixture: one combination carrying TWO configs × two prompts = 4 grid cells.
// Vote counts are non-zero so both land inside the default top-N.
// ---------------------------------------------------------------------------

const row = (key: string, count: number, title: string, data: unknown): SharedListItem =>
  ({
    key,
    count,
    authorUserId: 7,
    value: { title, body: '', data },
    viewerVoted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  }) as unknown as SharedListItem;

const SEED: SharedListItem[] = [
  row('c1', 5, 'SDXL Combo', {
    v: 2,
    kind: 'combination',
    configs: [
      {
        id: 'cfgA',
        label: 'base',
        checkpoint: { versionId: 1001, modelId: 500, baseModel: 'SDXL 1.0', modelName: 'JuggernautXL' },
        loras: [],
      },
      {
        id: 'cfgB',
        label: 'detail',
        checkpoint: { versionId: 1001, modelId: 500, baseModel: 'SDXL 1.0', modelName: 'JuggernautXL' },
        loras: [{ versionId: 2002, weight: 0.8 }],
      },
    ],
  }),
  row('p1', 9, 'Portrait', { v: 3, kind: 'prompt', default: { prompt: 'x', params: {} } }),
  row('p2', 8, 'Landscape', { v: 3, kind: 'prompt', default: { prompt: 'y', params: {} } }),
];

/** The number of cells the fixture must produce: 2 configs × 2 prompts. */
const EXPECTED_CELLS = 4;

function renderApp() {
  const { shared } = fakeShared({ seed: SEED });
  render(
    <Harness
      viewer={{ id: 99, username: 'me' }}
      theme="dark"
      consentGranted
      buzzBudget={1000}
      buzzBalance={{ blue: 0, green: 0, yellow: 5000 }}
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

/**
 * The view-switch controls expose `role="tab"`, NOT `role="button"` — asking for
 * "button" here fails with "unable to find an accessible element", which reads
 * exactly like the app not rendering. It renders; the role differs.
 */
async function tabs() {
  const strip = await screen.findByTestId('view-switch');
  return within(strip).getAllByRole('tab');
}

/** Open the Grid view and wait for the matrix to mount. */
async function openGrid() {
  const t = await tabs();
  await userEvent.click(t[2]);
  return screen.findByTestId('results-grid');
}

/** `min-height` as a NUMBER of px, or 0 when nothing declares one. */
function minHeightPx(el: Element): number {
  const raw = getComputedStyle(el).minHeight;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------------------

describe('420 — narrow viewport: the compact layout is mounted through the seam', () => {
  it('stamps the compact attribute on the block root and mounts the stylesheet', async () => {
    setViewport('mobile');
    renderApp();
    await screen.findByTestId('view-switch');

    expect(document.querySelector(`[${COMPACT_ATTR}='true']`)).not.toBeNull();
    expect(screen.getByTestId('compact-styles')).toBeInTheDocument();
  });

  it('SELECTOR REACHABILITY: the compact rule actually matches the live tab and button nodes', async () => {
    // The whole tap-target fix is a stylesheet aimed at elements the pack owns.
    // A rule whose selector matches NOTHING would still parse, still be in the
    // document, and still let every "the CSS says 44px" assertion pass — so
    // pin that each selector resolves to real, rendered controls.
    setViewport('mobile');
    renderApp();
    await screen.findByTestId('view-switch');

    expect(
      document.querySelectorAll(`[${COMPACT_ATTR}='true'] [data-civitai-ui-segment]`),
    ).toHaveLength(3); // combos / prompts / grid
    expect(
      document.querySelectorAll(`[${COMPACT_ATTR}='true'] [data-civitai-ui='button']`).length,
    ).toBeGreaterThan(0);
  });

  it('gives every view-switch tab a computed min-height of at least 44px', async () => {
    setViewport('mobile');
    renderApp();
    const t = await tabs();
    expect(t).toHaveLength(3);
    for (const tab of t) {
      expect(minHeightPx(tab)).toBeGreaterThanOrEqual(MIN_TAP_TARGET_PX);
    }
  });

  it('gives the vote control a computed min-height of at least 44px', async () => {
    setViewport('mobile');
    renderApp();
    const vote = await screen.findByTestId('combo-vote');
    expect(minHeightPx(vote)).toBeGreaterThanOrEqual(MIN_TAP_TARGET_PX);
  });

  it("gives the grid's run-cell action a computed min-height of at least 44px", async () => {
    setViewport('mobile');
    renderApp();
    await openGrid();
    const runs = await screen.findAllByTestId('run-cell');
    expect(runs.length).toBeGreaterThan(0);
    for (const b of runs) {
      expect(minHeightPx(b)).toBeGreaterThanOrEqual(MIN_TAP_TARGET_PX);
    }
  });
});

describe('420 — wide viewport: the desktop rendering is untouched', () => {
  it('mounts no compact stylesheet and leaves the root unstamped', async () => {
    setViewport('desktop');
    renderApp();
    await screen.findByTestId('view-switch');

    expect(document.querySelector(`[${COMPACT_ATTR}='true']`)).toBeNull();
    expect(screen.queryByTestId('compact-styles')).toBeNull();
  });

  it('leaves the tab controls on the pack’s own sizing (no tap-target override)', async () => {
    // The mirror of the mobile case, and the reason the mobile one is not
    // vacuous: if this ever also reported >=44px, the "compact" layout would be
    // unconditional and the seam would be doing nothing.
    setViewport('desktop');
    renderApp();
    const t = await tabs();
    for (const tab of t) {
      expect(minHeightPx(tab)).toBeLessThan(MIN_TAP_TARGET_PX);
    }
  });
});

describe('420 — the grid degrades by SCROLLING, never by deletion', () => {
  it('INVARIANT GUARD (passes at base too): every cell and header renders inside the overflow-x container', async () => {
    setViewport('mobile');
    renderApp();
    const scroller = await openGrid();

    // The scroll boundary itself.
    expect(scroller.style.overflowX).toBe('auto');

    // …and everything the matrix draws is INSIDE it, so "off screen" always
    // means "scroll this container", never "gone".
    const cells = await screen.findAllByTestId('grid-cell');
    expect(cells).toHaveLength(EXPECTED_CELLS);
    for (const el of [
      ...cells,
      ...screen.getAllByTestId('grid-col-header'),
      ...screen.getAllByTestId('grid-row-header'),
    ]) {
      expect(scroller.contains(el)).toBe(true);
    }
  });

  it('INVARIANT GUARD (passes at base too): the narrow viewport renders the SAME cell set as the wide one', async () => {
    // Pins "no column is dropped on mobile" as an identity, not a count: the
    // cells' own (combo, config, prompt) identities must match across
    // viewports, so a fix that silently swapped or reordered cells fails.
    const idsAt = async (kind: 'mobile' | 'desktop') => {
      setViewport(kind);
      renderApp();
      await openGrid();
      await waitFor(() => expect(screen.getAllByTestId('grid-cell')).toHaveLength(EXPECTED_CELLS));
      const headers = screen
        .getAllByTestId('grid-row-header')
        .map((h) => `${h.getAttribute('data-combo-key')}/${h.getAttribute('data-config-id')}`);
      const cols = screen.getAllByTestId('grid-col-header').map((h) => h.textContent);
      return { headers, cols, cells: screen.getAllByTestId('grid-cell').length };
    };

    const mobile = await idsAt('mobile');
    cleanup(); // tear the first tree down so the second render is measured alone
    const desktop = await idsAt('desktop');

    expect(mobile.headers).toEqual(desktop.headers);
    expect(mobile.cols).toEqual(desktop.cols);
    expect(mobile.cells).toBe(desktop.cells);
    expect(mobile.headers.length).toBeGreaterThan(0);
  });
});

describe('420 — the overflow-containment style contract', () => {
  // These are the declarations that make the wide matrix scroll inside its own
  // container instead of widening the document. jsdom cannot show the effect
  // (no layout), so it pins the CAUSE; the effect is the live measurement in
  // the file header.
  it('contentStyle opts out of the flex/grid content-based minimum on both axes of the blowout', () => {
    expect(contentStyle.minWidth).toBe(0);
    expect(contentStyle.gridTemplateColumns).toBe('minmax(0, 1fr)');
  });

  it('contentStyle keeps the uncapped full-width behaviour landed in #16', () => {
    expect(contentStyle.maxWidth).toBeUndefined();
    expect(contentStyle.width).toBe('100%');
  });

  it('pageStyle clips horizontal overflow with `clip`, never `hidden`', () => {
    // 🔴 CORRECTED after the round-1 audit MEASURED the old rationale false.
    // This used to say `hidden` "would swallow the matrix's sticky headers".
    // It would not: sticky resolves against the `results-grid` scroller, not
    // the root, and the row header pins identically under clip / hidden /
    // visible (measured live, rowHeaderX 15 vs gridX 14 in all three).
    // The REAL reason, also measured, is the other half: `hidden` coerces the
    // root's computed overflow-y from `visible` to `auto`, making the root a
    // scroll container and letting a programmatic scroll reach content the
    // viewer cannot see. `clip` only clips and leaves overflow-y visible.
    expect(pageStyle(palette()).overflowX).toBe('clip');
  });

  it('the scroller and its parent opt out of the content-based minimum too', () => {
    // 🔴 Added after the round-1 audit MEASURED these two declarations to have
    // ZERO coverage: deleting `minWidth`/`maxWidth` from the results-grid
    // scroller AND `minWidth` from the grid-view Stack left the whole suite
    // green (185/185), plus typecheck and build. Three levels have to opt out —
    // contentStyle (above), the Stack, and the scroller — and only the first
    // was pinned.
    setViewport('mobile');
    renderApp();
    return openGrid().then(() => {
      const scroller = document.querySelector('[data-testid="results-grid"]') as HTMLElement;
      expect(scroller).not.toBeNull();
      expect(scroller.style.minWidth).toBe('0');
      expect(scroller.style.maxWidth).toBe('100%');
      const stack = document.querySelector('[data-testid="grid-view"]') as HTMLElement;
      expect(stack).not.toBeNull();
      expect(stack.style.minWidth).toBe('0');
    });
  });
});

describe('420 — the 44px figure itself', () => {
  // 🔴 Added after the round-1 audit MEASURED the tap-target cases blind to a
  // wrong threshold: the CSS input and the assertion bound were the SAME
  // symbol, so mutating MIN_TAP_TARGET_PX 44 -> 24 left all 12 cases green.
  // A constant that defines its own passing bar cannot be checked by the cases
  // that consume it — so pin the literal here, once.
  it('is 44 — the WCAG 2.5.5 / iOS HIG figure, not whatever the constant says', () => {
    expect(MIN_TAP_TARGET_PX).toBe(44);
  });

  it('the emitted stylesheet carries the literal 44px', () => {
    // A TEXT pin is right for the FIGURE — it is what the rule emits, and the
    // point is that it cannot drift with the constant.
    expect(compactTapTargetCss()).toContain('min-height: 44px');
  });

  it('SELECTOR REACHABILITY: the slider rule matches the live range control', async () => {
    // 🔴 CORRECTED after the round-2 audit: this used to pin
    // `[data-civitai-ui-range]` as a SUBSTRING, justified as "text because jsdom
    // does no layout". That is a non-reason — the reachability case above proves
    // selectors against the live DOM with querySelectorAll, which needs no
    // layout — and it left the exact hole that case exists to close: a pack
    // rename orphans the rule while the substring stays green.
    // The slider is 6px tall from the pack and only renders in the Grid view.
    setViewport('mobile');
    renderApp();
    await openGrid();

    const ranges = document.querySelectorAll(
      `[${COMPACT_ATTR}='true'] [data-civitai-ui-range]`,
    );
    expect(ranges.length).toBeGreaterThan(0);
    for (const r of ranges) {
      expect(minHeightPx(r)).toBeGreaterThanOrEqual(MIN_TAP_TARGET_PX);
    }
  });
});
