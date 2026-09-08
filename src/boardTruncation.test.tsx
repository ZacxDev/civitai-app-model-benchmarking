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
import { missingMembersNotice } from './lib/gridEntries.js';
import { fakeAppStorage, immediateSleep, openView } from './test-helpers.js';
import type { CombinationData, GridData } from './types.js';

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
    // ⚠ The load anchor is the MATCHUPS view's card, so this navigates there:
    // Grids is the default since 527 (§11.5) and its own list renders before the
    // board scan resolves, so it is not a load anchor.
    await openView('Matchups');
    await waitFor(() => expect(screen.getByTestId('matchup-card')).toBeInTheDocument());
    expect(screen.queryByTestId('board-truncated-notice')).toBeNull();
  });

  // 🔴 CRITERION: the SAME notice reaches the GRIDS view, which is where the
  // truncated ranking now does the most work — it decides the Top Grid's members
  // and orders Community Grids. This is deliberately NOT a second notice: it
  // asserts the ONE existing `board-truncated-notice` is visible on the view the
  // app opens on, which is what "extend it to the Grids view" has to mean when
  // the notice is rendered next to the view switch.
  it('🔴 the SAME notice is visible on the Grids view — the default one', async () => {
    const { shared, pages } = endlessShared();
    renderApp({ shared, appStorage: fakeAppStorage().appStorage, track: vi.fn() });

    // The default view really is Grids (criterion 9) — asserted, not assumed,
    // because the whole point of this case is WHERE the notice is visible.
    expect(await screen.findByTestId('grid-view')).toBeInTheDocument();
    expect(screen.queryByTestId('matchups-view')).toBeNull();

    const notice = await screen.findByTestId('board-truncated-notice');
    expect(notice).toHaveTextContent(/only the entries loaded so far/i);
    expect(pages(), 'the scan did not page — nothing was truncated').toBeGreaterThan(1);
  });

  it('does NOT cry truncation on the Grids view either, on a board that fits', async () => {
    renderApp({ shared: finiteShared(), appStorage: fakeAppStorage().appStorage, track: vi.fn() });

    // The Grids list is the load anchor here: the Top Grid card is rendered from
    // the scanned rows, so its presence means the scan settled.
    await waitFor(() => expect(screen.getByTestId('grid-system-badge')).toBeInTheDocument());
    expect(screen.queryByTestId('board-truncated-notice')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The SECOND consumer of the same flag: a grid's MISSING-MEMBERS copy.
// ---------------------------------------------------------------------------
//
// 🔴 THE FLAG EXISTED AND NOTHING BRANCHED ON IT. `boardTruncated` was computed
// for the ranking notice and never passed to `GridsView`, so the missing-members
// sentence asserted a cause the app cannot know — "their authors removed them" —
// on a board where the members may simply never have been READ. `missingMembers`
// is a set difference against the rows the scan reached, so on a truncated scan a
// live member and a withdrawn one are indistinguishable.
//
// These two cases are a PAIR and neither is meaningful alone: the same grid, the
// same two unreachable member keys, differing ONLY in whether the scan finished.
// The strings are pinned through the exported builder, so the copy and the guard
// move together.

const GRID_KEY = 'gk-dangling';
const gridData: GridData = {
  v: 1,
  kind: 'grid',
  matchupKeys: ['mk-never-read'],
  promptKeys: ['qk-never-read'],
};

function gridRow(): SharedListItem {
  return {
    key: GRID_KEY,
    authorUserId: 7,
    count: 5,
    viewerVoted: false,
    value: { title: 'Dangling grid', body: '', data: gridData },
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

/**
 * The disclosure the card should carry, per branch — built from the ONE source
 * of the copy so a reword cannot pass here while the app says something else.
 *
 * ⚠ DERIVED FROM THE IMPLEMENTATION, ON PURPOSE, AND THAT IS WHY IT IS NOT
 * ALONE. What this file is entitled to claim is *which branch reached the DOM*,
 * not what the branch says — a mutant that collapses both branches to one string
 * would satisfy both cases here, because both expectations move with it. The
 * LITERAL strings are pinned in `lib/gridEntries.test.ts`, and the
 * `NOTICE(true) !== NOTICE(false)` assertion below is what makes the collapse
 * visible from this side too.
 */
const NOTICE = (truncated: boolean): string =>
  missingMembersNotice(
    {
      matchups: [],
      prompts: [],
      missingMatchups: 1,
      missingPrompts: 1,
      missingTotal: 2,
      authoredTotal: 2,
    },
    truncated,
  )!;

describe("a grid's missing members, on a board the app could not finish reading", () => {
  it('🔴 says the members may not have been READ — it does not blame their authors', async () => {
    // The grid rides page 1; every later page is filler and the cursor never
    // ends, so the scan stops at the cap with `mk-never-read` / `qk-never-read`
    // still unseen. That is the real production shape.
    let calls = 0;
    const shared = {
      ...endlessShared().shared,
      async list() {
        calls += 1;
        return {
          items: calls === 1 ? [gridRow()] : [row(`k${calls}`)],
          nextCursor: `cursor-${calls}`,
        };
      },
    } as unknown as UseSharedStorage;
    renderApp({ shared, appStorage: fakeAppStorage().appStorage, track: vi.fn() });

    // `waitFor` must THROW to retry — a bare `.find()` returning `undefined`
    // resolves on the first tick and the case dies on an undefined card instead
    // of waiting for the scan.
    const card = await waitFor(() => {
      const el = screen
        .getAllByTestId('grid-card')
        .find((c) => c.getAttribute('data-key') === GRID_KEY);
      expect(el, 'the dangling grid never rendered').toBeTruthy();
      return el!;
    });

    // PREMISE, asserted: the scan really was truncated. Without it this case
    // passes on a complete scan too — and then it is pinning the wrong branch.
    expect(screen.getByTestId('board-truncated-notice')).toBeInTheDocument();
    expect(calls, 'the scan did not page — nothing was truncated').toBeGreaterThan(1);

    expect(card.querySelector('[data-testid="grid-card-missing"]')).toHaveTextContent(
      NOTICE(true),
    );
  });

  it('🔴 NEGATIVE CONTROL: on a COMPLETE scan the same grid DOES attribute removal', async () => {
    // Same grid, same two unreachable keys — the only thing that changes is that
    // the board ends. Without this pair, the case above is satisfied by an app
    // that shows the truncated wording unconditionally, which would be a
    // different lie in the other direction.
    const shared = {
      ...endlessShared().shared,
      async list() {
        return { items: [gridRow()] };
      },
    } as unknown as UseSharedStorage;
    renderApp({ shared, appStorage: fakeAppStorage().appStorage, track: vi.fn() });

    const card = await waitFor(() => {
      const el = screen
        .getAllByTestId('grid-card')
        .find((c) => c.getAttribute('data-key') === GRID_KEY);
      expect(el, 'the dangling grid never rendered').toBeTruthy();
      return el!;
    });
    expect(screen.queryByTestId('board-truncated-notice')).toBeNull();
    expect(card.querySelector('[data-testid="grid-card-missing"]')).toHaveTextContent(
      NOTICE(false),
    );
    // …and the two sentences really are different, so the pair discriminates.
    expect(NOTICE(true)).not.toBe(NOTICE(false));
  });
});
