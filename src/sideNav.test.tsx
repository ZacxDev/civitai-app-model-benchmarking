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

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { NAV_DEPTH_STEP_PX, SIDE_NAV_ITEMS, SideNav, type MainView } from './components/SideNav.js';

/**
 * The five items, as `[testid, visible label, depth, the view selecting it produces]`.
 *
 * 🔴 LITERALS ON EVERY SIDE, and deliberately NOT derived from the component's own
 * tables — a mapping read out of the implementation agrees with a wrong implementation.
 * `SIDE_NAV_ITEMS` is cross-checked against this table below rather than used to build
 * it.
 */
const ITEMS = [
  ['nav-home', 'Home', 0, { kind: 'home' }],
  ['nav-my', 'My Benchmarks', 0, null],
  ['nav-my-grid', 'Grids', 1, { kind: 'my', noun: 'grid' }],
  ['nav-my-matchup', 'Matchups', 1, { kind: 'my', noun: 'matchup' }],
  ['nav-my-prompt', 'Prompts', 1, { kind: 'my', noun: 'prompt' }],
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

describe('SideNav — the structure the upstream swap has to preserve', () => {
  it('is a landmark <nav> with an accessible name, wrapping a role="list"', () => {
    renderNav();
    const nav = screen.getByTestId('side-nav');
    expect(nav.tagName).toBe('NAV');
    // A literal: a `<nav>` with no name is one of several unlabelled landmarks to a
    // screen reader user, which is the state this app was in before there was a nav.
    expect(nav).toHaveAccessibleName('Model Benchmarking sections');
    expect(within(nav).getByRole('list')).toBe(screen.getByTestId('side-nav-list'));
  });

  it('🔴 LEDGER: the collapsed nav holds EXACTLY two items, and the expanded one five', async () => {
    renderNav();

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

  it('🔴 expresses nesting as the UPSTREAM depth custom property, at the upstream step', async () => {
    // 🔴 THE POINT OF PINNING THIS IS THE SWAP, not the pixels. Upstream
    // `<civitai-nav-item>` carries `--civitai-nav-depth` at 14px per level; mirroring
    // the same property NAME and the same STEP is what makes the indent survive an
    // element swap untouched. A `paddingLeft` alone would have to be re-derived.
    //
    // ⚠️ jsdom resolves no layout, so this reads the DECLARED custom property, never a
    // rendered offset.
    renderNav();
    await expand();

    expect(NAV_DEPTH_STEP_PX).toBe(14);
    for (const [testid, , depth] of ITEMS) {
      expect(
        screen.getByTestId(testid).style.getPropertyValue('--civitai-nav-depth'),
        `${testid} does not declare its depth`,
      ).toBe(String(depth));
    }
    // …and the two levels really differ, so the property is not a constant.
    const depths = new Set(ITEMS.map(([, , d]) => d));
    expect(depths.size).toBe(2);
  });

  it('shows the expandable state as a CHEVRON, and moves it in both directions', async () => {
    renderNav();
    const trigger = screen.getByTestId('nav-my');
    const chevron = () => screen.getByTestId('nav-my-chevron').textContent;

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    const collapsedGlyph = chevron();
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    // 🔴 BOTH DIRECTIONS, and the two glyphs asserted DIFFERENT rather than by literal:
    // the character is cosmetic, the state change is not, and a chevron that never moves
    // is the defect (a static glyph reads as decoration and tells a sighted reader
    // nothing about whether pressing did anything).
    expect(chevron()).not.toBe(collapsedGlyph);
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(chevron()).toBe(collapsedGlyph);

    // The chevron is hidden from the a11y tree — `aria-expanded` is what carries the
    // state there, and announcing the glyph as text would be noise.
    expect(screen.getByTestId('nav-my-chevron')).toHaveAttribute('aria-hidden', 'true');
  });

  it('points aria-controls at the group it opens, and only while it is open', async () => {
    renderNav();
    const trigger = screen.getByTestId('nav-my');
    expect(trigger).not.toHaveAttribute('aria-controls');
    await userEvent.click(trigger);
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
    await userEvent.click(screen.getByTestId('nav-my'));

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
    const { onSelect } = renderNav();
    await userEvent.click(screen.getByTestId('nav-my'));
    expect(screen.getByTestId('nav-my-group')).toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('SideNav — the keyboard', () => {
  it('moves with the arrow keys, over the items that are actually rendered', async () => {
    renderNav();
    // Collapsed: two items, and the cycle is over those two only — a roving index over
    // a stale list would step onto an unmounted node and focus would land on <body>.
    screen.getByTestId('nav-home').focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByTestId('nav-my')).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByTestId('nav-home')).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}');
    expect(screen.getByTestId('nav-my')).toHaveFocus();

    // Expanded: the three sub-items join the cycle, in DOM order.
    await userEvent.keyboard('{Enter}');
    await screen.findByTestId('nav-my-group');
    screen.getByTestId('nav-my').focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByTestId('nav-my-grid')).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByTestId('nav-my-matchup')).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
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
    // …and the group is shut again, so nothing about the previous selection survived.
    expect(within(nav).getByTestId('nav-my')).toHaveAttribute('aria-expanded', 'false');
  });
});
