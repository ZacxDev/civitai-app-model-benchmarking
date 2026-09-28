// The Contribute menu — the one control that replaced the top-level tab strip.
//
// 🔴 IT IS A HAND-BUILT MENU, so the behaviour a pack component would have given
// us for free has to be asserted here: closed by default, `aria-expanded` moving
// in BOTH directions, `role="menu"`/`menuitem`, Escape closing AND returning focus
// to the trigger, and each item firing exactly one distinct handler. There is no
// React `Menu` in any `@civitai/*` package this repo can import (see the header of
// `ContributeMenu.tsx` for what was checked and what the swap will be); until one
// lands, these assertions are the only thing standing between "a menu" and "a div
// that sometimes shows three divs".
//
// ⚠ ROLE NOTE for anyone porting a query from the old strip: that strip's controls
// exposed `role="tab"`. This trigger is a `button` and its items are `menuitem`s.

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CONTRIBUTE_ITEMS, ContributeMenu } from './ContributeMenu.js';

/**
 * The three items, as `[testid, accessible name, which handler must fire]`.
 *
 * 🔴 LITERALS ON EVERY SIDE, and deliberately NOT derived from the component's own
 * `ITEMS` table — a mapping read out of the implementation agrees with a wrong
 * implementation. `CONTRIBUTE_ITEMS` is cross-checked against this table below
 * rather than used to build it.
 */
const ITEMS = [
  ['contribute-item-matchup', 'Submit a matchup', 'matchup'],
  ['contribute-item-prompt', 'Submit a prompt', 'prompt'],
  ['contribute-item-grid', 'Build a grid', 'grid'],
] as const;

function renderMenu() {
  const onSubmitMatchup = vi.fn();
  const onSubmitPrompt = vi.fn();
  const onBuildGrid = vi.fn();
  render(
    <ContributeMenu
      onSubmitMatchup={onSubmitMatchup}
      onSubmitPrompt={onSubmitPrompt}
      onBuildGrid={onBuildGrid}
    />,
  );
  const handlers = { matchup: onSubmitMatchup, prompt: onSubmitPrompt, grid: onBuildGrid };
  const all = [onSubmitMatchup, onSubmitPrompt, onBuildGrid];
  return { handlers, all, trigger: screen.getByTestId('contribute-trigger') };
}

describe('ContributeMenu — the closed state', () => {
  it('renders a named trigger and NO menu', () => {
    const { trigger, all } = renderMenu();
    expect(trigger).toHaveAccessibleName('Contribute');
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.queryByTestId('contribute-menu-items')).toBeNull();
    // Nothing fired just by rendering.
    for (const fn of all) expect(fn).toHaveBeenCalledTimes(0);
  });
});

describe('ContributeMenu — opening', () => {
  it('opens on click, flips aria-expanded, and exposes role="menu"', async () => {
    const { trigger } = renderMenu();
    await userEvent.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const menu = screen.getByRole('menu');
    expect(menu).toHaveAccessibleName('Contribute');
    // The trigger points AT the menu it opened, so a screen reader can follow it.
    expect(trigger.getAttribute('aria-controls')).toBe(menu.getAttribute('id'));
  });

  it('🔴 LEDGER: the menu holds EXACTLY these three items, in this order', async () => {
    const { trigger } = renderMenu();
    await userEvent.click(trigger);
    const menu = screen.getByRole('menu');

    // Fails when an item is ADDED as loudly as when one is removed or renamed —
    // the contribution surface is a decision, not a drift.
    const items = within(menu).getAllByRole('menuitem');
    expect(items).toHaveLength(3);
    expect(items.map((el) => el.getAttribute('data-testid'))).toEqual(ITEMS.map(([t]) => t));
    expect(items.map((el) => el.textContent)).toEqual(ITEMS.map(([, name]) => name));
    // …and nothing else in the popover is a control at all: every focusable
    // descendant IS one of the three items. A fourth button that forgot
    // `role="menuitem"` would slip past the ledger above and still be tabbable.
    const focusable = Array.from(menu.querySelectorAll('button, a[href], [tabindex]'));
    expect(focusable).toEqual(items);

    // The component's own exported ledger agrees with this table. Cross-checked,
    // not used to build it — the table above is the contract.
    expect(CONTRIBUTE_ITEMS.map((i) => [i.testid, i.label])).toEqual(
      ITEMS.map(([t, name]) => [t, name]),
    );
  });

  it('closes again on a second trigger click, flipping aria-expanded back', async () => {
    const { trigger } = renderMenu();
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('ContributeMenu — each item fires its own handler, and only its own', () => {
  for (const [testid, , which] of ITEMS) {
    it(`${testid} fires ${which} exactly once and nothing else`, async () => {
      const { trigger, handlers, all } = renderMenu();
      await userEvent.click(trigger);
      await userEvent.click(screen.getByTestId(testid));

      // EXACT counts, and the two siblings asserted at ZERO: "was called" alone
      // is satisfied by a menu that fires all three.
      expect(handlers[which]).toHaveBeenCalledTimes(1);
      for (const fn of all) {
        if (fn !== handlers[which]) expect(fn).toHaveBeenCalledTimes(0);
      }
      // Choosing an item closes the menu — otherwise it floats over the modal it
      // just opened.
      expect(screen.queryByRole('menu')).toBeNull();
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });
  }

  it('activates an item from the keyboard', async () => {
    const { trigger, handlers } = renderMenu();
    await userEvent.click(trigger);
    // Focus lands on the first item when the menu opens, so Enter acts on it
    // rather than re-triggering the button behind it.
    expect(screen.getByTestId('contribute-item-matchup')).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByTestId('contribute-item-prompt')).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(handlers.prompt).toHaveBeenCalledTimes(1);
    expect(handlers.matchup).toHaveBeenCalledTimes(0);
  });
});

describe('ContributeMenu — Escape', () => {
  it('🔴 closes AND returns focus to the trigger', async () => {
    const { trigger, all } = renderMenu();
    await userEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    // 🔴 THE FOCUS RETURN IS THE HALF THAT GETS DROPPED. The focused item is
    // unmounted by the close, so without an explicit restore the ring lands on
    // <body> and a keyboard viewer is dumped at the top of the document with the
    // menu they just used no longer reachable by Tab from where they are.
    expect(trigger).toHaveFocus();
    // Escape is a dismissal, not a choice.
    for (const fn of all) expect(fn).toHaveBeenCalledTimes(0);
  });

  it('closes on an outside press WITHOUT stealing focus back', async () => {
    render(
      <div>
        <button type="button" data-testid="outside">
          elsewhere
        </button>
        <ContributeMenu onSubmitMatchup={vi.fn()} onSubmitPrompt={vi.fn()} onBuildGrid={vi.fn()} />
      </div>,
    );
    await userEvent.click(screen.getByTestId('contribute-trigger'));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await userEvent.click(screen.getByTestId('outside'));

    expect(screen.queryByRole('menu')).toBeNull();
    // The viewer was already going somewhere else — yanking focus back to the
    // trigger would undo the click they just made.
    expect(screen.getByTestId('contribute-trigger')).not.toHaveFocus();
  });
});
