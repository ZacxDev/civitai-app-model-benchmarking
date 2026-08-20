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
import type { SharedListItem } from '@civitai/blocks-react';

import { App, type AppDeps } from './App.js';
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
