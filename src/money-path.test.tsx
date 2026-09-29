// 🔴 MONEY PATH regression suite — the cell-run spend path (estimate → confirm →
// submit → poll → publish). These guard the two dogfood-flagged money bugs:
//   #1 double-click Confirm must NEVER submit (spend) twice — a synchronous
//      in-flight claim, not render-timing luck.
//   #2 a still-running generation must survive a reload: its workflow is persisted
//      to per-viewer KV, rehydrated as an IN-FLIGHT (stalled) cell — never an
//      empty+runnable cell that a re-run would double-charge — and offers a
//      resume-poll that re-polls the SAME workflow (no re-submit).
// Driven through the real App with the money-path hooks injected via `deps` so
// submit/poll/publish are fully controllable and countable.

import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Harness } from './test-harness.js';
import type { BlockWorkflowSnapshot } from '@civitai/app-sdk/blocks';
import { WorkflowEstimateError } from '@civitai/blocks-react';
import type { SharedItem } from '@civitai/sdk';

import {
  App,
  CLAIM_FAILED_MESSAGE,
  CLAIM_NO_VIEWER_MESSAGE,
  ESTIMATE_FAILED_MESSAGE,
  ESTIMATE_NO_COST_MESSAGE,
  type AppDeps,
} from './App.js';
import { RUN_UNKNOWN_MESSAGE } from './components/ResultsGrid.js';
import type { CombinationData, PromptData } from './types.js';
import { KV_MAX_PAGES } from './lib/kv.js';
import { fakeAppStorage, fakeShared, fakeGatedCell, immediateSleep } from './test-helpers.js';

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

// The single grid cell the seed produces: combo 'c1' / config 'cfgSeed' / prompt 'p1'.
const CK = 'c1::cfgSeed::p1';
const INFLIGHT_KEY = `inflight:v1:${CK}`;

function seedRows(): SharedItem[] {
  return [
    { key: 'c1', authorUserId: 7, count: 3, viewerVoted: false, value: { title: 'Grid Combo', body: '', data: comboData }, createdAt: new Date(0), updatedAt: new Date(0) },
    { key: 'p1', authorUserId: 8, count: 3, viewerVoted: false, value: { title: 'Grid Prompt', body: '', data: promptData }, createdAt: new Date(0), updatedAt: new Date(0) },
  ];
}

const processingSnap: BlockWorkflowSnapshot = { workflowId: 'wf1', status: 'processing' };
const succeededSnap = (id = 'wf1'): BlockWorkflowSnapshot => ({ workflowId: id, status: 'succeeded' });
const estimateSnap: BlockWorkflowSnapshot = { workflowId: '', status: 'pending', cost: { total: 12 } };

function renderApp(deps: Partial<AppDeps>) {
  render(
    <Harness
      viewer={{ id: 99, username: 'me' }}
      theme="dark"
      consentGranted
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
          GatedCell: fakeGatedCell({ visibleIds: [9001], hiddenIds: [9002] }),
          ...deps,
        }}
      />
    </Harness>,
  );
}

/** Drive a fresh cell to the `confirming` state (Run this cell → estimate). */
async function toConfirming() {
  await screen.findByTestId('grid-view');
  const grid = await screen.findByTestId('results-grid');
  const cell = within(grid).getByTestId('grid-cell');
  expect(cell).toHaveAttribute('data-state', 'empty');
  await userEvent.click(within(cell).getByTestId('run-cell'));
  await screen.findByTestId('cell-confirm-run');
}

describe('#1 re-entrancy: a double-clicked Confirm spends exactly once', () => {
  it('invokes submit ONCE even when Confirm is clicked twice before the re-render', async () => {
    const submit = vi.fn(async () => processingSnap);
    const { shared } = fakeShared({ seed: seedRows() });
    const { appStorage } = fakeAppStorage();
    renderApp({
      shared,
      appStorage,
      estimate: async () => estimateSnap,
      submit,
      poll: async () => succeededSnap(),
      publish: async () => [],
    });

    await toConfirming();

    // Two synchronous clicks in ONE act flush — the confirm button is still
    // mounted between them, so both fire onConfirm. The guard must collapse them.
    const btn = screen.getByTestId('cell-confirm-run');
    await act(async () => {
      btn.click();
      btn.click();
    });

    expect(submit).toHaveBeenCalledTimes(1);
  });
});

describe('#2 stalled persistence: an in-flight workflow survives a reload', () => {
  it('persists the in-flight workflow to per-viewer KV the moment it is submitted', async () => {
    const submit = vi.fn(async () => processingSnap);
    const { shared } = fakeShared({ seed: seedRows() });
    const { appStorage, store } = fakeAppStorage();
    renderApp({
      shared,
      appStorage,
      estimate: async () => estimateSnap,
      submit,
      poll: () => new Promise<BlockWorkflowSnapshot>(() => {}), // never terminal → stays in-flight
      publish: async () => [],
    });

    await toConfirming();
    await userEvent.click(screen.getByTestId('cell-confirm-run'));

    // The workflow row is persisted (keyed per cell) while the poll is still pending.
    await waitFor(() => expect(store.has(INFLIGHT_KEY)).toBe(true));
    expect(store.get(INFLIGHT_KEY)).toMatchObject({ workflowId: 'wf1', comboKey: 'c1', configId: 'cfgSeed', promptKey: 'p1' });
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('rehydrates a persisted in-flight run as a STALLED cell (never empty+runnable) — no auto re-submit', async () => {
    const submit = vi.fn(async () => processingSnap);
    const { shared } = fakeShared({ seed: seedRows() });
    // KV already holds a prior session's in-flight workflow for this cell.
    const { appStorage } = fakeAppStorage({
      [INFLIGHT_KEY]: { workflowId: 'wf-prior', comboKey: 'c1', configId: 'cfgSeed', promptKey: 'p1', ecosystem: 'SDXL' },
    });
    renderApp({ shared, appStorage, estimate: async () => estimateSnap, submit, poll: async () => succeededSnap(), publish: async () => [] });

    await screen.findByTestId('grid-view');
    const grid = await screen.findByTestId('results-grid');

    // The cell is IN-FLIGHT (stalled), not an empty runnable cell → cannot be re-charged.
    await waitFor(() => expect(within(grid).getByTestId('grid-cell')).toHaveAttribute('data-state', 'running'));
    expect(within(grid).getByTestId('cell-stalled')).toBeInTheDocument();
    expect(within(grid).queryByTestId('run-cell')).toBeNull();
    // Rehydration NEVER re-submits (no second charge).
    expect(submit).not.toHaveBeenCalled();
  });

  it('resume-poll on a stalled cell re-polls the SAME workflow (no re-submit), publishes, and clears the KV row', async () => {
    const submit = vi.fn(async () => processingSnap);
    const poll = vi.fn(async () => succeededSnap('wf-prior'));
    const { shared } = fakeShared({ seed: seedRows() });
    const { appStorage, store } = fakeAppStorage({
      [INFLIGHT_KEY]: { workflowId: 'wf-prior', comboKey: 'c1', configId: 'cfgSeed', promptKey: 'p1', ecosystem: 'SDXL' },
    });
    renderApp({ shared, appStorage, estimate: async () => estimateSnap, submit, poll, publish: async () => [9001, 9002] });

    await screen.findByTestId('grid-view');
    const grid = await screen.findByTestId('results-grid');
    await waitFor(() => expect(within(grid).getByTestId('cell-stalled')).toBeInTheDocument());

    await userEvent.click(within(grid).getByTestId('cell-resume-run'));

    // The result publishes + appends (via optimistic insert) → cell becomes a result.
    await waitFor(() => expect(screen.getByTestId('grid-cell')).toHaveAttribute('data-state', 'result'), { timeout: 3000 });
    expect(screen.getByTestId('result-image')).toHaveAttribute('src', expect.stringContaining('9001'));
    // Resume re-polled the existing workflow — it NEVER re-submitted (no re-charge).
    expect(submit).not.toHaveBeenCalled();
    expect(poll).toHaveBeenCalledWith('wf-prior');
    // Terminal → the persisted in-flight row is cleared.
    await waitFor(() => expect(store.has(INFLIGHT_KEY)).toBe(false));
  });
});

// ---------------------------------------------------------------------------
// The in-flight rehydrate must PAGE, and a rehydrate that cannot see everything
// must still fail safe.
// ---------------------------------------------------------------------------
//
// 🔴 THE DEFECT. The rehydrate called `appStorage.list({prefix})` with NO cursor
// and NO loop, while both draft listings paged correctly — two sites right, one
// never written. A viewer whose `inflight:v1:` keys crossed a host page boundary
// had every run beyond page 1 silently NOT rehydrated, so those cells rendered
// EMPTY AND RUNNABLE. Nothing downstream caught it: `inFlightRef` is in-memory
// and empty after a reload, and `confirmRun` did not consult the store before
// spending. That is the re-run double-charge the code's own 🔴 MONEY SAFETY
// comment says must never happen.
//
// ⚠️ REACHABILITY IS UNCONFIRMED AND DELIBERATELY NOT ASSERTED ANYWHERE. Whether
// a real viewer's keys cross a page depends on the host's default
// `APP_STORAGE_LIST` limit, which is not readable from this repo. The code shape
// is confirmed; the frequency is not. Do not let these tests be cited as
// evidence of how often it happened.
describe('in-flight rehydrate: paging, and failing safe when it cannot see everything', () => {
  const OTHER_CK = 'c1::cfgSeed::pOther';

  it('rehydrates a run whose key is NOT on the first host page', async () => {
    const submit = vi.fn(async () => processingSnap);
    const { shared } = fakeShared({ seed: seedRows() });
    // 🔴 THE REPRO: a decoy `inflight:v1:` key ahead of the real one, and a host
    // that serves ONE key per page. Insertion order is the fake's key order, so
    // the run this grid actually has a cell for lands on page 2.
    const { appStorage, listCalls } = fakeAppStorage(
      {
        [`inflight:v1:${OTHER_CK}`]: {
          workflowId: 'wf-decoy',
          comboKey: 'c1',
          configId: 'cfgSeed',
          promptKey: 'pOther',
          ecosystem: 'SDXL',
        },
        [INFLIGHT_KEY]: {
          workflowId: 'wf-prior',
          comboKey: 'c1',
          configId: 'cfgSeed',
          promptKey: 'p1',
          ecosystem: 'SDXL',
        },
      },
      {},
      { pageSize: 1 },
    );
    renderApp({
      shared,
      appStorage,
      estimate: async () => estimateSnap,
      submit,
      poll: async () => succeededSnap(),
      publish: async () => [],
    });

    await screen.findByTestId('grid-view');
    const grid = await screen.findByTestId('results-grid');

    // Same assertions as the single-key case: stalled, never empty+runnable.
    await waitFor(() =>
      expect(within(grid).getByTestId('grid-cell')).toHaveAttribute('data-state', 'running'),
    );
    expect(within(grid).getByTestId('cell-stalled')).toBeInTheDocument();
    expect(within(grid).queryByTestId('run-cell')).toBeNull();
    expect(submit).not.toHaveBeenCalled();

    // POSITIVE CONTROL ON THE PREMISE: the listing really did page. Without this
    // the case passes just as well against a one-page fixture and proves nothing
    // about the cursor.
    const inflightCalls = listCalls.filter((c) => c?.prefix === 'inflight:v1:');
    expect(inflightCalls.length).toBeGreaterThan(1);
    expect(
      inflightCalls.some((c) => typeof c?.cursor === 'string' && c.cursor.length > 0),
      'no in-flight listing ever carried a cursor — the fixture never paged',
    ).toBe(true);
  });

  it('🔴 LATENCY ARM: refuses to SPEND on a Confirm that lands WHILE the scan is still running', async () => {
    // 🔴 THE ARM THAT CAUGHT A LIVE MONEY BUG IN THE FIX ITSELF, and the reason
    // every timing-sensitive guard here needs one.
    //
    // The backstop flag used to start `false` and be set only when the scan
    // FINISHED. Every test in this file passed — because this fake resolves in
    // MICROTASKS, so a 20-page serial scan looks instantaneous and no Confirm
    // can ever land inside it. The real `useAppStorage` is a cross-origin HTTP
    // call — `POST /api/v1/blocks/app-storage/*` since the SDK port; it was a
    // `postMessage` to the host before, which the host then served with the SAME
    // server call, so it was never in-process either way — so every call is at
    // minimum a MACROTASK, and now a network round trip that may carry its own
    // CORS preflight. The truncated case — up to 20 `list` calls plus a `get` per
    // key, fully serial — is the slowest of all. In production a Confirm during
    // the scan read the un-armed flag and SPENT.
    //
    // `latencyMs` is the whole point of this case: it is the ONLY difference
    // from the page-cap case below. A fake faster than the real transport cannot
    // observe an ordering bug, and a suite that only has the fast fake will
    // report a clean green over one.
    const submit = vi.fn(async () => processingSnap);
    const { shared } = fakeShared({ seed: seedRows() });
    const decoys: Record<string, unknown> = {};
    for (let i = 0; i < 21; i += 1) {
      decoys[`inflight:v1:c1::cfgSeed::decoy${i}`] = {
        workflowId: `wf-decoy-${i}`,
        comboKey: 'c1',
        configId: 'cfgSeed',
        promptKey: `decoy${i}`,
        ecosystem: 'SDXL',
      };
    }
    const { appStorage, listCalls } = fakeAppStorage(
      {
        ...decoys,
        [INFLIGHT_KEY]: {
          workflowId: 'wf-prior',
          comboKey: 'c1',
          configId: 'cfgSeed',
          promptKey: 'p1',
          ecosystem: 'SDXL',
        },
      },
      {},
      { pageSize: 1, latencyMs: 2 },
    );
    renderApp({
      shared,
      appStorage,
      estimate: async () => estimateSnap,
      submit,
      poll: async () => succeededSnap(),
      publish: async () => [],
    });

    await screen.findByTestId('grid-view');
    const grid = await screen.findByTestId('results-grid');

    // The viewer reaches Confirm while the scan is still walking pages — which
    // is exactly the window the real bridge makes wide.
    const runCell = await within(grid).findByTestId('run-cell');
    await userEvent.click(runCell);
    await userEvent.click(await within(grid).findByTestId('cell-confirm-run'));

    // 🔴 POSITIVE CONTROL ON THE INSTRUMENT, checked at Confirm time and not
    // after. This case's entire discriminating power is that `latencyMs` puts
    // each KV call on a macrotask, so the scan is genuinely UNFINISHED here.
    // Nothing else pins that: making `hop()` return `Promise.resolve()` leaves
    // the whole suite green on its own, AND leaves it green when combined with
    // the money bug this case exists to catch. Without this line the arm can be
    // silently disarmed by a tidy-up of the fake and the double charge ships
    // clean. 22 keys at one per page means a finished scan has issued
    // KV_MAX_PAGES listings.
    expect(
      listCalls.filter((c) => c?.prefix === 'inflight:v1:').length,
      'the scan had already finished at Confirm time — `latencyMs` is inert, so this case tests nothing',
    ).toBeLessThan(KV_MAX_PAGES);

    await waitFor(() => expect(within(grid).queryByTestId('cell-confirm-run')).toBeNull());

    expect(
      submit,
      'a live generation was re-submitted during the rehydrate scan — double charge',
    ).not.toHaveBeenCalled();
  });

  it('🔴 an ADOPTED cell can still be RESUMED — the claim is released, not stranded', async () => {
    // 🔴 THE OTHER WAY THIS COSTS A USER MONEY. The adopt path returns EARLY, so
    // the `finally` that normally releases the synchronous `inFlightRef` claim
    // never runs — it has to be released by hand. Miss that and `resumeRun`'s
    // own `if (inFlightRef.current.has(ck)) return` fires forever: the cell is
    // adopted, shows Resume, and the button does NOTHING for the life of the
    // page. The viewer was charged for a generation they can never collect.
    //
    // A mutant deleting that one line survived the full 240-test suite.
    const submit = vi.fn(async () => processingSnap);
    const poll = vi.fn(async () => succeededSnap('wf-prior'));
    const { shared } = fakeShared({ seed: seedRows() });
    const { appStorage } = fakeAppStorage(
      {
        [INFLIGHT_KEY]: {
          workflowId: 'wf-prior',
          comboKey: 'c1',
          configId: 'cfgSeed',
          promptKey: 'p1',
          ecosystem: 'SDXL',
        },
      },
      {},
      { failListTimes: 1, failListPrefix: 'inflight:v1:' },
    );
    renderApp({
      shared,
      appStorage,
      estimate: async () => estimateSnap,
      submit,
      poll,
      publish: async () => [9001],
    });

    await screen.findByTestId('grid-view');
    const grid = await screen.findByTestId('results-grid');

    // Drive the adopt path (rehydrate threw → cell runnable → confirm adopts).
    await userEvent.click(await within(grid).findByTestId('run-cell'));
    await userEvent.click(await within(grid).findByTestId('cell-confirm-run'));
    await waitFor(() => expect(within(grid).getByTestId('cell-stalled')).toBeInTheDocument());
    expect(submit).not.toHaveBeenCalled();

    // 🔴 …and now the adopted cell must actually RESUME. This is the assertion
    // the missing release breaks: without it `resumeRun` returns immediately and
    // the cell sits on Resume forever.
    await userEvent.click(within(grid).getByTestId('cell-resume-run'));
    await waitFor(
      () => expect(screen.getByTestId('grid-cell')).toHaveAttribute('data-state', 'result'),
      { timeout: 3000 },
    );
    expect(poll, 'the adopted cell never resumed — its claim was never released').toHaveBeenCalledWith(
      'wf-prior',
    );
    // Resume re-polls; it never re-submits, so still no second charge.
    expect(submit).not.toHaveBeenCalled();
  });

  it('does NO store read before spending once a scan has completed (the gate actually gates)', async () => {
    // 🔴 PINS THE "deliberately gated" RATIONALE. Three mutants used to survive
    // the whole suite here — reporting a COMPLETE scan as truncated, reporting
    // an early `'stop'` as truncated, and replacing the gate with `if (true)` —
    // so nothing distinguished "gated" from "unconditional" and the stated
    // reason for the gate was pure prose.
    //
    // No persisted run, so the scan completes and stands the backstop down; the
    // viewer then confirms a genuinely fresh cell. The spend must happen with NO
    // read of the in-flight key.
    const submit = vi.fn(async () => processingSnap);
    const { shared } = fakeShared({ seed: seedRows() });
    const { appStorage, gets } = fakeAppStorage({});
    renderApp({
      shared,
      appStorage,
      estimate: async () => estimateSnap,
      submit,
      poll: async () => succeededSnap(),
      publish: async () => [9001],
    });

    await screen.findByTestId('grid-view');
    const grid = await screen.findByTestId('results-grid');
    const runCell = await within(grid).findByTestId('run-cell');
    // Let the (empty, one-page) scan finish before clicking, so the gate is
    // being tested in its stood-down state rather than its armed one.
    await waitFor(() => expect(within(grid).getByTestId('run-cell')).toBeInTheDocument());
    await new Promise((r) => setTimeout(r, 0));

    const before = gets.filter((k) => k === INFLIGHT_KEY).length;
    await userEvent.click(runCell);
    await userEvent.click(await within(grid).findByTestId('cell-confirm-run'));

    // POSITIVE CONTROL: the spend really happened, so "no read" is not just "no
    // click".
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(
      gets.filter((k) => k === INFLIGHT_KEY).length,
      'the backstop read the store on a path where the scan already answered the question',
    ).toBe(before);
  });

  it('POSITIVE CONTROL for the case above: `gets` DOES record the read on the armed path', async () => {
    // 🔴 THE ASSERTION ABOVE IS A ZERO, and a zero is indistinguishable from an
    // instrument wired to nothing. Measured: deleting `gets.push(key)` from the
    // fake leaves the whole suite green, because `gets` is only ever asserted
    // UNCHANGED. Its stated control there — `submit` called once — proves the
    // spend happened, not that `gets` can ever be non-zero.
    //
    // Same shape as that case, one thing changed: the rehydrate THROWS, so the
    // backstop is armed and the read must happen. If this ever goes to zero the
    // instrument is dead and the gate assertion above is vacuous.
    const submit = vi.fn(async () => processingSnap);
    const { shared } = fakeShared({ seed: seedRows() });
    const { appStorage, gets } = fakeAppStorage(
      { [INFLIGHT_KEY]: { workflowId: 'wf-prior', comboKey: 'c1', configId: 'cfgSeed', promptKey: 'p1', ecosystem: 'SDXL' } },
      {},
      { failListTimes: 1, failListPrefix: 'inflight:v1:' },
    );
    renderApp({
      shared,
      appStorage,
      estimate: async () => estimateSnap,
      submit,
      poll: async () => succeededSnap(),
      publish: async () => [],
    });

    await screen.findByTestId('grid-view');
    const grid = await screen.findByTestId('results-grid');
    await userEvent.click(await within(grid).findByTestId('run-cell'));
    await userEvent.click(await within(grid).findByTestId('cell-confirm-run'));
    await waitFor(() => expect(within(grid).getByTestId('cell-stalled')).toBeInTheDocument());

    expect(
      gets.filter((k) => k === INFLIGHT_KEY).length,
      '`gets` recorded nothing on the ARMED path — the instrument is dead, so the gate assertion is vacuous',
    ).toBeGreaterThan(0);
    expect(submit).not.toHaveBeenCalled();
  });

  it('🔴 refuses to SPEND when the rehydrate hit its PAGE CAP with keys still unread', async () => {
    // 🔴 THE TRUNCATED BRANCH, WHICH THE THROWING CASE BELOW DOES NOT COVER.
    // Both arm the same backstop, but by different routes: a throwing listing
    // arms it from the `catch`, a capped one from `scan.truncated`. A mutant
    // that never sets the flag on truncation survived the whole suite until this
    // case existed (239/239 green) — the throw case cannot see it.
    //
    // KV_MAX_PAGES is 20, so 21 decoys ahead of the real key at pageSize 1 means
    // the scan reads 20 keys, still has a cursor, and stops: the run this grid
    // has a cell for is never reached.
    const submit = vi.fn(async () => processingSnap);
    const { shared } = fakeShared({ seed: seedRows() });
    const decoys: Record<string, unknown> = {};
    for (let i = 0; i < 21; i += 1) {
      decoys[`inflight:v1:c1::cfgSeed::decoy${i}`] = {
        workflowId: `wf-decoy-${i}`,
        comboKey: 'c1',
        configId: 'cfgSeed',
        promptKey: `decoy${i}`,
        ecosystem: 'SDXL',
      };
    }
    const { appStorage } = fakeAppStorage(
      {
        ...decoys,
        [INFLIGHT_KEY]: {
          workflowId: 'wf-prior',
          comboKey: 'c1',
          configId: 'cfgSeed',
          promptKey: 'p1',
          ecosystem: 'SDXL',
        },
      },
      {},
      { pageSize: 1 },
    );
    renderApp({
      shared,
      appStorage,
      estimate: async () => estimateSnap,
      submit,
      poll: async () => succeededSnap(),
      publish: async () => [],
    });

    await screen.findByTestId('grid-view');
    const grid = await screen.findByTestId('results-grid');

    // POSITIVE CONTROL: the cap really did bite — this cell was NOT rehydrated,
    // so it is empty and runnable. If the scan had reached it this reads
    // `cell-stalled` and the case proves nothing about the backstop.
    const runCell = await within(grid).findByTestId('run-cell');
    expect(within(grid).queryByTestId('cell-stalled')).toBeNull();

    await userEvent.click(runCell);
    await userEvent.click(await within(grid).findByTestId('cell-confirm-run'));
    await waitFor(() => expect(within(grid).queryByTestId('cell-confirm-run')).toBeNull());

    expect(
      submit,
      'a live generation was re-submitted after a TRUNCATED rehydrate — double charge',
    ).not.toHaveBeenCalled();
    expect(within(grid).getByTestId('cell-stalled')).toBeInTheDocument();
  });

  it('🔴 refuses to SPEND on a cell whose run is persisted, when the rehydrate could not see it', async () => {
    // The fail-safe for the one case paging cannot remove: the page BOUND exists
    // so a misbehaving host cannot spin the loop forever, so a truncated scan is
    // always possible in principle. Here the listing THROWS — the same
    // known-incomplete state, reached without needing 20 pages of fixture — and
    // the viewer then clicks run on a cell whose generation is already live.
    //
    // 🔴 Safe outcome = no spend. `submit` must never be called; the cell adopts
    // the persisted workflow as stalled (resume-poll, no re-submit) instead.
    const submit = vi.fn(async () => processingSnap);
    const { shared } = fakeShared({ seed: seedRows() });
    const { appStorage } = fakeAppStorage(
      {
        [INFLIGHT_KEY]: {
          workflowId: 'wf-prior',
          comboKey: 'c1',
          configId: 'cfgSeed',
          promptKey: 'p1',
          ecosystem: 'SDXL',
        },
      },
      {},
      { failListTimes: 1, failListPrefix: 'inflight:v1:' },
    );
    renderApp({
      shared,
      appStorage,
      estimate: async () => estimateSnap,
      submit,
      poll: async () => succeededSnap(),
      publish: async () => [],
    });

    await screen.findByTestId('grid-view');
    const grid = await screen.findByTestId('results-grid');

    // POSITIVE CONTROL ON THE PREMISE: the rehydrate really did fail, so the
    // cell really is empty and runnable. Without this the test could pass
    // against a healthy rehydrate and prove nothing about the backstop.
    const runCell = await within(grid).findByTestId('run-cell');
    expect(within(grid).queryByTestId('cell-stalled')).toBeNull();

    await userEvent.click(runCell);
    const confirm = await within(grid).findByTestId('cell-confirm-run');
    await userEvent.click(confirm);

    // Settle on something BOTH arms reach — the confirm control unmounts whether
    // the app spent (-> submitting) or refused (-> stalled). Waiting on
    // `cell-stalled` instead would make the failing assertion "element not
    // found", which names the symptom rather than the charge.
    await waitFor(() => expect(within(grid).queryByTestId('cell-confirm-run')).toBeNull());

    // 🔴 NOTHING WAS SPENT…
    expect(
      submit,
      'a live generation was re-submitted — that is the double charge',
    ).not.toHaveBeenCalled();
    // …and the cell is back to in-flight, resumable rather than runnable.
    expect(within(grid).getByTestId('cell-stalled')).toBeInTheDocument();
    expect(within(grid).queryByTestId('run-cell')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// #4 CLAIM BEFORE SPEND — the persist that used to FOLLOW the money now GATES it.
// ---------------------------------------------------------------------------
//
// 🔴 THE DEFECT. `confirmRun` spent and only then recorded that it had:
//
//     const first = await submit(body);        // ← the spend
//     persistInflight(ck, { workflowId, … });  // ← after it, fire-and-forget
//
// `persistInflight` swallowed its rejection. Per the SDK, `useAppStorage.set`
// "Rejects with the host's `error` string when the value exceeds 64KB, when the
// per-app 50MB quota would be crossed, or when the viewer is anonymous". On a
// rejection NOTHING is written — so the rehydrate scan found nothing, the
// pre-spend read found nothing, and the cell came back EMPTY AND RUNNABLE. The
// viewer re-ran and was charged a second time, with no signal anywhere: no toast,
// no console line, no metric.
//
// 🔴 IT IS NOT A RARE EDGE CASE. The storage quota is per-APP; the data is
// per-(block instance, viewer). One viewer filling the ceiling makes that write
// reject for EVERY viewer at once — a correlated, silent, fleet-wide exposure.
//
// It cannot be fixed by handling the error where it was: that write is
// downstream of the money BY CONSTRUCTION (there is no workflowId to record
// before `submit` returns), and retrying does nothing about quota or size. So the
// record is written in two phases — an AWAITED claim carrying only the cell
// coords BEFORE the spend, upgraded with the workflowId after — and a claim that
// cannot be written refuses the run outright. The failure now lands BEFORE the
// money instead of after it. The same change closes a second, independent hole:
// submit succeeds, the browser closes before the persist runs.
//
// 🔴 AND THE AMBIGUITY THAT FALLS OUT OF IT, which is real and not a code
// artifact: a claim with no workflowId means "we were about to spend and we do
// not know whether we did" — the submit may have succeeded with only the response
// lost. Such an entry is therefore NOT auto-adopted (nothing to resume-poll) and
// NOT auto-runnable (that is the double charge). It renders as an explicit
// unknown, with a deliberate escape hatch.
describe('#4 claim before spend: a claim that cannot be written refuses the run', () => {
  /** The host's own rejection string — a storage engine's vocabulary, never viewer copy. */
  const HOST_SET_ERROR = 'QUOTA_EXCEEDED: app storage limit reached';

  /**
   * 🔴 EVERY CASE HERE RUNS AT TWO LATENCIES, AND THAT IS NOT REDUNDANCY. This
   * fix is ORDERING-sensitive by its nature — its entire content is "the write
   * completes before the spend starts" — and `fakeAppStorage` resolves in a
   * MICROTASK by default while the real `useAppStorage` is a cross-origin HTTP
   * call (`blocks/app-storage/*` since the SDK port; a `postMessage` the host
   * served with the same server call before), i.e. at minimum a MACROTASK per
   * call and in practice a network round trip. A fake faster
   * than the real transport is structurally unable to observe an ordering bug;
   * this repo has already shipped one money-path backstop that was correct but
   * armed too late to ever fire, green the whole way, for exactly that reason.
   * `latencyMs` puts every KV call on a real macrotask.
   */
  const LATENCIES = [[0], [5]] as const;

  it.each(LATENCIES)(
    '🔴 HEADLINE: a claim write the host REJECTS means `submit` is NEVER called (latencyMs %i)',
    async (latencyMs) => {
      const submit = vi.fn(async () => processingSnap);
      const { shared } = fakeShared({ seed: seedRows() });
      const { appStorage, store, sets, setAttempts } = fakeAppStorage(
        {},
        {},
        {
          latencyMs,
          failSetTimes: 1,
          failSetPrefix: 'inflight:v1:',
          failSetError: HOST_SET_ERROR,
        },
      );
      renderApp({
        shared,
        appStorage,
        estimate: async () => estimateSnap,
        submit,
        poll: async () => succeededSnap(),
        publish: async () => [],
      });

      await toConfirming();
      await userEvent.click(screen.getByTestId('cell-confirm-run'));

      // 🔴 THE ASSERTION THIS WHOLE CHANGE EXISTS TO PRODUCE. Before the fix the
      // rejection happened AFTER this call and was swallowed; the spend went
      // through, nothing was recorded, and the next load re-offered the cell.
      expect(
        submit,
        'the claim write was rejected and the app SPENT ANYWAY — nothing is recorded, so the next load re-offers this cell and charges a second time',
      ).not.toHaveBeenCalled();

      // …and the viewer is told, in words they can act on, that the run did not
      // start. A refusal nobody can see is the same silence as the bug.
      const failed = await screen.findByTestId('cell-failed');
      expect(failed).toHaveTextContent(CLAIM_FAILED_MESSAGE);

      // 🔴 POSITIVE CONTROL ON THE PREMISE. "submit was not called" is a ZERO,
      // and a zero is indistinguishable from a run that never got started at
      // all — a mis-seeded fixture, a click that missed. `setAttempts` proves
      // the app really did reach the claim write and really was refused there.
      expect(
        setAttempts.filter((s) => s.key === INFLIGHT_KEY),
        'the app never even attempted the claim — this case is not exercising the refusal path',
      ).toHaveLength(1);

      // Nothing was persisted, which is what the host does on a rejection.
      expect(store.has(INFLIGHT_KEY)).toBe(false);
      expect(sets.filter((s) => s.key === INFLIGHT_KEY)).toHaveLength(0);
    },
  );

  it.each(LATENCIES)(
    'the claim is ALREADY DURABLE at the instant of the spend, and is upgraded with the workflowId after it (latencyMs %i)',
    async (latencyMs) => {
      const { shared } = fakeShared({ seed: seedRows() });
      const { appStorage, store, sets } = fakeAppStorage({}, {}, { latencyMs });

      // 🔴 THE ORDERING PROOF, READ AT THE ONE INSTANT IT MATTERS. Asserting the
      // store's contents after the run finishes cannot tell "claimed, then
      // spent" from "spent, then recorded" — both end in the same state, and the
      // second is the bug. So the spend itself reports what was durable when it
      // was called.
      let claimAtSpend: unknown = '<never read>';
      let storedWritesAtSpend = -1;
      const submit = vi.fn(async () => {
        claimAtSpend = store.get(INFLIGHT_KEY) ?? null;
        storedWritesAtSpend = sets.filter((s) => s.key === INFLIGHT_KEY).length;
        return processingSnap;
      });

      renderApp({
        shared,
        appStorage,
        estimate: async () => estimateSnap,
        submit,
        poll: () => new Promise<BlockWorkflowSnapshot>(() => {}), // never terminal
        publish: async () => [],
      });

      await toConfirming();
      await userEvent.click(screen.getByTestId('cell-confirm-run'));
      await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));

      // The claim was WRITTEN — not merely started — before the money moved.
      expect(
        storedWritesAtSpend,
        'the claim had not completed when submit was called — it was not awaited, so a rejection would still land after the spend',
      ).toBe(1);
      // …carrying the cell identity, and NO workflowId (there was none yet).
      expect(claimAtSpend).toMatchObject({
        comboKey: 'c1',
        configId: 'cfgSeed',
        promptKey: 'p1',
        ecosystem: 'SDXL',
      });
      expect(claimAtSpend).not.toHaveProperty('workflowId');

      // PHASE 2: the SAME key gains the workflowId once one exists.
      await waitFor(() => expect(store.get(INFLIGHT_KEY)).toHaveProperty('workflowId', 'wf1'));
      expect(store.get(INFLIGHT_KEY)).toMatchObject({ comboKey: 'c1', configId: 'cfgSeed', promptKey: 'p1' });
      // Exactly one spend, as before the change.
      expect(submit).toHaveBeenCalledTimes(1);
    },
  );

  it('never leaks the host storage error into the UI, and routes it to the developer console', async () => {
    // Same split the estimate errors use: `set` rejects with the host's own
    // error string, which is server-authored and speaks a storage engine's
    // vocabulary. Useful to a developer, meaningless (and alarming) to a viewer.
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    try {
      const submit = vi.fn(async () => processingSnap);
      const { shared } = fakeShared({ seed: seedRows() });
      const { appStorage } = fakeAppStorage(
        {},
        {},
        { failSetTimes: 1, failSetPrefix: 'inflight:v1:', failSetError: HOST_SET_ERROR },
      );
      renderApp({ shared, appStorage, estimate: async () => estimateSnap, submit, poll: async () => succeededSnap(), publish: async () => [] });

      await toConfirming();
      await userEvent.click(screen.getByTestId('cell-confirm-run'));
      const failed = await screen.findByTestId('cell-failed');

      expect(failed.textContent ?? '').not.toContain('QUOTA_EXCEEDED');
      const logged = debug.mock.calls.map((c) => c.map(String).join(' ')).join('\n');
      expect(logged, 'the host reason was discarded entirely — a developer has nothing to diagnose with').toContain(
        HOST_SET_ERROR,
      );
      expect(submit).not.toHaveBeenCalled();
    } finally {
      debug.mockRestore();
    }
  });

  it('the two refusal messages are DIFFERENT strings, and both say nothing was spent', () => {
    // 🔴 A guard that reports one constant for two different situations sends
    // half its readers the wrong way — "try again later" is useless advice to
    // someone who is merely signed out. Pinning them as distinct is what makes
    // the branch in `confirmRun` real rather than prose.
    expect(CLAIM_FAILED_MESSAGE).not.toBe(CLAIM_NO_VIEWER_MESSAGE);
    for (const msg of [CLAIM_FAILED_MESSAGE, CLAIM_NO_VIEWER_MESSAGE]) {
      expect(msg).toContain('no Buzz was spent');
    }
    // 🔴 …and the unknown copy must say the OPPOSITE, because it is the opposite
    // situation. A claim that failed to write means the run never started; a
    // claim that WROTE and then went quiet may well have started. Telling a
    // viewer "nothing was spent" there is what sends them back to Run.
    expect(RUN_UNKNOWN_MESSAGE).not.toContain('no Buzz was spent');
    expect(RUN_UNKNOWN_MESSAGE.toLowerCase()).toContain('check your generations');
  });

  it.each(LATENCIES)(
    '🔴 a CLAIM-ONLY entry found by the PRE-SPEND read does NOT spend — it renders unknown (latencyMs %i)',
    async (latencyMs) => {
      // 🔴 THE HOLE THE FIX WOULD OTHERWISE HAVE LEFT OPEN. The pre-spend read
      // gated on `persisted?.workflowId`, so a claim-only entry — the record
      // that means "we may already have charged you" — fell straight through
      // and spent. The rehydrate is armed here (its listing throws), so this is
      // the backstop's own path.
      const submit = vi.fn(async () => processingSnap);
      const { shared } = fakeShared({ seed: seedRows() });
      const { appStorage } = fakeAppStorage(
        {
          // No workflowId: an unresolved claim from a prior session.
          [INFLIGHT_KEY]: { comboKey: 'c1', configId: 'cfgSeed', promptKey: 'p1', ecosystem: 'SDXL' },
        },
        {},
        { latencyMs, failListTimes: 1, failListPrefix: 'inflight:v1:' },
      );
      renderApp({ shared, appStorage, estimate: async () => estimateSnap, submit, poll: async () => succeededSnap(), publish: async () => [] });

      await screen.findByTestId('grid-view');
      const grid = await screen.findByTestId('results-grid');

      // POSITIVE CONTROL ON THE PREMISE: the rehydrate really did fail, so the
      // cell really is empty and runnable and the backstop is what is under test.
      const runCell = await within(grid).findByTestId('run-cell');
      expect(within(grid).queryByTestId('cell-unknown')).toBeNull();

      await userEvent.click(runCell);
      await userEvent.click(await within(grid).findByTestId('cell-confirm-run'));
      // Settle on something BOTH arms reach — the confirm control unmounts
      // whether the app spent or refused.
      await waitFor(() => expect(within(grid).queryByTestId('cell-confirm-run')).toBeNull());

      expect(
        submit,
        'spent on a cell carrying an unresolved claim — the one cell we have positive evidence may already have been charged',
      ).not.toHaveBeenCalled();
      expect(
        within(grid).queryByTestId('cell-unknown'),
        'the pre-spend read did not adopt the claim-only record as unknown',
      ).toBeInTheDocument();
      expect(within(grid).getByTestId('cell-unknown')).toHaveTextContent(RUN_UNKNOWN_MESSAGE);
      expect(within(grid).queryByTestId('run-cell')).toBeNull();
      // No workflowId ⇒ nothing to resume-poll, so no resume control is offered.
      expect(
        within(grid).queryByTestId('cell-resume-run'),
        'a claim with no workflowId was adopted as a RESUMABLE run — there is no workflow to poll, so that control is a dead end',
      ).toBeNull();
    },
  );

  it.each(LATENCIES)(
    '🔴 a CLAIM-ONLY entry found by the REHYDRATE SCAN renders unknown, not empty+runnable (latencyMs %i)',
    async (latencyMs) => {
      // 🔴 THE OTHER READER OF THE SAME STORE, and it had the same gate:
      // `if (!entry || typeof entry.workflowId !== 'string' || !entry.workflowId) return;`
      // Left alone, a claim-only entry was silently SKIPPED and the cell
      // rendered empty and runnable — the fix would have shipped with the bug it
      // exists to fix still reachable one layer up.
      const submit = vi.fn(async () => processingSnap);
      const { shared } = fakeShared({ seed: seedRows() });
      const { appStorage } = fakeAppStorage(
        { [INFLIGHT_KEY]: { comboKey: 'c1', configId: 'cfgSeed', promptKey: 'p1', ecosystem: 'SDXL' } },
        {},
        { latencyMs },
      );
      renderApp({ shared, appStorage, estimate: async () => estimateSnap, submit, poll: async () => succeededSnap(), publish: async () => [] });

      await screen.findByTestId('grid-view');
      const grid = await screen.findByTestId('results-grid');

      await waitFor(() =>
        expect(
          within(grid).queryByTestId('cell-unknown'),
          'the rehydrate scan SKIPPED a claim-only record — the cell renders empty and runnable, which is exactly the double charge',
        ).toBeInTheDocument(),
      );
      expect(within(grid).getByTestId('cell-unknown')).toHaveTextContent(RUN_UNKNOWN_MESSAGE);
      expect(within(grid).getByTestId('grid-cell')).toHaveAttribute('data-state', 'running');
      // The cell is NOT re-offered — this is the whole point.
      expect(within(grid).queryByTestId('run-cell')).toBeNull();
      // …and rehydration never auto-adopts or auto-runs it.
      expect(submit).not.toHaveBeenCalled();
      expect(
        within(grid).queryByTestId('cell-stalled'),
        'a claim with no workflowId was rehydrated as a RESUMABLE run — there is no workflow to poll',
      ).toBeNull();
    },
  );

  it('a submit that THROWS leaves the claim in place and renders unknown — not failed', async () => {
    // 🔴 THE SECOND HOLE THE TWO-PHASE WRITE CLOSES, and the one that decides
    // which state the viewer lands in. A thrown `submit` is NOT evidence the
    // spend did not happen: the request may have reached the host and succeeded
    // with only the response lost. Rendering that as `failed` invites the re-run
    // — and clearing the claim would let the NEXT load offer the cell as empty
    // and runnable, which is the same double charge by a slower route.
    const submit = vi.fn(async () => {
      throw new Error('network went away');
    });
    const { shared } = fakeShared({ seed: seedRows() });
    const { appStorage, store } = fakeAppStorage({}, {}, { latencyMs: 2 });
    renderApp({ shared, appStorage, estimate: async () => estimateSnap, submit, poll: async () => succeededSnap(), publish: async () => [] });

    await toConfirming();
    await userEvent.click(screen.getByTestId('cell-confirm-run'));

    // The message-carrying assertion goes FIRST, deliberately: a bare
    // `findByTestId` here would kill a mutant with "Unable to find an element",
    // which names the symptom rather than the hazard.
    await waitFor(() =>
      expect(
        screen.queryByTestId('cell-unknown'),
        'a lost response was reported as a definite failure — that is what sends a viewer back to Run, into a real second charge',
      ).toBeInTheDocument(),
    );
    expect(screen.getByTestId('cell-unknown')).toHaveTextContent(RUN_UNKNOWN_MESSAGE);
    expect(screen.queryByTestId('cell-failed')).toBeNull();

    // 🔴 THE CLAIM SURVIVES. Without it the next load finds nothing and re-offers
    // the cell; with it the cell rehydrates as unknown, which is the safe state.
    expect(
      store.has(INFLIGHT_KEY),
      'the claim was cleared after a submit whose outcome is unknown — the next load will re-offer this cell',
    ).toBe(true);
    expect(store.get(INFLIGHT_KEY)).not.toHaveProperty('workflowId');
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('a DEFINITE host failure clears the claim — an unresolvable cell is not left behind', async () => {
    // 🔴 THE MIRROR OF THE CASE ABOVE, and the reason the two are separate
    // branches rather than one catch-all. Here the host ANSWERED: the workflow
    // exists and failed. There is nothing left to resolve, so leaving the claim
    // would strand the cell in `unknown` on every future load, forever — a safe
    // state applied where it is simply wrong, which is how a money guard turns
    // into a bricked feature.
    const submit = vi.fn(async () => ({ workflowId: 'wf1', status: 'failed', error: 'no capacity' }) as BlockWorkflowSnapshot);
    const { shared } = fakeShared({ seed: seedRows() });
    const { appStorage, store } = fakeAppStorage({}, {}, { latencyMs: 2 });
    renderApp({ shared, appStorage, estimate: async () => estimateSnap, submit, poll: async () => succeededSnap(), publish: async () => [] });

    await toConfirming();
    await userEvent.click(screen.getByTestId('cell-confirm-run'));

    await screen.findByTestId('cell-failed');
    expect(
      screen.queryByTestId('cell-unknown'),
      'a definite host failure was rendered as unknown — there is nothing ambiguous about it',
    ).toBeNull();
    await waitFor(() =>
      expect(
        store.has(INFLIGHT_KEY),
        'the claim outlived a run the host definitively failed — this cell rehydrates as unknown forever',
      ).toBe(false),
    );
  });

  it('a MALFORMED stored record does not abort the scan and orphan the records after it', async () => {
    // 🔴 A CORRUPT ROW MUST NOT SILENTLY DISABLE THE WHOLE GUARD. The rehydrate
    // reads untrusted JSON out of the store, and its outer `catch` is a
    // best-effort swallow — so a single record that throws while being inspected
    // takes down the ENTIRE scan, and every cell after it renders empty and
    // runnable with no error anywhere. That is a fleet-wide double-charge
    // exposure created by one bad row, which is why the shape check is a real
    // guard and not decoration.
    const submit = vi.fn(async () => processingSnap);
    const { shared } = fakeShared({ seed: seedRows() });
    const { appStorage } = fakeAppStorage(
      {
        // Sorts ahead of the real key, so an abort here never reaches it.
        'inflight:v1:aaa-corrupt': null,
        [INFLIGHT_KEY]: { workflowId: 'wf-prior', comboKey: 'c1', configId: 'cfgSeed', promptKey: 'p1', ecosystem: 'SDXL' },
      },
      {},
      { latencyMs: 2 },
    );
    renderApp({ shared, appStorage, estimate: async () => estimateSnap, submit, poll: async () => succeededSnap(), publish: async () => [] });

    await screen.findByTestId('grid-view');
    const grid = await screen.findByTestId('results-grid');

    await waitFor(() =>
      expect(
        within(grid).queryByTestId('cell-stalled'),
        'the live run after the corrupt record was never rehydrated — the scan aborted on it, and this cell is now empty and runnable',
      ).toBeInTheDocument(),
    );
    expect(within(grid).queryByTestId('run-cell')).toBeNull();
    expect(submit).not.toHaveBeenCalled();
  });

  it.each(LATENCIES)(
    'the ESCAPE HATCH is deliberate and it WORKS: dismiss clears the claim, and only then can the cell run again (latencyMs %i)',
    async (latencyMs) => {
      // 🔴 A safe state with no way out is its own defect: a claim that can never
      // be resolved would brick the cell for the life of the app. The exit must
      // exist — and it must be an act, never a default. So: no auto-clear, and
      // after the explicit dismiss the cell is genuinely runnable again (a spend
      // really happens), which is what proves the hatch is not cosmetic.
      const submit = vi.fn(async () => processingSnap);
      const { shared } = fakeShared({ seed: seedRows() });
      const { appStorage, store } = fakeAppStorage(
        { [INFLIGHT_KEY]: { comboKey: 'c1', configId: 'cfgSeed', promptKey: 'p1', ecosystem: 'SDXL' } },
        {},
        { latencyMs },
      );
      renderApp({
        shared,
        appStorage,
        estimate: async () => estimateSnap,
        submit,
        poll: () => new Promise<BlockWorkflowSnapshot>(() => {}),
        publish: async () => [],
      });

      await screen.findByTestId('grid-view');
      const grid = await screen.findByTestId('results-grid');
      await waitFor(() => expect(within(grid).getByTestId('cell-unknown')).toBeInTheDocument());
      expect(submit, 'the unknown state ran on its own — the exit must be deliberate').not.toHaveBeenCalled();

      await userEvent.click(within(grid).getByTestId('cell-unknown-dismiss'));

      // The stale claim is GONE from the store — otherwise the next load walks
      // straight back into the unknown state and the hatch achieved nothing.
      await waitFor(() =>
        expect(
          store.has(INFLIGHT_KEY),
          'dismiss cleared the SCREEN but not the STORE — the next load walks straight back into the unknown state and the hatch achieved nothing',
        ).toBe(false),
      );

      // …and the cell is runnable again, for real.
      const runCell = await within(grid).findByTestId('run-cell');
      await userEvent.click(runCell);
      await userEvent.click(await within(grid).findByTestId('cell-confirm-run'));
      await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    },
  );
});

// ---------------------------------------------------------------------------
// #3 estimate REJECTION — civitai/civitai#4159, @civitai/blocks-react 0.43.0.
//
// Before 0.43.0 `estimate()` RESOLVED a host failure-snapshot that carries no
// `cost`. This app gates Confirm on `typeof cost === 'number'`, so that resolved
// into a confirm dialog reading "Cost unavailable" with Confirm permanently
// disabled — a dead control, and the server's explanation (already on
// `snapshot.error`) was thrown away.
//
// From 0.43.0 it REJECTS with a `WorkflowEstimateError` carrying `.code`
// ('failed' | 'no-cost') and `.snapshot`. The app must turn that into a real
// failure the viewer can read, WITHOUT printing the library's developer-facing
// `err.message` or the server-authored, unsanitised `err.snapshot.error`.
// ---------------------------------------------------------------------------
describe('#3 estimate rejection: a workflow that cannot be priced fails honestly', () => {
  /** Build the real exported error so these pin the SHIPPED contract, not a fake. */
  const estimateError = (code: 'failed' | 'no-cost', serverReason?: string) =>
    new WorkflowEstimateError(
      { workflowId: '', status: code === 'failed' ? 'failed' : 'pending', ...(serverReason ? { error: serverReason } : {}) },
      code,
    );

  /** Run one cell whose estimate rejects; resolve the rendered failure text. */
  async function runWithRejectingEstimate(err: WorkflowEstimateError) {
    const submit = vi.fn(async () => processingSnap);
    const { shared } = fakeShared({ seed: seedRows() });
    const { appStorage } = fakeAppStorage();
    renderApp({
      shared,
      appStorage,
      estimate: async () => {
        throw err;
      },
      submit,
      poll: async () => succeededSnap(),
      publish: async () => [],
    });

    await screen.findByTestId('grid-view');
    const grid = await screen.findByTestId('results-grid');
    await userEvent.click(within(grid).getByTestId('run-cell'));

    const failed = await screen.findByTestId('cell-failed');
    return { text: failed.textContent ?? '', submit };
  }

  it('does NOT render the dead "Cost unavailable" confirm dialog, and never submits', async () => {
    // The #4159 symptom itself: an unpriceable estimate used to reach `confirming`.
    const { submit } = await runWithRejectingEstimate(estimateError('no-cost'));

    expect(screen.queryByTestId('cell-confirm')).not.toBeInTheDocument();
    expect(screen.queryByTestId('cell-insufficient')).not.toBeInTheDocument();
    // Nothing was ever spent — the run stopped before submit.
    expect(submit).not.toHaveBeenCalled();
  });

  it('shows a DIFFERENT viewer-facing message per `code`, so the branch is real', async () => {
    const { text: failedText } = await runWithRejectingEstimate(estimateError('failed'));
    cleanup();
    const { text: noCostText } = await runWithRejectingEstimate(estimateError('no-cost'));

    // A single catch-all string would make these equal — the assertion that the
    // app actually branches on `err.code` rather than printing one constant.
    expect(failedText).not.toBe(noCostText);
    expect(failedText).toBe(`Failed: ${ESTIMATE_FAILED_MESSAGE}Dismiss`);
    expect(noCostText).toBe(`Failed: ${ESTIMATE_NO_COST_MESSAGE}Dismiss`);
  });

  it('never leaks the library developer message or the raw server text into the UI', async () => {
    const serverReason = 'PrismaClientKnownRequestError: Unique constraint failed on the fields: (`email`)';
    const { text } = await runWithRejectingEstimate(estimateError('failed', serverReason));

    // `err.snapshot.error` is server-authored and unsanitised — never viewer copy.
    expect(text).not.toContain(serverReason);
    expect(text).not.toContain('Prisma');
    // `err.message` is the library's developer string; it names a JS property and
    // is meaningless to a viewer.
    expect(text).not.toContain('.snapshot.error');
    expect(text).not.toContain('usable price');
  });

  it('routes the server reason to the DEVELOPER console instead of discarding it', async () => {
    // Recovering the server's explanation is the whole point of #4159 — dropping
    // it from the UI must not mean dropping it entirely.
    const serverReason = 'not available in review preview';
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    try {
      await runWithRejectingEstimate(estimateError('failed', serverReason));
      const logged = debug.mock.calls.map((c) => c.map(String).join(' ')).join('\n');
      expect(logged).toContain(serverReason);
    } finally {
      debug.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// #5 THE VIEW SWITCH — navigating away from the grid and back must not charge again.
// ---------------------------------------------------------------------------
//
// 🔴 WHY THIS BLOCK EXISTS AT ALL. The sidebar makes the grid UNMOUNTABLE without a
// reload: selecting My Benchmarks takes down the whole Home surface, including
// `ResultsGrid`, the way a reload does — but WITHOUT the rehydrate that a reload runs.
// Two distinct failure modes fall out of that, and neither had any coverage before this
// block, because until the board/sidebar change there were no views to switch between:
//
//   (a) the poll loop lives in the unmounted subtree → the viewer is charged and the
//       result is lost;
//   (b) coming back re-offers the cell as empty-and-runnable → the viewer is charged
//       TWICE.
//
// ⚠️ HONEST LABELLING, AND THIS MATTERS MORE THAN THE CASES. Neither failure mode is
// reachable on this tree, and these are therefore NOT regression guards for a bug that
// existed: `runs`, `inFlightRef`, `driveToResult` and the claim/persist path are all
// owned by `App`, which stays mounted across every view switch, so unmounting
// `ResultsGrid` takes down a RENDERER and nothing else. They are SEAM guards on a
// relationship the sidebar created — "the run survives the switch" — and they are
// validated by MUTATION rather than by a red base, because a base with no view switch
// cannot run them at all.
//
// 🔴 MEASURED, AND AN EARLIER VERSION OF THIS PARAGRAPH SAID IT BACKWARDS. It claimed
// "case 1 and case 2 go red on the CELL STATE and case 1 additionally goes red on the
// submit COUNT". Re-measured here, on this tree, under the mutant it names — clearing
// `runs` when the view changes (`onSelect={(v) => { setRuns({}); setView(v); }}` at the
// `<SideNav>` call site in `App.tsx`), `node_modules/.vite` cleared first.
//
// BEFORE the capture fix described below — i.e. the tree the old paragraph was written
// against, and the tree it got backwards:
//
//   case 1 (still POLLING)  — GREEN on every assertion it made. See below.
//   case 2 (STALLED)        — RED on the MONEY assertion, `submit` called 1×.
//                             THIS IS THE DOUBLE CHARGE, and case 2 is still the only
//                             case that observes it.
//   case 3 (OPEN GRID)      — RED on the CELL STATE, `cell-stalled` absent.
//
// AFTER it, re-measured on the same mutant: all three go RED, and case 1 fails on its
// OWN assertion (`the cell came back empty and runnable`) rather than incidentally.
//
// 🔴 WHY CASE 1 WAS BLIND, because the reason is a trap and not a detail. The mutant
// DOES do its damage there: probed directly, the cell is `data-state="empty"` with
// `run-cell` present the moment `goHome()` returns — failure mode (b), exactly. But
// `tryToSpendAgain()` then presses Run, `beginRun` writes `status: 'confirming'`, and
// `ResultsGrid` renders EVERY non-idle status as `data-state="running"` — so the helper
// repaired both observables the case went on to assert. The submit COUNT stays at 1
// because the in-memory `inFlightRef` claim from the live run refuses the second
// `confirmRun`; that half is unchanged and is not a defect. Money-first ordering is
// still right (see `tryToSpendAgain`'s header), so the fix was to CAPTURE the re-offer
// BEFORE the press and assert the captured value AFTER the money.
//
// 🔴 SO: CASE 2 IS THE ONLY CASE THAT CATCHES AN ACTUAL SECOND CHARGE. Anyone pruning
// this block from this header must not read case 2 as "the state-only one" and keep
// case 1 as "the count guard" — that is backwards, and it deletes the only money
// assertion in the block that a runs-clearing regression can move.
//
// 🔴 AND THE THIRD CASE IS THE ONE THAT CHANGED PRODUCTION CODE. `openGridKey` was a
// `useState` inside `GridsView`; it is `App`'s now. Without that hoist, returning from
// My Benchmarks resets the open grid to the Top Grid, so a viewer who started a run
// inside a community grid comes back to a DIFFERENT matrix with their stalled cell
// nowhere on screen: charged, still running, invisible, and the only route back is to
// remember which grid it was. No double charge — the claim is intact in KV — but a
// generation the viewer paid for and cannot collect, which is the same shape as the
// adopted-cell-cannot-resume bug this file already guards.
//
// ⚠️ AND IT CLOSES THE VIEW-SWITCH HALF ONLY — do not read case 3 as closing the
// charged-running-invisible shape. `openGridKey` is NOT PERSISTED (no KV write, no URL —
// operator decision, YAGNI), so after a RELOAD the app opens on the Top Grid and a
// stalled cell on a community grid is off-screen again, exactly as before. That half is
// unchanged by this stack rather than introduced by it: `openGridKey` was equally
// unpersisted as `GridsView`'s own `useState`. Persisting it is a separate decision
// nobody has made, and no case in this block covers the reload path.
describe('#5 the view switch: a live run survives a trip to My Benchmarks', () => {
  /** A second prompt, so a community grid can name a DIFFERENT cell from the Top Grid. */
  const promptTwo: PromptData = {
    v: 3,
    kind: 'prompt',
    default: { prompt: 'a quiet street', params: { cfgScale: 5, steps: 30 } },
  };
  const CK2 = 'c1::cfgSeed::p2';

  function seedWithGrid(): SharedItem[] {
    return [
      ...seedRows(),
      { key: 'p2', authorUserId: 8, count: 1, viewerVoted: false, value: { title: 'Second Prompt', body: '', data: promptTwo }, createdAt: new Date(0), updatedAt: new Date(0) },
      {
        key: 'gk-other',
        authorUserId: 8,
        count: 9,
        viewerVoted: false,
        value: {
          title: 'Other grid',
          body: '',
          data: { v: 1, kind: 'grid', matchupKeys: ['c1'], promptKeys: ['p2'] },
        },
        createdAt: new Date(0),
        updatedAt: new Date(0),
      },
    ];
  }

  /** Sidebar → My Benchmarks ▸ Grids. */
  async function goToMyGrids(): Promise<void> {
    const trigger = await screen.findByTestId('nav-my');
    if (trigger.getAttribute('aria-expanded') !== 'true') await userEvent.click(trigger);
    await userEvent.click(await screen.findByTestId('nav-my-grid'));
    // 🔴 THE PREMISE, ASSERTED: the grid really did unmount. Without this the cases
    // below could pass against a nav that navigates nowhere, which is the one way "the
    // run survived the switch" is satisfied by there being no switch.
    await waitFor(() => expect(screen.queryByTestId('results-grid')).toBeNull());
    expect(screen.queryByTestId('grid-cell')).toBeNull();
  }

  async function goHome(): Promise<void> {
    await userEvent.click(await screen.findByTestId('nav-home'));
    await screen.findByTestId('results-grid');
  }

  /**
   * ATTEMPT the double charge, and report whether the app let it through.
   *
   * 🔴 THIS EXISTS BECAUSE ORDER IS LOAD-BEARING AND THE FIRST DRAFT GOT IT WRONG. The
   * cases below were written state-first — "the cell is still running" — and under the
   * mutant they died on THAT, so the SPEND assertion, which is the claim that names the
   * money, never executed. Doing what a viewer would do (press Run, press Confirm) puts
   * the count on the path rather than after a guard that already failed.
   *
   * A no-op when the cell is not runnable, which is the correct end state — so the
   * caller must also assert the STATE. The two are different claims: a cell can look
   * right while an effect behind it spends, and it can look wrong while nothing does.
   */
  async function tryToSpendAgain(): Promise<void> {
    const grid = screen.getByTestId('results-grid');
    const run = within(grid).queryByTestId('run-cell');
    if (!run) return;
    await userEvent.click(run);
    const confirm = within(grid).queryByTestId('cell-confirm-run');
    if (confirm) await userEvent.click(confirm);
    // 🔴 IT FLUSHES, IT DOES NOT ASSERT. A `waitFor` on the confirm control unmounting
    // was here first, and MEASURED under the runs-clearing mutant it made the HELPER
    // the thing that failed — killing the case before its own money assertion ran,
    // which is exactly the "died for the wrong reason" shape. (The app refuses the
    // second confirm from its in-memory claim and leaves the control mounted, so the
    // wait could never resolve.) Anything this helper asserts is an assertion the
    // caller did not write.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }

  it('🔴 a run still POLLING is still running when the viewer comes back, and never re-submits', async () => {
    const submit = vi.fn(async () => processingSnap);
    const { shared } = fakeShared({ seed: seedRows() });
    const { appStorage, store } = fakeAppStorage();
    renderApp({
      shared,
      appStorage,
      estimate: async () => estimateSnap,
      submit,
      // Never terminal, so the run is genuinely still in flight across the switch.
      poll: () => new Promise<BlockWorkflowSnapshot>(() => {}),
      publish: async () => [],
    });

    await toConfirming();
    await userEvent.click(screen.getByTestId('cell-confirm-run'));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    // The claim is durable before we go anywhere — otherwise this case is about a run
    // that was never recorded, which is a different bug.
    await waitFor(() => expect(store.has(INFLIGHT_KEY)).toBe(true));

    await goToMyGrids();
    await goHome();

    /**
     * 🔴 A READ, NOT AN ASSERTION, AND THAT IS THE WHOLE POINT. `tryToSpendAgain()`
     * below presses Run, which writes `status: 'confirming'` — and `ResultsGrid`
     * renders every non-idle status as `data-state="running"`, so the press REPAIRS
     * both observables this case used to assert afterwards. MEASURED: under the
     * runs-clearing mutant the cell really is `empty` with `run-cell` present right
     * here, and every post-helper assertion was still green.
     *
     * Capturing it keeps the money assertion first (see `tryToSpendAgain`'s header for
     * why that ordering is not negotiable) while still observing the re-offer, because
     * a `const` cannot fail the test before the count is read.
     */
    const reOfferedBeforePress = screen.queryByTestId('run-cell') !== null;
    /**
     * 🔴 THE CELL SET IS COUNTED, NOT FIRST-MATCHED, AND THE WEAKER FORM WAS A REAL
     * HAZARD. This read was `within(grid).getByTestId('grid-cell')` and became
     * `querySelector('[data-testid="grid-cell"]')`, which silently takes the FIRST
     * match. Equivalent today — §5's seed is one cell — and silently WRONG the moment
     * that seed grows one, because it would then report some other cell's state under
     * this cell's assertion.
     *
     * ⚠️ AND THE THROWING FORM IS *NOT* SIMPLY RESTORED, deliberately. `getByTestId`
     * throws on 0 matches AND on >1, and it would throw HERE — above
     * `tryToSpendAgain()`. That kills the case before the money count is read, which is
     * the exact "died for the wrong reason" shape this section's own helper header
     * forbids. So the ambiguity is captured as a VALUE and surfaces at the assertion
     * below instead: a set of any size other than one produces a string no
     * `toBe('running')` can match, and the failure message names the count.
     */
    const cellsBeforePress = within(screen.getByTestId('results-grid')).queryAllByTestId('grid-cell');
    const stateBeforePress =
      cellsBeforePress.length === 1
        ? cellsBeforePress[0]!.getAttribute('data-state')
        : `AMBIGUOUS: ${cellsBeforePress.length} grid-cell(s), expected exactly 1`;

    // 🔴 THE MONEY ASSERTIONS GO FIRST, and `tryToSpendAgain` is what puts them on the
    // path: press Run and Confirm exactly as a viewer would, then count. A state
    // assertion placed above this would kill a mutant on the SYMPTOM and leave the
    // charge unmeasured.
    await tryToSpendAgain();
    expect(
      submit,
      'the view switch re-offered a live generation and the app spent again — double charge',
    ).toHaveBeenCalledTimes(1);
    // …and the claim was neither cleared nor duplicated by the round trip.
    expect(store.has(INFLIGHT_KEY)).toBe(true);

    // 🔴 …AND THE CELL WAS NOT EMPTY AND RUNNABLE WHEN WE CAME BACK, which is the state
    // that INVITES the press above. Read from the values CAPTURED before the press, for
    // the reason stated there: asserting the live DOM here measures what the helper did,
    // not what the view switch did. This is the assertion that fails independently of
    // the count — on this tree the in-memory `inFlightRef` claim survives the switch and
    // would refuse a second `confirmRun` even if the cell were re-offered, so the count
    // alone stays green over a cell that came back runnable.
    expect(
      reOfferedBeforePress,
      'the cell came back empty and runnable — the only thing between that and a second charge is an in-memory claim that a reload would not have',
    ).toBe(false);
    expect(
      stateBeforePress,
      'the live run stopped rendering as in-flight across the view switch',
    ).toBe('running');
  });

  it('🔴 a STALLED run is still resumable after the round trip — poll, never submit', async () => {
    const submit = vi.fn(async () => processingSnap);
    const poll = vi.fn(async () => succeededSnap('wf-prior'));
    const { shared } = fakeShared({ seed: seedRows() });
    const { appStorage, store } = fakeAppStorage({
      [INFLIGHT_KEY]: { workflowId: 'wf-prior', comboKey: 'c1', configId: 'cfgSeed', promptKey: 'p1', ecosystem: 'SDXL' },
    });
    renderApp({ shared, appStorage, estimate: async () => estimateSnap, submit, poll, publish: async () => [9001, 9002] });

    const grid = await screen.findByTestId('results-grid');
    await waitFor(() => expect(within(grid).getByTestId('cell-stalled')).toBeInTheDocument());

    await goToMyGrids();
    await goHome();

    // 🔴 THE SPEND ASSERTION FIRST, AND THIS IS THE CASE WHERE IT BITES. A rehydrated
    // run leaves NOTHING in the in-memory `inFlightRef` — that set is populated by
    // `confirmRun`/`resumeRun`, not by the mount scan — and the scan COMPLETED, so
    // `confirmRun`'s pre-spend store read is stood down. If the view switch re-offered
    // this cell there is no layer left: pressing Run charges a second time for a
    // generation that is already running. `tryToSpendAgain` presses it.
    await tryToSpendAgain();
    expect(
      submit,
      'the view switch re-offered a rehydrated run and the app SPENT — this is the double charge, with no backstop between it and the viewer',
    ).not.toHaveBeenCalled();

    // Still stalled, still not runnable — the rehydrate is a MOUNT effect keyed on
    // `[ready, viewer?.id]`, so it does not re-run on a view switch and the state has to
    // have survived in `App` rather than been re-read.
    await waitFor(() =>
      expect(within(screen.getByTestId('results-grid')).getByTestId('cell-stalled')).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('run-cell')).toBeNull();

    // 🔴 AND RESUME STILL WORKS. This is the half that would break if the switch had
    // dropped the workflowId while keeping the cell in a stalled-looking state: the
    // control renders, the press does nothing, and the viewer is charged for a
    // generation they can never collect. (Same shape as the adopted-cell case above.)
    await userEvent.click(screen.getByTestId('cell-resume-run'));
    await waitFor(() => expect(screen.getByTestId('grid-cell')).toHaveAttribute('data-state', 'result'), {
      timeout: 3000,
    });
    expect(poll, 'resume after the round trip polled nothing').toHaveBeenCalledWith('wf-prior');
    expect(submit, 'resume after the round trip re-submitted — double charge').not.toHaveBeenCalled();
    await waitFor(() => expect(store.has(INFLIGHT_KEY)).toBe(false));
  });

  it('🔴 the OPEN GRID survives the round trip, so a stalled cell is still on screen', async () => {
    // 🔴 THE CASE THE HOIST EXISTS FOR. `openGridKey` was `GridsView`'s `useState`;
    // navigating away unmounts that component, so coming back reset the open grid to the
    // Top Grid. A viewer who started a run inside a community grid would return to a
    // different matrix with their in-flight cell nowhere on screen — charged, running,
    // invisible.
    //
    // ⚠️ SCOPE, STATED SO THIS CASE IS NOT READ AS MORE: it covers the VIEW SWITCH, not
    // a RELOAD. `openGridKey` is not persisted, so a reload still opens on the Top Grid
    // with a community grid's stalled cell off-screen — see the §5 header.
    const submit = vi.fn(async () => processingSnap);
    const { shared } = fakeShared({ seed: seedWithGrid() });
    // The in-flight run is on the OTHER grid's cell (c1 × p2), which the Top Grid also
    // contains — so the discriminator is the OPEN GRID'S IDENTITY, not the cell's
    // presence. Asserted both ways below.
    const { appStorage } = fakeAppStorage({
      [`inflight:v1:${CK2}`]: { workflowId: 'wf-other', comboKey: 'c1', configId: 'cfgSeed', promptKey: 'p2', ecosystem: 'SDXL' },
    });
    renderApp({ shared, appStorage, estimate: async () => estimateSnap, submit, poll: async () => succeededSnap('wf-other'), publish: async () => [] });

    await screen.findByTestId('results-grid');
    // Open the community grid. Its card is in the all-grids list; the Top Grid is the
    // one currently open and is therefore NOT listed.
    const card = await waitFor(() => {
      const el = screen.getAllByTestId('grid-card').find((c) => c.getAttribute('data-key') === 'gk-other');
      expect(el, 'the community grid never rendered').toBeTruthy();
      return el!;
    });
    await userEvent.click(within(card).getByTestId('grid-open'));
    await waitFor(() => expect(screen.getByTestId('grid-open-title')).toHaveTextContent('Other grid'));
    // PREMISE: this grid's matrix is ONE cell, the Top Grid's is TWO — so the two are
    // distinguishable by content as well as by title.
    await waitFor(() => expect(screen.getAllByTestId('grid-cell')).toHaveLength(1));
    expect(screen.getByTestId('cell-stalled')).toBeInTheDocument();

    await goToMyGrids();
    await goHome();

    // 🔴 THE SAME GRID IS STILL OPEN…
    expect(
      screen.getByTestId('grid-open-title'),
      'the open grid reset on the way back — a stalled cell is now on a matrix nobody is looking at',
    ).toHaveTextContent('Other grid');
    expect(screen.queryByTestId('grid-open-system-badge')).toBeNull();
    // …so the stalled cell the viewer paid for is STILL ON SCREEN, and it is the only
    // cell, which is what proves the matrix is this grid's and not the Top Grid's.
    expect(screen.getAllByTestId('grid-cell')).toHaveLength(1);
    expect(screen.getByTestId('cell-stalled')).toBeInTheDocument();
    expect(screen.queryByTestId('run-cell')).toBeNull();
    expect(submit).not.toHaveBeenCalled();
  });
});
