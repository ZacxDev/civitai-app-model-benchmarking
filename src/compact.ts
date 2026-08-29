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
 * 🔴 `height: auto` reaches the BUTTONS ONLY, and the earlier claim here that it
 * was "paired with the min-height on the segments only" was BACKWARDS — measured
 * out of Chromium with `CSS.getMatchedStylesForNode`. The pack's segment rule
 * `[data-civitai-ui='segmented-control'][data-size='md'] [data-civitai-ui-segment]`
 * is specificity (0,3,0) and OUTRANKS this rule's (0,2,0), so `height` stays
 * `30px` on a segment; on a button the pack's `&[data-size="sm"]` ties at (0,2,0)
 * and this rule wins on order. The rendered result is correct either way, because
 * used height is `max(min-height, height)` = 44 — which is exactly why the wrong
 * explanation survived a round: nothing on the page looks different.
 *
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

/* The "Included" tooltip is position:absolute and 260px wide, so under the
   root's overflow-x clip backstop its tail is CLIPPED rather than scrolled to
   — measured at 320px, 56px (~22%) of the bubble was unreachable, taking the
   whole trailing sentence with it. Bounding it to the viewport keeps the text
   readable without weakening the backstop.
   NOTE: no backticks in this block — it lives inside a template literal, and a
   backtick here terminates the string and hands the CSS to the TS parser. */
[${COMPACT_ATTR}='true'] [data-civitai-ui-tooltip-bubble] {
  max-width: calc(100vw - 32px);
}
`;
