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
    viewerVoted: false,
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

describe('vote state is HOST-AUTHORITATIVE (SharedListItem.viewerVoted)', () => {
  // 🔴 WHY THIS REPLACES A KV MIRROR. Until `viewerVoted` existed, `list()`
  // returned only the aggregate `count`, so this app reconstructed the viewer's
  // own vote state from a per-viewer KV array it wrote itself. That mirror is a
  // GUESS: it is written by whichever client cast the vote, so it is blind to a
  // vote cast in another tab, another session or another device, and it cannot
  // be corrected when it disagrees with the server.
  //
  // The host now derives the flag per row (a JOIN on the resolved viewer uid,
  // `civitai/civitai#3474`) and both block hosts pass it through SHARED_LIST.
  // Verified deployed before this change was written: the commit is an ancestor
  // of the live dp-prod build. So the row itself now carries the truth and the
  // mirror is not merely redundant — it is the only thing that can be WRONG.

  it('🔴 renders the voted highlight from the ROW, with no KV entry at all', async () => {
    const { shared } = fakeShared({ seed: [{ ...seedCombo(), viewerVoted: true }] });
    // Deliberately EMPTY: at base the highlight could only come from here, so a
    // pass without it proves the row's own flag drove the render.
    const { appStorage } = fakeAppStorage();
    renderApp({ shared, appStorage, track: vi.fn() });

    const card = await screen.findByTestId('combo-card');
    const vote = within(card).getByTestId('combo-vote');
    await waitFor(() => expect(vote).toHaveAttribute('data-voted', 'true'));
  });

  it('🔴 the HOST wins when a stale KV mirror disagrees (the cross-device drift case)', async () => {
    // The exact shape the mirror gets wrong: this viewer voted from another
    // device and then REMOVED that vote there. The host says not-voted; the
    // local mirror still says voted. Showing "voted" here means the next click
    // sends `unvote` for a vote that no longer exists.
    const { shared } = fakeShared({ seed: [{ ...seedCombo(), viewerVoted: false }] });
    const { appStorage } = fakeAppStorage({ 'voted:v1': ['combo-1'] });
    renderApp({ shared, appStorage, track: vi.fn() });

    const card = await screen.findByTestId('combo-card');
    const vote = within(card).getByTestId('combo-vote');
    // Settle the mount effects, then assert the host's answer survived them.
    await waitFor(() => expect(screen.getByTestId('combo-card')).toBeInTheDocument());
    await waitFor(() => expect(vote).toHaveAttribute('data-voted', 'false'));
  });
});

describe('vote round-trip (optimistic flip) + analytics', () => {
  // 🔴 REPOINTED, NOT DELETED. These three cases used to assert that a vote was
  // mirrored into per-viewer KV under `voted:v1`, and that the highlight was
  // HYDRATED from that mirror on mount. Both are now wrong on purpose — the host
  // reports `viewerVoted` per row, so the mirror was a weaker second copy that
  // could not see another device. Their real coverage (the button flips on the
  // host's answer, and the analytics events fire) is kept below; the KV
  // assertions are replaced by a guard that the mirror stays GONE.

  it('flips to voted on the host’s answer and fires build + vote analytics', async () => {
    const { shared } = fakeShared({ seed: [seedCombo()] });
    const { appStorage } = fakeAppStorage();
    const track = vi.fn();
    renderApp({ shared, appStorage, track });

    // `block_loaded` fires once the handshake settles.
    await waitFor(() => expect(track).toHaveBeenCalledWith('block_loaded', expect.anything()));

    const card = await screen.findByTestId('combo-card');
    const vote = within(card).getByTestId('combo-vote');
    expect(vote).toHaveAttribute('data-voted', 'false');
    await userEvent.click(vote);

    await waitFor(() => expect(vote).toHaveAttribute('data-voted', 'true'));
    expect(track).toHaveBeenCalledWith('vote');
  });

  it('flips back on unvote and fires vote_removed', async () => {
    const { shared } = fakeShared({ seed: [{ ...seedCombo(), viewerVoted: true }] });
    const { appStorage } = fakeAppStorage();
    const track = vi.fn();
    renderApp({ shared, appStorage, track });

    const card = await screen.findByTestId('combo-card');
    const vote = within(card).getByTestId('combo-vote');
    await waitFor(() => expect(vote).toHaveAttribute('data-voted', 'true'));
    await userEvent.click(vote); // now an UNVOTE

    await waitFor(() => expect(vote).toHaveAttribute('data-voted', 'false'));
    expect(track).toHaveBeenCalledWith('vote_removed');
  });

  it('🔴 writes NO per-viewer KV mirror of the vote (pins the removal)', async () => {
    const { shared } = fakeShared({ seed: [seedCombo()] });
    const { appStorage, setAttempts } = fakeAppStorage();
    const track = vi.fn();
    renderApp({ shared, appStorage, track });

    const card = await screen.findByTestId('combo-card');
    const vote = within(card).getByTestId('combo-vote');
    await userEvent.click(vote);
    await waitFor(() => expect(vote).toHaveAttribute('data-voted', 'true'));

    // POSITIVE CONTROL on the instrument: the vote really did complete, so a
    // write here would have been recorded had one been issued.
    expect(track).toHaveBeenCalledWith('vote');
    // `setAttempts`, not `sets` — this must fail even if the write is issued and
    // the host rejects it, which `sets` alone could not distinguish.
    expect(
      setAttempts.filter((s) => s.key === 'voted:v1'),
      'the per-viewer vote mirror was reintroduced — see the `voted:v1` note in App.tsx',
    ).toHaveLength(0);
  });
});
