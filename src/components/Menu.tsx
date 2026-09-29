// The app's ONE dropdown menu — a `⋮` overflow trigger plus a `role="menu"`
// panel — and the single place this repo's menu keyboard machinery lives.
//
// ── WHY IT EXISTS, AND WHERE IT CAME FROM ───────────────────────────────────
//
// 🔴 LIFTED FROM `ContributeMenu.tsx`, WHICH IS DELETED. That component (the
// Contribute dropdown the one-page IA refactor added, removed again by the
// sidebar change) owned all of the behaviour below. It is here rather than
// re-derived because each piece was separately learned, and the FIRST is the one
// its own header named as easy to drop:
//
//   1. FOCUS RETURN TO THE TRIGGER on close. The focused item is about to be
//      unmounted, so without an explicit restore the ring lands on `<body>` and a
//      keyboard viewer is dumped at the top of the document, with the menu they
//      just used no longer reachable by Tab from where they are.
//   2. ESCAPE CLOSES from anywhere inside the panel or the trigger.
//   3. AN OUTSIDE POINTER PRESS CLOSES WITHOUT STEALING FOCUS BACK — the viewer
//      is already going somewhere else, so yanking focus back to the trigger
//      fights them.
//   4. ARROW-KEY ROVING over the panel's controls, so the menu is usable without
//      a pointer. Native `<button>` already handles Enter/Space.
//   5. FOCUS MOVES INTO THE PANEL ON OPEN, so Enter/Space act on an item rather
//      than re-triggering the button behind it.
//
// Plus the 44px tap floor, which is `compact.ts`'s job and not this file's:
// `[role='menuitem']` is back in that sheet for exactly this component.
//
// ── ONE SHARPENING OVER `ContributeMenu`: ESCAPE IN THE CAPTURE PHASE ────────
//
// 🔴 THIS MENU OPENS INSIDE A MODAL AND `ContributeMenu` NEVER DID, which makes
// its bubble-phase Escape handler wrong here. MEASURED in
// `node_modules/@civitai/blocks-react/dist/ui/Modal.js` (lines 47-61): the pack's
// `Modal` registers its own `keydown` on `document` in the BUBBLE phase while
// open, and its comment says it deliberately does NOT `stopPropagation`. The
// modal mounts before this menu opens, so its listener is registered first — and
// `stopPropagation()` does not stop another listener already attached to the SAME
// node. A bubble-phase handler here would therefore close the menu AND the modal
// on one Escape, losing the viewer's place.
//
// So the listener is attached with `capture: true`. Capture at `document` runs
// before the bubble phase reaches `document` at all, so `stopPropagation()` there
// keeps the event from the modal entirely: the first Escape closes the menu, a
// second closes the modal. The `describe('Menu — nested inside a Modal')` case in
// `Menu.test.tsx` pins it.
//
// ⚠️ THAT CROSS-REFERENCE USED TO NAME AN IDENTIFIER THAT DOES NOT EXIST —
// `menuInsideModalEscape`. `git grep` for it returned exactly one hit: the comment
// itself. A cross-reference is a CLAIM, and a reader who greps for a named case and
// finds nothing has no way to tell "renamed" from "never written". The mechanism
// above is unchanged and correct; only the citation was wrong.
//
// ── THE UPSTREAM COMPONENT IS STILL BLOCKED ─────────────────────────────────
//
// ⚠️ PROVENANCE, SPLIT EXPLICITLY, the way `ResourceName.tsx` splits its three
// routes — because the two halves below are NOT equally strong and a previous
// version of this block presented both as one measurement.
//
// 🔴 LIVE, MEASURED ON THIS TREE (the only half that describes what this repo
// builds against). `package.json` pins `@civitai/components-react: ^0.4.1`;
// installed are `components-react@0.4.1` and, transitively,
// `components@0.4.1`. Their `exports` maps are `["."]` and `[".", "./styles.css"]`
// — there is NO `./elements` subpath. Enumerated with `find -L … -print0 | xargs -0
// grep -l` over all 1016 files under `node_modules/.pnpm/@civitai+*` (`-L` because
// pnpm's layout is symlinks, and `grep -r` here honours `.gitignore`):
//
//     Civitai        121 files   ← positive control, the scan can see the tree
//     ReportButton     8 files   ← positive control, a real exported component
//     menuitem        16 files   ← positive control, the role IS shipped
//     CivitaiMenu      0 files
//     civitai-menu     0 files
//     popover-open     0 files
//     showPopover      0 files
//
// 🔴 SO THE SWAP *IS* GATED ON A VERSION BUMP ON THIS TREE, and the line that said
// otherwise is RETRACTED. It read: "THE SWAP is gated on either of those closing …
// It is NOT gated on a version bump." That is false here for the plainest possible
// reason — the installed package ships no menu element to swap to.
//
// ⚠️ AND THE TWO FILES DISAGREED FOR TWO WHOLE ROUNDS, not one. `sideNav.test.tsx`
// states the compatible fact — "the pinned `@civitai/components@0.4.1` installed here
// SHIPS NO NAV ELEMENT AT ALL" — and it landed in `035bc14`, a round-0 CORRECTION
// commit, i.e. AFTER the wrong line here (`c6d7896`) and without noticing it. A draft
// of this paragraph said the two were "in the same diff"; they were not, and the real
// history is worse: a round dedicated to correcting false claims read the installed
// version correctly in one file while leaving the opposite claim standing in another.
//
// The version bump is a PREREQUISITE; the findings below are ADDITIONAL blockers that a
// bump alone would not clear.
//
// ⚠️ SECOND-HAND, FROM A DIFFERENT TREE — the parked five-package bump
// (`components@0.8.1` / `components-react@0.9.0`), not the installed pins. Nobody
// has reproduced any of it from this checkout, and nothing here could: the element
// does not exist to mount. Re-measure at swap time rather than trusting these lines.
// Filed as `civitai-app-starters` **issue #485**:
//
//   - `<civitai-menu>` throws on **MOUNT**, not on open. `open` carries a
//     constructor default, so `changed.has('open')` is true on the first update
//     and the element evaluates `:popover-open` immediately — `DOMException:
//     unknown pseudo-class selector ':popover-open'`. There is no state in which
//     it renders inertly.
//   - **UPGRADING JSDOM IS NOT AN ESCAPE ROUTE.** Reported at jsdom 30.1.1: the
//     selector stops throwing and the failure merely moves to `TypeError:
//     panel.showPopover is not a function`.
//   - ADDRESSABILITY, the second half of #485: upstream renders the panel inside
//     its own shadow root. `part="panel"` exists and `::part(panel)` resolves, so
//     STYLING is not the gap — `document.querySelector('[part="panel"]')` is
//     null, and wrapping the items in a consumer `<div data-testid>` makes
//     upstream's `assignedElements` see `['DIV']`, so its `role="menuitem"`
//     filter yields ZERO items and focus goes nowhere.
//   - And the menu element IS exported from a public `./elements` subpath at 0.9.0,
//     i.e. "upstream has none" was wrong and stays retracted — three drafts of
//     `ContributeMenu`'s header said it. A name-grep of `src/index.ts` could not see
//     `export * from './elements/index.js'`; a wildcard re-export is invisible to a
//     name search.
//
// 🔵 SO THE SWAP NEEDS ALL THREE: the five-package bump lands, a real-browser test
// runner exists for this repo (or #485's mount throw is fixed upstream), and the
// panel becomes addressable. When it happens: replace the `<div role="menu">` below
// with `<CivitaiMenu>` and delete the key handling. The trigger, the panel and the
// item testids are the contract; keep them.
//
// ⚠ One thing the swap will NOT fix — and this reading is SECOND-HAND too, from the
// same 0.8.1 tree: `<civitai-menu-item>`'s `:host` is `padding: 7px 14px` on a
// 14px/1.4 font = 33.6px, BELOW this repo's 44px floor. It sets `role="menuitem"` on
// its own light-DOM host, so `compact.ts`'s rule reaches it either way — which is why
// that fix lives there and not here.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { Button } from '@civitai/blocks-react/ui';

import { ICON_BUTTON_SELECTOR, MENU_ITEM_SELECTOR } from '../compact.js';
import { rovingTarget } from '../lib/roving.js';
import { elevate, radius, token } from '../theme.js';

/**
 * Marks a wrapper around a CONFIRM-FLOW control hosted in the panel.
 *
 * 🔴 WHY THE ESCAPE HATCH EXISTS, stated rather than assumed. Two of the three
 * row actions — Remove ({@link WithdrawButton}) and Report (the pack's
 * `ReportButton`) — are two-step controls: the trigger arms a confirm, and the
 * confirm is what fires. A single `role="menuitem"` cannot express that, and
 * `ReportButtonProps` exposes no role hook at all (it is upstream, and its copy
 * is deliberately frozen so no block can reword a report into a deletion). So
 * those controls are rendered AS THEMSELVES inside `<div role="none">`, which is
 * ARIA's own presentational wrapper for non-menuitem content in a menu, and this
 * attribute is how the keyboard machinery still reaches whichever button they
 * currently render.
 *
 * Their 44px floor comes from `compact.ts`'s EXISTING `[data-civitai-ui='button']`
 * selector — they are pack Buttons — not from the menuitem rule.
 */
export const MENU_CONTROL_ATTR = 'data-mb-menu-control';

/**
 * Everything the menu's focus machinery moves over, in DOM order.
 *
 * Both halves are load-bearing: a menu offered to a NON-owner contains only a
 * Report control and no `role="menuitem"` at all, so a selector covering just the
 * role would leave that (very common) menu with nothing to focus on open.
 */
export const MENU_FOCUSABLE_SELECTOR = `${MENU_ITEM_SELECTOR},[${MENU_CONTROL_ATTR}] button`;

/**
 * The attribute `compact.ts` floors at 44px **wide**, stamped on the `⋮` trigger.
 *
 * 🔴 THE TRIGGER IS THIS APP'S FIRST TEXT-LESS CONTROL, so it is the first one whose
 * SHORT AXIS is width rather than height. `compact.ts`'s existing rule is `min-height`
 * only, which is sufficient for every text-bearing control and does nothing for a
 * 14×14 glyph in a `size="sm"` button. Derived from `ICON_BUTTON_SELECTOR` rather than
 * spelled again, so the rule, this component and the reachability case name it once.
 *
 * ⚠️ jsdom performs NO LAYOUT, so a LIVE reading at ≤720px is owed — see
 * `ICON_BUTTON_SELECTOR`'s docblock in `compact.ts`.
 */
export const ICON_BUTTON_ATTR = ICON_BUTTON_SELECTOR.slice(1, -1);

/**
 * Close the menu from inside it.
 *
 * A context rather than a render prop so a nested control (a `MenuItem`, or a
 * caller's own button) can close without every intermediate component threading
 * the callback. Defaults to a no-op, so a `MenuItem` rendered outside a `Menu`
 * degrades to a plain button instead of throwing.
 */
const MenuCloseContext = createContext<(refocus?: boolean) => void>(() => {});

/** Close the enclosing {@link Menu}. `refocus` defaults to true — see `Menu`. */
export function useMenuClose(): (refocus?: boolean) => void {
  return useContext(MenuCloseContext);
}

export interface MenuProps {
  /**
   * The accessible name of BOTH the trigger and the panel — e.g. "Matchup
   * actions". The trigger's visible content is a decorative glyph, so this is the
   * only thing a screen reader has to go on.
   */
  label: string;
  /** Test hook for the TRIGGER. */
  'data-testid': string;
  /**
   * Test hook for the PANEL.
   *
   * 🔴 A SEPARATE PROP RATHER THAN A TEMPLATE OVER THE TRIGGER'S ID, and that is
   * about the TESTID SCAN, not about taste. `renameWireCompat.test.ts` expands a
   * template-literal testid over a known union of variable names and FAILS LOUDLY on
   * a variable it does not know — so deriving the panel id from `testId` here would
   * either red that guard or need a fake union invented for it. Two explicit props
   * keep both ids literal at the call site, and that scan grew a third pattern over
   * THIS prop name so the panel's ids land in the ledger like any other. (The prop
   * name is deliberately not spelled with an attribute-shaped example here — the
   * scan reads raw source, comments included, and would count it as a fourth site.)
   */
  panelTestId: string;
  children: ReactNode;
}

const triggerGlyph = (
  // Three vertical dots — the conventional overflow affordance. `currentColor`
  // so it follows the Button's theme, `aria-hidden` because `label` above is the
  // accessible name.
  <svg
    aria-hidden="true"
    focusable="false"
    width="14"
    height="14"
    viewBox="0 0 14 14"
    fill="currentColor"
  >
    <circle cx="7" cy="2.5" r="1.35" />
    <circle cx="7" cy="7" r="1.35" />
    <circle cx="7" cy="11.5" r="1.35" />
  </svg>
);

export function Menu({
  label,
  'data-testid': testId,
  panelTestId,
  children,
}: MenuProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  /** Close, and hand focus back to the trigger unless told not to (see piece 3). */
  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // CAPTURE phase + stopPropagation — see this file's header. A bubble-phase
      // handler would close the enclosing pack Modal on the same press.
      e.stopPropagation();
      close();
    };
    const onPointerDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (panelRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      close(false);
    };
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open, close]);

  // Move focus into the panel on open.
  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>(MENU_FOCUSABLE_SELECTOR)?.focus();
  }, [open]);

  return (
    <MenuCloseContext.Provider value={close}>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <Button
          ref={triggerRef}
          size="sm"
          variant="subtle"
          {...{ [ICON_BUTTON_ATTR]: 'true' }}
          data-testid={testId}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          aria-label={label}
          onClick={() => (open ? close() : setOpen(true))}
        >
          {triggerGlyph}
        </Button>
        {open && (
          <div
            ref={panelRef}
            id={panelId}
            role="menu"
            aria-label={label}
            data-testid={panelTestId}
            style={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              right: 0,
              zIndex: 20,
              minWidth: 176,
              display: 'grid',
              padding: 4,
              gap: 2,
              background: token.surface,
              border: `1px solid ${token.border}`,
              borderRadius: radius.md,
              boxShadow: `0 6px 18px ${elevate(12)}`,
            }}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
              const items = Array.from(
                panelRef.current?.querySelectorAll<HTMLElement>(MENU_FOCUSABLE_SELECTOR) ?? [],
              );
              if (items.length === 0) return;
              e.preventDefault();
              // 🔴 THE ARITHMETIC IS `lib/roving.ts`'s, not inline, and it used to be
              // WRONG here and in `SideNav` identically: `indexOf` is -1 when focus is
              // not on an item, and `(-1 - 1 + n) % n` is `n - 2`, so ArrowUp landed
              // second-to-last. See that module for why the -1 branch is not reachable
              // through today's call sites and why the fix is still worth making.
              const i = items.indexOf(document.activeElement as HTMLElement);
              const step = e.key === 'ArrowDown' ? 1 : -1;
              items[rovingTarget(items.length, i, step)]!.focus();
            }}
          >
            {children}
          </div>
        )}
      </div>
    </MenuCloseContext.Provider>
  );
}

export interface MenuItemProps {
  /** Visible text. */
  label: string;
  /**
   * The accessible name, when the visible text is too terse to say what pressing
   * this does. A screen reader user gets no surrounding context for free.
   */
  ariaLabel?: string;
  onSelect: () => void;
  'data-testid': string;
  /** Destructive tone (colour only — never the sole carrier of meaning). */
  danger?: boolean;
}

/**
 * One single-press item.
 *
 * 🔴 IT CLOSES THE MENU *BEFORE* RUNNING THE HANDLER, and hands focus back to the
 * trigger on the way — so a handler that opens a modal receives a predictable
 * focus origin rather than one pointing at a node that is being unmounted.
 */
export function MenuItem({
  label,
  ariaLabel,
  onSelect,
  'data-testid': testId,
  danger = false,
}: MenuItemProps): React.JSX.Element {
  const close = useMenuClose();
  return (
    <button
      type="button"
      role="menuitem"
      data-testid={testId}
      {...(ariaLabel === undefined ? {} : { 'aria-label': ariaLabel })}
      onClick={() => {
        close();
        onSelect();
      }}
      style={{
        appearance: 'none',
        textAlign: 'left',
        font: 'inherit',
        fontSize: 13,
        cursor: 'pointer',
        padding: '8px 10px',
        borderRadius: radius.sm,
        border: '1px solid transparent',
        background: 'transparent',
        color: danger ? token.error : token.text,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = elevate(6);
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = token.primary;
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = 'transparent';
      }}
    >
      {label}
    </button>
  );
}

/**
 * Host a CONFIRM-FLOW control (Remove, Report) inside the panel.
 *
 * `role="none"` because the wrapper is presentational: the control inside is a
 * pack Button, not a menuitem, and a `role="menu"` may only contain menu roles or
 * presentational wrappers. See {@link MENU_CONTROL_ATTR} for why those two
 * controls cannot be menuitems.
 */
export function MenuControl({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <div role="none" {...{ [MENU_CONTROL_ATTR]: 'true' }} style={{ display: 'grid', gap: 4 }}>
      {children}
    </div>
  );
}
