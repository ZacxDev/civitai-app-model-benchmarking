// App-level: item 1 — a just-submitted combination appears WITHOUT a manual
// reload, EVEN WHEN list() lags (read-after-write). Drives the real submit flow
// through the App but injects a `shared` whose list() never reflects the append,
// so only the optimistic reconcile can make the row show.

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Harness } from '@civitai/blocks-react/testing';

import { App, type AppDeps } from './App.js';
import { CKPT_SDXL, fakeAppStorage, fakeShared, immediateSleep } from './test-helpers.js';

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

describe('item 4: the Top-N control reads as personal, not global', () => {
  it('labels it "(your view)" with a hint that it does not change the shared grid', async () => {
    renderApp({ appStorage: fakeAppStorage().appStorage });
    await userEvent.click(await screen.findByRole('tab', { name: /^Grid$/ }));
    await screen.findByTestId('top-n');
    expect(screen.getByText(/Show top N \(your view\)/i)).toBeInTheDocument();
    expect(screen.getByText(/doesn't change the shared grid/i)).toBeInTheDocument();
  });
});

describe('item 6: one-time "How this works" panel', () => {
  it('shows the submit → vote → grid → run(public) → compare explainer for a first-time viewer', async () => {
    renderApp({ appStorage: fakeAppStorage().appStorage });
    const panel = await screen.findByTestId('how-this-works');
    expect(panel).toHaveTextContent(/submit/i);
    expect(panel).toHaveTextContent(/vote/i);
    expect(panel).toHaveTextContent(/public/i);
    expect(panel).toHaveTextContent(/compare/i);
  });

  it('dismisses it and PERSISTS the dismissal to per-viewer KV when "Got it" is clicked', async () => {
    const { appStorage, store } = fakeAppStorage();
    renderApp({ appStorage });
    await userEvent.click(await screen.findByTestId('howto-dismiss'));
    await waitFor(() => expect(screen.queryByTestId('how-this-works')).toBeNull());
    expect(store.get('howto-dismissed:v1')).toBe(true);
  });

  it('stays hidden for a viewer who already dismissed it', async () => {
    renderApp({ appStorage: fakeAppStorage({ 'howto-dismissed:v1': true }).appStorage });
    // The app is ready (tabs rendered) but the one-time panel never appears.
    await screen.findByTestId('view-switch');
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId('how-this-works')).toBeNull();
  });
});
