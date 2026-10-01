// The matrix's DRILL-IN affordances, and the corner label that names its axes.
//
// 🔴 THE POINT OF THIS FILE IS THE NEGATIVE CONTROL. "The group band opens the
// matchup" is satisfied by wiring the WHOLE row header — which is not what was
// asked for and is actively wrong: a config row is one checkpoint+LoRA setup
// INSIDE the matchup, so making the config label a link to its parent misfires
// under anyone aiming at the label. Every positive case below therefore has a
// sibling asserting that a click somewhere adjacent fires NOTHING, and the counts
// are EXACT (`toHaveBeenCalledTimes`, never `toHaveBeenCalled`) because an
// "at least once" is satisfied by the over-wired version this exists to prevent.
//
// ⚠ jsdom performs NO LAYOUT. The band is asserted to SPAN the grid (`gridColumn:
// 1 / -1`, a declared style) and to be a real focusable `<button>` with an
// accessible name — but nothing here can observe that it READS as a band. That is
// a live-browser claim and it is not made in this file.

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { GRID_CORNER_LABEL, ResultsGrid } from './ResultsGrid.js';
import { palette } from '../theme.js';
import { fakeGatedCell } from '../test-helpers.js';
import { flattenConfigs } from '../lib/benchmark.js';
import type { CombinationRow, PromptRow } from '../types.js';

const c = palette();

/**
 * TWO matchups, the first with TWO configs.
 *
 * 🔴 THE FIXTURE IS BUILT SO A HARDCODED ANSWER CANNOT PASS. Two groups means a
 * band handler that always reports the first matchup fails on the second; two
 * configs in group 1 means "the band renders once per GROUP, not once per row" is
 * observable; two prompts means a column handler that always reports column 0
 * fails. Keys, names and vote counts are pairwise distinct for the same reason.
 */
const matchupA: CombinationRow = {
  key: 'mk-alpha',
  count: 12,
  authorUserId: 1,
  name: 'Anime Showdown',
  description: '',
  data: {
    v: 2,
    kind: 'combination',
    configs: [
      {
        id: 'cfg-a1',
        label: 'base',
        checkpoint: { versionId: 1001, modelId: 500, baseModel: 'SDXL 1.0', modelName: 'JuggernautXL' },
        loras: [],
      },
      {
        id: 'cfg-a2',
        label: 'detail',
        checkpoint: { versionId: 1001, modelId: 500, baseModel: 'SDXL 1.0', modelName: 'JuggernautXL' },
        loras: [{ versionId: 2002, weight: 0.8 }],
      },
    ],
  },
};
const matchupB: CombinationRow = {
  key: 'mk-bravo',
  count: 5,
  authorUserId: 1,
  name: 'Flux Face-off',
  description: '',
  data: {
    v: 2,
    kind: 'combination',
    configs: [
      {
        id: 'cfg-b1',
        label: 'plain',
        checkpoint: { versionId: 3003, modelId: 700, baseModel: 'Flux.1 D', modelName: 'FluxBase' },
        loras: [],
      },
    ],
  },
};
const promptOne: PromptRow = {
  key: 'qk-tango',
  count: 9,
  authorUserId: 1,
  name: 'Portrait',
  description: '',
  data: { v: 3, kind: 'prompt', default: { prompt: 'a', params: {} } },
};
const promptTwo: PromptRow = {
  key: 'qk-whisky',
  count: 4,
  authorUserId: 1,
  name: 'Landscape',
  description: '',
  data: { v: 3, kind: 'prompt', default: { prompt: 'b', params: {} } },
};

/**
 * 🔴 NO `wired: false` VARIANT ANY MORE, and that is the point. `onOpenMatchup` and
 * `onOpenPrompt` are REQUIRED props now, so a fixture cannot decline them and the
 * inert `<div>` shape they used to produce does not exist. Production never rendered
 * it — `App.tsx` is the one call site and has always passed both — so the old
 * "renders an INERT band when no handler is wired" case was covering a branch that
 * only this file could reach. "Never a dead control" is a property of the type now.
 */
function renderGrid() {
  const onOpenMatchup = vi.fn();
  const onOpenPrompt = vi.fn();
  render(
    <ResultsGrid
      configs={flattenConfigs([matchupA, matchupB])}
      prompts={[promptOne, promptTwo]}
      results={[]}
      runs={{}}
      c={c}
      buzzTotal={5000}
      GatedCell={fakeGatedCell()}
      onRunCell={vi.fn()}
      onConfirmRun={vi.fn()}
      onResumeRun={vi.fn()}
      onCancelRun={vi.fn()}
      onOpenMatchup={onOpenMatchup}
      onOpenPrompt={onOpenPrompt}
    />,
  );
  return { onOpenMatchup, onOpenPrompt };
}

// ---------------------------------------------------------------------------
// The GROUP BAND
// ---------------------------------------------------------------------------

describe('the matchup group band opens the matchup', () => {
  it('renders ONE band per matchup group, not one per config row', () => {
    renderGrid();
    // 3 config rows, 2 groups. A band emitted per row would be 3.
    expect(screen.getAllByTestId('grid-row-header')).toHaveLength(3);
    expect(screen.getAllByTestId('grid-group-matchup')).toHaveLength(2);
    expect(
      screen.getAllByTestId('grid-group-matchup').map((el) => el.getAttribute('data-combo-key')),
    ).toEqual(['mk-alpha', 'mk-bravo']);
  });

  it('fires onOpenMatchup EXACTLY ONCE with the clicked group’s comboKey', async () => {
    const { onOpenMatchup, onOpenPrompt } = renderGrid();
    const bands = screen.getAllByTestId('grid-group-matchup');

    await userEvent.click(bands[0]!);
    expect(onOpenMatchup).toHaveBeenCalledTimes(1);
    expect(onOpenMatchup).toHaveBeenLastCalledWith('mk-alpha');
    // Opening a matchup is not opening a prompt.
    expect(onOpenPrompt).toHaveBeenCalledTimes(0);

    // 🔴 THE MOVING CONTROL. Without a second group, a handler hardcoded to
    // 'mk-alpha' — or one closing over the first row of the loop — passes.
    await userEvent.click(bands[1]!);
    expect(onOpenMatchup).toHaveBeenCalledTimes(2);
    expect(onOpenMatchup).toHaveBeenLastCalledWith('mk-bravo');
  });

  it('🔴 NEGATIVE CONTROL: a click on the config row fires NOTHING', async () => {
    const { onOpenMatchup, onOpenPrompt } = renderGrid();

    // The config LABEL — the most likely mis-aim, and the element a viewer's
    // pointer actually lands on when they read the row.
    for (const label of screen.getAllByTestId('grid-config-label')) {
      await userEvent.click(label);
    }
    // …and the row header itself, which is what an over-wired implementation
    // would have made clickable.
    for (const header of screen.getAllByTestId('grid-row-header')) {
      await userEvent.click(header);
    }

    expect(onOpenMatchup).toHaveBeenCalledTimes(0);
    expect(onOpenPrompt).toHaveBeenCalledTimes(0);
  });

  it('🔴 POSITIVE CONTROL on that negative: the same render DOES open from the band', async () => {
    // Without this, the case above is satisfied by a render in which nothing is
    // wired at all (a missing prop, a crashed subtree) — an absence that proves
    // the opposite of what it looks like.
    const { onOpenMatchup } = renderGrid();
    await userEvent.click(screen.getAllByTestId('grid-config-label')[0]!);
    expect(onOpenMatchup).toHaveBeenCalledTimes(0);
    await userEvent.click(screen.getAllByTestId('grid-group-matchup')[0]!);
    expect(onOpenMatchup).toHaveBeenCalledTimes(1);
  });

  it('is a real button that spans the row, with an accessible name naming the matchup', () => {
    renderGrid();
    const band = screen.getAllByTestId('grid-group-matchup')[0]!;

    // 🔴 A `<div onClick>` IS NOT ACCEPTABLE: it is not focusable, Enter/Space do
    // not activate it, and it exposes no name. Assert the ELEMENT, the ROLE and
    // the NAME — all three, because a div with `role="button"` still fails the
    // first and a button with no text still fails the last.
    expect(band.tagName).toBe('BUTTON');
    expect(band).toHaveAttribute('type', 'button');
    expect(band).toHaveAccessibleName('Open matchup: Anime Showdown');
    // ⚠ NOT `role="tab"`. The controls this replaced were tabs; a query ported
    // from the old strip finds nothing here.
    expect(within(screen.getByTestId('results-grid')).queryAllByRole('tab')).toEqual([]);

    // The band spans every track — the structural half of "a table section
    // header, not a row label". (jsdom resolves the declared style; it performs
    // no layout, so this is the declaration and not the rendering.)
    expect(band.style.gridColumn).toBe('1 / -1');
  });

  it('🔴 UNDERLINES the matchup NAME, and only the name', () => {
    // 🔴 WHY THIS IS A GUARD AND NOT A STYLE NIT. `cursor: pointer` was this band's
    // ONLY affordance, and a pointer cursor is invisible until the pointer is already
    // on the control — and never appears at all on a touch device. The operator asked
    // for an underline for exactly that reason: without it nothing says the text is a
    // control.
    //
    // 🔴 THE PREDICATE IS SHARED WITH `ResourceName`: a control gets the underline, a
    // non-control does not. The band is a control (it opens the matchup detail);
    // `ResourceName` underlines a title that has a `modelId` and leaves one without at
    // `textDecoration: 'none'`. ⚠️ Said here only because this cross-reference has now
    // been wrong in both directions — it once claimed `ResourceName` makes the OPPOSITE
    // argument, which was true before `civitai/civitai` #5250 and is not now.
    //
    // ⚠ jsdom performs NO layout, so this reads the DECLARED inline style. It cannot
    // say the underline is VISIBLE, only that the app declares it.
    renderGrid();
    const band = screen.getAllByTestId('grid-group-matchup')[0]!;
    const name = within(band).getByTestId('grid-group-matchup-name');
    expect(name).toHaveTextContent('Anime Showdown');
    expect(name).toHaveStyle({ textDecoration: 'underline' });

    // 🔴 AND ONLY THE NAME. The band also carries a disclosure glyph and the vote
    // count; underlining those would read as three separate links on one control.
    expect(['', 'none']).toContain(band.style.textDecoration);
  });

  it('activates from the keyboard, which is what being a button buys', async () => {
    const { onOpenMatchup } = renderGrid();
    const band = screen.getAllByTestId('grid-group-matchup')[1]!;
    band.focus();
    expect(band).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(onOpenMatchup).toHaveBeenCalledTimes(1);
    expect(onOpenMatchup).toHaveBeenLastCalledWith('mk-bravo');
  });

  // ⚠️ DELETED: "renders an INERT band when no handler is wired — never a dead
  // button". It asserted `band.tagName === 'DIV'` for a fixture that omitted
  // `onOpenMatchup`. Both drill-in props are required now, so that state is
  // unconstructable and the branch that produced it is gone from `ResultsGrid`. The
  // claim it stood for — the band is never a dead control — is carried by the
  // `tagName === 'BUTTON'` + accessible-name case above, which now holds for EVERY
  // render rather than for the wired ones.
});

// ---------------------------------------------------------------------------
// The COLUMN HEADER
// ---------------------------------------------------------------------------

describe('the prompt column header opens the prompt', () => {
  it('fires onOpenPrompt EXACTLY ONCE with the clicked column’s promptKey', async () => {
    const { onOpenPrompt, onOpenMatchup } = renderGrid();
    const headers = screen.getAllByTestId('grid-col-header');
    expect(headers).toHaveLength(2);

    await userEvent.click(headers[0]!);
    expect(onOpenPrompt).toHaveBeenCalledTimes(1);
    expect(onOpenPrompt).toHaveBeenLastCalledWith('qk-tango');
    expect(onOpenMatchup).toHaveBeenCalledTimes(0);

    // The moving control, same reasoning as the band's.
    await userEvent.click(headers[1]!);
    expect(onOpenPrompt).toHaveBeenCalledTimes(2);
    expect(onOpenPrompt).toHaveBeenLastCalledWith('qk-whisky');
  });

  it('🔴 NEGATIVE CONTROL: the corner cell is not a column, and opens nothing', async () => {
    const { onOpenPrompt, onOpenMatchup } = renderGrid();
    await userEvent.click(screen.getByTestId('grid-corner'));
    expect(onOpenPrompt).toHaveBeenCalledTimes(0);
    expect(onOpenMatchup).toHaveBeenCalledTimes(0);
  });

  it('🔴 UNDERLINES the prompt NAME, and only the name', () => {
    // The column-header half of the same claim — see the band case above for why an
    // underline rather than `cursor: pointer` alone.
    renderGrid();
    const header = screen.getAllByTestId('grid-col-header')[0]!;
    const name = within(header).getByTestId('grid-col-header-name');
    expect(name).toHaveStyle({ textDecoration: 'underline' });
    // The vote-count line beside it must NOT be underlined — one link per control.
    expect(['', 'none']).toContain(header.style.textDecoration);
  });

  it('carries an accessible name naming the prompt', () => {
    renderGrid();
    const header = screen.getAllByTestId('grid-col-header')[0]!;
    expect(header.tagName).toBe('BUTTON');
    expect(header).toHaveAccessibleName('Open prompt: Portrait');
  });
});

// ---------------------------------------------------------------------------
// The CORNER LABEL
// ---------------------------------------------------------------------------

describe('the corner cell names the axes in the app’s own vocabulary', () => {
  it('🔴 renders the WHOLE normalised string, exactly', () => {
    renderGrid();
    // The whole string, not a keyword. A keyword guard on "matchups" is walkable
    // by a reword ("matchup rows × prompts"), and this repo has been bitten by
    // exactly that — see `manifest.test.ts`'s description guard.
    const text = (screen.getByTestId('grid-corner').textContent ?? '').replace(/\s+/g, ' ').trim();
    expect(text).toBe('matchups × prompts');
    // …and the exported constant IS what is rendered, so the guard cannot drift
    // from the component by someone editing only one of them.
    expect(text).toBe(GRID_CORNER_LABEL);
  });

  it('🔴 uses U+00D7 MULTIPLICATION SIGN — a plain ASCII "x" must fail', () => {
    renderGrid();
    const text = (screen.getByTestId('grid-corner').textContent ?? '').replace(/\s+/g, ' ').trim();
    // Asserted by CODEPOINT, not by eye: the two characters are visually near
    // identical in most fonts, and the string assertion above would pass a review
    // that replaced one with the other.
    const codepoints = [...text].map((ch) => ch.codePointAt(0));
    expect(codepoints).toContain(0x00d7);
    expect(codepoints).not.toContain(0x78); // 'x'
    expect(codepoints).not.toContain(0x58); // 'X'
    // The old label is gone, and the whole-string assertion above is what makes
    // this an "and", not an "or".
    expect(text).not.toContain('configs');
  });
});
