// The ⋮ menu's KEYBOARD AND FOCUS MACHINERY, tested ONCE, here.
//
// 🔴 THIS IS THE ONLY PLACE THE MACHINERY IS ASSERTED. `MatchupBody` and
// `PromptBody` both mount a `Menu`, and their own tests assert WIRING — that Edit
// calls `onEdit`, that a non-owner is offered Report and not Remove. Re-asserting
// focus return or Escape at each site would be two copies of one claim that can
// only ever agree, and the second copy is what stops anyone noticing the first has
// rotted.
//
// 🔴 A BRAND-NEW FILE, SO NONE OF IT CAN BE RED AT BASE. `components/Menu.tsx` does
// not exist on `zach/ia-feedback-sidebar`, so every case here is new coverage of new
// code rather than a regression guard over a fixed bug — and saying "0 of N red at
// base" as if it were coverage is exactly the dishonesty this repo's other test
// headers call out. What each case IS: a pin on one of the five behaviours the
// deleted `ContributeMenu` had learned, so a future rewrite (or the upstream
// `<civitai-menu>` swap that issue #485 gates) cannot quietly drop one. The
// focus-return case is the one `ContributeMenu`'s own header named as easy to drop.
//
// ⚠ jsdom performs no layout, so nothing here says the panel APPEARS anywhere
// sensible. The 44px floor is a cascade claim and lives in
// `mobile-responsive.test.tsx`, which reads computed styles off live nodes.

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Modal } from '@civitai/blocks-react/ui';

import { Menu, MenuControl, MenuItem } from './Menu.js';

/** A menu with two single-press items and one hosted confirm-flow control. */
function Fixture({ onA = vi.fn(), onB = vi.fn() }: { onA?: () => void; onB?: () => void }) {
  return (
    <>
      <button type="button" data-testid="outside">
        outside
      </button>
      <Menu label="Row actions" data-testid="row-menu" panelTestId="row-menu-items">
        <MenuItem label="Alpha" onSelect={onA} data-testid="item-a" />
        <MenuItem label="Beta" onSelect={onB} data-testid="item-b" />
        <MenuControl>
          <button type="button" data-testid="hosted">
            Hosted
          </button>
        </MenuControl>
      </Menu>
    </>
  );
}

describe('Menu — the trigger contract', () => {
  it('renders the panel only once opened, and says so on the trigger', async () => {
    render(<Fixture />);
    const trigger = screen.getByTestId('row-menu');
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    // 🔴 ABSENCE FROM THE DOM, not invisibility. A hidden panel would still let
    // `getByTestId` find the items, which is precisely the confusion that makes a
    // moved control look present.
    expect(screen.queryByTestId('row-menu-items')).toBeNull();

    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('row-menu-items')).toHaveAttribute('role', 'menu');
  });

  it('names the trigger and the panel with the caller’s label, not the glyph', async () => {
    // The visible content is a decorative SVG, so without an explicit name the
    // trigger's accessible name would be the empty string.
    render(<Fixture />);
    expect(screen.getByRole('button', { name: 'Row actions' })).toBe(
      screen.getByTestId('row-menu'),
    );
    await userEvent.click(screen.getByTestId('row-menu'));
    expect(screen.getByRole('menu', { name: 'Row actions' })).toBe(
      screen.getByTestId('row-menu-items'),
    );
  });

  it('marks the glyph aria-hidden so it is not announced', async () => {
    render(<Fixture />);
    const svg = screen.getByTestId('row-menu').querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('Menu — focus', () => {
  it('moves focus INTO the panel on open, so Enter acts on an item', async () => {
    render(<Fixture />);
    await userEvent.click(screen.getByTestId('row-menu'));
    // The first focusable in DOM order — a `role="menuitem"` here.
    await waitFor(() => expect(screen.getByTestId('item-a')).toHaveFocus());
  });

  it('🔴 RETURNS FOCUS TO THE TRIGGER when an item is chosen', async () => {
    // The piece `ContributeMenu`'s header named as the easy one to drop: the item
    // that had focus is about to be unmounted, so with no explicit restore the ring
    // lands on <body> and a keyboard viewer is dumped at the top of the document.
    const onA = vi.fn();
    render(<Fixture onA={onA} />);
    await userEvent.click(screen.getByTestId('row-menu'));
    await userEvent.click(screen.getByTestId('item-a'));

    expect(onA).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('row-menu-items')).toBeNull();
    expect(screen.getByTestId('row-menu')).toHaveFocus();
    // …and NOT the fallback the bug produces.
    expect(document.body).not.toHaveFocus();
  });

  it('returns focus to the trigger on Escape too', async () => {
    render(<Fixture />);
    await userEvent.click(screen.getByTestId('row-menu'));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByTestId('row-menu-items')).toBeNull();
    expect(screen.getByTestId('row-menu')).toHaveFocus();
  });

  it('🔴 an OUTSIDE press closes WITHOUT stealing focus back', async () => {
    // The asymmetry is the point: the viewer pressing something else is already
    // going there, and yanking focus back to the trigger fights them. So this case
    // asserts the trigger does NOT have focus — the opposite of the two above, which
    // is why a single "closes" assertion would not cover it.
    render(<Fixture />);
    await userEvent.click(screen.getByTestId('row-menu'));
    await userEvent.click(screen.getByTestId('outside'));

    expect(screen.queryByTestId('row-menu-items')).toBeNull();
    expect(screen.getByTestId('row-menu')).not.toHaveFocus();
    expect(screen.getByTestId('outside')).toHaveFocus();
  });
});

describe('Menu — arrow-key roving', () => {
  it('moves down and wraps, over menuitems AND hosted controls', async () => {
    // 🔴 THE HOSTED CONTROL IS IN THE CYCLE, and that is not cosmetic: a menu
    // offered to a NON-OWNER contains ONLY a hosted Report control and no
    // `role="menuitem"` at all, so a roving selector covering just the role would
    // leave that (very common) menu with nothing to focus.
    render(<Fixture />);
    await userEvent.click(screen.getByTestId('row-menu'));
    await waitFor(() => expect(screen.getByTestId('item-a')).toHaveFocus());

    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByTestId('item-b')).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByTestId('hosted')).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByTestId('item-a')).toHaveFocus();
  });

  it('moves up and wraps the other way', async () => {
    render(<Fixture />);
    await userEvent.click(screen.getByTestId('row-menu'));
    await waitFor(() => expect(screen.getByTestId('item-a')).toHaveFocus());

    await userEvent.keyboard('{ArrowUp}');
    expect(screen.getByTestId('hosted')).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}');
    expect(screen.getByTestId('item-b')).toHaveFocus();
  });

  // 🔴 ENTERING THE SET FROM OUTSIDE IT: ArrowUp must land on the LAST item, and it used
  // to land SECOND-TO-LAST. `indexOf(document.activeElement)` is -1 when focus is not on
  // one of the panel's own controls, and the old inline `(i + step + n) % n` then gives
  // `n - 2`. ArrowDown was right by coincidence (`(-1 + 1 + n) % n === 0`), which is why
  // the pair of cases above could not see it: both start with focus already on `item-a`.
  //
  // ⚠️ AN INVARIANT GUARD, AND LABELLED AS ONE. Through today's production call sites the
  // -1 branch is unreachable — everything focusable inside a real panel is matched by
  // `MENU_FOCUSABLE_SELECTOR`, and the one exception (`ReportButton`'s settled
  // `<span tabIndex={-1}>`) only appears in a panel whose item set is empty, where both
  // handlers return early. `lib/roving.ts` traces that; `lib/roving.test.ts` pins the
  // arithmetic. THIS case is what proves the component is wired to the fixed helper
  // rather than to its own copy, against the real DOM.
  //
  // 🔴 IT USES `fireEvent.keyDown` ON THE PANEL RATHER THAN `userEvent`, and that is
  // forced rather than preferred. MEASURED: `userEvent.type(panel, '{ArrowUp}',
  // { skipClick: true })` dispatches into `document.activeElement`, which in this state
  // is `<body>` — outside the panel — so the component's `onKeyDown` never fires and the
  // case failed with focus still on `<body>`. `fireEvent` targets the node, which is the
  // only way to deliver a keydown to the panel while nothing inside it has focus. It
  // still runs the component's own React handler; this is not a unit call on the helper.
  it('🔴 INVARIANT GUARD: ArrowUp with focus OUTSIDE the panel lands on the LAST item', async () => {
    render(<Fixture />);
    await userEvent.click(screen.getByTestId('row-menu'));
    const panel = await screen.findByTestId('row-menu-items');
    await waitFor(() => expect(screen.getByTestId('item-a')).toHaveFocus());

    // Move focus out of the set WITHOUT closing the panel. `document.body` is not in
    // `MENU_FOCUSABLE_SELECTOR`, so `indexOf` will return -1.
    (screen.getByTestId('item-a') as HTMLElement).blur();
    expect(panel.contains(document.activeElement)).toBe(false);

    fireEvent.keyDown(panel, { key: 'ArrowUp' });
    // LAST, not second-to-last. `item-b` is what the buggy arithmetic selected.
    expect(screen.getByTestId('hosted')).toHaveFocus();
    expect(screen.getByTestId('item-b')).not.toHaveFocus();
  });

  it('🔴 …and ArrowDown from outside lands on the FIRST — the half that was right', async () => {
    // Kept as the pair's other half so the asymmetry is visible: the old formula got
    // this one right, which is exactly why the bug survived. Without it, a "fix" that
    // broke ArrowDown while fixing ArrowUp would be invisible here.
    render(<Fixture />);
    await userEvent.click(screen.getByTestId('row-menu'));
    const panel = await screen.findByTestId('row-menu-items');
    await waitFor(() => expect(screen.getByTestId('item-a')).toHaveFocus());

    (screen.getByTestId('item-a') as HTMLElement).blur();
    fireEvent.keyDown(panel, { key: 'ArrowDown' });
    expect(screen.getByTestId('item-a')).toHaveFocus();
  });
});

describe('Menu — a hosted confirm-flow control', () => {
  it('stays OPEN when something inside the panel is pressed', async () => {
    // 🔴 THE WHOLE REASON `MenuControl` EXISTS. Remove and Report are two-step
    // controls whose confirm renders in place of their trigger, so the panel has to
    // survive the first press or the confirm step is unreachable. A menu that closed
    // on any inside press would make both actions impossible to complete.
    const onHosted = vi.fn();
    render(
      <Menu label="Row actions" data-testid="row-menu" panelTestId="row-menu-items">
        <MenuControl>
          <button type="button" data-testid="hosted" onClick={onHosted}>
            Hosted
          </button>
        </MenuControl>
      </Menu>,
    );
    await userEvent.click(screen.getByTestId('row-menu'));
    await userEvent.click(screen.getByTestId('hosted'));

    expect(onHosted).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('row-menu-items')).toBeInTheDocument();
  });

  it('wraps the control in role="none", so the menu’s ARIA tree stays valid', async () => {
    render(<Fixture />);
    const panel = await (async () => {
      await userEvent.click(screen.getByTestId('row-menu'));
      return screen.getByTestId('row-menu-items');
    })();
    const hosted = within(panel).getByTestId('hosted');
    // A plain <button> is not a menu role; the presentational wrapper is what keeps
    // it from being an invalid child of role="menu".
    expect(hosted.parentElement).toHaveAttribute('role', 'none');
  });
});

describe('Menu — nested inside a Modal', () => {
  it('🔴 Escape closes the MENU ONLY, leaving the modal open', async () => {
    // 🔴 THE ONE BEHAVIOUR THAT IS NOT INHERITED FROM `ContributeMenu`, because that
    // component never opened inside a modal. MEASURED in the pack's `Modal.js`: it
    // registers its own `keydown` on `document` in the BUBBLE phase while open, and
    // its comment says it deliberately does NOT stopPropagation. The modal mounts
    // first, so a bubble-phase handler in the menu cannot stop it — one Escape would
    // close both and lose the viewer's place. The menu listens in the CAPTURE phase
    // instead, which runs before the bubble phase reaches `document` at all.
    const onClose = vi.fn();
    render(
      <Modal opened onClose={onClose} title="Matchup">
        <Fixture />
      </Modal>,
    );
    await userEvent.click(screen.getByTestId('row-menu'));
    await userEvent.keyboard('{Escape}');

    expect(screen.queryByTestId('row-menu-items')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();

    // …and a SECOND Escape, with the menu now closed, does reach the modal. Without
    // this half the case would be satisfied by a menu that swallowed Escape forever.
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
