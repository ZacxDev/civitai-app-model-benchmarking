// The page's PRIMARY navigation — Home, and an expandable "My Benchmarks" group
// over the viewer's own grids / matchups / prompts. It replaced the `ContributeMenu`
// dropdown, which replaced the top-level tab strip.
//
// ── 🔴 THIS IS A LOCAL COMPONENT, AND THE SWAP IT IS SHAPED FOR ─────────────
//
// The upstream elements ARE `<civitai-nav-list>` and `<civitai-nav-item>`, shipped
// in `@civitai/components@0.8.1` + `@civitai/components-react@0.9.0`. This file is a
// LOCAL mirror of their contract, written so that swapping to them is mechanical
// rather than a redesign.
//
// 🔴 THEY ARE JSDOM-SAFE. Unlike `<civitai-menu>` — whose mount-time
// `:popover-open` evaluation throws in jsdom and, measured at jsdom 30.1.1, merely
// moves the failure to `panel.showPopover is not a function` — the nav elements use
// no popover API at all. So `civitai-app-starters` **issue #485 does NOT block
// them**, and the reason this repo could not adopt the upstream MENU does not carry
// over to the upstream NAV.
//
// 🔵 THE SWAP IS GATED ONLY ON THE FIVE-PACKAGE BUMP, whose own prerequisite is
// starters **PR #487** (`loading`/`decoding` passthrough on `CivitaiImage`) — still
// OPEN at the time of writing. The installed versions here are
// `@civitai/components@0.4.1` / `components-react@0.4.1`, which ship no nav element,
// so nothing in this file could be verified against the real thing from this repo.
//
// ⚠️ PROVENANCE, STATED PLAINLY: the upstream shape described below was MEASURED BY
// THE OPERATOR against the real 0.8.1 / 0.9.0 elements, not by this repo. It is
// second-hand here and must be re-measured at swap time rather than trusted from
// this comment. What was measured, and mirrored below:
//   - a `<nav>` wrapper carrying an `aria-label`;
//   - a `role="list"` container;
//   - an item's expandable state shown as a CHEVRON;
//   - nesting expressed as a DEPTH VALUE — upstream's custom property is
//     `--civitai-nav-depth`, at 14px per level. This file sets the same property
//     name and the same step, so the indent survives the swap untouched.
//   - `aria-current` on the active item.
//
// 🔴 TWO KNOWN SNAGS, both of which cost work at swap time and neither of which is a
// blocker:
//
//   1. UPSTREAM PUTS THE CLICKABLE ELEMENT AT `part="link"` / `part="button"`
//      INSIDE ITS SHADOW ROOT. Every query in `sideNav.test.tsx` addresses a
//      light-DOM `<button data-testid=…>`; after the swap those tests have to pierce
//      `shadowRoot`, or upstream has to give the inner control an app-settable
//      testid. This is the same ADDRESSABILITY gap that blocks the menu (issue
//      #485), showing up again in a place where it is merely expensive rather than
//      fatal — the nav's items ARE slotted into light DOM, so a consumer wrapper can
//      still carry the testid even if the clickable cannot.
//
//   2. UPSTREAM'S `padding: 6px 10px` IS ~32px TALL — BELOW THIS REPO'S TESTED 44px
//      TAP FLOOR. It therefore needs a `compact.ts` override exactly like the one
//      already written for `role="menuitem"`. 🔴 AND THE SELECTOR CANNOT BE CARRIED
//      OVER AS-IS: `compact.ts` reaches these items through `[data-mb-nav-item]`, an
//      attribute THIS FILE puts on its own buttons, and an upstream
//      `<civitai-nav-item>` will not carry it. At swap time either wrap each element
//      in a node carrying the attribute, re-point the rule at whatever state the
//      upstream element exposes, or style `::part(button)` — and MEASURE the computed
//      `min-height` afterwards, because "the rule is still in the sheet" is not the
//      same claim as "the rule still matches". `compact.ts`'s own header records
//      three rounds where that distinction cost a regression.
//
// The discipline here is `ContributeMenu.tsx`'s: say what was measured, say who
// measured it, name the blocker, and retract rather than reword.
//
// ── WHAT THIS COMPONENT OWNS ────────────────────────────────────────────────
//
// 🔴 IT HOLDS NO VIEW STATE. The selected view lives in `App` — which is what makes
// the grid's in-flight runs survive a trip to My Benchmarks and back (see the
// view-switch cases in `money-path.test.tsx`). The only state here is whether the
// group is EXPANDED, which is presentation and nothing else: collapsing the group
// never changes the view.
//
// 🔴 AND THE SELECTION IS NOT PERSISTED ANYWHERE. No KV write, no URL, no
// deep-linking — an operator decision (YAGNI). A reload opens on Home.

import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { radius, token } from '../theme.js';

/** Which of the viewer's own object kinds a My Benchmarks sub-item names. */
export type MyNoun = 'grid' | 'matchup' | 'prompt';

/**
 * The selected view.
 *
 * 🔴 A DISCRIMINATED UNION, NOT A STRING. `'my-grid'` would make "is this a My view"
 * a prefix test — and a prefix test is the kind of predicate that gets open-coded at
 * three call sites and disagrees at two of them. `view.kind === 'my'` cannot.
 */
export type MainView = { kind: 'home' } | { kind: 'my'; noun: MyNoun };

/** Per-noun copy for the three sub-items. Plural, because each names a LIST. */
const MY_ITEMS = [
  ['nav-my-grid', 'grid', 'Grids'],
  ['nav-my-matchup', 'matchup', 'Matchups'],
  ['nav-my-prompt', 'prompt', 'Prompts'],
] as const satisfies ReadonlyArray<readonly [string, MyNoun, string]>;

/**
 * The nav's item ledger, exported so a test asserts the SET rather than a count —
 * the same discipline `CONTRIBUTE_ITEMS` used for the menu this replaced.
 */
export const SIDE_NAV_ITEMS = [
  { testid: 'nav-home', label: 'Home', depth: 0 },
  { testid: 'nav-my', label: 'My Benchmarks', depth: 0 },
  ...MY_ITEMS.map(([testid, , label]) => ({ testid, label, depth: 1 })),
] as const;

/** Upstream's indent step, in px per nesting level. Mirrored, not invented. */
export const NAV_DEPTH_STEP_PX = 14;

/** Marks a nav item's clickable element — what `compact.ts` floors at 44px. */
export const NAV_ITEM_ATTR = 'data-mb-nav-item';

export interface SideNavProps {
  view: MainView;
  onSelect: (next: MainView) => void;
}

/** One row of the nav. `depth` is expressed the way upstream expresses it. */
function itemStyle(depth: number, active: boolean): React.CSSProperties {
  return {
    // 🔴 THE CUSTOM PROPERTY IS UPSTREAM'S NAME AND STEP, so the indent is
    // byte-identical after the swap and the `padding-left` below can simply go.
    ['--civitai-nav-depth' as string]: String(depth),
    paddingLeft: `calc(10px + ${depth * NAV_DEPTH_STEP_PX}px)`,
    appearance: 'none',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    textAlign: 'left',
    font: 'inherit',
    fontSize: 13,
    fontWeight: active ? 600 : 400,
    cursor: 'pointer',
    padding: '6px 10px',
    paddingRight: 10,
    borderRadius: radius.sm,
    border: '1px solid transparent',
    background: active ? token.surface : 'transparent',
    color: active ? token.text : token.dimmed,
  };
}

export function SideNav({ view, onSelect }: SideNavProps): React.JSX.Element {
  const onMyView = view.kind === 'my';
  /**
   * Whether the group is open.
   *
   * 🔴 IT FOLLOWS THE VIEW *UP* BUT NOT *DOWN*. Selecting a My sub-item obviously
   * needs the group open; collapsing it must NOT navigate away, because a
   * disclosure control that also changes what you are looking at is two actions on
   * one press. So the effect below only ever opens it.
   */
  const [expanded, setExpanded] = useState(onMyView);
  useEffect(() => {
    if (onMyView) setExpanded(true);
  }, [onMyView]);

  const navRef = useRef<HTMLElement>(null);
  const myTriggerRef = useRef<HTMLButtonElement>(null);
  const groupId = useId();

  /**
   * Collapse and hand focus back to the trigger.
   *
   * 🔴 THE FOCUS RETURN IS THE PART THAT IS EASY TO DROP, and `ContributeMenu`'s
   * `close(refocus)` is where this repo learned it: the focused sub-item is about to
   * be unmounted, so without an explicit restore the ring lands on `<body>` and a
   * keyboard viewer is dumped at the top of the document with the group they just
   * used no longer reachable by Tab from where they are.
   */
  const collapse = useCallback(() => {
    setExpanded(false);
    myTriggerRef.current?.focus();
  }, []);

  /** Roving arrow keys over the items that are actually rendered, in DOM order. */
  const onKeyDown = (e: React.KeyboardEvent<HTMLElement>): void => {
    if (e.key === 'Escape') {
      // Only meaningful while the group is open; otherwise leave Escape to whatever
      // else on the page may want it (a modal, the host).
      if (!expanded) return;
      e.stopPropagation();
      collapse();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = Array.from(
      navRef.current?.querySelectorAll<HTMLElement>(`[${NAV_ITEM_ATTR}]`) ?? [],
    );
    if (items.length === 0) return;
    e.preventDefault();
    const i = items.indexOf(document.activeElement as HTMLElement);
    const step = e.key === 'ArrowDown' ? 1 : -1;
    items[(i + step + items.length) % items.length]!.focus();
  };

  /**
   * `aria-current` placement.
   *
   * 🔴 IT MOVES TO THE TRIGGER WHEN THE GROUP IS COLLAPSED, because the active leaf
   * is then not in the accessibility tree at all and a nav with no current item
   * tells a screen reader user nothing about where they are. ARIA allows the nearest
   * rendered ancestor to carry it.
   */
  const leafCurrent = (noun: MyNoun): 'page' | undefined =>
    view.kind === 'my' && view.noun === noun ? 'page' : undefined;
  const triggerCurrent = onMyView && !expanded ? 'page' : undefined;

  return (
    <nav
      ref={navRef}
      aria-label="Model Benchmarking sections"
      data-testid="side-nav"
      onKeyDown={onKeyDown}
      style={{ display: 'grid', gap: 2, alignContent: 'start', minWidth: 0 }}
    >
      <div role="list" data-testid="side-nav-list" style={{ display: 'grid', gap: 2 }}>
        <div role="listitem">
          <button
            type="button"
            {...{ [NAV_ITEM_ATTR]: 'true' }}
            data-testid="nav-home"
            aria-current={view.kind === 'home' ? 'page' : undefined}
            onClick={() => onSelect({ kind: 'home' })}
            style={itemStyle(0, view.kind === 'home')}
          >
            Home
          </button>
        </div>

        <div role="listitem">
          <button
            ref={myTriggerRef}
            type="button"
            {...{ [NAV_ITEM_ATTR]: 'true' }}
            data-testid="nav-my"
            aria-expanded={expanded}
            aria-controls={expanded ? groupId : undefined}
            aria-current={triggerCurrent}
            onClick={() => (expanded ? collapse() : setExpanded(true))}
            style={itemStyle(0, onMyView)}
          >
            {/* 🔴 THE CHEVRON IS THE EXPANDABLE STATE, which is how upstream shows
                it. `aria-hidden` because `aria-expanded` above is what carries the
                state to a screen reader — announcing "▾" as text would be noise. */}
            <span aria-hidden="true" data-testid="nav-my-chevron" style={{ fontSize: 11 }}>
              {expanded ? '▾' : '▸'}
            </span>
            My Benchmarks
          </button>
        </div>

        {expanded && (
          <div role="list" id={groupId} data-testid="nav-my-group" style={{ display: 'grid', gap: 2 }}>
            {MY_ITEMS.map(([testid, noun, label]) => (
              <div role="listitem" key={testid}>
                <button
                  type="button"
                  {...{ [NAV_ITEM_ATTR]: 'true' }}
                  data-testid={testid}
                  aria-current={leafCurrent(noun)}
                  onClick={() => onSelect({ kind: 'my', noun })}
                  style={itemStyle(1, leafCurrent(noun) === 'page')}
                >
                  {label}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </nav>
  );
}
