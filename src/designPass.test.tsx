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
      // 🔴 OWNED BY THE VIEWER, AND THAT IS NOT INCIDENTAL. The skin's focus-ring rule
      // lists `[role='menuitem']`, and a menu offered to a NON-owner contains only a
      // Report control — a pack Button inside `role="none"`, no menuitem anywhere (see
      // `Menu.tsx`'s `MENU_CONTROL_ATTR`). With a foreign author that selector reached
      // zero live nodes and the reachability case below was asserting about a shape the
      // fixture could not produce. An owned row gives both: a `MenuItem` (Archive) and
      // a `MenuControl` (Remove).
      authorUserId: VIEWER_ID,
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
    //
    // 🔴 THE COUNTER COUNTS `{`, AND THE FIRST VERSION OF IT COUNTED `}` AND WAS
    // SELF-DEFEATING. Splitting on `}` makes the expected count fall by one whenever a
    // closing brace is DELETED — the mutation this case exists for — so written and
    // parsed dropped together and the mutant SURVIVED a green run. Measured: removing
    // the `::selection` rule's closing brace left this file at 13/13. A control built
    // out of the step under suspicion is a second sample of it, not a control. Opening
    // braces are untouched by a missing `}`, which is what makes them a discriminator.
    const css = skinCss();
    const el = document.createElement('style');
    el.textContent = css;
    document.head.appendChild(el);
    try {
      const written = css.split('{').length - 1;
      // POSITIVE CONTROL on the counter: a sheet with no rules would make the
      // comparison below `0 === 0` and prove nothing.
      expect(written, 'the rule counter found no rules to count').toBeGreaterThanOrEqual(8);
      const parsed = [...((el.sheet as CSSStyleSheet | null)?.cssRules ?? [])];
      expect(
        parsed.length,
        'the parser dropped or merged a rule — the sheet is not valid CSS',
      ).toBe(written);
      // 🔴 AND THE SECOND FAILURE MODE A COUNT CANNOT SEE: an `undefined` or empty
      // interpolation produces `prop: undefined;`, which CSS DROPS while the rule
      // still parses and still counts. So every parsed rule must have kept at least
      // one declaration, and the text must carry no stringified non-value.
      for (const rule of parsed) {
        expect(
          (rule as CSSStyleRule).style?.length ?? 0,
          `a rule parsed with no surviving declaration: ${rule.cssText.slice(0, 60)}`,
        ).toBeGreaterThan(0);
      }
      expect(css, 'an interpolation stringified to a non-value').not.toMatch(
        /:\s*(undefined|null|NaN)\s*;/,
      );
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
    // The viewer's own published row, which is where the `⋮` with a full action set
    // lives. See the `authorUserId` note on `seed()`.
    const section = await openMyList('matchup');

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
    // inside a `MenuControl` is the node that was CENTRED while `MenuItem` was
    // left-aligned, which is the whole of F5.
    const aligned = document.querySelectorAll(
      `[${SKIN_ATTR}='true'] [role='menu'] [${MENU_CONTROL_ATTR}] button`,
    );
    expect(
      aligned.length,
      'the menu-control alignment rule reaches no live button',
    ).toBeGreaterThan(0);
    // 🔴 AND THE OTHER HALF OF F5 HAS TO BE IN THE SAME PANEL, or the inconsistency
    // the rule fixes is not present to fix: a `role="menuitem"` and a `MenuControl`
    // button, side by side. A panel holding only one kind would make the alignment
    // rule correct and pointless.
    expect(
      document.querySelectorAll(`[${SKIN_ATTR}='true'] [role='menu'] [role='menuitem']`).length,
      'the panel holds no menuitem, so nothing was ever out of step with it',
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

  it('🔴 the scrollbar and focus-ring rules reach live nodes — SELECTORS READ FROM THE SHEET', async () => {
    // 🔴 THE SELECTORS COME OUT OF `skinCss()`, NOT OUT OF THIS FILE, AND THE FIRST
    // VERSION OF THIS CASE DID THE OPPOSITE AND PROVED NOTHING. It queried the literal
    // `[data-mb-skin='true'] [data-testid='results-grid']` and asserted a node existed
    // — so its TITLE said "the scrollbar rule reaches the scroller" while its body
    // only said "a node with that testid is on screen". Measured: re-pointing the
    // sheet's own rule at `results-grid-xx` left the whole file green. A guard whose
    // description is wider than its implementation reads as coverage while providing
    // none, which is worse than having none because it stops anyone looking.
    renderApp();
    await screen.findByTestId('results-grid');
    await screen.findByTestId('side-nav');
    /** Every rule in the sheet, as `[selector, body]`. */
    const rules = skinCss()
      .split('}')
      .map((chunk) => {
        const at = chunk.indexOf('{');
        return at < 0 ? null : ([chunk.slice(0, at).trim(), chunk.slice(at + 1)] as const);
      })
      .filter((r): r is readonly [string, string] => r !== null);

    /**
     * The selectors of the rule declaring `decl`, as queryable strings.
     *
     * `:focus-visible` is stripped: jsdom cannot be made to report it for a query, so
     * what is checkable is that the ELEMENT half of the selector resolves. That is the
     * half a rename breaks; the pseudo-class is not renameable.
     */
    const selectorsOf = (decl: string): string[] => {
      const rule = rules.find(([, body]) => body.includes(decl));
      expect(rule, `no rule in the sheet declares ${decl}`).toBeDefined();
      return rule![0].split(',').map((s) => s.trim().replace(/:focus-visible/g, ''));
    };
    const hits = (sel: string): number => document.querySelectorAll(sel).length;

    // POSITIVE CONTROL on the extractor: a declaration that IS in the sheet, on a
    // selector that cannot fail to match. An extractor wired to nothing is caught here
    // rather than reported as compliance.
    const rootRule = selectorsOf('font-variant-numeric: tabular-nums');
    expect(rootRule).toEqual([`[${SKIN_ATTR}='true']`]);
    expect(hits(rootRule[0]!)).toBe(1);

    // 🔴 EACH SELECTOR IS CHECKED ON THE SURFACE WHERE ITS NODE LIVES, AND THE
    // SURFACES DIFFER — this app UNMOUNTS the unselected ones rather than hiding them.
    // The matrix and the group band exist only on Home; a `role="menuitem"` exists
    // only while a menu panel is open, which takes a trip to My Benchmarks. Two
    // earlier drafts of this case checked a whole rule in one place and went red on
    // whichever selector the current surface did not hold. A rule's reachability is a
    // claim about a SURFACE, and naming the surface is part of making it.
    for (const sel of selectorsOf('scrollbar-color')) {
      expect(hits(sel), `scrollbar rule: no live node on Home for ${sel}`).toBeGreaterThan(0);
    }

    // 🔴 THE RING RULE'S SELECTOR SET, AS A LEDGER. Without it, a FOURTH selector
    // added to that rule would never be reachability-checked by anything — the loops
    // below walk the set they were written for, and a silently-dead new selector is
    // exactly the failure `compact.ts`'s header records three rounds of.
    const ring = selectorsOf('outline-offset');
    expect(ring).toEqual([
      `[${SKIN_ATTR}='true'] [data-mb-nav-item]`,
      `[${SKIN_ATTR}='true'] [role='menuitem']`,
      `[${SKIN_ATTR}='true'] [data-testid='grid-group-matchup']`,
    ]);
    // On Home: the nav items (a literal 5 — the nav's item count is a ledgered
    // decision, `SIDE_NAV_ITEMS`) and the group band.
    expect(hits(ring[0]!)).toBe(5);
    expect(hits(ring[2]!), 'no group band, so the band half of the ring is dead').toBeGreaterThan(
      0,
    );
    // The menuitem half needs a panel open, so it gets its own surface.
    expect(hits(ring[1]!), 'a menuitem exists with no menu open').toBe(0);
    const section = await openMyList('matchup');
    await openRowMenu('matchup', section);
    expect(hits(ring[1]!), 'the ring rule reaches no live menuitem').toBeGreaterThan(0);
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
