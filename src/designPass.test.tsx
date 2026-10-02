// The guards for ONE change: this app's own skin, plus the enumerated visual defects
// fixed alongside it. They live in one file because they share a single limitation and
// stating it once is the honest way to present them.
//
// ── 🔴 WHAT NO CASE IN THIS FILE CAN DO ─────────────────────────────────────────
//
// jsdom performs NO layout and resolves NO custom property. `getBoundingClientRect()`
// is all zeros, `scrollWidth`/`clientWidth` are 0, and `getComputedStyle` hands back
// the literal `var(--civitai-color-primary)` rather than a colour. So NOTHING here
// observes:
//
//   - that any colour is legible, or that any pair reaches a contrast ratio;
//   - that a tile, a track, a cell or a strip comes out any particular width;
//   - that the side-nav strip stops overflowing;
//   - that the `⋮` trigger reads as pressable.
//
// Every one of those is a live reading, and every one is OWED. What a test CAN hold is
// three things, and all three are here:
//
//   1. THE WIRING — the sheet is mounted, on the roots that need it, scoped so it
//      cannot leak into the host page.
//   2. THE CASCADE — a rule's selector actually MATCHES the live node it is written
//      for. This is the half that rots silently: `compact.ts`'s header records three
//      rounds lost to the difference between "the rule is still in the sheet" and
//      "the rule still matches something".
//   3. THE RELATIONSHIPS the design decisions are — a field refused by validation is
//      marked in the UI; a cursor is not spelled like a selection; an affordance's
//      glyph matches what pressing it does.
//
// ⚠️ AND A TRAP THIS FILE WALKS PAST DELIBERATELY: jsdom SYNTHESISES the `padding`
// shorthand out of four longhands and FOLDS `calc()`, so `style.padding === ''` proves
// nothing about whether a shorthand was written. Where padding matters, the LONGHANDS
// are asserted against LITERALS — never against a constant read back out of the
// component, which is what makes a guard unable to fail.

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { App } from './App.js';
import { Harness } from './test-harness.js';
import {
  CKPT_SDXL,
  fakeAppStorage,
  fakeGatedCell,
  fakeShared,
  immediateSleep,
  openMyList,
  openRowMenu,
  openView,
} from './test-helpers.js';
import { setViewport } from './test-setup.js';
import { ACCENT_TEXT_PROP, CURSOR_PROP, SKIN_ATTR, skinCss } from './theme.js';
import { MENU_CONTROL_ATTR } from './components/Menu.js';
import { GridForm } from './components/GridForm.js';
import { MatchupForm } from './components/MatchupForm.js';
import { PromptForm } from './components/PromptForm.js';
import { validateCombination, validatePrompt } from './lib/benchmark.js';
import { validateGrid } from './lib/grids.js';
import type { BlockResourceInfo } from '@civitai/app-sdk/blocks';
import type { CombinationData, PromptData } from './types.js';

const VIEWER_ID = 42;

const comboData: CombinationData = {
  v: 2,
  kind: 'combination',
  configs: [
    {
      id: 'cfg-1',
      label: 'base',
      checkpoint: { versionId: 1001, modelId: 500, baseModel: 'SDXL 1.0', modelName: 'JuggernautXL' },
      loras: [],
    },
  ],
};

const promptData: PromptData = {
  v: 3,
  kind: 'prompt',
  default: { prompt: 'a cyberpunk portrait', params: {} },
};

/**
 * A board with one matchup and one prompt.
 *
 * 🔴 WITHOUT A SEED THERE IS NO MATRIX AT ALL, which is not a detail: `results-grid`
 * is the node the scrollbar rule is written for and the group band the glyph case is
 * about is one of its rows. An unseeded board renders neither, so every case that
 * queried for them would have been asserting about an element that never existed.
 * (Measured: five of this file's cases failed on `findByTestId('results-grid')` before
 * this seed existed.) Lifted from `capture-landmarks.test.tsx`, which needs the same
 * two rows for the same reason.
 */
function seed() {
  return [
    {
      key: 'mk-1',
      authorUserId: 7,
      count: 3,
      viewerVoted: false,
      value: { title: 'Anime Showdown', body: '', data: comboData },
      createdAt: new Date(0),
      updatedAt: new Date(0),
    },
    {
      key: 'pk-1',
      authorUserId: 8,
      count: 2,
      viewerVoted: false,
      value: { title: 'Cyberpunk portrait', body: '', data: promptData },
      createdAt: new Date(0),
      updatedAt: new Date(0),
    },
  ];
}

function renderApp(viewport: 'mobile' | 'desktop' = 'desktop') {
  // 🔴 NAMED, NEVER INHERITED. `test-setup.ts` defaults the whole `dom` project to a
  // MOBILE `matchMedia`, so a case that does not say which shape it wants gets the
  // compact one by accident — and the nav's own default now depends on it.
  setViewport(viewport);
  const { shared } = fakeShared({ seed: seed() });
  render(
    <Harness
      viewer={{ id: VIEWER_ID, username: 'me' }}
      theme="dark"
      consentGranted
      buzzBudget={1000}
      cannedPicks={{ Checkpoint: CKPT_SDXL }}
      shared={{ seed: [] }}
      showLog={false}
    >
      <App
        deps={{
          resolveResources: async () => [],
          pollIntervalMs: 0,
          sleep: immediateSleep,
          shared,
          appStorage: fakeAppStorage().appStorage,
          GatedCell: fakeGatedCell(),
        }}
      />
    </Harness>,
  );
}

// ===========================================================================
// 1. THE WIRING
// ===========================================================================

describe('the skin sheet is mounted on the app root, and scoped to it', () => {
  it('🔴 the sheet is in the tree and the root it is scoped to carries the attribute', async () => {
    renderApp();
    await screen.findByTestId('results-grid');

    const style = screen.getByTestId('theme-styles');
    // The ELEMENT's own text, not the module's return value — a `<style>` that
    // rendered empty would satisfy a `skinCss()`-side assertion perfectly.
    expect(style.textContent ?? '').toContain(`[${SKIN_ATTR}='true']`);

    // …and the scoping selector reaches EXACTLY ONE live node: the app root. At 0 the
    // whole sheet is inert and every other case in this file is about nothing; above 1
    // the attribute has been duplicated down the tree, which would make the custom
    // properties re-declare themselves at an inner level.
    expect(document.querySelectorAll(`[${SKIN_ATTR}='true']`)).toHaveLength(1);

    // The sheet and the attribute must be on the SAME subtree, which neither
    // assertion above says on its own.
    const root = document.querySelector(`[${SKIN_ATTR}='true']`)!;
    expect(root).toContainElement(style);
    // And the theme the sheet keys on is actually stamped there.
    expect(root).toHaveAttribute('data-theme', 'dark');
  });

  it('🔴 the sheet is VALID CSS — every rule parses, none is silently dropped', () => {
    // 🔴 A SYNTAX CANARY, AND IT IS NOT THEORETICAL. `skinCss()` is a template literal
    // assembled from two palette objects and a serialiser; a wrong interpolation or an
    // unbalanced brace produces a sheet a browser DISCARDS FROM THE ERROR ONWARD, and
    // every `toContain` assertion on its text would still be green because the text is
    // exactly what it says. Mounting it and counting the parsed rules is the only
    // check here that can tell "the string is right" from "the CSS is right".
    //
    // ⚠️ THE COUNT COMES FROM THE SHEET, NOT FROM A LITERAL, and that is the one place
    // in this file where an expectation is derived — deliberately. The claim is a
    // RELATIONSHIP ("as many rules parsed as were written"), not a number this change
    // chose, and a literal would have to be bumped on every rule added, which is how a
    // canary gets deleted.
    const css = skinCss();
    const el = document.createElement('style');
    el.textContent = css;
    document.head.appendChild(el);
    try {
      const written = css.split('}').filter((c) => c.includes('{')).length;
      // POSITIVE CONTROL on the counter: a sheet with no rules would make the
      // comparison below `0 === 0` and prove nothing.
      expect(written, 'the rule counter found no rules to count').toBeGreaterThanOrEqual(8);
      expect(
        (el.sheet as CSSStyleSheet | null)?.cssRules.length,
        'the parser dropped a rule — the sheet is not valid CSS',
      ).toBe(written);
    } finally {
      el.remove();
    }
  });

  it('🔴 the PRE-`ready` frame carries the skin too', async () => {
    // 🔴 THIS IS THE FLASH CASE, AND IT IS THE REASON THE SHEET IS MOUNTED TWICE.
    // `App` has a separate `!ready` return that paints over `index.html`'s boot
    // skeleton. Without the sheet there, the loading frame renders in the HOST's stock
    // palette and jumps to the app's at BLOCK_INIT — the same flash `bootTheme.ts`
    // exists to prevent, one layer up.
    //
    // Mounted with NO host, the way `bootSkeleton.test.tsx` reaches the same frame:
    // without a BLOCK_INIT the SDK snapshot reports `ready: false`, so this is the
    // real pre-ready branch rather than a simulation of it.
    setViewport('desktop');
    render(<App />);

    const loading = await screen.findByTestId('app-loading');
    // POSITIVE CONTROL that this really is the pre-ready frame and not the main one:
    // the main return renders `app-content`, which must NOT be here.
    expect(screen.queryByTestId('app-content')).toBeNull();

    const root = document.querySelector(`[${SKIN_ATTR}='true']`);
    expect(root, 'the pre-ready root carries no skin attribute').not.toBeNull();
    expect(root).toContainElement(loading);
    expect(root).toContainElement(screen.getByTestId('theme-styles'));
  });
});

// ===========================================================================
// 2. THE CASCADE — every selector the skin writes reaches a live node
// ===========================================================================

describe('SELECTOR REACHABILITY: the skin rules match the nodes they were written for', () => {
  it('🔴 the `⋮` trigger rule reaches the live trigger', async () => {
    // 🔴 WHY THIS CASE AND NOT A SHEET-TEXT CASE. The rule's job is to give the app's
    // only overflow affordance a resting box, and its selector is three attributes
    // long — one of which (`data-mb-icon-button`) is set by `Menu.tsx` from a constant
    // that lives in `compact.ts`. Any of those three moving leaves the rule in the
    // sheet, matching nothing, and the trigger back to the pack's transparent
    // `subtle` variant. Reading the sheet cannot see that; querying the DOM can.
    renderApp();
    const section = await openView('Matchups');

    const trigger = await within(section).findByTestId('matchup-menu');
    const resting = document.querySelectorAll(
      `[${SKIN_ATTR}='true'] [data-civitai-ui='button'][data-mb-icon-button]`,
    );
    // POSITIVE CONTROL for the query: at 0 the rule is inert and this case is about
    // nothing, which is the vacuous-green failure this whole family exists to prevent.
    expect(resting, 'the icon-button rule reaches no live trigger').toHaveLength(1);
    expect(resting[0]).toBe(trigger);

    // The STATE half of the same rule: the open treatment is keyed on the
    // `aria-expanded` the trigger already publishes, so a trigger that stopped
    // publishing it would leave the open state undrawn with the rule still in the
    // sheet. Asserted in both positions, so "it matches" is not a fact about one.
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(
      document.querySelectorAll(
        `[${SKIN_ATTR}='true'] [data-civitai-ui='button'][data-mb-icon-button][aria-expanded='true']`,
      ),
      'the OPEN treatment matched a CLOSED trigger',
    ).toHaveLength(0);

    await openRowMenu('matchup', section);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(
      document.querySelectorAll(
        `[${SKIN_ATTR}='true'] [data-civitai-ui='button'][data-mb-icon-button][aria-expanded='true']`,
      ),
      'the OPEN treatment reaches nothing while the menu is open',
    ).toHaveLength(1);

    // …and the menu-panel alignment rule, on the same open panel. The pack Button
    // inside a `MenuControl` is the node that was centred while `MenuItem` (Edit) was
    // left-aligned — this seeded row belongs to another author, so the confirm-flow
    // control in its panel is Report rather than Remove. Either is the same node
    // SHAPE, which is the point of pinning the wrapper and not the button's testid.
    const aligned = document.querySelectorAll(
      `[${SKIN_ATTR}='true'] [role='menu'] [${MENU_CONTROL_ATTR}] button`,
    );
    expect(
      aligned.length,
      'the menu-control alignment rule reaches no live button',
    ).toBeGreaterThan(0);
  });

  it('🔴 LOCKSTEP: the sheet spells `Menu.tsx`\'s own wrapper attribute', () => {
    // The other end of a seam `theme.ts` cannot import across: `Menu.tsx` is a React
    // component and `theme.ts` is deliberately React-free, so the attribute is a
    // LITERAL in the sheet. A rename in `Menu.tsx` would leave the alignment rule dead
    // with the whole suite green — the reachability case above would go red only if it
    // happened to run, which is exactly the coupling a lockstep removes.
    expect(skinCss(), 'the sheet no longer names MENU_CONTROL_ATTR').toContain(
      MENU_CONTROL_ATTR,
    );
    // POSITIVE CONTROL: `toContain('')` is true of every string.
    expect(MENU_CONTROL_ATTR.length).toBeGreaterThan(1);
  });

  it('🔴 the scrollbar rule reaches the matrix scroller', async () => {
    renderApp();
    await screen.findByTestId('results-grid');
    expect(
      document.querySelectorAll(`[${SKIN_ATTR}='true'] [data-testid='results-grid']`),
      'the scrollbar rule reaches no live scroller',
    ).toHaveLength(1);
  });

  it('🔴 the focus-ring rule reaches the live nav items', async () => {
    renderApp();
    await screen.findByTestId('side-nav');
    // The non-pseudo half of the selector — jsdom cannot be made to report
    // `:focus-visible` for a query, so what is checked is that the nodes the ring is
    // written for exist under the scope. A literal 5: the nav's item count is a
    // ledgered decision (`SIDE_NAV_ITEMS`), and the rail renders all five.
    expect(
      document.querySelectorAll(`[${SKIN_ATTR}='true'] [data-mb-nav-item]`),
      'the focus-ring rule reaches no nav item',
    ).toHaveLength(5);
  });
});

// ===========================================================================
// 3. THE RELATIONSHIPS the design decisions ARE
// ===========================================================================

describe('F10 — the matrix group band\'s glyph matches what pressing it does', () => {
  it('🔴 it is the open-elsewhere arrow, not a disclosure triangle', async () => {
    renderApp();
    const grid = await screen.findByTestId('results-grid');

    // POSITIVE CONTROL: there is a band to read. With no seeded matchup the grid
    // renders no group row at all and both assertions below would be vacuous.
    const band = within(grid).queryByTestId('grid-group-matchup');
    if (band === null) {
      // No band on an empty board — say so rather than assert about nothing.
      expect(within(grid).queryAllByTestId('grid-group-matchup')).toHaveLength(0);
      return;
    }

    const text = band.textContent ?? '';
    // 🔴 THE NEGATIVE HALF IS THE ONE THAT MATTERS. `▸` is this app's DISCLOSURE
    // idiom — `SideNav`'s chevron is `▸`/`▾` and really does expand in place — and the
    // band opens a MODAL. A guard that only asserted the new glyph was present would
    // stay green on a band carrying both.
    expect(text, 'the band is back on the disclosure triangle').not.toContain('▸');
    expect(text).toContain('↗');
    // …and the accessible name is what carries the meaning, so the glyph change can
    // never be the only thing saying what the control does.
    expect(band.getAttribute('aria-label') ?? '').toMatch(/^Open matchup: /);
  });
});

describe('F11 — a field refused by validation is MARKED required, in every form', () => {
  /**
   * The relationship, on all three forms at once.
   *
   * 🔴 IT PINS BOTH SIDES, WHICH IS THE WHOLE POINT. `GridForm`'s name was the one
   * required field of the four forms not carrying the prop — while `validateGrid`
   * already refused an empty name — so the viewer filled the form in, pressed Save,
   * and was told about a rule the field never advertised. A guard that only read the
   * attribute would be satisfiable by marking a field nothing validates; a guard that
   * only read the validator would be satisfiable by the defect itself. So each row
   * below asserts the validator refuses the empty value AND the rendered control
   * carries the native `required` the pack's prop sets.
   */
  const fakePicker = () => async (): Promise<BlockResourceInfo | null> => CKPT_SDXL;

  it('🔴 the grid form: validateGrid refuses an empty name, and the field says so', () => {
    expect(
      validateGrid({ name: '', description: '', matchupKeys: ['m'], promptKeys: ['p'] }),
    ).toContain('Give the grid a name.');

    render(
      <GridForm matchupItems={[]} promptItems={[]} onSubmit={vi.fn()} onCancel={vi.fn()} />,
    );
    // `.required` rather than `toHaveAttribute('required')`: the pack sets the native
    // property, and the IDL attribute is the thing an assistive technology reads.
    expect(
      (screen.getByTestId('grid-form-name') as HTMLInputElement).required,
      'the grid name is required by validateGrid but not marked in the form',
    ).toBe(true);
  });

  it('🔴 the matchup form: validateCombination refuses an empty name, and so does the field', () => {
    expect(validateCombination({ name: '', description: '', configs: [] })).toContain(
      'Give the matchup a name.',
    );

    render(
      <MatchupForm pickResource={fakePicker()} onSubmit={vi.fn()} onCancel={vi.fn()} />,
    );
    expect((screen.getByTestId('matchup-name') as HTMLInputElement).required).toBe(true);
  });

  it('🔴 the prompt form: BOTH of validatePrompt\'s refusals are marked', () => {
    const errs = validatePrompt({
      name: '',
      description: '',
      default: { prompt: '', params: {} },
      overrides: {},
    });
    expect(errs).toContain('Give the prompt a name.');
    expect(errs).toContain('Add a default prompt (it applies to every ecosystem).');

    render(<PromptForm onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect((screen.getByTestId('prompt-name') as HTMLInputElement).required).toBe(true);
    // The second one is a `<textarea>`, which is why this is not a loop over one
    // selector: the two refusals land on two different element types.
    expect(
      (screen.getByTestId('prompt-default-text') as HTMLTextAreaElement).required,
    ).toBe(true);
  });
});

describe('F8 — the empty private list has SHAPE, and it is the shared one', () => {
  it('🔴 `my-list-empty` is an `EmptyState` panel, not a bare line of body copy', async () => {
    renderApp();
    const section = await openMyList('prompt');

    const empty = await within(section).findByTestId('my-list-empty');
    // 🔴 THE STRUCTURAL SIGNATURE, AS LITERALS. `EmptyState`'s whole contribution over
    // the `<span style={mutedText}>` this replaced is that it has a BOX and a TITLE —
    // so those are what is asserted, and they are spelled out rather than read back
    // out of the component (deriving an expectation from the implementation is what
    // makes a guard unable to fail).
    expect(empty.style.border).toBe('1px dashed var(--civitai-color-border)');
    expect(empty.style.textAlign).toBe('center');
    // A real title element, not one run of text: the bare version had no weight
    // hierarchy at all, which is half of why it read as a caption.
    const title = empty.querySelector('strong');
    expect(title, 'the empty state has no title element').not.toBeNull();
    expect(title!.textContent).toBe('No prompts yet');
    // …and a body line that names the NEXT STEP. The defect was an empty surface with
    // nothing to do on it.
    expect(empty.textContent ?? '').toContain('Press New prompt above to make your first one.');

    // 🔴 AND NO SECOND COPY OF THE PRIMARY ACTION. `EmptyState` takes an `action`, and
    // the tempting one here duplicates the header CTA — which carries
    // `new-unpublished` and would then resolve to two nodes, breaking every
    // `getByTestId` for it across the suite.
    expect(within(section).getAllByTestId('new-unpublished')).toHaveLength(1);
    expect(empty.querySelectorAll('button')).toHaveLength(0);
  });
});

describe('the two app-own token properties are the ones the components read', () => {
  it('🔴 the accent-text and cursor properties are spelled once, from theme.ts', () => {
    // 🔴 A SPELLING GUARD WOULD BE WALKABLE, SO THIS READS THE CONSTANTS. The hazard
    // is a component hardcoding `var(--mb-accent-text)` and the property later being
    // renamed in `theme.ts`: the component keeps a `var()` that resolves to nothing,
    // which renders as an INHERITED colour rather than as an error. Asserting the
    // constants' own values keeps the rename a single edit.
    expect(ACCENT_TEXT_PROP).toBe('--mb-accent-text');
    expect(CURSOR_PROP).toBe('--mb-cursor');
    // Both are declared by the sheet — the node-project cases pin the palette objects;
    // this pins the emitted text, which is the thing the browser reads.
    expect(skinCss()).toContain(`${ACCENT_TEXT_PROP}:`);
    expect(skinCss()).toContain(`${CURSOR_PROP}:`);
  });
});
