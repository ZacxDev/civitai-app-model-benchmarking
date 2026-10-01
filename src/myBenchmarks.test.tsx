// MY BENCHMARKS — the viewer's own grids, matchups and prompts, at their NEW address.
//
// ── WHAT MOVED HERE, AND FROM WHERE ─────────────────────────────────────────
//
// The §11.1 "My" half used to be a per-board My/Community `SegmentedControl` on the
// matchup and prompt views, and on the grids view it was nothing at all — the IA
// refactor deleted the grids sub-tabs and pointed the ARCHIVE flag at the community
// list instead, which is the one surface `ARCHIVE_NOTE` promises an archived row stays
// visible on. Both are retired. "My work" is one sidebar destination with three
// sub-items, and it hosts:
//
//   - the viewer's unpublished records (`UnpublishedList`: New / Edit / Discard /
//     Publish) — and for GRIDS this is the only create route there is;
//   - their published rows, with Remove;
//   - ARCHIVE + `ARCHIVE_NOTE`, and the "Show archived" recovery path.
//
// 🔴 CRITERION 12 IS RE-ASSERTED HERE, NOT DROPPED. `myCommunity.test.tsx` holds it for
// matchups and prompts against the same `lib/archive.ts`; what this file adds is the
// GRID arm, which had no archive coverage at all after the IA refactor pointed the flag
// at the community board. The claim is unchanged: archive is an author-side HIDE, the
// shared row is untouched, it keeps its votes, and the honest wording renders.
//
// 🔴 AND THE TWO PER-VIEWER INVARIANTS FROM `gridsView.test.tsx` MOVED HERE WITH THEIR
// COMPONENT. They are rendered against `MyGridsView` directly, not through the App,
// because the SDK `Harness` snapshots its `viewer` option on first render
// (`@civitai/blocks-react/dist/testing.js`) so the PROP cannot express a viewer swap.
// One of them changed SHAPE as well as address, and that is recorded where it sits: the
// LATCH they were written against no longer exists.
//
// ── 🔴 COVERAGE LABEL, FOR THE DIRECT-RENDER CASES ──────────────────────────
//
// THIS FILE AND ITS SUBJECT ARRIVE IN THE SAME COMMIT. `src/myBenchmarks.test.tsx` and
// `src/components/MyGridsView.tsx` were both added by `8a4b681`, and neither exists on
// `origin/main`. So "0 of N red at base" is a STRUCTURAL fact about a new file, not a
// coverage number. The direct-render cases in particular are INVARIANT GUARDS: they pin
// properties of a component that had no previous address, so nothing in them can be a
// regression guard over a fixed bug. Validate them by MUTATION, not by a red base.
//
// ⚠️ AND A METHOD WARNING. `git checkout <older-ref> -- <dir>` restores tracked files
// but CANNOT DELETE files new in HEAD (verified directly in a scratch repo), so a "base"
// built that way is a HYBRID tree and must not be described as a checkout of the older
// commit. An earlier write-up of these cases did exactly that, and named the wrong branch
// as the one lacking the component — `MyGridsView.tsx` is present on
// `zach/ia-feedback-sidebar`, because that PR is what added it.
// `src/sideNav.test.tsx` carries the same label.

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Harness } from './test-harness.js';
import type { SharedItem } from '@civitai/sdk';
import type { SharedStore } from './lib/sdk-runtime.js';

import { App, type AppDeps } from './App.js';
import { MyGridsView } from './components/MyGridsView.js';
import { ARCHIVE_KEY, ARCHIVE_NOTE } from './lib/archive.js';
import { draftKey } from './lib/drafts.js';
import { unpubGridKey } from './lib/grids.js';
import { unpubPromptKey } from './lib/unpubPrompts.js';
import {
  fakeAppStorage,
  fakeGatedCell,
  fakeShared,
  immediateSleep,
  openMyList,
  openRowMenu,
} from './test-helpers.js';
import type {
  CombinationData,
  CombinationRow,
  GridData,
  GridRow,
  PromptData,
  PromptRow,
  UnpublishedGrid,
} from './types.js';

const VIEWER_ID = 99;
const OTHER_ID = 7; // 🔴 distinct from VIEWER_ID — one author makes every partition vacuous

const comboData = (id: string): CombinationData => ({
  v: 2,
  kind: 'combination',
  configs: [
    {
      id,
      checkpoint: { versionId: 1001, modelId: 500, baseModel: 'SDXL 1.0', modelName: 'JuggernautXL' },
      loras: [],
    },
  ],
});
const promptData: PromptData = {
  v: 3,
  kind: 'prompt',
  default: { prompt: 'a portrait', params: {} },
};
const gridData = (matchupKeys: string[], promptKeys: string[]): GridData => ({
  v: 1,
  kind: 'grid',
  matchupKeys,
  promptKeys,
});

function row(key: string, count: number, title: string, data: unknown, authorUserId: number): SharedItem {
  return {
    key,
    count,
    authorUserId,
    viewerVoted: false,
    value: { title, body: '', data },
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

/** Two matchups and two prompts so a grid has real members to resolve against. */
const MEMBERS: SharedItem[] = [
  row('mk-a', 9, 'Matchup A', comboData('cfg-a'), OTHER_ID),
  row('mk-b', 8, 'Matchup B', comboData('cfg-b'), OTHER_ID),
  row('qk-1', 7, 'Prompt One', promptData, OTHER_ID),
  row('qk-2', 6, 'Prompt Two', promptData, OTHER_ID),
];

function mountApp(deps: Partial<AppDeps>, viewer: { id: number; username: string } | null) {
  return render(
    <Harness
      // 🔴 `null` is passed THROUGH, never coerced to `undefined`: the mock host
      // documents `viewer` as defaulting to a `dev-viewer`, so `undefined` gives a
      // SIGNED-IN viewer and an anon case silently stops being one.
      viewer={viewer}
      theme="dark"
      consentGranted
      buzzBudget={1000}
      buzzBalance={{ blue: 0, green: 0, yellow: 5000 }}
      shared={{ seed: [] }}
      showLog={false}
    >
      <App
        deps={{ resolveResources: async () => [], pollIntervalMs: 0, sleep: immediateSleep, ...deps }}
      />
    </Harness>,
  );
}

const keysOf = (testid: string): string[] =>
  screen.queryAllByTestId(testid).map((el) => el.getAttribute('data-key') ?? '');

// ===========================================================================
// The destination itself
// ===========================================================================

describe('🔴 My Benchmarks mounts ONE noun, and the community boards are gone', () => {
  const seed = [...MEMBERS, row('gk-mine', 4, 'My grid', gridData(['mk-a'], ['qk-1']), VIEWER_ID)];

  it('each sub-item mounts only its own surface', async () => {
    mountApp({ shared: fakeShared({ seed }).shared, appStorage: fakeAppStorage().appStorage }, {
      id: VIEWER_ID,
      username: 'me',
    });
    await screen.findByTestId('grid-view');

    for (const noun of ['grid', 'matchup', 'prompt'] as const) {
      await openMyList(noun);
      // POSITIVE CONTROL in the same frame: the surface asked for really mounted.
      expect(screen.getByTestId(`section-my-${noun}`)).toBeInTheDocument();
      // 🔴 EVERY OTHER SECTION IS ABSENT FROM THE DOM — including the open grid and its
      // matrix, which is precisely the unmount the money-path view-switch cases exist
      // for. Asserted as absences: a `display: none` would keep all of these resolving.
      const marked = Array.from(document.querySelectorAll('[data-mb-section]')).map((el) =>
        el.getAttribute('data-mb-section'),
      );
      expect(marked).toEqual([`my-${noun}`]);
      expect(screen.queryByTestId('board-nav')).toBeNull();
      expect(screen.queryByTestId('results-grid')).toBeNull();
      expect(screen.queryByTestId('grids-list')).toBeNull();
    }
  });

  it('Home comes back, with its board subnav and its matrix', async () => {
    // The negative control for the case above: if Home did not return, "the boards are
    // gone" would be satisfied by a nav that breaks the app.
    mountApp({ shared: fakeShared({ seed }).shared, appStorage: fakeAppStorage().appStorage }, {
      id: VIEWER_ID,
      username: 'me',
    });
    await screen.findByTestId('grid-view');
    await openMyList('prompt');
    expect(screen.queryByTestId('results-grid')).toBeNull();

    await userEvent.click(screen.getByTestId('nav-home'));

    expect(await screen.findByTestId('results-grid')).toBeInTheDocument();
    expect(screen.getByTestId('board-nav')).toBeInTheDocument();
    expect(screen.queryByTestId('section-my-prompt')).toBeNull();
  });
});

// ===========================================================================
// Criterion 12, for GRIDS — the arm that had no coverage at all
// ===========================================================================

describe('🔴 criterion 12 for GRIDS: Archive hides from My only, and says so in words', () => {
  const MINE = row('gk-mine', 30, 'My grid', gridData(['mk-a'], ['qk-1']), VIEWER_ID);
  const THEIRS = row('gk-theirs', 11, 'Their grid', gridData(['mk-b'], ['qk-2']), OTHER_ID);

  it('drops the grid from My while it stays on the board, in the community list, with its votes', async () => {
    const VOTES = 30; // distinct from 0 and 1, so a reset would show
    const { shared, withdraws, updates, appends } = fakeShared({ seed: [...MEMBERS, MINE, THEIRS] });
    const { appStorage, store } = fakeAppStorage();
    mountApp({ shared, appStorage }, { id: VIEWER_ID, username: 'me' });
    await screen.findByTestId('grid-view');

    await openMyList('grid');
    await waitFor(() => expect(keysOf('grid-card')).toEqual(['gk-mine']));

    // 🔴 ARCHIVE IS BEHIND THE ROW'S ⋮ NOW — one overflow menu per row holding Remove
    // and Archive, with Edit promoted onto the row. It is not hidden, it is unmounted
    // until the menu opens.
    await userEvent.click(within(await openRowMenu('grid')).getByTestId('archive-action'));

    // 🔴 HALF ONE — gone from MY.
    await waitFor(() => expect(keysOf('grid-card')).toEqual([]));
    expect(screen.getByTestId('my-list-empty')).toBeInTheDocument();
    // …recorded in the ONE per-viewer key §11.3 specifies, and nowhere else.
    await waitFor(() => expect(store.get(ARCHIVE_KEY)).toEqual(['gk-mine']));

    // 🔴 HALF TWO — THE ROW IS STILL ON THE SHARED BOARD. Three independent readings,
    // because "still there" is exactly the claim an archive-as-delete implementation
    // would fail quietly:
    //   (a) the app told the shared store NOTHING,
    const listed = await shared.list({});
    expect(withdraws, 'Archive withdrew the row — that is a delete, not a hide').toEqual([]);
    expect(updates, 'Archive rewrote the shared row').toEqual([]);
    expect(appends).toEqual([]);
    //   (b) the row is still what `list()` returns, with its vote total intact,
    expect(listed.items.map((i) => i.key)).toContain('gk-mine');
    expect(listed.items.find((i) => i.key === 'gk-mine')!.count).toBe(VOTES);
    //   (c) and the archiver still sees it on the COMMUNITY board, votes and all.
    await userEvent.click(screen.getByTestId('nav-home'));
    await waitFor(() => expect(keysOf('grid-card').sort()).toEqual(['gk-mine', 'gk-theirs']));
    const stillThere = screen
      .queryAllByTestId('grid-card')
      .find((el) => el.getAttribute('data-key') === 'gk-mine')!;
    expect(within(stillThere).getByTestId('vote-count')).toHaveTextContent(String(VOTES));
  });

  it('renders the honest wording next to the control, as the whole sentence', async () => {
    // 🔴 PINNED AS THE WHOLE NORMALISED STRING, typed out here rather than imported from
    // `lib/archive.ts`: an expectation read out of the implementation passes whatever
    // the implementation says, which is precisely the failure mode for a copy
    // guarantee. A reword must come here too.
    const { shared } = fakeShared({ seed: [...MEMBERS, MINE] });
    mountApp({ shared, appStorage: fakeAppStorage().appStorage }, { id: VIEWER_ID, username: 'me' });
    await screen.findByTestId('grid-view');
    await openMyList('grid');

    const note = await screen.findByTestId('archive-note');
    expect((note.textContent ?? '').replace(/\s+/g, ' ').trim()).toBe(
      'Archiving only hides a row from your My list. It stays on the shared board, ' +
        'stays in Community for everyone including you, and keeps its votes. ' +
        'Remove is the only action that takes it off the board for everyone.',
    );

    // …and it sits with the control it describes, not on some other screen. Both
    // controls live in the row's ⋮ now, so the menu is opened to see them — and the
    // note is rendered OUTSIDE it, which is the point: it is readable without arming
    // anything.
    const menu = await openRowMenu('grid');
    expect(within(menu).getByTestId('archive-action')).toBeInTheDocument();
    // The true delete is still offered, and still separate (§11.3).
    expect(within(menu).getByTestId('grid-withdraw')).toBeInTheDocument();
  });

  it('🔴 SURVIVES A RELOAD: a stored archive is read back on mount', async () => {
    // Without this the feature works only for the session that performed it — the write
    // lands, nothing reads it, and the row silently returns to My on the next load.
    // `archive:v1` is SEEDED rather than clicked, so the read path is what is under test
    // and the write path cannot cover for it.
    const { shared } = fakeShared({ seed: [...MEMBERS, MINE, THEIRS] });
    const { appStorage } = fakeAppStorage({ [ARCHIVE_KEY]: ['gk-mine'] });
    mountApp({ shared, appStorage }, { id: VIEWER_ID, username: 'me' });
    await screen.findByTestId('grid-view');
    await openMyList('grid');

    await waitFor(() => expect(screen.getByTestId('archived-toggle')).toBeInTheDocument());
    expect(keysOf('grid-card')).toEqual([]);

    // 🔴 AND THE HONEST WORDING SURVIVES THE ARCHIVED-ONLY STATE, which is the one
    // that needs it. This case already reached here — zero live rows, one archived,
    // no drafts — and asserted only that the toggle existed, so a gate of
    // `live.length > 0` on `archive-note` dropped the sentence and stayed GREEN. The
    // screen then said "No grids yet.", offered "Show archived (1)", and nowhere said
    // the row was still public: the list reads as EMPTY, which is exactly when a
    // viewer reads "Archive" as "removed". Found by a round-0 audit, not by a test.
    // `queryByTestId`, not `getByTestId`: `get*` THROWS during argument evaluation, so
    // `expect`'s message never prints and the failure reads as a generic
    // "Unable to find an element" — measured. `query*` returns null and lets the
    // named assertion below be the thing that speaks.
    const note = screen.queryByTestId('archive-note');
    expect(
      note,
      'the archived-only state says nothing about the row still being public',
    ).not.toBeNull();
    expect(note).toHaveTextContent(ARCHIVE_NOTE);

    // …and still on the community board, for the archiver too.
    await userEvent.click(screen.getByTestId('nav-home'));
    await waitFor(() => expect(keysOf('grid-card').sort()).toEqual(['gk-mine', 'gk-theirs']));
  });

  it('is reversible: an archived grid can be brought back to My', async () => {
    const { shared } = fakeShared({ seed: [...MEMBERS, MINE, THEIRS] });
    const { appStorage, store } = fakeAppStorage();
    mountApp({ shared, appStorage }, { id: VIEWER_ID, username: 'me' });
    await screen.findByTestId('grid-view');
    await openMyList('grid');

    await userEvent.click(within(await openRowMenu('grid')).getByTestId('archive-action'));
    await waitFor(() => expect(store.get(ARCHIVE_KEY)).toEqual(['gk-mine']));

    await userEvent.click(await screen.findByTestId('archived-toggle'));
    const archived = await screen.findByTestId('archived-list');
    expect(
      within(archived)
        .getAllByTestId('grid-card')
        .map((el) => el.getAttribute('data-key')),
    ).toEqual(['gk-mine']);
    await userEvent.click(within(archived).getByTestId('unarchive-action'));

    await waitFor(() => expect(store.get(ARCHIVE_KEY)).toEqual([]));
    await waitFor(() => expect(keysOf('grid-card')).toEqual(['gk-mine']));
  });

  it("offers no archive control on ANOTHER author's grid", async () => {
    // The ownership half read through its edge: `MyList` is handed the viewer's own
    // rows only, so a row it cannot archive is not on this surface at all — which is a
    // stronger statement than "the button is hidden".
    const { shared } = fakeShared({ seed: [...MEMBERS, MINE, THEIRS] });
    mountApp({ shared, appStorage: fakeAppStorage().appStorage }, { id: VIEWER_ID, username: 'me' });
    await screen.findByTestId('grid-view');
    await openMyList('grid');

    await waitFor(() => expect(keysOf('grid-card')).toEqual(['gk-mine']));
    // 🔴 COUNTED AT THE ⋮ RATHER THAN AT THE ITEM, because the items are unmounted
    // while their menu is closed — a count of `archive-action` would now be 0 whether
    // or not the other author's row were here, i.e. vacuous. One trigger = one row
    // that can be archived, and opening it yields exactly one Archive.
    expect(screen.queryAllByTestId('grid-menu')).toHaveLength(1);
    expect(within(await openRowMenu('grid')).getAllByTestId('archive-action')).toHaveLength(1);
  });
});

// ===========================================================================
// The matchup and prompt arms reach the SAME implementation
// ===========================================================================

describe('🔴 all three nouns share ONE archive implementation', () => {
  // 🔴 THE POINT OF THIS BLOCK IS THE SEAM, not a third copy of criterion 12.
  // `MyList` is one component used by three surfaces; before it, the matchup and
  // prompt views each carried a near-identical copy of this logic and the grids view a
  // third that DISAGREED with its own sibling predicate — an archived row the viewer did
  // not own was hidden from the one list AND absent from the archived list, leaving no
  // recovery path at all. What is asserted here is that all three surfaces now emit the
  // same controls, so a fix or a break reaches all three at once.
  const MINE_MATCHUP = row('mk-mine', 5, 'My matchup', comboData('cfg-mine'), VIEWER_ID);
  const MINE_PROMPT = row('qk-mine', 4, 'My prompt', promptData, VIEWER_ID);
  const MINE_GRID = row('gk-mine', 3, 'My grid', gridData(['mk-a'], ['qk-1']), VIEWER_ID);

  for (const noun of ['grid', 'matchup', 'prompt'] as const) {
    it(`${noun}: archive, note and recovery all render from the shared panel`, async () => {
      const { shared } = fakeShared({ seed: [...MEMBERS, MINE_MATCHUP, MINE_PROMPT, MINE_GRID] });
      const { appStorage, store } = fakeAppStorage();
      mountApp({ shared, appStorage }, { id: VIEWER_ID, username: 'me' });
      await screen.findByTestId('grid-view');
      await openMyList(noun);

      // The panel's own list testid is noun-scoped, so this is the shared component
      // rendering for THIS noun rather than a leftover from another surface.
      expect(await screen.findByTestId(`my-list-${noun}`)).toBeInTheDocument();
      await userEvent.click(within(await openRowMenu(noun)).getByTestId('archive-action'));

      // One key written, and it is this noun's row — so the three surfaces are not
      // sharing a single hardcoded key.
      const expectedKey = { grid: 'gk-mine', matchup: 'mk-mine', prompt: 'qk-mine' }[noun];
      await waitFor(() => expect(store.get(ARCHIVE_KEY)).toEqual([expectedKey]));
      expect(await screen.findByTestId('archived-toggle')).toBeInTheDocument();
      await userEvent.click(screen.getByTestId('archived-toggle'));
      expect(await screen.findByTestId('archived-list')).toBeInTheDocument();
      expect(screen.getByTestId('unarchive-action')).toBeInTheDocument();

      // 🔴 AND THE RECOVERY SURFACE KEEPS ITS FULL ACTION SET, which nothing pinned.
      // A round-1 mutation replaced the archived row's `publishedActions(...)` with
      // `null` — every archived row losing Edit AND Remove — and the whole dom project
      // stayed GREEN (40 files / 565). This is code the merge authored: before it, an
      // archived row got Remove from `MyGridsView.card`'s inline `WithdrawButton`; now
      // it comes from `MyList`. Archived is a per-viewer HIDE, so it is the one surface
      // where a viewer goes specifically to act on a row they had set aside — losing
      // Edit and Remove there strands it with only Unarchive.
      const archivedRow = within(screen.getByTestId('archived-list'));
      expect(
        archivedRow.queryByTestId(`${noun}-edit`),
        'an archived row lost Edit — it can be recovered but not changed',
      ).not.toBeNull();
      expect(
        archivedRow.queryByTestId(`${noun}-menu`),
        'an archived row lost its ⋮ — Remove is unreachable from the recovery surface',
      ).not.toBeNull();
    });
  }
});

// ===========================================================================
// The anonymous viewer
// ===========================================================================

describe('🔴 an anonymous viewer gets the sign-in panel on all three sub-items', () => {
  for (const noun of ['grid', 'matchup', 'prompt'] as const) {
    it(`${noun}: a sign-in prompt, and NO write affordance at all`, async () => {
      // 🔴 `StorageClient.set` REJECTS for an anonymous viewer and `shared.append`
      // rejects too, so any control fired here would surface as an unhandled rejection
      // out of a click handler. The guard is that this surface offers none.
      const { shared, appends } = fakeShared({ seed: MEMBERS });
      const { appStorage, setAttempts } = fakeAppStorage();
      const requestSignIn = vi.fn();
      mountApp({ shared, appStorage, requestSignIn }, null);
      await screen.findByTestId('grid-view');
      await openMyList(noun);

      expect(await screen.findByTestId(`my-signed-out-${noun}`)).toBeInTheDocument();
      expect(screen.queryByTestId('new-unpublished')).toBeNull();
      expect(screen.queryByTestId('unpublished-publish')).toBeNull();
      expect(screen.queryByTestId('archive-action')).toBeNull();
      expect(screen.queryByTestId('archived-toggle')).toBeNull();
      expect(screen.queryByTestId('grid-card')).toBeNull();

      // The one control is the host's own sign-in request.
      await userEvent.click(screen.getByTestId(`my-sign-in-${noun}`));
      expect(requestSignIn).toHaveBeenCalledTimes(1);
      expect(setAttempts, 'an anonymous viewer attempted a per-viewer write').toEqual([]);
      expect(appends).toEqual([]);
    });
  }
});

// ===========================================================================
// MyGridsView DIRECTLY — the per-viewer invariants a Harness fixture cannot drive,
// because the SDK `Harness` snapshots its `viewer` option on first render
// (`@civitai/blocks-react/dist/testing.js`) so the PROP cannot express a swap.
// Rendering the view itself makes `viewerId` an ordinary prop.
// ===========================================================================

describe('🔴 the private grid panel is PER-VIEWER', () => {
  const VIEWER_B = 55;

  const matchup = (key: string): CombinationRow => ({
    key,
    count: 5,
    authorUserId: OTHER_ID,
    name: `Matchup ${key}`,
    description: '',
    data: comboData(`${key}-cfg`),
  });
  const promptRow = (key: string): PromptRow => ({
    key,
    count: 4,
    authorUserId: OTHER_ID,
    name: `Prompt ${key}`,
    description: '',
    data: promptData,
  });
  const gridRow = (key: string, authorUserId: number): GridRow => ({
    key,
    count: 30,
    authorUserId,
    name: `Grid ${key}`,
    description: '',
    data: { v: 1, kind: 'grid', matchupKeys: ['mk-a'], promptKeys: ['qk-1'] },
  });

  const unpub = (localId: string): UnpublishedGrid => ({
    v: 1,
    localId,
    name: `Unpublished ${localId}`,
    description: '',
    matchupKeys: ['mk-a'],
    promptKeys: ['qk-1'],
    updatedAt: '2026-09-01T00:00:00.000Z',
  });

  function view(opts: {
    viewerId: number | null;
    unpublished?: UnpublishedGrid[];
    onPublishUnpublished?: (localId: string) => Promise<void> | void;
    onEditPublished?: (row: GridRow) => void;
    loading?: boolean;
    error?: string | null;
    /** Override the published set — `[]` is what a FAILED read leaves behind. */
    ownGrids?: GridRow[];
  }) {
    return (
      <MyGridsView
        ownGrids={opts.ownGrids ?? (opts.viewerId == null ? [] : [gridRow('gk-own', opts.viewerId)])}
        combinations={[matchup('mk-a')]}
        prompts={[promptRow('qk-1')]}
        /* ⚠️ NO RESULTS AND A STUB CELL — this file is about the LIST's partition and
           action set, not about the thumbnail strips. Every card therefore renders
           `grid-preview-empty` here, which is exactly what a grid with no published
           outputs looks like. The strips' read budget on this surface is measured in
           `src/myGridsPreview.test.tsx`, against the REAL `GatedCell` and a counted
           `getImages` — a stub cannot be evidence about a call count. */
        results={[]}
        GatedCell={fakeGatedCell()}
        viewerId={opts.viewerId}
        loading={opts.loading ?? false}
        error={opts.error ?? null}
        archivedKeys={new Set()}
        unpublished={opts.unpublished ?? []}
        onRequireAuth={vi.fn()}
        onWithdraw={vi.fn()}
        onArchive={vi.fn()}
        onUnarchive={vi.fn()}
        onNewUnpublished={vi.fn()}
        onEditUnpublished={vi.fn()}
        onDiscardUnpublished={vi.fn()}
        onPublishUnpublished={opts.onPublishUnpublished ?? vi.fn()}
        onEditPublished={opts.onEditPublished ?? vi.fn()}
      />
    );
  }

  it('🔴 THE LATCH IS GONE: the panel is mounted for a signed-in viewer with NO records', () => {
    // ⚠️ THIS CASE REPLACES "the latched panel does NOT survive a viewer swap", and the
    // replacement is the stronger claim. `GridsView` rendered the unpublished panel only
    // once the viewer had (or had had) a record, held by a one-way `hadUnpublishedRef`
    // latch, because the page mounted the grid, matchup and prompt panels TOGETHER and
    // an always-present empty panel added a second copy of every `unpublished-*` testid
    // to the document. My Benchmarks mounts ONE noun at a time, so that collision cannot
    // happen and the panel simply always renders.
    //
    // ⚠️ THIS PARAGRAPH USED TO END "— which cannot unmount mid-report at all, and that
    // was the latch's other job". RETRACTED. It is FALSE: an unconditional panel closes
    // the LIST-EMPTIED unmount path, but NAV is a second one — selecting Home or another
    // My noun unmounts `MyGridsView` and takes `MyList`'s local publish `error`
    // with it, and nothing brings it back. `MyGridsView`'s header, `gridsView.test.tsx`
    // and `publishPointerFailure.test.tsx` all carry the retraction; this file was the
    // FOURTH copy and the previous round's sweep missed it. It is also the surface a
    // reader arriving from the test side lands on first.
    //
    // 🔴 A RETRACTION IS A TREE-WIDE SWEEP, NOT AN EDIT AT THE SITE YOU WERE LOOKING AT.
    // Re-swept over NORMALISED comment text (markers stripped, whitespace collapsed, so
    // a claim that wraps across `//` lines is still one string) with two
    // differently-shaped patterns — `/cannot unmount mid-report/i` and
    // `/latch.s other job/i` — and a positive control that the sweep HIT the three files
    // already carrying the retraction. Four files matched the first pattern; three of
    // them are retractions; this was the one assertion.
    render(view({ viewerId: VIEWER_ID, unpublished: [] }));
    expect(screen.getByTestId('my-grids-unpublished')).toBeInTheDocument();
    // ⚠️ THE FIXTURE HAS A PUBLISHED GRID (`view`'s default `ownGrids`), so the merged
    // list is NOT empty — what "no records" means here is no DRAFT row. That is the
    // claim `my-list-empty` would NOT make, which is why it is asserted as an absence
    // of `unpublished-card` beside the list's presence.
    expect(screen.getByTestId('my-list-grid')).toBeInTheDocument();
    expect(screen.queryByTestId('unpublished-card')).toBeNull();
    // …and the create route is here with nothing in the list, which is what makes this
    // the create surface rather than one you can only reach once you already have a grid.
    expect(screen.getByTestId('new-unpublished')).toBeInTheDocument();
  });

  it('🔴 a viewer swap does not carry the PREVIOUS viewer\'s publish error', async () => {
    // The invariant the latch reset never covered, and the reason `key={viewerId}` is on
    // `MyList`: the host can swap the signed-in viewer WITHOUT remounting
    // (`src/viewer-change.test.tsx`), the panel legitimately stays mounted across the
    // swap, and `MyList` holds its publish `error` in LOCAL state cleared only
    // by the next `publish()`. Pre-fix this alert — naming A's failed publish and telling
    // the reader 'Do NOT publish it again' — was shown to B.
    const onPublishUnpublished = vi.fn(async () => {
      throw new Error('A-ONLY FAILURE');
    });
    const r = render(view({ viewerId: VIEWER_ID, unpublished: [unpub('l-a')], onPublishUnpublished }));
    await userEvent.click(screen.getByTestId('unpublished-publish'));
    const err = await screen.findByTestId('unpublished-error');
    expect(err).toHaveTextContent('A-ONLY FAILURE');

    r.rerender(view({ viewerId: VIEWER_B, unpublished: [unpub('l-b')] }));

    // The panel is still here — B has a record of their own — and the notice is NOT.
    expect(screen.getByTestId('my-grids-unpublished')).toBeInTheDocument();
    expect(screen.getByTestId('unpublished-card')).toBeInTheDocument();
    expect(screen.queryByTestId('unpublished-error')).toBeNull();
  });

  it('an ANONYMOUS viewer gets the sign-in panel and no private panel at all', () => {
    render(view({ viewerId: null, unpublished: [unpub('l-a')] }));
    // 🔴 THE RECORDS ARE PASSED IN AND STILL NOT RENDERED. A surface that trusted its
    // props here would show one viewer's private records to a signed-out one after a
    // sign-out that had not yet cleared them — and `App` clears them synchronously, so
    // the only way to see that guard fail is to hand them over on purpose.
    expect(screen.getByTestId('my-signed-out-grid')).toBeInTheDocument();
    expect(screen.queryByTestId('my-grids-unpublished')).toBeNull();
    expect(screen.queryByTestId('unpublished-card')).toBeNull();
    expect(screen.queryByTestId('new-unpublished')).toBeNull();
  });

  // 🔴 A FAILED READ MUST NOT RENDER AS A CONFIRMED ZERO. This surface had NO `error`
  // prop at all and `App` passed none, so a rejected `listAll` fell through to
  // the list's empty line — an absence the app never observed. My ▸ Matchups renders `matchups-error` on the same
  // failure, so grids was the one surface of three that answered a failure with a
  // confident zero. The App-level half is the `🔴 App SEAM` case a few below, IN THIS
  // FILE. ⚠ A draft pointed at `myCommunity.test.tsx`; that file has no error-handling
  // case at all (`grep -n error` → 0 hits over its 686 lines).
  it('🔴 surfaces a board-read FAILURE instead of "you have no published grids"', () => {
    // `ownGrids: []` is precisely the state a failed read leaves behind — that is what
    // made the empty line a lie rather than a mere gap.
    render(view({ viewerId: VIEWER_ID, error: 'Could not read the board', ownGrids: [] }));
    expect(screen.getByTestId('grids-error')).toHaveTextContent('Could not read the board');
    // POSITIVE CONTROL that this is the same surface the empty line renders on — so the
    // assertion above is about a state this component really reaches, not a fixture that
    // rendered nothing. (The empty line still renders BESIDE the alert: `MyList` is
    // told about `loading` only, and that is true of all three nouns — see the `error`
    // prop's own docblock for why suppressing it is not bundled here.)
    expect(screen.getByTestId('my-list-empty')).toBeInTheDocument();
  });

  it('🔴 says it is LOADING rather than showing an empty list while the read is in flight', () => {
    render(view({ viewerId: VIEWER_ID, loading: true }));
    expect(screen.getByTestId('grids-loading')).toBeInTheDocument();
    // …and the empty line is withheld while loading, which `MyList` already does.
    expect(screen.queryByTestId('my-list-empty')).toBeNull();
  });

  // 🔴 AND THE APP HALF, BECAUSE A PROP THAT EXISTS IS NOT A GUARD. The three cases
  // above render `MyGridsView` directly with an `error` they supply, so they would all
  // stay green with `App` hardcoding `error={null}` — which is exactly the state this
  // round found. What makes the wiring a fact is driving the FAILURE through the App and
  // asserting it on all three My surfaces at once: one `listAll` feeds every one of
  // them, so "the grid surface reports it" is only meaningful as "the same read, the
  // same failure, on each of the three".
  it('🔴 App SEAM: one failed listAll surfaces on ALL THREE My surfaces, grids included', async () => {
    const failing = {
      ...fakeShared({ seed: [] }).shared,
      async list() {
        throw new Error('board unavailable');
      },
    } as unknown as SharedStore;
    mountApp({ shared: failing, appStorage: fakeAppStorage().appStorage }, {
      id: VIEWER_ID,
      username: 'me',
    });

    const grids = await openMyList('grid');
    expect(await within(grids).findByTestId('grids-error')).toBeInTheDocument();

    // The two siblings, on the SAME failure — the asymmetry that made this a defect
    // rather than a missing feature. Asserted rather than assumed: if a future change
    // drops any one of the three, this case names which.
    const matchups = await openMyList('matchup');
    expect(await within(matchups).findByTestId('matchups-error')).toBeInTheDocument();
    const prompts = await openMyList('prompt');
    expect(await within(prompts).findByTestId('prompts-error')).toBeInTheDocument();
  });

  it('🔴 an ANONYMOUS viewer sees the failure too — sign-in is not an answer to a failed read', () => {
    // The status block is ABOVE the signed-out branch, matching `MatchupsView`. A read
    // fails for an anonymous viewer as readily as for a signed-in one, and the sign-in
    // panel would otherwise be the only thing on screen.
    render(view({ viewerId: null, error: 'Could not read the board' }));
    expect(screen.getByTestId('grids-error')).toHaveTextContent('Could not read the board');
    expect(screen.getByTestId('my-signed-out-grid')).toBeInTheDocument();
  });
});

// ===========================================================================
// THE MY-BENCHMARKS REWORK — five changes, and the coverage matrix for each.
//
// 🔴 EVERY CASE IN THIS SECTION WAS RUN AGAINST `origin/main` @ 36777e5 (the commit
// this branch is cut from), driven through the real App against the same fixtures,
// and the red-at-base symptom is recorded per case.
//
// ⚠️ 21 OF THE 23 ARE RED AT BASE. TWO ARE NOT. An earlier version of this header
// said "none is an invariant guard" while the per-case label further down said the
// opposite — and the header is where a reader looks first, so the block read as 23
// cases of regression coverage when it is 21. Measured at base: 43 tests, 31 failed /
// 12 passed; among the 12 are `change 5 … matchup:` and its `prompt:` sibling, whose
// `grid:` sibling correctly fails. Those two arms are INVARIANT GUARDS and are not
// regression coverage — before the merge the two lists were separate components, so a
// published card structurally could not carry an `unpublished-*` control. They are
// justified by mutation instead.
// ===========================================================================

const MINE_M = row('mk-mine', 5, 'My matchup', comboData('cfg-mine'), VIEWER_ID);
const MINE_P = row('qk-mine', 4, 'My prompt', promptData, VIEWER_ID);
const MINE_G = row('gk-mine', 3, 'My grid', gridData(['mk-a'], ['qk-1']), VIEWER_ID);

/** One unpublished record per noun, so the merged list always has both halves. */
const draftMatchup = {
  v: 1,
  localId: 'dm-1',
  name: 'An unpublished matchup',
  description: '',
  /**
   * 🔴 TWO CONFIGS, DELIBERATELY, AND `comboData` CANNOT SERVE HERE. It builds exactly
   * ONE config, which puts the row's structural summary on the SINGULAR branch of
   * `modelCountSummary` — and a fixture pinned to the singular cannot see a mutant that
   * drops the plural `s`, nor one that hardcodes the string, because "1 model" is what
   * both produce. Two is the smallest count that exercises the plural; the row's meta
   * is therefore "2 models", asserted as a whole literal below.
   */
  configs: [...comboData('cfg-draft-1').configs, ...comboData('cfg-draft-2').configs],
  updatedAt: '2026-09-07T00:00:00.000Z',
};
const draftPrompt = {
  v: 1,
  localId: 'dp-1',
  name: 'An unpublished prompt',
  description: '',
  default: { prompt: 'a quiet street', params: {} },
  updatedAt: '2026-09-07T00:00:00.000Z',
};
const draftGrid = {
  v: 1,
  localId: 'dg-1',
  name: 'An unpublished grid',
  description: '',
  matchupKeys: ['mk-a'],
  promptKeys: ['qk-1'],
  updatedAt: '2026-09-07T00:00:00.000Z',
};

/** The card testid each noun's PUBLISHED row renders under. */
const CARD_TESTID = { grid: 'grid-card', matchup: 'matchup-card', prompt: 'prompt-card' } as const;

/** Mount the App with one draft AND one published row for every noun. */
function mountBoth() {
  const fake = fakeShared({ seed: [...MEMBERS, MINE_M, MINE_P, MINE_G] });
  const storage = fakeAppStorage({
    [draftKey('dm-1')]: draftMatchup,
    [unpubPromptKey('dp-1')]: draftPrompt,
    [unpubGridKey('dg-1')]: draftGrid,
  });
  mountApp({ shared: fake.shared, appStorage: storage.appStorage }, {
    id: VIEWER_ID,
    username: 'me',
  });
  return fake;
}

// ---------------------------------------------------------------------------
// CHANGE 1 — the create control is a PRIMARY CTA.
// ---------------------------------------------------------------------------

describe('🔴 change 1: "New <noun>" is the primary call to action', () => {
  // RED AT BASE: the button rendered `variant="light" size="sm"`, so the pack
  // stamped `data-variant="light"` / `data-size="sm"` and both assertions failed on
  // all three nouns.
  //
  // ⚠️ WHAT THIS DOES *NOT* CLAIM. jsdom performs NO LAYOUT, and the pack's styling
  // lives in an injected sheet keyed on these very attributes, so nothing here shows
  // the control LOOKS prominent — only that it asks for the pack's primary treatment
  // rather than its tertiary one. The appearance is unverified from this repo.
  for (const noun of ['grid', 'matchup', 'prompt'] as const) {
    it(`${noun}: filled and full-size, not the tertiary "light" it shipped as`, async () => {
      mountBoth();
      await screen.findByTestId('grid-view');
      await openMyList(noun);

      const cta = await screen.findByTestId('new-unpublished');
      // Asserted as the pack's own STATE attributes rather than a class name or a
      // computed style: `Button` drives its CSS off `data-variant`/`data-size`
      // (measured in `@civitai/blocks-react/dist/ui/Button.js`), so these are the
      // structural facts the change consists of.
      expect(cta).toHaveAttribute('data-variant', 'filled');
      expect(cta).toHaveAttribute('data-size', 'md');
      // NEGATIVE CONTROL in the same frame: a row-level control on the SAME surface
      // is still subtle/sm, so "filled + md" is a distinction this surface draws
      // rather than something every button here happens to have.
      const rowButton = screen.getByTestId('unpublished-edit');
      expect(rowButton).toHaveAttribute('data-variant', 'subtle');
      expect(rowButton).toHaveAttribute('data-size', 'sm');
    });
  }
});

// ---------------------------------------------------------------------------
// CHANGE 2 — a PUBLISHED grid can be edited: name, description AND members.
// ---------------------------------------------------------------------------

describe('🔴 change 2: a published grid is editable in place', () => {
  // RED AT BASE for every case here: `grid-edit` had no renderer anywhere in the
  // tree (`App.tsx` had `updateCombination` and `updatePrompt` and NO `updateGrid`;
  // `editGridById` opened the DRAFT modal), so each failed at `grid-edit`.

  it('opens the grid form PREFILLED from the published row', async () => {
    mountBoth();
    await screen.findByTestId('grid-view');
    await openMyList('grid');

    const card = await screen.findByTestId('grid-card');
    await userEvent.click(within(card).getByTestId('grid-edit'));

    const form = await screen.findByTestId('grid-form');
    // The stored row's name, and its MEMBERS — a form that opened empty would let a
    // "save" silently replace a two-member grid with nothing.
    expect(within(form).getByTestId('grid-form-name')).toHaveValue('My grid');
    expect(within(form).getByTestId('grid-form-rows-count')).toHaveTextContent('1 selected');
    expect(within(form).getByTestId('grid-form-cols-count')).toHaveTextContent('1 selected');
    // 🔴 IT IS THE EDIT FORM, NOT THE CREATE FORM. Same component, different store:
    // "Save changes" is the published path, "Save privately" is the per-viewer one,
    // and the two were one modal kind away from being confused.
    expect(within(form).getByTestId('grid-form-submit')).toHaveTextContent('Save changes');
  });

  it('saves through shared.update on the SAME key — never a second append', async () => {
    const { updates, appends, withdraws } = mountBoth();
    await screen.findByTestId('grid-view');
    await openMyList('grid');

    await userEvent.click(within(await screen.findByTestId('grid-card')).getByTestId('grid-edit'));
    const form = await screen.findByTestId('grid-form');
    const name = within(form).getByTestId('grid-form-name');
    await userEvent.clear(name);
    await userEvent.type(name, 'My grid, renamed');
    await userEvent.click(within(form).getByTestId('grid-form-submit'));

    await waitFor(() => expect(updates).toHaveLength(1));
    expect(updates[0]!.key).toBe('gk-mine');
    expect(updates[0]!.value.title).toBe('My grid, renamed');
    // 🔴 THE MEMBERS SURVIVE AN EDIT THAT DID NOT TOUCH THEM. A form that lost its
    // prefill would store two empty axes — and `validateGrid` would then have
    // refused, so this also proves the prefill reached the PAYLOAD and not merely
    // the validator.
    expect((updates[0]!.value.data as GridData).matchupKeys).toEqual(['mk-a']);
    expect((updates[0]!.value.data as GridData).promptKeys).toEqual(['qk-1']);
    // An append would mint a SECOND public grid and reset the vote total; a withdraw
    // would delete the row the edit is about.
    expect(appends).toEqual([]);
    expect(withdraws).toEqual([]);
    // …and the viewer sees it, without a reload.
    await waitFor(() =>
      expect(
        within(screen.getByTestId('grid-card')).getByTestId('grid-card-name'),
      ).toHaveTextContent('My grid, renamed'),
    );
  });

  it('🔴 edits MEMBERS, and the missing-member count does not misreport the result', async () => {
    // 🔴 THE CASE THE OPERATOR CALLED OUT. A grid stores REFERENCES, so adding a
    // member must change what the card counts as present — and a member that was
    // never in the grid must never be counted as MISSING. `grid-card-missing` is
    // rendered from `resolveGridRows` against the live board, so an edit that got
    // this wrong would show a removal notice for a row nobody removed.
    const { updates } = mountBoth();
    await screen.findByTestId('grid-view');
    await openMyList('grid');

    const before = await screen.findByTestId('grid-card');
    expect(within(before).getByTestId('grid-card-members')).toHaveTextContent(
      '1 matchup × 1 prompt',
    );
    expect(within(before).queryByTestId('grid-card-missing')).toBeNull();

    await userEvent.click(within(before).getByTestId('grid-edit'));
    const form = await screen.findByTestId('grid-form');
    await userEvent.click(within(form).getByTestId('grid-form-pick-rows'));
    const picker = await screen.findByTestId('grid-pick-rows-list');
    const mkB = within(picker)
      .getAllByTestId('grid-pick-rows-option')
      .find((el) => el.getAttribute('data-key') === 'mk-b')!;
    await userEvent.click(mkB);
    await userEvent.click(screen.getByTestId('grid-pick-rows-confirm'));
    await userEvent.click(within(form).getByTestId('grid-form-submit'));

    await waitFor(() => expect(updates).toHaveLength(1));
    expect((updates[0]!.value.data as GridData).matchupKeys).toEqual(['mk-a', 'mk-b']);

    await waitFor(() =>
      expect(
        within(screen.getByTestId('grid-card')).getByTestId('grid-card-members'),
      ).toHaveTextContent('2 matchups × 1 prompt'),
    );
    // 🔴 THE HALF THAT WOULD MISREPORT: both members are live on the board, so there
    // is nothing missing and the notice must be ABSENT — not a "0 removed".
    expect(within(screen.getByTestId('grid-card')).queryByTestId('grid-card-missing')).toBeNull();
  });

  it('🔴 runs validateGrid on the EDIT path, exactly as on create', async () => {
    // An edit that skipped validation could store a nameless or memberless grid — a
    // shape `buildGridPayload` accepts and `parseGrid` then DROPS on read, i.e. a row
    // the author can no longer see or repair. The form is shared, so this asserts the
    // shared validator really is reached from this modal.
    const { updates } = mountBoth();
    await screen.findByTestId('grid-view');
    await openMyList('grid');

    await userEvent.click(within(await screen.findByTestId('grid-card')).getByTestId('grid-edit'));
    const form = await screen.findByTestId('grid-form');
    await userEvent.clear(within(form).getByTestId('grid-form-name'));
    await userEvent.click(within(form).getByTestId('grid-form-submit'));

    expect(await within(form).findByTestId('grid-form-errors')).toHaveTextContent(
      'Give the grid a name.',
    );
    // The refusal is the point: nothing reached the shared board, and the form stayed
    // open on the viewer's work.
    expect(updates).toEqual([]);
    expect(screen.getByTestId('grid-form')).toBeInTheDocument();
  });

  it("🔴 is AUTHOR-SCOPED: no edit control on the community board or on someone else's grid", async () => {
    // The app-side half of author scope. `shared.update` is author-scoped by the HOST
    // for every row kind alike, but a control offered to a non-author is a dead
    // affordance the host will refuse — so the callback is wired ONLY on the My
    // surface, which is handed `isOwnRow`-narrowed rows.
    const THEIRS = row('gk-theirs', 11, 'Their grid', gridData(['mk-b'], ['qk-2']), OTHER_ID);
    const { shared } = fakeShared({ seed: [...MEMBERS, MINE_G, THEIRS] });
    mountApp({ shared, appStorage: fakeAppStorage().appStorage }, { id: VIEWER_ID, username: 'me' });
    await screen.findByTestId('grid-view');

    // COMMUNITY board: both grids are listed, and NEITHER offers an edit control.
    await waitFor(() => expect(keysOf('grid-card').sort()).toEqual(['gk-mine', 'gk-theirs']));
    expect(screen.queryAllByTestId('grid-edit')).toEqual([]);

    // MY surface: only the viewer's own row is here, and it is the one with Edit.
    await openMyList('grid');
    await waitFor(() => expect(keysOf('grid-card')).toEqual(['gk-mine']));
    expect(screen.getAllByTestId('grid-edit')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// CHANGE 3 — Remove and Archive behind the ⋮; Edit on the row.
// ---------------------------------------------------------------------------

describe('🔴 change 3: the row shows Edit; Remove and Archive are overflow', () => {
  for (const noun of ['grid', 'matchup', 'prompt'] as const) {
    it(`${noun}: Edit is on the row and the destructive pair is behind the ⋮`, async () => {
      // RED AT BASE, per noun and for DIFFERENT reasons — recorded because one
      // sentence would hide that this case covers two distinct pre-change shapes:
      //   grid            — no ⋮ at all (Remove and Archive were inline buttons) and
      //                     no `grid-edit` anywhere;
      //   matchup, prompt — `<noun>-edit` was INSIDE the ⋮ (so absent before the menu
      //                     opens) while `archive-action` was inline beside it.
      mountBoth();
      await screen.findByTestId('grid-view');
      await openMyList(noun);

      const card = await screen.findByTestId(CARD_TESTID[noun]);

      // Closed: Edit is the only action offered, and neither destructive control is
      // in the document. Asserted as ABSENCE, not as hidden — `display: none` would
      // still resolve.
      expect(within(card).getByTestId(`${noun}-edit`)).toBeInTheDocument();
      expect(within(card).queryByTestId('archive-action')).toBeNull();
      expect(within(card).queryByTestId(`${noun}-withdraw`)).toBeNull();

      // Open: both are there, in ONE menu.
      const menu = await openRowMenu(noun, card);
      expect(within(menu).getByTestId('archive-action')).toBeInTheDocument();
      expect(within(menu).getByTestId(`${noun}-withdraw`)).toBeInTheDocument();
      // 🔴 ONE MENU PER ROW. The card bodies build their own ⋮ on the COMMUNITY
      // board; on this surface the callers omit `onEdit`/`onWithdraw` so they build
      // none, and the whole group comes from `MyList`. Two triggers on one row would
      // split the actions across two panels.
      expect(within(card).getAllByTestId(`${noun}-menu`)).toHaveLength(1);

      // 🔴 THE ROLES, AND `Menu.tsx`'s RULE ABOUT THEM. Archive is a single press, so
      // it is a real `role="menuitem"`. Remove is a two-step CONFIRM control and
      // CANNOT be one — it is hosted as itself inside a `role="none"` wrapper, which
      // is why `MENU_FOCUSABLE_SELECTOR` has to cover both shapes.
      expect(within(menu).getByTestId('archive-action')).toHaveAttribute('role', 'menuitem');
      expect(within(menu).getByTestId(`${noun}-withdraw`)).not.toHaveAttribute('role', 'menuitem');
      expect(
        within(menu).getByTestId(`${noun}-withdraw`).closest('[data-mb-menu-control]'),
      ).not.toBeNull();
    });
  }

  it('Edit on a MATCHUP row still reaches the edit form from its new position', async () => {
    // A control that renders and does nothing is the failure mode a structural
    // assertion cannot see, so the route is walked once end to end.
    mountBoth();
    await screen.findByTestId('grid-view');
    await openMyList('matchup');

    const card = await screen.findByTestId('matchup-card');
    await userEvent.click(within(card).getByTestId('matchup-edit'));
    const form = await screen.findByTestId('matchup-form');
    expect(within(form).getByTestId('matchup-name')).toHaveValue('My matchup');
  });
});

// ---------------------------------------------------------------------------
// CHANGE 5 — ONE list, and the INERT-CONTROL case a merged list gets wrong.
// ---------------------------------------------------------------------------

describe('🔴 change 5: one list per noun, with the state on the row', () => {
  for (const noun of ['grid', 'matchup', 'prompt'] as const) {
    it(`${noun}: the draft and the published row are in the SAME list, drafts first`, async () => {
      // RED AT BASE: there were two lists — `unpublished-panel`'s `unpublished-list`
      // and `my-published-<noun>` — so no single container held both, and
      // `my-list-<noun>` did not exist at all.
      mountBoth();
      await screen.findByTestId('grid-view');
      await openMyList(noun);

      const list = await screen.findByTestId(`my-list-${noun}`);
      const draft = within(list).getByTestId('unpublished-card');
      const published = await within(list).findByTestId(CARD_TESTID[noun]);
      // 🔴 ORDER IS PART OF THE DECISION: drafts first, because they are the rows
      // with an outstanding action. Read off the DOM rather than asserted as two
      // memberships, which would pass in either order.
      //
      // ⚠️ IT IS DOM ORDER, NOT VISUAL ORDER, AND THE GAP IS MEASURED. Swapping the
      // two `.map` blocks in `MyList` turns this red; adding
      // `flexDirection: 'column-reverse'` to the same `<Stack>` — which reverses
      // what a viewer SEES and nothing else — leaves the whole file GREEN, because
      // jsdom performs no layout. Named rather than left implied: a visual reversal
      // is invisible to this repo's whole suite, not just to this case.
      expect(
        draft.compareDocumentPosition(published) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it(`${noun}: a PRIVATE row is badged "Private", can be published, and is never offered Archive`, async () => {
      // 🔴 THE INERT-CONTROL CASE, half one. Archive hides a SHARED row from the
      // viewer's own list; a private record has no shared row, so an Archive here would
      // write a per-viewer key naming nothing and do nothing at all.
      mountBoth();
      await screen.findByTestId('grid-view');
      await openMyList(noun);

      const draft = within(await screen.findByTestId(`my-list-${noun}`)).getByTestId(
        'unpublished-card',
      );
      // 🔴 THE WHOLE STRING, with `toBe` on `textContent` rather than
      // `toHaveTextContent` — which is a SUBSTRING match and would stay green on
      // "Private draft", i.e. on exactly the half-done rename this pins.
      //
      // ⚠️ IT READ 'Draft' UNTIL THE RENAME. The testid keeps the old word on purpose
      // (it is a selector, not copy); the rendered word is "Private", because what the
      // state actually means is "no other viewer can see this", not "unfinished".
      // RED AT `7c20155` for all three nouns.
      expect(within(draft).getByTestId('draft-badge').textContent).toBe('Private');
      expect(within(draft).getByTestId('unpublished-publish')).toBeInTheDocument();
      expect(within(draft).getByTestId('unpublished-edit')).toBeInTheDocument();

      // 🔴 DISCARD IS BEHIND THE ROW'S OWN `⋮` — ABSENT until it opens, then present
      // INSIDE the panel. Both halves, in this order, because either alone is empty:
      // the absence alone is satisfied by a Discard that was simply deleted, and the
      // presence alone is satisfied by a Discard still sitting on the row.
      // RED AT `7c20155`, where the control is on the row and there is no menu to open.
      expect(
        within(draft).queryByTestId('unpublished-discard'),
        'Discard is still on the row — it belongs in the ⋮',
      ).toBeNull();
      const privateMenu = await openRowMenu('unpublished', draft);
      expect(within(privateMenu).getByTestId('unpublished-discard')).toBeInTheDocument();

      // NO archive, and no PUBLISHED-row ⋮ for one to hide in — the stronger claim,
      // because an absent testid alone would also hold for a control sitting in a
      // closed menu one press away. Asserted over the whole card AND over the private
      // menu that now exists on it, so the new panel cannot become the hiding place.
      expect(within(draft).queryByTestId('archive-action')).toBeNull();
      expect(within(privateMenu).queryByTestId('archive-action')).toBeNull();
      expect(within(draft).queryByTestId(`${noun}-menu`)).toBeNull();
      expect(within(draft).queryByTestId(`${noun}-withdraw`)).toBeNull();
      expect(within(privateMenu).queryByTestId(`${noun}-withdraw`)).toBeNull();
    });

    it(`${noun}: a PUBLISHED row is never badged and is never offered Publish`, async () => {
      // 🔴 THE INERT-CONTROL CASE, half two — and this one is not inert but HARMFUL:
      // `append` has no idempotency key, so a Publish on an already-published row
      // would mint a SECOND permanent unmergeable public row.
      //
      // ⚠️ COVERAGE LABEL, AND IT DIFFERS BY NOUN — measured, not assumed:
      //   grid            — RED at `origin/main` (the row had no ⋮, so `openRowMenu`
      //                     found no `grid-menu`). Regression coverage.
      //   matchup, prompt — GREEN at `origin/main`. These are INVARIANT GUARDS on
      //                     those two arms and must not be counted as regression
      //                     coverage: before the merge the two lists were separate
      //                     components, so a published card structurally COULD NOT
      //                     contain an `unpublished-*` control and the assertions
      //                     held vacuously. They are here because the merge is
      //                     exactly what makes them non-vacuous — one component now
      //                     renders both row shapes and could leak one into the
      //                     other. Validated by mutation instead (adding a Publish
      //                     button to `publishedActions` turns all three red).
      mountBoth();
      await screen.findByTestId('grid-view');
      await openMyList(noun);

      const card = await screen.findByTestId(CARD_TESTID[noun]);
      expect(within(card).queryByTestId('draft-badge')).toBeNull();
      expect(within(card).queryByTestId('unpublished-publish')).toBeNull();
      expect(within(card).queryByTestId('unpublished-discard')).toBeNull();
      // …and not inside its ⋮ either.
      const menu = await openRowMenu(noun, card);
      expect(within(menu).queryByTestId('unpublished-publish')).toBeNull();
      expect(within(menu).queryByTestId('unpublished-discard')).toBeNull();
    });
  }

  // -------------------------------------------------------------------------
  // 🔴 THE STRUCTURAL SUMMARY SAYS "models", NOT "configs".
  //
  // "config" is this repo's INTERNAL noun (`ModelConfig`, `data.configs`,
  // `MAX_CONFIGS`, `ResultData.configId`) and none of it is viewer copy. The row
  // summary leaked it: a matchup with two model setups read "2 configs". The operator
  // asked for "models"; `lib/benchmark.ts`'s `modelCountSummary` owns the string for
  // both of its call sites, and `lib/benchmark.test.ts` pins the function's output as
  // literals. This case is the RENDERED half — a unit test alone cannot tell "the
  // helper is right" from "the call site still open-codes the old string".
  // -------------------------------------------------------------------------
  it('🔴 a private MATCHUP row summarises its models as "N models", never "N configs"', async () => {
    // RED AT `7c20155`: the row read "2 configs".
    mountBoth();
    await screen.findByTestId('grid-view');
    await openMyList('matchup');

    const draft = within(await screen.findByTestId('my-list-matchup')).getByTestId(
      'unpublished-card',
    );
    const meta = within(draft).getByTestId('unpublished-meta');
    // 🔴 THE WHOLE STRING, as a LITERAL typed out here — not `modelCountSummary(2)`.
    // An expectation read out of the implementation passes whatever the
    // implementation says, which is the one thing a copy guard must not do.
    // `draftMatchup` carries TWO configs on purpose (see its fixture): the plural is
    // the branch a dropped `s` and a hardcoded literal both fail on.
    expect(meta.textContent).toBe('2 models');
    // …and the internal word is not merely outnumbered, it is ABSENT from the row.
    expect(draft.textContent ?? '', 'the internal noun "config" reached a viewer').not.toMatch(
      /config/i,
    );
  });
});

// ---------------------------------------------------------------------------
// CHANGE 4 — the retired copy, pinned as an ABSENCE.
// ---------------------------------------------------------------------------

describe('🔴 change 4: the explanatory paragraphs these surfaces carried are gone', () => {
  // ⚠️ WHAT THIS IS AND IS NOT. It is a RETIREMENT guard over four sentences that
  // were measured rendering before this change and must not come back — the same
  // shape as `capture-landmarks.test.tsx`'s retired-testid lists. It is NOT a claim
  // that the surviving copy is "minimal"; nothing mechanical can check that, and a
  // description that over-reached would read as coverage while providing none.
  //
  // Each is pinned as a WHOLE STRING rather than a keyword, because the thing being
  // retired is the SENTENCE.
  //
  // RED AT BASE: all four rendered on `origin/main` — the first two on every My
  // surface, the third on the signed-out panel, the fourth in the grid form.
  const RETIRED_COPY = [
    'Saved to your own storage and invisible to everyone else until you publish.',
    'Publishing is a separate step; a published grid can be edited or removed, but not made private again.',
    'The community boards are readable either way.',
    'A grid points at rows other people own.',
  ] as const;

  const pageText = () => (document.body.textContent ?? '').replace(/\s+/g, ' ');

  it('renders none of them on any of the three My surfaces, nor in the grid form', async () => {
    mountBoth();
    await screen.findByTestId('grid-view');

    for (const noun of ['grid', 'matchup', 'prompt'] as const) {
      await openMyList(noun);
      await screen.findByTestId(`my-list-${noun}`);
      // POSITIVE CONTROL: the scan really is reading this surface. Without it an
      // unmounted view would satisfy every assertion below.
      expect(pageText()).toContain(`Your ${noun}s`);
      for (const sentence of RETIRED_COPY) {
        expect(pageText(), `retired copy is back on My ▸ ${noun}`).not.toContain(sentence);
      }
    }

    // The grid FORM, which carried the fourth sentence.
    await openMyList('grid');
    await userEvent.click(screen.getByTestId('new-unpublished'));
    await screen.findByTestId('grid-form');
    expect(pageText(), 'the grid form still names the other-owner paragraph').not.toContain(
      RETIRED_COPY[3],
    );
    // POSITIVE CONTROL for the form scan: the claim that SURVIVED the trim is here,
    // so "not found" above is not simply a form that failed to open.
    expect(pageText()).toContain('renders what is left and says how much is gone');
  });

  it('the signed-out panel drops its second sentence and keeps its first', async () => {
    const { shared } = fakeShared({ seed: MEMBERS });
    mountApp({ shared, appStorage: fakeAppStorage().appStorage }, null);
    await screen.findByTestId('grid-view');
    await openMyList('matchup');

    await screen.findByTestId('my-signed-out-matchup');
    expect(pageText()).toContain('stored against your account');
    expect(pageText()).not.toContain(RETIRED_COPY[2]);
  });
});
