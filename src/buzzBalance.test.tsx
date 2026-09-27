// 🔴 THE BUZZ BALANCE IS READ ONCE ON MOUNT — and until this file existed,
// never again for the life of the page.
//
// THE OPERATOR'S REPORT, second half: "on re-submit, it said 'insufficient
// buzz', after full page reload it worked." The false label is fixed in
// `ResultsGrid` (see the `an UNKNOWN balance is never reported as an
// INSUFFICIENT one` block in `src/components/ResultsGrid.test.tsx`). This file
// pins the other half: WHY the balance was unknown and stayed unknown.
//
// `useBuzzBalance()` (`@civitai/blocks-react`) fetches exactly once, from a
// mount effect over a `useCallback([], …)` whose identity never changes, and
// exposes `refetch` "for on-demand refreshes (e.g. after a generation debits
// the balance)". It does NOT refetch on `TOKEN_REFRESH`. The app called
// `refetch` nowhere. So one failed or raced read at mount was permanent until a
// full page reload — which is exactly the operator's cure, and the reason the
// reload "fixed" a balance the app had simply never re-asked for.
//
// ⚠️ WHAT THIS FILE DOES NOT ESTABLISH: why that one mount read failed or raced
// in the operator's session. Nobody observed it. What is established is that
// the app had no way to recover from it, which is sufficient to produce the
// reported symptom — not the same claim as knowing the trigger.
//
// THE SEAM THESE COUNT ON. `GET_BUZZ_BALANCE` is the real outbound protocol
// message the hook posts; the mock host's `onOutbound` sees every one. So the
// count below is the number of times the block actually asked the host, not a
// stub's call count — and it goes through the SDK transport unmodified.
//
// 🔴 THE REFETCH BUDGET, which is the whole risk of adding refetches at all.
// The token re-mints roughly every two minutes, so anything keyed on token
// churn fires forever. Every case here asserts an EXACT count, never an
// at-least — an at-least would be satisfied by a refetch loop, which is the
// defect this change is most likely to introduce.

import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Harness, createMockHost } from '@civitai/blocks-react/testing';
import type { BlockWorkflowSnapshot } from '@civitai/app-sdk/blocks';
import type { SharedListItem } from '@civitai/blocks-react';

import { BALANCE_UNKNOWN_MESSAGE, BALANCE_LOADING_MESSAGE } from './components/ResultsGrid.js';
import { fakeAppStorage, fakeShared, fakeGatedCell, immediateSleep } from './test-helpers.js';
import type { CombinationData, PromptData } from './types.js';

/**
 * The scopes the block's token reports — same driven-token seam as
 * `src/consentResume.test.tsx`, and for the same reason: only a driven token can
 * express a refresh that hands down a NEW array with the SAME contents, which is
 * the churn a refetch must not ride.
 */
const scopesBox: { current: string[] | null } = { current: null };

vi.mock('@civitai/blocks-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@civitai/blocks-react')>();
  return {
    ...actual,
    useBlockToken: () => {
      const real = actual.useBlockToken();
      return scopesBox.current === null ? real : { ...real, scopes: scopesBox.current };
    },
  };
});

const { App } = await import('./App.js');

const GRANTED = () => ['apps:storage:shared:read', 'ai:write:budgeted'];
const UNGRANTED = () => ['apps:storage:shared:read'];

beforeEach(() => {
  scopesBox.current = null;
});
afterEach(() => {
  vi.restoreAllMocks();
});

const comboData: CombinationData = {
  v: 2,
  kind: 'combination',
  configs: [
    {
      id: 'cfgSeed',
      checkpoint: { versionId: 1001, modelId: 500, baseModel: 'SDXL 1.0', modelName: 'JuggernautXL' },
      loras: [],
    },
  ],
};
const promptData: PromptData = {
  v: 3,
  kind: 'prompt',
  default: { prompt: 'cyberpunk portrait', params: { cfgScale: 5, steps: 30 } },
};

const estimateSnap: BlockWorkflowSnapshot = { workflowId: '', status: 'pending', cost: { total: 12 } };
const processingSnap: BlockWorkflowSnapshot = { workflowId: 'wf1', status: 'processing' };

function row(key: string, title: string, data: CombinationData | PromptData): SharedListItem {
  return {
    key,
    authorUserId: 7,
    count: 3,
    viewerVoted: false,
    value: { title, body: '', data },
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}
/** One combination × one prompt — a single empty, runnable cell. */
const seedOneCell = (): SharedListItem[] => [row('c1', 'Grid Combo', comboData), row('p1', 'Alpha', promptData)];

/** Count every `GET_BUZZ_BALANCE` the block posts to the host. */
function balanceReads(log: Array<{ type: string }>): number {
  return log.filter((m) => m.type === 'GET_BUZZ_BALANCE').length;
}

/** Open Grids and press the single empty cell's Run button. */
async function pressRunCell() {
  await userEvent.click(await screen.findByRole('tab', { name: /^Grids$/ }));
  const grid = await screen.findByTestId('results-grid');
  await userEvent.click(within(grid).getByTestId('run-cell'));
}

// ---------------------------------------------------------------------------
// (b) RE-READ THE BALANCE WHEN IT CAN HAVE CHANGED
// ---------------------------------------------------------------------------
describe('🔴 the balance is re-read when it can have changed — and only then', () => {
  function block(deps: Record<string, unknown>, opts: { consentGranted: boolean; onOutbound: (m: { type: string }) => void }) {
    return (
      <Harness
        viewer={{ id: 99, username: 'me' }}
        theme="dark"
        consentGranted={opts.consentGranted}
        buzzBudget={1000}
        buzz={{ balance: 5000 }}
        buzzBalance={{ blue: 0, green: 0, yellow: 5000 }}
        shared={{ seed: [] }}
        showLog={false}
        onOutbound={opts.onOutbound}
      >
        <App
          deps={{
            resolveResources: async () => [],
            pollIntervalMs: 0,
            sleep: immediateSleep,
            GatedCell: fakeGatedCell({ visibleIds: [9001] }),
            estimate: async () => estimateSnap,
            ...deps,
          }}
        />
      </Harness>
    );
  }

  it('1. 🔴 a CONSENT GRANT re-reads it — the viewer may have just come back from a top-up', async () => {
    // Pre-change this stays at 1 (the mount read) forever: the app called
    // `refetch` nowhere, so a viewer who granted consent mid-session ran the
    // whole rest of the page against whatever the mount read produced —
    // including `null`, which the confirm cell then mislabelled.
    const log: Array<{ type: string }> = [];
    const { shared } = fakeShared({ seed: seedOneCell() });
    const { appStorage } = fakeAppStorage();

    render(block({ shared, appStorage }, { consentGranted: false, onOutbound: (m) => log.push(m) }));
    await screen.findByRole('tab', { name: /^Grids$/ });
    await waitFor(() => expect(balanceReads(log)).toBe(1));

    // The real round-trip: the press asks for consent, the mock host grants and
    // pushes a fresh token carrying the scope.
    await pressRunCell();
    await screen.findByTestId('cell-confirm-run');

    await waitFor(() => expect(balanceReads(log)).toBe(2));
  });

  it('2. 🔴 at most ONCE per grant — later token refreshes carrying the same scope add nothing', async () => {
    // The budget assertion. A refetch keyed on the token (or on `token.scopes`,
    // a NEW array every re-mint) would climb here forever; the exact count is
    // what an at-least assertion could not tell apart from that loop.
    scopesBox.current = UNGRANTED();
    const log: Array<{ type: string }> = [];
    const { shared } = fakeShared({ seed: seedOneCell() });
    const { appStorage } = fakeAppStorage();
    const deps = { shared, appStorage, requestConsent: vi.fn() };
    const opts = { consentGranted: false, onOutbound: (m: { type: string }) => log.push(m) };

    const view = render(block(deps, opts));
    await screen.findByRole('tab', { name: /^Grids$/ });
    await waitFor(() => expect(balanceReads(log)).toBe(1));

    await pressRunCell();

    // The grant lands.
    scopesBox.current = GRANTED();
    view.rerender(block(deps, opts));
    await screen.findByTestId('cell-confirm-run');
    await waitFor(() => expect(balanceReads(log)).toBe(2));

    // …and now three ordinary re-mints, each a fresh array with identical
    // contents — exactly what the SDK hands down every ~2 minutes.
    for (let i = 0; i < 3; i++) {
      scopesBox.current = GRANTED();
      view.rerender(block(deps, opts));
      // eslint-disable-next-line no-await-in-loop
      await act(async () => {});
    }
    expect(balanceReads(log), 'a token refresh re-read the balance').toBe(2);

    // 🔴 AND THE FLAP, which is the case the consume-before-acting slot is
    // actually FOR. The re-mints above leave the effect's boolean dependency
    // unchanged, so they never re-enter it — an assertion over those alone would
    // pass with the slot deleted. A scope that drops and comes back DOES re-enter
    // it (the same shape the consent-replay docblock names), and only the
    // consumed slot stops that from being a second read.
    scopesBox.current = UNGRANTED();
    view.rerender(block(deps, opts));
    await act(async () => {});
    scopesBox.current = GRANTED();
    view.rerender(block(deps, opts));
    await act(async () => {});
    expect(balanceReads(log), 'a scope flap re-read the balance').toBe(2);
  });

  it('3. INVARIANT GUARD (green pre-change): token churn with NO consent ask re-reads nothing', async () => {
    // 🔴 Labelled, not counted as regression coverage: pre-change NOTHING ever
    // re-read the balance, so this passed vacuously before the fix. It exists to
    // pin the budget from the other side — an already-consented viewer must not
    // pay a second read just for mounting or for the token hydrating.
    scopesBox.current = GRANTED();
    const log: Array<{ type: string }> = [];
    const { shared } = fakeShared({ seed: seedOneCell() });
    const { appStorage } = fakeAppStorage();
    const deps = { shared, appStorage };
    const opts = { consentGranted: true, onOutbound: (m: { type: string }) => log.push(m) };

    const view = render(block(deps, opts));
    await screen.findByRole('tab', { name: /^Grids$/ });
    await waitFor(() => expect(balanceReads(log)).toBe(1));

    for (let i = 0; i < 3; i++) {
      scopesBox.current = GRANTED();
      view.rerender(block(deps, opts));
      // eslint-disable-next-line no-await-in-loop
      await act(async () => {});
    }
    expect(balanceReads(log)).toBe(1);
  });

  it('4. 🔴 a SUBMIT re-reads it — the generation just debited the balance', async () => {
    // The SDK's own docstring names this case ("e.g. after a generation debits
    // the balance") and the app ignored it: every subsequent cell in the session
    // was gated against a pre-spend number.
    const log: Array<{ type: string }> = [];
    const { shared } = fakeShared({ seed: seedOneCell() });
    const { appStorage } = fakeAppStorage();
    const submit = vi.fn(async () => processingSnap);

    render(
      block(
        {
          shared,
          appStorage,
          submit,
          poll: () => new Promise<BlockWorkflowSnapshot>(() => {}), // stays in flight
          publish: async () => [],
        },
        { consentGranted: true, onOutbound: (m) => log.push(m) },
      ),
    );
    await screen.findByRole('tab', { name: /^Grids$/ });
    await waitFor(() => expect(balanceReads(log)).toBe(1));

    await pressRunCell();
    await userEvent.click(await screen.findByTestId('cell-confirm-run'));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));

    await waitFor(() => expect(balanceReads(log)).toBe(2));
  });

  it('5. CONTROL: a run that never reaches submit does NOT re-read it', async () => {
    // Proves case 4 is attached to the SPEND and not to "the viewer pressed
    // something". Cancelling at the confirm gate spends nothing, so nothing was
    // debited and nothing needs re-reading.
    const log: Array<{ type: string }> = [];
    const { shared } = fakeShared({ seed: seedOneCell() });
    const { appStorage } = fakeAppStorage();
    const submit = vi.fn(async () => processingSnap);

    render(
      block({ shared, appStorage, submit }, { consentGranted: true, onOutbound: (m) => log.push(m) }),
    );
    await screen.findByRole('tab', { name: /^Grids$/ });
    await waitFor(() => expect(balanceReads(log)).toBe(1));

    await pressRunCell();
    await userEvent.click(await screen.findByTestId('cell-cancel-run'));
    await act(async () => {});

    expect(submit).not.toHaveBeenCalled();
    expect(balanceReads(log)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// (c) RECOVER FROM A FAILED INITIAL READ
// ---------------------------------------------------------------------------
describe('🔴 a failed initial balance read is recoverable without a page reload', () => {
  /**
   * Installs the mock host DIRECTLY rather than through `<Harness>`: the
   * Harness snapshots its options once per mount (`optionsRef`), so a rerender
   * cannot flip `buzzBalanceError`. `setScenario` is the only seam that can
   * turn a failing balance read into a succeeding one mid-session — which is
   * precisely the thing a retry has to be tested against.
   */
  function installHost(onOutbound: (m: { type: string }) => void) {
    const host = createMockHost({
      viewer: { id: 99, username: 'me' },
      theme: 'dark',
      consentGranted: true,
      buzzBudget: 1000,
      buzz: { balance: 5000 },
      buzzBalance: { blue: 0, green: 0, yellow: 5000 },
      buzzBalanceError: true, // the one mount read FAILS
      shared: { seed: [] },
      onOutbound,
    });
    return { host, uninstall: host.install() };
  }

  it('reports the read as UNREADABLE (never as insufficient) and recovers on RETRY', async () => {
    const log: Array<{ type: string }> = [];
    const { host, uninstall } = installHost((m) => log.push(m));
    try {
      const { shared } = fakeShared({ seed: seedOneCell() });
      const { appStorage } = fakeAppStorage();
      const submit = vi.fn(async () => processingSnap);
      render(
        <App
          deps={{
            resolveResources: async () => [],
            pollIntervalMs: 0,
            sleep: immediateSleep,
            GatedCell: fakeGatedCell({ visibleIds: [9001] }),
            estimate: async () => estimateSnap,
            shared,
            appStorage,
            submit,
          }}
        />,
      );

      await pressRunCell();
      await screen.findByTestId('cell-confirm-run');

      // 🔴 THE OPERATOR'S SCREEN. The cost is known (12); the balance is not,
      // because the host refused the read. The app must say THAT.
      const unreadable = await screen.findByTestId('cell-balance-unknown');
      expect(unreadable).toHaveTextContent(BALANCE_UNKNOWN_MESSAGE);
      expect(screen.queryByTestId('cell-insufficient')).toBeNull();
      expect(screen.getByTestId('cell-confirm-run')).toBeDisabled();
      const readsBeforeRetry = balanceReads(log);

      // The host recovers (a blip, a re-auth, a top-up round-trip) and the
      // viewer presses the affordance instead of reloading the page.
      host.setScenario({ buzzBalanceError: false });

      // 🔴 THE IN-FLIGHT WINDOW, asserted SYNCHRONOUSLY and deliberately so.
      // A synchronous `act` flushes React's own work but drains no microtask or
      // task queue, so the host has provably not answered yet: `refetch` has set
      // `loading` and the balance is still `null`. This is the one deterministic
      // moment where the app must say "checking", not "could not be read" — and
      // it is the only thing that pins `buzzBalanceLoading` to the hook's real
      // `loading` rather than to a constant. `await`ing the click instead
      // dissolves the window and the assertion becomes unfalsifiable.
      act(() => {
        screen.getByTestId('cell-balance-retry').click();
      });
      expect(screen.getByTestId('cell-balance-unknown')).toHaveTextContent(BALANCE_LOADING_MESSAGE);
      expect(
        screen.queryByTestId('cell-balance-retry'),
        'a retry was offered while the retry it started was still in flight',
      ).toBeNull();
      await act(async () => {});

      await waitFor(() => expect(screen.queryByTestId('cell-balance-unknown')).toBeNull());
      expect(screen.getByTestId('cell-confirm-run')).not.toBeDisabled();
      // The retry is a real host round-trip, not a local state flip.
      expect(balanceReads(log)).toBe(readsBeforeRetry + 1);
      // And it is bounded: one press, one read — no automatic retry loop.
      expect(readsBeforeRetry).toBe(1);
    } finally {
      uninstall();
    }
  });
});
