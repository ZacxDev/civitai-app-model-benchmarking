// 🔴 CONSENT AUTO-RESUME — the run a viewer pressed for must COMPLETE on the
// grant, not be silently dropped.
//
// THE DEFECT. `beginRun` checked `hasGenerateScope(token.scopes)`, called
// `requestConsent(...)` and `return`ed — discarding the `(row, prompt)` it had
// just been handed. Nothing re-invoked it when the scope arrived, so a viewer
// who pressed Run, read the host's dialog and clicked Allow was returned to a
// grid where nothing had happened. The operator reported exactly that: "after
// consenting, I had to re-trigger the action".
//
// 🔴 WHY THE RETRY BELONGS TO THE BLOCK AND NOT THE HOST. `REQUEST_CONSENT`
// carries NO `requestId` — it is a fire-and-forget push (SDK
// `useRequestConsent`, host `PageBlockHost.tsx`) — so the host cannot correlate
// a grant back to an in-flight submit even in principle. The grant reaches the
// block only as a fresh token on `TOKEN_REFRESH`. `src/scopes.ts` states the
// same contract. So: hold the action, watch the token, replay once.
//
// WHAT EACH CASE PINS, and which are the ones to watch RED against the
// pre-change tree:
//   1. 🔴 RED PRE-CHANGE — a grant completes the pressed action with no second
//      press (both through the REAL mock-host consent round-trip and through a
//      driven token).
//   2. 🔴 RED ON A DOUBLE-FIRE — a token refresh landing while the replay is
//      still in flight must not start a second one. This is the case a
//      `useEffect(…, [token.scopes])` keyed on the ARRAY fails: the token
//      re-mints roughly every two minutes, handing down a new array each time.
//   3. the replay STOPS at the confirm gate — it estimates, it does not spend.
//   4. a later press SUPERSEDES an earlier held one: two presses, one grant, ONE
//      run, and it is the second cell.
//   5. a grant that arrives after `CONSENT_RESUME_TTL_MS` is not a reply to the
//      press, and does not replay it.
//   6. a viewer swap drops the held action (a different account's grant must not
//      complete the previous viewer's press).
//   7. POSITIVE CONTROL — with no press held, a grant replays nothing. Without
//      it a zero in (5)/(6) is indistinguishable from a probe wired to nothing.

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Harness } from '@civitai/blocks-react/testing';
import type { BlockWorkflowSnapshot } from '@civitai/app-sdk/blocks';
import type { SharedListItem } from '@civitai/blocks-react';

import { fakeAppStorage, fakeShared, fakeGatedCell, immediateSleep } from './test-helpers.js';
import type { CombinationData, PromptData } from './types.js';

/**
 * The scopes the block's token reports. `null` = pass the REAL harness token
 * through untouched, which is what case (1a) uses to exercise the genuine
 * REQUEST_CONSENT → grant → TOKEN_REFRESH round-trip end to end. Every other
 * case drives this box, because only a driven token can express the thing that
 * has to be pinned: a refresh handing down a NEW array with the SAME contents.
 */
const scopesBox: { current: string[] | null } = { current: null };
/** The live viewer, swapped without a remount (see `src/viewer-change.test.tsx`). */
const viewerBox: { current: { id: number; username: string } | null } = {
  current: { id: 99, username: 'me' },
};

vi.mock('@civitai/blocks-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@civitai/blocks-react')>();
  return {
    ...actual,
    useBlockToken: () => {
      const real = actual.useBlockToken();
      return scopesBox.current === null ? real : { ...real, scopes: scopesBox.current };
    },
    useBlockContext: () => {
      const real = actual.useBlockContext();
      return { ...real, viewer: viewerBox.current };
    },
  };
});

const { App, CONSENT_RESUME_TTL_MS } = await import('./App.js');

const GRANTED = () => ['apps:storage:shared:read', 'ai:write:budgeted'];
const UNGRANTED = () => ['apps:storage:shared:read'];

beforeEach(() => {
  scopesBox.current = null;
  viewerBox.current = { id: 99, username: 'me' };
});
afterEach(() => {
  vi.useRealTimers();
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
const promptData = (p: string): PromptData => ({
  v: 3,
  kind: 'prompt',
  default: { prompt: p, params: { cfgScale: 5, steps: 30 } },
});

const estimateSnap: BlockWorkflowSnapshot = {
  workflowId: '',
  status: 'pending',
  cost: { total: 12 },
};

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

/** One combination × ONE prompt — a single empty cell. */
function seedOneCell(): SharedListItem[] {
  return [row('c1', 'Grid Combo', comboData), row('p1', 'Alpha', promptData('a portrait'))];
}
/** One combination × TWO prompts — two empty cells, for the supersede case. */
function seedTwoCells(): SharedListItem[] {
  return [
    row('c1', 'Grid Combo', comboData),
    row('p1', 'Alpha', promptData('a portrait')),
    row('p2', 'Beta', promptData('a landscape')),
  ];
}

function block(deps: Record<string, unknown>, opts: { consentGranted: boolean }) {
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

/** Open Grids and return the run buttons of every empty cell, in column order. */
async function runButtons(): Promise<HTMLElement[]> {
  await userEvent.click(await screen.findByRole('tab', { name: /^Grids$/ }));
  const grid = await screen.findByTestId('results-grid');
  await within(grid).findAllByTestId('run-cell');
  return within(grid).getAllByTestId('run-cell');
}

describe('🔴 a grant completes the action that asked for it', () => {
  it('1a. END TO END through the real consent round-trip: press → grant → estimating, no second press', async () => {
    // The REAL token drives this one (`scopesBox` untouched): the app's own
    // `useRequestConsent()` posts REQUEST_CONSENT to the mock host, which grants
    // and pushes a host-initiated TOKEN_REFRESH carrying the new scope — the
    // exact sequence the live host performs. Nothing about consent is faked.
    const { shared } = fakeShared({ seed: seedOneCell() });
    const { appStorage } = fakeAppStorage();
    const estimate = vi.fn(async () => estimateSnap);
    const submit = vi.fn(async () => ({ workflowId: 'wf1', status: 'processing' }) as BlockWorkflowSnapshot);

    render(block({ shared, appStorage, estimate, submit }, { consentGranted: false }));

    const [runBtn] = await runButtons();
    await userEvent.click(runBtn);

    // 🔴 THE REGRESSION. Pre-change this never arrives: the press requested
    // consent and dropped the action, so the cell sat empty until pressed again.
    await screen.findByTestId('cell-confirm-run');
    expect(estimate, 'the granted scope did not complete the pressed run').toHaveBeenCalledTimes(1);
    // …and it stopped at the gate. A resume must never be a spend.
    expect(submit).not.toHaveBeenCalled();
  });

  it('1b. the same thing with a DRIVEN token (the scope simply appears)', async () => {
    scopesBox.current = UNGRANTED();
    const { shared } = fakeShared({ seed: seedOneCell() });
    const { appStorage } = fakeAppStorage();
    const estimate = vi.fn(async () => estimateSnap);
    const requestConsent = vi.fn();

    const deps = { shared, appStorage, estimate, requestConsent };
    const view = render(block(deps, { consentGranted: false }));

    const [runBtn] = await runButtons();
    await userEvent.click(runBtn);
    expect(requestConsent).toHaveBeenCalledWith({ scopes: ['ai:write:budgeted'] });
    expect(estimate, 'estimated before the scope existed').not.toHaveBeenCalled();

    // The host grants: the next token carries the scope.
    scopesBox.current = GRANTED();
    view.rerender(block(deps, { consentGranted: false }));

    await screen.findByTestId('cell-confirm-run');
    expect(estimate).toHaveBeenCalledTimes(1);
  });
});

describe('🔴 at most ONE run per grant', () => {
  it('2. a token refresh DURING the replay does not start a second run', async () => {
    // 🔴 THE SHAPE THIS CATCHES. The token re-mints roughly every two minutes and
    // each refresh hands down a NEW `scopes` array with the same contents. An
    // effect keyed on that array therefore re-runs on ordinary churn — and if the
    // held action is cleared only AFTER the replay resolves, the second pass
    // finds it still set and replays it again. The estimate is held open here so
    // that window is deterministic rather than a race.
    scopesBox.current = UNGRANTED();
    let release: (() => void) | undefined;
    const estimate = vi.fn(
      () =>
        new Promise<BlockWorkflowSnapshot>((resolve) => {
          release = () => resolve(estimateSnap);
        }),
    );
    const { shared } = fakeShared({ seed: seedOneCell() });
    const { appStorage } = fakeAppStorage();
    const deps = { shared, appStorage, estimate };

    const view = render(block(deps, { consentGranted: false }));
    const [runBtn] = await runButtons();
    await userEvent.click(runBtn);

    // The grant.
    scopesBox.current = GRANTED();
    view.rerender(block(deps, { consentGranted: false }));
    await waitFor(() => expect(estimate).toHaveBeenCalledTimes(1));

    // …and now two ordinary refreshes while that estimate is still open. Same
    // scope, NEW array each time — which is exactly what the SDK hands down.
    scopesBox.current = GRANTED();
    view.rerender(block(deps, { consentGranted: false }));
    scopesBox.current = GRANTED();
    view.rerender(block(deps, { consentGranted: false }));
    // …and a FLAP: a refresh that briefly reports the scope missing and then
    // carries it again. 🔴 This is the half that makes the case bite. Measured by
    // mutation: with the held action consumed only AFTER the replay resolves,
    // this second false→true transition finds it still set and starts a second
    // run — and that mutant survives the plain refreshes above, because they do
    // not re-enter the effect at all. Consuming the slot BEFORE the replay is
    // what kills it.
    scopesBox.current = UNGRANTED();
    view.rerender(block(deps, { consentGranted: false }));
    scopesBox.current = GRANTED();
    view.rerender(block(deps, { consentGranted: false }));

    release?.();
    await screen.findByTestId('cell-confirm-run');

    expect(
      estimate,
      'a token refresh replayed the held action a second time',
    ).toHaveBeenCalledTimes(1);
  });

  it('4. the LATER press supersedes the earlier held one — two presses, one grant, one run', async () => {
    scopesBox.current = UNGRANTED();
    const { shared } = fakeShared({ seed: seedTwoCells() });
    const { appStorage } = fakeAppStorage();
    const estimate = vi.fn(async () => estimateSnap);
    const deps = { shared, appStorage, estimate };

    const view = render(block(deps, { consentGranted: false }));
    const buttons = await runButtons();
    expect(buttons).toHaveLength(2);
    // Press the FIRST cell, change their mind, press the SECOND.
    await userEvent.click(buttons[0]!);
    await userEvent.click(buttons[1]!);

    scopesBox.current = GRANTED();
    view.rerender(block(deps, { consentGranted: false }));

    await screen.findByTestId('cell-confirm-run');
    expect(estimate, 'both held presses ran').toHaveBeenCalledTimes(1);
    // And it is the cell they pressed LAST: exactly one cell left `empty`, and
    // it is the first column. (`run-cell` renders only in an empty cell.)
    const grid = await screen.findByTestId('results-grid');
    const stillEmpty = within(grid).getAllByTestId('run-cell');
    expect(stillEmpty).toHaveLength(1);
    expect(stillEmpty[0]).toHaveAttribute('aria-label', expect.stringContaining('Alpha'));
  });
});

describe('a held action is not replayed once it stops being a reply to the press', () => {
  it('5. a grant arriving after the TTL does not replay it', async () => {
    scopesBox.current = UNGRANTED();
    const { shared } = fakeShared({ seed: seedOneCell() });
    const { appStorage } = fakeAppStorage();
    const estimate = vi.fn(async () => estimateSnap);
    const deps = { shared, appStorage, estimate };

    const view = render(block(deps, { consentGranted: false }));
    const [runBtn] = await runButtons();

    // 🔴 FREEZE THE CLOCK ACROSS THE PRESS, don't merely read it before. The
    // press is several milliseconds of `userEvent` work, so an offset measured
    // from BEFORE it lands that many ms SHORT of the boundary — the first draft
    // of this case did exactly that, sat just inside the TTL, and failed for a
    // reason that had nothing to do with the behaviour under test.
    const t0 = Date.now();
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(t0);
    await userEvent.click(runBtn);

    // The viewer ignores the dialog and grants the scope somewhere else on
    // civitai, much later. Their next token carries it — but it is no longer an
    // answer to this press. One millisecond past the bound, so the case pins the
    // bound rather than some comfortable distance from it.
    nowSpy.mockReturnValue(t0 + CONSENT_RESUME_TTL_MS + 1);
    scopesBox.current = GRANTED();
    view.rerender(block(deps, { consentGranted: false }));

    await waitFor(() => expect(screen.queryByTestId('cell-progress')).toBeNull());
    expect(estimate, 'replayed a press the viewer had long abandoned').not.toHaveBeenCalled();
    // The cell is still there to press, which is the correct fallback.
    const grid = await screen.findByTestId('results-grid');
    expect(within(grid).getAllByTestId('run-cell')).toHaveLength(1);
  });

  it('6. a VIEWER SWAP drops the held action', async () => {
    scopesBox.current = UNGRANTED();
    const { shared } = fakeShared({ seed: seedOneCell() });
    const { appStorage } = fakeAppStorage();
    const estimate = vi.fn(async () => estimateSnap);
    const deps = { shared, appStorage, estimate };

    const view = render(block(deps, { consentGranted: false }));
    const [runBtn] = await runButtons();
    await userEvent.click(runBtn);

    // The host swaps the account WITHOUT remounting the block, then that account's
    // token turns out to carry the scope. The press belonged to someone else.
    viewerBox.current = { id: 1234, username: 'other' };
    scopesBox.current = GRANTED();
    view.rerender(block(deps, { consentGranted: false }));

    await waitFor(() => expect(screen.queryByTestId('cell-progress')).toBeNull());
    expect(estimate, "completed the previous viewer's press").not.toHaveBeenCalled();
  });

  it('7. POSITIVE CONTROL: a grant with NOTHING held replays nothing', async () => {
    // Keeps the zeros above readable as absences rather than as a probe wired to
    // nothing: the SAME transition (ungranted → granted, same rerender shape)
    // runs here with no press in front of it, and the run path is proven live by
    // the press that follows it.
    scopesBox.current = UNGRANTED();
    const { shared } = fakeShared({ seed: seedOneCell() });
    const { appStorage } = fakeAppStorage();
    const estimate = vi.fn(async () => estimateSnap);
    const deps = { shared, appStorage, estimate };

    const view = render(block(deps, { consentGranted: false }));
    await runButtons();

    scopesBox.current = GRANTED();
    view.rerender(block(deps, { consentGranted: false }));

    await waitFor(() => expect(screen.queryByTestId('cell-progress')).toBeNull());
    expect(estimate, 'ran a cell nobody pressed').not.toHaveBeenCalled();

    // …and the path is genuinely wired: one press now, one estimate.
    const [runBtn] = await runButtons();
    await userEvent.click(runBtn);
    await screen.findByTestId('cell-confirm-run');
    expect(estimate).toHaveBeenCalledTimes(1);
  });
});
