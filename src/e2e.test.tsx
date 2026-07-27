// End-to-end component flows against the real SDK mock host (createMockHost via
// <Harness>): submit a combination, submit a multi-ecosystem prompt, vote, and
// run a cell → publish → grid-append. The base protocol (shared storage,
// workflow money path, resource picker, consent, viewer) is served by the mock
// host; only the 0.30 publish/gated bridges + the poll clock are injected via
// deps (those two hooks aren't in the pre-0.30 mock host).

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Harness } from '@civitai/blocks-react/testing';
import type { MockHostOptions, MockSharedSeed } from '@civitai/blocks-react/testing';
import type { SharedListItem, UseSharedStorage } from '@civitai/blocks-react';

import { App, type AppDeps } from './App.js';
import type { CombinationData, PromptData } from './types.js';
import { CKPT_SDXL, LORA_SDXL, immediateSleep } from './test-helpers.js';

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

// NOTE: publish + gated-image reads flow through the REAL SDK hooks
// (usePublishGenerationOutputs / useGatedImages) → the mock host — NOT injected
// fakes — so the tests exercise the real hook→message→host shapes and would
// catch a shape drift. Only the poll clock + resource resolve are seamed.
function renderApp(
  opts: { seed?: MockSharedSeed[]; deps?: Partial<AppDeps>; harness?: Partial<MockHostOptions> } = {},
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
    await userEvent.click(await screen.findByTestId('submit-combination'));
    const form = await screen.findByTestId('combination-form');
    await userEvent.type(within(form).getByTestId('combo-name'), 'My SDXL Combo');
    await userEvent.click(within(form).getByTestId('pick-checkpoint'));
    await waitFor(() => expect(within(form).getByTestId('checkpoint-name')).toHaveTextContent('JuggernautXL'));
    // ecosystem is derived + shown
    expect(within(form).getByTestId('checkpoint-name')).toHaveTextContent('SDXL');
    await userEvent.click(within(form).getByTestId('add-lora'));
    await waitFor(() => expect(within(form).getByTestId('lora-row')).toBeInTheDocument());
    await userEvent.click(within(form).getByTestId('combo-submit'));

    const card = await screen.findByTestId('combo-card');
    expect(card).toHaveTextContent('My SDXL Combo');
    expect(within(card).getByTestId('combo-included')).toBeInTheDocument();
  });
});

describe('submit a prompt (default + a per-ecosystem override)', () => {
  it('fills the default prompt, adds a Pony override, and publishes both', async () => {
    renderApp();
    // switch to the prompts tab
    await userEvent.click(await screen.findByRole('tab', { name: /Prompts/ }));
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

    const cards = await screen.findAllByTestId('combo-card');
    expect(cards).toHaveLength(2);
    const mine = cards.find((el) => within(el).queryByText('Mine'))!;
    const theirs = cards.find((el) => within(el).queryByText('Theirs'))!;
    // Author-scoped affordance: Edit only on the viewer's own row.
    expect(within(mine).getByTestId('combo-edit')).toBeInTheDocument();
    expect(within(theirs).queryByTestId('combo-edit')).toBeNull();

    // Open the edit form (prefilled), rename, save.
    await userEvent.click(within(mine).getByTestId('combo-edit'));
    const form = await screen.findByTestId('combination-form');
    const nameInput = within(form).getByTestId('combo-name') as HTMLInputElement;
    expect(nameInput.value).toBe('Mine'); // prefilled from the stored row
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Mine (edited)');
    await userEvent.click(within(form).getByTestId('combo-submit'));

    // Still exactly two cards (in-place update, NOT an append) and the name changed.
    await waitFor(() => expect(screen.getByText('Mine (edited)')).toBeInTheDocument());
    expect(screen.getAllByTestId('combo-card')).toHaveLength(2);
    expect(screen.queryByText('Mine')).toBeNull();
  });
});

describe('edit-in-place: the author edits their OWN prompt', () => {
  it('updates the prompt row in place (same card, new name)', async () => {
    renderApp({ seed: [{ value: { title: 'My Prompt', body: '[SDXL] x', data: promptSeed }, authorUserId: 99, voters: [1] }] });
    await userEvent.click(await screen.findByRole('tab', { name: /Prompts/ }));
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

describe('vote on a combination', () => {
  it('increments the vote count through the shared store', async () => {
    renderApp({ seed: [{ value: { title: 'Votable Combo', body: '', data: comboSeed }, authorUserId: 7, voters: [] }] });
    const card = await screen.findByTestId('combo-card');
    const vote = within(card).getByTestId('combo-vote');
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
    await userEvent.click(await screen.findByRole('tab', { name: /^Grid$/ }));
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
    // default published ids [9001, 9002]; the real useGatedImages().getImages
    // then projects 9001 → visible (url) and 9002 → hidden (no url).
    await waitFor(() => expect(screen.getByTestId('grid-cell')).toHaveAttribute('data-state', 'result'), { timeout: 3000 });
    const resultImgs = await screen.findAllByTestId('result-image', {}, { timeout: 3000 });
    expect(resultImgs).toHaveLength(1); // 9001 visible
    expect(resultImgs[0]).toHaveAttribute('src', expect.stringContaining('gated-9001'));
    expect(screen.getByTestId('result-hidden')).toBeInTheDocument(); // 9002 gated-hidden
  });

  it('surfaces a gated-read error (real useGatedImages error path)', async () => {
    renderApp({
      seed: [
        { value: { title: 'Grid Combo', body: '', data: comboSeed }, authorUserId: 7, voters: [1, 2] },
        { value: { title: 'Grid Prompt', body: '[SDXL] cyberpunk portrait', data: promptSeed }, authorUserId: 8, voters: [1, 2, 3] },
      ],
      harness: { gatedImagesError: 'gated read failed' },
    });
    await userEvent.click(await screen.findByRole('tab', { name: /^Grid$/ }));
    const grid = await screen.findByTestId('results-grid');
    await userEvent.click(within(grid).getByTestId('run-cell'));
    await userEvent.click(await screen.findByTestId('cell-confirm-run'));
    // The result row appends, but the gated cell reports the read failure.
    expect(await screen.findByTestId('gated-error', {}, { timeout: 3000 })).toHaveTextContent('gated read failed');
  });

  it('renders the published result in-session even when list() never reflects the append (optimistic insert)', async () => {
    // A shared store whose list() LAGS: it always returns the seed combo+prompt
    // but NEVER the appended result — modelling appsDb read-after-write lag. The
    // optimistic insert in confirmRun is what makes the just-published result
    // render immediately; without it the cell falls back to "not generated yet"
    // until a later refetch/manual reload catches up (the reported bug).
    const seedItems: SharedListItem[] = [
      { key: 'c1', authorUserId: 7, count: 2, value: { title: 'Grid Combo', body: '', data: comboSeed }, createdAt: new Date(0), updatedAt: new Date(0) },
      { key: 'p1', authorUserId: 8, count: 3, value: { title: 'Grid Prompt', body: '[SDXL] cyberpunk portrait', data: promptSeed }, createdAt: new Date(0), updatedAt: new Date(0) },
    ];
    const laggingShared: UseSharedStorage = {
      list: async () => ({ items: seedItems }), // never includes the appended result
      append: async () => ({ key: 'result-lagged' }),
      update: async () => {},
      getCount: async () => 0,
      getCounts: async () => ({}),
      vote: async () => 0,
      unvote: async () => 0,
      withdraw: async () => ({ ok: true, deleted: true }),
    };

    // publish + gated reads still flow through the real hooks → mock host.
    renderApp({ deps: { shared: laggingShared } });

    await userEvent.click(await screen.findByRole('tab', { name: /^Grid$/ }));
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
