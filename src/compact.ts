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
 * `height: auto` is paired with the `min-height` on the segments only: their
 * pack rule sets an explicit `height`, and leaving it in place is harmless, but
 * clearing it keeps the flex centering honest when a long label wraps.
 */
export const compactTapTargetCss = (): string => `
[${COMPACT_ATTR}='true'] [data-civitai-ui='button'],
[${COMPACT_ATTR}='true'] [data-civitai-ui-segment] {
  min-height: ${MIN_TAP_TARGET_PX}px;
  height: auto;
}
`;
