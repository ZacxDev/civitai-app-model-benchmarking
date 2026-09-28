// 🔴 THE CROSS-REPO CAPTURE CONTRACT. Every landmark an external screenshot
// recipe needs is addressable BY NAME here, not by position.
//
// ── WHY THIS FILE EXISTS (card 449, re-aimed by the IA refactor) ────────────
//
// `datapacket-talos`'s app-capture recipe
// (`.claude/skills/app-capture/scripts/recipes/model-benchmarking.json`) drives a
// real browser against this block to produce the store-listing screenshots a
// PLATFORM MODERATOR reviews. It used to select the three top-level tabs
// `[data-testid='view-switch'] > button:nth-of-type(1|2|3)` — a POSITIONAL
// selector that silently re-points at the wrong panel the moment a tab is
// reordered or added, and a capture of the wrong view still exits 0, so nothing
// downstream notices. Card 449 replaced that with per-tab NAMES, and this file
// pinned them.
//
// 🔴 THE IA REFACTOR DELETED THE TABS. `view-switch`, `view-switch-matchups`,
// `view-switch-prompts` and `view-switch-grid` DO NOT EXIST: the app became one page
// with three sections and one Contribute menu.
//
// 🔴 AND THE SIDEBAR CHANGE HAS NOW DELETED THE CONTRIBUTE MENU TOO. `contribute-trigger`
// and `contribute-menu-items` are GONE; the page's primary navigation is a SIDEBAR
// (`side-nav`) and its community boards are behind a BOARD SUBNAV (`board-nav`), one
// board mounted at a time.
//
//   ⚠️ THE CAPTURE RECIPE MUST BE RE-POINTED, FOR THE SECOND TIME, AND IT IS NOT OURS
//   TO EDIT. It lives in `civitai/civitai` at
//   `.claude/skills/app-capture/scripts/recipes/model-benchmarking.json`, and it pins
//   BOTH `[data-testid='contribute-trigger']` and `waitForText: "Build a grid"` — both
//   of which die with this change. Until that follow-up lands, a capture against this
//   version fails `element_not_found` on its first step. That PR is deliberately
//   sequenced AFTER this one (the new selector names do not exist until this lands) and
//   this file is the list it should be written from. Nothing in another repo is touched
//   here.
//
//   🔵 THE UPSIDE, WORTH STATING BECAUSE IT IS THE REASON THIS MIGHT ADD SCREENSHOTS
//   RATHER THAN ONLY REPAIR ONE: the one-page IA rendered 2166 CSS px and the host sizes
//   the iframe to the VIEWPORT inside an `overflow: hidden` parent, so `section-matchups`
//   (y 1175..1482) and `section-prompts` (y 1500..2142) were below the iframe edge at
//   EVERY tested viewport height and could not be photographed at all. One board at a
//   time makes the page far shorter, so those two boards may become photographable.
//   ⚠️ NOT MEASURED — a capture recipe can only be measured against a RELEASED
//   artifact, and this is unreleased. It is a hypothesis for that follow-up, not a
//   result.
//
// ── WHAT THIS FILE PINS, AND WHY EACH PART IS HERE ──────────────────────────
//
//   1. EXISTENCE — each landmark resolves, exactly once. The bare claim.
//   2. A LEDGER over the PAGE SECTIONS — the set of section-shaped nodes is
//      EXACTLY the three ledgered ones, so a fourth section being added without
//      being ledgered fails here rather than silently leaving the recipe
//      half-blind, and so does one being removed or renamed.
//   3. THE NAME→SURFACE MAPPING, asserted BEHAVIOURALLY and against LITERAL
//      expected values — never derived from the component's own tables. A
//      structural check alone is walkable by putting the right names on the wrong
//      elements, which is precisely the defect class ("the capture succeeds, of
//      the wrong thing") this file removes.
//
// ⚠️ WHAT THE LEDGER CLOSES, STATED NARROWLY, BECAUSE IT USED TO BE OVERSTATED.
// This header said the ledger makes "a landmark being ADDED without being ledgered"
// fail. That was true only for landmarks added as `<section>` elements: the growth
// check was `querySelectorAll('section')`, i.e. keyed on the TAG. Measured with two
// mutants — a new landmark added as `<div data-testid="section-featured">` left all
// 11 cases GREEN; the identical node as a bare `<section>` turned 1 of 11 RED. The
// closure below is now tag-independent for the SECTION family (marker attribute,
// element type, or `section-*` testid — any of the three is caught).
//
// It is still NOT a closure over every landmark shape. A new `<button>` or `<nav>`
// carrying some unrelated testid is not ledgered and cannot be without enumerating
// every testid on the page, which would fail on every unrelated UI change and stop
// being read. So: sections are growth-closed; a non-section landmark added to the
// talos recipe must be added to `LANDMARKS` by whoever writes that step, and this
// file cannot make them.
//
// ⚠ ROLES HAVE CHANGED TWICE. The original strip's controls exposed `role="tab"`;
// the one-page landmarks did not (the Contribute trigger and the matchup band were
// `button`s, the sections `<section>` elements with no role), so `getAllByRole('tab')`
// found only the per-section My/Community sub-tabs. Those sub-tabs are now deleted and
// the BOARD SUBNAV is a `SegmentedControl`, so `role="tab"` is back — and it names
// `Grids` / `Matchups` / `Prompts`, which is exactly what the retired-strip case used
// to forbid. That case is rewritten below to assert the STRUCTURE (every tab on the
// page belongs to `board-nav`) rather than the WORDS, because a word-based guard on a
// legitimate board name is a guard that has to be deleted the first time it is right.

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Harness } from './test-harness.js';

import { App } from './App.js';
import {
  CKPT_SDXL,
  fakeAppStorage,
  fakeGatedCell,
  fakeShared,
  immediateSleep,
} from './test-helpers.js';
import type { CombinationData, PromptData } from './types.js';

/**
 * Every landmark the capture recipe may address, as
 * `[testid, how to verify it, the literal expected outcome]`.
 *
 * Literals on BOTH sides — this table IS the contract the recipe buys. `contains`
 * means "this landmark is a container, and the named testid must be inside it";
 * `click` means "pressing it must make the named testid appear".
 */
const LANDMARKS = [
  // 🔴 THE NAV LANDMARKS THAT REPLACED `contribute-trigger`. A recipe needs a way to
  // reach each community board and the viewer's own surface; these are it.
  ['side-nav', 'contains', 'nav-home'],
  ['board-nav', 'contains', 'board-nav-grids'],
  ['nav-my', 'click', 'nav-my-group'],
  // The OPEN grid and its matrix, which are on Home whichever board is selected.
  ['section-open-grid', 'contains', 'results-grid'],
  ['section-grids', 'contains', 'grids-list'],
  ['grids-all-section', 'contains', 'grids-list'],
  ['board-nav-matchups', 'click', 'section-matchups'],
  ['board-nav-prompts', 'click', 'section-prompts'],
  ['grid-group-matchup', 'click', 'matchup-detail'],
  // 🔴 ADDED EARLIER: it had a behavioural case at the bottom of this file and was
  // ABSENT from the table, so a recipe step using it was outside the contract —
  // nothing stopped it being renamed or re-pointed, and the ledger did not count it.
  ['grid-col-header', 'click', 'prompt-detail'],
] as const satisfies ReadonlyArray<readonly [string, 'click' | 'contains', string]>;

/**
 * Landmarks the recipe USED to address and which must not silently come back.
 *
 * 🔴 `contribute-menu-items` IS THE ONE THAT MATTERS. The recipe's own overlay state
 * clicks `contribute-trigger` and waits for that panel; both are deleted, so a capture
 * against this version fails on its first step. Asserting their ABSENCE is what makes
 * the failure a decision rather than a surprise — and it is what stops a
 * compatibility shim being quietly added to keep an un-updated recipe green, which
 * would hide that the recipe still has to be re-pointed.
 */
const RETIRED_CONTRIBUTE_TESTIDS = [
  'contribute-menu',
  'contribute-trigger',
  'contribute-menu-items',
  'contribute-item-grid',
  'contribute-item-matchup',
  'contribute-item-prompt',
] as const;

/**
 * How a PAGE SECTION can be spelled — the growth closure's selector.
 *
 * 🔴 TAG-INDEPENDENT ON PURPOSE. The closure used to be `querySelectorAll('section')`
 * and so was walkable by adding the landmark as any other element: measured, a
 * `<div data-testid="section-featured">` was invisible to all 11 cases while the same
 * node as a `<section>` turned one red. All three spellings are asked for at once, so
 * a new section fails the ledger however it is written.
 */
const SECTION_SHAPED = '[data-mb-section], section, [data-testid^="section-"]';

/** The testids the old tab strip exposed. NONE of them may come back. */
const RETIRED_TESTIDS = [
  'view-switch',
  'view-switch-matchups',
  'view-switch-prompts',
  'view-switch-grid',
] as const;

const VIEWER_ID = 99;

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

/** A board with one matchup and one prompt, so the matrix — and therefore the
 * group band and the column header — actually render. */
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

function renderApp() {
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

describe('capture landmarks — criterion 1: each one resolves by name', () => {
  it('resolves every landmark in the table, exactly once each', async () => {
    renderApp();
    await screen.findByTestId('results-grid');

    // 🔴 EVERY LANDMARK IN THE TABLE RESOLVES ON THE DEFAULT SURFACE, with nothing
    // pressed — and that is a property of the table rather than an accident. The
    // OUTCOMES some of them promise do not (`section-matchups` is behind a board click,
    // `nav-my-group` behind the sidebar group); this case is about the ADDRESSES a
    // recipe selects, and criterion 3 is where each address is driven to its outcome.
    //
    // Stated because it is the thing to preserve: a landmark that needs navigation
    // before it can even be FOUND makes a recipe's first step order-dependent, which is
    // precisely the fragility the positional `nth-of-type` selectors had.
    for (const [testid] of LANDMARKS) {
      // `getAllBy` + a length assertion rather than `getBy`: a landmark that resolved
      // TWICE would make the recipe's single-node selector ambiguous, and `getBy`'s own
      // error would report it as a different problem.
      expect(screen.getAllByTestId(testid), `${testid} does not resolve exactly once`).toHaveLength(
        1,
      );
    }
  });

  it('🔴 the retired CONTRIBUTE testids are GONE — not merely unused', async () => {
    // 🔴 WATCHED FAILING AT THE PRE-CHANGE BASE: `contribute-trigger` and its three
    // items all resolve there, so every name below goes RED. That is the point — the
    // external capture recipe still addresses `contribute-trigger` and waits for the
    // text "Build a grid", and both die with this change. A compatibility shim left in
    // the DOM to keep an un-updated recipe green would fail here, which is exactly what
    // must not be possible: the recipe has to be re-pointed, and this is the tripwire
    // that says so out loud.
    renderApp();
    await screen.findByTestId('results-grid');

    for (const testid of RETIRED_CONTRIBUTE_TESTIDS) {
      expect(screen.queryAllByTestId(testid), `${testid} is still rendered`).toEqual([]);
    }
    // …and the recipe's `waitForText` anchor is gone from the rendered page too. A
    // testid check alone would pass while the words a text-anchored step waits for were
    // still on screen under a different id.
    expect(screen.queryByText('Build a grid')).toBeNull();
    expect(screen.queryByText('Contribute')).toBeNull();
  });

  it('🔴 the retired view-switch testids are GONE — not merely unused', async () => {
    // 🔴 THIS CASE IS THE ONE THAT MUST BE WATCHED FAILING AT THE PRE-CHANGE BASE.
    // At `5c146d4` the strip exists and all four of these resolve, so it goes RED
    // there and green here. A shim tab left in the DOM to keep an old selector
    // working would fail it too, which is the point: the talos recipe has to be
    // re-pointed, and a silent compatibility layer would hide that it hasn't been.
    renderApp();
    await screen.findByTestId('results-grid');

    for (const testid of RETIRED_TESTIDS) {
      expect(screen.queryAllByTestId(testid), `${testid} is still rendered`).toEqual([]);
    }

    // 🔴 THE TAB CLAIM IS STRUCTURAL NOW, AND IT USED TO BE A WORD CHECK. It asserted
    // that no `role="tab"` element's text matched `/^(Matchups|Prompts|Grids)\b/`, on
    // the reasoning that such a tab could only be a resurrected top-level view switch.
    // The BOARD SUBNAV's three segments are legitimately named exactly that, so the
    // word check would have to be deleted the first time it fired — which is the
    // definition of a guard that pins a word rather than a state.
    //
    // What replaces it is the relationship: EVERY tab on the page belongs to
    // `board-nav`. A resurrected top-level strip would be a second tablist and fails
    // here; a rename of the boards does not.
    const tabs = screen.getAllByRole('tab');
    expect(tabs.length, 'no tabs at all — the board subnav should be here').toBe(3);
    const boardNav = screen.getByTestId('board-nav');
    for (const tab of tabs) {
      expect(
        boardNav.contains(tab),
        `a tab outside the board subnav: ${tab.textContent ?? ''}`,
      ).toBe(true);
    }
    // …and it really is the boards it names, by literal, so the structural check above
    // cannot pass against a tablist of three unrelated things.
    expect(tabs.map((t) => t.textContent ?? '')).toEqual(['Grids', 'Matchups', 'Prompts']);
  });
});

/**
 * Every section this app can mount, and the SET it must mount for a given view.
 *
 * 🔴 IT IS A MAP NOW, NOT A LIST, BECAUSE ONE FRAME NO LONGER SHOWS EVERYTHING. The
 * old ledger was `['grids','matchups','prompts']` in DOM order and could be asserted in
 * a single render, because all three were mounted together. The board subnav mounts one
 * community board at a time and the sidebar swaps the whole surface, so the ledger has
 * to say WHICH sections go with WHICH destination — and the growth closure has to hold
 * at every one of them, not just the default.
 *
 * Literals on both sides. Derived from nothing.
 */
const SECTION_LEDGER = [
  ['home / grids', ['open-grid', 'grids']],
  ['home / matchups', ['open-grid', 'matchups']],
  ['home / prompts', ['open-grid', 'prompts']],
  ['my / grids', ['my-grid']],
  ['my / matchups', ['my-matchup']],
  ['my / prompts', ['my-prompt']],
] as const satisfies ReadonlyArray<readonly [string, readonly string[]]>;

describe('capture landmarks — criterion 2: the LEDGER', () => {
  /** Drive the app to one ledgered destination. */
  async function goTo(where: string): Promise<void> {
    if (where.startsWith('home')) {
      await userEvent.click(screen.getByTestId('nav-home'));
      const board = where.split(' / ')[1]!;
      await userEvent.click(screen.getByTestId(`board-nav-${board}`));
      return;
    }
    const noun = { grids: 'grid', matchups: 'matchup', prompts: 'prompt' }[where.split(' / ')[1]!]!;
    const trigger = screen.getByTestId('nav-my');
    if (trigger.getAttribute('aria-expanded') !== 'true') await userEvent.click(trigger);
    await userEvent.click(screen.getByTestId(`nav-my-${noun}`));
  }

  it('every destination mounts EXACTLY its ledgered sections, and nothing unmarked', async () => {
    renderApp();
    const content = await screen.findByTestId('app-content');

    for (const [where, expected] of SECTION_LEDGER) {
      await goTo(where);

      // (a) The SECTION markers are exactly the ledgered ones, IN ORDER. Failing when
      //     the set grows is the whole point — an extra section is a loud failure here
      //     instead of a capture that silently misses it.
      const marked = Array.from(content.querySelectorAll('[data-mb-section]'));
      expect(
        marked.map((el) => el.getAttribute('data-mb-section')),
        `wrong section set at ${where}`,
      ).toEqual([...expected]);

      // (b) …and NOTHING ELSE ON THE PAGE IS SECTION-SHAPED. Without this, (a) is
      //     walkable by adding a section and simply not giving it the marker attribute
      //     — the exact shape of "adding a tab without a testid" the original ledger was
      //     written to catch.
      //
      //     🔴 THE SELECTOR IS TAG-INDEPENDENT, AND IT USED TO BE `'section'`. Keyed on
      //     the tag, this closed the growth for exactly one spelling: a landmark added
      //     as `<div data-testid="section-featured">` left all 11 cases GREEN
      //     (measured), while the identical node as a bare `<section>` turned this line
      //     red. `SECTION_SHAPED` asks by marker attribute, by element type AND by the
      //     `section-*` testid convention, so any of the three is caught.
      const sectionShaped = Array.from(content.querySelectorAll(SECTION_SHAPED));
      expect(sectionShaped, `an unmarked section-shaped node at ${where}`).toEqual(marked);
    }
  });

  it('🔴 the UNSELECTED boards are ABSENT from the DOM, not hidden', async () => {
    // 🔴 THE ASSERTION THAT A VISIBILITY CHECK CANNOT MAKE, and the reason this is its
    // own case. `display: none` would satisfy "the viewer sees one board", keep every
    // hidden section's testids resolving for a capture recipe to address by accident,
    // and keep its gated image reads running — the read budget the preview suites
    // defend is a claim about what is MOUNTED, not about what is painted.
    renderApp();
    await screen.findByTestId('results-grid');

    expect(screen.getByTestId('section-grids')).toBeInTheDocument();
    expect(screen.queryByTestId('section-matchups')).toBeNull();
    expect(screen.queryByTestId('section-prompts')).toBeNull();

    await userEvent.click(screen.getByTestId('board-nav-matchups'));
    expect(await screen.findByTestId('section-matchups')).toBeInTheDocument();
    expect(screen.queryByTestId('section-grids')).toBeNull();
    expect(screen.queryByTestId('section-prompts')).toBeNull();

    await userEvent.click(screen.getByTestId('board-nav-prompts'));
    expect(await screen.findByTestId('section-prompts')).toBeInTheDocument();
    expect(screen.queryByTestId('section-grids')).toBeNull();
    expect(screen.queryByTestId('section-matchups')).toBeNull();
  });

  it('every ledgered landmark is a DISTINCT node', async () => {
    // Three names stamped on one element would satisfy a plain existence check and
    // leave the recipe coupled to whatever that one element happens to be. Scoped to
    // the landmarks the DEFAULT surface mounts, because the rest are on other
    // destinations and criterion 1 walks to them.
    renderApp();
    await screen.findByTestId('results-grid');
    const onDefault = LANDMARKS.map(([testid]) => testid).filter(
      (t) => screen.queryAllByTestId(t).length > 0,
    );
    // POSITIVE CONTROL: the filter did not empty the list.
    expect(onDefault.length).toBeGreaterThan(4);
    const nodes = onDefault.map((testid) => screen.getByTestId(testid));
    expect(new Set(nodes).size).toBe(onDefault.length);
  });
});

describe('capture landmarks — criterion 3: the name→surface mapping', () => {
  for (const [testid, kind, expected] of LANDMARKS) {
    if (kind === 'contains') {
      it(`[data-testid='${testid}'] contains ${expected}`, async () => {
        renderApp();
        await screen.findByTestId('results-grid');
        const host = screen.getByTestId(testid);
        expect(within(host).getByTestId(expected)).toBeInTheDocument();
      });
    } else {
      it(`clicking [data-testid='${testid}'] opens ${expected}`, async () => {
        renderApp();
        await screen.findByTestId('results-grid');
        expect(screen.queryByTestId(expected), `${expected} was already open`).toBeNull();

        await userEvent.click(screen.getByTestId(testid));

        expect(await screen.findByTestId(expected)).toBeInTheDocument();
      });
    }
  }

  it('the matchup band names its matchup in its accessible name', async () => {
    renderApp();
    await screen.findByTestId('results-grid');
    // A literal: the seeded matchup's title. A capture step that clicks "the
    // matchup band" has to be able to tell WHICH matchup it opened, and the
    // accessible name is what a recipe (and a screen reader) reads.
    expect(screen.getByTestId('grid-group-matchup')).toHaveAccessibleName(
      'Open matchup: Anime Showdown',
    );
  });

  // ⚠️ "the prompt column header opens the prompt detail" is GONE from here as a
  // hand-written case — `grid-col-header → prompt-detail` is a row of `LANDMARKS`
  // now, so criterion 3 generates exactly that case AND criterion 1 and the ledger
  // cover it too. It was the one landmark with a behaviour but no ledger entry,
  // which meant a recipe step using it sat outside the contract this file sells.

  it('the prompt column header names its prompt in its accessible name', async () => {
    renderApp();
    await screen.findByTestId('results-grid');
    // Literal, same reasoning as the band's: a recipe that clicks "the column
    // header" has to be able to tell WHICH prompt it opened.
    expect(screen.getByTestId('grid-col-header')).toHaveAccessibleName(
      'Open prompt: Cyberpunk portrait',
    );
  });
});
