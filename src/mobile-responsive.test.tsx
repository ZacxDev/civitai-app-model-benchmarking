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
//     segmented-control tab height    :  30 → 44    at 380px, and still 30 at 1709px
//       (measured on the then-live `view-switch` strip, which the IA refactor
//        deleted; the rule and the numbers belong to the sub-tab segments now)
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
// UPDATE (the compact-tooltip rule, 4 cases added — 16 -> 20). Measured the
// same way, with `src/compact.ts` restored to 55f9825 and this file at HEAD:
//
//     Tests  3 failed | 17 passed (20)  at 55f9825
//     Tests  20 passed (20)             at HEAD
//
// The 3 that go red are the tooltip rule's regression coverage (the verbatim
// rule, the @supports guard, the gutter/gap literals). The 4th tooltip case is
// GREEN AT BASE and labelled INVARIANT GUARD where it sits — the pack renders
// those attributes regardless of our rule, so it guards a pack rename, not this
// fix.
//
// UPDATE 2 (audit round 1: the mounted-stylesheet case, 20 -> 21). Red under the
// mutant it exists for — mounting `compactTapTargetCss().split('@supports')[0]`,
// which had SURVIVED a full green suite:
//
//     Tests  1 failed | 233 passed (234)  under that mutant, suite-wide
//     Tests  21 passed (21)               at HEAD
//
// UPDATE 3 (audit round 2: no cases added — 21). Two EXISTING cases changed:
// the verbatim pin took `position-anchor` into the @supports condition, and the
// used-feature guard stopped iterating a hardcoded list. Red arm with
// `src/compact.ts` restored to 7899a97 (which lacks `position-anchor` in the
// condition), this file at HEAD:
//
//     Tests  2 failed | 19 passed (21)    at 7899a97
//     Tests  21 passed (21)               at HEAD
//
// UPDATE 4 (audit round 3: no cases added — still 21). The used-feature guard
// was rewritten again; its RED arm is not a code revert but four mutants, each
// measured against BOTH guards. 🔴 The old guard was BLIND to the first three
// and WRONG about the fourth:
//
//                                        old guard        new guard
//   (anchor-name: 12px), pin updated     21/21 GREEN      RED
//   max-width: anchor-size(width)        21/21 GREEN      RED
//   position-area, no trailing `;`       21/21 GREEN      RED
//   `and` -> `or`, pin updated           21/21 GREEN      RED
//   --mb-gap: 6px  (must NOT be flagged) 1 failed | 20    21/21 GREEN
//
// The first is the worst of them: an invalid VALUE anywhere in the condition
// makes @supports false on every engine, so the tooltip rule silently never
// applies and the clipping this PR exists to fix returns everywhere — with
// nothing red. The old guard asserted the property NAME appeared in the
// condition, never the clause, so it could not see it.
//
// 🔴 RE-MEASURED at each round, and that is the point of writing it down. The
// audit rounds added cases (12 -> 15 -> 16), and a matrix left at its round-1
// numbers (`7 failed | 5 passed (12)`) silently stopped describing this file:
// anyone re-running the stated experiment gets a different denominator and
// cannot tell whether the file drifted or the original measurement was wrong.
// If you add a case here, re-run the base arm and update these two lines.
//
// The 8 that go red are the regression coverage: the two seam/cascade cases,
// the three >=44px tap-target cases (tabs, vote, run-cell — the SLIDER case went
// with the slider 527 deleted), the two style-contract cases and the 44px
// literal pin. The 7 that were already green
// at base are NOT regression coverage and are labelled
// where they sit — the two INVARIANT GUARDs on the grid's structure, the #16
// no-maxWidth guard, and the two DESKTOP cases, which are green at base for the
// good reason that they assert the compact layout is ABSENT. Their job is to be
// the negative control for the mobile arm: if they ever go red, "compact"
// became unconditional and the seam stopped deciding anything.

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Harness } from './test-harness.js';
import type { SharedItem } from '@civitai/sdk';

import { App } from './App.js';
import {
  COMPACT_ATTR,
  ICON_BUTTON_SELECTOR,
  LAYOUT_ATTR,
  MENU_ITEM_SELECTOR,
  MIN_TAP_TARGET_PX,
  MOBILE_BREAKPOINT_PX,
  NAV_COMPACT_INSET_PX,
  NAV_ITEM_SELECTOR,
  TOOLTIP_GAP_PX,
  TOOLTIP_GUTTER_PX,
  compactTapTargetCss,
  layoutCss,
} from './compact.js';
import { NAV_BASE_INSET_PX } from './components/SideNav.js';
import { contentStyle, pageStyle, palette } from './theme.js';
import {
  contribute,
  fakeAppStorage,
  fakeShared,
  immediateSleep,
  openMyList,
  openRowMenu,
  openView,
} from './test-helpers.js';
import { setViewport } from './test-setup.js';

// ---------------------------------------------------------------------------
// Fixture: one combination carrying TWO configs × two prompts = 4 grid cells.
// Vote counts are non-zero so both land inside the default top-N.
// ---------------------------------------------------------------------------

const row = (key: string, count: number, title: string, data: unknown): SharedItem =>
  ({
    key,
    count,
    authorUserId: 7,
    value: { title, body: '', data },
    viewerVoted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  }) as unknown as SharedItem;

const SEED: SharedItem[] = [
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
 * Every `role="tab"` segment on the page.
 *
 * 🔴 WHICH CONTROLS THOSE ARE HAS MOVED TWICE, and the rule has not moved at all. The
 * compact stylesheet's tap-target rule is aimed at `[data-civitai-ui-segment]`, which
 * the pack's `SegmentedControl` emits. Generation 1: a three-tab top-level
 * `view-switch` strip PLUS two My/Community sub-tab strips. Generation 2: the strip was
 * deleted, leaving the four sub-tab segments. Generation 3, here: the sub-tab strips
 * are deleted too — "my work" is a sidebar destination — and the only segments left
 * are the BOARD subnav's three. The ledger below is a literal so each move is a
 * decision someone takes rather than a drift.
 *
 * (Segments expose `role="tab"`, NOT `role="button"` — asking for "button" here
 * fails with "unable to find an accessible element", which reads exactly like the
 * app not rendering. It renders; the role differs.)
 */
async function tabs() {
  await screen.findByTestId('board-nav');
  return screen.getAllByRole('tab');
}

/** Wait for the matrix to mount. The grids section is always rendered now — there
 * is no view to open. */
async function openGrid() {
  await screen.findByTestId('section-open-grid');
  return screen.findByTestId('results-grid');
}

/** `min-height` as a NUMBER of px, or 0 when nothing declares one. */
function minHeightPx(el: Element): number {
  const raw = getComputedStyle(el).minHeight;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

/**
 * `min-width` as a NUMBER of px, or 0 when nothing declares one.
 *
 * 🔴 THE SIBLING OF `minHeightPx`, AND READ THE SAME WAY FOR THE SAME REASON: what this
 * observes is the CASCADE (which declaration wins for this element), never the geometry.
 * jsdom resolves no layout, so `getBoundingClientRect().width` is 0 here whatever the
 * sheet says.
 *
 * ⚠️ MEASURED BEFORE BEING TRUSTED, because a longhand's CSSOM behaviour is not
 * something to assume: jsdom 25.0.1 SYNTHESISES the `padding` shorthand out of four
 * longhands, so a draft guard elsewhere in this stack asserted an empty shorthand and
 * could never have discriminated its bug. `min-width` has no shorthand and reads back as
 * a plain `'44px'` from a document stylesheet — confirmed by the negative control in the
 * WIDE-viewport case below, which reads 0 from the same helper on the same element.
 */
function minWidthPx(el: Element): number {
  const raw = getComputedStyle(el).minWidth;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------------------

describe('420 — narrow viewport: the compact layout is mounted through the seam', () => {
  it('stamps the compact attribute on the block root and mounts the stylesheet', async () => {
    setViewport('mobile');
    renderApp();
    await screen.findByTestId('section-open-grid');

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
    await screen.findByTestId('board-nav');

    // 3 segments: the BOARD subnav's Grids / Matchups / Prompts. It was 5 while a
    // 3-tab `view-switch` strip sat above a single mounted view, then 4 when the IA
    // refactor deleted the strip and mounted both My/Community sub-tab strips
    // together, and it is 3 now that those strips are deleted and "my work" is a
    // sidebar destination. A literal rather than a `>= 3`: this is the reachability
    // ledger, so a segment appearing or disappearing should be a decision someone
    // takes on purpose.
    expect(
      document.querySelectorAll(`[${COMPACT_ATTR}='true'] [data-civitai-ui-segment]`),
    ).toHaveLength(3);
    expect(
      document.querySelectorAll(`[${COMPACT_ATTR}='true'] [data-civitai-ui='button']`).length,
    ).toBeGreaterThan(0);
  });

  it('gives every board-subnav segment a computed min-height of at least 44px', async () => {
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
    // The vote control under test is the MATCHUP one, so scope to its section.
    await openView('Matchups');
    const vote = await screen.findByTestId('matchup-vote');
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
    await screen.findByTestId('section-open-grid');

    expect(document.querySelector(`[${COMPACT_ATTR}='true']`)).toBeNull();
    expect(screen.queryByTestId('compact-styles')).toBeNull();
    // 🔴 THE LAYOUT SHEET IS UNCONDITIONAL, and asserting it HERE is what stops the
    // two being confused: the compact sheet is the narrow override, the layout sheet
    // carries the wide case and must be present on BOTH viewports.
    expect(screen.getByTestId('layout-styles')).toBeInTheDocument();
  });

  it('leaves the segment controls on the pack’s own sizing (no tap-target override)', async () => {
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

  // 🔴 THE NEGATIVE CONTROL FOR `minWidthPx`, AND IT IS DOING TWO JOBS. (1) It is the
  // mirror of the ⋮ reachability case: if the width floor also applied on a wide
  // viewport, that case would be green whether or not the compact seam decided anything.
  // (2) It VALIDATES THE HELPER — a `getComputedStyle().minWidth` that always returned
  // `'44px'`, or always `''`, would satisfy the mobile assertion for the wrong reason.
  // Reading 0 off the SAME element through the SAME helper is what proves the number
  // moves with the sheet. jsdom's CSSOM was measured rather than assumed here, because a
  // longhand's read-back behaviour is not safe to assume: in this same jsdom (25.0.1) the
  // `padding` SHORTHAND is synthesised from its longhands, which falsified a draft guard
  // elsewhere in this stack that asserted the shorthand was empty.
  it('leaves the ⋮ trigger with NO width floor (negative control for minWidthPx)', async () => {
    setViewport('desktop');
    renderApp();
    const matchups = await openView('Matchups');
    const trigger = await within(matchups).findByTestId('matchup-menu');
    expect(minWidthPx(trigger)).toBe(0);
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

  // 🔴 RESTORED. 527 deleted this case, and dropped `[data-civitai-ui-range]`
  // from the rule in `compact.ts`, on the stated ground that "527 removes the
  // app's only `Slider`, so its premise (`ranges.length > 0`) is unsatisfiable by
  // construction". THAT WAS FALSE, and it cost a real regression: 527 removed the
  // per-viewer "Show top N" slider, but `MatchupForm` still renders one `<Slider>`
  // per LoRA (the weight control), and the pack's `Slider` still emits
  // `data-civitai-ui-range`. So the selector matched a live node the whole time,
  // and dropping it silently returned every LoRA weight slider to the pack's 6px
  // height on a phone.
  //
  // The premise moved, so the ROUTE moved with it: the range no longer lives on
  // the Grid view, it lives inside the Matchup edit form. That is a fixture
  // change, not a reason to delete a guard — and this case is exactly the one
  // whose job is to fail when a selector stops reaching anything.
  it('SELECTOR REACHABILITY: the slider rule matches the live range control', async () => {
    setViewport('mobile');
    // A LOCAL seed, so the shared SEED (authorUserId 7, deliberately NOT the
    // viewer) keeps serving every other case in this file unchanged. Here the
    // viewer OWNS the row, because the LoRA slider is only reachable through the
    // author-scoped Edit affordance.
    const owned: SharedItem[] = [
      {
        key: 'c-owned',
        count: 3,
        authorUserId: 99, // === the Harness viewer below; Edit is author-scoped
        value: {
          title: 'Owned Combo',
          body: '',
          data: {
            v: 2,
            kind: 'combination', // 🔴 wire value, never renamed
            configs: [
              {
                id: 'cfgOwned',
                label: 'weighted',
                checkpoint: {
                  versionId: 1001,
                  modelId: 500,
                  baseModel: 'SDXL 1.0',
                  modelName: 'JuggernautXL',
                },
                // The LoRA is the whole point: MatchupForm renders one Slider per
                // LoRA, so an empty stack would render NO range and this case
                // would pass vacuously.
                loras: [{ versionId: 2002, weight: 0.8, minStrength: 0, maxStrength: 1.5 }],
              },
            ],
          },
        },
        viewerVoted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as SharedItem,
    ];
    const { shared } = fakeShared({ seed: owned });
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

    // The LoRA slider is only reachable through the author-scoped Edit affordance, and
    // the viewer's own rows are a sidebar destination now rather than a sub-tab.
    await openMyList('matchup');
    // The Edit affordance is a ⋮ menu item now (the third IA pass), so the route to
    // the LoRA weight slider grew one click. The premise of this case is unchanged.
    const menu = await openRowMenu('matchup');
    await userEvent.click(within(menu).getByTestId('matchup-edit'));

    const ranges = document.querySelectorAll(
      `[${COMPACT_ATTR}='true'] [data-civitai-ui-range]`,
    );
    // POSITIVE CONTROL for the query itself: if this is 0 the case proves
    // nothing, and would pass vacuously on an `every()` over an empty list.
    expect(ranges.length, 'the range selector reached no live node').toBeGreaterThan(0);
    for (const r of ranges) {
      expect(minHeightPx(r)).toBeGreaterThanOrEqual(MIN_TAP_TARGET_PX);
    }
  });

  // 🔴 THE ONE TAP TARGET THIS APP BUILDS ITSELF, and it shipped under the floor.
  // The other three selectors in the rule all reach PACK-rendered controls, which
  // is exactly how this was missed: `GridPicker` is hand-built (the pack ships no
  // MultiSelect), so its option rows are plain `<div role="option">` carrying
  // `padding: 10px 12px` around a 14px line — about 37px, against the 44 every
  // other control in the same rule is held to, and they are the primary hit
  // target of the whole grid-builder flow on a phone.
  //
  // The selector is the ROLE, not a testid: it pins the STATE (this element is an
  // option in a listbox) rather than a word a future component could spell
  // differently, and it covers any second listbox this app grows.
  //
  // ⚠ jsdom does NO layout, so this asserts the CASCADE — the computed
  // `min-height` on the real rendered rows — and never the geometry. And the
  // ~37px above is arithmetic over THIS APP'S OWN box, not the pack's:
  // `GridPicker.tsx`'s `optionStyle` sets `padding: '10px 12px'` on a hand-built
  // `<div role="option">`. The pack emits no `role="option"` anywhere — which is
  // exactly why the rule's three pack-facing selectors could not reach this row.
  it('SELECTOR REACHABILITY: the option rule matches the live grid-picker rows', async () => {
    setViewport('mobile');
    renderApp();
    await screen.findByTestId('grid-view');

    // Grids is the default view (§11.5), so the builder is two clicks away —
    // through the Contribute menu since `grid-new` was removed from that surface.
    await contribute('grid');
    await screen.findByTestId('grid-form');
    await userEvent.click(screen.getByTestId('grid-form-pick-rows'));
    await screen.findByTestId('grid-pick-rows');

    const options = document.querySelectorAll(`[${COMPACT_ATTR}='true'] [role='option']`);
    // POSITIVE CONTROL for the query itself: at 0 the loop below is empty and the
    // case passes vacuously, which is the failure mode this whole family of
    // reachability cases exists to prevent.
    expect(options.length, 'the option selector reached no live node').toBeGreaterThan(0);
    for (const o of options) {
      expect(minHeightPx(o)).toBeGreaterThanOrEqual(MIN_TAP_TARGET_PX);
    }
  });

  // 🔴 THE THIRD TAP TARGET THIS APP BUILDS ITSELF, AND IT ALSO SHIPS UNDER THE
  // FLOOR — the same defect a third time, one surface later.
  //
  // ⚠️ WHAT THIS PAIR OF CASES USED TO BE ABOUT: `ContributeMenu`'s three
  // `<button role="menuitem">` items, `padding: 8px 10px` around a 13px line, ~34px.
  // MEASURED at that change's base, computed `min-height` on the three live items was
  // **0** — red before the selector existed, green after. That component is DELETED
  // (the sidebar replaced it), and `[role='menuitem']` is out of the rule because
  // nothing in this app or the pack emits that role any more. The SUBJECT moved to
  // `SideNav`; the lesson did not move at all.
  //
  // `SideNav` is hand-built because this repo is pinned to `@civitai/components@0.4.1`,
  // which ships no `<civitai-nav-item>` (the upstream element is real, at 0.8.1 — see
  // `SideNav.tsx` for the five-package bump that gates the swap). Its items are plain
  // `<button>`s carrying `padding: 6px 10px` around a 13px line — ~31px, and this nav
  // is the page's ONLY primary navigation.
  //
  // 🔴 AND THE SELECTOR IS *NOT* SWAP-PROOF, unlike the two roles above it. That is
  // the one thing this pair has to say that its predecessor did not. `[role='option']`
  // and the departed `[role='menuitem']` pin a STATE the upstream elements also set, so
  // they survive an element swap. A nav item has no such role — it is a `<button>`
  // inside a `role="list"` — so the rule targets `[data-mb-nav-item]`, an attribute
  // THIS APP puts on its own buttons and which `<civitai-nav-item>` will not carry.
  // Upstream's own padding is ~32px, also under the floor, so the swap does NOT retire
  // this rule: it orphans the selector while leaving the need. This case is the only
  // thing that turns that into a failure instead of 31px nav items.
  //
  // ⚠ jsdom does NO layout, so this asserts the CASCADE (computed `min-height` on the
  // real rendered items), never the geometry — same ceiling as every case here.
  it('SELECTOR REACHABILITY: the nav-item rule matches the live SideNav items', async () => {
    setViewport('mobile');
    renderApp();
    await screen.findByTestId('side-nav');

    // The three My Benchmarks sub-items only exist while the group is expanded.
    // ⚠️ IT USED TO TAKE A CLICK HERE, AND THAT CLICK IS NOW THE BUG. The group opens
    // by DEFAULT (operator feedback #1), so the press that used to expand it would
    // now COLLAPSE it and the five nodes the ledger below counts would be two. The
    // expanded state is still part of the reachability claim; it is simply the state
    // the nav arrives in, and it is asserted rather than assumed.
    expect(screen.getByTestId('nav-my')).toHaveAttribute('aria-expanded', 'true');
    await screen.findByTestId('nav-my-group');

    const items = document.querySelectorAll(`[${COMPACT_ATTR}='true'] ${NAV_ITEM_SELECTOR}`);
    // POSITIVE CONTROL for the query itself: at 0 the loop below is empty and the case
    // passes vacuously — the failure mode this whole family exists to prevent. A
    // literal 5 rather than `> 0`, because the nav's item count is a ledgered decision
    // (`SIDE_NAV_ITEMS` in `SideNav.tsx` asserts the same set): Home, My Benchmarks,
    // and its three sub-items.
    expect(items, 'the nav-item selector reached no live node').toHaveLength(5);
    for (const i of items) {
      expect(minHeightPx(i)).toBeGreaterThanOrEqual(MIN_TAP_TARGET_PX);
    }
  });

  it('the emitted stylesheet floors the SideNav items with the IMPORTED constant', () => {
    // The rule TEXT, so a selector deleted from `compact.ts` fails even if some future
    // refactor of the case above stops expanding the group. Interpolated from the
    // constants, never a second `44px` literal and never a second spelling of the
    // attribute.
    expect(compactTapTargetCss()).toContain(`[${COMPACT_ATTR}='true'] ${NAV_ITEM_SELECTOR}`);
    expect(compactTapTargetCss()).toContain(`min-height: ${MIN_TAP_TARGET_PX}px`);
    // 🔴 RETARGETED, DELIBERATELY, AND SAY SO RATHER THAN DELETE IT. This line used
    // to be `expect(compactTapTargetCss()).not.toContain("[role='menuitem']")` — an
    // ORPHAN guard: `ContributeMenu` was deleted, nothing emitted that role any more,
    // and a rule left behind would have matched nothing while still satisfying every
    // "the CSS says 44px" assertion. The third IA pass added `components/Menu.tsx`, so
    // the role is emitted again and the selector is back in the sheet on purpose — the
    // old assertion is now asserting the opposite of what the code should do, and
    // keeping it would mean either reverting the tap floor or weakening the guard.
    //
    // 🔴 SO IT IS REPLACED BY THE SAME CLAIM IN THE LIVE DIRECTION, one case down:
    // `SELECTOR REACHABILITY: the menuitem rule matches the live ⋮ menu items` reads
    // the computed `min-height` off the real rendered items. That is strictly stronger
    // than a substring check on the sheet — an orphan is caught by the reachability
    // case going red at 0 matches, which the old `not.toContain` could never do while
    // a menu existed.
    //
    // ⚠️ AND NOTE WHY THE OLD ASSERTION WAS ALSO WALKABLE: it pinned a SPELLING.
    // `[role="menuitem"]` (double quotes) would have satisfied it with the selector
    // fully live in the rule. `MENU_ITEM_SELECTOR` in `compact.ts` is single-quoted to
    // match the sheet's other roles, and this case now interpolates the constant
    // instead of spelling anything.
    expect(compactTapTargetCss()).toContain(`[${COMPACT_ATTR}='true'] ${MENU_ITEM_SELECTOR}`);
  });

  // 🔴 THE FOURTH TAP TARGET THIS APP BUILDS ITSELF — the same defect a fourth time,
  // and this one is a RETURN rather than a new surface. `ContributeMenu`'s
  // `<button role="menuitem">` items were ~34px (`padding: 8px 10px` around a 13px
  // line) and MEASURED at 0 computed `min-height` before the selector existed.
  // `components/Menu.tsx` is a different component with the same box, so the same
  // arithmetic applies — which is why `compact.ts` got the selector back rather than a
  // new one invented for it.
  //
  // ⚠️ WHAT THIS CASE DOES NOT COVER, stated so nobody reads it as wider than it is:
  // the menu's two CONFIRM-FLOW controls (Remove, Report) are pack `Button`s hosted in
  // the panel, NOT menuitems, so this query cannot see them. They are floored by the
  // `[data-civitai-ui='button']` selector at the top of the same rule, which the vote
  // case a few describes up already exercises on a live node.
  //
  // ⚠ jsdom does NO layout, so this asserts the CASCADE (computed `min-height` on the
  // real rendered items), never the geometry — the same ceiling as every case here.
  it('SELECTOR REACHABILITY: the menuitem rule matches the live ⋮ menu items', async () => {
    setViewport('mobile');
    // 🔴 A LOCAL SEED AUTHORED BY THE VIEWER, and it is not optional. The shared
    // `SEED` is authored by id 7 while the Harness viewer is 99, so on the COMMUNITY
    // board the only menu entry is Report — a `MenuControl`, NOT a `role="menuitem"`
    // — and this query would find zero on a perfectly healthy tree. `Edit` is the
    // only single-press item, it is author-scoped, so an OWNED row is the one fixture
    // that can exercise this selector at all. (Same reason the slider case above
    // seeds its own owned row.)
    const owned: SharedItem[] = [
      {
        key: 'c-owned',
        count: 3,
        authorUserId: 99, // === the Harness viewer below; Edit is author-scoped
        value: {
          title: 'Owned Combo',
          body: '',
          data: {
            v: 2,
            kind: 'combination', // 🔴 wire value, never renamed
            configs: [
              {
                id: 'cfgOwned',
                checkpoint: {
                  versionId: 1001,
                  modelId: 500,
                  baseModel: 'SDXL 1.0',
                  modelName: 'JuggernautXL',
                },
                loras: [],
              },
            ],
          },
        },
        viewerVoted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as SharedItem,
    ];
    const { shared } = fakeShared({ seed: owned });
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

    await openView('Matchups');
    const card = await screen.findByTestId('matchup-card');
    const menu = await openRowMenu('matchup', card);

    const items = menu.querySelectorAll(MENU_ITEM_SELECTOR);
    // POSITIVE CONTROL for the query itself: at 0 the loop below is empty and the case
    // passes vacuously — the failure mode this whole family exists to prevent. A
    // literal 1 rather than `> 0`, because the item set is a decision (Edit is the only
    // single-press action on a row today; Remove and Report are confirm flows).
    expect(items, 'the menuitem selector reached no live node').toHaveLength(1);
    for (const i of items) {
      expect(minHeightPx(i)).toBeGreaterThanOrEqual(MIN_TAP_TARGET_PX);
    }
  });

  // -------------------------------------------------------------------------
  // 🔴 THE ⋮ TRIGGER — THE FIRST CONTROL WHOSE SHORT AXIS IS **WIDTH**
  // -------------------------------------------------------------------------
  //
  // 🔴 THE FLOOR WAS HEIGHT-ONLY, AND THAT HELD UNTIL THIS CONTROL EXISTED. Every
  // selector in `compactTapTargetCss`'s first rule reaches a TEXT-BEARING control — a
  // pack Button's label, a segment, a `role="option"` row, a nav item — and text carries
  // a box past 44px horizontally on its own. So `min-width` appeared NOWHERE in that
  // sheet as a tap-target declaration, and nothing noticed, because nothing needed it.
  // `components/Menu.tsx`'s trigger is a 14×14 `<svg>` with an `aria-label` and no text
  // at all, in a `size="sm"` pack Button: width is the short axis for the first time.
  //
  // 🔴 AND THE EXISTING REACHABILITY CASE DOES NOT COVER IT. That case measures
  // `minHeightPx` on the menu's ITEMS — the things inside the open panel — not on the
  // trigger that opens it. Two different elements, one of which had no width floor.
  //
  // ⚠️ WHAT THESE TWO CASES DO AND DO NOT CLAIM, and the distinction is the whole point
  // of this block. They assert (a) the declaration is in the emitted sheet, and (b) its
  // selector wins the CASCADE on the real rendered trigger. They assert NOTHING about
  // the tap target's actual size: jsdom performs no layout, `getBoundingClientRect()` is
  // all zeros, and no amount of CSSOM reading changes that. **A LIVE READING AT
  // ≤720px IS OWED FOR THIS CONTROL AND HAS NOT BEEN TAKEN.** It is recorded here, in
  // `ICON_BUTTON_SELECTOR`'s docblock and in the sheet's own comment, in all three
  // places, because a claim that only lives in one is a claim that gets summarised away.
  it('SELECTOR REACHABILITY: the icon-button rule matches the live ⋮ trigger', async () => {
    setViewport('mobile');
    renderApp();

    // The COMMUNITY board is enough here: the trigger renders for any row the viewer can
    // act on, and on this seed that is Report (`SEED` is authored by 7, the viewer is
    // 99). No owned fixture needed — which is what separates this case from the menuitem
    // one above, whose subject is author-scoped.
    const matchups = await openView('Matchups');
    const trigger = await within(matchups).findByTestId('matchup-menu');

    // 🔴 POSITIVE CONTROL ON THE SELECTOR ITSELF, scoped to the compact root, before any
    // measurement: a rule whose selector matches nothing still parses, is still in the
    // document, and still satisfies every "the CSS says 44px" assertion.
    const matched = document.querySelectorAll(
      `[${COMPACT_ATTR}='true'] ${ICON_BUTTON_SELECTOR}`,
    );
    expect(matched.length, 'the icon-button selector reached no live node').toBeGreaterThan(0);
    expect([...matched], 'the ⋮ trigger is not among the matched nodes').toContain(trigger);

    // 🔴 AND THE TRIGGER REALLY IS TEXT-LESS, which is the premise the whole rule rests
    // on. If it ever grows a label, width stops being the short axis and this block's
    // reason evaporates — better to fail here than to keep a rule whose motive is gone.
    expect((trigger.textContent ?? '').trim(), 'the ⋮ trigger grew visible text').toBe('');
    expect(trigger).toHaveAttribute('aria-label');

    expect(minWidthPx(trigger)).toBeGreaterThanOrEqual(MIN_TAP_TARGET_PX);
    // …and the height floor still reaches it through the pack-Button selector, so the
    // new rule is an ADDITION rather than a replacement.
    expect(minHeightPx(trigger)).toBeGreaterThanOrEqual(MIN_TAP_TARGET_PX);
  });

  it('the emitted stylesheet floors the ⋮ trigger on WIDTH, with the IMPORTED constant', () => {
    // The rule TEXT, so a selector deleted from `compact.ts` fails even if some future
    // refactor stops mounting a menu. Both halves are interpolated, never spelled: the
    // literal `44px` is pinned once, a few describes up.
    expect(compactTapTargetCss()).toContain(
      `[${COMPACT_ATTR}='true'] ${ICON_BUTTON_SELECTOR}`,
    );
    expect(compactTapTargetCss()).toContain(`min-width: ${MIN_TAP_TARGET_PX}px`);
  });

  it('the emitted stylesheet floors the option rows with the IMPORTED constant', () => {
    // The rule TEXT, so a selector deleted from `compact.ts` fails even if some
    // future refactor of the case above stops mounting a picker.
    // 🔴 The figure is INTERPOLATED from `MIN_TAP_TARGET_PX`, never spelled: the
    // literal `44px` is pinned once, a few cases up, and a second literal here
    // would be a copy that can drift from the constant.
    expect(compactTapTargetCss()).toContain(`[${COMPACT_ATTR}='true'] [role='option']`);
    expect(compactTapTargetCss()).toContain(`min-height: ${MIN_TAP_TARGET_PX}px`);
  });
});

// ---------------------------------------------------------------------------
// The compact tooltip rule.
// ---------------------------------------------------------------------------
//
// 🔴 THESE CASES DELIBERATELY ASSERT THE CSS RULE, NOT THE LAYOUT, and that is
// the honest ceiling here for the reason stated at the top of this file: jsdom
// performs NO layout, so `getBoundingClientRect()` is 0x0 and NO case in this
// file can observe the horizontal overflow the rule exists to remove. A vitest
// case that appeared to measure it would be measuring zeroes. The geometry is a
// LIVE BROWSER MEASUREMENT (headless Chromium 144 driving `npm run dev:harness`)
// and its numbers live on the PR. For the record, over EVERY "Included" badge on
// both the Combinations and Prompts views, worst excursion per width:
//
//                  BEFORE                          AFTER
//     320px  minLeft -58.7  maxRight 376.0    minLeft 8  maxRight 312
//     380px  minLeft  71.1  maxRight 395.2    minLeft 8  maxRight 372
//     720px  minLeft  78.7  maxRight 402.8    minLeft 8  maxRight 712
//
// (clientWidth is 320 / 380 / 720; the bubble-to-trigger gap is 6px before AND
// after, at every width, which is what "stays in its trigger's row" means.)
// Two further live results the rule's shape depends on, both in the src/compact.ts
// comment: plain `position: fixed` drifts on scroll (gap 6 -> -394 at scrollY
// 400) and `anchor-scope` is load-bearing (its removal sends 2 of 3 bubbles
// 190-358px away from their own badge).
describe('the compact tooltip rule (CSS text only — jsdom cannot see layout)', () => {
  /** The `@supports` block, normalised to single spaces. */
  const tooltipBlock = (): string => {
    const css = compactTapTargetCss();
    const start = css.indexOf('@supports');
    if (start < 0) return '';
    // Walk braces so the assertion covers the WHOLE block, nested rules and all.
    let depth = 0;
    for (let i = css.indexOf('{', start); i < css.length; i += 1) {
      if (css[i] === '{') depth += 1;
      else if (css[i] === '}') {
        depth -= 1;
        if (depth === 0) return css.slice(start, i + 1).replace(/\s+/g, ' ').trim();
      }
    }
    return '';
  };

  it('emits the whole rule, verbatim', () => {
    // 🔴 The WHOLE normalised block is pinned rather than keywords. Every
    // declaration in it is load-bearing and several are load-bearing in a way a
    // keyword check cannot see:
    //   - `left`/`right` BOTH set (with `width: auto`, `max-width: none`) is
    //     what bounds the box by construction; keeping either one alone
    //     re-opens the defect on that edge.
    //   - `top: auto` is what lets `bottom` decide the vertical at all.
    //   - `transform: none` retires the pack's `translateX(-50%)`, which is the
    //     centring that caused the clipping.
    //   - `anchor-scope` stops every bubble resolving to the LAST shared
    //     `anchor-name` in tree order (measured: 2 of 3 bubbles fly 190-358px
    //     away without it).
    // A reword or a dropped declaration therefore fails here rather than
    // shipping a tooltip nobody can read.
    expect(tooltipBlock()).toBe(
      '@supports (anchor-name: --mb-tooltip) and (anchor-scope: --mb-tooltip) ' +
        'and (position-anchor: --mb-tooltip) and (bottom: anchor(top)) { ' +
        `[${COMPACT_ATTR}='true'] [data-civitai-ui='tooltip'] { ` +
        'anchor-name: --mb-tooltip; anchor-scope: --mb-tooltip; } ' +
        `[${COMPACT_ATTR}='true'] [data-civitai-ui-tooltip-bubble] { ` +
        'position: fixed; position-anchor: --mb-tooltip; top: auto; ' +
        'bottom: calc(anchor(top) + 6px); left: 8px; right: 8px; ' +
        'width: auto; max-width: none; transform: none; } }',
    );
  });

  it('is behind an @supports guard — an unsupporting browser must get NOTHING', () => {
    // 🔴 NOT cosmetic. `anchor()` is invalid without anchor positioning, so that
    // ONE declaration would be dropped while `position: fixed` still applied —
    // and the pack's own `bottom: calc(100% + 6px)` would then resolve against
    // the VIEWPORT and throw the bubble off the top of the screen. Ungated, this
    // fix breaks the tooltip outright on every browser it cannot help.
    const block = tooltipBlock();
    expect(block.startsWith('@supports ')).toBe(true);

    // 🔴 EVERY MODERN FEATURE THE BLOCK USES MUST BE IN ITS OWN CONDITION —
    // that is the invariant, not any list of literals. CSS drops an unsupported
    // declaration INDIVIDUALLY, so an engine that has some of these and not
    // others ENTERS the block, applies the rest, and silently loses the one it
    // lacks. Measured twice over: without `anchor-scope` the bubbles land
    // 190-358px from their badge, and without `position-anchor` `anchor(top)`
    // has no default anchor so `bottom` goes `auto` — the plain-`position:fixed`
    // dead end that drifts to -394px on scroll. Both are STRICTLY WORSE than the
    // clipping this rule replaces.
    // 🔴 DERIVED FROM THE BLOCK'S OWN DECLARATIONS, and every round has caught
    // this guard being narrower than its own description. What it does NOT do is
    // as important as what it does, so both are stated at the end.
    //
    //   round 1: it iterated a hardcoded 4-element array while claiming to be
    //     derived, and EXEMPTED `position-anchor` by remapping it to
    //     `anchor-name` — which is how `position-anchor` ended up
    //     used-but-untested. Adding a real `position-area` declaration and
    //     updating the verbatim pin above (the natural maintainer edit, since
    //     that pin forces it) left this file green at 21/21.
    //   round 2: it asserted the property NAME appeared in the condition, never
    //     the CLAUSE — so `(anchor-name: 12px)`, an invalid value that makes
    //     `@supports` false on EVERY engine and silently disables the whole
    //     rule, passed 236/236. It also said nothing about how clauses are
    //     JOINED, so flipping `and` -> `or` — which destroys the all-or-nothing
    //     argument the block is built on — passed 21/21.
    //   round 2 also: two ways a feature slipped past the scan entirely — a
    //     modern FUNCTION riding a baseline property (`max-width:
    //     anchor-size(width)`, and `anchor-size()` shipped alongside `anchor()`
    //     in Chrome 125, so it is the likeliest next addition here), and a final
    //     declaration written without its optional trailing semicolon.
    const condition = block.slice(0, block.indexOf('{'));
    const body = block.slice(block.indexOf('{'));

    // ---- 1. STRUCTURE: every clause joined by `and`, never `or` ------------
    // 🔴 `or` would mean "apply if ANY of these is supported", i.e. exactly the
    // partial application this block exists to prevent. Walked rather than
    // regexed because `anchor(top)` nests parentheses inside a clause.
    const clauses: string[] = [];
    const joiners: string[] = [];
    {
      const c = condition.replace(/^@supports\s*/, '');
      let depth = 0;
      let start = -1;
      let lastEnd = -1;
      for (let i = 0; i < c.length; i += 1) {
        if (c[i] === '(') {
          if (depth === 0) {
            start = i;
            if (lastEnd >= 0) joiners.push(c.slice(lastEnd + 1, i).trim());
          }
          depth += 1;
        } else if (c[i] === ')') {
          depth -= 1;
          if (depth === 0) {
            clauses.push(c.slice(start, i + 1));
            lastEnd = i;
          }
        }
      }
    }
    // Positive control on the WALK: a broken parse derives no clauses and every
    // assertion below passes vacuously.
    expect(clauses.length, 'parsed NO clauses out of the condition — the walk is broken').
      toBeGreaterThan(1);
    expect(joiners.length).toBe(clauses.length - 1);
    for (const joiner of joiners) {
      expect(joiner, `clauses joined by \`${joiner}\`, not \`and\` — that is not all-or-nothing`).
        toBe('and');
    }

    // ---- 2. DECLARATIONS: property AND value, both derived ------------------
    /**
     * Properties predating anchor positioning by decades. Everything else pays.
     *
     * 🔴 ONE OF THE TWO HAND-WRITTEN LISTS LEFT — `BASELINE_FUNCS` below is the
     * other, and this comment used to say "THE ONE HAND-WRITTEN LIST LEFT" while
     * that second list sat eleven lines under it, added by the same commit.
     * (`compact.ts` had it right; this file contradicted it.) Both are
     * deliberately lists of BASELINE things rather than modern ones: forgetting
     * to add a new modern feature is impossible, because absence means
     * "guarded". The failure mode that remains is someone ADDING a modern name
     * to either set.
     */
    const BASELINE_PROPS = new Set([
      'position',
      'top',
      'right',
      'bottom',
      'left',
      'width',
      'max-width',
      'transform',
    ]);
    /** Same idea for value functions. */
    const BASELINE_FUNCS = new Set([
      'calc',
      'var',
      'min',
      'max',
      'clamp',
      'rgb',
      'rgba',
      'hsl',
      'hsla',
      'url',
      'translate',
      'translatex',
      'translatey',
    ]);

    // A declaration ends at `;` OR at its rule's closing `}` — the last one in a
    // block may legally omit the semicolon, and requiring it let exactly that
    // shape slip past.
    const decls = [...body.matchAll(/(--)?([a-z][a-z0-9-]*)\s*:\s*([^;{}]+?)\s*(?=[;}])/g)].map(
      (m) => ({ custom: !!m[1], prop: (m[1] ?? '') + m[2], value: m[3] }),
    );
    // Positive control on the SCAN: a broken regex derives nothing and every
    // loop below asserts nothing at all, silently.
    expect(decls.length, 'the declaration scan matched nothing — the regex is broken').
      toBeGreaterThan(5);

    // Custom properties are universally supported and need no clause — and
    // demanding one made this guard reject `--mb-gap: 6px;`, which is legal and
    // harmless.
    const guardedDecls = decls.filter((d) => !d.custom && !BASELINE_PROPS.has(d.prop));
    expect(
      guardedDecls.length,
      'derived NO guarded declarations — the scan or BASELINE_PROPS is wrong',
    ).toBeGreaterThan(0);
    for (const { prop, value } of guardedDecls) {
      // 🔴 THE WHOLE CLAUSE, NOT THE NAME. A clause naming the right property
      // with a nonsense VALUE is false on every engine, which disables the whole
      // block silently — the single worst outcome available here.
      expect(
        clauses,
        `the block declares \`${prop}: ${value}\` but @supports has no matching clause`,
      ).toContain(`(${prop}: ${value})`);
    }

    // ---- 2b. EVERY CLAUSE'S VALUE MUST EXIST IN THE BLOCK -------------------
    // 🔴 THE MIRROR OF SECTION 2, AND WITHOUT IT ONE CLAUSE WAS NEVER CHECKED AT
    // ALL. Section 2 walks the block's declarations and demands a clause for
    // each — but it skips `BASELINE_PROPS`, and `bottom` is in that set. So
    // `(bottom: anchor(top))`, the clause carrying the block's most modern
    // feature, was covered by nothing: section 3 only asks whether the substring
    // `anchor(` appears somewhere in the condition, never what value it tests.
    // Measured, both surviving a full green suite at 237/237 with the verbatim
    // pin updated:
    //
    //     (bottom: anchor(top)) -> (bottom: anchor(topp))     237/237 SURVIVED
    //     (bottom: anchor(top)) -> (bottom: anchor(12px))     237/237 SURVIVED
    //
    // Either is a one-character typo while editing the condition, and either
    // makes the clause invalid — so `@supports` is false on EVERY engine, the
    // rule never applies, and the mobile clipping this whole PR exists to fix
    // returns for 100% of users with typecheck, tests and build all green.
    //
    // Walking clause -> block (rather than block -> clause) is what reaches a
    // clause whose property is baseline-exempt, so the two directions together
    // cover all four clauses.
    for (const clause of clauses) {
      const v = clause.slice(clause.indexOf(':') + 1, clause.length - 1).trim();
      expect(body, `clause \`${clause}\` tests a value that appears nowhere in the block`).toContain(
        v,
      );
    }

    // ---- 3. VALUE FUNCTIONS: features that ride a baseline property ---------
    // 🔴 `bottom: calc(anchor(top) + 6px)` is the block's most modern
    // declaration and `bottom` is baseline, so nothing above sees it. Derived
    // the same way as properties, so `anchor-size()` — which shipped with
    // `anchor()` in Chrome 125 — cannot slip in the way a hardcoded
    // `includes('anchor(')` let it.
    const usedFuncs = new Set(
      [...body.matchAll(/([a-z][a-z0-9-]*)\s*\(/g)]
        .map((m) => m[1].toLowerCase())
        .filter((f) => !BASELINE_FUNCS.has(f)),
    );
    expect(usedFuncs.size, 'derived NO guarded functions — the block should use anchor()').
      toBeGreaterThan(0);
    for (const fn of usedFuncs) {
      expect(condition, `the block uses \`${fn}()\` but @supports never tests for it`).toContain(
        `${fn}(`,
      );
    }

    // 🔴 Nothing from the block may leak OUTSIDE the guard — an anchor
    // declaration that escaped it is exactly the failure mode described above.
    // Compare like with like: normalise the whole sheet, then cut the (already
    // normalised) block out of it. Not vacuous — if `tooltipBlock()` returned
    // nothing the cut is a no-op and both assertions below go red.
    const whole = compactTapTargetCss().replace(/\s+/g, ' ').trim();
    expect(whole).toContain(block);
    const outside = whole.replace(block, '');
    expect(outside).not.toContain('anchor-name');
    expect(outside).not.toContain('position-anchor');
  });

  it('🔴 the block actually REACHES THE DOCUMENT, not just the return string', async () => {
    // 🔴 The three cases above assert what `compactTapTargetCss()` RETURNS. That
    // is not the same claim as "the rule ships", and the gap is real rather than
    // theoretical: an altering mutant that mounts
    // `{compactTapTargetCss().split('@supports')[0]}` keeps the tap-target half
    // shipping — so every other case in this file stays green — while the
    // tooltip block never reaches the document at all. Measured: that mutant
    // SURVIVED a full green suite (23 files / 231 tests).
    //
    // Note this was an ASYMMETRY, not a jsdom limit: the tap-target half of the
    // same sheet is already covered end-to-end by the SELECTOR REACHABILITY
    // cases, which read computed styles off live nodes. Only the tooltip half
    // stopped at the string.
    setViewport('mobile');
    renderApp();
    await screen.findByTestId('section-grids');

    const mounted = screen.getByTestId('compact-styles').textContent ?? '';
    expect(mounted.replace(/\s+/g, ' ')).toContain(tooltipBlock());
  });

  it('the gutter and gap figures are the literals, not whatever the constants say', () => {
    // Same trap the 44px case exists for: the CSS input and an assertion bound
    // that share a symbol cannot check each other.
    expect(TOOLTIP_GUTTER_PX).toBe(8);
    expect(TOOLTIP_GAP_PX).toBe(6);
  });

  it('INVARIANT GUARD (passes at base too): both compact tooltip selectors match live nodes', async () => {
    // 🔴 Labelled honestly: this is GREEN AT BASE and is therefore NOT
    // regression coverage for the tooltip fix — the pack renders these
    // attributes whether or not our rule exists. Its job is the one the three
    // cases above cannot do: the rule text is worthless if the pack renames its
    // attributes, so prove each selector reaches the real rendered tooltip.
    // Needs no layout, only the DOM.
    //
    // 🔴 WHICH TOOLTIP THIS REACHES HAS CHANGED, and the change nearly emptied the
    // case. It used to be the "Included" badge on the Matchups board — and the third
    // IA pass DELETED that badge, so the node this case depended on is gone. What
    // keeps it alive is a different tooltip added in the same pass: `VoteButton` now
    // wraps its control in one, and every card on this board has a vote control. That
    // is a strictly better anchor than the badge was (a badge renders only for the
    // top-N; a vote control renders on every row), but it is an ACCIDENT of the same
    // change rather than a design — so if the vote tooltip ever goes, this case needs
    // a new anchor, not a deletion.
    setViewport('mobile');
    renderApp();
    await openView('Matchups');
    await screen.findByTestId('matchups-list');

    const triggers = document.querySelectorAll(
      `[${COMPACT_ATTR}='true'] [data-civitai-ui='tooltip']`,
    );
    expect(triggers.length).toBeGreaterThan(0);

    const bubbles = document.querySelectorAll(
      `[${COMPACT_ATTR}='true'] [data-civitai-ui-tooltip-bubble]`,
    );
    expect(bubbles.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// THE SIDEBAR COLLAPSES TO A TOP BAR under the compact breakpoint.
//
// 🔴 READ THE CEILING BEFORE THE CASES. jsdom performs NO LAYOUT: it resolves no
// grid, every box is 0x0, and `getBoundingClientRect()` is all zeros. So NOTHING in
// this block observes whether the sidebar actually becomes a top bar. What it CAN
// settle is exactly two things, and they are the two things that have historically
// gone wrong here:
//
//   1. THE DECLARATIONS ARE IN THE EMITTED SHEET — so a rule silently dropped in a
//      refactor fails a test instead of shipping a broken layout;
//   2. THE SELECTORS MATCH LIVE NODES — so a rule that parses, sits in the document,
//      and matches NOTHING fails too. `compact.ts`'s header records three separate
//      rounds where "the rule is still there" was mistaken for "the rule still
//      applies", each caught only by a reachability case like these.
//
// ⚠️ LIVE MEASUREMENT AT ≤720px IS OWED AND HAS NOT BEEN DONE. The existing numbers
// at the top of this file came from headless Chromium against `pnpm run dev:harness`;
// nothing equivalent has been run against the sidebar. Do not read a green here as
// "the top bar works".
// ===========================================================================

describe('the sidebar → top-bar collapse (CSS text and reachability only)', () => {
  it('emits the single-column override, scoped to the compact root', () => {
    const css = compactTapTargetCss();
    // The WHOLE declaration block, not a property name: a `grid-template-columns`
    // whose value drifted to something two-column would satisfy a name check.
    expect(css).toContain(`[${COMPACT_ATTR}='true'] [${LAYOUT_ATTR}] {`);
    expect(css).toContain('grid-template-columns: minmax(0, 1fr);');
    // …and the nav's own rows go horizontal, which is what makes it a BAR.
    expect(css).toContain(`[${COMPACT_ATTR}='true'] [data-testid='side-nav-list']`);
    expect(css).toContain(`[${COMPACT_ATTR}='true'] [data-testid='nav-my-group']`);
    expect(css).toContain('grid-auto-flow: column;');
    expect(css).toContain('overflow-x: auto;');
  });

  it('the WIDE case lives in its own always-mounted sheet, and it is two columns', () => {
    // 🔴 THE PAIR IS THE CLAIM. A single-column rule proves nothing on its own: if the
    // wide case were also one column the "collapse" would be unconditional and the
    // breakpoint would decide nothing. This is the negative control for the case above,
    // the same way the desktop describe block is for the tap-target rule.
    const css = layoutCss();
    expect(css).toContain(`[${LAYOUT_ATTR}] {`);
    expect(css).toContain('display: grid;');
    expect(css).toMatch(/grid-template-columns: \d+px minmax\(0, 1fr\);/);
    // …and the two really do differ, so the override is an override.
    expect(css).not.toContain('grid-template-columns: minmax(0, 1fr);');
  });

  it('SELECTOR REACHABILITY: both sheets reach the live layout and nav nodes', async () => {
    setViewport('mobile');
    renderApp();
    await screen.findByTestId('side-nav');

    // 🔴 THE POSITIVE CONTROL THAT MAKES THE TWO TEXT CASES NON-VACUOUS: the selectors
    // resolve against the real rendered tree. A rule aimed at an attribute the app
    // stopped stamping would pass both cases above and reach nothing.
    const layout = document.querySelectorAll(`[${COMPACT_ATTR}='true'] [${LAYOUT_ATTR}]`);
    expect(layout, 'the layout selector reached no live node').toHaveLength(1);
    expect(
      document.querySelectorAll(`[${COMPACT_ATTR}='true'] [data-testid='side-nav-list']`),
      'the nav-list selector reached no live node',
    ).toHaveLength(1);
    // Both sheets are actually in the document, not merely returned by a function.
    expect(screen.getByTestId('compact-styles')).toBeInTheDocument();
    expect(screen.getByTestId('layout-styles')).toBeInTheDocument();
  });

  it('the breakpoint is stated ONCE and the hook reads it', () => {
    // 🔴 720 IS THE WCAG-adjacent boundary this repo already chose, and it used to be
    // a literal inside `useMediaQuery.ts` while `compact.ts` merely described it in
    // prose. Now the hook imports it. Pinned as the LITERAL here rather than compared
    // against itself — an assertion that read the constant on both sides would pass at
    // any value, which is the shape of a guard that pins nothing.
    expect(MOBILE_BREAKPOINT_PX).toBe(720);
    // …and the emitted sheet's own comment carries the same number, so the two cannot
    // describe different breakpoints.
    expect(compactTapTargetCss()).toContain('under 720px');
  });
});

// ===========================================================================
// 🔴 OPERATOR FEEDBACK #5 (F2) — the top bar lost the GROUPING, and clipped.
//
// MEASURED LIVE, at a 390px viewport: the nav strip's `scrollWidth` was 437 against a
// `clientWidth` of 347, with `Prompts` past the right edge. And with the rows laid
// out horizontally, `SideNav`'s depth `padding-left` stopped being an indent at all —
// on a row it is just a gap before the label — so Home / My Benchmarks / Grids /
// Matchups / Prompts read as FIVE FLAT PEERS, with nothing saying that the last three
// live inside the second. The strip also had no background, border or padding, so the
// page's only primary navigation read as a line of body copy.
//
// THREE CHANGES, and they are not equally well covered:
//
//   1. THE NESTING becomes a BRACKET (`border-left` in the primary colour, plus its
//      own inset) — a device that survives the axis change, unlike an indent.
//   2. THE DEAD INDENT is zeroed THROUGH A CUSTOM PROPERTY, which is the only lever a
//      stylesheet has over a value `SideNav` writes inline. This is the one change
//      that provably removes width from the strip.
//   3. THE STRIP BECOMES CHROME — `elevate()` fill, border, radius, padding — plus a
//      thin scrollbar and inline scroll-snap, so that an overflowing strip READS as
//      scrollable rather than as truncated.
//
// ⚠️ AND THE HONEST CEILING, WHICH IS LOWER THAN THE FEEDBACK ASKS FOR. jsdom performs
// NO LAYOUT: `scrollWidth`/`clientWidth` are 0 here and no grid is resolved. NOTHING
// below observes the 437-vs-347 number, whether the bracket is visible, or whether a
// partly-scrolled row is still mistakable for a truncated one. What these cases pin is
// what `compact.ts`'s header already scopes itself to — the declarations are in the
// emitted sheet, and the selectors match live nodes — plus ONE seam that is worth more
// than either: that the property `SideNav` READS is the property this sheet SETS.
// A LIVE READING AT 390px IS OWED and has not been taken.
// ===========================================================================

/** The declaration block for `selector`, as `prop -> value`, from an emitted sheet. */
function declarationsFor(css: string, selector: string): Record<string, string> {
  const at = css.indexOf(selector);
  if (at < 0) return {};
  const open = css.indexOf('{', at);
  const close = css.indexOf('}', open);
  if (open < 0 || close < 0) return {};
  const out: Record<string, string> = {};
  for (const decl of css.slice(open + 1, close).split(';')) {
    const colon = decl.indexOf(':');
    if (colon < 0) continue;
    out[decl.slice(0, colon).trim()] = decl.slice(colon + 1).trim().replace(/\s+/g, ' ');
  }
  return out;
}

describe('the compact nav strip: grouping, chrome, and one scroll boundary', () => {
  const stripSelector = `[${COMPACT_ATTR}='true'] [data-testid='side-nav-list'] {`;
  const groupSelector = `[${COMPACT_ATTR}='true'] [data-testid='nav-my-group'] {`;

  it('🔴 PREMISE: both blocks parse, so every assertion below reads a real block', () => {
    // The positive control for this whole describe. `declarationsFor` returns `{}`
    // for a selector it cannot find, and `{}[x]` is `undefined` — which compares
    // equal to nothing and silently satisfies a `not.toBe` chain. Prove the parse
    // first, by a property that is not itself under test.
    const css = compactTapTargetCss();
    expect(declarationsFor(css, stripSelector)['grid-auto-flow']).toBe('column');
    expect(declarationsFor(css, groupSelector)['grid-auto-flow']).toBe('column');
  });

  it('🔴 the sub-group is drawn as a BRACKET, not as an indent', () => {
    const group = declarationsFor(compactTapTargetCss(), groupSelector);
    // A left rule in the PRIMARY colour, so the sub-items read as belonging to the
    // trigger on their left. The colour is asserted because a `border-left` in the
    // border token would be indistinguishable from the strip's own edge.
    expect(group['border-left']).toBe('2px solid var(--civitai-color-primary)');
    // …and the bracket needs its own inset, or the rule sits flush against a label.
    expect(group['padding-left']).toBeTruthy();
  });

  it('🔴 there is exactly ONE scroll boundary — the group is no longer a scroller', () => {
    // 🔴 THE GROUP USED TO CARRY `overflow-x: auto` TOO, nested inside the strip's
    // own scroller: a second place content can be cut, and one the OUTER scroller
    // cannot scroll to. `visible` is asserted rather than merely "not auto", because
    // an absent declaration and a correct one must not read the same.
    const css = compactTapTargetCss();
    expect(declarationsFor(css, stripSelector)['overflow-x']).toBe('auto');
    expect(declarationsFor(css, groupSelector)['overflow-x']).toBe('visible');
  });

  it('🔴 the strip is CHROME: a fill that works in both themes, a border, and padding', () => {
    const strip = declarationsFor(compactTapTargetCss(), stripSelector);
    expect(strip['border']).toBe('1px solid var(--civitai-color-border)');
    expect(strip['border-radius']).toBe('var(--civitai-radius)');
    expect(strip['padding']).toBeTruthy();
    // 🔴 THE FILL IS A `color-mix`, NEVER `surface-2`. On this element specifically,
    // surface-2 would reinstate the exact bug `src/theme.test.ts` exists for: it
    // equals `body` in light theme, so the strip would have no fill there — i.e. the
    // "reads as body copy" complaint, unfixed, in one of the two themes.
    expect(strip['background']).toContain('color-mix(');
    expect(strip['background']).not.toContain('var(--civitai-color-surface-2)');
    // …and the overflow is made legible rather than left to overlay scrollbars.
    expect(strip['scrollbar-width']).toBe('thin');
    expect(strip['scroll-snap-type']).toBe('inline proximity');
    expect(
      declarationsFor(compactTapTargetCss(), `[${COMPACT_ATTR}='true'] [data-testid='side-nav-list'] > * {`)[
        'scroll-snap-align'
      ],
      'the snap axis is set but nothing snaps to it',
    ).toBe('start');
    // 🔴 AND THE SUB-ITEMS NEED THEIR OWN RULE, WHICH IS THE HALF THAT WAS MISSING.
    // `scroll-snap-align` is NOT inherited and the strip has exactly THREE direct
    // children — Home, My Benchmarks, and `nav-my-group` as one unit — so the `> *`
    // rule above gives Grids/Matchups/Prompts no snap point at all. `Prompts` is the
    // row the 390px reading found clipped, so the affordance was aimed precisely at the
    // rows it did not cover. The assertion above stayed GREEN throughout, because the
    // group-as-a-whole does snap; only this second one can see the gap.
    expect(
      declarationsFor(compactTapTargetCss(), `[${COMPACT_ATTR}='true'] [data-testid='nav-my-group'] > * {`)[
        'scroll-snap-align'
      ],
      'the sub-items are grandchildren of the strip and get no snap point of their own',
    ).toBe('start');
  });

  it('🔴 SEAM: the sheet sets the SAME custom property the nav row reads', async () => {
    // 🔴 THE ONE CASE HERE THAT IS WORTH MORE THAN A TEXT CHECK, because the two ends
    // of this seam live in different files and one of them is an INLINE style the
    // other cannot override by any other means. `SideNav` writes
    // `padding-left: var(--mb-nav-indent-1, 24px)`; this sheet sets
    // `--mb-nav-indent-1`. Rename either and the sub-items silently keep a depth step
    // of dead gap on a strip that is already overflowing — no error, no visual
    // difference a reviewer would catch, and the whole width saving gone.
    //
    // BOTH SIDES ARE SPELLED HERE AS LITERALS. Importing `navIndentVar` and using it
    // on both sides would pass at any value, which is the shape of a guard that pins
    // nothing.
    const group = declarationsFor(compactTapTargetCss(), groupSelector);
    expect(group['--mb-nav-indent-1']).toBe('10px');

    // 🔴 AND THE TWO INSETS ARE ONE PREDICATE IN TWO FILES. `compact.ts` states the
    // invariant in prose — "the depth-0 inset, applied at every depth" — and nothing
    // pinned it. Depth-0 rows take their inset from `SideNav`'s `NAV_BASE_INSET_PX`
    // (through the `var()` fallback, since `--mb-nav-indent-0` is never set); depth-1
    // rows take theirs from `compact.ts`'s `NAV_COMPACT_INSET_PX`. Change the first for
    // the wide rail and the sub-items sit LEFT of their parents on the strip — the exact
    // misalignment the compact inset exists to prevent — with the literal assertion above
    // still true and the whole suite green. Found by a round-1 audit. This is the same
    // one-rule-two-homes shape the `surface2` deletion in this PR closes elsewhere.
    expect(
      NAV_COMPACT_INSET_PX,
      'the compact strip flattens every row to the DEPTH-0 inset, so these two must agree',
    ).toBe(NAV_BASE_INSET_PX);
    // ⚠️ WHICH MUTATION REACHES THIS, MEASURED — because only one of the two does.
    // Changing `NAV_COMPACT_INSET_PX` does NOT reach it: the literal `'10px'` assertion
    // above reads the same value and fails first, in this very test. The mutation that
    // reaches it is the one the hazard is actually about — `NAV_BASE_INSET_PX` moved for
    // the wide rail, which leaves the emitted `--mb-nav-indent-1` at 10px so the literal
    // stays GREEN. Measured: that mutant turns 2 cases red and this assertion's own
    // message is one of them. The two assertions cover the two directions; neither alone
    // covers both.

    setViewport('mobile');
    renderApp();
    await screen.findByTestId('side-nav');
    // The group is open by default, so the sub-items are on screen with no
    // interaction — and this is also the reachability control for the rule above.
    expect(
      document.querySelectorAll(`[${COMPACT_ATTR}='true'] [data-testid='nav-my-group']`),
      'the sub-group selector reached no live node',
    ).toHaveLength(1);

    const sub = screen.getByTestId('nav-my-grid');
    expect(sub.style.paddingLeft).toBe('var(--mb-nav-indent-1, 24px)');
    // …and the depth-0 rows read a DIFFERENT property, so zeroing the sub-item indent
    // cannot silently move Home as well.
    expect(screen.getByTestId('nav-home').style.paddingLeft).toBe('var(--mb-nav-indent-0, 10px)');
  });
});

// ===========================================================================
// 🔴 OPERATOR FEEDBACK #3, THE NARROW HALF — the responsive matrix must not
// change anything below the floor.
//
// `ResultsGrid.test.tsx` pins the template at the component level. This is the other
// measurement point: the claim "a track can only ever get WIDER" is a claim about TWO
// viewports, and one reading cannot make it. The template is emitted by the same code
// path at both, so what this actually proves is that no compact rule overrides the
// tracks — which is the way the narrow story would break.
//
// ⚠️ Still no layout. This cannot see that the last column is reachable at 390px.
// ===========================================================================

describe('the responsive matrix at a narrow viewport', () => {
  it('🔴 emits the SAME floored template at 380px as it does on the desktop arm', async () => {
    setViewport('mobile');
    renderApp();
    const scroller = await openGrid();
    await waitFor(() => expect(screen.getAllByTestId('grid-cell')).toHaveLength(EXPECTED_CELLS));

    const grid = scroller.firstElementChild as HTMLElement;
    // A LITERAL: the fixture is two prompts, so this string is knowable without
    // reading the component. The floor is what makes the matrix wider than this
    // viewport by construction, which is what keeps the scroller doing its job.
    //
    // 🔴 AND THE CEILING IS PART OF THE LITERAL, DELIBERATELY. It was `1fr`, which
    // has no upper bound — and `validateGrid` permits a ONE-prompt grid, so that
    // single column took the whole remaining width on a wide monitor. A round-1
    // audit found it; nothing here could, because jsdom resolves no grid and this
    // assertion reads the DECLARED string. Pinning the whole string is what makes
    // a silent return to `1fr` fail, rather than a regex that would accept either.
    expect(grid.style.gridTemplateColumns).toBe(
      'minmax(180px, 220px) repeat(2, minmax(200px, 420px))',
    );
    expect(scroller.style.overflowX).toBe('auto');

    // 🔴 AND NO COMPACT RULE TOUCHES THE TRACKS. The sheet DOES carry a
    // `grid-template-columns` override — for the sidebar/content layout — so "the
    // sheet mentions grid-template-columns" is not the question; the question is
    // whether any of them is aimed at the matrix.
    expect(compactTapTargetCss()).not.toContain('results-grid');
  });

  it('🔴 the DESKTOP arm reads the same template — the negative control', async () => {
    setViewport('desktop');
    renderApp();
    const scroller = await openGrid();
    await waitFor(() => expect(screen.getAllByTestId('grid-cell')).toHaveLength(EXPECTED_CELLS));

    const grid = scroller.firstElementChild as HTMLElement;
    expect(grid.style.gridTemplateColumns).toBe(
      'minmax(180px, 220px) repeat(2, minmax(200px, 420px))',
    );
    // The compact layout really is absent here, so the case above measured a
    // DIFFERENT arm rather than the same one twice.
    expect(document.querySelectorAll(`[${COMPACT_ATTR}='true']`)).toHaveLength(0);
  });
});
