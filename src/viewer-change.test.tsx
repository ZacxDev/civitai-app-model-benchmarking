// 🔴 MONEY SAFETY — the VIEWER-CHANGE re-run route.
//
// Two single-line deletions in `src/App.tsx` each reintroduce a double charge
// while leaving the rest of the suite entirely green. Both live on this route,
// and nothing else in the repo reaches it:
//
//   1. the RE-ARM (`inflightScanTruncatedRef.current = true` at the top of the
//      rehydrate effect). Viewer A's scan completes and stands the backstop
//      down; the host swaps viewer WITHOUT remounting; viewer B's scan is still
//      walking; a Confirm reads `false`, skips the pre-spend store read, and
//      spends on a cell whose run is persisted.
//   2. the `!cancelled` guard on the stand-down write. The viewer changes
//      mid-scan, so scan A is cancelled — its `onKey` returns `'stop'`, which
//      `forEachStoredKey` correctly reports as `truncated: false` (an early stop
//      is "found what I wanted", not "could not see everything") — and the
//      SUPERSEDED scan then writes `false` over the re-arm that scan B just set.
//      Same spend, and this one is the subtler of the two.
//
// 🔴 HOW THIS ROUTE IS REACHED, because a previous version of the comment in
// App.tsx concluded it could NOT be and told the next reader not to bother. That
// conclusion was wrong; only its premise was right. The SDK `Harness` snapshots
// its options into a `useRef` on first render and installs the mock host in a
// `useEffect(…, [])` (`@civitai/blocks-react/dist/testing.js:92-101`), so the
// `viewer` PROP genuinely cannot express a change — re-rendering with a
// different prop does nothing. But `App` takes its viewer from
// `useBlockContext()` (`App.tsx:184`), and a file-scoped partial mock of that
// hook can. The construction below is ~40 lines and reaches it exactly.
//
// The mock is file-scoped, so no other suite is affected.

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Harness } from '@civitai/blocks-react/testing';
import type { BlockWorkflowSnapshot } from '@civitai/app-sdk/blocks';
import type { SharedListItem } from '@civitai/blocks-react';

import { fakeAppStorage, fakeShared, fakeGatedCell, immediateSleep } from './test-helpers.js';
import type { CombinationData, PromptData } from './types.js';

/** The live viewer, swapped between renders without remounting the block. `null`
 * models the host signing the viewer OUT mid-flow — see the sign-out case below. */
const viewerBox = {
  current: { id: 99, username: 'a' } as { id: number; username: string } | null,
};

vi.mock('@civitai/blocks-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@civitai/blocks-react')>();
  return {
    ...actual,
    useBlockContext: () => {
      const real = actual.useBlockContext();
      return { ...real, viewer: viewerBox.current };
    },
  };
});

const { App, CLAIM_NO_VIEWER_MESSAGE } = await import('./App.js');

// `viewerBox` is module state that each case mutates — reset it so the cases are
// order-independent rather than quietly depending on running first.
beforeEach(() => {
  viewerBox.current = { id: 99, username: 'a' };
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
const CK = 'c1::cfgSeed::p1';
const INFLIGHT_KEY = `inflight:v1:${CK}`;
const processingSnap: BlockWorkflowSnapshot = { workflowId: 'wf1', status: 'processing' };
const estimateSnap: BlockWorkflowSnapshot = {
  workflowId: '',
  status: 'pending',
  cost: { total: 12 },
};

function seedRows(): SharedListItem[] {
  return [
    {
      key: 'c1',
      authorUserId: 7,
      count: 3,
      viewerVoted: false,
      value: { title: 'Grid Combo', body: '', data: comboData },
      createdAt: new Date(0),
      updatedAt: new Date(0),
    },
    {
      key: 'p1',
      authorUserId: 8,
      count: 3,
      viewerVoted: false,
      value: { title: 'Grid Prompt', body: '', data: promptData },
      createdAt: new Date(0),
      updatedAt: new Date(0),
    },
  ];
}

/** Enough decoys that a fresh scan cannot reach the real key inside KV_MAX_PAGES. */
function decoys(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (let i = 0; i < 21; i += 1) {
    out[`inflight:v1:c1::cfgSeed::decoy${i}`] = {
      workflowId: `wf-decoy-${i}`,
      comboKey: 'c1',
      configId: 'cfgSeed',
      promptKey: `decoy${i}`,
      ecosystem: 'SDXL',
    };
  }
  return out;
}

const liveRun = {
  workflowId: 'wf-prior',
  comboKey: 'c1',
  configId: 'cfgSeed',
  promptKey: 'p1',
  ecosystem: 'SDXL',
};

function block(deps: Record<string, unknown>) {
  return (
    <Harness
      viewer={{ id: 99, username: 'a' }}
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
          GatedCell: fakeGatedCell({ visibleIds: [9001] }),
          estimate: async () => estimateSnap,
          poll: async () => ({ workflowId: 'wf1', status: 'succeeded' }) as BlockWorkflowSnapshot,
          publish: async () => [],
          ...deps,
        }}
      />
    </Harness>
  );
}

describe('viewer change without a remount — the re-run route', () => {
  it('🔴 does not SPEND while viewer B’s scan is still walking (pins the RE-ARM)', async () => {
    const submit = vi.fn(async () => processingSnap);
    const { shared } = fakeShared({ seed: seedRows() });
    // Start EMPTY so viewer A's scan COMPLETES and stands the backstop down —
    // that is the state the re-arm has to undo.
    const { appStorage, store, listCalls } = fakeAppStorage(
      {},
      {},
      { pageSize: 1, latencyMs: 2 },
    );

    const node = block({ shared, appStorage, submit });
    const view = render(node);

    await userEvent.click(await screen.findByRole('tab', { name: /^Grid$/ }));
    const grid = await screen.findByTestId('results-grid');
    await within(grid).findByTestId('run-cell');
    await new Promise((r) => setTimeout(r, 60));

    // PREMISE: viewer A's scan really did finish. If it had not, the flag would
    // still be armed for an unrelated reason and this case would prove nothing.
    const aCalls = listCalls.filter((c) => c?.prefix === 'inflight:v1:').length;
    expect(aCalls, 'viewer A’s scan never ran').toBeGreaterThan(0);

    // The store now holds this viewer's live run plus enough decoys that a fresh
    // scan cannot reach it within the page bound.
    for (const [k, v] of Object.entries(decoys())) store.set(k, v);
    store.set(INFLIGHT_KEY, liveRun);

    // …and the host swaps the viewer WITHOUT remounting the block.
    viewerBox.current = { id: 1234, username: 'b' };
    view.rerender(node);

    const g2 = await screen.findByTestId('results-grid');
    await userEvent.click(await within(g2).findByTestId('run-cell'));
    await userEvent.click(await within(g2).findByTestId('cell-confirm-run'));
    await waitFor(() => expect(within(g2).queryByTestId('cell-confirm-run')).toBeNull());

    expect(
      submit,
      'spent Buzz on a cell whose run is persisted, during viewer B’s scan',
    ).not.toHaveBeenCalled();
  });

  it('🔴 a SUPERSEDED scan must not stand the backstop down (pins the `!cancelled` guard)', async () => {
    const submit = vi.fn(async () => processingSnap);
    const { shared } = fakeShared({ seed: seedRows() });
    const { appStorage, listCalls } = fakeAppStorage(
      { ...decoys(), [INFLIGHT_KEY]: liveRun },
      {},
      { pageSize: 1, latencyMs: 5 },
    );

    const node = block({ shared, appStorage, submit });
    const view = render(node);
    await userEvent.click(await screen.findByRole('tab', { name: /^Grid$/ }));
    const grid = await screen.findByTestId('results-grid');
    await within(grid).findByTestId('run-cell');

    // PREMISE, and the thing that makes this case different from the one above:
    // viewer A's scan must still be MID-WALK when the viewer changes. 22 keys at
    // one per page and 5ms per KV call is ~200ms of scanning; if this ever
    // reached the bound the scan would have finished and the case would silently
    // stop testing the `!cancelled` guard.
    const midScan = listCalls.filter((c) => c?.prefix === 'inflight:v1:').length;
    expect(midScan, 'viewer A’s scan already finished — nothing to supersede').toBeLessThan(20);

    viewerBox.current = { id: 1234, username: 'b' };
    view.rerender(node);

    const g2 = await screen.findByTestId('results-grid');
    await userEvent.click(await within(g2).findByTestId('run-cell'));
    await userEvent.click(await within(g2).findByTestId('cell-confirm-run'));
    await waitFor(() => expect(within(g2).queryByTestId('cell-confirm-run')).toBeNull());

    expect(
      submit,
      'a superseded scan stood the backstop down mid-scan',
    ).not.toHaveBeenCalled();
  });

  it('🔴 a NON-WRITE is not a successful claim: signed out mid-flow, Confirm refuses to spend', async () => {
    // 🔴 THE WAY THE FIX RE-ENTERS ITS OWN BUG THROUGH ITS OWN GUARD. The
    // pre-spend claim write is `claimInflight`, and the natural shape for it —
    // the shape the fire-and-forget `persistInflight` it grew out of already had
    // — opens with `if (!viewer) return;`. As a `void`/boolean function that is a
    // NON-WRITE that RESOLVES: the caller awaits it, reads "claim succeeded", and
    // spends with nothing persisted. That is exactly the defect being fixed,
    // arrived at through the guard meant to prevent it. So the claim reports
    // THREE outcomes — wrote / rejected / did not write — and only the first
    // licenses a spend.
    //
    // 🔴 AND IT IS REACHABLE, which is why it is not merely defensive. `beginRun`
    // does gate on `viewer`, so it is tempting to reason `confirmRun` can never
    // run without one. But the viewer can change WITHOUT a remount — the whole
    // premise of this file — and `runs` is component state that does not care.
    // The cell reaches `confirming` with a viewer, and loses it before Confirm.
    const submit = vi.fn(async () => processingSnap);
    const { shared } = fakeShared({ seed: seedRows() });
    const { appStorage, setAttempts } = fakeAppStorage({}, {}, { latencyMs: 2 });

    const node = block({ shared, appStorage, submit });
    const view = render(node);

    await userEvent.click(await screen.findByRole('tab', { name: /^Grid$/ }));
    const grid = await screen.findByTestId('results-grid');
    // Reach the confirm dialog WITH a viewer (the estimate needs one).
    await userEvent.click(await within(grid).findByTestId('run-cell'));
    await within(grid).findByTestId('cell-confirm-run');

    // …and now the host signs the viewer out, without remounting the block.
    //
    // 🔴 A FRESH ELEMENT, not the same `node` the two cases above re-pass. React
    // bails out of a subtree whose element is REFERENTIALLY IDENTICAL, so
    // `rerender(node)` re-runs `App` only when something else already scheduled
    // an update — which the cases above happen to have (their scan effects are
    // mid-flight). This case has none: its store is empty and its scan is long
    // finished, so passing `node` back silently re-rendered nothing, the click
    // ran against the PREVIOUS closure with its viewer still set, and the app
    // spent. That failure looked exactly like a missing guard.
    viewerBox.current = null;
    view.rerender(block({ shared, appStorage, submit }));

    const g2 = await screen.findByTestId('results-grid');
    await userEvent.click(await within(g2).findByTestId('cell-confirm-run'));
    await waitFor(() => expect(within(g2).queryByTestId('cell-confirm-run')).toBeNull());

    expect(
      submit,
      'spent with no viewer — the claim could not have been written, so nothing would have been recorded',
    ).not.toHaveBeenCalled();
    expect(await within(g2).findByTestId('cell-failed')).toHaveTextContent(CLAIM_NO_VIEWER_MESSAGE);

    // 🔴 POSITIVE CONTROL ON THE MECHANISM, not just the outcome. The refusal has
    // to come from the claim declining to write — NOT from some upstream guard
    // that happened to fire first, which would leave this case green with the
    // no-viewer branch reporting success. Nothing was written for this cell.
    expect(
      setAttempts.filter((s) => s.key === INFLIGHT_KEY),
      'a write was attempted for an anonymous viewer — the host rejects those, so the claim must not even try',
    ).toHaveLength(0);
  });
});
