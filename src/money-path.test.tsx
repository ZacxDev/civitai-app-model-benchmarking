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

import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Harness } from '@civitai/blocks-react/testing';
import type { BlockWorkflowSnapshot } from '@civitai/app-sdk/blocks';
import type { SharedListItem } from '@civitai/blocks-react';

import { App, type AppDeps } from './App.js';
import type { CombinationData, PromptData } from './types.js';
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

function seedRows(): SharedListItem[] {
  return [
    { key: 'c1', authorUserId: 7, count: 3, value: { title: 'Grid Combo', body: '', data: comboData }, createdAt: new Date(0), updatedAt: new Date(0) },
    { key: 'p1', authorUserId: 8, count: 3, value: { title: 'Grid Prompt', body: '', data: promptData }, createdAt: new Date(0), updatedAt: new Date(0) },
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
  await userEvent.click(await screen.findByRole('tab', { name: /^Grid$/ }));
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

    await userEvent.click(await screen.findByRole('tab', { name: /^Grid$/ }));
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

    await userEvent.click(await screen.findByRole('tab', { name: /^Grid$/ }));
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
