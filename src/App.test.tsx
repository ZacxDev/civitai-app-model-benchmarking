// App-level: item 1 — a just-submitted combination appears WITHOUT a manual
// reload, EVEN WHEN list() lags (read-after-write). Drives the real submit flow
// through the App but injects a `shared` whose list() never reflects the append,
// so only the optimistic reconcile can make the row show.

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Harness } from '@civitai/blocks-react/testing';

import { App, type AppDeps } from './App.js';
import { CKPT_SDXL, fakeShared, immediateSleep } from './test-helpers.js';

function renderApp(deps: Partial<AppDeps>) {
  render(
    <Harness
      viewer={{ id: 99, username: 'me' }}
      theme="dark"
      consentGranted
      buzzBudget={1000}
      buzz={{ balance: 5000 }}
      buzzBalance={{ blue: 0, green: 0, yellow: 5000 }}
      cannedPicks={{ Checkpoint: CKPT_SDXL }}
      shared={{ seed: [] }}
      showLog={false}
    >
      <App deps={{ resolveResources: async () => [], pollIntervalMs: 0, sleep: immediateSleep, ...deps }} />
    </Harness>,
  );
}

describe('item 1: list auto-refreshes after submit even when list() lags', () => {
  it('shows the new combination via optimistic reconcile (append reflected only optimistically)', async () => {
    const { shared, appends } = fakeShared({ reflectMutations: false }); // list() NEVER returns the append
    renderApp({ shared });

    await userEvent.click(await screen.findByTestId('submit-combination'));
    const form = await screen.findByTestId('combination-form');
    await userEvent.type(within(form).getByTestId('combo-name'), 'Lagging Combo');
    await userEvent.click(within(form).getByTestId('pick-checkpoint'));
    await waitFor(() => expect(within(form).getByTestId('checkpoint-name')).toHaveTextContent('JuggernautXL'));
    await userEvent.click(within(form).getByTestId('combo-submit'));

    // The row appears without a manual reload…
    const card = await screen.findByTestId('combo-card');
    expect(card).toHaveTextContent('Lagging Combo');
    expect(appends).toHaveLength(1);

    // …and it PERSISTS after the reconcile reload settles (not wiped by the empty list()).
    await new Promise((r) => setTimeout(r, 0));
    await waitFor(() => expect(screen.getByTestId('combo-card')).toHaveTextContent('Lagging Combo'));
  });
});
