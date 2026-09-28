// The narrow-viewport ("compact") layout contract, in one place.
//
// Everything here is driven by `useIsMobile()` (src/useMediaQuery.ts) — the hook
// that used to have ZERO consumers. App.tsx stamps {@link COMPACT_ATTR} on the
// block root when the hook reports a narrow viewport and renders
// {@link compactTapTargetCss} alongside it, so the hook is now load-bearing:
// delete the call and the compact layout disappears.
//
// Why a stylesheet rather than inline styles: the controls whose hit area is too
// small are rendered by `@civitai/blocks-react/ui` — a `<Button size="sm">` is
// `height: 30px` and a `<SegmentedControl>` segment is `height: 30px`, both set
// by the pack's injected CSS on elements this app never gets a handle on (the
// segments are the SegmentedControl's own children). A rule scoped under the
// block root is the only way to reach them without forking the pack.
//
// `min-height` is deliberate: CSS resolves a box's used height as
// `max(min-height, height)`, so a `min-height` declaration beats the pack's
// `height: 30px` without having to out-specify or !important it.

/** Marks the block root when the compact (narrow-viewport) layout is active. */
export const COMPACT_ATTR = 'data-mb-compact';

/**
 * Marks the sidebar-plus-content grid, so the layout lives in a STYLESHEET rather
 * than in an inline style.
 *
 * 🔴 IT HAS TO BE A STYLESHEET, and the reason is cascade mechanics rather than
 * taste: an inline `style` declaration outranks every author rule that is not
 * `!important`, so a `grid-template-columns` set inline on this element could not be
 * overridden by the compact block below. Putting BOTH the wide and the narrow
 * declaration in one sheet is what lets the narrow one win by being more specific,
 * with no `!important` anywhere — the same discipline `min-height` uses against the
 * pack's `height: 30px`.
 */
export const LAYOUT_ATTR = 'data-mb-layout';

/**
 * The viewport width, in px, at or below which the compact layout applies.
 *
 * 🔴 IMPORTED BY `useMediaQuery.ts`, NOT COPIED INTO IT. The hook's media query and
 * this sheet's comment are the same number, and a number stated twice is a number
 * that drifts — this repo already keeps the node major in exactly one place
 * (`.nvmrc`) for the same reason, with a lockstep test to prove it.
 */
export const MOBILE_BREAKPOINT_PX = 720;

/**
 * The selector that reaches a `SideNav` item's clickable element.
 *
 * Exported so the rule, the component and the reachability test all name it once.
 * `SideNav.NAV_ITEM_ATTR` is the attribute; this is the bracketed form.
 */
export const NAV_ITEM_SELECTOR = '[data-mb-nav-item]';

/**
 * The selector that reaches a {@link MenuItem}'s clickable element.
 *
 * 🔴 RE-ADDED, AND THE PREVIOUS COMMENT INVITED IT. The sidebar change deleted
 * `ContributeMenu` — the only thing in this app or the pack that emitted
 * `role="menuitem"` — and removed this selector from the rule, saying "if a menu
 * ever comes back, so does the selector". One did: `components/Menu.tsx`, the ⋮
 * overflow menu on every matchup and prompt row. Its items carry
 * `padding: 8px 10px` around a 13px line — ~34px, under the floor, the same
 * arithmetic the departed menu had.
 *
 * 🔴 DEFINED HERE AND IMPORTED BY `Menu.tsx`, not the other way round. This module
 * is deliberately React-free (`useMediaQuery.ts` imports it, and a node-project
 * test could), so pulling a `.tsx` component into its graph to fetch one string
 * would be a real cost for no gain. The rule, the component's own focus queries and
 * the reachability test all name it once, from here.
 *
 * It is the ROLE, not a testid: it pins a STATE (this element is an item in a menu)
 * rather than a word a future component could spell differently — which is also what
 * makes it survive the upstream `<civitai-menu-item>` swap, since that element sets
 * the same role on its own light-DOM host.
 *
 * ⚠️ THE QUOTING IS DELIBERATE: single quotes inside, matching `[role='option']` in
 * the same sheet. The guard this replaces asserted `not.toContain("[role='menuitem']")`
 * — a check on a SPELLING, which a double-quoted `[role="menuitem"]` would have
 * walked straight past while the selector was back in the rule. Keeping one spelling
 * is what makes that guard's replacement meaningful.
 */
export const MENU_ITEM_SELECTOR = "[role='menuitem']";

/** The sidebar's column width, in px, on a wide viewport. */
export const SIDEBAR_WIDTH_PX = 172;

/**
 * Minimum short-axis size for a tap target, in px. 44 is the WCAG 2.5.5
 * (Target Size, Level AAA) / iOS HIG figure; the pack's `sm` controls ship 30.
 */
export const MIN_TAP_TARGET_PX = 44;

/**
 * Side gutter, in px, left between a compact tooltip bubble and the viewport
 * edge. The bubble is pinned to BOTH edges, so this is the whole horizontal
 * inset and it is what makes the geometry viewport-bounded by construction
 * rather than by luck.
 */
export const TOOLTIP_GUTTER_PX = 8;

/**
 * Vertical gap between a compact tooltip bubble's bottom and its trigger's top.
 * 6 is the pack's own figure (`bottom: calc(100% + 6px)`); repeating it here
 * keeps the bubble sitting exactly where it did, which is what "the bubble
 * stays in its trigger's row" means once the horizontal box is re-anchored.
 */
export const TOOLTIP_GAP_PX = 6;

/**
 * The compact-layout stylesheet, scoped to a root carrying {@link COMPACT_ATTR}.
 *
 * Selector notes — both halves are load-bearing and both are pinned by
 * `mobile-responsive.test.tsx` against the LIVE DOM (the test asserts each
 * selector actually matches the rendered controls, so a pack rename that
 * silently orphans a rule fails the suite rather than shipping 30px buttons):
 *   - `[data-civitai-ui='button']`   → every pack Button (vote, run-cell,
 *     confirm/cancel, withdraw, the modal form actions).
 *   - `[data-civitai-ui-segment]`    → the `SegmentedControl` segments. Which
 *     controls those ARE has now moved twice: the top-level `view-switch` strip's
 *     three tabs, then the My/Community sub-tabs on the matchup and prompt sections
 *     (four), and now the BOARD subnav's three (`BoardNav`) — the sub-tab strips are
 *     deleted and "My" is a sidebar destination. The RULE never changed; the
 *     reachability ledger in `mobile-responsive.test.tsx` carries the count as a
 *     LITERAL so each move is a decision someone takes rather than a drift.
 *   - `[data-civitai-ui-range]`      → the LoRA weight `Slider` in `MatchupForm`.
 *   - `[role='option']`              → `GridPicker`'s option rows (527, §11.2).
 *   - `[role='menuitem']`            → `components/Menu.tsx`'s items (Edit, and any
 *     future single-press row action). See {@link MENU_ITEM_SELECTOR}.
 *   - `[data-mb-nav-item]`           → `SideNav`'s items (Home, My Benchmarks, and
 *     the three sub-items). See {@link NAV_ITEM_SELECTOR}.
 *
 * ⚠️ `[role='menuitem']` LEFT THIS RULE AND HAS COME BACK, and both moves were
 * correct at the time. It left because `ContributeMenu` — then the only emitter of
 * that role in this app or the pack — was deleted by the sidebar change, and the
 * removal was enumerated rather than assumed (`grep` for the role returned nothing,
 * and the pack emits none either). It is back because the third IA pass added
 * `components/Menu.tsx`, the ⋮ overflow menu on every matchup and prompt row, whose
 * items carry the same `padding: 8px 10px` around a 13px line — ~34px.
 *
 * 🔴 WHAT THE RULE DOES *NOT* HAVE TO COVER, and the reason it does not: a menu's
 * two CONFIRM-FLOW controls (Remove, Report) are pack `Button`s hosted inside the
 * panel, not menuitems — a two-step handshake is not expressible as one menuitem,
 * and the pack's `ReportButton` exposes no role hook. They are already floored by
 * the `[data-civitai-ui='button']` selector at the top of this list. Enumerate the
 * panel's controls before concluding this rule covers all of them.
 *
 * 🔴 THE LAST TWO ARE THE TAP TARGETS THIS APP BUILDS ITSELF, and BOTH shipped
 * below the floor — the same defect twice, one surface apart:
 *
 *   - `GridPicker` is hand-built because the pack has no MultiSelect (see the
 *     header there), so its rows are plain `<div role="option">` carrying
 *     `padding: 10px 12px` around a 14px line — ~37px, and the primary hit target
 *     of the whole grid-builder flow on a phone.
 *   - `ContributeMenu` was hand-built because no `@civitai/*` package this repo
 *     imports ships a React menu, so its items were `<button role="menuitem">`
 *     carrying `padding: 8px 10px` around a 13px line — ~34px. MEASURED at the
 *     pre-change base: computed `min-height` on the three live items was **0**
 *     (`mobile-responsive.test.tsx`, red before that selector existed, green after).
 *     That component is now deleted; the entry is kept because the LESSON is the
 *     point and the next bullet is its third instance.
 *   - `SideNav` is hand-built for the same reason one level up — the upstream
 *     `<civitai-nav-list>` / `<civitai-nav-item>` are real but this repo is pinned to
 *     `@civitai/components@0.4.1`, which ships neither (see `SideNav.tsx` for the
 *     five-package bump that gates the swap). Its items are `<button>`s carrying
 *     `padding: 6px 10px` around a 13px line — ~31px, and this nav is the page's ONLY
 *     primary navigation. 🔴 AND THE SWAP WILL NOT FIX IT: upstream's own
 *     `padding: 6px 10px` is ~32px, also below the floor, so the floor stays this
 *     app's job either way.
 *     🔴 THE SELECTOR IS NOT A ROLE HERE, and that is the one exception in this list
 *     that has to be said out loud. `role="menuitem"` and `role="option"` pin a
 *     STATE the upstream replacements also set, so those selectors survive a swap. A
 *     nav item has no such role — it is a `<button>` inside a `role="list"` — so the
 *     rule targets `[data-mb-nav-item]`, an attribute THIS APP puts on its own
 *     buttons and which an upstream `<civitai-nav-item>` will NOT carry. That makes
 *     it the one selector in this sheet that the swap ORPHANS, silently, and the
 *     reachability case in `mobile-responsive.test.tsx` is what turns that into a
 *     failure instead of 31px nav items. Do not read `[data-mb-nav-item]` as
 *     swap-proof the way the two roles are.
 *
 * The three PACK-facing selectors above reach controls the pack renders, which is
 * exactly why both app-built ones were missed: the pack emits neither
 * `role="option"` nor `role="menuitem"` anywhere.
 *
 * 🔴 THE RECURRING LESSON, NOW THIRD-HAND: an app-built tap target slips this
 * list every time, because the list reads as "the pack's controls". AUDIT IT BY
 * ROLE — enumerate the interactive roles the app itself renders — rather than by
 * remembering which ones were added.
 *
 * Both selectors are the ROLE, not a `data-testid` — they pin the STATE (this
 * element is an option in a listbox / an item in a menu) rather than a word a
 * future component could spell differently, and each covers any second listbox or
 * menu this app grows without another selector.
 *
 * ⚠️ AND THE ROLE IS WHAT MAKES `[role='menuitem']` SURVIVE THE UPSTREAM MENU
 * MIGRATION, which is the reason to prefer it over a testid here specifically.
 * `@civitai/components@0.8.1` ships a `<civitai-menu-item>` custom element that a
 * later change may adopt in place of the local menu. MEASURED in
 * `node_modules/.pnpm/@civitai+components@0.8.1/.../elements/civitai-menu-item.js`:
 * its `connectedCallback()` runs `this.setAttribute('role', 'menuitem')` on its own
 * HOST, in LIGHT DOM — so this selector reaches it, and a document-level
 * `min-height` beats its shadow `:host` rule (outer-tree author styles win over
 * `:host` regardless of specificity).
 *
 * 🔴 AND IT IS NOT ALREADY ABOVE THE FLOOR, so adopting it would NOT retire this
 * selector. `:host` is `padding: 7px 14px; font-size: 14px; line-height: 1.4` —
 * 14 × 1.4 + 7 + 7 = **33.6px**, i.e. the upstream element is under 44 on its own,
 * marginally worse than the local menu's ~34. "The pack's own items are covered"
 * is FALSE; the floor stays this app's job either way. Recorded here because
 * assuming the opposite is precisely how the range selector was wrongly deleted in
 * round 3 above — "nothing needs this any more" is a measurement, not an inference.
 *
 * 🔴 THIS PARAGRAPH HAS BEEN WRONG THREE TIMES. Every correction came from
 * MEASURING the DOM or the cascade, never from reading it:
 *
 *   - `height: auto` reaches the BUTTONS **and the RANGE** (measured: range
 *     `height` 6px -> 16px with the pack sheet linked), NOT the segments. Round 1
 *     said "segments only" (backwards); round 2 said "buttons only" — also wrong,
 *     because the same commit had just added the range selector to this rule.
 *   - 🔴 **Round 3 DELETED `[data-civitai-ui-range]` from this rule** on the
 *     stated ground that "527 deleted the app's only `Slider`, so there is no
 *     range control left on any surface". **That was false.** 527 deleted the
 *     per-viewer "Show top N" slider, but `MatchupForm` still renders one
 *     `<Slider>` per LoRA (the weight control) and the pack's `Slider` still
 *     emits `data-civitai-ui-range` — verified in
 *     `node_modules/@civitai/blocks-react/dist/ui/Slider.js`. Dropping the
 *     selector silently returned every LoRA weight slider to the pack's 6px
 *     height on a phone, undoing part of the 44px tap-target work, and the
 *     reachability case that would have caught it was deleted in the same commit
 *     citing the same false premise. Both are restored.
 *     **The recurring lesson: enumerate the controls that still RENDER before
 *     retiring a selector — "nothing matches this any more" is a measurement,
 *     not an inference.**
 *   - The BUTTON override wins by **CASCADE LAYER**, not by order or specificity:
 *     the pack's button CSS lives in `@layer civitai.components` and this sheet is
 *     UNLAYERED, so an unlayered declaration beats any layered one and neither
 *     specificity nor source order is consulted. Proven by loading this sheet
 *     BEFORE the pack's: the button still resolves to THIS sheet's `height: auto`
 *     (15px — a 13px line box plus 2x1px border, `box-sizing: border-box`), which
 *     the "wins on order" story cannot explain, since on that story the pack's
 *     later 30px would have won. 🔴 This sentence previously credited the 15px to
 *     "the pack's height" — no pack rule produces 15px at any size (sm/md/lg are
 *     30/36/44), so as written it argued FOR the source-order model it exists to
 *     retire. Third correction to this paragraph; measure, do not reason.
 *   - The SEGMENT rule is the genuinely fragile one: the pack's
 *     `[data-civitai-ui='segmented-control'][data-size='md'] [data-civitai-ui-segment]`
 *     is (0,3,0) and BOTH sides are unlayered, so it outranks this (0,2,0) rule
 *     and `height` stays 30px there.
 *
 * None of that changes what renders — used height is `max(min-height, height)`
 * = 44 in every case — which is exactly why two false explanations survived.
 * The `min-height` is what does the work, and it is deliberate: it beats the
 * pack's `height: 30px` without out-specifying or `!important`-ing it.
 *
 * ---------------------------------------------------------------------------
 * THE TOOLTIP BLOCK (`@supports (anchor-name: …)`)
 * ---------------------------------------------------------------------------
 *
 * The pack renders an "Included" tooltip bubble as `position: absolute;
 * left: 50%; transform: translateX(-50%); max-width: 260px` inside its trigger.
 * A 260px box centred on a badge that can sit anywhere across the row falls off
 * one edge or the other on a phone, and `pageStyle`'s `overflow-x: clip` then
 * trims it with no scroll that reaches it. MEASURED in headless Chromium 144
 * against `npm run dev:harness`, over EVERY Included badge on the Combinations
 * and Prompts views (worst excursion per width):
 *
 *     320px  minLeft -58.7  maxRight 376.0   (58.7 off the left, 56.0 off the right)
 *     380px  minLeft  71.1  maxRight 395.2   (15.2 off the right)
 *     720px  minLeft  78.7  maxRight 402.8   (inside)
 *
 * 🔴 IT CLIPS ON BOTH EDGES, so the fix has to be CONDITIONAL on where the
 * trigger sits — and NO position-independent CSS can be. Two dead ends, both
 * measured, do not re-try them:
 *
 *   - WIDENING the bubble (`max-width: calc(100vw - 32px)`) is the WRONG
 *     DIRECTION. The box is centred, so wider is MORE clipped: 320px went
 *     38.9 -> 52.9px clipped and 380/480/720 went from 0 clipped to
 *     22.9 / 77.0 / 160.6. Shipped as 4418d29, reverted in faa5ed7.
 *   - PLAIN `position: fixed` with `top/bottom: auto` (i.e. relying on the
 *     static position for the vertical) is correct at rest and WRONG the moment
 *     the page scrolls: the static position is resolved once at layout, so the
 *     bubble detaches from its trigger. Measured at a 380px viewport, gap
 *     (trigger.top − bubble.bottom): 6 at scrollY 0, then −54 / −194 / −394 at
 *     scrollY 60 / 200 / 400. Anchor positioning is re-evaluated per frame and
 *     holds the gap at 6 across all of those.
 *
 * So: `position: fixed` pinned to BOTH viewport edges (bounded by construction,
 * whatever the trigger's x), with the VERTICAL taken from the anchor so the
 * bubble stays in its trigger's row. After, at every badge on both views:
 * left 8, right = clientWidth − 8, gap 6, at 320 / 380 / 720.
 *
 * 🔴 `anchor-scope` IS LOAD-BEARING, NOT DECORATION. Several triggers share one
 * `anchor-name`, and without a scope every bubble resolves to the LAST such
 * element in tree order. Measured control — the same run with only
 * `anchor-scope` removed: gaps became [−357.8, −190.9, 6] instead of [6],
 * i.e. two of three bubbles flew 190–358px away from their own badge.
 *
 * 🔴 WHICH IS WHY EVERY ANCHOR FEATURE THE BLOCK USES IS IN THE `@supports`
 * CONDITION, NOT JUST THE ONES IT OBVIOUSLY NEEDS. CSS drops an unsupported
 * declaration INDIVIDUALLY, not by rule and not by block — so a condition
 * testing only `anchor-name` and `anchor()` lets an engine that lacks
 * `anchor-scope` ENTER the block, apply every other declaration, and drop
 * precisely the one the control above shows is load-bearing. That engine gets
 * bubbles 190–358px from their badge: STRICTLY WORSE than the clipping this
 * rule replaces, which is the one outcome the guard exists to prevent. The
 * condition is the only place that can express "all or nothing"; listing a
 * feature you use but do not test for is the whole bug.
 *
 * That rule caught this block twice. `anchor-scope` was missing from the
 * condition first; then `position-anchor` was, while the test meant to enforce
 * the rule EXEMPTED it by treating it as a spelling of `anchor-name`. It is not
 * — an engine with `anchor-name`, `anchor-scope` and `anchor()` but no
 * `position-anchor` enters the block, drops it, and leaves `anchor(top)` with
 * no default anchor: `bottom` becomes invalid-at-computed-value-time and
 * resolves to `auto`, which together with `top: auto` is EXACTLY the plain
 * `position: fixed` dead end documented above (gap 6 -> −394 on scroll). No
 * shipping engine is known to be in that state — Chrome shipped `anchor-name`,
 * `position-anchor` and `anchor()` together in 125, `anchor-scope` in 131 — so
 * this closes a hole rather than a live bug. It costs one clause.
 *
 * The guard in `mobile-responsive.test.tsx` derives what the condition must say
 * from this block's own text, and it does so in FOUR passes that are not
 * equally strong — stated precisely, because a looser summary of this exact
 * sentence is what hid a hole for a whole round:
 *
 *   1. every clause is joined by `and` (walked, not regexed — `anchor(top)`
 *      nests parentheses);
 *   2. every non-baseline DECLARATION must have a clause matching it WHOLE,
 *      `(prop: value)` — not just the property name;
 *   2b. and the mirror: every CLAUSE's value must appear somewhere in the
 *      block. Needed because pass 2 skips `BASELINE_PROPS`, and `bottom` is in
 *      that set — so `(bottom: anchor(top))`, the clause carrying the most
 *      modern feature here, was reachable by neither 2 nor 3. A typo'd
 *      `anchor(topp)` survived a full green suite until this pass existed;
 *   3. every non-baseline value FUNCTION must appear in the condition. 🔴 This
 *      pass alone is a SUBSTRING check on the whole condition, not a clause
 *      check — it proves the feature is tested for SOMEWHERE, not that any
 *      particular clause is well-formed. Pass 2b is what covers the rest.
 *
 * 🔴 And the lists: TWO hand-written sets remain — `BASELINE_PROPS` and
 * `BASELINE_FUNCS`. (An earlier version of this paragraph claimed "there is no
 * list left to forget to update"; that was wrong twice over.) They are inverted
 * on purpose, so forgetting to add a MODERN feature is impossible while ADDING
 * a modern name to either list would silently un-guard it. Those two sets are
 * the only hand-maintained thing left, and they are what to review if this
 * block ever grows. Known parser limits, both LOUD false failures rather than
 * let-throughs, and neither shape present here: a `:not(`/`:is(` selector reads
 * as a value function, and a camelCase custom property mis-parses.
 *
 * The block is behind `@supports` on purpose. `anchor()` is invalid in a
 * browser without anchor positioning, so that one declaration would be dropped
 * while `position: fixed` still applied — and the pack's own
 * `bottom: calc(100% + 6px)` would then resolve against the VIEWPORT and throw
 * the bubble off the top of the screen. Guarded, such a browser keeps today's
 * behaviour: still clipped, but never worse.
 *
 * ---------------------------------------------------------------------------
 * THE THIRD SURFACE: the grid's WITHHELD-IMAGE tooltip
 * ---------------------------------------------------------------------------
 *
 * The selector is attribute-based, so it also captures `GatedCell`'s withheld
 * tile tooltip — whose label (`WITHHELD_HINT`, ~110 chars) is far longer than
 * the Included badge's. That surface was NOT in the original measurement, so it
 * was measured separately before deciding to let the rule reach it. Same
 * harness, same engine, a seeded `result` row so a real withheld tile renders,
 * BEFORE arm produced by making this block's `@supports` condition
 * unsatisfiable:
 *
 *              BEFORE                        AFTER
 *     320px  left 212.3  right 472.3   |   left 8  right 312   (was 152.3 off the right)
 *     380px  left 212.3  right 472.3   |   left 8  right 372   (was  92.3 off the right)
 *     720px  left 259.8  right 519.8   |   left 8  right 712   (was inside)
 *
 * 🔴 So this surface was ALREADY BROKEN, and worse than the badge (152.3px off
 * at 320 against the badge's 56). The rule FIXES a third surface rather than
 * extending an unmeasured change to a healthy one — which is why it is left
 * un-scoped. The trade is shape: the bubble goes from a 260px chip to a
 * viewport-width bar (304 / 364 / 704) and from 3 lines to 1. At 720 — the
 * widest compact viewport, and the one width where the old bubble was already
 * inside — that is a cosmetic widening, not a fix. Accepted: 720 is the
 * boundary case, and 320/380 are the real phones.
 *
 * The genuinely new risk here is the grid's OWN `overflow-x: auto` scroller,
 * since the bubble is now `position: fixed` while its anchor lives inside a
 * horizontally scrolling box. Measured at 320px with the tile scrolled under
 * the frame edge — trigger left 297.5 -> 217.5 -> 97.5 at scrollLeft 0 / 80 /
 * 200 — the bubble held left 8 / right 312 and gap 6 throughout. It tracks.
 */
export const compactTapTargetCss = (): string => `
[${COMPACT_ATTR}='true'] [data-civitai-ui='button'],
[${COMPACT_ATTR}='true'] [data-civitai-ui-segment],
[${COMPACT_ATTR}='true'] [data-civitai-ui-range],
[${COMPACT_ATTR}='true'] [role='option'],
[${COMPACT_ATTR}='true'] ${MENU_ITEM_SELECTOR},
[${COMPACT_ATTR}='true'] ${NAV_ITEM_SELECTOR} {
  min-height: ${MIN_TAP_TARGET_PX}px;
  height: auto;
}

/* 🔴 THE SIDEBAR COLLAPSES TO A TOP BAR under ${MOBILE_BREAKPOINT_PX}px.
   useIsMobile()'s own media query is (max-width: ${MOBILE_BREAKPOINT_PX}px) and that
   hook is what stamps ${COMPACT_ATTR}, so this block and the hook cannot disagree
   about the breakpoint — the number is imported from one place, never spelled twice.

   ⚠️ NOTHING IN THIS REPO CAN VERIFY THAT IT LOOKS RIGHT. jsdom performs NO layout:
   \`getBoundingClientRect()\` is all zeros and no grid is ever resolved, so the only
   honest claim a test can make about these four declarations is that they are in the
   emitted sheet and that their selectors match live nodes. LIVE MEASUREMENT AT
   ≤${MOBILE_BREAKPOINT_PX}px IS OWED and has not been done. */
[${COMPACT_ATTR}='true'] [${LAYOUT_ATTR}] {
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
}

/* The nav's rows become a horizontally scrolling strip. \`overflow-x: auto\` rather
   than \`wrap\` so the bar keeps ONE row whatever the label lengths — a wrapping nav
   changes the page's own height as the viewport narrows, which is the thing that put
   two of the three community boards outside the host iframe's crop in the first
   place. */
[${COMPACT_ATTR}='true'] [data-testid='side-nav-list'],
[${COMPACT_ATTR}='true'] [data-testid='nav-my-group'] {
  grid-auto-flow: column;
  grid-auto-columns: max-content;
  justify-content: start;
  overflow-x: auto;
}

@supports (anchor-name: --mb-tooltip) and (anchor-scope: --mb-tooltip) and (position-anchor: --mb-tooltip) and (bottom: anchor(top)) {
  [${COMPACT_ATTR}='true'] [data-civitai-ui='tooltip'] {
    anchor-name: --mb-tooltip;
    anchor-scope: --mb-tooltip;
  }

  [${COMPACT_ATTR}='true'] [data-civitai-ui-tooltip-bubble] {
    position: fixed;
    position-anchor: --mb-tooltip;
    top: auto;
    bottom: calc(anchor(top) + ${TOOLTIP_GAP_PX}px);
    left: ${TOOLTIP_GUTTER_PX}px;
    right: ${TOOLTIP_GUTTER_PX}px;
    width: auto;
    max-width: none;
    transform: none;
  }
}
`;

/**
 * The LAYOUT stylesheet — sidebar beside content on a wide viewport, and nothing
 * else. Mounted UNCONDITIONALLY (unlike {@link compactTapTargetCss}), because it
 * carries the WIDE case: a sheet mounted only on narrow viewports cannot express
 * "two columns here, one column there" without an inline style the narrow block
 * would then be unable to beat. See {@link LAYOUT_ATTR}.
 *
 * ⚠️ jsdom resolves no grid, so a test can assert this text and that the selector
 * matches a live node — never that the columns come out where they should.
 */
export const layoutCss = (): string => `
[${LAYOUT_ATTR}] {
  display: grid;
  grid-template-columns: ${SIDEBAR_WIDTH_PX}px minmax(0, 1fr);
  gap: 20px;
  align-items: start;
  min-width: 0;
}
`;
