// Task 419 — the header Buzz badge is GONE, the balance it displayed is NOT.
//
// 🔴 The whole risk of this change is that "remove the Buzz display" is one
// `grep buzzTotal` away from also deleting the money path's balance GATE:
// `useBuzzBalance()` feeds BOTH the badge (cosmetic) and `ResultsGrid`'s
// insufficient-balance guard (load-bearing, `cell-insufficient`). So this file
// pins the RELATIONSHIP, not just the absence:
//
//   1. no `buzz-balance` node renders, in ANY of the three views;
//   2. the balance still ARRIVES at ResultsGrid — with a control proving the
//      assertion can move, so it cannot pass by being wired to a constant;
//   3. the content container is no longer width-capped.
//
// (2) is the one that matters: (1) alone is satisfied by deleting the hook.

import { render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Harness } from './test-harness.js';

import { contentStyle } from './theme.js';

// Prop-capture spy: the only seam through which the App's balance reaches the
// grid. Declared before the App import so the mock is hoisted ahead of it.
const gridProps: Array<{ buzzTotal: number | null }> = [];
vi.mock('./components/ResultsGrid.js', () => ({
  ResultsGrid: (props: { buzzTotal: number | null }) => {
    gridProps.push({ buzzTotal: props.buzzTotal });
    return <div data-testid="results-grid-stub" />;
  },
}));

const { App } = await import('./App.js');
const { CKPT_SDXL, fakeAppStorage, fakeShared, immediateSleep, openView } = await import(
  './test-helpers.js',
);

/** Render the block. `balance` null => the host reports no balance at all. */
function renderApp(balance: { blue: number; green: number; yellow: number } | null) {
  const { shared } = fakeShared({ seed: [] });
  render(
    <Harness
      viewer={{ id: 99, username: 'me' }}
      theme="dark"
      consentGranted
      buzzBudget={1000}
      buzz={balance ? { balance: balance.blue + balance.green + balance.yellow } : undefined}
      buzzBalance={balance ?? undefined}
      cannedPicks={{ Checkpoint: CKPT_SDXL }}
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
 * Every top-level section this page can mount, WALKED — because only one community
 * board is mounted at a time again.
 *
 * 🔴 THIS HELPER HAS REVERSED TWICE AND THE WEAKENING IS DELIBERATE — say so rather
 * than let a future reader read the walk as the original design. Generation 1: a
 * `view-switch` strip whose controls exposed `role="tab"`, so "in all three views"
 * meant three clicks. Generation 2: the one-page IA mounted all three sections
 * together, so the claim was checked in ONE frame — strictly stronger, because a badge
 * appearing in only one section was still on screen. Generation 3, here: the board
 * subnav mounts one board at a time, so it is a walk again.
 *
 * ⚠️ WHAT THAT COSTS, PRECISELY: a one-frame check could not be fooled by a badge that
 * renders on mount and then removes itself; a walk can, because each board is a fresh
 * mount. Nothing in this app does that, and the alternative — keeping all three boards
 * mounted — is the thing that put two of them outside the host iframe's crop. Recorded
 * as a known weakening, not as an equivalent.
 *
 * The OPEN-GRID section is included: it is on Home whichever board is selected, and it
 * is where the results matrix (and therefore the money path) lives.
 */
async function sections() {
  const out: HTMLElement[] = [];
  out.push(await screen.findByTestId('section-open-grid'));
  out.push(await openView('Grids'));
  out.push(await openView('Matchups'));
  out.push(await openView('Prompts'));
  // Back to the default board, so a caller that goes on to read the grid finds it.
  await openView('Grids');
  return out;
}

describe('419 criterion 1 — the header Buzz badge does not render, in any view', () => {
  it('is absent on first paint even though the host DOES report a balance', async () => {
    renderApp({ blue: 0, green: 0, yellow: 5000 });
    await screen.findByTestId('section-open-grid');
    expect(screen.queryByTestId('buzz-balance')).toBeNull();
  });

  it('is absent on every section the page can mount', async () => {
    renderApp({ blue: 0, green: 0, yellow: 5000 });
    const mounted = await sections();
    // 🔴 THE PREMISE, asserted rather than assumed: every section really was visited,
    // so the absence below is an absence across the whole page and not an absence from
    // whichever section happened to be rendered. FOUR: the open grid plus the three
    // community boards.
    expect(mounted).toHaveLength(4);
    for (const section of mounted) {
      expect(within(section).queryByTestId('buzz-balance')).toBeNull();
    }
    await waitFor(() => expect(screen.queryByTestId('buzz-balance')).toBeNull());
  });

  it('renders no node whose text still advertises a Buzz balance', async () => {
    // A guard on the TESTID alone is walkable by re-rendering the same number
    // under a different testid, so pin the rendered STRING too. 5,000 is the
    // host balance above; `toLocaleString()` is what the old badge printed.
    renderApp({ blue: 0, green: 0, yellow: 5000 });
    await screen.findByTestId('section-open-grid');
    expect(screen.queryByText(/5,000\s*Buzz/i)).toBeNull();
  });
});

describe('419 criterion 2 — the balance still reaches the money path', () => {
  it('passes the host balance through to ResultsGrid after the badge is gone', async () => {
    gridProps.length = 0;
    renderApp({ blue: 0, green: 0, yellow: 5000 });
    await sections();
    await screen.findByTestId('results-grid-stub');
    await waitFor(() => expect(gridProps.length).toBeGreaterThan(0));
    expect(gridProps.at(-1)!.buzzTotal).toBe(5000);
  });

  it('CONTROL: the captured value MOVES with the host — a zero balance forwards 0', async () => {
    // Without a moving control the assertion above is indistinguishable from a
    // stub hardcoded to 5000.
    // ⚠ HARNESS GOTCHA, measured: OMITTING `buzzBalance` does NOT mean "the host
    // reports no balance" — the Harness substitutes a DEFAULT (6000), so the
    // obvious null arm asserts nothing about this app. An explicit all-zero
    // balance is the value the default cannot equal.
    gridProps.length = 0;
    renderApp({ blue: 0, green: 0, yellow: 0 });
    await sections();
    await screen.findByTestId('results-grid-stub');
    await waitFor(() => expect(gridProps.length).toBeGreaterThan(0));
    expect(gridProps.at(-1)!.buzzTotal).toBe(0);
  });

  it('CONTROL: a different balance produces a different captured value', async () => {
    gridProps.length = 0;
    renderApp({ blue: 1, green: 2, yellow: 4 });
    await sections();
    await screen.findByTestId('results-grid-stub');
    await waitFor(() => expect(gridProps.length).toBeGreaterThan(0));
    expect(gridProps.at(-1)!.buzzTotal).toBe(7);
  });
});

describe('419 criterion 3 — the content container is not width-capped', () => {
  // jsdom performs no layout, so this pins the STYLE CONTRACT. The pixel claim
  // (container >= 95% of the app frame) is a live measurement and is reported
  // on the task, not here — do not read this test as covering it.
  it('declares no maxWidth', () => {
    expect(contentStyle.maxWidth).toBeUndefined();
  });

  it('still fills its parent and keeps border-box sizing, so padding cannot overflow it', () => {
    expect(contentStyle.width).toBe('100%');
    expect(contentStyle.boxSizing).toBe('border-box');
  });
});
