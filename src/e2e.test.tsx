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
import type { MockSharedSeed } from '@civitai/blocks-react/testing';

import { App, type AppDeps } from './App.js';
import type { CombinationData, PromptData } from './types.js';
import { CKPT_SDXL, LORA_SDXL, fakeGatedCell, fakePublish, immediateSleep } from './test-helpers.js';

const comboSeed: CombinationData = {
  v: 1,
  kind: 'combination',
  checkpoint: { versionId: 1001, modelId: 500, baseModel: 'SDXL 1.0', modelName: 'JuggernautXL' },
  loras: [{ versionId: 2002, weight: 0.8, minStrength: 0, maxStrength: 1.5, modelName: 'Detail Tweaker' }],
};
const promptSeed: PromptData = {
  v: 1,
  kind: 'prompt',
  byEcosystem: { SDXL: { prompt: 'cyberpunk portrait', params: { cfgScale: 5, steps: 30 } } },
};

function renderApp(opts: { seed?: MockSharedSeed[]; deps?: Partial<AppDeps> } = {}) {
  const deps: Partial<AppDeps> = {
    resolveResources: async () => [],
    pollIntervalMs: 0,
    sleep: immediateSleep,
    GatedCell: fakeGatedCell({ visibleIds: [501, 502] }),
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

describe('submit a multi-ecosystem prompt', () => {
  it('adds entries for two ecosystems and publishes them', async () => {
    renderApp();
    // switch to the prompts tab
    await userEvent.click(await screen.findByRole('tab', { name: /Prompts/ }));
    await userEvent.click(await screen.findByTestId('submit-prompt'));
    const form = await screen.findByTestId('prompt-form');
    await userEvent.type(within(form).getByTestId('prompt-name'), 'Portrait Test');

    // first ecosystem (default SDXL)
    await userEvent.click(within(form).getByTestId('prompt-add-eco'));
    const sdxlEntry = await within(form).findByTestId('prompt-eco-entry');
    fireEvent.change(within(sdxlEntry).getByTestId('prompt-text'), { target: { value: 'sdxl cyberpunk portrait' } });

    // second ecosystem (Pony)
    await userEvent.selectOptions(within(form).getByTestId('prompt-add-eco-select'), 'Pony');
    await userEvent.click(within(form).getByTestId('prompt-add-eco'));
    await waitFor(() => expect(within(form).getAllByTestId('prompt-eco-entry')).toHaveLength(2));
    const ponyEntry = within(form).getAllByTestId('prompt-eco-entry')[1];
    fireEvent.change(within(ponyEntry).getByTestId('prompt-text'), { target: { value: 'score_9 portrait' } });

    await userEvent.click(within(form).getByTestId('prompt-submit'));

    const card = await screen.findByTestId('prompt-card');
    expect(card).toHaveTextContent('Portrait Test');
    expect(within(card).getAllByTestId('prompt-eco-badge')).toHaveLength(2);
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

describe('run a cell → publish → grid-append', () => {
  it('estimates, confirms, publishes outputs, and appends a result row shown in the grid', async () => {
    const publish = fakePublish([501, 502]);
    renderApp({
      seed: [
        { value: { title: 'Grid Combo', body: '', data: comboSeed }, authorUserId: 7, voters: [1, 2] },
        { value: { title: 'Grid Prompt', body: '[SDXL] cyberpunk portrait', data: promptSeed }, authorUserId: 8, voters: [1, 2, 3] },
      ],
      deps: { publishOutputs: publish.publishOutputs },
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

    // publish is called with the workflowId, and a result appears in the grid
    await waitFor(() => expect(publish.calls.length).toBe(1));
    const resultImgs = await screen.findAllByTestId('result-image', {}, { timeout: 3000 });
    expect(resultImgs.length).toBe(2);
    expect(screen.getByTestId('grid-cell')).toHaveAttribute('data-state', 'result');
  });
});
