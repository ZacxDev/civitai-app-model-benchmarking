// The page's PRIMARY navigation — a SLIDE-OUT sidebar carrying the upstream
// `<civitai-nav-list>` / `<civitai-nav-item>` web components (@civitai/components,
// registered by `src/define-upstream.ts`).
//
// ── WHAT IT REPLACED, AND WHEN (operator, 2026-10-17) ──────────────────────
//
// Two things, in one call:
//
//   1. THE LOCAL MIRROR. This file used to be a hand-built nav that MIRRORED
//      the upstream elements' contract (same `--civitai-nav-depth` indent
//      step, same chevron, same `aria-current` discipline) because the swap
//      was gated on a `components-react` bump. The operator's call made the
//      elements themselves the nav: `@civitai/components` is now a DIRECT
//      dependency and the real elements render here. Everything the mirror
//      re-implemented — depth indent, group disclosure, current marking,
//      auto-opening the group above the current item — is the ELEMENTS' code
//      now, not this file's. What this file owns is the DRAWER (scrim,
//      slide, close) and the routing table, which upstream does not ship:
//      it ships nav PRIMITIVES, not a shell.
//
//   2. THE PERMANENT RAIL / TOP STRIP. The nav used to sit in the page flow —
//      a left column on wide viewports, a horizontal strip under the header
//      on compact ones (the strip overflowed: 411px of items in a 345px
//      scroller at 390px, measured). It is a slide-over at EVERY width now:
//      closed until the header's menu button (`nav-toggle` in `App`) opens
//      it. The compact strip rules in `compact.ts` went with it.
//
// ── THE ITEMS ARE PAGES NOW ────────────────────────────────────────────────
//
// The community boards (Grids / Matchups / Prompts) are ITEMS HERE, beside
// Home and the My Benchmarks group — not a segmented subnav under the open
// grid. The `BoardNav` component is deleted; each board is a dedicated page
// (view) reached from this sidebar, and only the selected page is mounted.
//
// ── HOW ROUTING WORKS ──────────────────────────────────────────────────────
//
// 🔴 IT HOLDS NO VIEW STATE. The selected view lives in `App` — which is what
// makes the grid's in-flight runs survive a trip to My Benchmarks and back
// (see the view-switch cases in `money-path.test.tsx`). The only state here
// is none at all: even the drawer's open/closed is `App`'s, because the
// toggle button lives in `App`'s header.
//
// Item `href`s are ROUTE STRINGS, not URLs — every item click is intercepted
// (`preventDefault`) and turned into `onSelect`. The strings exist because
// `civitai-nav-list`'s `current` matching is by `href`: the list marks the
// item whose `href` equals its `current` and opens the groups above it. An
// EMPTY href would make an item render as a GROUP (disclosure button), which
// is exactly how the My Benchmarks item below works — it has no `href` and
// its toggle is the element's own.
//
// 🔴 CLICKS LAND ON THE HOST ELEMENT. The clickable row is inside the item's
// shadow root (`part="link"` / `part="button"`), but a click on it retargets
// to the host for listeners outside the shadow — so the host's `onClick` is
// the one wiring that works in the real host AND in jsdom, where the shadow
// row may not be reachable the same way. The testids therefore sit on the
// HOSTS, where they always resolve, open drawer or not.
//
// 🔴 THE SELECTION IS NOT PERSISTED ANYWHERE. No KV write, no URL, no
// deep-linking — an operator decision (YAGNI). A reload opens on Home.

import { useEffect } from 'react';

import { Button, Group } from '@civitai/blocks-react/ui';

import type { MyNoun } from '../types.js';
import { token } from '../theme.js';
import '../define-upstream.js';

export type { MyNoun };

/** Which community board page is mounted. Spells the `section-<board>` testid suffix. */
export type Board = 'grids' | 'matchups' | 'prompts';

/**
 * The selected view.
 *
 * 🔴 A DISCRIMINATED UNION, NOT A STRING. `'my-grid'` would make "is this a My
 * view" a prefix test — and a prefix test is the kind of predicate that gets
 * open-coded at three call sites and disagrees at two of them.
 * `view.kind === 'my'` cannot.
 */
export type MainView =
  | { kind: 'home' }
  | { kind: 'board'; board: Board }
  | { kind: 'my'; noun: MyNoun };

/**
 * The route string a view answers to — the `href` vocabulary `civitai-nav-list`
 * matches `current` against. Home is `'/'`, never `''`: an empty href makes
 * `civitai-nav-item` render as a collapsible GROUP header instead of a link.
 */
export function viewRoute(view: MainView): string {
  switch (view.kind) {
    case 'home':
      return '/';
    case 'board':
      return view.board;
    case 'my':
      return `my/${view.noun}s`;
  }
}

/**
 * Per-noun copy for the three My sub-items. Plural, because each names a LIST.
 *
 * 🔴 THE ORDER IS AN OPERATOR DECISION, NOT AN ARBITRARY LIST, AND IT HAS MOVED
 * ONCE. It shipped as Grids / Matchups / Prompts; the operator reversed it to
 * Prompts / Matchups / Grids — the order in which a viewer BUILDS the things
 * (a prompt and a matchup exist before a grid can be assembled out of them).
 * The board items above the group keep the board order Grids / Matchups /
 * Prompts; only the My group reads in build order.
 */
const MY_ITEMS = [
  ['nav-my-prompt', 'prompt', 'Prompts'],
  ['nav-my-matchup', 'matchup', 'Matchups'],
  ['nav-my-grid', 'grid', 'Grids'],
] as const satisfies ReadonlyArray<readonly [string, MyNoun, string]>;

const BOARD_ITEMS = [
  ['nav-grids', 'grids', 'Grids'],
  ['nav-matchups', 'matchups', 'Matchups'],
  ['nav-prompts', 'prompts', 'Prompts'],
] as const satisfies ReadonlyArray<readonly [string, Board, string]>;

/**
 * The nav's item ledger, exported so a test asserts the SET rather than a
 * count — the same discipline `CONTRIBUTE_ITEMS` used for the menu this
 * lineage replaced. `route: null` is the group: it has no `href` and no
 * destination of its own.
 */
export const SIDE_NAV_ITEMS = [
  { testid: 'nav-home', label: 'Home', route: '/' as string | null },
  ...BOARD_ITEMS.map(([testid, board, label]) => ({
    testid,
    label,
    route: board as string | null,
  })),
  { testid: 'nav-my', label: 'My Benchmarks', route: null as string | null },
  ...MY_ITEMS.map(([testid, noun, label]) => ({
    testid,
    label,
    route: `my/${noun}s` as string | null,
  })),
] as const;

export interface SideNavProps {
  view: MainView;
  open: boolean;
  onClose: () => void;
  onSelect: (next: MainView) => void;
}

export function SideNav({ view, open, onClose, onSelect }: SideNavProps): React.JSX.Element {
  // Escape closes the drawer — the keyboard way out of a slide-over.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  /** A link item's press: route strings are not URLs, so the anchor's own
   * navigation is always prevented; selecting a page closes the drawer. */
  const go =
    (next: MainView) =>
    (e: React.MouseEvent): void => {
      e.preventDefault();
      onSelect(next);
      onClose();
    };

  const current = viewRoute(view);

  return (
    <>
      {open && (
        <div
          data-testid="nav-scrim"
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.55)',
            zIndex: 940,
          }}
        />
      )}
      <aside
        id="mb-sidebar"
        data-testid="sidebar"
        data-open={open ? 'true' : 'false'}
        aria-hidden={!open}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          height: '100dvh',
          width: 264,
          maxWidth: '85vw',
          zIndex: 950,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          padding: 16,
          boxSizing: 'border-box',
          background: token.surface,
          borderRight: `1px solid ${token.border}`,
          boxShadow: open ? '0 0 44px rgba(0, 0, 0, 0.4)' : 'none',
          transform: open ? 'translateX(0)' : 'translateX(-102%)',
          transition: 'transform 240ms ease',
        }}
      >
        <Group justify="space-between" align="center" wrap={false}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Model Benchmarking</span>
          <Button
            size="sm"
            variant="subtle"
            data-testid="nav-close"
            aria-label="Close menu"
            onClick={onClose}
          >
            ✕
          </Button>
        </Group>
        <nav aria-label="Model Benchmarking sections" data-testid="side-nav">
          <civitai-nav-list label="Model Benchmarking sections" current={current}>
            <civitai-nav-item
              data-testid="nav-home"
              href="/"
              label="Home"
              current={current === '/'}
              onClick={go({ kind: 'home' })}
            >
              <span slot="label">Home</span>
            </civitai-nav-item>
            {BOARD_ITEMS.map(([testid, board, label]) => (
              <civitai-nav-item
                key={testid}
                data-testid={testid}
                href={board}
                label={label}
                current={current === board}
                onClick={go({ kind: 'board', board })}
              >
                <span slot="label">{label}</span>
              </civitai-nav-item>
            ))}
            {/* 🔴 THE GROUP HAS NO `href` AND NO `onClick` — that absence is the
                mechanism. Href-less, the element renders its own disclosure
                button and toggles itself; the LIST opens it automatically
                whenever `current` names one of its children. Wiring a select
                here would make one press do two things. */}
            <civitai-nav-item data-testid="nav-my" label="My Benchmarks">
              <span slot="label">My Benchmarks</span>
              {MY_ITEMS.map(([testid, noun, label]) => (
                <civitai-nav-item
                  key={testid}
                  data-testid={testid}
                  href={`my/${noun}s`}
                  label={label}
                  current={current === `my/${noun}s`}
                  onClick={go({ kind: 'my', noun })}
                >
                  <span slot="label">{label}</span>
                </civitai-nav-item>
              ))}
            </civitai-nav-item>
          </civitai-nav-list>
        </nav>
      </aside>
    </>
  );
}
