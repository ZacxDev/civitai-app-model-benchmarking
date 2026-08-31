// Withdraw (issue #10): a contributor removes their OWN row from the shared grid.
// `useSharedStorage().withdraw` was implemented, scoped and documented — and
// wired to nothing, so a submitted combo/prompt was permanent as far as the UI
// was concerned. These drive the real App through the affordance:
//   - the author CAN withdraw their own combination / prompt (and only after a
//     confirm step — a single click never removes anything),
//   - a NON-author gets no withdraw affordance at all (the ownership guard),
//   - the list RECONCILES: the row stays gone even when list() still returns it
//     (read-after-write lag), exactly like the optimistic insert on submit.

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Harness } from '@civitai/blocks-react/testing';
import type { SharedListItem, UseSharedStorage } from '@civitai/blocks-react';

import { App, type AppDeps } from './App.js';
import { DRAFT_PREFIX, draftKey } from './lib/drafts.js';
import { fakeAppStorage, fakeShared, immediateSleep } from './test-helpers.js';
import type { CombinationData, PromptData } from './types.js';

const VIEWER_ID = 99;
const OTHER_ID = 7;

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
): SharedListItem {
  return {
    key,
    authorUserId,
    count: 1,
    viewerVoted: false,
    value: { title, body: '', data },
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

function renderApp(deps: Partial<AppDeps>) {
  render(
    <Harness
      viewer={{ id: VIEWER_ID, username: 'me' }}
      theme="dark"
      consentGranted
      buzzBudget={1000}
      buzz={{ balance: 5000 }}
      buzzBalance={{ blue: 0, green: 0, yellow: 5000 }}
      shared={{ seed: [] }}
      showLog={false}
    >
      <App
        deps={{
          resolveResources: async () => [],
          pollIntervalMs: 0,
          sleep: immediateSleep,
          appStorage: fakeAppStorage().appStorage,
          ...deps,
        }}
      />
    </Harness>,
  );
}

describe('withdraw: the author removes their OWN combination', () => {
  it('confirms first, tells the shared store the key, and drops the card', async () => {
    const { shared, withdraws } = fakeShared({ seed: [row('mine', 'Mine', VIEWER_ID, comboData)] });
    renderApp({ shared });

    const card = await screen.findByTestId('combo-card');
    await userEvent.click(within(card).getByTestId('combo-withdraw'));

    // Confirm-before-firing: the trigger alone must NOT have withdrawn anything.
    expect(withdraws).toEqual([]);
    await userEvent.click(within(card).getByTestId('withdraw-confirm'));

    await waitFor(() => expect(screen.queryByTestId('combo-card')).toBeNull());
    expect(withdraws).toEqual(['mine']);
  });

  it('does nothing when the confirm step is cancelled', async () => {
    const { shared, withdraws } = fakeShared({ seed: [row('mine', 'Mine', VIEWER_ID, comboData)] });
    renderApp({ shared });

    const card = await screen.findByTestId('combo-card');
    await userEvent.click(within(card).getByTestId('combo-withdraw'));
    await userEvent.click(within(card).getByTestId('withdraw-cancel'));

    expect(withdraws).toEqual([]);
    const still = screen.getByTestId('combo-card');
    expect(still).toHaveTextContent('Mine');
    // Back to the un-armed trigger, so the affordance is reusable.
    expect(within(still).getByTestId('combo-withdraw')).toBeInTheDocument();
    expect(within(still).queryByTestId('withdraw-confirm')).toBeNull();
  });
});

describe('withdraw: the ownership guard', () => {
  it('offers NO withdraw affordance on another contributor’s combination', async () => {
    const { shared, withdraws } = fakeShared({
      seed: [row('mine', 'Mine', VIEWER_ID, comboData), row('theirs', 'Theirs', OTHER_ID, comboData)],
    });
    renderApp({ shared });

    const cards = await screen.findAllByTestId('combo-card');
    expect(cards).toHaveLength(2);
    const mine = cards.find((el) => within(el).queryByText('Mine'))!;
    const theirs = cards.find((el) => within(el).queryByText('Theirs'))!;

    // The viewer's own row HAS the control — so the absence below is a guard
    // decision, not a control that simply never renders.
    expect(within(mine).getByTestId('combo-withdraw')).toBeInTheDocument();
    // 🔴 THE OWNERSHIP GUARD: someone else's row carries no withdraw control, and
    // no armed confirm behind it either.
    expect(within(theirs).queryByTestId('combo-withdraw')).toBeNull();
    expect(within(theirs).queryByTestId('withdraw-confirm')).toBeNull();
    expect(withdraws).toEqual([]);
  });

  it('offers NO withdraw affordance on another contributor’s prompt', async () => {
    const { shared, withdraws } = fakeShared({
      seed: [row('mine', 'My Prompt', VIEWER_ID, promptData), row('theirs', 'Their Prompt', OTHER_ID, promptData)],
    });
    renderApp({ shared });

    await userEvent.click(await screen.findByRole('tab', { name: /Prompts/ }));
    const cards = await screen.findAllByTestId('prompt-card');
    const mine = cards.find((el) => within(el).queryByText('My Prompt'))!;
    const theirs = cards.find((el) => within(el).queryByText('Their Prompt'))!;

    expect(within(mine).getByTestId('prompt-withdraw')).toBeInTheDocument();
    // 🔴 THE OWNERSHIP GUARD (prompts surface).
    expect(within(theirs).queryByTestId('prompt-withdraw')).toBeNull();
    expect(withdraws).toEqual([]);
  });
});

describe('withdraw: the author removes their OWN prompt', () => {
  it('confirms first, tells the shared store the key, and drops the card', async () => {
    const { shared, withdraws } = fakeShared({ seed: [row('p1', 'My Prompt', VIEWER_ID, promptData)] });
    renderApp({ shared });

    await userEvent.click(await screen.findByRole('tab', { name: /Prompts/ }));
    const card = await screen.findByTestId('prompt-card');
    await userEvent.click(within(card).getByTestId('prompt-withdraw'));
    expect(withdraws).toEqual([]);
    await userEvent.click(within(card).getByTestId('withdraw-confirm'));

    await waitFor(() => expect(screen.queryByTestId('prompt-card')).toBeNull());
    expect(withdraws).toEqual(['p1']);
  });
});

// ---------------------------------------------------------------------------
// Withdrawing a row the viewer SUBMITTED FROM A DRAFT: the pointer must go with
// it, but ONLY on success.
// ---------------------------------------------------------------------------
//
// 🔴 THE DEFECT. Submit rewrites a draft to a POINTER — `{localId, sharedKey,
// submittedAt}` — and DROPS `configs` (see `submittedPointer`). Withdraw the
// row it points at and the drafts panel kept rendering a card reading
// "Submitted / Live on the board. Edits keep its votes." for a row that no
// longer exists — and with ZERO buttons, because its only action ("Edit the
// live one") is gated on the shared row being loaded. Unremovable, false, and
// still consuming a quota row. Since `configs` were dropped there is nothing to
// restore, so the pointer is deleted rather than tombstoned.
//
// 🔴 THE ORDER IS THE GUARD, and the second test below is the one that matters:
// clear the pointer BEFORE the host confirms and this fix becomes a data-loss
// bug — a transient network failure would destroy the viewer's only handle on a
// row that is still live (shared keys are host-minted, and the shared list has
// no "mine" index, so the handle is unrecoverable).
//
// RED/GREEN, MEASURED. With `src/App.tsx` restored to 55f9825 and this file at
// HEAD: `Tests 1 failed | 8 passed (9)`. Only the FIRST case below is red at
// base — at base nothing clears the pointer, so the two guards are green there
// for the trivial reason that the code they guard does not exist. They are
// therefore NOT regression coverage, and each was instead MUTATION-KILLED
// against HEAD, one at a time, each dying with its OWN assertion:
//
//   - clear the pointer BEFORE `await shared.withdraw(key)`
//       -> "SURVIVES a withdraw the host REJECTS" fails:
//          expected [ 'draft:v1:l1' ] to not include 'draft:v1:l1'   (1 failed | 8 passed)
//   - drop the `d.sharedKey === sharedKey` match from `clearDraftPointerFor`
//       -> "touches NO draft when a PROMPT is withdrawn" fails:
//          expected [ 'draft:v1:l1' ] to deeply equal []             (1 failed | 8 passed)
//
// Each mutant killed exactly ONE case, so neither is passing off another
// guard's error as its own.
//
// UPDATE (audit round 2 — `Tests 1 failed | 11 passed (12)` at 7899a97, the one
// red case being the strengthened PROMPT guard; 13 at HEAD). Two things worth
// carrying forward:
//
//   🔴 A FIX ELSEWHERE SILENTLY UNCOVERED A MUTANT. Splitting the withdraw call
//   sites so the prompts surface no longer scans was a real latency fix — but
//   the prompt case was ALSO the only thing killing the "drop the
//   `sharedKey` match" mutant, because that mutant only bit when a surface with
//   no pointers of its own ran the scan. With the scan gone, dropping the match
//   went green at 12/12. Caught only by re-running the FULL mutant set rather
//   than the tests near the diff. The match is now pinned by "leaves ANOTHER
//   combination's pointer alone", on the surface that actually scans.
//
//   🔴 THE PAGING LOOP WAS DEAD CODE TO THE SUITE. `fakeAppStorage.list` never
//   emitted `nextCursor`, so `cursor = res.nextCursor` -> `cursor = undefined`
//   passed the FULL SUITE at 234/234. The fake pages for real now, and the
//   page-2 case carries a positive control on its own premise (a drafts listing
//   that actually carried a cursor) so it cannot quietly stop paging again.
//
// Full mutant ladder at HEAD, each killed, each by its own assertion:
//   M1 clear pointer before withdraw   -> 2 cases (REJECTS + REFUSES)
//   M2 drop the sharedKey match        -> "leaves ANOTHER combination's pointer alone"
//   M3 drop the `!res.ok` branch       -> "REFUSES WITHOUT THROWING"
//   M4 drop refreshDrafts()            -> "is DELETED once the host confirms"
//   M7 cursor = undefined              -> "sits on the SECOND page"
//   M8 prompts scan again              -> "NEVER EVEN STARTS the pointer scan"
const LIVE_KEY = 'mine';
const POINTER_LOCAL_ID = 'l1';
const pointer = { v: 1, localId: POINTER_LOCAL_ID, sharedKey: LIVE_KEY, submittedAt: '2026-08-30T00:00:00.000Z' };

describe('withdraw: the draft pointer at the withdrawn row', () => {
  it('is DELETED once the host confirms the withdraw', async () => {
    const { shared, withdraws } = fakeShared({
      seed: [row(LIVE_KEY, 'Mine', VIEWER_ID, comboData)],
    });
    const { appStorage, deletes, store } = fakeAppStorage({ [draftKey(POINTER_LOCAL_ID)]: pointer });
    renderApp({ shared, appStorage });

    // The orphan-to-be is on screen first, so its absence below is the fix
    // acting and not a card that never rendered.
    await screen.findByTestId('draft-submitted');

    const card = await screen.findByTestId('combo-card');
    await userEvent.click(within(card).getByTestId('combo-withdraw'));
    await userEvent.click(within(card).getByTestId('withdraw-confirm'));

    await waitFor(() => expect(withdraws).toEqual([LIVE_KEY]));
    // The per-viewer KV really was told to drop the pointer…
    await waitFor(() => expect(deletes).toContain(draftKey(POINTER_LOCAL_ID)));
    // …the key is gone from the store (so it stops costing a quota row)…
    expect(store.has(draftKey(POINTER_LOCAL_ID))).toBe(false);
    // …and the buttonless "Live on the board" card is off the screen.
    await waitFor(() => expect(screen.queryByTestId('draft-submitted')).toBeNull());
  });

  it('🔴 SURVIVES a withdraw the host REJECTS — the row is still live, so the handle stays', async () => {
    // The whole point of doing the delete AFTER the await. If the pointer were
    // cleared first (or unconditionally), this is the case that loses data: the
    // shared row still exists and the viewer has just lost their only handle on
    // it.
    const { shared, withdraws } = fakeShared({
      seed: [row(LIVE_KEY, 'Mine', VIEWER_ID, comboData)],
    });
    const rejecting: UseSharedStorage = {
      ...shared,
      async withdraw(key: string) {
        withdraws.push(key);
        throw new Error('host refused the withdraw');
      },
    };
    const { appStorage, deletes, store } = fakeAppStorage({ [draftKey(POINTER_LOCAL_ID)]: pointer });

    // WithdrawButton awaits `onWithdraw` in a try/finally with no catch, so a
    // rejecting host surfaces as an unhandled rejection out of React's click
    // handler. That is pre-existing behaviour and not what this test is about —
    // swallow it for the duration so the assertions below are what decides.
    const swallow = (): void => {};
    process.on('unhandledRejection', swallow);
    try {
      renderApp({ shared: rejecting, appStorage });
      await screen.findByTestId('draft-submitted');

      const card = await screen.findByTestId('combo-card');
      await userEvent.click(within(card).getByTestId('combo-withdraw'));
      await userEvent.click(within(card).getByTestId('withdraw-confirm'));

      // The app DID try — so the assertions below are about what happened after
      // the failure, not about a click that never landed.
      await waitFor(() => expect(withdraws).toEqual([LIVE_KEY]));

      // 🔴 THE POINTER IS UNTOUCHED.
      expect(deletes).not.toContain(draftKey(POINTER_LOCAL_ID));
      expect(store.get(draftKey(POINTER_LOCAL_ID))).toEqual(pointer);
      expect(screen.getByTestId('draft-submitted')).toBeInTheDocument();
      // …and the row it points at is still on the public board.
      expect(screen.getByTestId('combo-card')).toBeInTheDocument();
    } finally {
      process.off('unhandledRejection', swallow);
    }
  });

  it('NEVER EVEN STARTS the pointer scan when a PROMPT is withdrawn', async () => {
    // 🔴 THIS ASSERTS THE SCAN IS NOT STARTED, NOT MERELY THAT NOTHING WAS
    // DELETED. It used to assert only `deletes` — which stopped meaning
    // anything the moment the prompt surface stopped scanning at all: no scan
    // trivially implies no delete, so the guard would have gone vacuous exactly
    // when the behaviour it describes was introduced. The claim that matters now
    // is about COST, so it is measured in list calls.
    //
    // Why the cost is worth a guard: `clearDraftPointerFor` is a paged KV walk —
    // one `list` per page plus one `get` PER KEY, serially over the postMessage
    // bridge, with the withdraw button held in `loading` throughout. On the
    // prompts surface a match is impossible by construction (prompts are never
    // created from a draft), so that walk could only ever run to completion and
    // find nothing. It is declining a guaranteed-fruitless scan, not shaving a
    // rare path.
    const { shared, withdraws } = fakeShared({
      seed: [row('p1', 'My Prompt', VIEWER_ID, promptData)],
    });
    const { appStorage, deletes, store, listCalls } = fakeAppStorage({
      [draftKey(POINTER_LOCAL_ID)]: pointer,
    });
    renderApp({ shared, appStorage });

    await userEvent.click(await screen.findByRole('tab', { name: /Prompts/ }));
    // Baseline AFTER mount: the drafts panel legitimately lists the store once on
    // load, so the claim is that the WITHDRAW adds none — not that there are
    // zero. Counting from zero here would pin the mount effect instead.
    const draftLists = () => listCalls.filter((c) => c?.prefix === DRAFT_PREFIX).length;
    await waitFor(() => expect(draftLists()).toBeGreaterThan(0));
    const before = draftLists();

    const card = await screen.findByTestId('prompt-card');
    await userEvent.click(within(card).getByTestId('prompt-withdraw'));
    await userEvent.click(within(card).getByTestId('withdraw-confirm'));

    await waitFor(() => expect(withdraws).toEqual(['p1']));
    await waitFor(() => expect(screen.queryByTestId('prompt-card')).toBeNull());

    // 🔴 NOT ONE extra listing of the drafts prefix.
    expect(draftLists(), 'the prompt path started a pointer scan it can never win').toBe(before);
    // …and, still, an unrelated combination's pointer is not collateral damage.
    expect(deletes).toEqual([]);
    expect(store.get(draftKey(POINTER_LOCAL_ID))).toEqual(pointer);
  });

  it('🔴 leaves ANOTHER combination’s pointer alone when this one is withdrawn', async () => {
    // 🔴 THIS GUARD EXISTS BECAUSE A FIX ELSEWHERE BLINDED THE OLD ONE. The
    // `parsed.sharedKey !== sharedKey` match used to be pinned by the PROMPT
    // case: prompts shared the scanning code path, so dropping the match made a
    // prompt withdrawal eat a combination's pointer. Then the prompt surface
    // stopped scanning at all (a real latency fix — the scan could never win
    // there), and with it went the only thing killing that mutant: dropping the
    // match became invisible, 12/12 green.
    //
    // The lesson generalises past this file: a mutant killed by a test on
    // surface A is not covered once A stops exercising the code. RE-RUN THE
    // WHOLE MUTANT SET after any change that removes a caller, not just the
    // tests near your diff. So the match is now pinned where the scan actually
    // runs — two of the viewer's own combinations, a pointer at the SECOND, and
    // the FIRST withdrawn.
    const OTHER_KEY = 'mine2';
    const { shared, withdraws } = fakeShared({
      seed: [
        row(LIVE_KEY, 'Mine', VIEWER_ID, comboData),
        row(OTHER_KEY, 'Also mine', VIEWER_ID, comboData),
      ],
    });
    const otherPointer = { v: 1, localId: 'l2', sharedKey: OTHER_KEY, submittedAt: 'ts2' };
    const { appStorage, deletes, store } = fakeAppStorage({ [draftKey('l2')]: otherPointer });
    renderApp({ shared, appStorage });

    await screen.findByTestId('draft-submitted');
    const cards = await screen.findAllByTestId('combo-card');
    const target = cards.find((el) => el.getAttribute('data-key') === LIVE_KEY)!;
    await userEvent.click(within(target).getByTestId('combo-withdraw'));
    await userEvent.click(within(target).getByTestId('withdraw-confirm'));

    await waitFor(() => expect(withdraws).toEqual([LIVE_KEY]));
    await waitFor(() => expect(screen.queryByText('Mine')).toBeNull());

    // 🔴 The scan RAN on this surface and still deleted nothing: the pointer it
    // walked past belongs to a row that is still live.
    expect(deletes).toEqual([]);
    expect(store.get(draftKey('l2'))).toEqual(otherPointer);
    expect(screen.getByTestId('draft-submitted')).toBeInTheDocument();
  });

  it('🔴 SURVIVES a withdraw the host REFUSES WITHOUT THROWING ({ok: false})', async () => {
    // 🔴 THE SECOND FAILURE CHANNEL, and the one a `try/catch` story misses
    // entirely. `UseSharedStorage.withdraw` is typed
    // `Promise<{ok: boolean; deleted: boolean}>` — the ONLY SDK write whose `ok`
    // is `boolean` rather than the literal `true` (`appStorage.set` and
    // `.delete` are both `ok: true`, and so is `useTip`). That asymmetry is a
    // refusal the host can signal by RESOLVING, so awaiting the call and
    // discarding its result scores `{ok: false}` as success: the row stays on
    // the public board and the pointer — the viewer's only per-viewer handle on
    // a host-minted key with no "mine" index (docs/matchups.md §4) — is deleted
    // permanently. Unrecoverable, and silent.
    const { shared, withdraws } = fakeShared({
      seed: [row(LIVE_KEY, 'Mine', VIEWER_ID, comboData)],
      withdrawRefuses: true,
    });
    const { appStorage, deletes, store } = fakeAppStorage({ [draftKey(POINTER_LOCAL_ID)]: pointer });
    renderApp({ shared, appStorage });

    await screen.findByTestId('draft-submitted');
    const card = await screen.findByTestId('combo-card');
    await userEvent.click(within(card).getByTestId('combo-withdraw'));
    await userEvent.click(within(card).getByTestId('withdraw-confirm'));

    // The call DID happen and DID resolve (no throw) — so what follows is about
    // the refusal being honoured, not about a click that never landed.
    await waitFor(() => expect(withdraws).toEqual([LIVE_KEY]));

    // 🔴 THE POINTER IS UNTOUCHED, and the row is still on the board.
    expect(deletes).not.toContain(draftKey(POINTER_LOCAL_ID));
    expect(store.get(draftKey(POINTER_LOCAL_ID))).toEqual(pointer);
    expect(screen.getByTestId('draft-submitted')).toBeInTheDocument();
    expect(screen.getByTestId('combo-card')).toBeInTheDocument();
  });

  it('is found IN THE STORE even when the drafts list never resolved', async () => {
    // 🔴 A LOOKUP AGAINST RENDER STATE IS SILENTLY INERT HERE. The mount effect's
    // `list()` throws and the App swallows it deliberately (a KV failure must not
    // take the public board down), so `drafts` stays `[]` with nothing to retry
    // it — and a scan over that state finds no pointer, deletes nothing, and
    // never re-checks. Same empty list, same silence, from two more realistic
    // routes: withdrawing before the mount effect has resolved at all, and a
    // viewer with more drafts than `DRAFT_MAX_PAGES` pages. The pointer is real
    // in every one of them, which is why the lookup goes to the store.
    //
    // `failListTimes: 1` fails ONLY the mount effect's list; the withdraw-time
    // scan gets a working store. That is the discriminator: render state is
    // empty, the store is not.
    const { shared, withdraws } = fakeShared({
      seed: [row(LIVE_KEY, 'Mine', VIEWER_ID, comboData)],
    });
    const { appStorage, deletes, store, listCalls } = fakeAppStorage(
      { [draftKey(POINTER_LOCAL_ID)]: pointer },
      {},
      { failListTimes: 1, failListPrefix: DRAFT_PREFIX },
    );
    renderApp({ shared, appStorage });

    // POSITIVE CONTROL for the premise: the drafts panel is EMPTY, i.e. the
    // render state really did miss the pointer. Without this the test could pass
    // with a fully-loaded list and prove nothing about the store lookup.
    await screen.findByTestId('drafts-empty');
    expect(screen.queryByTestId('draft-submitted')).toBeNull();
    // …and the drafts listing really was the one that failed. Without this the
    // premise is unproven: the App issues TWO prefixed listings on mount and the
    // INFLIGHT one goes first, so an untargeted failure eats the wrong call and
    // the drafts load normally. That is not hypothetical — it is what the first
    // version of this test did, and this control is what caught it.
    expect(listCalls.map((c) => c?.prefix)).toContain(DRAFT_PREFIX);

    const card = await screen.findByTestId('combo-card');
    await userEvent.click(within(card).getByTestId('combo-withdraw'));
    await userEvent.click(within(card).getByTestId('withdraw-confirm'));

    await waitFor(() => expect(withdraws).toEqual([LIVE_KEY]));
    // 🔴 Deleted anyway — the pointer was found in the STORE.
    await waitFor(() => expect(deletes).toContain(draftKey(POINTER_LOCAL_ID)));
    expect(store.has(draftKey(POINTER_LOCAL_ID))).toBe(false);
  });

  it('is found when it sits on the SECOND page of the viewer’s draft keys', async () => {
    // 🔴 THE PAGING LOOP WAS ENTIRELY UNCOVERED. `fakeAppStorage.list` used to
    // return every matching key in one page and NEVER a `nextCursor`, so every
    // caller broke out after page 1 and the `cursor = res.nextCursor` line was
    // dead code as far as the suite was concerned — an altering mutant replacing
    // it with `cursor = undefined` passed the FULL SUITE, 234/234 green. That is
    // not a hypothetical gap: a viewer whose `draft:v1:` keys span more than one
    // host page is one of the three reasons this lookup reads the store at all,
    // and without paging they would get exactly the orphan it exists to remove.
    //
    // `pageSize: 2` with the pointer THIRD forces at least one `nextCursor`
    // round-trip before the match.
    const { shared, withdraws } = fakeShared({
      seed: [row(LIVE_KEY, 'Mine', VIEWER_ID, comboData)],
    });
    const filler = (n: number) => ({
      v: 1,
      localId: `pad${n}`,
      name: `Padding ${n}`,
      description: '',
      configs: comboData.configs,
      updatedAt: '2026-08-30T00:00:00.000Z',
    });
    const { appStorage, deletes, store, listCalls } = fakeAppStorage(
      {
        // Insertion order is the fake's key order, so the pointer is on page 2.
        [draftKey('pad1')]: filler(1),
        [draftKey('pad2')]: filler(2),
        [draftKey(POINTER_LOCAL_ID)]: pointer,
        [draftKey('pad3')]: filler(3),
      },
      {},
      { pageSize: 2 },
    );
    renderApp({ shared, appStorage });

    await screen.findByTestId('draft-submitted');
    const card = await screen.findByTestId('combo-card');
    await userEvent.click(within(card).getByTestId('combo-withdraw'));
    await userEvent.click(within(card).getByTestId('withdraw-confirm'));

    await waitFor(() => expect(withdraws).toEqual([LIVE_KEY]));
    await waitFor(() => expect(deletes).toContain(draftKey(POINTER_LOCAL_ID)));
    expect(store.has(draftKey(POINTER_LOCAL_ID))).toBe(false);

    // 🔴 POSITIVE CONTROL ON THE PREMISE: paging actually happened. Without this
    // the case passes just as well against a one-page fake and proves nothing
    // about the cursor. A cursored drafts listing is a listing that could only
    // have come from following `nextCursor`.
    const draftCalls = listCalls.filter((c) => c?.prefix === DRAFT_PREFIX);
    expect(draftCalls.length).toBeGreaterThan(1);
    expect(
      draftCalls.some((c) => typeof c?.cursor === 'string' && c.cursor.length > 0),
      'no drafts listing ever carried a cursor — the fixture never paged',
    ).toBe(true);
    // …and the untouched padding is still there, so the scan stopped at its match.
    expect(store.has(draftKey('pad3'))).toBe(true);
  });
});

describe('withdraw: the list reconciles', () => {
  it('keeps the row gone across the post-withdraw re-fetch, even when list() still returns it', async () => {
    // list() NEVER stops returning the withdrawn row (read-after-write lag), so
    // only the optimistic DELETE reconcile can keep it off screen — a plain local
    // filter would be wiped by the very next list().
    const { shared, withdraws, listCalls } = fakeShared({
      reflectMutations: false,
      seed: [row('mine', 'Mine', VIEWER_ID, comboData)],
    });
    renderApp({ shared });

    const card = await screen.findByTestId('combo-card');
    await userEvent.click(within(card).getByTestId('combo-withdraw'));
    const listsBefore = listCalls.length;
    await userEvent.click(within(card).getByTestId('withdraw-confirm'));

    await waitFor(() => expect(screen.queryByTestId('combo-card')).toBeNull());
    expect(withdraws).toEqual(['mine']);

    // Wait for the reload's list() to actually LAND (it re-serves the row) and
    // only then assert the card is still gone — otherwise this asserts nothing
    // but timing luck.
    await waitFor(() => expect(listCalls.length).toBeGreaterThan(listsBefore));
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId('combo-card')).toBeNull();
  });
});
