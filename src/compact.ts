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
 *     BEFORE the pack's: the button still resolves to the pack's 15px height,
 *     which the "wins on order" story cannot explain.
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
 */
export const compactTapTargetCss = (): string => `
[${COMPACT_ATTR}='true'] [data-civitai-ui='button'],
[${COMPACT_ATTR}='true'] [data-civitai-ui-segment],
[${COMPACT_ATTR}='true'] [data-civitai-ui-range] {
  min-height: ${MIN_TAP_TARGET_PX}px;
  height: auto;
}

`;
