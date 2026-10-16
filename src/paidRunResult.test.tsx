// 🔴 A PAID RUN'S RESULT MUST NOT BE LOST TO THE SHARED WRITE (PR #85 audit, F1).
//
// The last step of a run is a shared `create` (the result row), which the document
// store refuses `consent_required` on a token without `apps:storage:publish`,
// `rate_limited` past the shared write budget, or `content_rejected`. Two paths
// reached that refusal AFTER the money:
//
//   1. `resumeRun` had no scope gate. A 0.4.18 in-flight record copied into 0.5.0
//      belongs to a viewer who has never granted `apps:storage:publish`; pressing
//      Check status re-polled, cleared the record, published the outputs, and was
//      then refused at the create.
//   2. `driveToResult` cleared the in-flight record on reaching `succeeded`, BEFORE
//      the publish and the create. Any failure after that left the cell `failed`,
//      whose only control is Dismiss → an empty, RUNNABLE cell: a second charge for a
//      generation that already happened.
//
// Both cases below were watched failing at `6efbf674` (the PR head before the fix).

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { BlockWorkflowSnapshot } from '@civitai/app-sdk/blocks';

import { App, type AppDeps } from './App.js';
import { StorageError } from '@civitai/sdk';

import {
  PAID_DISMISS_LABEL,
  RESULT_PENDING_MESSAGE,
  RESULT_SAVE_CONSENT_MESSAGE,
  RESULT_SAVE_FAILED_MESSAGE,
  RESULT_SAVE_REFUSED_MESSAGE,
  STALLED_MESSAGE,
} from './lib/resultSave.js';
import { PUBLISH_CONSENT_MESSAGE, SharedWriteRefusal } from './lib/records-store.js';
import { Harness } from './test-harness.js';
import { fakeAppStorage, fakeGatedCell, fakeShared, immediateSleep } from './test-helpers.js';
import type { CombinationData, PromptData } from './types.js';

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
const INFLIGHT_KEY = 'inflight:v1:c1::cfgSeed::p1';
const seedRows = () => [
  { key: 'c1', authorUserId: 7, count: 3, viewerVoted: false, value: { title: 'Grid Combo', body: '', data: comboData } },
  { key: 'p1', authorUserId: 8, count: 3, viewerVoted: false, value: { title: 'Grid Prompt', body: '', data: promptData } },
];
const succeeded: BlockWorkflowSnapshot = { workflowId: 'wf-prior', status: 'succeeded' };

function renderApp(deps: Partial<AppDeps>, consentGranted: boolean) {
  render(
    <Harness
      viewer={{ id: 99, username: 'me' }}
      theme="dark"
      consentGranted={consentGranted}
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
          ...deps,
        }}
      />
    </Harness>,
  );
}

async function stalledCell(): Promise<HTMLElement> {
  await screen.findByTestId('grid-view');
  const grid = await screen.findByTestId('results-grid');
  await waitFor(() => expect(within(grid).getByTestId('cell-stalled')).toBeInTheDocument());
  return grid;
}

describe('🔴 resuming a paid run is gated on the publish grant, BEFORE anything moves', () => {
  it('a rehydrated 0.4.18 run on an unconsented token asks for consent and polls, publishes, clears NOTHING', async () => {
    const { appStorage, store, deleteAttempts } = fakeAppStorage({
      [INFLIGHT_KEY]: { workflowId: 'wf-prior', comboKey: 'c1', configId: 'cfgSeed', promptKey: 'p1', ecosystem: 'SDXL' },
    });
    const { shared, appends } = fakeShared({ seed: seedRows() });
    const poll = vi.fn(async () => succeeded);
    const publish = vi.fn(async () => [9001]);
    const requestConsent = vi.fn();
    renderApp({ shared, appStorage, poll, publish, requestConsent }, false);

    const grid = await stalledCell();
    await userEvent.click(within(grid).getByTestId('cell-resume-run'));

    expect(requestConsent).toHaveBeenCalledTimes(1);
    expect(requestConsent.mock.calls[0]![0].scopes).toContain('apps:storage:publish');
    expect(poll, 'polled a run whose result could not be published').not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
    expect(appends).toHaveLength(0);
    // The record survives, and the cell is still resumable — never runnable.
    expect(store.has(INFLIGHT_KEY)).toBe(true);
    expect(deleteAttempts).toEqual([]);
    expect(within(grid).getByTestId('cell-stalled')).toBeInTheDocument();
    expect(within(grid).queryByTestId('run-cell')).toBeNull();
  });
});

describe('🔴 the in-flight record outlives the result write', () => {
  it('a result create refused AFTER the spend keeps the record and leaves the cell RESUMABLE, in true words', async () => {
    const { appStorage, store } = fakeAppStorage({
      [INFLIGHT_KEY]: { workflowId: 'wf-prior', comboKey: 'c1', configId: 'cfgSeed', promptKey: 'p1', ecosystem: 'SDXL' },
    });
    const base = fakeShared({ seed: seedRows() });
    let refuse = true;
    const shared = {
      ...base.shared,
      append: async (value: Parameters<typeof base.shared.append>[0]) => {
        if (refuse) {
          throw new SharedWriteRefusal(PUBLISH_CONSENT_MESSAGE, 'consent_required', new Error('403'));
        }
        return base.shared.append(value);
      },
    };
    const poll = vi.fn(async () => succeeded);
    const publish = vi.fn(async () => [9001]);
    renderApp({ shared, appStorage, poll, publish }, true);

    const grid = await stalledCell();
    await userEvent.click(within(grid).getByTestId('cell-resume-run'));

    const message = within(grid).getByTestId('cell-stalled-message');
    await waitFor(() => expect(message).toHaveTextContent(RESULT_SAVE_CONSENT_MESSAGE));
    // 🔴 Not the publish-form copy: the images WERE published here.
    expect(message).not.toHaveTextContent(/nothing was published/i);
    expect(store.has(INFLIGHT_KEY), 'the paid run’s record was deleted before its result landed').toBe(true);
    // PHASE 3: the published ids are on the record BEFORE the create was attempted.
    expect((store.get(INFLIGHT_KEY) as { imageIds?: number[] }).imageIds).toEqual([9001]);
    expect(within(grid).queryByTestId('cell-failed')).toBeNull();
    expect(within(grid).queryByTestId('run-cell')).toBeNull();

    // The grant lands; Check status finishes the SAME workflow and only then clears.
    refuse = false;
    await userEvent.click(within(grid).getByTestId('cell-resume-run'));
    await waitFor(() => expect(store.has(INFLIGHT_KEY)).toBe(false));
    expect(base.appends).toHaveLength(1);
    expect(poll).toHaveBeenCalledWith('wf-prior');
    // 🔴 ONE PUBLISH ACROSS BOTH PRESSES (round-2 audit, 🟡1): every publish mints fresh
    // public Image rows, so the retry must save the row from the recorded ids.
    expect(publish).toHaveBeenCalledTimes(1);
    expect(poll).toHaveBeenCalledTimes(1);
  });
});

describe('🔴 a retry neither publishes twice nor writes a second result row', () => {
  it('a create that LANDED with its reply lost is found on the board, not created again', async () => {
    const { appStorage, store } = fakeAppStorage({
      [INFLIGHT_KEY]: { workflowId: 'wf-prior', comboKey: 'c1', configId: 'cfgSeed', promptKey: 'p1', ecosystem: 'SDXL' },
    });
    const base = fakeShared({ seed: seedRows() });
    let loseReply = true;
    const shared = {
      ...base.shared,
      append: async (value: Parameters<typeof base.shared.append>[0]) => {
        const res = await base.shared.append(value); // the row LANDS…
        if (loseReply) {
          loseReply = false;
          throw new DOMException('The operation timed out.', 'TimeoutError'); // …the reply does not
        }
        return res;
      },
    };
    const publish = vi.fn(async () => [9001]);
    renderApp({ shared, appStorage, poll: vi.fn(async () => succeeded), publish }, true);

    const grid = await stalledCell();
    await userEvent.click(within(grid).getByTestId('cell-resume-run'));
    await waitFor(() =>
      expect(within(grid).getByTestId('cell-stalled-message')).toHaveTextContent(RESULT_SAVE_FAILED_MESSAGE),
    );
    expect(base.appends).toHaveLength(1);

    await userEvent.click(within(grid).getByTestId('cell-resume-run'));
    await waitFor(() => expect(store.has(INFLIGHT_KEY)).toBe(false));
    expect(base.appends, 'a duplicate result row was created for one paid run').toHaveLength(1);
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it('a refusal a retry cannot change says so and offers NO Check status — only an honest Dismiss', async () => {
    const { appStorage, store } = fakeAppStorage({
      [INFLIGHT_KEY]: { workflowId: 'wf-prior', comboKey: 'c1', configId: 'cfgSeed', promptKey: 'p1', ecosystem: 'SDXL' },
    });
    const base = fakeShared({ seed: seedRows() });
    const shared = {
      ...base.shared,
      append: async () => {
        const message = 'account too new';
        throw new StorageError(403, 'not_eligible', message, { code: 'not_eligible', message, error: message });
      },
    };
    renderApp({ shared, appStorage, poll: vi.fn(async () => succeeded), publish: vi.fn(async () => [9001]) }, true);

    const grid = await stalledCell();
    await userEvent.click(within(grid).getByTestId('cell-resume-run'));
    await waitFor(() =>
      expect(within(grid).getByTestId('cell-stalled-message')).toHaveTextContent(RESULT_SAVE_REFUSED_MESSAGE),
    );
    expect(within(grid).getByTestId('cell-stalled-message')).not.toHaveTextContent(/try again/i);
    expect(within(grid).queryByTestId('cell-resume-run')).toBeNull();
    expect(within(grid).getByTestId('cell-cancel-run')).toHaveTextContent(PAID_DISMISS_LABEL);
    expect(store.has(INFLIGHT_KEY)).toBe(true);
  });
});

describe('what a stalled cell says, and what its Dismiss promises', () => {
  it('a rehydrated record WITH published ids says “generated, not on the grid yet”, and Check status saves without polling or publishing', async () => {
    const { appStorage, store } = fakeAppStorage({
      [INFLIGHT_KEY]: {
        workflowId: 'wf-prior',
        comboKey: 'c1',
        configId: 'cfgSeed',
        promptKey: 'p1',
        ecosystem: 'SDXL',
        imageIds: [9001],
      },
    });
    const base = fakeShared({ seed: seedRows() });
    const poll = vi.fn(async () => succeeded);
    const publish = vi.fn(async () => [9001]);
    renderApp({ shared: base.shared, appStorage, poll, publish }, true);

    const grid = await stalledCell();
    expect(within(grid).getByTestId('cell-stalled-message')).toHaveTextContent(RESULT_PENDING_MESSAGE);
    expect(within(grid).getByTestId('cell-cancel-run')).toHaveTextContent(PAID_DISMISS_LABEL);

    await userEvent.click(within(grid).getByTestId('cell-resume-run'));
    await waitFor(() => expect(store.has(INFLIGHT_KEY)).toBe(false));
    expect(base.appends).toHaveLength(1);
    expect(poll).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it('a stalled cell with no published ids names both possibilities, and its Dismiss is the plain one', async () => {
    const { appStorage } = fakeAppStorage({
      [INFLIGHT_KEY]: { workflowId: 'wf-prior', comboKey: 'c1', configId: 'cfgSeed', promptKey: 'p1', ecosystem: 'SDXL' },
    });
    renderApp({ shared: fakeShared({ seed: seedRows() }).shared, appStorage }, true);
    const grid = await stalledCell();
    expect(within(grid).getByTestId('cell-stalled-message')).toHaveTextContent(STALLED_MESSAGE);
    expect(within(grid).getByTestId('cell-cancel-run')).toHaveTextContent(/^Dismiss$/);
  });
});
