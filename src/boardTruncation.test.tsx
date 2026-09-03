// The board scan's page cap, and the disclosure it owes the viewer.
//
// 🔴 WHY THIS MATTERS AT ALL. `list()` is newest-first and takes no rank
// parameter, so "most-voted" is a CLIENT-side ranking over the rows the app
// bothered to read — and the read stops at MAX_PAGES × LIST_PAGE. Past that the
// tab counts, the top-N that becomes the grid's rows and columns, and every
// "Included" badge are computed over a prefix of the board while looking like
// the whole of it. The failure is silent and it is an ordering lie, not a
// missing-row nuisance: a combination with more votes than anything on screen
// can sit at row 2001 and never appear.
//
// The app already draws this distinction carefully for the per-viewer KV scan
// (`inflightScanTruncatedRef`, which arms a money guard). This is the public
// half, which used to return a silent prefix.

import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Harness } from '@civitai/blocks-react/testing';
import type { SharedListItem, UseSharedStorage } from '@civitai/blocks-react';

import { App, type AppDeps } from './App.js';
import { fakeAppStorage, immediateSleep } from './test-helpers.js';
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

function row(key: string): SharedListItem {
  return {
    key,
    authorUserId: 7,
    count: 1,
    viewerVoted: false,
    value: { title: `Combo ${key}`, body: '', data: comboData },
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

/**
 * A shared store that ALWAYS hands back another cursor — i.e. a board deeper
 * than the app's page cap, whatever that cap is set to. Deliberately not pinned
 * to the literal 40: a fixture built from the constant it is meant to detect
 * cannot see the constant change.
 */
function endlessShared(): { shared: UseSharedStorage; pages: () => number } {
  let calls = 0;
  const shared = {
    async list() {
      calls += 1;
      return { items: [row(`k${calls}`)], nextCursor: `cursor-${calls}` };
    },
    async get() {
      return null;
    },
    async report() {},
    async getCount() {
      return 0;
    },
    async getCounts() {
      return {};
    },
    async append() {
      return { key: 'x' };
    },
    async update() {},
    async vote() {
      return 1;
    },
    async unvote() {
      return 0;
    },
    async withdraw() {
      return { ok: true as const, deleted: true };
    },
  } as unknown as UseSharedStorage;
  return { shared, pages: () => calls };
}

/** A board that ends — one page, no cursor. The negative control. */
function finiteShared(): UseSharedStorage {
  return {
    ...endlessShared().shared,
    async list() {
      return { items: [row('only')] };
    },
  } as unknown as UseSharedStorage;
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

describe('board scan truncation', () => {
  it('🔴 discloses that the ranking covers only part of the board', async () => {
    const { shared, pages } = endlessShared();
    renderApp({ shared, appStorage: fakeAppStorage().appStorage, track: vi.fn() });

    const notice = await screen.findByTestId('board-truncated-notice');
    expect(notice).toHaveTextContent(/only the entries loaded so far/i);

    // PREMISE: the scan really did stop at a cap rather than exhausting a short
    // board. Without this the case would pass on a one-page fixture too, which
    // is the opposite of what it claims to test.
    expect(pages(), 'the scan did not page — nothing was truncated').toBeGreaterThan(1);
  });

  it('does NOT cry truncation on a board that fits (negative control)', async () => {
    renderApp({ shared: finiteShared(), appStorage: fakeAppStorage().appStorage, track: vi.fn() });

    // Wait for the board to actually load before asserting an absence — a notice
    // that is merely late would otherwise read as a notice that is absent.
    await waitFor(() => expect(screen.getByTestId('combo-card')).toBeInTheDocument());
    expect(screen.queryByTestId('board-truncated-notice')).toBeNull();
  });
});
