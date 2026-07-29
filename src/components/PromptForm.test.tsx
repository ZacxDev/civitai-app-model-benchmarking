// PromptForm (v3 default + optional overrides): the Default section is always
// present and seeded with SDXL-family generator params; adding a per-ecosystem
// override pre-fills its prompt from the default and its params with that
// ecosystem's conventional defaults; editing, removing, validation, and
// edit-mode prefill all work.

import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PromptForm } from './PromptForm.js';
import type { PromptInput } from '../lib/benchmark.js';

function renderForm(initial?: PromptInput) {
  const onSubmit = vi.fn<(input: PromptInput) => Promise<void>>();
  render(<PromptForm onSubmit={onSubmit} onCancel={vi.fn()} initial={initial} />);
  const form = screen.getByTestId('prompt-form');
  return { onSubmit, form };
}

async function fillDefault(form: HTMLElement, name = 'P', prompt = 'a cat') {
  await userEvent.type(within(form).getByTestId('prompt-name'), name);
  fireEvent.change(within(form).getByTestId('prompt-default-text'), { target: { value: prompt } });
}

describe('PromptForm default section', () => {
  it('seeds the default params with the SDXL-family generator defaults, threaded to onSubmit', async () => {
    const { onSubmit, form } = renderForm();
    // The default params inputs show the SDXL seed.
    expect((within(form).getByTestId('prompt-default-cfg') as HTMLInputElement).value).toBe('7');
    expect((within(form).getByTestId('prompt-default-steps') as HTMLInputElement).value).toBe('30');

    await fillDefault(form);
    await userEvent.click(within(form).getByTestId('prompt-submit'));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const input = onSubmit.mock.calls[0][0];
    expect(input.default.prompt).toBe('a cat');
    expect(input.default.params).toMatchObject({ steps: 30, cfgScale: 7, sampler: 'Euler a', clipSkip: 2, width: 1024, height: 1024 });
    expect(input.overrides).toEqual({}); // default-only prompt — no overrides
  });

  it('a default-only prompt is valid (applies to all ecosystems)', async () => {
    const { onSubmit, form } = renderForm();
    await fillDefault(form, 'Universal', 'universal prompt');
    await userEvent.click(within(form).getByTestId('prompt-submit'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0].default.prompt).toBe('universal prompt');
  });

  it('blocks submit when the default prompt is empty', async () => {
    const { onSubmit, form } = renderForm();
    await userEvent.type(within(form).getByTestId('prompt-name'), 'No Prompt');
    await userEvent.click(within(form).getByTestId('prompt-submit'));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(within(form).getByTestId('prompt-errors')).toHaveTextContent(/default prompt/i);
  });

  it('offers the sampler as a Select of KNOWN samplers (not free text), threading the choice to onSubmit', async () => {
    const { onSubmit, form } = renderForm();
    const sampler = within(form).getByTestId('prompt-default-sampler') as HTMLSelectElement;
    // A real <select>, not a free-text input.
    expect(sampler.tagName).toBe('SELECT');
    // Seeded with the SDXL-family default…
    expect(sampler.value).toBe('Euler a');
    // …and the dropdown exposes the known on-site samplers.
    const optionValues = Array.from(sampler.options).map((o) => o.value);
    expect(optionValues).toEqual(
      expect.arrayContaining(['Euler a', 'Euler', 'DDIM', 'DPM++ 2M Karras', 'DPM2', 'DPM2 a']),
    );

    await fillDefault(form);
    await userEvent.selectOptions(sampler, 'DDIM');
    await userEvent.click(within(form).getByTestId('prompt-submit'));
    expect(onSubmit.mock.calls[0][0].default.params.sampler).toBe('DDIM');
  });

  it('shows the SDXL-family default note near the Default badge', () => {
    const { form } = renderForm();
    expect(within(form).getByTestId('prompt-default-sdxl-note')).toHaveTextContent(/SDXL-family/i);
  });

  it('editing a default param still works and untouched defaults are preserved', async () => {
    const { onSubmit, form } = renderForm();
    await fillDefault(form, 'P', 'x');
    fireEvent.change(within(form).getByTestId('prompt-default-steps'), { target: { value: '18' } });
    await userEvent.click(within(form).getByTestId('prompt-submit'));

    const input = onSubmit.mock.calls[0][0];
    expect(input.default.params.steps).toBe(18);
    expect(input.default.params.cfgScale).toBe(7); // untouched default preserved
  });
});

describe('PromptForm per-ecosystem overrides', () => {
  it('adds a Pony override pre-filled from the default prompt + Pony conventional params, applied only to Pony', async () => {
    const { onSubmit, form } = renderForm();
    await fillDefault(form, 'P', 'default prompt');

    await userEvent.selectOptions(within(form).getByTestId('prompt-add-override-select'), 'Pony');
    await userEvent.click(within(form).getByTestId('prompt-add-override'));
    const entry = await within(form).findByTestId('prompt-override-entry');
    expect(entry).toHaveAttribute('data-eco', 'Pony');
    // Prompt pre-filled from the current default…
    expect((within(entry).getByTestId('prompt-override-text') as HTMLTextAreaElement).value).toBe('default prompt');
    // …params pre-filled with Pony's conventional (SD-family) defaults.
    expect((within(entry).getByTestId('prompt-override-cfg') as HTMLInputElement).value).toBe('7');
    expect((within(entry).getByTestId('prompt-override-steps') as HTMLInputElement).value).toBe('30');

    // Narrow the Pony prompt.
    fireEvent.change(within(entry).getByTestId('prompt-override-text'), { target: { value: 'score_9 portrait' } });
    await userEvent.click(within(form).getByTestId('prompt-submit'));

    const input = onSubmit.mock.calls[0][0];
    expect(input.default.prompt).toBe('default prompt');
    expect(Object.keys(input.overrides)).toEqual(['Pony']);
    expect(input.overrides.Pony.prompt).toBe('score_9 portrait');
  });

  it('a Flux override pre-fills Flux params (cfg 3.5 / steps 25, NO sampler / clipSkip)', async () => {
    const { onSubmit, form } = renderForm();
    await fillDefault(form, 'P', 'base');
    await userEvent.selectOptions(within(form).getByTestId('prompt-add-override-select'), 'Flux');
    await userEvent.click(within(form).getByTestId('prompt-add-override'));
    const entry = await within(form).findByTestId('prompt-override-entry');
    expect((within(entry).getByTestId('prompt-override-cfg') as HTMLInputElement).value).toBe('3.5');
    expect((within(entry).getByTestId('prompt-override-steps') as HTMLInputElement).value).toBe('25');

    await userEvent.click(within(form).getByTestId('prompt-submit'));
    const input = onSubmit.mock.calls[0][0];
    expect(input.overrides.Flux.params).toMatchObject({ cfgScale: 3.5, steps: 25 });
    expect(input.overrides.Flux.params!.sampler).toBeUndefined();
    expect(input.overrides.Flux.params!.clipSkip).toBeUndefined();
  });

  it('removes an override', async () => {
    const { onSubmit, form } = renderForm();
    await fillDefault(form, 'P', 'base');
    await userEvent.selectOptions(within(form).getByTestId('prompt-add-override-select'), 'Pony');
    await userEvent.click(within(form).getByTestId('prompt-add-override'));
    const entry = await within(form).findByTestId('prompt-override-entry');
    await userEvent.click(within(entry).getByTestId('prompt-override-remove'));
    expect(within(form).queryByTestId('prompt-override-entry')).toBeNull();

    await userEvent.click(within(form).getByTestId('prompt-submit'));
    expect(onSubmit.mock.calls[0][0].overrides).toEqual({});
  });
});

describe('PromptForm edit mode', () => {
  it('prefills the default AND existing overrides, and uses the given submit label', () => {
    const initial: PromptInput = {
      name: 'Existing',
      description: 'desc',
      default: { prompt: 'stored default', params: { steps: 40, cfgScale: 6 } },
      overrides: { Flux: { prompt: 'stored flux', params: { cfgScale: 3.5, steps: 25 } } },
    };
    render(<PromptForm onSubmit={vi.fn()} onCancel={vi.fn()} initial={initial} submitLabel="Save changes" />);
    expect((screen.getByTestId('prompt-name') as HTMLInputElement).value).toBe('Existing');
    // default section prefilled
    expect((screen.getByTestId('prompt-default-text') as HTMLTextAreaElement).value).toBe('stored default');
    expect((screen.getByTestId('prompt-default-steps') as HTMLInputElement).value).toBe('40');
    // the existing Flux override prefilled
    const entry = screen.getByTestId('prompt-override-entry');
    expect(entry).toHaveAttribute('data-eco', 'Flux');
    expect((within(entry).getByTestId('prompt-override-text') as HTMLTextAreaElement).value).toBe('stored flux');
    expect(screen.getByTestId('prompt-submit')).toHaveTextContent('Save changes');
  });
});
