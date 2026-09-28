// End-to-end component flows against the real transports (`src/test-harness.tsx`):
// submit a combination, submit a multi-ecosystem prompt, vote, and run a cell →
// publish → grid-append.
//
// 🔴 THE BASE PROTOCOL NOW COMES FROM TWO PLACES, and this file is the one that
// depends on both. The mock host serves viewer, consent, the resource picker and
// the workflow money path over postMessage; SHARED STORAGE AND THE BUZZ BALANCE
// are HTTP now and come from `src/dev-rest.ts`. `opts.seed` therefore seeds the
// REST fake, not the host — which is why it is typed against the fake. Only the
// poll clock and the resource resolve are injected via `deps`; unlike almost every
// other file in this suite, per-viewer app storage is NOT injected here either, so
// this is the case that drives the real `blocks/app-storage/*` round-trips.

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Harness, type TestHarnessProps } from './test-harness.js';
import type { RestSharedSeed } from './dev-rest.js';
import type { SharedItem } from '@civitai/sdk';
import type { SharedStore } from './lib/sdk-runtime.js';

import { App, type AppDeps } from './App.js';
import type { CombinationData, PromptData } from './types.js';
import { CKPT_SDXL, LORA_SDXL, immediateSleep, openView } from './test-helpers.js';

const comboSeed: CombinationData = {
  v: 2,
  kind: 'combination',
  configs: [
    {
      id: 'cfgSeed',
      checkpoint: { versionId: 1001, modelId: 500, baseModel: 'SDXL 1.0', modelName: 'JuggernautXL' },
      loras: [{ versionId: 2002, weight: 0.8, minStrength: 0, maxStrength: 1.5, modelName: 'Detail Tweaker' }],
    },
  ],
};
const promptSeed: PromptData = {
  v: 3,
  kind: 'prompt',
  default: { prompt: 'cyberpunk portrait', params: { cfgScale: 5, steps: 30 } },
};

// NOTE: publish + gated-image reads flow through the REAL bridge hooks
// (usePublishGenerationOutputs / useGatedImages) → the mock host — NOT injected
// fakes — so the tests exercise the real hook→message→host shapes and would
// catch a shape drift. Only the poll clock + resource resolve are seamed.
function renderApp(
  opts: { seed?: RestSharedSeed[]; deps?: Partial<AppDeps>; harness?: Partial<TestHarnessProps> } = {},
) {
  const deps: Partial<AppDeps> = {
    resolveResources: async () => [],
    pollIntervalMs: 0,
    sleep: immediateSleep,
    ...opts.deps,
  };
  render(
    <Harness
      viewer={{ id: 99, username: 'me' }}
      theme="dark"
      consentGranted
      buzzBudget={1000}
      buzz={{ balance: 5000 }}
      buzzBalance={{ blue: 0, green: 0, yellow: 5000 }}
      generation={{ costPerGen: 12, images: ['https://image.civitai.com/e2e-out.jpeg'] }}
      cannedPicks={{ Checkpoint: CKPT_SDXL, LORA: LORA_SDXL }}
      shared={{ seed: opts.seed ?? [] }}
      showLog={false}
      {...opts.harness}
    >
      <App deps={deps} />
    </Harness>,
  );
  return deps;
}

describe('submit a combination', () => {
  it('picks a checkpoint + LoRA and publishes it to shared storage', async () => {
    renderApp();
    await openView('Matchups');
    await userEvent.click(await screen.findByTestId('submit-matchup'));
    const form = await screen.findByTestId('matchup-form');
    await userEvent.type(within(form).getByTestId('matchup-name'), 'My SDXL Combo');
    await userEvent.click(within(form).getByTestId('pick-checkpoint'));
    await waitFor(() => expect(within(form).getByTestId('checkpoint-name')).toHaveTextContent('JuggernautXL'));
    // ecosystem is derived + shown
    expect(within(form).getByTestId('checkpoint-name')).toHaveTextContent('SDXL');
    await userEvent.click(within(form).getByTestId('add-lora'));
    await waitFor(() => expect(within(form).getByTestId('lora-row')).toBeInTheDocument());
    await userEvent.click(within(form).getByTestId('matchup-submit'));

    const card = await screen.findByTestId('matchup-card');
    expect(card).toHaveTextContent('My SDXL Combo');
    expect(within(card).getByTestId('matchup-included')).toBeInTheDocument();
  });
});

describe('submit a prompt (default + a per-ecosystem override)', () => {
  it('fills the default prompt, adds a Pony override, and publishes both', async () => {
    renderApp();
    // switch to the prompts tab
    await screen.findByTestId('section-prompts');
    await userEvent.click(await screen.findByTestId('submit-prompt'));
    const form = await screen.findByTestId('prompt-form');
    await userEvent.type(within(form).getByTestId('prompt-name'), 'Portrait Test');

    // The DEFAULT prompt (applies to every ecosystem).
    fireEvent.change(within(form).getByTestId('prompt-default-text'), {
      target: { value: 'default cyberpunk portrait' },
    });

    // Add a Pony override (its prompt pre-fills from the default; then edit it).
    await userEvent.selectOptions(within(form).getByTestId('prompt-add-override-select'), 'Pony');
    await userEvent.click(within(form).getByTestId('prompt-add-override'));
    const ponyOverride = await within(form).findByTestId('prompt-override-entry');
    fireEvent.change(within(ponyOverride).getByTestId('prompt-override-text'), {
      target: { value: 'score_9 portrait' },
    });

    await userEvent.click(within(form).getByTestId('prompt-submit'));

    const card = await screen.findByTestId('prompt-card');
    expect(card).toHaveTextContent('Portrait Test');
    // One Default badge (all ecosystems) + one override (Pony) badge.
    expect(within(card).getByTestId('prompt-default-badge')).toBeInTheDocument();
    expect(within(card).getAllByTestId('prompt-override-badge')).toHaveLength(1);
  });
});

describe('edit-in-place: the author edits their OWN combination', () => {
  it('updates the row in place (same card, new name) — no duplicate, and only the author sees Edit', async () => {
    renderApp({
      seed: [
        // authored by the viewer (id 99) → editable
        { value: { title: 'Mine', body: '', data: comboSeed }, authorUserId: 99, voters: [1, 2, 3] },
        // authored by someone else → NOT editable
        { value: { title: 'Theirs', body: '', data: comboSeed }, authorUserId: 7, voters: [1] },
      ],
    });

    await openView('Matchups');
    const cards = await screen.findAllByTestId('matchup-card');
    expect(cards).toHaveLength(2);
    const mine = cards.find((el) => within(el).queryByText('Mine'))!;
    const theirs = cards.find((el) => within(el).queryByText('Theirs'))!;
    // Author-scoped affordance: Edit only on the viewer's own row.
    expect(within(mine).getByTestId('matchup-edit')).toBeInTheDocument();
    expect(within(theirs).queryByTestId('matchup-edit')).toBeNull();

    // Open the edit form (prefilled), rename, save.
    await userEvent.click(within(mine).getByTestId('matchup-edit'));
    const form = await screen.findByTestId('matchup-form');
    const nameInput = within(form).getByTestId('matchup-name') as HTMLInputElement;
    expect(nameInput.value).toBe('Mine'); // prefilled from the stored row
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Mine (edited)');
    await userEvent.click(within(form).getByTestId('matchup-submit'));

    // Still exactly two cards (in-place update, NOT an append) and the name changed.
    await waitFor(() => expect(screen.getByText('Mine (edited)')).toBeInTheDocument());
    expect(screen.getAllByTestId('matchup-card')).toHaveLength(2);
    expect(screen.queryByText('Mine')).toBeNull();
  });
});

describe('edit-in-place: the author edits their OWN prompt', () => {
  it('updates the prompt row in place (same card, new name)', async () => {
    renderApp({ seed: [{ value: { title: 'My Prompt', body: '[SDXL] x', data: promptSeed }, authorUserId: 99, voters: [1] }] });
    await screen.findByTestId('section-prompts');
    const card = await screen.findByTestId('prompt-card');
    await userEvent.click(within(card).getByTestId('prompt-edit'));
    const form = await screen.findByTestId('prompt-form');
    const nameInput = within(form).getByTestId('prompt-name') as HTMLInputElement;
    expect(nameInput.value).toBe('My Prompt');
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'My Prompt v2');
    await userEvent.click(within(form).getByTestId('prompt-submit'));
    await waitFor(() => expect(screen.getByText('My Prompt v2')).toBeInTheDocument());
    expect(screen.getAllByTestId('prompt-card')).toHaveLength(1);
  });
});

describe('withdraw: the author removes their OWN combination (real SHARED_WITHDRAW → mock host)', () => {
  it('removes the row from the shared store and leaves everyone else’s alone', async () => {
    renderApp({
      seed: [
        { value: { title: 'Mine', body: '', data: comboSeed }, authorUserId: 99, voters: [1, 2, 3] },
        { value: { title: 'Theirs', body: '', data: comboSeed }, authorUserId: 7, voters: [1] },
      ],
    });

    await openView('Matchups');
    const cards = await screen.findAllByTestId('matchup-card');
    expect(cards).toHaveLength(2);
    const mine = cards.find((el) => within(el).queryByText('Mine'))!;
    const theirs = cards.find((el) => within(el).queryByText('Theirs'))!;
    // Author-scoped affordance: Remove only on the viewer's own row.
    expect(within(mine).getByTestId('matchup-withdraw')).toBeInTheDocument();
    expect(within(theirs).queryByTestId('matchup-withdraw')).toBeNull();

    // Confirm-before-firing: arming the control alone removes nothing.
    await userEvent.click(within(mine).getByTestId('matchup-withdraw'));
    expect(screen.getAllByTestId('matchup-card')).toHaveLength(2);
    await userEvent.click(within(mine).getByTestId('withdraw-confirm'));

    // The withdraw went through the REAL hook → SHARED_WITHDRAW → mock host, so
    // the row is gone from the store's own list(), not just from local state.
    await waitFor(() => expect(screen.getAllByTestId('matchup-card')).toHaveLength(1));
    expect(screen.getByTestId('matchup-card')).toHaveTextContent('Theirs');
    expect(screen.queryByText('Mine')).toBeNull();
  });
});

describe('vote on a combination', () => {
  it('increments the vote count through the shared store', async () => {
    renderApp({ seed: [{ value: { title: 'Votable Combo', body: '', data: comboSeed }, authorUserId: 7, voters: [] }] });
    await openView('Matchups');
    const card = await screen.findByTestId('matchup-card');
    const vote = within(card).getByTestId('matchup-vote');
    expect(within(vote).getByTestId('vote-count')).toHaveTextContent('0');
    await userEvent.click(vote);
    await waitFor(() => expect(within(vote).getByTestId('vote-count')).toHaveTextContent('1'));
    expect(vote).toHaveAttribute('data-voted', 'true');
  });
});

describe('run a cell → publish → grid-append (real publish + gated hooks via mock host)', () => {
  it('estimates, confirms, publishes outputs (real hook → number[]), and renders the gated result', async () => {
    renderApp({
      seed: [
        { value: { title: 'Grid Combo', body: '', data: comboSeed }, authorUserId: 7, voters: [1, 2] },
        { value: { title: 'Grid Prompt', body: '[SDXL] cyberpunk portrait', data: promptSeed }, authorUserId: 8, voters: [1, 2, 3] },
      ],
    });

    // go to the grid tab
    await screen.findByTestId('grid-view');
    const grid = await screen.findByTestId('results-grid');
    // the single cell is empty → run it
    const emptyCell = within(grid).getByTestId('grid-cell');
    expect(emptyCell).toHaveAttribute('data-state', 'empty');
    await userEvent.click(within(emptyCell).getByTestId('run-cell'));

    // estimate → confirm
    const confirm = await screen.findByTestId('cell-confirm-run');
    expect(screen.getByTestId('cell-confirm')).toHaveTextContent('12');
    await userEvent.click(confirm);

    // The real usePublishGenerationOutputs().publish resolves the mock host's
    // default published ids; the real useGatedImages().getImages then projects
    // the THREE shapes @civitai/blocks-react >= 0.51.0's mock host emits
    // (`DEFAULT_GATED_IMAGES`): 9001 → visible + rated, 9002 → hidden (no url
    // ever), 9003 → visible + `ratingPending` (the author's OWN output that
    // nothing has rated yet: url, and deliberately no rating claim).
    // 🔴 All three must render DIFFERENTLY. The pending entry is deliberately
    // NOT a `result-image` and NOT a `result-hidden`: counting it as the first
    // asserts a rating that does not exist, and as the second asserts it is over
    // the viewer's ceiling — the "an unrated output reads as rated mature" bug
    // this release exists to stop.
    await waitFor(() => expect(screen.getByTestId('grid-cell')).toHaveAttribute('data-state', 'result'), { timeout: 3000 });
    // 🔴 SCOPED TO THE CELL. The grid CARDS below the matrix now render an inline
    // preview through the SAME gated read (see GridPreview), so every
    // `result-*` testid resolves in two places once a cell has outputs — the
    // matrix cell and the card's preview strip. The claim this case makes is about
    // the CELL, so it is scoped there; the preview's own budget and error handling
    // have their own cases in `gridPreview.test.tsx`.
    const cell = screen.getByTestId('grid-cell');
    const resultImgs = await waitFor(() => within(cell).getAllByTestId('result-image'), {
      timeout: 3000,
    });
    expect(resultImgs).toHaveLength(1); // 9001 only — visible AND rated
    expect(resultImgs[0]).toHaveAttribute('src', expect.stringContaining('gated-9001'));
    expect(within(cell).getByTestId('result-hidden')).toBeInTheDocument(); // 9002 withheld
    // 9003: shown to its author, marked as awaiting a rating, not withheld.
    expect(within(cell).getByTestId('result-pending')).toBeInTheDocument();
    expect(within(cell).getByTestId('result-pending-image')).toHaveAttribute(
      'src',
      expect.stringContaining('gated-9003'),
    );
  });

  it('surfaces a gated-read error (real useGatedImages error path)', async () => {
    renderApp({
      seed: [
        { value: { title: 'Grid Combo', body: '', data: comboSeed }, authorUserId: 7, voters: [1, 2] },
        { value: { title: 'Grid Prompt', body: '[SDXL] cyberpunk portrait', data: promptSeed }, authorUserId: 8, voters: [1, 2, 3] },
      ],
      harness: { gatedImagesError: 'gated read failed' },
    });
    await screen.findByTestId('grid-view');
    const grid = await screen.findByTestId('results-grid');
    await userEvent.click(within(grid).getByTestId('run-cell'));
    await userEvent.click(await screen.findByTestId('cell-confirm-run'));
    // The result row appends, but the gated cell reports the read failure.
    // 🔴 Scoped to the matrix: the grid cards' preview strips read through the same
    // hook, so a failing read now surfaces `gated-error` there too — which is the
    // point of reusing GatedCell, and is asserted in `gridPreview.test.tsx`.
    await waitFor(
      () => expect(within(grid).getByTestId('gated-error')).toHaveTextContent('gated read failed'),
      { timeout: 3000 },
    );
  });

  it('renders the published result in-session even when list() never reflects the append (optimistic insert)', async () => {
    // A shared store whose list() LAGS: it always returns the seed combo+prompt
    // but NEVER the appended result — modelling appsDb read-after-write lag. The
    // optimistic insert in confirmRun is what makes the just-published result
    // render immediately; without it the cell falls back to "not generated yet"
    // until a later refetch/manual reload catches up (the reported bug).
    const seedItems: SharedItem[] = [
      { key: 'c1', authorUserId: 7, count: 2, viewerVoted: false, value: { title: 'Grid Combo', body: '', data: comboSeed }, createdAt: new Date(0), updatedAt: new Date(0) },
      { key: 'p1', authorUserId: 8, count: 3, viewerVoted: false, value: { title: 'Grid Prompt', body: '[SDXL] cyberpunk portrait', data: promptSeed }, createdAt: new Date(0), updatedAt: new Date(0) },
    ];
    // 🔴 EXACTLY THE SEVEN OPERATIONS `SharedStore` DECLARES — `get`, `getCount`
    // and `getCounts` are gone because the port's façade does not carry them (no
    // call site in this app, and `counts` is one of the six routes the SDK
    // deliberately leaves app-layer). A fake with a method the App cannot reach is
    // a fixture nothing exercises.
    const laggingShared: SharedStore = {
      list: async () => ({ items: seedItems }), // never includes the appended result
      report: async () => {},
      append: async () => ({ key: 'result-lagged' }),
      update: async () => {},
      vote: async () => 0,
      unvote: async () => 0,
      withdraw: async () => ({ ok: true, deleted: true }),
    };

    // publish + gated reads still flow through the real hooks → mock host.
    renderApp({ deps: { shared: laggingShared } });

    await screen.findByTestId('grid-view');
    const grid = await screen.findByTestId('results-grid');
    const emptyCell = within(grid).getByTestId('grid-cell');
    expect(emptyCell).toHaveAttribute('data-state', 'empty');
    await userEvent.click(within(emptyCell).getByTestId('run-cell'));
    await userEvent.click(await screen.findByTestId('cell-confirm-run'));

    // The result renders via the optimistic insert (publish → [9001,9002] → gated
    // read), NOT a refetch — this store's list() never returns the result row.
    await waitFor(() => expect(screen.getByTestId('grid-cell')).toHaveAttribute('data-state', 'result'), { timeout: 3000 });
    const imgs = await screen.findAllByTestId('result-image', {}, { timeout: 3000 });
    expect(imgs[0]).toHaveAttribute('src', expect.stringContaining('gated-9001'));
  });
});
