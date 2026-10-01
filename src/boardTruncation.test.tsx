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

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Harness } from './test-harness.js';
import type { SharedItem } from '@civitai/sdk';
import type { SharedStore } from './lib/sdk-runtime.js';

import { App, type AppDeps } from './App.js';
import { missingMembersNotice } from './lib/gridEntries.js';
import { fakeAppStorage, immediateSleep, openRowMenu, openView } from './test-helpers.js';
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

function row(key: string): SharedItem {
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
 * A matchup row the VIEWER owns, so its card carries the `⋮` → Remove control.
 *
 * 🔴 IT EXISTS ONLY AS A HANDLE ON `reload()`. The truncated→thrown case needs the
 * APP to re-read the board on its own, and a withdraw is the cheapest control that
 * does. It is aimed at a MATCHUP rather than at the grid so the card carrying that
 * case's second assertion survives its own optimistic delete.
 */
function ownMatchupRow(): SharedItem {
  return { ...row('mk-mine'), authorUserId: 99 };
}

/**
 * A shared store that ALWAYS hands back another cursor — i.e. a board deeper
 * than the app's page cap, whatever that cap is set to. Deliberately not pinned
 * to the literal 40: a fixture built from the constant it is meant to detect
 * cannot see the constant change.
 */
function endlessShared(): { shared: SharedStore; pages: () => number } {
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
  } as unknown as SharedStore;
  return { shared, pages: () => calls };
}

/** A board that ends — one page, no cursor. The negative control. */
function finiteShared(): SharedStore {
  return {
    ...endlessShared().shared,
    async list() {
      return { items: [row('only')] };
    },
  } as unknown as SharedStore;
}

/**
 * A board whose `list()` NEVER settles, so the scan is permanently in flight.
 *
 * 🔴 IT EXISTS TO VALIDATE A LOAD ANCHOR, which is a claim about TIMING and therefore
 * not something a settled fixture can make. See the anchor case below.
 */
function pendingShared(): SharedStore {
  return {
    ...endlessShared().shared,
    list() {
      return new Promise<never>(() => {});
    },
  } as unknown as SharedStore;
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

  // 🔴 CRITERION: ONE notice serves the GRIDS section, which is where the
  // truncated ranking does the most work — it decides the Top Grid's members and
  // orders the grids list. This is deliberately NOT a second notice.
  //
  // ⚠ WHAT THIS CASE USED TO ASSERT, AND WHY IT NO LONGER CAN. It read the grids
  // view's presence together with `queryByTestId('matchups-view')` being NULL, to
  // prove Grids was the DEFAULT of three mutually-exclusive tabs. The IA refactor
  // deleted the tab strip: all three sections are mounted at once, so "the default
  // view" is not a fact about the app any more and the absence assertion would be
  // asserting the opposite of the intended design. What survives — and is what the
  // case was actually for — is that the one notice is rendered ABOVE the grids
  // section rather than inside any one of them, so every reader of the truncated
  // ranking sees it. That ordering is asserted structurally below.
  it('🔴 ONE notice covers the grids section, rendered above all three sections', async () => {
    const { shared, pages } = endlessShared();
    renderApp({ shared, appStorage: fakeAppStorage().appStorage, track: vi.fn() });

    expect(await screen.findByTestId('grid-view')).toBeInTheDocument();
    // Exactly one notice, not one per section.
    await waitFor(() => expect(screen.getAllByTestId('board-truncated-notice')).toHaveLength(1));
    // …and it PRECEDES the first section, so it is not scoped to any one of them.
    const notice0 = screen.getByTestId('board-truncated-notice');
    const grids = screen.getByTestId('section-grids');
    expect(notice0.compareDocumentPosition(grids) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(grids.contains(notice0)).toBe(false);

    const notice = await screen.findByTestId('board-truncated-notice');
    expect(notice).toHaveTextContent(/only the entries loaded so far/i);
    expect(pages(), 'the scan did not page — nothing was truncated').toBeGreaterThan(1);
  });

  it('does NOT cry truncation on the Grids view either, on a board that fits', async () => {
    renderApp({ shared: finiteShared(), appStorage: fakeAppStorage().appStorage, track: vi.fn() });

    // 🔴 THE LOAD ANCHOR IS THE MATCHUPS CARD, THE SAME ONE THE SIBLING NEGATIVE
    // CONTROL USES, AND THE ANCHOR THIS CASE HAD BEFORE WAS VACUOUS.
    //
    // ⚠️ IT WAS `grid-open-system-badge`, with the comment "the Top Grid is computed
    // from the scanned rows, so its presence means the scan settled". That is FALSE and
    // the sentence is retracted. `openKey` initialises to `null`, and
    // `buildTopGrid([], [])` still yields a system entry — so the system marker is in
    // the DOM on FIRST PAINT, before the board scan has resolved anything. The
    // `toBeNull()` below could therefore run before a notice could possibly have
    // appeared, which makes a LATE notice indistinguishable from an ABSENT one: the
    // exact failure this file already names at the sibling case a few lines up, which
    // is why THAT one navigates to Matchups.
    //
    // ⚠️ THE MARKER ITSELF MOVED. The "System grid" BADGE is gone (operator feedback);
    // `grid-open-system-note` — the sentence explaining that the Top Grid cannot be
    // voted on — is rendered under the SAME `entry.system` condition and is the system
    // marker on this surface now. The retraction above is unaffected: what was vacuous
    // about the old anchor was its TIMING, not which element carried it, and the note
    // is on first paint for exactly the same reason. Same hazard, same fix.
    //
    // 🔴 WHY MATCHUPS IS A REAL ANCHOR AND THE SYSTEM MARKER IS NOT: `matchup-card` renders only
    // for a row the scan actually READ (`finiteShared` seeds exactly one), so its
    // presence is evidence about the scan rather than about the initial state.
    await openView('Matchups');
    await waitFor(() => expect(screen.getByTestId('matchup-card')).toBeInTheDocument());

    // …then back to the GRIDS board, which is what this case is about. The scan is
    // settled by now, so the absence below is an absence.
    await openView('Grids');
    expect(screen.getByTestId('grid-open-system-note')).toBeInTheDocument();
    expect(screen.queryByTestId('board-truncated-notice')).toBeNull();
  });

  // 🔴 VALIDATE THE ANCHOR, because "this anchor is vacuous" is a claim about TIMING and
  // no settled fixture can make it. With `list()` permanently in flight, the open grid's
  // system note is ALREADY in the document while the grids board is still showing its
  // loading spinner — so the note and "the scan settled" are independent facts, and any
  // `toBeNull()` sequenced behind the note alone runs too early.
  //
  // This is the control that turns the retraction above from an assertion into a
  // measurement. It is an INVARIANT GUARD on the app (nothing about this behaviour is
  // wrong or changed), whose subject is the TEST-WRITING hazard.
  it('🔴 ANCHOR CONTROL: the system marker renders while the board scan is still in flight', async () => {
    renderApp({ shared: pendingShared(), appStorage: fakeAppStorage().appStorage, track: vi.fn() });

    // The note is there on first paint: `openKey` starts `null` and
    // `buildTopGrid([], [])` yields a system entry regardless of what the scan found.
    await waitFor(() => expect(screen.getByTestId('grid-open-system-note')).toBeInTheDocument());
    // …and the board it sits above has NOT loaded. 🔴 THIS IS THE POSITIVE CONTROL: it
    // is a PRESENCE, so it cannot be satisfied by a stale selector or an empty render,
    // and it is what proves the two facts are simultaneous rather than sequential.
    expect(screen.getByTestId('grids-loading')).toBeInTheDocument();
    // …and the matrix is empty of scanned rows, so the note cannot have come from one.
    // ⚠ AN ABSENCE, NOT A CONTROL — a draft labelled it "POSITIVE CONTROL", which it
    // cannot be: a wrong testid would produce the same `[]`. It is corroboration, and the
    // presence assertion above is what carries the case. (`grid-group-matchup` is real —
    // twelve other files query it — so this one is not silently broken, only weaker than
    // its old label claimed.)
    expect(screen.queryAllByTestId('grid-group-matchup')).toEqual([]);
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

function gridRow(): SharedItem {
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
    } as unknown as SharedStore;
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
    } as unknown as SharedStore;
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

  /**
   * 🔴 THE TRUNCATED → THROWN SEQUENCE, WHICH NOTHING COVERED.
   *
   * Every case above renders ONE read. This one renders two, and the second one
   * FAILS — which is the routine shape, not an exotic one: the app re-reads the
   * board after a publish, a withdraw, a submit, an update and a run, so any of
   * those over a flaky connection produces exactly this.
   *
   * 🔴 WHAT WENT WRONG, AND WHY IT IS THIS FILE'S BUSINESS. For one range
   * `App` derived the truncation flag as `boardRead === 'truncated'`, i.e. from the
   * LATEST REQUEST. The catch arm writes `'error'` and never calls `setItems`, so
   * the flag flipped to false while `items` still held the truncated PREFIX. Both
   * of this file's subjects broke at once:
   *   - the `board-truncated-notice` DISAPPEARED, so the vote ranking, the top-N
   *     that becomes a grid's rows and columns, and every "Included" count present
   *     a prefix as the whole board — the silent ordering lie this file's header
   *     says the notice exists to prevent;
   *   - `missingMembersNotice` flipped to "their authors removed them", about rows
   *     the app simply never fetched.
   *
   * ⚠️ THE FIXTURE DOES NOT KNOW `MAX_PAGES`, deliberately, for the same reason
   * `endlessShared` does not: the second phase is armed by the TEST once the first
   * scan's own disclosure is on screen, never by counting to 40.
   */
  it('🔴 a later THROWN read does not un-truncate the prefix still in `items`', async () => {
    let failReads = false;
    /** `list()` CALLS, successful or not — the premise that a second read happened. */
    let attempts = 0;
    /** Successful pages only — what the snapshot in `items` was built from. */
    let pages = 0;
    const shared = {
      ...endlessShared().shared,
      async list() {
        attempts += 1;
        if (failReads) throw new Error('BOARD_UNAVAILABLE');
        pages += 1;
        return {
          // Page 1 carries the dangling grid AND a row the VIEWER owns; the rest is
          // filler with a never-ending cursor, so the scan stops at the cap.
          items: pages === 1 ? [gridRow(), ownMatchupRow()] : [row(`k${pages}`)],
          nextCursor: `cursor-${pages}`,
        };
      },
      async withdraw() {
        return { ok: true as const, deleted: true };
      },
    } as unknown as SharedStore;
    renderApp({ shared, appStorage: fakeAppStorage().appStorage, track: vi.fn() });

    // ---- PHASE 1: the truncated read, with BOTH of this file's subjects on screen ----
    const card = await waitFor(() => {
      const el = screen
        .getAllByTestId('grid-card')
        .find((c) => c.getAttribute('data-key') === GRID_KEY);
      expect(el, 'the dangling grid never rendered').toBeTruthy();
      return el!;
    });
    expect(screen.getByTestId('board-truncated-notice')).toBeInTheDocument();
    expect(card.querySelector('[data-testid="grid-card-missing"]')).toHaveTextContent(
      NOTICE(true),
    );
    expect(pages, 'the first scan did not page — nothing was truncated').toBeGreaterThan(1);
    const attemptsBefore = attempts;
    const pagesBefore = pages;

    // ---- PHASE 2: arm the failure, then make the APP re-read on its own ----
    //
    // 🔴 THE APP'S OWN `reload()`, NOT A REMOUNT. A remount would re-run the whole
    // effect from scratch and never produce the sequence under test. A WITHDRAW is the
    // cheapest control that reaches `reload()`, and it is aimed at a MATCHUP rather
    // than at the grid so the card carrying the second assertion survives its own
    // optimistic delete.
    failReads = true;
    const matchups = await openView('Matchups');
    const mine = await waitFor(() => {
      const el = within(matchups)
        .getAllByTestId('matchup-card')
        .find((c) => within(c).queryByTestId('matchup-menu') !== null);
      expect(el, 'no own matchup row rendered — nothing here can reach reload()').toBeTruthy();
      return el!;
    });
    await openRowMenu('matchup', mine);
    await userEvent.click(within(mine).getByTestId('matchup-withdraw'));
    await userEvent.click(within(mine).getByTestId('withdraw-confirm'));

    // PREMISE, BOTH DIRECTIONS: a further read was really ATTEMPTED and really FAILED.
    // Without this pair the claims below pass on a tree that never re-read anything.
    await waitFor(() => {
      expect(attempts, 'no further read was issued — the sequence never happened').toBeGreaterThan(
        attemptsBefore,
      );
    });
    await waitFor(() => {
      expect(screen.getByTestId('matchups-error'), 'the re-read did not fail').toHaveTextContent(
        'BOARD_UNAVAILABLE',
      );
    });
    // 🔴 AND NO PAGE CAME BACK: `pages` is unchanged from phase 1, so the snapshot in
    // `items` is still the prefix the first scan built. Compared against the value
    // CAPTURED before phase 2, not against itself — an `expect(pages).toBe(pages)`
    // tautology sat here for one edit and asserted nothing.
    expect(pages, 'a read succeeded during the failing phase').toBe(pagesBefore);

    // ---- THE TWO CLAIMS, back on the grids board ----
    await openView('Grids');
    expect(
      screen.queryByTestId('board-truncated-notice'),
      'the truncation disclosure vanished on a FAILED read while `items` still holds the prefix — the ranking now presents part of the board as the whole of it',
    ).not.toBeNull();
    const after = await waitFor(() => {
      const el = screen
        .getAllByTestId('grid-card')
        .find((c) => c.getAttribute('data-key') === GRID_KEY);
      expect(el, 'the dangling grid left the list').toBeTruthy();
      return el!;
    });
    expect(
      after.querySelector('[data-testid="grid-card-missing"]'),
      'the dangling-member notice flipped to "their authors removed them" after a failed read',
    ).toHaveTextContent(NOTICE(true));
  });
});
