// Vote-state durability (item 5) + analytics (item 6), driven through the real
// App against the SDK mock host with injected fakes for the per-viewer KV store
// (`appStorage`) and the analytics `track` seam:
//   - a vote PERSISTS the viewer's voted-set to per-viewer KV, and
//   - on a later mount the highlight HYDRATES from that KV (no reload blip), and
//   - build / vote analytics events fire.

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Harness } from '@civitai/blocks-react/testing';
import type { SharedListItem } from '@civitai/blocks-react';

import { App, type AppDeps } from './App.js';
import { fakeAppStorage, fakeShared, immediateSleep } from './test-helpers.js';
import type { CombinationData } from './types.js';

const comboData: CombinationData = {
  v: 2,
  kind: 'combination',
  configs: [
    {
      id: 'cfgA',
      checkpoint: { versionId: 1001, modelId: 500, baseModel: 'SDXL 1.0', modelName: 'JuggernautXL' },
      loras: [],
    },
  ],
};

function seedCombo(key = 'combo-1'): SharedListItem {
  return {
    key,
    authorUserId: 7,
    count: 3,
    value: { title: 'Seed Combo', body: '', data: comboData },
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

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
      <App deps={{ resolveResources: async () => [], pollIntervalMs: 0, sleep: immediateSleep, ...deps }} />
    </Harness>,
  );
}

describe('vote-state durability (per-viewer KV) + analytics', () => {
  it('persists the voted-set to per-viewer KV and fires build + vote analytics', async () => {
    const { shared } = fakeShared({ seed: [seedCombo()] });
    const { appStorage, sets } = fakeAppStorage();
    const track = vi.fn();
    renderApp({ shared, appStorage, track });

    // `block_loaded` fires once the handshake settles.
    await waitFor(() => expect(track).toHaveBeenCalledWith('block_loaded', expect.anything()));

    const card = await screen.findByTestId('combo-card');
    const vote = within(card).getByTestId('combo-vote');
    expect(vote).toHaveAttribute('data-voted', 'false');
    await userEvent.click(vote);

    await waitFor(() => expect(vote).toHaveAttribute('data-voted', 'true'));
    // The voted-set was persisted to per-viewer KV under the versioned key.
    const persisted = sets.filter((s) => s.key === 'voted:v1').at(-1);
    expect(persisted?.value).toEqual(['combo-1']);
    // …and the vote analytics event fired.
    expect(track).toHaveBeenCalledWith('vote');
  });

  it('hydrates the voted highlight from per-viewer KV on mount (no reload blip)', async () => {
    const { shared } = fakeShared({ seed: [seedCombo()] });
    // KV already holds this viewer's prior vote for combo-1.
    const { appStorage } = fakeAppStorage({ 'voted:v1': ['combo-1'] });
    renderApp({ shared, appStorage, track: vi.fn() });

    const card = await screen.findByTestId('combo-card');
    const vote = within(card).getByTestId('combo-vote');
    // The highlight reflects the persisted vote WITHOUT any click this session.
    await waitFor(() => expect(vote).toHaveAttribute('data-voted', 'true'));
  });

  it('removes the key from KV on unvote', async () => {
    const { shared } = fakeShared({ seed: [seedCombo()] });
    const { appStorage, sets } = fakeAppStorage({ 'voted:v1': ['combo-1'] });
    const track = vi.fn();
    renderApp({ shared, appStorage, track });

    const card = await screen.findByTestId('combo-card');
    const vote = within(card).getByTestId('combo-vote');
    await waitFor(() => expect(vote).toHaveAttribute('data-voted', 'true'));
    await userEvent.click(vote); // now an UNVOTE

    await waitFor(() => expect(vote).toHaveAttribute('data-voted', 'false'));
    const persisted = sets.filter((s) => s.key === 'voted:v1').at(-1);
    expect(persisted?.value).toEqual([]);
    expect(track).toHaveBeenCalledWith('vote_removed');
  });
});
