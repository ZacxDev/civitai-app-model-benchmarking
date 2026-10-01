// The SIDEBAR NAV — the control that replaced the `ContributeMenu` dropdown, which
// replaced the top-level tab strip.
//
// 🔴 IT IS A HAND-BUILT NAV, so the behaviour an upstream component would have given
// us for free has to be asserted here: the item ledger, `aria-current` on the active
// item AND on the collapsed group's trigger, the chevron as the expandable state,
// arrow-key movement, Enter/Space activation, and Escape collapsing AND returning focus
// to the trigger. Until the five-package bump lands (see `SideNav.tsx`), these
// assertions are the only thing standing between "a nav" and "a div with some buttons".
//
// ⚠️ WHAT THIS FILE CANNOT SETTLE. jsdom performs NO LAYOUT, so nothing here observes
// whether the sidebar reads as a sidebar, whether the indent is visible, or whether it
// becomes a usable top bar on a phone. The depth assertion below is on the CUSTOM
// PROPERTY, not on a rendered offset. Live measurement is owed and has not been done.
//
// ⚠ ROLE NOTE for anyone porting a query from the dropdown this replaced: its trigger
// was `aria-haspopup="menu"` and its items were `role="menuitem"`. These are plain
// `<button>`s inside a `role="list"`; `getAllByRole('menuitem')` finds nothing.
//
// ── 🔴 COVERAGE LABEL: READ THE SPLIT — IT IS NO LONGER "NONE OF THIS" ───────
//
// ⚠️ THIS HEADER USED TO SAY "NONE OF THIS IS REGRESSION COVERAGE", FULL STOP, AND
// THAT IS NOW FALSE FOR TWO OF THE FOUR DESCRIBE BLOCKS. The paragraph below is still
// exactly right about the ORIGINAL cases — they arrived with their subject — but two
// blocks were added later against a tree where `SideNav.tsx` already existed, and they
// were measured RED there. Corrected rather than reworded, because a coverage label
// that overstates in the SAFE direction still stops the next reader looking:
//
//   - `the group is OPEN by default …`     — the default-expanded case is RED at
//     `origin/main` (the group started shut on Home); the collapse-sticks case beside
//     it is GREEN there and is labelled an INVARIANT GUARD in place, with the mutation
//     that kills it recorded.
//   - `the ACTIVE row is marked the way the pack marks an active tab`  — both
//     behavioural cases RED at `origin/main` (the active row declared `token.text` and
//     no shadow). The PREMISE case is a positive control on the pack's stylesheet and
//     is green at any tree, by design.
//
// Everything in the two ORIGINAL describe blocks remains as the paragraph below says.
//
// THIS FILE AND ITS SUBJECT ARRIVE IN THE SAME COMMIT. `src/sideNav.test.tsx` and
// `src/components/SideNav.tsx` were both added by `8a4b681`, and NEITHER exists on
// `origin/main` (verified: `git ls-tree -r --name-only origin/main -- src` matches
// neither). So there is no tree in which these cases exist and their subject does not —
// "0 of 19 red at base" is a STRUCTURAL fact about a new file and says nothing about
// coverage. **Do not count these cases as regression coverage.** They are INVARIANT
// GUARDS on behaviour a hand-built nav has to provide and an upstream component would
// have given for free, validated by MUTATION (break the behaviour, watch the case go
// red) and never by a red base.
//
// ⚠️ AND A METHOD WARNING FOR WHOEVER TRIES TO TAKE A BASE READING ANYWAY.
// `git checkout <older-ref> -- <dir>` RESTORES tracked files but CANNOT DELETE files
// that are new in HEAD (verified directly, in a scratch repo: a file added in HEAD
// survives `git checkout HEAD~1 -- src/`). So a "base" built that way is a HYBRID tree —
// the older commit's tracked files PLUS every file HEAD added — and must not be
// described as a checkout of the older commit. An earlier write-up of these cases did
// exactly that, and also named the wrong branch as the one lacking the component.
// To get a real base here, check out the ref itself in a clean worktree.
// `src/myBenchmarks.test.tsx` carries the same label for its own cases.

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { BLOCKS_UI_STYLES } from '@civitai/blocks-react/ui';

import { SIDE_NAV_ITEMS, SideNav, type MainView } from './components/SideNav.js';

/**
 * The five items, as `[testid, visible label, depth, the view selecting it produces]`,
 * **in rendered order**.
 *
 * 🔴 LITERALS ON EVERY SIDE, and deliberately NOT derived from the component's own
 * tables — a mapping read out of the implementation agrees with a wrong implementation.
 * `SIDE_NAV_ITEMS` is cross-checked against this table below rather than used to build
 * it.
 *
 * 🔴 THE ORDER OF THE THREE SUB-ITEMS IS PART OF THE CONTRACT, AND IT CHANGED ONCE:
 * Grids / Matchups / Prompts → **Prompts / Matchups / Grids** (an operator decision —
 * the rail reads in the order a viewer BUILDS the objects; see `MY_ITEMS` in
 * `components/SideNav.tsx`). Three separate assertions below read this table as a
 * SEQUENCE — the `listitem` order, the FOCUSABLE order, and the component's exported
 * `SIDE_NAV_ITEMS` ledger — so a reorder of the component without a reorder here is
 * red three times over, and vice versa. MEASURED: with this table in the new order and
 * `MY_ITEMS` at `7c20155`'s old order, this file is 3 failed / 16 passed.
 */
const ITEMS = [
  ['nav-home', 'Home', 0, { kind: 'home' }],
  ['nav-my', 'My Benchmarks', 0, null],
  ['nav-my-prompt', 'Prompts', 1, { kind: 'my', noun: 'prompt' }],
  ['nav-my-matchup', 'Matchups', 1, { kind: 'my', noun: 'matchup' }],
  ['nav-my-grid', 'Grids', 1, { kind: 'my', noun: 'grid' }],
] as const satisfies ReadonlyArray<readonly [string, string, number, MainView | null]>;

function renderNav(view: MainView = { kind: 'home' }) {
  const onSelect = vi.fn();
  const r = render(<SideNav view={view} onSelect={onSelect} />);
  return { onSelect, rerender: (v: MainView) => r.rerender(<SideNav view={v} onSelect={onSelect} />) };
}

/** Open the group, from any starting state. */
async function expand(): Promise<void> {
  const trigger = screen.getByTestId('nav-my');
  if (trigger.getAttribute('aria-expanded') !== 'true') await userEvent.click(trigger);
}

/**
 * Shut the group, from any starting state.
 *
 * 🔴 IT EXISTS BECAUSE THE DEFAULT FLIPPED. The group used to start SHUT on Home, so
 * a case about the collapsed nav needed no setup and several here had none. It starts
 * OPEN now (see `SideNav`'s `expanded` docblock), so every one of those cases was
 * silently asserting about a state it was no longer in — which is why this helper is
 * a helper and not three inline clicks: the next case to need it should find it.
 */
async function collapse(): Promise<void> {
  const trigger = screen.getByTestId('nav-my');
  if (trigger.getAttribute('aria-expanded') !== 'false') await userEvent.click(trigger);
}

describe('SideNav — the structure the upstream swap has to preserve', () => {
  it('is a landmark <nav> with an accessible name, wrapping a role="list"', () => {
    renderNav();
    const nav = screen.getByTestId('side-nav');
    expect(nav.tagName).toBe('NAV');
    // A literal: a `<nav>` with no name is one of several unlabelled landmarks to a
    // screen reader user, which is the state this app was in before there was a nav.
    expect(nav).toHaveAccessibleName('Model Benchmarking sections');
    // ⚠️ THERE ARE TWO LISTS NOW, and that is the default state rather than a
    // regression: the group starts OPEN, and `nav-my-group` is itself a
    // `role="list"` nested inside the outer one. A bare `getByRole('list')` throws on
    // the pair, so the structure is asserted as the ORDERED set — which says more
    // than the single lookup did (it pins the nesting, not just the presence).
    expect(within(nav).getAllByRole('list').map((el) => el.getAttribute('data-testid'))).toEqual([
      'side-nav-list',
      'nav-my-group',
    ]);
    expect(
      screen.getByTestId('side-nav-list').contains(screen.getByTestId('nav-my-group')),
      'the sub-group escaped the nav list',
    ).toBe(true);
  });

  it('🔴 LEDGER: the collapsed nav holds EXACTLY two items, and the expanded one five', async () => {
    renderNav();

    // ⚠️ THE COLLAPSE IS NOW SETUP. This case used to read the collapsed state
    // straight off a fresh render, which stopped being the initial state when the
    // group was made default-open; without this line the first three assertions
    // would be about a nav that is in fact showing all five rows.
    await collapse();

    // Collapsed: Home and the group trigger. Fails when an item is ADDED as loudly as
    // when one is removed — the primary navigation is a decision, not a drift.
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.queryByTestId('nav-my-group')).toBeNull();
    for (const [testid] of ITEMS.slice(2)) expect(screen.queryByTestId(testid)).toBeNull();

    await expand();

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(5);
    expect(items.map((el) => el.firstElementChild?.getAttribute('data-testid'))).toEqual(
      ITEMS.map(([t]) => t),
    );
    expect(items.map((el) => el.textContent)).toEqual(
      // The trigger's text includes its chevron glyph, so compare by containment there.
      items.map((el, i) => (i === 1 ? el.textContent : ITEMS[i]![1])),
    );
    for (const [testid, label] of ITEMS) {
      expect(screen.getByTestId(testid)).toHaveTextContent(label);
    }

    // …and nothing else in the nav is a control at all: every focusable descendant IS
    // one of the five. A sixth button that forgot its attribute would slip the ledger
    // above and still be tabbable.
    const focusable = Array.from(
      screen.getByTestId('side-nav').querySelectorAll('button, a[href], [tabindex]'),
    );
    expect(focusable.map((el) => el.getAttribute('data-testid'))).toEqual(ITEMS.map(([t]) => t));

    // The component's own exported ledger agrees with this table. Cross-checked, not
    // used to build it — the table above is the contract.
    expect(SIDE_NAV_ITEMS.map((i) => [i.testid, i.label, i.depth])).toEqual(
      ITEMS.map(([t, label, depth]) => [t, label, depth]),
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 🔴 DELETED: 'expresses nesting as the UPSTREAM depth custom property, at the
  // upstream step'. RE-ADD IT AT SWAP TIME — it is not retired, it is premature.
  //
  // It asserted that every item declares `--civitai-nav-depth` equal to its depth, and
  // that `NAV_DEPTH_STEP_PX` is 14. It CANNOT observe what its name claims. Its only
  // comparand for "the upstream step" was `NAV_DEPTH_STEP_PX`, imported from the
  // component under test, and the pinned `components-react@^0.4.1` (installed `0.4.3`)
  // SHIPS NO NAV ELEMENT AT ALL — so drift from the real 0.8.1 / 0.9.0 shape (a
  // different property name, a different step, or depth expressed some other way) is
  // structurally invisible to it. It could only ever fail if someone edited this repo's
  // own constant, which is not the hazard the case was written for.
  //
  // What to do instead, when the five-package bump lands (`SideNav.tsx`'s header has the
  // gate): re-add it with the REAL element as the comparand — mount a
  // `<civitai-nav-item>` at two depths and read the property off it, then assert this
  // file's mirror agrees. That is a relationship between two things and can be red.
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * 🔴 THE INDENT WAS DEAD ON ARRIVAL, AND THIS IS THE CASE THAT WOULD HAVE SEEN IT.
   *
   * `itemStyle` set `paddingLeft: calc(...)` and then, LATER IN THE SAME OBJECT,
   * `padding: '6px 10px'`. React serialises a style object in INSERTION ORDER, so the
   * shorthand reset `padding-left` and every row rendered at 10px — Home, My Benchmarks
   * and its three sub-items all at the same inset, i.e. no visual hierarchy in the
   * page's only primary navigation. Measured before the fix with
   * `renderToStaticMarkup`: emitted
   * `padding-left:calc(10px + 14px);…;padding:6px 10px`, effective `padding-left` 10px
   * at depths 0, 1 AND 2 where 10/24/38px was intended.
   *
   * 🔴 IT SHIPPED BECAUSE THE WITNESS WAS POINTED AT THE WRONG PROPERTY. The deleted
   * case above asserted `--civitai-nav-depth` — which NOTHING IN THIS TREE CONSUMES —
   * so it stayed green while the visible indent was gone. Assert the property that
   * MOVES THE ROW.
   *
   * 🔴 LITERALS, NOT `NAV_DEPTH_STEP_PX`. Deriving the expectation from the component's
   * own constant is precisely what made the deleted case unable to fail. The shorthand
   * mutant reads back as a bare `10px`, which differs from the depth-0 literal too — so
   * even the depth-0 row discriminates.
   *
   * 🔴 THE VALUE IS A CUSTOM-PROPERTY REFERENCE NOW, AND THAT IS HALF A SEAM. It read
   * `calc(10px + 14px)` (which jsdom folds to `calc(24px)`); it is
   * `var(--mb-nav-indent-1, 24px)`, because `compact.ts` has to be able to zero the
   * indent on the horizontal top bar and a stylesheet cannot beat an inline
   * declaration — only read a property one names. The fallback carries the old
   * literal, so the WIDE rail renders exactly as it did. The OTHER half of the seam —
   * that `compact.ts` sets the same property name — is pinned in
   * `mobile-responsive.test.tsx`; each side is spelled here as a LITERAL rather than
   * imported, so a rename of `navIndentVar` is red on both sides even though
   * production spells it once.
   *
   * This asserts a DECLARED value, which jsdom does give. It is NOT a layout claim:
   * jsdom computes no layout, so whether the indent is legible on screen is still owed
   * to a live reading.
   */
  it('🔴 indents by DEPTH on the property that actually moves the row', async () => {
    renderNav();
    await expand();

    // Positive control first: a nav whose rows did not render would satisfy every
    // assertion below vacuously.
    expect(screen.getAllByRole('listitem')).toHaveLength(5);

    const paddingLeftOf = (testid: string) => screen.getByTestId(testid).style.paddingLeft;

    // ⚠️ AND NOT `style.padding`. A draft of this case also asserted the shorthand was
    // EMPTY, on the assumption that writing four longhands leaves it unset. MEASURED in
    // jsdom 25.0.1, that is false — CSSOM SYNTHESISES it, and four longhands report
    // `padding: "6px 10px 6px calc(24px)"`. So an empty-shorthand assertion cannot tell
    // "no shorthand was written" from "four longhands were", i.e. it could never have
    // discriminated the bug. `padding-left` is the whole discriminator: the broken tree
    // reports a bare `10px`, this one reports `calc(...)`.
    //
    // Depth 0 — the two top-level rows.
    expect(paddingLeftOf('nav-home')).toBe('var(--mb-nav-indent-0, 10px)');
    expect(paddingLeftOf('nav-my')).toBe('var(--mb-nav-indent-0, 10px)');

    // Depth 1 — every sub-item, indented by exactly one step.
    for (const testid of ['nav-my-grid', 'nav-my-matchup', 'nav-my-prompt']) {
      expect(paddingLeftOf(testid), `${testid} lost its depth indent`).toBe(
        'var(--mb-nav-indent-1, 24px)',
      );
    }

    // 🔴 And the RELATIONSHIP, stated independently of the literals above: a sub-item is
    // not indented the same as its parent. That is the sentence the feature is about, and
    // it goes red on any mutation that flattens the nav however it spells the values.
    expect(screen.getByTestId('nav-my-grid').style.paddingLeft).not.toBe(
      screen.getByTestId('nav-my').style.paddingLeft,
    );
  });

  it('shows the expandable state as a CHEVRON, and moves it in both directions', async () => {
    renderNav();
    const trigger = screen.getByTestId('nav-my');
    const chevron = () => screen.getByTestId('nav-my-chevron').textContent;

    // Starts OPEN (see the default-expanded case below), so the walk starts there.
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const expandedGlyph = chevron();
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    const collapsedGlyph = chevron();
    // 🔴 BOTH DIRECTIONS, and the two glyphs asserted DIFFERENT rather than by literal:
    // the character is cosmetic, the state change is not, and a chevron that never moves
    // is the defect (a static glyph reads as decoration and tells a sighted reader
    // nothing about whether pressing did anything).
    expect(collapsedGlyph).not.toBe(expandedGlyph);
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(chevron()).toBe(expandedGlyph);

    // The chevron is hidden from the a11y tree — `aria-expanded` is what carries the
    // state there, and announcing the glyph as text would be noise.
    expect(screen.getByTestId('nav-my-chevron')).toHaveAttribute('aria-hidden', 'true');
  });

  it('points aria-controls at the group it opens, and only while it is open', async () => {
    renderNav();
    const trigger = screen.getByTestId('nav-my');
    // Open on arrival: the attribute is already pointing at the live group.
    expect(trigger.getAttribute('aria-controls')).toBe(
      screen.getByTestId('nav-my-group').getAttribute('id'),
    );
    // …and it is dropped when there is nothing to point at, which is the half that
    // would leave a dangling IDREF in the accessibility tree.
    await collapse();
    expect(trigger).not.toHaveAttribute('aria-controls');
    await expand();
    expect(trigger.getAttribute('aria-controls')).toBe(
      screen.getByTestId('nav-my-group').getAttribute('id'),
    );
  });
});

describe('SideNav — aria-current follows the view', () => {
  it('marks Home current on the default view, and nothing else', () => {
    renderNav({ kind: 'home' });
    expect(screen.getByTestId('nav-home')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('nav-my')).not.toHaveAttribute('aria-current');
  });

  it('marks the active LEAF current, and un-marks Home', async () => {
    const { rerender } = renderNav({ kind: 'home' });
    rerender({ kind: 'my', noun: 'matchup' });

    expect(screen.getByTestId('nav-home')).not.toHaveAttribute('aria-current');
    // The group auto-opens for a My view, so the leaf is in the tree to be marked.
    expect(screen.getByTestId('nav-my')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('nav-my-matchup')).toHaveAttribute('aria-current', 'page');
    // EXACTLY one current item — the assertion a per-item check cannot make.
    expect(document.querySelectorAll('[aria-current]')).toHaveLength(1);
    // …and the siblings are NOT marked, so the attribute discriminates.
    expect(screen.getByTestId('nav-my-grid')).not.toHaveAttribute('aria-current');
    expect(screen.getByTestId('nav-my-prompt')).not.toHaveAttribute('aria-current');
  });

  it('🔴 moves aria-current to the TRIGGER when the group is collapsed on a My view', async () => {
    // 🔴 THE STATE THAT IS EASY TO LEAVE UNLABELLED. Collapsing the group does NOT
    // navigate (a disclosure that also changes what you are looking at is two actions on
    // one press), so a viewer can be ON a My view with the group shut — at which point
    // the active leaf is not in the accessibility tree at all and a nav with no current
    // item tells a screen reader user nothing about where they are. ARIA allows the
    // nearest rendered ancestor to carry it.
    const { onSelect, rerender } = renderNav({ kind: 'home' });
    rerender({ kind: 'my', noun: 'prompt' });
    await collapse();

    expect(screen.getByTestId('nav-my')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('nav-my')).toHaveAttribute('aria-current', 'page');
    expect(document.querySelectorAll('[aria-current]')).toHaveLength(1);
    // 🔴 AND COLLAPSING NAVIGATED NOWHERE. This is the half that makes the case above
    // necessary rather than hypothetical.
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('does NOT mark the trigger current when the group is collapsed on HOME', () => {
    // The negative control for the case above: `aria-current` on the trigger must mean
    // "you are inside this group", not "this group is shut".
    renderNav({ kind: 'home' });
    expect(screen.getByTestId('nav-my')).not.toHaveAttribute('aria-current');
  });
});

describe('SideNav — each item selects its own view, and only its own', () => {
  for (const [testid, , , expected] of ITEMS) {
    if (expected === null) continue;
    it(`${testid} selects ${JSON.stringify(expected)} exactly once`, async () => {
      const { onSelect } = renderNav();
      await expand();
      await userEvent.click(screen.getByTestId(testid));

      // EXACT count and EXACT payload: "was called" alone is satisfied by a nav that
      // fires the same view from every item.
      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith(expected);
    });
  }

  it('the group trigger selects NO view — it is a disclosure, not a destination', async () => {
    // BOTH presses, because the group now starts open and a one-press case would only
    // ever exercise the CLOSING direction. `onSelect` must stay untouched either way.
    const { onSelect } = renderNav();
    await userEvent.click(screen.getByTestId('nav-my'));
    expect(screen.queryByTestId('nav-my-group')).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();

    await userEvent.click(screen.getByTestId('nav-my'));
    expect(screen.getByTestId('nav-my-group')).toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('SideNav — the keyboard', () => {
  it('moves with the arrow keys, over the items that are actually rendered', async () => {
    renderNav();
    await collapse();
    // Collapsed: two items, and the cycle is over those two only — a roving index over
    // a stale list would step onto an unmounted node and focus would land on <body>.
    screen.getByTestId('nav-home').focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByTestId('nav-my')).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByTestId('nav-home')).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}');
    expect(screen.getByTestId('nav-my')).toHaveFocus();

    // Expanded: the three sub-items join the cycle, in DOM order — which is
    // Prompts → Matchups → Grids, the order `MY_ITEMS` declares. The names are
    // spelled out rather than indexed off `ITEMS`, so this case is a SECOND,
    // independent reading of the order the table above pins.
    await userEvent.keyboard('{Enter}');
    await screen.findByTestId('nav-my-group');
    screen.getByTestId('nav-my').focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByTestId('nav-my-prompt')).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByTestId('nav-my-matchup')).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByTestId('nav-my-grid')).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    // Past the last item it wraps to the first.
    expect(screen.getByTestId('nav-home')).toHaveFocus();
  });

  it('activates with Enter AND with Space', async () => {
    // Both, because they are two different keys on a native `<button>` and a component
    // that grew its own `onKeyDown` handling is exactly where one of them gets dropped.
    const { onSelect } = renderNav();
    await expand();
    screen.getByTestId('nav-my-grid').focus();
    await userEvent.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith({ kind: 'my', noun: 'grid' });

    onSelect.mockClear();
    screen.getByTestId('nav-my-prompt').focus();
    await userEvent.keyboard(' ');
    expect(onSelect).toHaveBeenCalledWith({ kind: 'my', noun: 'prompt' });
  });

  it('🔴 Escape collapses the group AND returns focus to the trigger', async () => {
    // 🔴 THE FOCUS RETURN IS THE HALF THAT GETS DROPPED, and this repo has the receipt:
    // `ContributeMenu`'s `close(refocus)` exists for exactly this. The focused sub-item
    // is unmounted by the collapse, so without an explicit restore the ring lands on
    // `<body>` and a keyboard viewer is dumped at the top of the document with the group
    // they just used no longer reachable by Tab from where they are.
    const { onSelect } = renderNav();
    await expand();
    screen.getByTestId('nav-my-matchup').focus();

    await userEvent.keyboard('{Escape}');

    expect(screen.queryByTestId('nav-my-group')).toBeNull();
    expect(screen.getByTestId('nav-my')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('nav-my')).toHaveFocus();
    // Escape is a dismissal, not a choice.
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('Escape on a COLLAPSED nav does nothing and does not swallow the key', async () => {
    // The nav shares the document with modals that also want Escape, so it must only
    // claim the key when it has something to close. A handler that always stopped
    // propagation would make the grid form's own Escape inert — a data-loss shape this
    // repo has already paid for once (`gridsView.test.tsx`'s picker case).
    const { onSelect } = renderNav();
    await collapse();
    screen.getByTestId('nav-home').focus();
    await userEvent.keyboard('{Escape}');
    expect(screen.getByTestId('nav-my')).toHaveAttribute('aria-expanded', 'false');
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('SideNav — the selection is NOT persisted', () => {
  it('a fresh mount opens on Home, whatever was selected before', async () => {
    // 🔴 AN OPERATOR DECISION (YAGNI), pinned so it is not "fixed" later by accident:
    // no KV write, no URL, no deep-linking. A remount is what a reload looks like from
    // this component's side, and it must land on Home.
    const { rerender } = renderNav({ kind: 'home' });
    rerender({ kind: 'my', noun: 'grid' });
    expect(screen.getByTestId('nav-my-grid')).toHaveAttribute('aria-current', 'page');

    // A genuinely fresh mount, not a rerender.
    const fresh = render(<SideNav view={{ kind: 'home' }} onSelect={vi.fn()} />);
    const nav = within(fresh.container).getByTestId('side-nav');
    expect(within(nav).getByTestId('nav-home')).toHaveAttribute('aria-current', 'page');
    // …and NO sub-item carries `aria-current`, so nothing about the previous
    // selection survived. (The group itself is open — that is the DEFAULT, not a
    // memory of the rerender above; the default-expanded case proves it is the
    // default by opening on a nav that was never navigated at all.)
    expect(within(nav).getByTestId('nav-my')).toHaveAttribute('aria-expanded', 'true');
    expect(within(nav).getByTestId('nav-my-grid')).not.toHaveAttribute('aria-current');
    expect(within(nav).queryAllByRole('listitem')).toHaveLength(5);
  });
});

// ===========================================================================
// 🔴 OPERATOR FEEDBACK #1 — "My Benchmarks" opens by default.
//
// THE DEFECT: `useState(onMyView)`. The group was open only when the viewer was
// already on a My view — and `SideNav` persists nothing, so every session and every
// reload starts on Home, where `onMyView` is false. The three destinations the
// sidebar exists to expose were therefore behind a disclosure on FIRST PAINT, every
// time, and the second half of the page's only primary navigation rendered as one
// collapsed row.
//
// 🔴 THE INTERESTING HALF IS THE SECOND CASE, NOT THE FIRST. Flipping an initial
// value is trivial; the hazard is what it does to the effect beside it. That effect
// is deliberately ONE-WAY ("only ever opens it") so that collapsing the group cannot
// navigate away — and a default of `true` is exactly the change that invites someone
// to make the effect two-way "for consistency", at which point a viewer who collapses
// the group on Home watches it spring back open. The sticky case below is what makes
// that a red test rather than a bug report.
// ===========================================================================

describe('SideNav — the group is OPEN by default, and a collapse STICKS', () => {
  it('🔴 a fresh nav on HOME shows all five items with no interaction at all', () => {
    renderNav({ kind: 'home' });

    // No click, no keypress: the state under test is the one the viewer arrives in.
    expect(screen.getByTestId('nav-my')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('nav-my-group')).toBeInTheDocument();
    // The SET, not a count — a group that rendered five copies of one row would pass
    // a length check. Each destination is present and reachable.
    expect(screen.getAllByRole('listitem').map((el) => el.firstElementChild?.getAttribute('data-testid'))).toEqual(
      ITEMS.map(([t]) => t),
    );
  });

  // ⚠️ INVARIANT GUARD — NOT REGRESSION COVERAGE, and measured: this case is GREEN at
  // `origin/main`, because the effect was already one-way there and the group already
  // started shut on Home, so "a collapse sticks" was trivially true. It guards the
  // change's blast radius rather than the change, and it is VALIDATED BY MUTATION:
  // widening the effect to `useEffect(() => { setExpanded(true); }, [onMyView, view])`
  // turns this case — and only this case, out of 24 in this file — red, on its own
  // `aria-expanded="false"` assertion at the rerender. The default-expanded case
  // above it IS regression coverage (red at `origin/main`).
  it('🔴 collapsing on HOME STAYS collapsed — the effect must not re-open it', async () => {
    // 🔴 THE MUTANT THIS EXISTS FOR: widening `SideNav`'s effect from
    // `if (onMyView) setExpanded(true)` to an unconditional `setExpanded(true)`, or
    // dropping its `onMyView` guard. Either makes the group re-open the moment
    // anything re-renders the nav, and a disclosure that reopens under the viewer's
    // hand is worse than one that starts shut.
    const { rerender } = renderNav({ kind: 'home' });
    await collapse();
    expect(screen.queryByTestId('nav-my-group')).toBeNull();

    // A re-render on the SAME view — the ordinary case, and the one an unconditional
    // effect breaks immediately.
    rerender({ kind: 'home' });
    expect(screen.getByTestId('nav-my')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('nav-my-group')).toBeNull();

    // 🔴 AND THE POSITIVE CONTROL FOR THE OTHER DIRECTION, which is what stops this
    // case being satisfiable by a group that can never open again: navigating INTO a
    // My view must still open it, because the active leaf has to exist to be marked
    // current. Without this, "stays collapsed" and "is broken" look identical.
    rerender({ kind: 'my', noun: 'matchup' });
    expect(screen.getByTestId('nav-my')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('nav-my-matchup')).toHaveAttribute('aria-current', 'page');
  });
});

// ===========================================================================
// 🔴 OPERATOR FEEDBACK #4 (F1) — the active row had no visible highlight.
//
// MEASURED LIVE: the active row rendered `rgb(26, 27, 30)` on `rgb(26, 27, 30)`. The
// rule was `background: active ? token.surface : 'transparent'` over a transparent
// 1px border — and `--civitai-color-surface` resolves to the same value as
// `--civitai-color-body` in the dark theme, so the fill was literally invisible. The
// only surviving signal was a 600 font-weight. In LIGHT theme the same fill is a
// near-white on white. Neither theme marked the current row.
//
// 🔴 THIS IS A CONSISTENCY FIX, SO THE GUARD IS A RELATIONSHIP TO THE THING IT IS
// CONSISTENT WITH. `BoardNav` already shows an active tab unmistakably, using the
// pack's `SegmentedControl`. So rather than pin three colours this repo chose — which
// would be a guard on OUR taste, green forever, and silent when the pack moves — the
// case below reads the PACK'S OWN STYLESHEET (`BLOCKS_UI_STYLES`, the exact CSS the
// pack injects at runtime), extracts its active-segment rule, and asserts the nav's
// active row declares the same three things. A pack restyle that moves the segment
// and leaves the nav behind is then a red test rather than a slow divergence.
//
// ⚠️ AND IT IS STILL NOT A LAYOUT CLAIM. jsdom resolves no colour and performs no
// layout: this pins the DECLARED values on both sides. Whether the result is legible
// at the app's real contrast, in both themes, is a live reading and is owed.
// ===========================================================================

describe('SideNav — the ACTIVE row is marked the way the pack marks an active tab', () => {
  /** The pack's rule for an active `SegmentedControl` segment, as `prop -> value`. */
  function packActiveSegmentDeclarations(): Record<string, string> {
    const marker = "[data-civitai-ui-segment][data-active]";
    const at = BLOCKS_UI_STYLES.indexOf(marker);
    if (at < 0) return {};
    const open = BLOCKS_UI_STYLES.indexOf('{', at);
    const close = BLOCKS_UI_STYLES.indexOf('}', open);
    if (open < 0 || close < 0) return {};
    const out: Record<string, string> = {};
    for (const decl of BLOCKS_UI_STYLES.slice(open + 1, close).split(';')) {
      const colon = decl.indexOf(':');
      if (colon < 0) continue;
      out[decl.slice(0, colon).trim()] = decl.slice(colon + 1).trim().replace(/\s+/g, ' ');
    }
    return out;
  }

  const norm = (v: string) => v.trim().replace(/\s+/g, ' ');

  it('🔴 PREMISE: the pack really does give its active segment a visible treatment', () => {
    // 🔴 THE RATIONALE THIS COMMENT USED TO GIVE WAS FALSE, AND A ROUND-0 AUDIT
    // MEASURED IT. It claimed that without this case a `{}` parse would leave the
    // behavioural assertions comparing `undefined` to `undefined` and passing while
    // checking nothing. Measured: rename the marker to an unmatchable string and
    // **2 of 24 cases go red** — this one AND "the active row mirrors the pack". The
    // left-hand side is always a real declared string read off the component, so
    // `toBe(undefined)` fails loudly. There is no silent pass to protect against.
    //
    // 🔴 WHAT IT ACTUALLY DOES, which nothing else here does: the `Object.keys`
    // ledger below fails if the pack ADDS A FOURTH declaration to its active
    // segment. That divergence leaves every behavioural case GREEN — they assert the
    // three we mirror — while the nav silently stops matching the pack. That is the
    // reason to keep this case, and the reason not to prune it on the sentence that
    // used to be here.
    const pack = packActiveSegmentDeclarations();
    expect(Object.keys(pack).sort()).toEqual(['background', 'box-shadow', 'color']);
    // …and it is the PRIMARY colour plus a shadow that carries it, not the fill. The
    // fill only reads in the pack's own context because a segment sits on a
    // `surface-2` track; a nav row sits on the page body, which is the whole reason
    // the same fill alone did nothing here.
    expect(pack['color']).toBe('var(--civitai-color-primary)');
    expect(pack['background']).toBe('var(--civitai-color-surface)');
    expect(pack['box-shadow']).toBeTruthy();
  });

  it('🔴 the active row mirrors the pack: fill, PRIMARY text, and the same shadow', async () => {
    const pack = packActiveSegmentDeclarations();
    renderNav({ kind: 'my', noun: 'grid' });
    await expand();

    const active = screen.getByTestId('nav-my-grid');
    expect(active, 'the row under test is not the current one').toHaveAttribute(
      'aria-current',
      'page',
    );

    expect(norm(active.style.background)).toBe(pack['background']);
    expect(norm(active.style.color)).toBe(pack['color']);
    expect(norm(active.style.boxShadow)).toBe(pack['box-shadow']);
    // …and the border is no longer transparent, which is this nav's stand-in for the
    // bordered track the pack's segments sit in.
    expect(active.style.borderColor).toBe('var(--civitai-color-border)');
  });

  it('🔴 an INACTIVE row differs on every one of them — not just on font-weight', async () => {
    // 🔴 THE NEGATIVE CONTROL, AND THE ACTUAL BUG. The broken tree DID set a
    // `background` on the active row; it was simply the same colour as the page. A
    // case that only asserted "the active row has a background" would have been green
    // throughout. What has to be true is that active and inactive DIFFER, on more
    // than the one property (weight) that already differed.
    renderNav({ kind: 'my', noun: 'grid' });
    await expand();

    const active = screen.getByTestId('nav-my-grid');
    const inactive = screen.getByTestId('nav-my-prompt');
    expect(inactive).not.toHaveAttribute('aria-current');

    for (const prop of ['background', 'color', 'boxShadow', 'borderColor'] as const) {
      expect(
        norm(inactive.style[prop]),
        `${prop} is identical on the active and inactive rows`,
      ).not.toBe(norm(active.style[prop]));
    }
    // Spelled out, so the inactive side is pinned too rather than merely "different":
    // a mutant that made BOTH rows primary-coloured would satisfy nothing here.
    expect(inactive.style.background).toBe('transparent');
    expect(inactive.style.borderColor).toBe('transparent');
    expect(inactive.style.boxShadow).toBe('none');
    expect(inactive.style.color).toBe('var(--civitai-color-text-dimmed)');
  });
});
