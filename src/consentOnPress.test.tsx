// 🔴 JUST-IN-TIME CONSENT — the regression suite for the duplicate-prompt removal.
//
// The host (civitai.com) renders its own canonical "missing permissions" bar, so this
// app's persistent consent banner was a second, duplicate ask. Deleting it alone would
// have been a REGRESSION, because the app's press-time consent branch
// (`beginRun` → `requestConsent`) was UNREACHABLE: the grid's "Run this cell" button
// carried `disabled={!canRun}` with `canRun = canGenerate && !!viewer`, i.e. it was
// disabled in exactly the two states whose branches it was supposed to trigger. Both
// `requestConsent` and `requestSignIn` were dead code.
//
// These guards pin the resulting contract in BOTH directions:
//   1. the banner is gone (no second ask),
//   2. an unconsented PRESS reaches `requestConsent` exactly once,
//   3. a signed-out PRESS reaches `requestSignIn` exactly once,
//   4. a consented press still spends nothing until Confirm (the positive control —
//      it keeps a future zero in (2)/(3) readable as an absence rather than a silence).
//
// (2) and (3) are the ones that must be watched RED against the pre-change tree.

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Harness } from '@civitai/blocks-react/testing';
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

function seedRows(): SharedListItem[] {
  return [
    { key: 'c1', authorUserId: 7, count: 3, viewerVoted: false, value: { title: 'Grid Combo', body: '', data: comboData }, createdAt: new Date(0), updatedAt: new Date(0) },
    { key: 'p1', authorUserId: 8, count: 3, viewerVoted: false, value: { title: 'Grid Prompt', body: '', data: promptData }, createdAt: new Date(0), updatedAt: new Date(0) },
  ];
}

/** `consentGranted` drives whether the harness token carries `ai:write:budgeted`. */
function renderApp(
  deps: Partial<AppDeps>,
  opts: { consentGranted: boolean; viewer: { id: number; username: string } | null },
) {
  render(
    <Harness
      viewer={opts.viewer}
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
          GatedCell: fakeGatedCell({ visibleIds: [9001], hiddenIds: [9002] }),
          ...deps,
        }}
      />
    </Harness>,
  );
}

/** Open Grids and return the single seeded EMPTY cell's run button. */
async function runButton(): Promise<HTMLElement> {
  await userEvent.click(await screen.findByRole('tab', { name: /^Grids$/ }));
  const grid = await screen.findByTestId('results-grid');
  const cell = within(grid).getByTestId('grid-cell');
  expect(cell).toHaveAttribute('data-state', 'empty');
  return within(cell).getByTestId('run-cell');
}

describe('the app no longer renders its own consent ask', () => {
  it('renders NO persistent consent banner for a signed-in, unconsented viewer', async () => {
    const { shared } = fakeShared({ seed: seedRows() });
    const { appStorage } = fakeAppStorage();
    renderApp({ shared, appStorage }, { consentGranted: false, viewer: { id: 99, username: 'me' } });

    await screen.findByTestId('grid-view');
    // The host's own permissions bar is the canonical ask; this app must not add a second.
    expect(screen.queryByTestId('grid-consent')).toBeNull();
    expect(screen.queryByTestId('grid-grant')).toBeNull();
    expect(screen.queryByText(/Grant generation access/i)).toBeNull();
  });
});

describe('🔴 consent is asked at PRESS time, and the press must be able to LAND', () => {
  it('an unconsented viewer can press Run, and that press requests consent exactly once', async () => {
    const { shared } = fakeShared({ seed: seedRows() });
    const { appStorage } = fakeAppStorage();
    const requestConsent = vi.fn();
    const estimate = vi.fn(async () => ({ workflowId: '', status: 'pending' as const, cost: { total: 12 } }));
    renderApp(
      { shared, appStorage, requestConsent, estimate },
      { consentGranted: false, viewer: { id: 99, username: 'me' } },
    );

    const btn = await runButton();
    // 🔴 The affordance is PRESENT and pressable — disabling it here is what made the
    // press-time branch dead. This assertion is the whole point of the fix.
    expect(btn).not.toBeDisabled();

    await userEvent.click(btn);

    expect(requestConsent).toHaveBeenCalledTimes(1);
    expect(requestConsent).toHaveBeenCalledWith({ scopes: ['ai:write:budgeted'] });
    // …and it asked for consent INSTEAD of starting to spend.
    expect(estimate).not.toHaveBeenCalled();
  });

  it('a signed-OUT viewer can press Run, and that press requests sign-in exactly once', async () => {
    const { shared } = fakeShared({ seed: seedRows() });
    const { appStorage } = fakeAppStorage();
    const requestSignIn = vi.fn();
    const requestConsent = vi.fn();
    const estimate = vi.fn(async () => ({ workflowId: '', status: 'pending' as const, cost: { total: 12 } }));
    renderApp(
      { shared, appStorage, requestSignIn, requestConsent, estimate },
      { consentGranted: false, viewer: null },
    );

    const btn = await runButton();
    expect(btn).not.toBeDisabled();

    await userEvent.click(btn);

    // Sign-in comes FIRST — an anonymous viewer is never asked for a scope.
    expect(requestSignIn).toHaveBeenCalledTimes(1);
    expect(requestConsent).not.toHaveBeenCalled();
    expect(estimate).not.toHaveBeenCalled();
  });

  it('POSITIVE CONTROL: a CONSENTED press reaches the estimate and asks for nothing', async () => {
    const { shared } = fakeShared({ seed: seedRows() });
    const { appStorage } = fakeAppStorage();
    const requestConsent = vi.fn();
    const requestSignIn = vi.fn();
    const estimate = vi.fn(async () => ({ workflowId: '', status: 'pending' as const, cost: { total: 12 } }));
    renderApp(
      { shared, appStorage, requestConsent, requestSignIn, estimate },
      { consentGranted: true, viewer: { id: 99, username: 'me' } },
    );

    const btn = await runButton();
    expect(btn).not.toBeDisabled();
    await userEvent.click(btn);

    // The run path is genuinely wired: this is what makes a ZERO in the two guards
    // above a real absence rather than a probe attached to nothing.
    expect(estimate).toHaveBeenCalledTimes(1);
    expect(requestConsent).not.toHaveBeenCalled();
    expect(requestSignIn).not.toHaveBeenCalled();
    // Estimating is not spending — Confirm is still required.
    await screen.findByTestId('cell-confirm-run');
  });
});
