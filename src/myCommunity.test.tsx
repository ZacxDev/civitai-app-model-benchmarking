// 527 Phase 1 — the My / Community partition, the prompt half of the publish
// boundary, and Archive. Driven through the REAL App against the SDK mock host.
//
// Acceptance criteria pinned here:
//   5  — a row the viewer authored appears under MY *and* in COMMUNITY
//   6  — an unpublished item of each kind is absent from the shared list until
//        Publish, and readable by a SECOND viewer afterwards
//   12 — Archive removes the row from MY, the shared row is demonstrably still on
//        the board (with its votes), and the honest wording is RENDERED
//   plus: an anonymous viewer gets a read-only Community and a sign-in prompt,
//        and no affordance that could produce an unhandled host rejection.
//
// 🔴 EVERY PARTITION CASE USES TWO DISTINCT `authorUserId`s. With one author the
// partition passes by accident — "everything" and "mine" are the same set, and a
// `isOwnRow` that always returned true would be green.

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Harness } from '@civitai/blocks-react/testing';
import type { SharedListItem } from '@civitai/blocks-react';

import { App, type AppDeps } from './App.js';
import { fakeAppStorage, fakeShared, immediateSleep, openView } from './test-helpers.js';
import { ARCHIVE_KEY } from './lib/archive.js';
import { draftKey } from './lib/drafts.js';
import { UNPUB_PROMPT_PREFIX, unpubPromptKey } from './lib/unpubPrompts.js';
import type { CombinationData, PromptData } from './types.js';

const VIEWER_ID = 99;
const OTHER_ID = 7; // 🔴 distinct from VIEWER_ID — see the header note

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

const promptData: PromptData = {
  v: 3,
  kind: 'prompt',
  default: { prompt: 'cyberpunk portrait', params: { cfgScale: 5, steps: 30 } },
};

function row(
  key: string,
  title: string,
  authorUserId: number,
  data: CombinationData | PromptData,
  count = 1,
): SharedListItem {
  return {
    key,
    authorUserId,
    count,
    viewerVoted: false,
    value: { title, body: '', data },
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

function mountApp(deps: Partial<AppDeps>, viewer: { id: number; username: string } | null) {
  return render(
    <Harness
      // 🔴 `null` is passed THROUGH, never coerced to `undefined`: the mock host
      // documents `viewer` as defaulting to a `dev-viewer`, so `undefined` gives
      // a SIGNED-IN viewer and the anon case silently stops being the anon case.
      viewer={viewer}
      theme="dark"
      consentGranted
      buzzBudget={1000}
      buzz={{ balance: 5000 }}
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

/**
 * Mount the app and OPEN THE MATCHUPS VIEW.
 *
 * 🔴 The extra step exists because 527 made GRIDS the default view (spec §11.5,
 * acceptance criterion 9). Every case below is about the matchup or prompt
 * surfaces, so each has to navigate there now; doing it here rather than at each
 * call site keeps the default's name at ONE site — it has moved once already.
 */
async function renderApp(...args: Parameters<typeof mountApp>) {
  const r = mountApp(...args);
  await openView('Matchups');
  return r;
}

const signedIn = { id: VIEWER_ID, username: 'me' };

const openPromptsView = () => userEvent.click(screen.getByRole('tab', { name: /Prompts/ }));
const openMy = async () => {
  await userEvent.click(await screen.findByTestId('subtab-my'));
  return screen.findByTestId('subtabs');
};
const openCommunity = async () => userEvent.click(await screen.findByTestId('subtab-community'));

/** The `data-key`s of every rendered card of the given testid, in DOM order. */
const keysOf = (testid: string): string[] =>
  screen.queryAllByTestId(testid).map((el) => el.getAttribute('data-key') ?? '');

// ---------------------------------------------------------------------------
// Criterion 5 — the partition. MY is a subset; COMMUNITY is everything.
// ---------------------------------------------------------------------------

describe('🔴 criterion 5: an authored row appears under My AND in Community', () => {
  it('partitions MATCHUPS by author, and Community keeps the viewer’s own row', async () => {
    const { shared } = fakeShared({
      seed: [
        row('mine', 'My matchup', VIEWER_ID, comboData),
        row('theirs', 'Their matchup', OTHER_ID, comboData),
      ],
    });
    await renderApp({ shared, appStorage: fakeAppStorage().appStorage }, signedIn);

    // COMMUNITY (the default sub-tab) = every published row, both authors.
    await screen.findByTestId('matchups-view');
    await waitFor(() => expect(keysOf('matchup-card')).toHaveLength(2));
    expect(keysOf('matchup-card').sort()).toEqual(['mine', 'theirs']);

    // MY = only the viewer's own. Two authors is what makes this a real claim.
    await openMy();
    await waitFor(() => expect(keysOf('matchup-card')).toEqual(['mine']));
    expect(screen.queryByText('Their matchup')).toBeNull();

    // …and back in Community the viewer's own row is STILL there (§11.1: an
    // author sees their row ranked the way everyone else sees it).
    await openCommunity();
    await waitFor(() => expect(keysOf('matchup-card').sort()).toEqual(['mine', 'theirs']));
    expect(screen.getByText('My matchup')).toBeInTheDocument();
  });

  it('partitions PROMPTS by author, and Community keeps the viewer’s own row', async () => {
    const { shared } = fakeShared({
      seed: [
        row('p-mine', 'My prompt', VIEWER_ID, promptData),
        row('p-theirs', 'Their prompt', OTHER_ID, promptData),
      ],
    });
    await renderApp({ shared, appStorage: fakeAppStorage().appStorage }, signedIn);

    await screen.findByTestId('matchups-view');
    await openPromptsView();
    await waitFor(() => expect(keysOf('prompt-card')).toHaveLength(2));

    await openMy();
    await waitFor(() => expect(keysOf('prompt-card')).toEqual(['p-mine']));
    expect(screen.queryByText('Their prompt')).toBeNull();

    await openCommunity();
    await waitFor(() => expect(keysOf('prompt-card').sort()).toEqual(['p-mine', 'p-theirs']));
  });

  it('counts the two sub-tabs from the same partition', async () => {
    // The labels are the only thing a viewer sees before clicking, so a count
    // that disagrees with the list is its own defect. Literal numbers: 1 own row
    // of 2 published.
    const { shared } = fakeShared({
      seed: [
        row('mine', 'My matchup', VIEWER_ID, comboData),
        row('theirs', 'Their matchup', OTHER_ID, comboData),
      ],
    });
    await renderApp({ shared, appStorage: fakeAppStorage().appStorage }, signedIn);

    await waitFor(() => expect(screen.getByTestId('subtab-my')).toHaveTextContent('My (1)'));
    expect(screen.getByTestId('subtab-community')).toHaveTextContent('Community (2)');
  });
});

// ---------------------------------------------------------------------------
// Criterion 6 — the prompt half of the publish boundary (the matchup half lives
// in drafts.test.tsx, which drives the same boundary through the same App).
// ---------------------------------------------------------------------------

/** Fill and save the PRIVATE prompt form opened from the My tab. */
async function fillAndSavePromptPrivately(name: string, text: string) {
  await userEvent.click(await screen.findByTestId('new-unpublished'));
  const form = await screen.findByTestId('prompt-form');
  fireEvent.change(within(form).getByTestId('prompt-name'), { target: { value: name } });
  fireEvent.change(within(form).getByTestId('prompt-default-text'), { target: { value: text } });
  await userEvent.click(within(form).getByTestId('prompt-submit'));
  await waitFor(() => expect(screen.queryByTestId('prompt-form')).toBeNull());
}

describe('🔴 criterion 6: an unpublished PROMPT reaches the board only on Publish', () => {
  it('stays out of shared storage until Publish, then a SECOND viewer reads it', async () => {
    const board = fakeShared();
    const authorStore = fakeAppStorage();
    const otherStore = fakeAppStorage();

    const authorView = await renderApp(
      { shared: board.shared, appStorage: authorStore.appStorage },
      signedIn,
    );
    await screen.findByTestId('matchups-view');
    await openPromptsView();
    await openMy();
    await fillAndSavePromptPrivately('Private prompt', 'a quiet street at dawn');

    // 🔴 IT IS IN THE PER-VIEWER STORE AND NOWHERE ELSE. Asserted BEFORE the card
    // is looked up, on purpose: a save wired to the public path publishes and then
    // renders no unpublished card at all, so a card lookup first would kill this
    // case on a missing element rather than on the boundary claim it is about.
    expect(board.appends, 'saving privately reached the public board').toEqual([]);
    await screen.findByTestId('unpublished-card');
    expect(
      [...authorStore.store.keys()].filter((k) => k.startsWith(UNPUB_PROMPT_PREFIX)),
      'the private prompt was not written under its own prefix',
    ).toHaveLength(1);
    authorView.unmount();

    // A SECOND viewer, same board, their own store: nothing on either sub-tab.
    const otherView = await renderApp(
      { shared: board.shared, appStorage: otherStore.appStorage },
      { id: OTHER_ID, username: 'them' },
    );
    await screen.findByTestId('matchups-view');
    await openPromptsView();
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId('prompt-card')).toBeNull();
    await openMy();
    expect(screen.queryByTestId('unpublished-card')).toBeNull();
    expect(screen.queryByText('Private prompt')).toBeNull();
    otherView.unmount();

    // PUBLISH — the one action that crosses the boundary.
    const authorAgain = await renderApp(
      { shared: board.shared, appStorage: authorStore.appStorage },
      signedIn,
    );
    await screen.findByTestId('matchups-view');
    await openPromptsView();
    await openMy();
    await userEvent.click(await screen.findByTestId('unpublished-publish'));
    await waitFor(() => expect(board.appends).toHaveLength(1));
    expect(board.appends[0].title).toBe('Private prompt');
    // 🔴 The wire discriminant the board's other rows already carry.
    expect((board.appends[0].data as PromptData).kind).toBe('prompt');
    expect((board.appends[0].data as PromptData).default.prompt).toBe('a quiet street at dawn');

    // 🔴 THE PRIVATE RECORD BECAME A POINTER, not a second editable copy. This
    // was found by a SURVIVING mutant: deleting the pointer write left the whole
    // suite green while the record kept its body — so the row stayed in "Not
    // published yet" and a second Publish would mint a DUPLICATE shared row that
    // nobody can merge (`append` has no idempotency key). Both halves are pinned:
    // the stored shape, and the card being gone from the screen.
    await waitFor(() => expect(screen.queryByTestId('unpublished-card')).toBeNull());
    const storedPrivate = [...authorStore.store.entries()].filter(([k]) =>
      k.startsWith(UNPUB_PROMPT_PREFIX),
    );
    expect(storedPrivate).toHaveLength(1);
    expect(storedPrivate[0][1]).toMatchObject({ v: 1, sharedKey: 'fk_1' });
    expect(storedPrivate[0][1], 'the editable body survived publish').not.toHaveProperty('default');
    authorAgain.unmount();

    // POSITIVE CONTROL: the SAME second-viewer render now surfaces it.
    await renderApp(
      { shared: board.shared, appStorage: otherStore.appStorage },
      { id: OTHER_ID, username: 'them' },
    );
    await screen.findByTestId('matchups-view');
    await openPromptsView();
    const card = await screen.findByTestId('prompt-card');
    expect(card).toHaveTextContent('Private prompt');
  });
});

// ---------------------------------------------------------------------------
// Criterion 12 — Archive is an author-side HIDE, and the UI says so.
// ---------------------------------------------------------------------------

describe('🔴 criterion 12: Archive hides from My only, and says so in words', () => {
  it('drops the row from My while it stays on the board, in Community, with its votes', async () => {
    const VOTES = 7; // distinct from 0 and 1, so a reset would show
    const { shared, withdraws, updates, appends } = fakeShared({
      seed: [
        row('mine', 'My matchup', VIEWER_ID, comboData, VOTES),
        row('theirs', 'Their matchup', OTHER_ID, comboData, 3),
      ],
    });
    const { appStorage, store } = fakeAppStorage();
    await renderApp({ shared, appStorage }, signedIn);

    await openMy();
    await waitFor(() => expect(keysOf('matchup-card')).toEqual(['mine']));

    await userEvent.click(screen.getByTestId('archive-action'));

    // 🔴 HALF ONE — gone from MY.
    await waitFor(() => expect(keysOf('matchup-card')).toEqual([]));
    expect(screen.getByTestId('my-published-empty')).toBeInTheDocument();
    // …recorded in the ONE per-viewer key §11.3 specifies, and nowhere else.
    await waitFor(() => expect(store.get(ARCHIVE_KEY)).toEqual(['mine']));

    // 🔴 HALF TWO — THE ROW IS STILL ON THE SHARED BOARD. Three independent
    // readings, because "still there" is exactly the claim an archive-as-delete
    // implementation would fail quietly:
    //   (a) the app told the shared store NOTHING,
    const listed = await shared.list({});
    expect(withdraws, 'Archive withdrew the row — that is a delete, not a hide').toEqual([]);
    expect(updates, 'Archive rewrote the shared row').toEqual([]);
    expect(appends).toEqual([]);
    //   (b) the row is still what `list()` returns, with its vote total intact,
    expect(listed.items.map((i) => i.key).sort()).toEqual(['mine', 'theirs']);
    expect(listed.items.find((i) => i.key === 'mine')!.count).toBe(VOTES);
    //   (c) and the archiver still sees it in Community, votes and all.
    await openCommunity();
    await waitFor(() => expect(keysOf('matchup-card').sort()).toEqual(['mine', 'theirs']));
    const stillThere = screen.queryAllByTestId('matchup-card').find(
      (el) => el.getAttribute('data-key') === 'mine',
    )!;
    expect(within(stillThere).getByTestId('vote-count')).toHaveTextContent(String(VOTES));
  });

  it('renders the honest wording next to the control, as the whole sentence', async () => {
    // 🔴 PINNED AS THE WHOLE NORMALISED STRING, typed out here rather than
    // imported from `lib/archive.ts`: an expectation read out of the
    // implementation passes whatever the implementation says, which is precisely
    // the failure mode for a copy guarantee. A reword must come here too.
    const { shared } = fakeShared({ seed: [row('mine', 'My matchup', VIEWER_ID, comboData)] });
    await renderApp({ shared, appStorage: fakeAppStorage().appStorage }, signedIn);

    await openMy();
    const note = await screen.findByTestId('archive-note');
    expect((note.textContent ?? '').replace(/\s+/g, ' ').trim()).toBe(
      'Archiving only hides a row from your My list. It stays on the shared board, ' +
        'stays in Community for everyone including you, and keeps its votes. ' +
        'Remove is the only action that takes it off the board for everyone.',
    );

    // …and it sits with the control it describes, not on some other screen.
    expect(screen.getByTestId('archive-action')).toBeInTheDocument();
    // The true delete is still offered, and still separate (§11.3).
    expect(screen.getByTestId('matchup-withdraw')).toBeInTheDocument();
  });

  it('🔴 SURVIVES A RELOAD: a stored archive is read back on mount', async () => {
    // Without this the feature works only for the session that performed it —
    // the write lands, nothing reads it, and the row silently returns to My on
    // the next load. `archive:v1` is seeded here rather than clicked, so the read
    // path is what is under test and the write path cannot cover for it.
    const { shared } = fakeShared({
      seed: [
        row('mine', 'My matchup', VIEWER_ID, comboData),
        row('theirs', 'Their matchup', OTHER_ID, comboData),
      ],
    });
    const { appStorage } = fakeAppStorage({ [ARCHIVE_KEY]: ['mine'] });
    await renderApp({ shared, appStorage }, signedIn);

    await openMy();
    // The archived row is out of My…
    await waitFor(() => expect(screen.getByTestId('archived-toggle')).toBeInTheDocument());
    expect(keysOf('matchup-card')).toEqual([]);
    // …and still in Community, for the archiver too.
    await openCommunity();
    await waitFor(() => expect(keysOf('matchup-card').sort()).toEqual(['mine', 'theirs']));
  });

  it('is reversible: an archived row can be brought back to My', async () => {
    const { shared } = fakeShared({
      seed: [
        row('mine', 'My matchup', VIEWER_ID, comboData),
        row('theirs', 'Their matchup', OTHER_ID, comboData),
      ],
    });
    const { appStorage, store } = fakeAppStorage();
    await renderApp({ shared, appStorage }, signedIn);

    await openMy();
    await userEvent.click(await screen.findByTestId('archive-action'));
    await waitFor(() => expect(store.get(ARCHIVE_KEY)).toEqual(['mine']));

    await userEvent.click(await screen.findByTestId('archived-toggle'));
    await userEvent.click(await screen.findByTestId('unarchive-action'));

    await waitFor(() => expect(store.get(ARCHIVE_KEY)).toEqual([]));
    await waitFor(() => expect(keysOf('matchup-card')).toEqual(['mine']));
  });

  it('archives a PROMPT the same way, and only that prompt', async () => {
    const { shared, withdraws } = fakeShared({
      seed: [
        row('p-mine', 'My prompt', VIEWER_ID, promptData),
        row('p-mine2', 'My other prompt', VIEWER_ID, promptData),
        row('p-theirs', 'Their prompt', OTHER_ID, promptData),
      ],
    });
    const { appStorage, store } = fakeAppStorage();
    await renderApp({ shared, appStorage }, signedIn);

    await screen.findByTestId('matchups-view');
    await openPromptsView();
    await openMy();
    await waitFor(() => expect(keysOf('prompt-card').sort()).toEqual(['p-mine', 'p-mine2']));

    const target = screen
      .queryAllByTestId('prompt-card')
      .find((el) => el.getAttribute('data-key') === 'p-mine')!;
    await userEvent.click(within(target).getByTestId('archive-action'));

    // Only the archived one leaves My; the viewer's OTHER prompt stays.
    await waitFor(() => expect(keysOf('prompt-card')).toEqual(['p-mine2']));
    expect(store.get(ARCHIVE_KEY)).toEqual(['p-mine']);
    expect(withdraws).toEqual([]);

    // …and Community still holds all three, the archived one included.
    await openCommunity();
    await waitFor(() =>
      expect(keysOf('prompt-card').sort()).toEqual(['p-mine', 'p-mine2', 'p-theirs']),
    );
  });
});

// ---------------------------------------------------------------------------
// Anonymous viewers — read-only Community, a sign-in prompt on My, and NO
// affordance whose host call would reject.
// ---------------------------------------------------------------------------

describe('🔴 an anonymous viewer gets a readable Community and no rejecting write', () => {
  it('reads Community, and gets a sign-in prompt instead of a My list', async () => {
    const { shared } = fakeShared({
      seed: [
        row('mine', 'A matchup', VIEWER_ID, comboData),
        row('theirs', 'Another matchup', OTHER_ID, comboData),
      ],
    });
    await renderApp({ shared, appStorage: fakeAppStorage().appStorage }, null);

    // Community is READABLE signed out — both rows, no ownership at all.
    await waitFor(() => expect(keysOf('matchup-card')).toHaveLength(2));
    expect(screen.queryByTestId('matchup-edit')).toBeNull();
    expect(screen.queryByTestId('matchup-withdraw')).toBeNull();

    // My is a sign-in prompt, and carries NO write affordance.
    await openMy();
    await screen.findByTestId('my-signed-out');
    expect(screen.queryByTestId('new-unpublished')).toBeNull();
    expect(screen.queryByTestId('unpublished-publish')).toBeNull();
    expect(screen.queryByTestId('archive-action')).toBeNull();
    expect(screen.queryByTestId('matchup-card')).toBeNull();
  });

  it('🔴 makes NO per-viewer or shared write on any affordance it does offer', async () => {
    // 🔴 THE HAZARD: `appStorage.set` rejects for an anonymous viewer and
    // `shared.append` rejects too, so any control that fired one here would
    // surface as an unhandled rejection out of a click handler. The guard is that
    // the anonymous surface offers none — and this walks the ones it DOES offer.
    //
    // 🔴 THE WALK IS THE CLAIM, AND IT USED TO BE NARROWER THAN THE SENTENCE
    // DESCRIBING IT. The docstring said "both sub-tabs, both views" while the app
    // has THREE views, Grids is the DEFAULT one (§11.5), and the walk never
    // entered it. It also never touched `submit-matchup` or `submit-prompt`,
    // which render UNGATED for an anonymous viewer — those paths turn out to be
    // handled (both forms catch), but a guard that reads as coverage while
    // providing none is worse than no guard, because it stops anyone looking.
    // The walk is now as wide as the sentence: all THREE views, both sub-tabs on
    // each, both ungated submit buttons opened AND dismissed, and the sign-in
    // buttons clicked. Widening it — not narrowing the sentence — is the fix.
    const rejections: unknown[] = [];
    const onRejection = (e: unknown) => rejections.push(e);
    process.on('unhandledRejection', onRejection);
    try {
      const { shared, appends, updates, withdraws } = fakeShared({
        seed: [row('theirs', 'Another matchup', OTHER_ID, comboData)],
      });
      const { appStorage, setAttempts, deletes } = fakeAppStorage();
      let signInRequests = 0;
      // Mounted WITHOUT `renderApp`'s navigate-to-Matchups step: the DEFAULT view
      // is where an anonymous viewer actually lands, and it is the one the old
      // walk never visited.
      mountApp({ shared, appStorage, requestSignIn: () => (signInRequests += 1) }, null);

      // ---- GRIDS: the default view (§11.5, criterion 9) ----
      await screen.findByTestId('grid-view');
      // The create affordance IS gated here — asserted, so "no write" cannot be
      // credited to a button the walk simply failed to find.
      expect(screen.queryByTestId('grid-new')).toBeNull();
      await openMy();
      await userEvent.click(await screen.findByTestId('my-sign-in'));
      await openCommunity();

      // ---- MATCHUPS ----
      await openView('Matchups');
      await screen.findByTestId('matchups-view');
      await openMy();
      await userEvent.click(await screen.findByTestId('my-sign-in'));
      await openCommunity();
      // 🔴 UNGATED FOR ANON: `submit-matchup` renders for everyone. Open the form
      // it raises and dismiss it — this is the path the old walk never entered.
      await userEvent.click(await screen.findByTestId('submit-matchup'));
      await screen.findByTestId('matchup-form');
      await userEvent.click(screen.getByTestId('matchup-cancel'));

      // ---- PROMPTS ----
      await openPromptsView();
      await openMy();
      await userEvent.click(await screen.findByTestId('my-sign-in'));
      await openCommunity();
      // 🔴 Also ungated for anon.
      await userEvent.click(await screen.findByTestId('submit-prompt'));
      await screen.findByTestId('prompt-form');
      await userEvent.click(screen.getByTestId('prompt-cancel'));

      // POSITIVE CONTROL on the walk: the sign-in button really was clicked on
      // all THREE views, so the empty write ledgers below are about a surface
      // that was exercised. A literal, not a `>=`: this is the walk's ledger, so
      // a view appearing or disappearing should be a decision someone takes.
      expect(signInRequests, 'the anonymous surface was never actually clicked').toBe(3);

      // 🔴 NOT ONE write was attempted, on either store. `setAttempts` records
      // even a REJECTED `set`, which `sets` would not — so this cannot be
      // satisfied by a write that was made and refused.
      expect(setAttempts, 'an anonymous viewer attempted a per-viewer write').toEqual([]);
      expect(deletes).toEqual([]);
      expect(appends).toEqual([]);
      expect(updates).toEqual([]);
      expect(withdraws).toEqual([]);
      expect(rejections, 'an anonymous affordance produced an unhandled rejection').toEqual([]);
    } finally {
      process.off('unhandledRejection', onRejection);
    }
  });
});

// ---------------------------------------------------------------------------
// The word "draft" is gone from the RENDERED vocabulary (§11.1) — while the
// STORAGE prefix keeps it forever.
// ---------------------------------------------------------------------------

describe('🔴 "draft" is a storage word, not a viewer-facing one', () => {
  it('renders nowhere in the surfaces that used to say it', async () => {
    // 🔴 THE SCAN IS OVER RENDERED TEXT, NOT SOURCE. The prefix, the types and the
    // analytics event all still spell "draft" on purpose — a source grep would
    // therefore have to allowlist them and would stop meaning anything. What §11.1
    // decided is about what a viewer READS, so that is what is measured, across
    // every surface the old drafts panel touched: both sub-tabs of both views, and
    // both private forms.
    const unpublishedMatchup = {
      v: 1,
      localId: 'l1',
      name: 'An unpublished matchup',
      description: '',
      configs: comboData.configs,
      updatedAt: '2026-09-07T00:00:00.000Z',
    };
    const unpublishedPrompt = {
      v: 1,
      localId: 'up1',
      name: 'An unpublished prompt',
      description: '',
      default: { prompt: 'a quiet street at dawn', params: {} },
      updatedAt: '2026-09-07T00:00:00.000Z',
    };
    const { shared } = fakeShared({
      seed: [
        row('mine', 'My matchup', VIEWER_ID, comboData),
        row('p-mine', 'My prompt', VIEWER_ID, promptData),
      ],
    });
    const { appStorage } = fakeAppStorage({
      [draftKey('l1')]: unpublishedMatchup,
      [unpubPromptKey('up1')]: unpublishedPrompt,
    });
    await renderApp({ shared, appStorage }, signedIn);

    const bodyText = () => (document.body.textContent ?? '').replace(/\s+/g, ' ');
    const noDraft = (where: string) =>
      expect(bodyText(), `the word "draft" is rendered on ${where}`).not.toMatch(/draft/i);

    await screen.findByTestId('matchups-view');
    noDraft('Matchups / Community');

    await openMy();
    await screen.findByTestId('unpublished-card');
    // 🔴 POSITIVE CONTROL ON THE SCAN: it can see this surface's own copy. Without
    // it, a scan reading an empty or unmounted DOM would report "no draft" and
    // prove nothing.
    expect(bodyText()).toContain('Not published yet');
    expect(bodyText()).toContain('An unpublished matchup');
    noDraft('Matchups / My');

    // The private matchup form (the old "New draft" / "Save draft" modal).
    await userEvent.click(screen.getByTestId('unpublished-edit'));
    await screen.findByTestId('matchup-form');
    noDraft('the private matchup form');
    await userEvent.click(screen.getByTestId('matchup-cancel'));

    await openPromptsView();
    noDraft('Prompts / Community');
    await openMy();
    await screen.findByTestId('unpublished-card');
    expect(bodyText()).toContain('An unpublished prompt');
    noDraft('Prompts / My');

    await userEvent.click(screen.getByTestId('unpublished-edit'));
    await screen.findByTestId('prompt-form');
    noDraft('the private prompt form');
  });
});
