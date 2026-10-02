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
// ── 🔵 THE GATE ON THE SWAP (the "five-package bump") ───────────────────────
//
// 🔴 THIS IS THE PARAGRAPH SIX POINTERS IN FOUR OTHER FILES AIM AT, by the name "the
// five-package bump" — `compact.ts` (1), `mobile-responsive.test.tsx` (1),
// `sideNav.test.tsx` (2, one of them a re-add instruction for a deleted case) and
// `Menu.tsx` (2). ⚠️ Counted, because a draft of this line said "FIVE OTHER FILES",
// then listed four, then said "six pointers" — three figures, one right. An undercount
// is precisely how a pointer gets left behind, which is the hazard this paragraph
// exists to close. The NAME is kept even though it is now inaccurate: retiring it here
// while those six stand is the rot. Read it as an alias.
//
// ⚠️ WHAT IT ACTUALLY IS NOW — four of the five moved with `blocks-react@0.61.0`
// (`app-sdk`, `blocks-react`, `sdk`, `theme`), so the gate is a ONE-package bump:
// `@civitai/components-react`, which this repo holds at `^0.4.1` (installed `0.4.3`)
// and which ships no nav element at that major. Its own stated prerequisite, starters
// **PR #487** (`loading`/`decoding` passthrough on `CivitaiImage`), HAS LANDED —
// `CivitaiImage` in `components@0.9.0` declares both — so that half of the old gate is
// clear. What remains is the `Image`/`Tooltip`/`injectStyles` migration that rides with
// the bump; its cost is measured in the PR that holds the bump back, not here.
//
// So nothing in this file can yet be verified against the real thing from this repo.
// ⚠️ `@civitai/components@0.9.0` IS already in the install graph, transitively via
// `blocks-react@0.61.0` — that does NOT make the nav elements usable, because this app
// imports nothing from it. It is noted because the 0.4.x copy is also present, and the
// two cannot collide on a `civitai-*` tag name only because 0.4.x defines zero custom
// elements (measured at 0.4.3: 0 of its 2 JS files mention `customElements`).
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
//     name and the same step, so the DECLARATION survives the swap untouched.
//     🔴 BUT IT IS INERT ON THIS TREE AND THE SENTENCE USED TO IMPLY OTHERWISE. It
//     read "so the INDENT survives the swap untouched", which reads as "the custom
//     property is what indents a row". It is not: NOTHING in this tree consumes
//     `--civitai-nav-depth` (verified by `git grep` across `src`), and `padding-left`
//     is the only thing that moves a row here — which is exactly how the indent came
//     to be dead at every level while looking correct in the source. `itemStyle`'s
//     comment carries that measurement. Same defect class as `Menu.tsx`'s upstream
//     block: a second-hand upstream mechanism written up as if it were live here.
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

import type { MyNoun } from '../types.js';
import { navIndentVar } from '../compact.js';
import { rovingTarget } from '../lib/roving.js';
import { radius, token } from '../theme.js';

/**
 * Which of the viewer's own object kinds a My Benchmarks sub-item names.
 *
 * 🔴 RE-EXPORTED, NOT RE-DECLARED. The union lived here AND in `MyPublished.tsx` AND in
 * `MySignedOut.tsx`, three identical copies with nothing keeping them in step. It is
 * declared once in `../types.js` now; this re-export keeps the name reachable from the
 * nav module, which is where `MainView` needs it.
 */
export type { MyNoun };

/**
 * The selected view.
 *
 * 🔴 A DISCRIMINATED UNION, NOT A STRING. `'my-grid'` would make "is this a My view"
 * a prefix test — and a prefix test is the kind of predicate that gets open-coded at
 * three call sites and disagrees at two of them. `view.kind === 'my'` cannot.
 */
export type MainView = { kind: 'home' } | { kind: 'my'; noun: MyNoun };

/**
 * Per-noun copy for the three sub-items. Plural, because each names a LIST.
 *
 * 🔴 THE ORDER IS AN OPERATOR DECISION, NOT AN ARBITRARY LIST, AND IT HAS MOVED ONCE.
 * It shipped as Grids / Matchups / Prompts — grid-first, because Grids is the default
 * HOME board. The operator reversed it to Prompts / Matchups / Grids: that is the order
 * in which a viewer BUILDS the things (a prompt and a matchup exist before a grid can
 * be assembled out of them), so the rail now reads in the direction of the workflow
 * rather than in the direction of the community board's subnav.
 *
 * 🔴 THIS ARRAY IS THE ONLY SITE. `SIDE_NAV_ITEMS` derives from it, the rendered rows
 * map over it, and the roving arrow keys read DOM order — so all three follow a change
 * here. `sideNav.test.tsx` holds a LITERAL table that is deliberately NOT derived from
 * this one, which is what makes a reorder a decision someone takes rather than a drift.
 */
const MY_ITEMS = [
  ['nav-my-prompt', 'prompt', 'Prompts'],
  ['nav-my-matchup', 'matchup', 'Matchups'],
  ['nav-my-grid', 'grid', 'Grids'],
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

/** The row's own left inset at depth 0, in px, before any nesting indent. */
export const NAV_BASE_INSET_PX = 10;

/**
 * The declared `padding-left` for a row at `depth` — as a CUSTOM PROPERTY REFERENCE
 * whose fallback is today's literal.
 *
 * 🔴 THE INDIRECTION IS A CASCADE LEVER, NOT STYLE. An inline `style` declaration
 * outranks every author rule that is not `!important`, so `compact.ts` — which owns
 * the ≤720px layout — has NO way to change a value this component writes inline.
 * That is the exact mechanic `LAYOUT_ATTR` exists for one file over. A custom
 * property inverts it: the sheet sets `--mb-nav-indent-1` on the compact root, the
 * inline declaration READS it, and the narrow layout wins with no `!important`
 * anywhere.
 *
 * 🔴 AND IT HAS A JOB TO DO THERE. On the compact top bar the rows are laid out in a
 * ROW, where `padding-left` is not an indent at all — it is just a gap before the
 * label, conveying no nesting whatever while costing 14px of a strip that already
 * overflows. `compact.ts` zeroes it back to the base inset and draws the nesting as
 * a BRACKET instead.
 *
 * The fallback is what renders when nothing sets the property — i.e. the wide rail,
 * unchanged. The property NAME comes from `compact.ts` (the sheet that sets it owns
 * it, the same way it owns `MENU_ITEM_SELECTOR`); `sideNav.test.tsx` and
 * `mobile-responsive.test.tsx` pin both ends as LITERALS, so a rename is red even
 * though production spells it once.
 */
function navPaddingLeft(depth: number): string {
  return `var(${navIndentVar(depth)}, ${NAV_BASE_INSET_PX + depth * NAV_DEPTH_STEP_PX}px)`;
}

/**
 * The ACTIVE row treatment, copied from the pack's active SEGMENT.
 *
 * 🔴 IT IS A CONSISTENCY FIX, NOT A DESIGN DECISION, and the bug it closes is that
 * there WAS no treatment. The active row read `background: active ? token.surface :
 * 'transparent'` over `border: 1px solid transparent` — and `--civitai-color-surface`
 * resolves to the SAME value as `--civitai-color-body` in the dark theme (measured
 * live: rgb(26,27,30) on rgb(26,27,30)), so the one thing marking the current row was
 * a 600 font-weight. Nothing at all distinguished it in either theme at a glance.
 *
 * 🔴 THE APP ALREADY HAD A WORKING ANSWER: `BoardNav`'s `SegmentedControl`, whose
 * active segment is unmistakable. Its rule, in the pack's own sheet
 * (`@civitai/blocks-react/ui`'s `BLOCKS_UI_STYLES`), is
 *
 *     [data-civitai-ui='segmented-control'] [data-civitai-ui-segment][data-active] {
 *       background: var(--civitai-color-surface);
 *       color: var(--civitai-color-primary);
 *       box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
 *     }
 *
 * — and the half that carries it is `color: primary` plus the shadow, NOT the fill.
 * (The fill only reads there because the pack's segment sits on a `surface-2` TRACK
 * with a border; a nav row sits on the page body, which is why the same fill alone
 * does nothing here. That is the same surface-2/body collision `theme.ts` documents
 * from the other side.) So the three declarations are mirrored, and the transparent
 * border is given the border TOKEN when active, which is this nav's stand-in for the
 * track the segments have.
 *
 * `sideNav.test.tsx` asserts these against the PACK'S OWN STYLESHEET rather than
 * against this object, so a pack restyle that moves the active segment on and leaves
 * the nav behind is a red test rather than a slow divergence.
 */
export const NAV_ACTIVE_SHADOW = '0 1px 2px rgba(0, 0, 0, 0.12)';

/** Marks a nav item's clickable element — what `compact.ts` floors at 44px. */
export const NAV_ITEM_ATTR = 'data-mb-nav-item';

export interface SideNavProps {
  view: MainView;
  onSelect: (next: MainView) => void;
}

/** One row of the nav. `depth` is expressed the way upstream expresses it. */
function itemStyle(depth: number, active: boolean): React.CSSProperties {
  return {
    // 🔴 NO `padding` SHORTHAND IN THIS OBJECT, AND THAT IS THE WHOLE POINT.
    // It read `paddingLeft: calc(…)` followed LATER by `padding: '6px 10px'`, and
    // React serialises a style object in INSERTION ORDER — so the shorthand reset
    // `padding-left` to 10px and the depth indent was DEAD at every level.
    // Measured with `renderToStaticMarkup`, the emitted declaration was
    //   `padding-left:calc(10px + 14px);…;padding:6px 10px;padding-right:10px`
    // and the effective `padding-left` came out **10px for depth 0, 1 AND 2**
    // where 10/24/38px was intended. Every row rendered at the same inset, so the
    // sidebar — this page's only primary navigation — had no visual hierarchy,
    // in the wide rail and in the <=720px top bar alike.
    //
    // 🔴 THE CUSTOM PROPERTY IS WHY NOBODY NOTICED, and it did not save it:
    // NOTHING in this tree consumes `--civitai-nav-depth`. It is upstream's name
    // and step, set so the eventual `<civitai-nav-item>` swap inherits the same
    // indent — but on THIS tree `padding-left` is the only thing that moves a row.
    // Setting the property LOOKED like the mechanism while being inert decoration.
    //
    // So the four sides are spelled out individually. Reintroducing `padding:`
    // here silently re-breaks the indent; `sideNav.test.tsx`'s depth case is what
    // catches that, and it asserts the DECLARED value (readable in jsdom) rather
    // than a computed layout (which jsdom cannot give).
    //
    // ⚠️ TWO CUSTOM PROPERTIES LIVE ON THIS ELEMENT AND THEY ARE NOT THE SAME THING.
    // `--civitai-nav-depth` (below) is upstream's name, still WRITE-ONLY and still
    // inert on this tree — it is set so the eventual `<civitai-nav-item>` swap
    // inherits it. `--mb-nav-indent-<depth>` (see {@link navIndentVar}) is this
    // app's own, and it IS consumed: `padding-left` reads it, which is what gives
    // `compact.ts` a lever over a value written inline.
    ['--civitai-nav-depth' as string]: String(depth),
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
    paddingTop: 6,
    paddingBottom: 6,
    paddingRight: NAV_BASE_INSET_PX,
    paddingLeft: navPaddingLeft(depth),
    borderRadius: radius.sm,
    // 🔴 THREE LONGHANDS, NOT THE `border` SHORTHAND — the same insertion-order
    // hazard the padding block above is about. A later `borderColor` would work
    // today, but a shorthand written after it silently resets the colour, and this
    // component has already shipped that exact bug once on `padding`.
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: active ? token.border : 'transparent',
    // The active treatment, mirrored from the pack's active segment. See
    // {@link NAV_ACTIVE_SHADOW} for what each of these is doing and why the fill
    // alone was not enough.
    background: active ? token.surface : 'transparent',
    color: active ? token.primary : token.dimmed,
    boxShadow: active ? NAV_ACTIVE_SHADOW : 'none',
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
   *
   * 🔴 AND IT STARTS OPEN, UNCONDITIONALLY. It was `useState(onMyView)` — open only
   * if the viewer was already on a My view, i.e. SHUT on Home, which is where every
   * session starts (`SideNav` persists nothing; a reload opens on Home). So the
   * three destinations the sidebar exists to expose were behind a disclosure on
   * first paint, every time, and the nav's whole second half read as one row.
   *
   * 🔴 THE `true` AND THE EFFECT'S ONE-WAY RULE ARE A PAIR — changing the initial
   * value must not turn the effect into a re-opener. It does not: the effect fires
   * only when `onMyView` is true, so a viewer who collapses the group ON HOME sees
   * `onMyView` stay false and STAYS collapsed, for as long as they stay on Home.
   * Navigating to a My view re-opens it, which is the same behaviour as before and
   * is required — the active leaf has to be in the tree to be marked current. If
   * you ever make the effect run on every view change, this becomes a group that
   * springs back open under the viewer's hand; `sideNav.test.tsx` has the case.
   */
  const [expanded, setExpanded] = useState(true);
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
    // 🔴 SHARED WITH `Menu`'s panel through `lib/roving.ts` — the two were open-coded
    // copies of the same expression and wrong in the same way (ArrowUp from outside
    // the set landed second-to-last, because `indexOf` is -1 there).
    const i = items.indexOf(document.activeElement as HTMLElement);
    const step = e.key === 'ArrowDown' ? 1 : -1;
    items[rovingTarget(items.length, i, step)]!.focus();
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
