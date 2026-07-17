// CombinationForm: item 2 — a combination holds an ARRAY of model configs (each a
// checkpoint + its LoRA stack). Add/remove config rows, per-config checkpoint +
// family-scoped LoRA picking, ≥1-config validation, and edit-mode prefill.

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { BlockResourceInfo, BlockResourcePickerType } from '@civitai/app-sdk/blocks';

import { CombinationForm } from './CombinationForm.js';
import type { CombinationInput } from '../lib/benchmark.js';
import { CKPT_SDXL, LORA_SDXL } from '../test-helpers.js';

/** A picker that returns a Checkpoint / LORA by requested type, recording family scope. */
function fakePicker() {
  const calls: Array<{ resourceType: BlockResourcePickerType; baseModelGroup?: string }> = [];
  const pickResource = async (opts: { resourceType: BlockResourcePickerType; baseModelGroup?: string }) => {
    calls.push(opts);
    const map: Partial<Record<BlockResourcePickerType, BlockResourceInfo>> = {
      Checkpoint: CKPT_SDXL,
      LORA: LORA_SDXL,
    };
    return map[opts.resourceType] ?? null;
  };
  return { pickResource, calls };
}

describe('CombinationForm multi-config builder (item 2)', () => {
  it('starts with one config and adds/removes config rows', async () => {
    const { pickResource } = fakePicker();
    render(<CombinationForm pickResource={pickResource} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getAllByTestId('config-card')).toHaveLength(1);
    // A single config shows no remove affordance.
    expect(screen.queryByTestId('remove-config')).toBeNull();

    await userEvent.click(screen.getByTestId('add-config'));
    expect(screen.getAllByTestId('config-card')).toHaveLength(2);
    // Now each config can be removed.
    await userEvent.click(screen.getAllByTestId('remove-config')[0]);
    expect(screen.getAllByTestId('config-card')).toHaveLength(1);
  });

  it('scopes the LoRA picker to the config checkpoint family', async () => {
    const { pickResource, calls } = fakePicker();
    render(<CombinationForm pickResource={pickResource} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    const card = screen.getByTestId('config-card');
    await userEvent.click(within(card).getByTestId('pick-checkpoint'));
    await waitFor(() => expect(within(card).getByTestId('checkpoint-name')).toHaveTextContent('JuggernautXL'));
    await userEvent.click(within(card).getByTestId('add-lora'));
    await waitFor(() => expect(within(card).getByTestId('lora-row')).toBeInTheDocument());
    // The LORA pick carried the checkpoint's family group (SDXL).
    const loraCall = calls.find((c) => c.resourceType === 'LORA');
    expect(loraCall?.baseModelGroup).toBe('SDXL');
  });

  it('requires a name and at least one config with a checkpoint', async () => {
    const onSubmit = vi.fn<(input: CombinationInput) => Promise<void>>();
    const { pickResource } = fakePicker();
    render(<CombinationForm pickResource={pickResource} onSubmit={onSubmit} onCancel={vi.fn()} />);
    await userEvent.click(screen.getByTestId('combo-submit'));
    expect(onSubmit).not.toHaveBeenCalled();
    const errs = screen.getByTestId('combo-errors');
    expect(errs).toHaveTextContent('Give the combination a name.');
    expect(errs).toHaveTextContent('Add at least one model config');
  });

  it('submits a TWO-config combination', async () => {
    const onSubmit = vi.fn<(input: CombinationInput) => Promise<void>>();
    const { pickResource } = fakePicker();
    render(<CombinationForm pickResource={pickResource} onSubmit={onSubmit} onCancel={vi.fn()} />);
    await userEvent.type(screen.getByTestId('combo-name'), 'Realism showdown');
    // config 1 checkpoint
    await userEvent.click(screen.getAllByTestId('pick-checkpoint')[0]);
    await waitFor(() => expect(screen.getAllByTestId('checkpoint-name')).toHaveLength(1));
    // add a second config + pick its checkpoint
    await userEvent.click(screen.getByTestId('add-config'));
    await userEvent.click(screen.getAllByTestId('pick-checkpoint')[1]);
    await waitFor(() => expect(screen.getAllByTestId('checkpoint-name')).toHaveLength(2));
    // label the second config
    await userEvent.type(screen.getAllByTestId('config-label')[1], 'variant B');
    await userEvent.click(screen.getByTestId('combo-submit'));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const input = onSubmit.mock.calls[0][0] as CombinationInput;
    expect(input.name).toBe('Realism showdown');
    expect(input.configs).toHaveLength(2);
    expect(input.configs.every((cfg) => cfg.checkpoint?.versionId === 1001)).toBe(true);
    expect(input.configs[1].label).toBe('variant B');
  });
});

describe('CombinationForm edit mode', () => {
  it('prefills from an initial input (multiple configs) and uses the given submit label', () => {
    const initial: CombinationInput = {
      name: 'Existing combo',
      description: 'd',
      configs: [
        { id: 'a', label: 'base', checkpoint: { versionId: 1001, modelId: 500, baseModel: 'SDXL 1.0', modelName: 'JuggernautXL' }, loras: [] },
        { id: 'b', label: 'pony', checkpoint: { versionId: 1101, modelId: 600, baseModel: 'Pony', modelName: 'AutismMix' }, loras: [] },
      ],
    };
    render(<CombinationForm pickResource={vi.fn()} onSubmit={vi.fn()} onCancel={vi.fn()} initial={initial} submitLabel="Save changes" />);
    expect((screen.getByTestId('combo-name') as HTMLInputElement).value).toBe('Existing combo');
    expect(screen.getAllByTestId('config-card')).toHaveLength(2);
    const labels = screen.getAllByTestId('config-label') as HTMLInputElement[];
    expect(labels.map((l) => l.value)).toEqual(['base', 'pony']);
    expect(screen.getByTestId('combo-submit')).toHaveTextContent('Save changes');
  });
});
