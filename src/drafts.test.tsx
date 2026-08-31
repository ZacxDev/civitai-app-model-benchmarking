// 🔴 THE PRIVATE/PUBLIC BOUNDARY, driven through the REAL App (clawgate 451,
// docs/matchups.md §4). A matchup is created and edited in the PER-VIEWER store
// and reaches the world-readable shared board only when the viewer takes a
// second, explicit action. Which store the record is in IS the privacy — there
// is no visibility flag to set, and a shared row is world-readable the instant
// it is appended.
//
// Acceptance criteria covered here (5 was STRUCK by operator decision on
// 2026-08-30 — no unsubmit, edit only; see docs/matchups.md §9 Q2):
//   1 — create/edit a matchup never written to shared storage; survives a reload
//   2 — submit is a separate explicit action; before it, no other viewer sees it
//   3 — after submit the draft is retained as a pointer carrying the sharedKey
//   4 — editing a submitted matchup uses shared.update, keeping key AND votes
//   6 — the quota line comes from getQuota(), never a hard-coded 50 MB
//   7 — NO draft path ever calls shared.append

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Harness } from '@civitai/blocks-react/testing';
import type { SharedListItem, UseAppStorage, UseSharedStorage } from '@civitai/blocks-react';

import { App, type AppDeps } from './App.js';
import { CKPT_SDXL, fakeAppStorage, fakeShared, immediateSleep } from './test-helpers.js';
import { DRAFT_PREFIX, draftKey, parseDraft } from './lib/drafts.js';
import type { CombinationData } from './types.js';

const VIEWER_ID = 99;
const OTHER_ID = 7;

function renderApp(deps: Partial<AppDeps>, viewerId: number = VIEWER_ID) {
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

/** Drive the draft form: open it, name it, pick a checkpoint, save. */
async function fillAndSaveDraft(name: string, opener: HTMLElement) {
  await userEvent.click(opener);
  const form = await screen.findByTestId('combination-form');
  const nameInput = within(form).getByTestId('combo-name');
  await userEvent.clear(nameInput);
  await userEvent.type(nameInput, name);
  if (within(form).queryByTestId('checkpoint-name') === null) {
    await userEvent.click(within(form).getByTestId('pick-checkpoint'));
    await waitFor(() =>
      expect(within(form).getByTestId('checkpoint-name')).toHaveTextContent('JuggernautXL'),
    );
  }
  await userEvent.click(within(form).getByTestId('combo-submit'));
  await waitFor(() => expect(screen.queryByTestId('combination-form')).toBeNull());
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

describe('🔴 criterion 7: no draft path ever calls shared.append', () => {
  it('creates, re-edits and discards a draft with ZERO shared-storage writes', async () => {
    const { shared, appends, updates, withdraws } = fakeShared();
    const { appStorage } = fakeAppStorage();
    renderApp({ shared, appStorage });

    // CREATE — the private path.
    await fillAndSaveDraft('Draft one', await screen.findByTestId('new-draft'));
    await screen.findByTestId('draft-card');

    // RE-EDIT the same draft — still the private path.
    await fillAndSaveDraft('Draft one renamed', screen.getByTestId('draft-edit'));
    await waitFor(() => expect(screen.getByTestId('draft-name')).toHaveTextContent('Draft one renamed'));

    // DISCARD — still the private path.
    await userEvent.click(screen.getByTestId('draft-delete'));
    await waitFor(() => expect(screen.queryByTestId('draft-card')).toBeNull());

    // 🔴 THE GUARD. `append` is the moment a record becomes world-readable, and
    // no draft path may reach it. The sibling assertions pin the rest of the
    // public surface so a draft path cannot leak through `update`/`withdraw`
    // either.
    expect(appends, 'a draft path called shared.append — the draft is now public').toEqual([]);
    expect(updates, 'a draft path called shared.update').toEqual([]);
    expect(withdraws, 'a draft path called shared.withdraw').toEqual([]);
  });

  it('POSITIVE CONTROL: the same recorder DOES see the append when submit is pressed', async () => {
    // Without this arm, the empty `appends` above is indistinguishable from a
    // recorder wired to nothing.
    const { shared, appends } = fakeShared();
    const { appStorage } = fakeAppStorage();
    renderApp({ shared, appStorage });

    await fillAndSaveDraft('Draft one', await screen.findByTestId('new-draft'));
    await userEvent.click(await screen.findByTestId('draft-submit'));

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
    renderApp({ shared, appStorage });

    await fillAndSaveDraft('Realism showdown', await screen.findByTestId('new-draft'));

    const card = await screen.findByTestId('draft-card');
    expect(card).toHaveTextContent('Realism showdown');
    // The public list is still empty — the draft is not a combination row.
    expect(screen.queryByTestId('combo-card')).toBeNull();
    expect(appends).toEqual([]);

    const drafts = storedDrafts(store);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ v: 1, name: 'Realism showdown' });
    expect(drafts[0]).not.toHaveProperty('sharedKey');
  });

  it('survives a reload: the SAME per-viewer store rehydrates the draft on a fresh mount', async () => {
    const { appStorage, store } = fakeAppStorage();
    const first = renderApp({ shared: fakeShared().shared, appStorage });
    await fillAndSaveDraft('Survives a reload', await screen.findByTestId('new-draft'));
    await screen.findByTestId('draft-card');
    first.unmount();

    // A brand-new App + a brand-new shared board — only the per-viewer store carries over.
    const { shared, appends } = fakeShared();
    renderApp({ shared, appStorage });
    const card = await screen.findByTestId('draft-card');
    expect(card).toHaveTextContent('Survives a reload');
    expect(appends).toEqual([]);
    expect(storedDrafts(store)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Criterion 2 — submit is a separate explicit action, and until it happens the
// matchup appears to no other viewer.
// ---------------------------------------------------------------------------

describe('criterion 2: before submit, no other viewer can see it', () => {
  it('a SECOND viewer on the same shared board sees nothing — until the author submits', async () => {
    // One shared board (the public surface both viewers read), two per-viewer
    // stores (the private surface each viewer owns).
    const board = fakeShared();
    const authorStore = fakeAppStorage();
    const otherStore = fakeAppStorage();

    const authorView = renderApp({ shared: board.shared, appStorage: authorStore.appStorage }, VIEWER_ID);
    await fillAndSaveDraft('Not yours to see', await screen.findByTestId('new-draft'));
    await screen.findByTestId('draft-card');
    authorView.unmount();

    // The other viewer: same board, their own store.
    const otherView = renderApp(
      { shared: board.shared, appStorage: otherStore.appStorage },
      OTHER_ID,
    );
    await screen.findByTestId('combos-view');
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId('draft-card')).toBeNull();
    expect(screen.queryByTestId('combo-card')).toBeNull();
    otherView.unmount();

    // POSITIVE CONTROL: the same second-viewer render DOES surface the matchup
    // once the author takes the explicit submit action. Without this, "sees
    // nothing" could just mean the second render never shows anything.
    const authorAgain = renderApp(
      { shared: board.shared, appStorage: authorStore.appStorage },
      VIEWER_ID,
    );
    await userEvent.click(await screen.findByTestId('draft-submit'));
    await waitFor(() => expect(board.appends).toHaveLength(1));
    authorAgain.unmount();

    renderApp({ shared: board.shared, appStorage: otherStore.appStorage }, OTHER_ID);
    const card = await screen.findByTestId('combo-card');
    expect(card).toHaveTextContent('Not yours to see');
    // Still nothing PRIVATE crossed over — the other viewer has no draft of their own.
    expect(screen.queryByTestId('draft-card')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Criterion 3 — the draft is RETAINED after submit, as a pointer.
// ---------------------------------------------------------------------------

describe('criterion 3: after submit the draft is kept as a pointer at the shared row', () => {
  it('rewrites draft:v1:<localId> to {localId, sharedKey, submittedAt}', async () => {
    const { shared, appends } = fakeShared();
    const { appStorage, store } = fakeAppStorage();
    renderApp({ shared, appStorage });

    await fillAndSaveDraft('Pointer please', await screen.findByTestId('new-draft'));
    const before = storedDrafts(store);
    expect(before).toHaveLength(1);
    const localId = before[0]!.localId;

    await userEvent.click(await screen.findByTestId('draft-submit'));
    await waitFor(() => expect(appends).toHaveLength(1));
    await screen.findByTestId('draft-submitted');

    // Still exactly ONE draft row, at the SAME key — kept, not deleted, and not
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
// Criterion 4 — editing a SUBMITTED matchup goes through shared.update, and
// keeps both the host-minted key and the vote total.
// ---------------------------------------------------------------------------

describe('criterion 4: editing a submitted matchup preserves the key AND the vote total', () => {
  it('updates in place from the retained pointer — no new row, no reset to zero', async () => {
    const LIVE_KEY = 'live_row_1';
    const VOTES = 7; // distinct from 0 and 1, so a reset or an off-by-one shows
    const { shared, appends, updates } = fakeShared({
      seed: [liveRow(LIVE_KEY, 'Live matchup', VIEWER_ID, VOTES)],
    });
    const { appStorage } = fakeAppStorage({
      [draftKey('l1')]: { v: 1, localId: 'l1', sharedKey: LIVE_KEY, submittedAt: 'ts' },
    });
    renderApp({ shared, appStorage });

    // The retained pointer is the per-viewer handle on the row — it is what
    // routes the viewer to the live record.
    await userEvent.click(await screen.findByTestId('draft-edit-submitted'));
    const form = await screen.findByTestId('combination-form');
    const nameInput = within(form).getByTestId('combo-name');
    expect(nameInput).toHaveValue('Live matchup');
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Live matchup, edited');
    await userEvent.click(within(form).getByTestId('combo-submit'));

    await waitFor(() => expect(updates).toHaveLength(1));
    // 🔴 THE SAME HOST-MINTED KEY. `append` would mint a new one and start the
    // tally at zero; `update` is author-scoped and keeps the row.
    expect(updates[0].key).toBe(LIVE_KEY);
    expect(updates[0].value.title).toBe('Live matchup, edited');
    expect(appends, 'an edit minted a NEW row instead of updating the live one').toEqual([]);

    // 🔴 AND THE VOTE TOTAL SURVIVES, on screen, after the post-edit re-fetch.
    const card = await screen.findByTestId('combo-card');
    await waitFor(() => expect(card).toHaveTextContent('Live matchup, edited'));
    expect(card.getAttribute('data-key')).toBe(LIVE_KEY);
    expect(within(card).getByTestId('vote-count')).toHaveTextContent(String(VOTES));
  });

  it('offers no "edit the live one" when the pointed-at row is not in hand', async () => {
    // The affordance is not a decoration: it only appears when the shared row it
    // would edit has actually been read.
    const { shared } = fakeShared({ seed: [] });
    const { appStorage } = fakeAppStorage({
      [draftKey('l1')]: { v: 1, localId: 'l1', sharedKey: 'gone', submittedAt: 'ts' },
    });
    renderApp({ shared, appStorage });

    await screen.findByTestId('draft-submitted');
    expect(screen.queryByTestId('draft-edit-submitted')).toBeNull();
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
    renderApp({ shared: fakeShared().shared, appStorage });

    const line = await screen.findByTestId('drafts-quota');
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
    // viewer's draft. The drafts are private; the numbers are not.
    //
    // 🔴 Pinned as the WHOLE NORMALISED STRING rather than keywords: a keyword
    // assertion is walkable by a reword that re-fuses the two clauses. A
    // cosmetic reword therefore fails this test, which is the intended price.
    const { appStorage } = fakeAppStorage(
      {},
      { usedBytes: 1024 * 1024 * 3, limitBytes: 1024 * 1024 * 12, limitRows: 4321 },
    );
    renderApp({ shared: fakeShared().shared, appStorage });

    const line = await screen.findByTestId('drafts-quota');
    const normalised = (line.textContent ?? '').replace(/\s+/g, ' ').trim();
    expect(normalised).toBe(
      'Drafts are private to you. Storage is app-wide, shared with every other viewer: ' +
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
    renderApp({ shared: fakeShared().shared, appStorage: refusing });

    await screen.findByTestId('drafts-panel');
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId('drafts-quota')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Robustness of the private path — a KV failure must not take the board down.
// ---------------------------------------------------------------------------

describe('the drafts panel degrades rather than breaking the public board', () => {
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
    renderApp({ shared, appStorage: broken });

    const card = await screen.findByTestId('combo-card');
    expect(card).toHaveTextContent('A public matchup');
    expect(screen.getByTestId('drafts-empty')).toBeInTheDocument();
  });
});
