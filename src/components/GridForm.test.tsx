// GridForm, driven DIRECTLY — the modal rework's grid half: the two axis headings,
// the chosen members rendered as CARDS instead of a bare count, and the two-step
// CREATE flow.
//
// ⚠ WHY A NEW FILE RATHER THAN MORE CASES IN `gridsView.test.tsx`. That file drives
// the grid builder through the REAL App, which is the right place for the publish
// boundary, the Escape/nested-modal behaviour and the per-viewer writes — and it is
// the wrong place for "what does this form render", because every case there pays
// for a full App mount and a board seed to read one heading. The seam those cases
// cover (the form inside a modal inside the App) is still covered there; nothing
// here replaces it.
//
// 🔴 `multiStep` DEFAULTS TO FALSE, so a case that does not pass it is exercising
// the single-page EDIT shape. `App.tsx` sets it explicitly per modal kind.

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { GridForm } from './GridForm.js';
import type { GridPickerItem } from './GridPicker.js';
import type { GridInput } from '../lib/grids.js';

const MATCHUPS: GridPickerItem[] = [
  { key: 'mk-echo', name: 'Echo showdown', description: 'two realism checkpoints', meta: '2 models' },
  { key: 'mk-fox', name: 'Fox trial', meta: '1 model' },
];
const PROMPTS: GridPickerItem[] = [
  { key: 'qk-whisky', name: 'Whisky portrait', description: 'a moody close-up' },
  { key: 'qk-zulu', name: 'Zulu landscape' },
];

function renderForm(over: Partial<React.ComponentProps<typeof GridForm>> = {}) {
  const onSubmit = vi.fn<(input: GridInput) => void>();
  render(
    <GridForm
      matchupItems={MATCHUPS}
      promptItems={PROMPTS}
      onSubmit={onSubmit}
      onCancel={vi.fn()}
      {...over}
    />,
  );
  return { onSubmit, form: screen.getByTestId('grid-form') };
}

/** A prefill with one member on each axis. */
const FILLED: GridInput = {
  name: 'Stored grid',
  description: 'stored desc',
  matchupKeys: ['mk-echo'],
  promptKeys: ['qk-whisky'],
};

// ---------------------------------------------------------------------------
// 🔴 THE AXIS HEADINGS. Pinned as WHOLE normalised strings rather than by
// substring, because the thing that changed is a REWORD — "Rows (matchups)" ->
// "Matchups". A `toHaveTextContent` substring check would stay green on the old
// copy, since the old string CONTAINS the new one. That is the exact shape of
// half-done rename this repo has shipped before.
// ---------------------------------------------------------------------------

describe('🔴 the two axis headings', () => {
  it('🔴 say exactly "Matchups" and "Prompts" — not the old parenthesised copy', () => {
    const { form } = renderForm();

    const headings = Array.from(form.querySelectorAll('strong')).map((el) =>
      (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
    );
    // POSITIVE CONTROL: the headings were found at all, so the assertions below are
    // about their text and not about an empty list.
    expect(headings.length, 'no headings rendered — the claims below are vacuous').toBeGreaterThan(1);

    expect(headings).toContain('Matchups');
    expect(headings).toContain('Prompts');
    expect(headings).not.toContain('Rows (matchups)');
    expect(headings).not.toContain('Columns (prompts)');
  });
});

// ---------------------------------------------------------------------------
// 🔴 THE CHOSEN MEMBERS RENDER AS CARDS.
//
// Paired in one case: no cards when nothing is chosen, one named card per chosen
// key once something is. A lone "there are cards" passes against a form that cards
// every pickable row rather than the chosen ones; a lone "there are no cards"
// passes against a feature that was never built.
// ---------------------------------------------------------------------------

describe('🔴 the chosen members render as cards', () => {
  it('🔴 shows NO cards when nothing is chosen, and one NAMED card per chosen key', async () => {
    const { form } = renderForm();

    // Empty: the counts are there (so the surface is mounted) and the cards are not.
    expect(within(form).getByTestId('grid-form-rows-count')).toHaveTextContent('0 selected');
    expect(within(form).queryAllByTestId('grid-form-row-card')).toHaveLength(0);
    expect(within(form).queryAllByTestId('grid-form-col-card')).toHaveLength(0);

    // Choose one matchup.
    await userEvent.click(within(form).getByTestId('grid-form-pick-rows'));
    const picker = await screen.findByTestId('grid-pick-rows');
    await userEvent.click(
      within(picker)
        .getAllByTestId('grid-pick-rows-option')
        .find((el) => el.getAttribute('data-key') === 'mk-echo')!,
    );
    await userEvent.click(within(picker).getByTestId('grid-pick-rows-confirm'));

    const cards = within(form).getAllByTestId('grid-form-row-card');
    expect(cards).toHaveLength(1);
    // 🔴 THE CARD NAMES THE ROW — the whole point of replacing "1 selected". A card
    // that rendered the KEY, or nothing, would satisfy a bare length check.
    expect(cards[0]!).toHaveTextContent('Echo showdown');
    expect(cards[0]!).toHaveTextContent('2 models');
    expect(cards[0]!).toHaveTextContent('two realism checkpoints');

    // 🔴 AND ONLY THE CHOSEN ONE. `mk-fox` is pickable and was not picked; a card for
    // it would mean the list is rendering `items` rather than the selection.
    expect(within(form).queryByText('Fox trial')).toBeNull();
    // The other axis is untouched — so the cards above are not "every card".
    expect(within(form).queryAllByTestId('grid-form-col-card')).toHaveLength(0);
  });

  it('🔴 keeps the COUNT alongside the cards', () => {
    // The count is what the cap is about (20 per axis), and 20 names is not a list
    // you count by eye. Replacing it with cards would have lost that.
    const { form } = renderForm({ initial: FILLED });
    expect(within(form).getByTestId('grid-form-rows-count')).toHaveTextContent('1 selected');
    expect(within(form).getByTestId('grid-form-cols-count')).toHaveTextContent('1 selected');
    expect(within(form).getAllByTestId('grid-form-row-card')).toHaveLength(1);
    expect(within(form).getAllByTestId('grid-form-col-card')).toHaveLength(1);
  });

  it('🔴 cards BOTH axes from their own item list, never from each other', () => {
    // A single shared lookup would have rendered a matchup's name on the prompt axis
    // (or nothing at all), and a per-axis length check cannot see that.
    const { form } = renderForm({
      initial: { ...FILLED, matchupKeys: ['mk-fox'], promptKeys: ['qk-zulu'] },
    });
    expect(within(form).getByTestId('grid-form-row-card')).toHaveTextContent('Fox trial');
    expect(within(form).getByTestId('grid-form-col-card')).toHaveTextContent('Zulu landscape');
  });

  it('🔴 NAMES a chosen key whose row has left the board, rather than dropping it', () => {
    // §11.2 calls a dangling reference NORMAL — the row was withdrawn after the grid
    // was built — and `GridPicker` carries such a key through Save rather than
    // truncating. Rendering nothing for it here would contradict that at the one
    // place a viewer could still fix it, and the COUNT would then disagree with the
    // number of cards.
    const { form } = renderForm({
      initial: { ...FILLED, matchupKeys: ['mk-echo', 'mk-gone'] },
    });
    const cards = within(form).getAllByTestId('grid-form-row-card');
    expect(cards).toHaveLength(2);
    expect(within(form).getByTestId('grid-form-rows-count')).toHaveTextContent('2 selected');
    expect(cards[1]!).toHaveTextContent('No longer on the board');
  });
});

// ---------------------------------------------------------------------------
// 🔴 THE TWO-STEP CREATE FLOW — paired, as in the other two forms.
// ---------------------------------------------------------------------------

describe('🔴 the two-step CREATE flow', () => {
  it('🔴 pages a NEW grid (axes, then name) and pages an EDIT not at all', async () => {
    const { unmount } = render(
      <GridForm
        matchupItems={MATCHUPS}
        promptItems={PROMPTS}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        multiStep
      />,
    );

    // Step 1: the two axes, no name, no submit.
    // 🔴 EVERY READ CARRIES ITS OWN MESSAGE — a bare `.not.toBeNull()` reports
    // "expected null not to be null", which names nothing.
    expect(
      screen.queryByTestId('form-step-content'),
      'a NEW grid did not open on step 1 — `multiStep` is not being honoured',
    ).not.toBeNull();
    expect(screen.queryByTestId('form-step-meta'), 'step 2 is mounted while on step 1').toBeNull();
    expect(screen.queryByTestId('grid-form-pick-rows'), 'step 1 holds no row picker').not.toBeNull();
    expect(
      screen.queryByTestId('grid-form-pick-cols'),
      'step 1 holds no column picker',
    ).not.toBeNull();
    expect(screen.queryByTestId('grid-form-name'), 'the name input leaked onto step 1').toBeNull();
    expect(
      screen.queryByTestId('grid-form-submit'),
      'step 1 offers Submit — it would submit a nameless grid',
    ).toBeNull();
    expect(screen.queryByTestId('form-next'), 'step 1 offers no way forward').not.toBeNull();

    await userEvent.click(screen.getByTestId('form-next'));

    // Step 2: name + description, no axes.
    expect(screen.queryByTestId('form-step-meta'), 'Next did not reach step 2').not.toBeNull();
    expect(screen.queryByTestId('form-step-content'), 'step 1 is still mounted on step 2').toBeNull();
    expect(screen.queryByTestId('grid-form-name'), 'step 2 holds no name input').not.toBeNull();
    expect(
      screen.queryByTestId('grid-form-description'),
      'step 2 holds no description input',
    ).not.toBeNull();
    expect(screen.queryByTestId('grid-form-pick-rows'), 'the axes leaked onto step 2').toBeNull();
    expect(screen.queryByTestId('grid-form-submit'), 'step 2 offers no Submit').not.toBeNull();
    expect(screen.queryByTestId('form-back'), 'step 2 offers no way back').not.toBeNull();
    unmount();

    // EDIT: one page, no step machinery, BOTH sections present.
    render(
      <GridForm
        matchupItems={MATCHUPS}
        promptItems={PROMPTS}
        initial={FILLED}
        submitLabel="Save changes"
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('form-step-content'), 'an EDIT was wrapped in step 1').toBeNull();
    expect(screen.queryByTestId('form-step-meta'), 'an EDIT was wrapped in step 2').toBeNull();
    expect(screen.queryByTestId('form-next'), 'an EDIT offers Next — it was paged').toBeNull();
    expect(screen.queryByTestId('form-back'), 'an EDIT offers Back — it was paged').toBeNull();
    expect(
      screen.queryByTestId('grid-form-pick-rows'),
      'the EDIT page holds no row picker',
    ).not.toBeNull();
    expect(screen.queryByTestId('grid-form-name'), 'the EDIT page holds no name input').not.toBeNull();
    expect(screen.queryByTestId('grid-form-submit'), 'the EDIT page holds no Submit').not.toBeNull();
  });

  it('🔴 submits what BOTH steps collected', async () => {
    const onSubmit = vi.fn<(input: GridInput) => void>();
    render(
      <GridForm
        matchupItems={MATCHUPS}
        promptItems={PROMPTS}
        initial={{ name: '', description: '', matchupKeys: ['mk-echo'], promptKeys: ['qk-whisky'] }}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        multiStep
      />,
    );

    // The axes come from the prefill (step 1), the name is typed on step 2.
    await userEvent.click(screen.getByTestId('form-next'));
    await userEvent.type(screen.getByTestId('grid-form-name'), 'Paged grid');
    await userEvent.click(screen.getByTestId('grid-form-submit'));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({
      name: 'Paged grid',
      matchupKeys: ['mk-echo'],
      promptKeys: ['qk-whisky'],
    });
  });

  it('🔴 shows a step-1 validation failure on step 2, where the Submit is', async () => {
    const onSubmit = vi.fn<(input: GridInput) => void>();
    render(
      <GridForm
        matchupItems={MATCHUPS}
        promptItems={PROMPTS}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        multiStep
      />,
    );

    // Advance with NO axes picked, name it, submit.
    await userEvent.click(screen.getByTestId('form-next'));
    await userEvent.type(screen.getByTestId('grid-form-name'), 'Empty axes');
    await userEvent.click(screen.getByTestId('grid-form-submit'));

    expect(onSubmit).not.toHaveBeenCalled();
    const errs = screen.queryByTestId('grid-form-errors');
    expect(errs, 'the step-1 failure was not reported on step 2').not.toBeNull();
    expect(errs).toHaveTextContent('the grid needs a row');
    expect(errs).toHaveTextContent('the grid needs a column');
    // …and it is readable from step 2, not stranded on the page the viewer left.
    expect(screen.queryByTestId('form-step-meta')).not.toBeNull();
  });
});
