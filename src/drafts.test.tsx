// 🔴 THE PRIVATE/PUBLIC BOUNDARY FOR MATCHUPS, driven through the REAL App
// (clawgate 451, then 527; docs/matchups.md §4 and §11.1). A matchup is created
// and edited in the PER-VIEWER store and reaches the world-readable shared board
// only when the viewer takes a second, explicit action. Which store the record is
// in IS the privacy — there is no visibility flag to set, and a shared row is
// world-readable the instant it is appended.
//
// ⚠️ 527 MOVED THE SURFACE, NOT THE BOUNDARY. The separate "Drafts" panel is
// gone; an unpublished matchup now sits in the **My** sub-tab of the Matchups view
// carrying a **Publish** action, and the word "draft" appears in no rendered
// string. The STORAGE is untouched: still `draft:v1:`, still a pointer after
// publish (`renameWireCompat.test.ts` pins the prefix).
//
// Acceptance criteria covered here (5 was STRUCK by operator decision on
// 2026-08-30 — no unpublish, edit only; see docs/matchups.md §9 Q2):
//   1 — create/edit a matchup never written to shared storage; survives a reload
//   2 — publish is a separate explicit action; before it, no other viewer sees it
//   3 — after publish the record is retained as a pointer carrying the sharedKey
//   4 — editing a published matchup uses shared.update, keeping key AND votes
//   6 — the quota line comes from getQuota(), never a hard-coded 50 MB
//   7 — NO private path ever calls shared.append

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Harness } from '@civitai/blocks-react/testing';
import type { SharedListItem, UseAppStorage, UseSharedStorage } from '@civitai/blocks-react';

import { App, type AppDeps } from './App.js';
import { CKPT_SDXL, fakeAppStorage, fakeShared, immediateSleep, openView } from './test-helpers.js';
import { DRAFT_PREFIX, draftKey, parseDraft } from './lib/drafts.js';
import type { CombinationData } from './types.js';

const VIEWER_ID = 99;
const OTHER_ID = 7;

function mountApp(deps: Partial<AppDeps>, viewerId: number = VIEWER_ID) {
  return render(
    <Harness
      viewer={{ id: viewerId, username: `u${viewerId}` }}
      theme="dark"
      consentGranted
      buzzBudget={1000}
      buzz={{ balance: 5000 }}
      buzzBalance={{ blue: 0, green: 0, yellow: 5000 }}
      cannedPicks={{ Checkpoint: CKPT_SDXL }}
      shared={{ seed: [] }}
      showLog={false}
    >
      <App
        deps={{
          resolveResources: async () => [],
          pollIntervalMs: 0,
          sleep: immediateSleep,
          ...deps,
        }}
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

/** Switch to the My sub-tab of whichever view is mounted (§11.1). */
async function openMy() {
  await userEvent.click(await screen.findByTestId('subtab-my'));
  return screen.findByTestId('my-panel');
}

/** Switch to the Community sub-tab. */
async function openCommunity() {
  await userEvent.click(await screen.findByTestId('subtab-community'));
}

/** Drive the private matchup form: open it, name it, pick a checkpoint, save. */
async function fillAndSavePrivately(name: string, opener: HTMLElement) {
  await userEvent.click(opener);
  const form = await screen.findByTestId('matchup-form');
  const nameInput = within(form).getByTestId('matchup-name');
  await userEvent.clear(nameInput);
  await userEvent.type(nameInput, name);
  if (within(form).queryByTestId('checkpoint-name') === null) {
    await userEvent.click(within(form).getByTestId('pick-checkpoint'));
    await waitFor(() =>
      expect(within(form).getByTestId('checkpoint-name')).toHaveTextContent('JuggernautXL'),
    );
  }
  await userEvent.click(within(form).getByTestId('matchup-submit'));
  await waitFor(() => expect(screen.queryByTestId('matchup-form')).toBeNull());
}

/** Every `draft:v1:` value currently in the per-viewer store, parsed. */
function storedDrafts(store: Map<string, unknown>) {
  return [...store.entries()]
    .filter(([k]) => k.startsWith(DRAFT_PREFIX))
    .map(([, v]) => parseDraft(v));
}

const liveComboData: CombinationData = {
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

function liveRow(key: string, title: string, authorUserId: number, count: number): SharedListItem {
  return {
    key,
    authorUserId,
    count,
    viewerVoted: false,
    value: { title, body: '', data: liveComboData },
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

// ---------------------------------------------------------------------------
// Criterion 7 — the boundary itself. This is the whole point of the card.
// ---------------------------------------------------------------------------

describe('🔴 criterion 7: no private path ever calls shared.append', () => {
  it('creates, re-edits and discards an unpublished matchup with ZERO shared-storage writes', async () => {
    const { shared, appends, updates, withdraws } = fakeShared();
    const { appStorage } = fakeAppStorage();
    await renderApp({ shared, appStorage });

    await openMy();
    // CREATE — the private path.
    await fillAndSavePrivately('Draft one', await screen.findByTestId('new-unpublished'));
    await screen.findByTestId('unpublished-card');

    // RE-EDIT the same record — still the private path.
    await fillAndSavePrivately('Draft one renamed', screen.getByTestId('unpublished-edit'));
    await waitFor(() =>
      expect(screen.getByTestId('unpublished-name')).toHaveTextContent('Draft one renamed'),
    );

    // DISCARD — still the private path.
    await userEvent.click(screen.getByTestId('unpublished-discard'));
    await waitFor(() => expect(screen.queryByTestId('unpublished-card')).toBeNull());

    // 🔴 THE GUARD. `append` is the moment a record becomes world-readable, and
    // no private path may reach it. The sibling assertions pin the rest of the
    // public surface so a private path cannot leak through `update`/`withdraw`
    // either.
    expect(appends, 'a private path called shared.append — the record is now public').toEqual([]);
    expect(updates, 'a private path called shared.update').toEqual([]);
    expect(withdraws, 'a private path called shared.withdraw').toEqual([]);
  });

  it('POSITIVE CONTROL: the same recorder DOES see the append when Publish is pressed', async () => {
    // Without this arm, the empty `appends` above is indistinguishable from a
    // recorder wired to nothing.
    const { shared, appends } = fakeShared();
    const { appStorage } = fakeAppStorage();
    await renderApp({ shared, appStorage });

    await openMy();
    await fillAndSavePrivately('Draft one', await screen.findByTestId('new-unpublished'));
    await userEvent.click(await screen.findByTestId('unpublished-publish'));

    await waitFor(() => expect(appends).toHaveLength(1));
    expect(appends[0].title).toBe('Draft one');
    // 🔴 A PERSISTED WIRE VALUE — it discriminates every row already on the
    // board and there is no backfill path, so it is never renamed.
    expect((appends[0].data as CombinationData).kind).toBe('combination');
  });
});

// ---------------------------------------------------------------------------
// Criterion 1 — create/edit privately, and survive a reload.
// ---------------------------------------------------------------------------

describe('criterion 1: a matchup can be created and edited without ever going public', () => {
  it('writes the whole matchup to the per-viewer store under draft:v1:', async () => {
    const { shared, appends } = fakeShared();
    const { appStorage, store } = fakeAppStorage();
    await renderApp({ shared, appStorage });

    await openMy();
    await fillAndSavePrivately('Realism showdown', await screen.findByTestId('new-unpublished'));

    const card = await screen.findByTestId('unpublished-card');
    expect(card).toHaveTextContent('Realism showdown');
    // The public list is still empty — the record is not a combination row.
    expect(screen.queryByTestId('matchup-card')).toBeNull();
    expect(appends).toEqual([]);

    const drafts = storedDrafts(store);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ v: 1, name: 'Realism showdown' });
    expect(drafts[0]).not.toHaveProperty('sharedKey');

    // …and it is not on the COMMUNITY side either, which is the tab every other
    // viewer reads. An unpublished record has no shared row to appear in.
    await openCommunity();
    expect(screen.queryByTestId('matchup-card')).toBeNull();
  });

  it('survives a reload: the SAME per-viewer store rehydrates the record on a fresh mount', async () => {
    const { appStorage, store } = fakeAppStorage();
    const first = await renderApp({ shared: fakeShared().shared, appStorage });
    await openMy();
    await fillAndSavePrivately('Survives a reload', await screen.findByTestId('new-unpublished'));
    await screen.findByTestId('unpublished-card');
    first.unmount();

    // A brand-new App + a brand-new shared board — only the per-viewer store carries over.
    const { shared, appends } = fakeShared();
    await renderApp({ shared, appStorage });
    await openMy();
    const card = await screen.findByTestId('unpublished-card');
    expect(card).toHaveTextContent('Survives a reload');
    expect(appends).toEqual([]);
    expect(storedDrafts(store)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Criterion 2 — publish is a separate explicit action, and until it happens the
// matchup appears to no other viewer.
// ---------------------------------------------------------------------------

describe('criterion 2: before publish, no other viewer can see it', () => {
  it('a SECOND viewer on the same shared board sees nothing — until the author publishes', async () => {
    // One shared board (the public surface both viewers read), two per-viewer
    // stores (the private surface each viewer owns).
    const board = fakeShared();
    const authorStore = fakeAppStorage();
    const otherStore = fakeAppStorage();

    const authorView = await renderApp({ shared: board.shared, appStorage: authorStore.appStorage }, VIEWER_ID);
    await openMy();
    await fillAndSavePrivately('Not yours to see', await screen.findByTestId('new-unpublished'));
    await screen.findByTestId('unpublished-card');
    authorView.unmount();

    // The other viewer: same board, their own store — on BOTH sub-tabs.
    const otherView = await renderApp(
      { shared: board.shared, appStorage: otherStore.appStorage },
      OTHER_ID,
    );
    await screen.findByTestId('matchups-view');
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId('matchup-card')).toBeNull();
    await openMy();
    expect(screen.queryByTestId('unpublished-card')).toBeNull();
    expect(screen.queryByText('Not yours to see')).toBeNull();
    otherView.unmount();

    // POSITIVE CONTROL: the same second-viewer render DOES surface the matchup
    // once the author takes the explicit publish action. Without this, "sees
    // nothing" could just mean the second render never shows anything.
    const authorAgain = await renderApp(
      { shared: board.shared, appStorage: authorStore.appStorage },
      VIEWER_ID,
    );
    await openMy();
    await userEvent.click(await screen.findByTestId('unpublished-publish'));
    await waitFor(() => expect(board.appends).toHaveLength(1));
    authorAgain.unmount();

    await renderApp({ shared: board.shared, appStorage: otherStore.appStorage }, OTHER_ID);
    const card = await screen.findByTestId('matchup-card');
    expect(card).toHaveTextContent('Not yours to see');
    // Still nothing PRIVATE crossed over — the other viewer has no unpublished
    // record of their own.
    await openMy();
    expect(screen.queryByTestId('unpublished-card')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Criterion 3 — the record is RETAINED after publish, as a pointer.
// ---------------------------------------------------------------------------

describe('criterion 3: after publish the record is kept as a pointer at the shared row', () => {
  it('rewrites draft:v1:<localId> to {localId, sharedKey, submittedAt}', async () => {
    const { shared, appends } = fakeShared();
    const { appStorage, store } = fakeAppStorage();
    await renderApp({ shared, appStorage });

    await openMy();
    await fillAndSavePrivately('Pointer please', await screen.findByTestId('new-unpublished'));
    const before = storedDrafts(store);
    expect(before).toHaveLength(1);
    const localId = before[0]!.localId;

    await userEvent.click(await screen.findByTestId('unpublished-publish'));
    await waitFor(() => expect(appends).toHaveLength(1));
    // The unpublished card is gone from My — it is a published row now.
    await waitFor(() => expect(screen.queryByTestId('unpublished-card')).toBeNull());

    // Still exactly ONE record row, at the SAME key — kept, not deleted, and not
    // duplicated.
    const after = storedDrafts(store);
    expect(after).toHaveLength(1);
    expect(store.has(draftKey(localId))).toBe(true);

    const pointer = after[0]!;
    expect(pointer.localId).toBe(localId);
    expect(pointer).toMatchObject({ v: 1, sharedKey: 'fk_1' });
    expect(typeof (pointer as { submittedAt: string }).submittedAt).toBe('string');
    // The editable body is gone — the public row owns the record now.
    expect(pointer).not.toHaveProperty('configs');
  });
});

// ---------------------------------------------------------------------------
// Criterion 4 — editing a PUBLISHED matchup goes through shared.update, and
// keeps both the host-minted key and the vote total.
// ---------------------------------------------------------------------------

describe('criterion 4: editing a published matchup preserves the key AND the vote total', () => {
  it('updates in place from the row itself — no new row, no reset to zero', async () => {
    const LIVE_KEY = 'live_row_1';
    const VOTES = 7; // distinct from 0 and 1, so a reset or an off-by-one shows
    const { shared, appends, updates } = fakeShared({
      seed: [liveRow(LIVE_KEY, 'Live matchup', VIEWER_ID, VOTES)],
    });
    const { appStorage } = fakeAppStorage({
      [draftKey('l1')]: { v: 1, localId: 'l1', sharedKey: LIVE_KEY, submittedAt: 'ts' },
    });
    await renderApp({ shared, appStorage });

    // ⚠️ 527: the route in is the row's OWN Edit control in the My tab, not a
    // pointer card. `isOwnRow` over the board scan IS the "mine" index the
    // pointer used to stand in for (§11.1), so the pointer is storage-only now.
    await openMy();
    const own = await screen.findByTestId('matchup-card');
    await userEvent.click(within(own).getByTestId('matchup-edit'));
    const form = await screen.findByTestId('matchup-form');
    const nameInput = within(form).getByTestId('matchup-name');
    expect(nameInput).toHaveValue('Live matchup');
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Live matchup, edited');
    await userEvent.click(within(form).getByTestId('matchup-submit'));

    await waitFor(() => expect(updates).toHaveLength(1));
    // 🔴 THE SAME HOST-MINTED KEY. `append` would mint a new one and start the
    // tally at zero; `update` is author-scoped and keeps the row.
    expect(updates[0].key).toBe(LIVE_KEY);
    expect(updates[0].value.title).toBe('Live matchup, edited');
    expect(appends, 'an edit minted a NEW row instead of updating the live one').toEqual([]);

    // 🔴 AND THE VOTE TOTAL SURVIVES, on screen, after the post-edit re-fetch.
    const card = await screen.findByTestId('matchup-card');
    await waitFor(() => expect(card).toHaveTextContent('Live matchup, edited'));
    expect(card.getAttribute('data-key')).toBe(LIVE_KEY);
    expect(within(card).getByTestId('vote-count')).toHaveTextContent(String(VOTES));
  });

  it('renders no ghost card for a pointer whose shared row is not in hand', async () => {
    // 🔴 THE DEFECT 527 RETIRED: the old drafts panel rendered a "Submitted /
    // Live on the board" card for every pointer, INCLUDING pointers at rows that
    // no longer exist — buttonless, false, and unremovable. Pointers are storage
    // now, so a pointer at a missing row renders nothing at all.
    const { shared } = fakeShared({ seed: [] });
    const { appStorage } = fakeAppStorage({
      [draftKey('l1')]: { v: 1, localId: 'l1', sharedKey: 'gone', submittedAt: 'ts' },
    });
    await renderApp({ shared, appStorage });

    await openMy();
    // The panel really did load (so the absence below is not an unmounted view).
    await screen.findByTestId('unpublished-panel');
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId('unpublished-card')).toBeNull();
    expect(screen.queryByTestId('matchup-card')).toBeNull();
    expect(screen.getByTestId('my-published-empty')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Criterion 6 — the quota line is the HOST's numbers.
// ---------------------------------------------------------------------------

describe('criterion 6: the storage ceiling is read from getQuota(), not hard-coded', () => {
  it('renders the host-reported limits, which are not the documented 50 MB / 1M defaults', async () => {
    const { appStorage } = fakeAppStorage(
      {},
      { usedBytes: 1024 * 1024 * 3, limitBytes: 1024 * 1024 * 12, limitRows: 4321 },
    );
    await renderApp({ shared: fakeShared().shared, appStorage });

    await openMy();
    const line = await screen.findByTestId('storage-quota');
    expect(line).toHaveTextContent('3.0 MB');
    expect(line).toHaveTextContent('12 MB');
    expect(line).toHaveTextContent('4,321');
    // The values a hard-coded implementation would have shown instead.
    expect(line).not.toHaveTextContent('50 MB');
    expect(line).not.toHaveTextContent('1,000,000');
  });

  it('renders the WHOLE line, and does not call the app-wide figures the viewer’s own', async () => {
    // 🔴 THE DEFECT: this line used to open "Private to you — 3.0 MB of 12 MB
    // used, …", fusing a TRUE per-viewer privacy claim onto APP-WIDE totals.
    // `useAppStorage`'s contract keeps those scopes apart — `get()` reads "the
    // current (block instance, viewer) tuple", but `set()` rejects "when the
    // per-app 50MB quota would be crossed" — and it was confirmed live on
    // 2026-08-31: viewers 8753561 and 11025902 saw byte-identical quota lines,
    // including a row count that had just moved 27 -> 28 because of the FIRST
    // viewer's record. The records are private; the numbers are not.
    //
    // 🔴 Pinned as the WHOLE NORMALISED STRING rather than keywords: a keyword
    // assertion is walkable by a reword that re-fuses the two clauses. A
    // cosmetic reword therefore fails this test, which is the intended price.
    const { appStorage } = fakeAppStorage(
      {},
      { usedBytes: 1024 * 1024 * 3, limitBytes: 1024 * 1024 * 12, limitRows: 4321 },
    );
    await renderApp({ shared: fakeShared().shared, appStorage });

    await openMy();
    const line = await screen.findByTestId('storage-quota');
    const normalised = (line.textContent ?? '').replace(/\s+/g, ' ').trim();
    expect(normalised).toBe(
      'Unpublished items are private to you. Storage is app-wide, shared with every other viewer: ' +
        '3.0 MB of 12 MB used, 0 of 4,321 rows.',
    );
  });

  it('shows no quota line at all when the host has not answered', async () => {
    // A refusing getQuota() must leave the number OFF, never fall back to a guess.
    const base = fakeAppStorage();
    const refusing: UseAppStorage = {
      ...base.appStorage,
      getQuota: async () => {
        throw new Error('host declined');
      },
    };
    await renderApp({ shared: fakeShared().shared, appStorage: refusing });

    await openMy();
    await screen.findByTestId('unpublished-panel');
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId('storage-quota')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Robustness of the private path — a KV failure must not take the board down.
// ---------------------------------------------------------------------------

describe('the My tab degrades rather than breaking the public board', () => {
  it('still renders the public list when the per-viewer store cannot be listed', async () => {
    const base = fakeAppStorage();
    const broken: UseAppStorage = {
      ...base.appStorage,
      list: async () => {
        throw new Error('KV unavailable');
      },
    };
    const shared: UseSharedStorage = fakeShared({
      seed: [liveRow('k1', 'A public matchup', OTHER_ID, 2)],
    }).shared;
    await renderApp({ shared, appStorage: broken });

    const card = await screen.findByTestId('matchup-card');
    expect(card).toHaveTextContent('A public matchup');
    await openMy();
    expect(screen.getByTestId('unpublished-empty')).toBeInTheDocument();
  });
});
