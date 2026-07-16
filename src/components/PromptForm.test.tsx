// PromptForm: item 4 — adding an ecosystem entry pre-fills that family's on-site
// generator defaults, and editing them still works; plus edit-mode prefill.

import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PromptForm } from './PromptForm.js';
import type { PromptInput } from '../lib/benchmark.js';

async function addFirstEntry(eco?: string) {
  const onSubmit = vi.fn<(input: PromptInput) => Promise<void>>();
  render(<PromptForm onSubmit={onSubmit} onCancel={vi.fn()} />);
  const form = screen.getByTestId('prompt-form');
  await userEvent.type(within(form).getByTestId('prompt-name'), 'P');
  if (eco) await userEvent.selectOptions(within(form).getByTestId('prompt-add-eco-select'), eco);
  await userEvent.click(within(form).getByTestId('prompt-add-eco'));
  const entry = await within(form).findByTestId('prompt-eco-entry');
  return { onSubmit, form, entry };
}

describe('PromptForm per-ecosystem default params (item 4)', () => {
  it('pre-fills SD 1.5 (default select) with SD-family defaults, threaded to onSubmit', async () => {
    const { onSubmit, form, entry } = await addFirstEntry(); // default = SD1
    fireEvent.change(within(entry).getByTestId('prompt-text'), { target: { value: 'a cat' } });
    await userEvent.click(within(form).getByTestId('prompt-submit'));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const input = onSubmit.mock.calls[0][0] as PromptInput;
    expect(input.byEcosystem.SD1.params).toMatchObject({
      steps: 30,
      cfgScale: 7,
      sampler: 'Euler a',
      clipSkip: 2,
      width: 512,
      height: 512,
    });
  });

  it('pre-fills Flux with cfg 3.5 / steps 25 and NO sampler / clipSkip', async () => {
    const { onSubmit, form, entry } = await addFirstEntry('Flux');
    fireEvent.change(within(entry).getByTestId('prompt-text'), { target: { value: 'a fox' } });
    await userEvent.click(within(form).getByTestId('prompt-submit'));

    const input = onSubmit.mock.calls[0][0] as PromptInput;
    expect(input.byEcosystem.Flux.params).toMatchObject({ steps: 25, cfgScale: 3.5, width: 1024, height: 1024 });
    expect(input.byEcosystem.Flux.params.sampler).toBeUndefined();
    expect(input.byEcosystem.Flux.params.clipSkip).toBeUndefined();
  });

  it('the pre-filled inputs render the default values, and changing them still works', async () => {
    const { onSubmit, form, entry } = await addFirstEntry('SDXL');
    // The visible inputs show the defaults.
    expect((within(entry).getByTestId('prompt-cfg') as HTMLInputElement).value).toBe('7');
    expect((within(entry).getByTestId('prompt-steps') as HTMLInputElement).value).toBe('30');
    // Edit steps → 18.
    fireEvent.change(within(entry).getByTestId('prompt-text'), { target: { value: 'x' } });
    fireEvent.change(within(entry).getByTestId('prompt-steps'), { target: { value: '18' } });
    await userEvent.click(within(form).getByTestId('prompt-submit'));

    const input = onSubmit.mock.calls[0][0] as PromptInput;
    expect(input.byEcosystem.SDXL.params.steps).toBe(18);
    expect(input.byEcosystem.SDXL.params.cfgScale).toBe(7); // untouched default preserved
  });
});

describe('PromptForm edit mode', () => {
  it('prefills from an initial input and uses the given submit label', () => {
    const initial: PromptInput = {
      name: 'Existing',
      description: 'desc',
      byEcosystem: { SDXL: { prompt: 'stored prompt', params: { steps: 40, cfgScale: 6 } } },
    };
    render(<PromptForm onSubmit={vi.fn()} onCancel={vi.fn()} initial={initial} submitLabel="Save changes" />);
    expect((screen.getByTestId('prompt-name') as HTMLInputElement).value).toBe('Existing');
    const entry = screen.getByTestId('prompt-eco-entry');
    expect((within(entry).getByTestId('prompt-text') as HTMLTextAreaElement).value).toBe('stored prompt');
    expect((within(entry).getByTestId('prompt-steps') as HTMLInputElement).value).toBe('40');
    expect(screen.getByTestId('prompt-submit')).toHaveTextContent('Save changes');
  });
});
