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
import { draftKey } from './lib/drafts.js';
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

  it('touches NO draft when a PROMPT is withdrawn (the same handler serves both views)', async () => {
    // `withdrawRow` is wired to onWithdraw on BOTH CombosView and PromptsView.
    // Prompts have no drafts at all, and a prompt's host-minted key matches no
    // pointer — so the per-viewer store must not be written to at all.
    const { shared, withdraws } = fakeShared({
      seed: [row('p1', 'My Prompt', VIEWER_ID, promptData)],
    });
    const { appStorage, deletes, store } = fakeAppStorage({ [draftKey(POINTER_LOCAL_ID)]: pointer });
    renderApp({ shared, appStorage });

    await userEvent.click(await screen.findByRole('tab', { name: /Prompts/ }));
    const card = await screen.findByTestId('prompt-card');
    await userEvent.click(within(card).getByTestId('prompt-withdraw'));
    await userEvent.click(within(card).getByTestId('withdraw-confirm'));

    await waitFor(() => expect(withdraws).toEqual(['p1']));
    await waitFor(() => expect(screen.queryByTestId('prompt-card')).toBeNull());
    // An unrelated combination's pointer is not collateral damage.
    expect(deletes).toEqual([]);
    expect(store.get(draftKey(POINTER_LOCAL_ID))).toEqual(pointer);
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
