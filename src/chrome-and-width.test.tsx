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
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Harness } from '@civitai/blocks-react/testing';

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
const { CKPT_SDXL, fakeAppStorage, fakeShared, immediateSleep } = await import('./test-helpers.js');

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

async function tabs() {
  const strip = await screen.findByTestId('view-switch');
  // The strip's controls expose role="tab", NOT role="button" — asking for
  // "button" here fails with "unable to find an accessible element", which
  // reads exactly like the app not rendering. It renders; the role differs.
  return within(strip).getAllByRole('tab');
}

describe('419 criterion 1 — the header Buzz badge does not render, in any view', () => {
  it('is absent on first paint even though the host DOES report a balance', async () => {
    renderApp({ blue: 0, green: 0, yellow: 5000 });
    await screen.findByTestId('view-switch');
    expect(screen.queryByTestId('buzz-balance')).toBeNull();
  });

  it('is absent in all three views', async () => {
    renderApp({ blue: 0, green: 0, yellow: 5000 });
    const buttons = await tabs();
    // The strip is the app's only navigation: combos / prompts / grid.
    expect(buttons).toHaveLength(3);
    for (const b of buttons) {
      await userEvent.click(b);
      await waitFor(() => expect(screen.queryByTestId('buzz-balance')).toBeNull());
    }
  });

  it('renders no node whose text still advertises a Buzz balance', async () => {
    // A guard on the TESTID alone is walkable by re-rendering the same number
    // under a different testid, so pin the rendered STRING too. 5,000 is the
    // host balance above; `toLocaleString()` is what the old badge printed.
    renderApp({ blue: 0, green: 0, yellow: 5000 });
    await screen.findByTestId('view-switch');
    expect(screen.queryByText(/5,000\s*Buzz/i)).toBeNull();
  });
});

describe('419 criterion 2 — the balance still reaches the money path', () => {
  it('passes the host balance through to ResultsGrid after the badge is gone', async () => {
    gridProps.length = 0;
    renderApp({ blue: 0, green: 0, yellow: 5000 });
    const buttons = await tabs();
    await userEvent.click(buttons[2]); // Grid
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
    const buttons = await tabs();
    await userEvent.click(buttons[2]);
    await screen.findByTestId('results-grid-stub');
    await waitFor(() => expect(gridProps.length).toBeGreaterThan(0));
    expect(gridProps.at(-1)!.buzzTotal).toBe(0);
  });

  it('CONTROL: a different balance produces a different captured value', async () => {
    gridProps.length = 0;
    renderApp({ blue: 1, green: 2, yellow: 4 });
    const buttons = await tabs();
    await userEvent.click(buttons[2]);
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
