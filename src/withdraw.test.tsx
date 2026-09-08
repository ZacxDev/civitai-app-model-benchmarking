// Withdraw (issue #10): a contributor removes their OWN row from the shared grid.
// `useSharedStorage().withdraw` was implemented, scoped and documented — and
// wired to nothing, so a submitted combo/prompt was permanent as far as the UI
// was concerned. These drive the real App through the affordance:
//   - the author CAN withdraw their own combination / prompt (and only after a
//     confirm step — a single click never removes anything),
//   - a NON-author gets no withdraw affordance at all (the ownership guard),
//   - the list RECONCILES: the row stays gone even when list() still returns it
//     (read-after-write lag), exactly like the optimistic insert on submit.

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Harness } from '@civitai/blocks-react/testing';
import type { SharedListItem, UseSharedStorage } from '@civitai/blocks-react';

import { App, type AppDeps } from './App.js';
import { DRAFT_PREFIX, draftKey } from './lib/drafts.js';
import { UNPUB_PROMPT_PREFIX, unpubPromptKey } from './lib/unpubPrompts.js';
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

    const card = await screen.findByTestId('matchup-card');
    await userEvent.click(within(card).getByTestId('matchup-withdraw'));

    // Confirm-before-firing: the trigger alone must NOT have withdrawn anything.
    expect(withdraws).toEqual([]);
    await userEvent.click(within(card).getByTestId('withdraw-confirm'));

    await waitFor(() => expect(screen.queryByTestId('matchup-card')).toBeNull());
    expect(withdraws).toEqual(['mine']);
  });

  it('does nothing when the confirm step is cancelled', async () => {
    const { shared, withdraws } = fakeShared({ seed: [row('mine', 'Mine', VIEWER_ID, comboData)] });
    renderApp({ shared });

    const card = await screen.findByTestId('matchup-card');
    await userEvent.click(within(card).getByTestId('matchup-withdraw'));
    await userEvent.click(within(card).getByTestId('withdraw-cancel'));

    expect(withdraws).toEqual([]);
    const still = screen.getByTestId('matchup-card');
    expect(still).toHaveTextContent('Mine');
    // Back to the un-armed trigger, so the affordance is reusable.
    expect(within(still).getByTestId('matchup-withdraw')).toBeInTheDocument();
    expect(within(still).queryByTestId('withdraw-confirm')).toBeNull();
  });
});

describe('withdraw: the ownership guard', () => {
  it('offers NO withdraw affordance on another contributor’s combination', async () => {
    const { shared, withdraws } = fakeShared({
      seed: [row('mine', 'Mine', VIEWER_ID, comboData), row('theirs', 'Theirs', OTHER_ID, comboData)],
    });
    renderApp({ shared });

    const cards = await screen.findAllByTestId('matchup-card');
    expect(cards).toHaveLength(2);
    const mine = cards.find((el) => within(el).queryByText('Mine'))!;
    const theirs = cards.find((el) => within(el).queryByText('Theirs'))!;

    // The viewer's own row HAS the control — so the absence below is a guard
    // decision, not a control that simply never renders.
    expect(within(mine).getByTestId('matchup-withdraw')).toBeInTheDocument();
    // 🔴 THE OWNERSHIP GUARD: someone else's row carries no withdraw control, and
    // no armed confirm behind it either.
    expect(within(theirs).queryByTestId('matchup-withdraw')).toBeNull();
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
// Withdrawing a row the viewer PUBLISHED FROM A PRIVATE RECORD: the pointer must
// go with it, but ONLY on success.
// ---------------------------------------------------------------------------
//
// ⚠️ 527 CHANGED TWO PREMISES HERE, AND BOTH ARE LOAD-BEARING BELOW:
//   1. The pointer is no longer RENDERED. The old drafts panel drew a
//      "Submitted / Live on the board" card per pointer; the My tab reaches a
//      published row through `isOwnRow` instead (§11.1), so every assertion that
//      used to read `draft-submitted` off the screen now reads the STORE — which
//      is what the guard was always about.
//   2. Prompts now HAVE pointers. `withdrawPrompt` used to skip the sweep because
//      a prompt could not have one; it sweeps `unpub:prompt:v1:` now, and the
//      cases below pin BOTH halves — it does not touch the matchup prefix, and it
//      does clear its own.
//
// 🔴 THE DEFECT. Publish rewrites a private record to a POINTER — `{localId,
// sharedKey, submittedAt}` — and DROPS the editable body (see `publishedPointer`).
// Withdraw the row it points at and the pointer is left asserting a board entry
// that does not exist, still consuming a quota row, with nothing left to restore.
// So the pointer is deleted rather than tombstoned.
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
//
// UPDATE (audit round 3). One case added — "THE PREMISE: submitting a PROMPT
// writes no draft key" — and it is GREEN AT BASE, deliberately. It is a TIE, not
// regression coverage: it pins the unstated assumption that makes
// `clearPointer: false` safe on the prompt surface.
//
//   M13 make `submitPrompt` write a draft pointer
//       -> "THE PREMISE" fails: the prompt submit path wrote a draft pointer —
//          withdrawPrompt would now orphan it                  (1 failed | 13 passed)
//
// 🔴 READ M13's OTHER RESULT, WHICH IS THE POINT OF THE TIE: under M13 the
// "NEVER EVEN STARTS the pointer scan" case STAYS GREEN. It would be happily
// enforcing a bug — prompts with pointers, and a withdraw path that skips them.
// A guard that asserts an optimisation is correct is only as good as the premise
// that makes the optimisation safe, and that premise needs its own pin.
const LIVE_KEY = 'mine';
const POINTER_LOCAL_ID = 'l1';
const pointer = { v: 1, localId: POINTER_LOCAL_ID, sharedKey: LIVE_KEY, submittedAt: '2026-08-30T00:00:00.000Z' };

describe('withdraw: the pointer at the withdrawn row', () => {
  it('is DELETED once the host confirms the withdraw', async () => {
    const { shared, withdraws } = fakeShared({
      seed: [row(LIVE_KEY, 'Mine', VIEWER_ID, comboData)],
    });
    const { appStorage, deletes, store } = fakeAppStorage({ [draftKey(POINTER_LOCAL_ID)]: pointer });
    renderApp({ shared, appStorage });

    // The orphan-to-be is in the STORE first, so its absence below is the fix
    // acting and not a key that was never there. (527: pointers are storage, not
    // a rendered card — see the block comment above.)
    expect(store.has(draftKey(POINTER_LOCAL_ID))).toBe(true);

    const card = await screen.findByTestId('matchup-card');
    await userEvent.click(within(card).getByTestId('matchup-withdraw'));
    await userEvent.click(within(card).getByTestId('withdraw-confirm'));

    await waitFor(() => expect(withdraws).toEqual([LIVE_KEY]));
    // The per-viewer KV really was told to drop the pointer…
    await waitFor(() => expect(deletes).toContain(draftKey(POINTER_LOCAL_ID)));
    // …and the key is gone from the store (so it stops costing a quota row).
    expect(store.has(draftKey(POINTER_LOCAL_ID))).toBe(false);
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
      expect(store.has(draftKey(POINTER_LOCAL_ID))).toBe(true);

      const card = await screen.findByTestId('matchup-card');
      await userEvent.click(within(card).getByTestId('matchup-withdraw'));
      await userEvent.click(within(card).getByTestId('withdraw-confirm'));

      // The app DID try — so the assertions below are about what happened after
      // the failure, not about a click that never landed.
      await waitFor(() => expect(withdraws).toEqual([LIVE_KEY]));

      // 🔴 THE POINTER IS UNTOUCHED.
      expect(deletes).not.toContain(draftKey(POINTER_LOCAL_ID));
      expect(store.get(draftKey(POINTER_LOCAL_ID))).toEqual(pointer);
      // …and the row it points at is still on the public board.
      expect(screen.getByTestId('matchup-card')).toBeInTheDocument();
    } finally {
      process.off('unhandledRejection', swallow);
    }
  });

  it('sweeps the PROMPT prefix — and never the matchup one — when a PROMPT is withdrawn', async () => {
    // 🔴 THE PREMISE THIS CASE USED TO ENFORCE IS DEAD, AND THAT IS THE POINT.
    // It asserted the prompt surface started NO pointer scan, which was correct
    // while prompts had no unpublished form: a match was impossible by
    // construction, so the paged KV walk could only ever run to completion and
    // find nothing. 527 gave prompts their own private store, and keeping the
    // old assertion would have enforced a bug — every published-then-withdrawn
    // prompt leaving its pointer orphaned, with a green test saying so on purpose.
    //
    // The claim now has two halves, and both are asserted because either alone is
    // walkable: the sweep runs on the PROMPT prefix (so the prompt's own pointer
    // goes) and NOT on the matchup prefix (so a matchup pointer is not collateral
    // damage, and the surfaces stay disjoint).
    // 🔴 THE COST HALF IS MEASURED WITH NO PROMPT POINTER IN THE STORE, on
    // purpose. A sweep that finds its match calls `refreshDrafts()`, which
    // re-lists EVERY prefix — so with a match present the matchup prefix is
    // listed again for a reason that has nothing to do with sweeping it, and the
    // count can no longer tell the two apart. With nothing to match, any listing
    // of the matchup prefix after the withdraw could only be a sweep.
    const PROMPT_KEY = 'p1';
    const { shared, withdraws } = fakeShared({
      seed: [row(PROMPT_KEY, 'My Prompt', VIEWER_ID, promptData)],
    });
    const { appStorage, deletes, store, listCalls } = fakeAppStorage({
      [draftKey(POINTER_LOCAL_ID)]: pointer,
    });
    renderApp({ shared, appStorage });

    await userEvent.click(await screen.findByRole('tab', { name: /Prompts/ }));
    // Baseline AFTER mount: the My-tab load legitimately lists both prefixes once
    // on load, so the claim is that the WITHDRAW adds none to the MATCHUP prefix —
    // not that there are zero. Counting from zero here would pin the mount effect.
    const listsOf = (prefix: string) => listCalls.filter((c) => c?.prefix === prefix).length;
    await waitFor(() => expect(listsOf(DRAFT_PREFIX)).toBeGreaterThan(0));
    const draftsBefore = listsOf(DRAFT_PREFIX);
    const promptsBefore = listsOf(UNPUB_PROMPT_PREFIX);

    const card = await screen.findByTestId('prompt-card');
    await userEvent.click(within(card).getByTestId('prompt-withdraw'));
    await userEvent.click(within(card).getByTestId('withdraw-confirm'));

    await waitFor(() => expect(withdraws).toEqual([PROMPT_KEY]));
    await waitFor(() => expect(screen.queryByTestId('prompt-card')).toBeNull());

    // 🔴 POSITIVE CONTROL: a sweep DID run, on the PROMPT prefix. Without it the
    // "no matchup listing" assertion below is satisfied by a withdraw that swept
    // nothing at all — which is exactly the pre-527 behaviour this case retires.
    await waitFor(() =>
      expect(
        listsOf(UNPUB_PROMPT_PREFIX),
        'the prompt withdraw swept nothing — its own pointers would be orphaned',
      ).toBeGreaterThan(promptsBefore),
    );

    // 🔴 NOT ONE extra listing of the MATCHUP prefix, and the matchup pointer is
    // untouched: a prompt withdraw can never reach a matchup's handle.
    expect(
      listsOf(DRAFT_PREFIX),
      'the prompt path swept the matchup prefix it can never match',
    ).toBe(draftsBefore);
    expect(deletes).toEqual([]);
    expect(store.get(draftKey(POINTER_LOCAL_ID))).toEqual(pointer);
  });

  it('🔴 DELETES the prompt’s OWN pointer when that prompt is withdrawn', async () => {
    // The other half of the case above, and the one that would silently orphan:
    // 527 gave prompts a private store, so a published-then-withdrawn prompt
    // leaves a pointer at a row that no longer exists unless the sweep clears it.
    const PROMPT_KEY = 'p1';
    const promptPointer = {
      v: 1,
      localId: 'up1',
      sharedKey: PROMPT_KEY,
      submittedAt: '2026-09-07T00:00:00.000Z',
    };
    const { shared, withdraws } = fakeShared({
      seed: [row(PROMPT_KEY, 'My Prompt', VIEWER_ID, promptData)],
    });
    const { appStorage, deletes, store } = fakeAppStorage({
      [draftKey(POINTER_LOCAL_ID)]: pointer,
      [unpubPromptKey('up1')]: promptPointer,
    });
    renderApp({ shared, appStorage });

    await userEvent.click(await screen.findByRole('tab', { name: /Prompts/ }));
    expect(store.has(unpubPromptKey('up1'))).toBe(true);

    const card = await screen.findByTestId('prompt-card');
    await userEvent.click(within(card).getByTestId('prompt-withdraw'));
    await userEvent.click(within(card).getByTestId('withdraw-confirm'));

    await waitFor(() => expect(withdraws).toEqual([PROMPT_KEY]));
    await waitFor(() => expect(deletes).toContain(unpubPromptKey('up1')));
    expect(store.has(unpubPromptKey('up1'))).toBe(false);
    // …and the unrelated MATCHUP pointer is not collateral damage.
    expect(deletes).not.toContain(draftKey(POINTER_LOCAL_ID));
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

    expect(store.has(draftKey('l2'))).toBe(true);
    const cards = await screen.findAllByTestId('matchup-card');
    const target = cards.find((el) => el.getAttribute('data-key') === LIVE_KEY)!;
    await userEvent.click(within(target).getByTestId('matchup-withdraw'));
    await userEvent.click(within(target).getByTestId('withdraw-confirm'));

    await waitFor(() => expect(withdraws).toEqual([LIVE_KEY]));
    await waitFor(() => expect(screen.queryByText('Mine')).toBeNull());

    // 🔴 The scan RAN on this surface and still deleted nothing: the pointer it
    // walked past belongs to a row that is still live.
    expect(deletes).toEqual([]);
    expect(store.get(draftKey('l2'))).toEqual(otherPointer);
  });

  it('🔴 THE PREMISE: the DIRECT prompt submit writes no per-viewer key under either prefix', async () => {
    // 🔴 THIS PINS WHICH PATHS MINT A POINTER AT ALL, and nothing else in the
    // suite does. There are two ways a prompt reaches the board: PUBLISH from the
    // private store (which writes a pointer under `unpub:prompt:v1:` — swept by
    // `withdrawPrompt`, pinned two cases up), and the DIRECT "Submit prompt"
    // form, which appends and writes nothing per-viewer at all.
    //
    // The direct path writing a key under EITHER prefix would be a silent orphan:
    // under the matchup prefix a prompt withdraw would never sweep it, and under
    // neither would it be reachable for edit. That is why this asserts both.
    const { shared, appends } = fakeShared({ seed: [] });
    const { appStorage, sets } = fakeAppStorage();
    renderApp({ shared, appStorage });

    await userEvent.click(await screen.findByRole('tab', { name: /Prompts/ }));
    await userEvent.click(await screen.findByTestId('submit-prompt'));
    const form = await screen.findByTestId('prompt-form');
    fireEvent.change(within(form).getByTestId('prompt-name'), {
      target: { value: 'A public prompt' },
    });
    fireEvent.change(within(form).getByTestId('prompt-default-text'), {
      target: { value: 'a landscape at dusk' },
    });
    await userEvent.click(within(form).getByTestId('prompt-submit'));

    // POSITIVE CONTROL: the submit actually happened. Without this the
    // assertion below is satisfied by a form that never submitted.
    await waitFor(() => expect(appends).toHaveLength(1));
    expect(appends[0].title).toBe('A public prompt');

    // 🔴 …and it wrote NO per-viewer key under EITHER unpublished prefix.
    expect(
      sets.map((s) => s.key).filter((k) => k.startsWith(DRAFT_PREFIX)),
      'the direct prompt submit wrote a MATCHUP pointer — no prompt withdraw would ever sweep it',
    ).toEqual([]);
    expect(
      sets.map((s) => s.key).filter((k) => k.startsWith(UNPUB_PROMPT_PREFIX)),
      'the direct prompt submit wrote a private prompt record it never created',
    ).toEqual([]);
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

    expect(store.has(draftKey(POINTER_LOCAL_ID))).toBe(true);
    const card = await screen.findByTestId('matchup-card');
    await userEvent.click(within(card).getByTestId('matchup-withdraw'));
    await userEvent.click(within(card).getByTestId('withdraw-confirm'));

    // The call DID happen and DID resolve (no throw) — so what follows is about
    // the refusal being honoured, not about a click that never landed.
    await waitFor(() => expect(withdraws).toEqual([LIVE_KEY]));

    // 🔴 THE POINTER IS UNTOUCHED, and the row is still on the board.
    expect(deletes).not.toContain(draftKey(POINTER_LOCAL_ID));
    expect(store.get(draftKey(POINTER_LOCAL_ID))).toEqual(pointer);
    expect(screen.getByTestId('matchup-card')).toBeInTheDocument();
  });

  it('is found IN THE STORE even when the per-viewer list never resolved', async () => {
    // 🔴 A LOOKUP AGAINST RENDER STATE IS SILENTLY INERT HERE. The mount effect's
    // `list()` throws and the App swallows it deliberately (a KV failure must not
    // take the public board down), so `drafts` stays `[]` with nothing to retry
    // it — and a scan over that state finds no pointer, deletes nothing, and
    // never re-checks. Same empty list, same silence, from two more realistic
    // routes: withdrawing before the mount effect has resolved at all, and a
    // viewer with more records than `KV_MAX_PAGES` pages. The pointer is real
    // in every one of them, which is why the lookup goes to the store.
    //
    // `failListTimes: 1` fails ONLY the mount effect's list; the withdraw-time
    // scan gets a working store. That is the discriminator: render state is
    // empty, the store is not.
    //
    // ⚠️ 527 COST THIS CASE ITS OLD POSITIVE CONTROL and it is rebuilt here
    // rather than dropped. It used to prove "render state missed it" by finding
    // `drafts-empty` on screen while a POINTER sat in the store — but pointers no
    // longer render at all, so that observation would now be true whatever the
    // listing did, i.e. vacuous. The store therefore also holds an UNSUBMITTED
    // record, which the My tab WOULD render: seeing `unpublished-empty` with that
    // record in the store is what proves the render state really is blind.
    const BODY_LOCAL_ID = 'body1';
    const unsubmitted = {
      v: 1,
      localId: BODY_LOCAL_ID,
      name: 'Not published yet',
      description: '',
      configs: comboData.configs,
      updatedAt: '2026-09-07T00:00:00.000Z',
    };
    const { shared, withdraws } = fakeShared({
      seed: [row(LIVE_KEY, 'Mine', VIEWER_ID, comboData)],
    });
    const { appStorage, deletes, store, listCalls } = fakeAppStorage(
      { [draftKey(POINTER_LOCAL_ID)]: pointer, [draftKey(BODY_LOCAL_ID)]: unsubmitted },
      {},
      { failListTimes: 1, failListPrefix: DRAFT_PREFIX },
    );
    renderApp({ shared, appStorage });

    // POSITIVE CONTROL for the premise: the My tab shows NOTHING unpublished even
    // though the store holds a renderable unsubmitted record — i.e. the render
    // state really did miss the store. Without this the test could pass with a
    // fully-loaded list and prove nothing about the store lookup.
    await userEvent.click(await screen.findByTestId('subtab-my'));
    await screen.findByTestId('unpublished-empty');
    expect(store.has(draftKey(BODY_LOCAL_ID))).toBe(true);
    expect(screen.queryByTestId('unpublished-card')).toBeNull();
    // …and the matchup listing really was the one that failed. Without this the
    // premise is unproven: the App issues several prefixed listings on mount and
    // the INFLIGHT one goes first, so an untargeted failure eats the wrong call
    // and the records load normally. That is not hypothetical — it is what the
    // first version of this test did, and this control is what caught it.
    expect(listCalls.map((c) => c?.prefix)).toContain(DRAFT_PREFIX);
    await userEvent.click(screen.getByTestId('subtab-community'));

    const card = await screen.findByTestId('matchup-card');
    await userEvent.click(within(card).getByTestId('matchup-withdraw'));
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

    expect(store.has(draftKey(POINTER_LOCAL_ID))).toBe(true);
    const card = await screen.findByTestId('matchup-card');
    await userEvent.click(within(card).getByTestId('matchup-withdraw'));
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

    const card = await screen.findByTestId('matchup-card');
    await userEvent.click(within(card).getByTestId('matchup-withdraw'));
    const listsBefore = listCalls.length;
    await userEvent.click(within(card).getByTestId('withdraw-confirm'));

    await waitFor(() => expect(screen.queryByTestId('matchup-card')).toBeNull());
    expect(withdraws).toEqual(['mine']);

    // Wait for the reload's list() to actually LAND (it re-serves the row) and
    // only then assert the card is still gone — otherwise this asserts nothing
    // but timing luck.
    await waitFor(() => expect(listCalls.length).toBeGreaterThan(listsBefore));
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId('matchup-card')).toBeNull();
  });
});
