// The page's single CONTRIBUTE affordance — the one control that replaced the
// top-level tab strip when the app became one page (the IA refactor).
//
// 🔴 WHY THIS IS A LOCAL COMPONENT. NOT because upstream lacks a menu — it has
// one, and three earlier drafts of this comment said otherwise. RETRACTED, so
// nobody derives a fourth:
//   ✗ "no React `Menu` in any `@civitai/*` package"
//   ✗ "`components-react`'s index at 0.9.0 does not export one either"
//   ✗ "a starters PR is open to export it / deep-importing is not an option"
// All three are false. `components-react@0.9.0`'s root index is
// `export * from './elements/index.js'`, and its `exports` map declares
// `./elements` and `./elements/*` as PUBLIC subpaths whose `dist/elements/
// index.d.ts` names `CivitaiMenu`, `CivitaiMenuItem` and `CivitaiMenuLabel`
// (read from the published tarball, 2026-09-27). A name-grep of `src/index.ts`
// cannot see a wildcard re-export, which is how the first draft went wrong and
// how the next two inherited it. Only the claim about the INSTALLED `0.4.1` was
// ever true.
//
// 🔴 THE ACTUAL BLOCKER IS THE TEST ENVIRONMENT, AND IT IS NOT OURS TO FIX HERE.
// `<civitai-menu>` opens its panel with the native popover API —
// `panel.showPopover()`, `panel.matches(':popover-open')`. jsdom 25 implements
// NONE of it: `showPopover`/`hidePopover`/`togglePopover` are `undefined`, the
// `popover` property reads `false`, and `:popover-open` THROWS
// `unknown pseudo-class selector` (probed directly, 2026-09-27). The upstream
// menu therefore cannot be opened by any test in this repo's `dom` project.
// Second, independent blocker: `contribute-menu-items` is part of a cross-repo
// capture contract (see `src/capture-landmarks.test.tsx`), and upstream renders
// the panel inside its own shadow root with no app-settable attribute hook — the
// trigger and the three slotted items CAN carry their testids; the panel cannot.
//
// The native site's own Create button is Mantine
// (`civitai/civitai` src/components/AppLayout/AppHeader/CreateMenu.tsx) and is
// unreachable from inside a block, so it is not an alternative either.
//
// 🔵 THE SWAP is gated on EITHER of those closing — a real-browser test runner
// for this repo, or an upstream change giving the panel an app-settable testid
// and an open path jsdom can drive. It is NOT gated on a version bump, and
// bumping to reach it costs five packages (`blocks-react@0.58.1` peers
// `app-sdk >=0.49.0`, against the `^0.42.0` pinned here). When it does happen:
// replace the `<div role="menu">` below with `<CivitaiMenu>` and delete
// `useMenuKeys`. The trigger, the three items and their testids are the
// contract; keep them.
//
// ⚠ One thing the swap will NOT fix, measured rather than assumed:
// `<civitai-menu-item>`'s `:host` is `padding: 7px 14px` on a 14px/1.4 font =
// 33.6px, BELOW this repo's 44px floor and marginally worse than the local items.
// It sets `role="menuitem"` on its own light-DOM host, so `compact.ts`'s rule
// reaches it either way — which is why that fix lives there and not here.
//
// Styling goes through the app's own `token`/`radius` theme vars, so the popover
// reads as one system with the pack — no hardcoded colors.

import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { Button } from '@civitai/blocks-react/ui';

import { elevate, radius, token } from '../theme.js';

export interface ContributeMenuProps {
  /** Open the PUBLIC matchup submit form (what `MatchupsView.onSubmitNew` opens). */
  onSubmitMatchup: () => void;
  /** Open the PUBLIC prompt submit form (what `PromptsView.onSubmitNew` opens). */
  onSubmitPrompt: () => void;
  /** Open the PRIVATE grid form (what `GridsView.onNewUnpublished` opens). A grid
   * has no public create path — see App's `ModalState`. */
  onBuildGrid: () => void;
}

/**
 * The three items, as `[testid, label, which handler]`.
 *
 * 🔴 A LEDGER LIVES OFF THIS SHAPE, so adding a fourth contribution kind fails a
 * test rather than silently widening the menu. The labels are the accessible
 * names a capture recipe and a screen reader both read.
 */
const ITEMS = [
  ['contribute-item-matchup', 'Submit a matchup', 'onSubmitMatchup'],
  ['contribute-item-prompt', 'Submit a prompt', 'onSubmitPrompt'],
  ['contribute-item-grid', 'Build a grid', 'onBuildGrid'],
] as const satisfies ReadonlyArray<readonly [string, string, keyof ContributeMenuProps]>;

export function ContributeMenu(props: ContributeMenuProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  /**
   * Close and hand focus back to the trigger.
   *
   * 🔴 THE FOCUS RETURN IS THE PART THAT IS EASY TO DROP. The item that was
   * focused is about to be unmounted, so without this the focus ring lands on
   * `<body>` and a keyboard viewer is dumped at the top of the document — the
   * menu they just used is no longer reachable by Tab from where they are.
   */
  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }, []);

  // Escape closes from anywhere inside the menu or the trigger; an outside press
  // closes WITHOUT stealing focus back (the viewer is already going elsewhere).
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    const onPointerDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (menuRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      close(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open, close]);

  // Move focus into the menu when it opens, so Enter/Space act on an item rather
  // than re-triggering the button behind it.
  useEffect(() => {
    if (!open) return;
    const first = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
    first?.focus();
  }, [open]);

  const choose = (handler: keyof ContributeMenuProps) => {
    // Close FIRST (and give focus back) so the modal the handler opens receives a
    // predictable focus origin, then run the handler.
    close();
    props[handler]();
  };

  return (
    <div style={{ position: 'relative', flexShrink: 0 }} data-testid="contribute-menu">
      <Button
        ref={triggerRef}
        size="sm"
        data-testid="contribute-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close() : setOpen(true))}
        rightSection={<span aria-hidden="true">▾</span>}
      >
        Contribute
      </Button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="Contribute"
          data-testid="contribute-menu-items"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            zIndex: 20,
            minWidth: 200,
            display: 'grid',
            padding: 4,
            gap: 2,
            background: token.surface,
            border: `1px solid ${token.border}`,
            borderRadius: radius.md,
            boxShadow: `0 6px 18px ${elevate(12)}`,
          }}
          onKeyDown={(e) => {
            // Roving focus, so the menu is usable without a pointer. Native
            // <button> already handles Enter/Space activation.
            const items = Array.from(
              menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
            );
            if (items.length === 0) return;
            const i = items.indexOf(document.activeElement as HTMLElement);
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              items[(i + 1 + items.length) % items.length]!.focus();
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              items[(i - 1 + items.length) % items.length]!.focus();
            }
          }}
        >
          {ITEMS.map(([testid, label, handler]) => (
            <button
              key={testid}
              type="button"
              role="menuitem"
              data-testid={testid}
              onClick={() => choose(handler)}
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
                color: token.text,
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
          ))}
        </div>
      )}
    </div>
  );
}

/** The item ledger, exported so a test asserts the SET rather than a count. */
export const CONTRIBUTE_ITEMS = ITEMS.map(([testid, label]) => ({ testid, label }));
