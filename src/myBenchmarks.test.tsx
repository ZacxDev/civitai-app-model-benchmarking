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
import { ARCHIVE_KEY } from './lib/archive.js';
import { fakeAppStorage, fakeShared, immediateSleep, openMyList } from './test-helpers.js';
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

    await userEvent.click(screen.getByTestId('archive-action'));

    // 🔴 HALF ONE — gone from MY.
    await waitFor(() => expect(keysOf('grid-card')).toEqual([]));
    expect(screen.getByTestId('my-published-empty')).toBeInTheDocument();
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

    // …and it sits with the control it describes, not on some other screen.
    expect(screen.getByTestId('archive-action')).toBeInTheDocument();
    // The true delete is still offered, and still separate (§11.3).
    expect(screen.getByTestId('grid-withdraw')).toBeInTheDocument();
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

    await userEvent.click(await screen.findByTestId('archive-action'));
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
    // The ownership half read through its edge: `MyPublished` is handed the viewer's own
    // rows only, so a row it cannot archive is not on this surface at all — which is a
    // stronger statement than "the button is hidden".
    const { shared } = fakeShared({ seed: [...MEMBERS, MINE, THEIRS] });
    mountApp({ shared, appStorage: fakeAppStorage().appStorage }, { id: VIEWER_ID, username: 'me' });
    await screen.findByTestId('grid-view');
    await openMyList('grid');

    await waitFor(() => expect(keysOf('grid-card')).toEqual(['gk-mine']));
    expect(screen.queryAllByTestId('archive-action')).toHaveLength(1);
  });
});

// ===========================================================================
// The matchup and prompt arms reach the SAME implementation
// ===========================================================================

describe('🔴 all three nouns share ONE archive implementation', () => {
  // 🔴 THE POINT OF THIS BLOCK IS THE SEAM, not a third copy of criterion 12.
  // `MyPublished` is one component used by three surfaces; before it, the matchup and
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
      expect(await screen.findByTestId(`my-published-${noun}`)).toBeInTheDocument();
      await userEvent.click(screen.getByTestId('archive-action'));

      // One key written, and it is this noun's row — so the three surfaces are not
      // sharing a single hardcoded key.
      const expectedKey = { grid: 'gk-mine', matchup: 'mk-mine', prompt: 'qk-mine' }[noun];
      await waitFor(() => expect(store.get(ARCHIVE_KEY)).toEqual([expectedKey]));
      expect(await screen.findByTestId('archived-toggle')).toBeInTheDocument();
      await userEvent.click(screen.getByTestId('archived-toggle'));
      expect(await screen.findByTestId('archived-list')).toBeInTheDocument();
      expect(screen.getByTestId('unarchive-action')).toBeInTheDocument();
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
    // happen and the panel simply always renders — which cannot unmount mid-report at
    // all, and that was the latch's other job.
    render(view({ viewerId: VIEWER_ID, unpublished: [] }));
    expect(screen.getByTestId('my-grids-unpublished')).toBeInTheDocument();
    expect(screen.getByTestId('unpublished-empty')).toBeInTheDocument();
    // …and the create route is here with nothing in the list, which is what makes this
    // the create surface rather than one you can only reach once you already have a grid.
    expect(screen.getByTestId('new-unpublished')).toBeInTheDocument();
  });

  it('🔴 a viewer swap does not carry the PREVIOUS viewer\'s publish error', async () => {
    // The invariant the latch reset never covered, and the reason `key={viewerId}` is on
    // `UnpublishedList`: the host can swap the signed-in viewer WITHOUT remounting
    // (`src/viewer-change.test.tsx`), the panel legitimately stays mounted across the
    // swap, and `UnpublishedList` holds its publish `error` in LOCAL state cleared only
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
  // `my-published-empty` — "You have no published grids on the board right now" — an
  // absence the app never observed. My ▸ Matchups renders `matchups-error` on the same
  // failure, so grids was the one surface of three that answered a failure with a
  // confident zero. The App-level half of this is in `myCommunity.test.tsx`.
  it('🔴 surfaces a board-read FAILURE instead of "you have no published grids"', () => {
    // `ownGrids: []` is precisely the state a failed read leaves behind — that is what
    // made the empty line a lie rather than a mere gap.
    render(view({ viewerId: VIEWER_ID, error: 'Could not read the board', ownGrids: [] }));
    expect(screen.getByTestId('grids-error')).toHaveTextContent('Could not read the board');
    // POSITIVE CONTROL that this is the same surface the empty line renders on — so the
    // assertion above is about a state this component really reaches, not a fixture that
    // rendered nothing. (The empty line still renders BESIDE the alert: `MyPublished` is
    // told about `loading` only, and that is true of all three nouns — see the `error`
    // prop's own docblock for why suppressing it is not bundled here.)
    expect(screen.getByTestId('my-published-empty')).toBeInTheDocument();
  });

  it('🔴 says it is LOADING rather than showing an empty list while the read is in flight', () => {
    render(view({ viewerId: VIEWER_ID, loading: true }));
    expect(screen.getByTestId('grids-loading')).toBeInTheDocument();
    // …and the empty line is withheld while loading, which `MyPublished` already does.
    expect(screen.queryByTestId('my-published-empty')).toBeNull();
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
