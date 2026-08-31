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
 *   - `[data-civitai-ui-segment]`    → the `view-switch` tab-strip segments.
 *
 * 🔴 THIS PARAGRAPH HAS BEEN WRONG TWICE. Both corrections came from MEASURING
 * the cascade, not from reading it, and the current text is the third attempt:
 *
 *   - `height: auto` reaches the BUTTONS **and the RANGE** (measured: range
 *     `height` 6px -> 16px with the pack sheet linked), NOT the segments. Round 1
 *     said "segments only" (backwards); round 2 said "buttons only" — also wrong,
 *     because the same commit had just added the range selector to this rule.
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
 * `[data-civitai-ui-range]` is the "Show top N" slider — 6px tall from the pack,
 * the smallest target on the page and the only control that changes what a
 * narrow-viewport reader SEES. It gets the same floor.
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
 * 🔴 WHICH IS WHY ALL THREE FEATURES ARE IN THE `@supports` CONDITION, NOT
 * JUST THE TWO THIS BLOCK OBVIOUSLY NEEDS. CSS drops an unsupported declaration
 * INDIVIDUALLY, not by rule and not by block — so a condition testing only
 * `anchor-name` and `anchor()` lets an engine that lacks `anchor-scope` ENTER
 * the block, apply every other declaration, and drop precisely the one the
 * control above shows is load-bearing. That engine gets bubbles 190–358px from
 * their badge: STRICTLY WORSE than the clipping this rule replaces, which is
 * the one outcome the guard exists to prevent. The condition is the only place
 * that can express "all or nothing"; listing a feature you use but do not test
 * for is the whole bug.
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
[${COMPACT_ATTR}='true'] [data-civitai-ui-range] {
  min-height: ${MIN_TAP_TARGET_PX}px;
  height: auto;
}

@supports (anchor-name: --mb-tooltip) and (anchor-scope: --mb-tooltip) and (bottom: anchor(top)) {
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
