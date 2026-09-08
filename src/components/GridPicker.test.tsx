// GridPicker — the search + multi-select picker for BOTH grid axes (§11.2).
//
// 🔴 WHY THE FIXTURES LOOK LIKE THIS. Every constant below is chosen so a test
// can actually SEE a mutant:
//
//  - `ITEMS` names are pairwise distinct, share no substrings that matter, and
//    contain NO DIGITS — so nothing in a fixture can accidentally equal the cap
//    constant an assertion names.
//  - `PICK_ORDER` is distinguishable from FIVE different wrong answers: sort by
//    name, sort by key, reverse of either, and the order `ITEMS` is declared in
//    (which is also the DOM order). `expectedOrder` asserts that below, so a
//    `.sort()` or a `items.filter(selected)` mutant in the component cannot
//    survive.
//  - The cap fixture has 27 rows against a cap of 20: it OVERSHOOTS rather than
//    landing on the boundary, and 27 is not a multiple of the cap, so an
//    off-by-one or a `>`/`>=` swap has somewhere to show up. The exactly-at and
//    exactly-one-over cases are then asserted explicitly.
//  - The caps come from `lib/grids.ts`, never a literal 20, so these tests keep
//    tracking §11.2 if the number moves.
//
// ⚠ WHAT THIS FILE DELIBERATELY DOES NOT TEST: jsdom performs no layout in this
// repo (`scrollWidth` / `getBoundingClientRect` are 0 and `scrollIntoView` is
// not implemented), so NOTHING here observes geometry, overflow, scroll
// position or the `scrollIntoView` call in `moveActive`. Those are unverified.

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { MAX_GRID_MATCHUPS, MAX_GRID_PROMPTS } from '../lib/grids.js';
import { GridPicker, gridPickerCap, type GridPickerAxis, type GridPickerItem } from './GridPicker.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ITEMS: GridPickerItem[] = [
  { key: 'k-zephyr', name: 'Zephyr bloom', description: 'Windswept petals at dusk', meta: 'two configs' },
  { key: 'k-marble', name: 'Marble cascade', description: 'Falling stone ribbons', meta: 'three configs' },
  { key: 'k-quartz', name: 'Quartz lantern', description: 'Cold light in a jar', meta: 'four configs' },
  { key: 'k-indigo', name: 'Indigo harbour', description: 'Boats under a bruised sky', meta: 'five configs' },
  { key: 'k-copper', name: 'Copper thistle', description: 'Rusted spines in a field', meta: 'six configs' },
  { key: 'k-velvet', name: 'Velvet mirror', description: 'Soft glass, softer reflection', meta: 'seven configs' },
];

/** A click sequence that is NOT the list order and NOT any sort of it. */
const PICK_ORDER = ['k-quartz', 'k-copper', 'k-zephyr', 'k-indigo'] as const;

/** 27 distinct rows — overshoots the cap of 20, and is not a multiple of it. */
const CAP_STEMS = [
  'karo', 'vitesh', 'mundro', 'pelax', 'quony', 'firzub', 'lemhax', 'torsev', 'wiblo',
  'purnick', 'ozvex', 'jarlumb', 'shyfen', 'clybor', 'nethra', 'oxmire', 'druval', 'sepwyn',
  'althir', 'braque', 'colvex', 'dunmar', 'eftrow', 'gavlin', 'holber', 'iskwen', 'jothra',
];

const CAP_ITEMS: GridPickerItem[] = CAP_STEMS.map((stem) => ({
  key: `k-${stem}`,
  name: `${stem} grain`,
  description: `${stem} description line`,
}));

const AXES: GridPickerAxis[] = ['matchups', 'prompts'];

function noun(axis: GridPickerAxis): { one: string; many: string } {
  return axis === 'matchups' ? { one: 'matchup', many: 'matchups' } : { one: 'prompt', many: 'prompts' };
}

interface RenderOpts {
  axis?: GridPickerAxis;
  items?: GridPickerItem[];
  selected?: string[];
}

function setup(opts: RenderOpts = {}) {
  const onConfirm = vi.fn<(keys: string[]) => void>();
  const onCancel = vi.fn<() => void>();
  const user = userEvent.setup();
  render(
    <GridPicker
      opened
      axis={opts.axis ?? 'matchups'}
      items={opts.items ?? ITEMS}
      selected={opts.selected ?? []}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  );
  return { user, onConfirm, onCancel };
}

function optionByKey(key: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-testid="grid-picker-option"][data-key="${key}"]`);
  if (!el) throw new Error(`no option rendered for key ${key}`);
  return el;
}

function optionKeys(): string[] {
  return screen
    .getAllByTestId('grid-picker-option')
    .map((el) => el.getAttribute('data-key') ?? '');
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

describe('GridPicker — filtering', () => {
  it('narrows to the rows whose NAME matches, case-insensitively', async () => {
    const { user } = setup();
    // Positive control: the unfiltered list really does render every row, so a
    // later count of 1 means the filter narrowed rather than the list being empty.
    expect(optionKeys()).toEqual(ITEMS.map((i) => i.key));

    const search = screen.getByRole('searchbox', { name: 'Search matchups' });
    await user.type(search, 'lANTErn');
    expect(optionKeys()).toEqual(['k-quartz']);
  });

  it('matches the DESCRIPTION as well as the name', async () => {
    const { user } = setup();
    const search = screen.getByRole('searchbox', { name: 'Search matchups' });
    // "bruised" appears only in Indigo harbour's description, nowhere in a name.
    await user.type(search, 'BRUISED');
    expect(optionKeys()).toEqual(['k-indigo']);
  });

  it('renders a real empty state — not a blank box — when the query matches nothing', async () => {
    const { user } = setup();
    const search = screen.getByRole('searchbox', { name: 'Search matchups' });
    await user.type(search, 'xylophone');

    expect(screen.queryAllByTestId('grid-picker-option')).toHaveLength(0);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    const empty = screen.getByTestId('grid-picker-empty');
    // Pin the WHOLE strings: a guard on a word alone is walkable by rewording.
    expect(within(empty).getByText('No matchups match “xylophone”')).toBeInTheDocument();
    expect(
      within(empty).getByText('6 matchups are available. Try a shorter or different search.'),
    ).toBeInTheDocument();
    // The empty state carries its own way out.
    await user.click(within(empty).getByRole('button', { name: 'Clear search' }));
    expect(optionKeys()).toEqual(ITEMS.map((i) => i.key));
  });

  it('renders the nothing-to-pick-from empty state when there are no items at all', () => {
    setup({ items: [] });
    const empty = screen.getByTestId('grid-picker-empty');
    expect(within(empty).getByText('No matchups to choose from')).toBeInTheDocument();
    expect(
      within(empty).getByText(
        'Publish or vote up a matchup first — a grid can only reference matchups that are on the board.',
      ),
    ).toBeInTheDocument();
    // No dead "Clear search" affordance when there is nothing a search could find.
    expect(within(empty).queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument();
  });

  it('keeps an already-selected row selected across a filter round trip', async () => {
    const { user, onConfirm } = setup();
    await user.click(optionByKey('k-velvet'));
    const search = screen.getByRole('searchbox', { name: 'Search matchups' });
    await user.type(search, 'lantern'); // hides velvet
    expect(optionKeys()).toEqual(['k-quartz']);
    await user.clear(search);
    expect(optionByKey('k-velvet')).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByTestId('grid-picker-confirm'));
    expect(onConfirm).toHaveBeenCalledWith(['k-velvet']);
  });
});

// ---------------------------------------------------------------------------
// Toggling and order preservation
// ---------------------------------------------------------------------------

describe('GridPicker — selection', () => {
  it('toggles a row ON and back OFF, exposing the state via aria-selected', async () => {
    const { user, onConfirm } = setup();
    const row = optionByKey('k-copper');
    expect(row).toHaveAttribute('aria-selected', 'false');

    await user.click(row);
    expect(optionByKey('k-copper')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('grid-picker-count')).toHaveTextContent('1 selected');

    await user.click(optionByKey('k-copper'));
    expect(optionByKey('k-copper')).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByTestId('grid-picker-count')).toHaveTextContent('0 selected');

    await user.click(screen.getByTestId('grid-picker-confirm'));
    expect(onConfirm).toHaveBeenCalledWith([]);
  });

  it('preserves the order the user picked, which is not the list order nor any sort of it', async () => {
    const { user, onConfirm } = setup();
    for (const key of PICK_ORDER) await user.click(optionByKey(key));

    const expected: string[] = [...PICK_ORDER];
    // The five wrong answers this fixture is built to expose.
    const byName = [...expected].sort((a, b) => {
      const an = ITEMS.find((i) => i.key === a)!.name;
      const bn = ITEMS.find((i) => i.key === b)!.name;
      return an.localeCompare(bn);
    });
    const byKey = [...expected].sort();
    const listOrder = ITEMS.filter((i) => expected.includes(i.key)).map((i) => i.key);
    expect(expected).not.toEqual(byName);
    expect(expected).not.toEqual([...byName].reverse());
    expect(expected).not.toEqual(byKey);
    expect(expected).not.toEqual([...byKey].reverse());
    expect(expected).not.toEqual(listOrder);
    expect(expected).not.toEqual([...listOrder].reverse());

    await user.click(screen.getByTestId('grid-picker-confirm'));
    expect(onConfirm).toHaveBeenCalledWith(expected);
  });

  it('re-appends a re-selected row at the END, not at its original position', async () => {
    const { user, onConfirm } = setup();
    for (const key of ['k-velvet', 'k-marble', 'k-indigo']) await user.click(optionByKey(key));
    await user.click(optionByKey('k-velvet')); // off
    await user.click(optionByKey('k-velvet')); // on again → goes last
    await user.click(screen.getByTestId('grid-picker-confirm'));
    expect(onConfirm).toHaveBeenCalledWith(['k-marble', 'k-indigo', 'k-velvet']);
  });

  it('seeds from `selected` in the given order and hands it back unchanged', async () => {
    const seeded = ['k-velvet', 'k-marble', 'k-quartz'];
    const { user, onConfirm } = setup({ selected: seeded });
    expect(screen.getByTestId('grid-picker-count')).toHaveTextContent('3 selected');
    await user.click(screen.getByTestId('grid-picker-confirm'));
    expect(onConfirm).toHaveBeenCalledWith(seeded);
  });

  // 🔴 The two fixtures below are ASYMMETRIC on purpose — 1-of-4 and 2-of-3.
  // The first draft used 1 withdrawn of 2 selected, where the correct count and
  // the INVERTED count are both 1, so a `!listedKeys.has` → `listedKeys.has`
  // mutant survived a green test. A fixture that can only produce the expected
  // value cannot see that mutant.
  it('de-duplicates an incoming selection with FIRST occurrence winning', async () => {
    // 'k-marble' repeats. First-wins keeps marble ahead of velvet; last-wins
    // would put velvet first — the two answers are distinguishable here.
    const { user, onConfirm } = setup({ selected: ['k-marble', 'k-velvet', 'k-marble'] });
    expect(screen.getByTestId('grid-picker-count')).toHaveTextContent('2 selected');
    await user.click(screen.getByTestId('grid-picker-confirm'));
    expect(onConfirm).toHaveBeenCalledWith(['k-marble', 'k-velvet']);
  });

  it('discloses ONE withdrawn member among three live ones, and never drops it', async () => {
    const seeded = ['k-ghostly', 'k-marble', 'k-velvet', 'k-quartz'];
    const { user, onConfirm } = setup({ selected: seeded });
    expect(screen.getByTestId('grid-picker-count')).toHaveTextContent('4 selected');
    expect(screen.getByTestId('grid-picker-unlisted')).toHaveTextContent(
      '1 selected matchup is no longer on the board and cannot be shown here. Saving keeps it.',
    );
    await user.click(screen.getByTestId('grid-picker-confirm'));
    expect(onConfirm).toHaveBeenCalledWith(seeded);
  });

  it('discloses TWO withdrawn members among one live one, in the plural', () => {
    setup({ selected: ['k-ghostly', 'k-marble', 'k-vanished'] });
    expect(screen.getByTestId('grid-picker-count')).toHaveTextContent('3 selected');
    expect(screen.getByTestId('grid-picker-unlisted')).toHaveTextContent(
      '2 selected matchups are no longer on the board and cannot be shown here. Saving keeps them.',
    );
  });

  it('says nothing about withdrawn members when every selected row is on the board', () => {
    setup({ selected: ['k-marble', 'k-velvet'] });
    expect(screen.queryByTestId('grid-picker-unlisted')).not.toBeInTheDocument();
  });

  // 🔴 Reaches the closed → open RE-SEED effect, which the always-open renders
  // above never execute (`useState`'s initializer covers those). Without this,
  // every mutation of that effect body survived.
  it('re-seeds from `selected` when the picker is re-opened, discarding scratch edits', async () => {
    const onConfirm = vi.fn<(keys: string[]) => void>();
    const onCancel = vi.fn<() => void>();
    const user = userEvent.setup();
    const view = (opened: boolean, selected: string[]) => (
      <GridPicker
        opened={opened}
        axis="matchups"
        items={ITEMS}
        selected={selected}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );
    const { rerender } = render(view(true, ['k-marble']));
    await user.click(optionByKey('k-zephyr')); // scratch edit: marble, zephyr
    expect(screen.getByTestId('grid-picker-count')).toHaveTextContent('2 selected');

    // 🔴 The new seed is deliberately NOT sorted (sorted-by-key would be
    // indigo, velvet) and NOT the list order (indigo comes before velvet in
    // ITEMS) — a re-seed that sorts must not be able to pass this.
    rerender(view(false, ['k-marble']));
    rerender(view(true, ['k-velvet', 'k-indigo'])); // saved elsewhere meanwhile

    expect(screen.getByTestId('grid-picker-count')).toHaveTextContent('2 selected');
    expect(optionByKey('k-zephyr')).toHaveAttribute('aria-selected', 'false');
    expect(optionByKey('k-marble')).toHaveAttribute('aria-selected', 'false');
    await user.click(screen.getByTestId('grid-picker-confirm'));
    expect(onConfirm).toHaveBeenCalledWith(['k-velvet', 'k-indigo']);
  });
});

// ---------------------------------------------------------------------------
// The §11.2 cap — both axes, exactly at and exactly one over
// ---------------------------------------------------------------------------

describe.each(AXES)('GridPicker — the cap on the %s axis', (axis) => {
  const cap = gridPickerCap(axis);
  const { one, many } = noun(axis);

  it(`imports the cap from lib/grids.ts (${axis})`, () => {
    expect(cap).toBe(axis === 'matchups' ? MAX_GRID_MATCHUPS : MAX_GRID_PROMPTS);
    // The fixture must overshoot, or the one-over case has nothing to click.
    expect(CAP_ITEMS.length).toBeGreaterThan(cap);
  });

  it(`is quiet one BELOW the cap, and still quiet exactly AT it`, async () => {
    const { user } = setup({ axis, items: CAP_ITEMS });

    // cap - 1 selections: nothing is blocked, no notice.
    for (const item of CAP_ITEMS.slice(0, cap - 1)) await user.click(optionByKey(item.key));
    expect(screen.getByTestId('grid-picker-count')).toHaveTextContent(`${cap - 1} selected`);
    expect(screen.queryByTestId('grid-picker-cap-notice')).not.toBeInTheDocument();
    expect(optionByKey(CAP_ITEMS[cap - 1].key)).not.toHaveAttribute('aria-disabled');

    // The cap-th selection is ACCEPTED — the boundary is inclusive.
    await user.click(optionByKey(CAP_ITEMS[cap - 1].key));
    expect(optionByKey(CAP_ITEMS[cap - 1].key)).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('grid-picker-count')).toHaveTextContent(`${cap} selected`);
    expect(screen.getByTestId('grid-picker-confirm')).toBeEnabled();
  });

  it(`refuses exactly ONE over the cap, in words, without dropping anything`, async () => {
    const { user, onConfirm } = setup({ axis, items: CAP_ITEMS });
    for (const item of CAP_ITEMS.slice(0, cap)) await user.click(optionByKey(item.key));

    const overflow = CAP_ITEMS[cap]; // the cap+1'th row
    const row = optionByKey(overflow.key);
    expect(row).toHaveAttribute('aria-disabled', 'true');

    await user.click(row);
    expect(optionByKey(overflow.key)).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByTestId('grid-picker-count')).toHaveTextContent(`${cap} selected`);

    // A VISIBLE, honest reason — pinned as a whole string, and wired to the
    // blocked row via aria-describedby so AT reads the same sentence.
    const notice = screen.getByTestId('grid-picker-cap-notice');
    expect(notice).toHaveTextContent(
      `Limit reached: a grid takes at most ${cap} ${many} (${cap} ${axis === 'matchups' ? 'rows' : 'columns'}). Deselect one to choose a different ${one}.`,
    );
    expect(optionByKey(overflow.key).getAttribute('aria-describedby')).toBe(notice.id);

    // Nothing was silently dropped: exactly the cap keys, in click order.
    await user.click(screen.getByTestId('grid-picker-confirm'));
    expect(onConfirm).toHaveBeenCalledWith(CAP_ITEMS.slice(0, cap).map((i) => i.key));
  });

  it(`refuses the one-over row by KEYBOARD too, not just by click`, async () => {
    const { user } = setup({ axis, items: CAP_ITEMS });
    for (const item of CAP_ITEMS.slice(0, cap)) await user.click(optionByKey(item.key));

    const list = screen.getByRole('listbox');
    list.focus();
    // Walk to the cap+1'th option and try Enter, then Space.
    await user.keyboard('{Home}');
    for (let i = 0; i < cap; i += 1) await user.keyboard('{ArrowDown}');
    expect(list).toHaveAttribute('aria-activedescendant', optionByKey(CAP_ITEMS[cap].key).id);
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(optionByKey(CAP_ITEMS[cap].key)).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByTestId('grid-picker-count')).toHaveTextContent(`${cap} selected`);
  });

  it(`carries an OVER-cap incoming selection instead of truncating it, and blocks Save`, async () => {
    const over = CAP_ITEMS.slice(0, cap + 3).map((i) => i.key);
    const { user, onConfirm } = setup({ axis, items: CAP_ITEMS, selected: over });

    expect(screen.getByTestId('grid-picker-count')).toHaveTextContent(`${cap + 3} selected`);
    expect(screen.getByTestId('grid-picker-cap-notice')).toHaveTextContent(
      `${cap + 3} ${many} selected — 3 over the limit of ${cap}. Remove 3 before saving.`,
    );
    const confirm = screen.getByTestId('grid-picker-confirm');
    expect(confirm).toBeDisabled();
    await user.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();

    // Deselecting exactly 3 clears the block and every remaining key survives.
    for (const item of CAP_ITEMS.slice(cap, cap + 3)) await user.click(optionByKey(item.key));
    expect(screen.getByTestId('grid-picker-confirm')).toBeEnabled();
    await user.click(screen.getByTestId('grid-picker-confirm'));
    expect(onConfirm).toHaveBeenCalledWith(CAP_ITEMS.slice(0, cap).map((i) => i.key));
  });
});

// ---------------------------------------------------------------------------
// Keyboard
// ---------------------------------------------------------------------------

describe('GridPicker — keyboard', () => {
  it('walks from the search box into the list and toggles with Enter and Space', async () => {
    const { user, onConfirm } = setup();
    const search = screen.getByRole('searchbox', { name: 'Search matchups' });
    await user.click(search);

    const list = screen.getByRole('listbox');
    // ArrowDown out of the search field lands on the list, first option active.
    await user.keyboard('{ArrowDown}');
    expect(list).toHaveFocus();
    expect(list).toHaveAttribute('aria-activedescendant', optionByKey('k-zephyr').id);

    // Index 0 → 2, toggle with Enter.
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(list).toHaveAttribute('aria-activedescendant', optionByKey('k-quartz').id);
    await user.keyboard('{Enter}');
    expect(optionByKey('k-quartz')).toHaveAttribute('aria-selected', 'true');

    // Index 2 → 1, toggle with Space.
    await user.keyboard('{ArrowUp}');
    expect(list).toHaveAttribute('aria-activedescendant', optionByKey('k-marble').id);
    await user.keyboard(' ');
    expect(optionByKey('k-marble')).toHaveAttribute('aria-selected', 'true');

    // Enter again on the same row turns it OFF, then back ON — so it lands last.
    await user.keyboard('{Enter}{Enter}');
    expect(optionByKey('k-marble')).toHaveAttribute('aria-selected', 'true');

    await user.click(screen.getByTestId('grid-picker-confirm'));
    // Keyboard order, which is neither the DOM order nor alphabetical.
    expect(onConfirm).toHaveBeenCalledWith(['k-quartz', 'k-marble']);
  });

  it('clamps at both ends and jumps with Home and End', async () => {
    setup();
    const list = screen.getByRole('listbox');
    const user = userEvent.setup();
    list.focus();

    await user.keyboard('{ArrowUp}{ArrowUp}{ArrowUp}');
    expect(list).toHaveAttribute('aria-activedescendant', optionByKey('k-zephyr').id);

    await user.keyboard('{End}');
    expect(list).toHaveAttribute('aria-activedescendant', optionByKey('k-velvet').id);
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(list).toHaveAttribute('aria-activedescendant', optionByKey('k-velvet').id);

    await user.keyboard('{Home}');
    expect(list).toHaveAttribute('aria-activedescendant', optionByKey('k-zephyr').id);
  });

  it('resets the active option to the first match when the query changes', async () => {
    const { user } = setup();
    const list = screen.getByRole('listbox');
    list.focus();
    await user.keyboard('{End}');
    expect(list).toHaveAttribute('aria-activedescendant', optionByKey('k-velvet').id);

    await user.type(screen.getByRole('searchbox', { name: 'Search matchups' }), 'lantern');
    const shrunk = screen.getByRole('listbox');
    expect(shrunk).toHaveAttribute('aria-activedescendant', optionByKey('k-quartz').id);
  });

  // 🔴 The clamp on `active` is NOT reachable through the search box (typing
  // resets the index to 0). The case that reaches it is the `items` prop
  // shrinking under a stationary cursor — a member row withdrawn from the shared
  // board while the picker is open, which §11.2 calls normal. Without this test
  // every mutation of that clamp survived.
  it('never points aria-activedescendant at a row that vanished from under it', async () => {
    const user = userEvent.setup();
    const view = (items: GridPickerItem[]) => (
      <GridPicker
        opened
        axis="matchups"
        items={items}
        selected={[]}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    const { rerender } = render(view(ITEMS));
    const list = screen.getByRole('listbox');
    list.focus();
    await user.keyboard('{End}'); // active = index 5 (Velvet mirror)
    expect(list).toHaveAttribute('aria-activedescendant', optionByKey('k-velvet').id);

    // Three rows withdrawn; the cursor was past the new end.
    const shrunk = ITEMS.slice(0, 3);
    rerender(view(shrunk));
    const after = screen.getByRole('listbox');
    const active = after.getAttribute('aria-activedescendant');
    expect(optionKeys()).toEqual(shrunk.map((i) => i.key));
    // It names the LAST surviving row, and — the point — an id that exists.
    expect(active).toBe(optionByKey('k-quartz').id);
    expect(document.getElementById(active ?? '')).toBeInTheDocument();
  });

  it('closes on Escape without swallowing it in the list', async () => {
    const { user, onCancel, onConfirm } = setup();
    screen.getByRole('listbox').focus();
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Accessible names, roles and exposed state
// ---------------------------------------------------------------------------

describe.each(AXES)('GridPicker — accessibility on the %s axis', (axis) => {
  const { one, many } = noun(axis);
  const title = axis === 'matchups' ? 'Choose matchups' : 'Choose prompts';

  it('gives every control an accessible name', () => {
    setup({ axis });
    expect(screen.getByRole('dialog', { name: title })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: `Search ${many}` })).toBeInTheDocument();
    expect(screen.getByRole('listbox', { name: `${many} to include` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Close ${one} picker` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Save ${many}` })).toBeInTheDocument();
  });

  it('marks the list multi-selectable and names every option from its visible text', () => {
    setup({ axis });
    const list = screen.getByRole('listbox');
    expect(list).toHaveAttribute('aria-multiselectable', 'true');
    const options = within(list).getAllByRole('option');
    expect(options).toHaveLength(ITEMS.length);
    for (const item of ITEMS) {
      expect(
        within(list).getByRole('option', {
          name: `${item.name} ${item.description} ${item.meta}`,
        }),
      ).toBeInTheDocument();
    }
  });

  it("does not let the selected badge change an option's accessible name", async () => {
    const { user } = setup({ axis });
    const list = screen.getByRole('listbox');
    const name = 'Copper thistle Rusted spines in a field six configs';
    expect(within(list).getByRole('option', { name })).toBeInTheDocument();
    await user.click(optionByKey('k-copper'));
    // Visible cue present…
    expect(within(optionByKey('k-copper')).getByText('Selected')).toBeInTheDocument();
    // …but the name is unchanged, and the STATE rides on aria-selected.
    expect(within(list).getByRole('option', { name })).toBe(optionByKey('k-copper'));
    expect(optionByKey('k-copper')).toHaveAttribute('aria-selected', 'true');
  });

  it('exposes selected state on every option, selected and not', async () => {
    const { user } = setup({ axis });
    await user.click(optionByKey('k-indigo'));
    for (const item of ITEMS) {
      expect(optionByKey(item.key)).toHaveAttribute(
        'aria-selected',
        item.key === 'k-indigo' ? 'true' : 'false',
      );
    }
  });
});
