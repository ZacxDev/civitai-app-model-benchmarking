// Design tokens for the app chrome the `@civitai/blocks-react/ui` pack doesn't
// cover (page background, muted text, the results-matrix grid scaffolding, sticky
// headers, cell states). Every value resolves to a `@civitai/theme` CSS custom
// property (`--civitai-*`) so there are ZERO hardcoded colors and light/dark is
// driven entirely by the `[data-theme]` attribute the host sets on the block root
// (see App.tsx). The pack (Button/Card/Badge/…) is self-themed off the same
// tokens, so the hand-rolled matrix reads as one system with it.
//
// Token source: `@civitai/theme@0.2.0` — imported once in main.tsx via
// `@civitai/theme/styles.css` (and also injected at runtime by the pack's
// injectBlocksStyles()). NOTE: the `--civitai-color-gray-*` ramp is theme-
// INVARIANT (not redefined under [data-theme='dark']), so it is deliberately NOT
// used for any theme-responsive surface here — only the theme-aware tokens
// (text/body/surface/surface-2/border/primary/error/success) are.

import type { CSSProperties } from 'react';

/** The theme-aware `--civitai-*` tokens this app consumes (all flip with `[data-theme]`). */
export const token = {
  text: 'var(--civitai-color-text)',
  dimmed: 'var(--civitai-color-text-dimmed)',
  body: 'var(--civitai-color-body)',
  surface: 'var(--civitai-color-surface)',
  surface2: 'var(--civitai-color-surface-2)',
  border: 'var(--civitai-color-border)',
  primary: 'var(--civitai-color-primary)',
  primaryLight: 'var(--civitai-color-primary-light)',
  error: 'var(--civitai-color-error)',
  success: 'var(--civitai-color-success)',
  radius: 'var(--civitai-radius)',
  font: 'var(--civitai-font)',
} as const;

/** `--civitai-radius` (0.25rem) and its common multiples, as strings. */
export const radius = {
  sm: token.radius,
  md: `calc(${token.radius} * 2)`,
  lg: `calc(${token.radius} * 3)`,
} as const;

/**
 * A subtle, theme-agnostic elevation tint derived from the tokens: mix a little
 * `text` into `surface`. Works in BOTH themes (in light this darkens white; in
 * dark it lightens the panel) without touching the invariant gray ramp — which
 * is why we don't just use `surface-2` (identical to `body` in light mode).
 */
export function elevate(pct: number): string {
  return `color-mix(in srgb, var(--civitai-color-text) ${pct}%, var(--civitai-color-surface))`;
}

export interface Palette {
  bg: string;
  fg: string;
  muted: string;
  border: string;
  card: string;
  headerBg: string;
  cellEmpty: string;
}

/** The app-chrome palette, entirely as `--civitai-*` var references (theme-agnostic). */
export function palette(): Palette {
  return {
    bg: token.body,
    fg: token.text,
    muted: token.dimmed,
    border: token.border,
    card: token.surface,
    headerBg: elevate(4), // subtle sticky-header lift, both themes
    cellEmpty: elevate(2), // faint "empty slot" recess
  };
}

export function pageStyle(c: Palette): CSSProperties {
  return {
    fontFamily: token.font,
    background: c.bg,
    color: c.fg,
    width: '100%',
    minHeight: '100dvh',
    display: 'flex',
    boxSizing: 'border-box',
    // Document-level backstop against a horizontal page scroll. Everything the
    // app lays out is already contained (see `contentStyle`), but an
    // ABSOLUTELY-positioned descendant escapes that containment and still
    // extends the document's scrollable area: measured at the base commit, the
    // "Included" tooltip bubble (`position: absolute`, `max-width: 260px`,
    // centred on its badge) pushed the Combinations view to a 395px
    // scrollWidth against a 380px viewport — a pre-existing overflow with
    // nothing to do with the results matrix.
    //
    // `clip`, NOT `hidden`: `hidden` would make this element a scroll
    // container, letting the page be scrolled programmatically to content the
    // user cannot see. 🔴 The STICKY half of this sentence used to be here too
    // ("would swallow the sticky positioning the matrix relies on") and was
    // MEASURED FALSE in the round-1 audit: sticky resolves against the
    // `results-grid` scroller, not this root, and the row header pins
    // identically under clip / hidden / visible. The conclusion is unchanged
    // and the remaining reason is real — but do not re-derive the sticky one.
    // `clip` only clips, and — unlike `hidden` — permits
    // `overflow-y: visible`, so vertical page scrolling is untouched. The
    // matrix keeps its OWN `overflow-x: auto` container, so no cell is made
    // unreachable by this; only an out-of-flow overlay gets trimmed at the
    // frame edge. Fixed-position descendants (the modal overlay) are not
    // clipped — their containing block is the viewport, not this box.
    overflowX: 'clip',
  };
}

/**
 * The content column inside {@link pageStyle}.
 *
 * 🔴 `minWidth` and `gridTemplateColumns` are OVERFLOW CONTAINMENT, not
 * cosmetics — they are what makes the wide results matrix scroll inside its own
 * `overflow-x: auto` container (ResultsGrid) instead of widening the whole
 * document on a phone. Two separate blowout points, both defaulting to
 * content-based minimums:
 *
 *   1. This box is a flex ITEM of `pageStyle` (`display: flex`, row). A flex
 *      item's `min-width: auto` resolves to its content's min-content width on
 *      the main axis, which overrides `width: 100%` — so a 580px-wide grid drags
 *      this box (and the document) out to 580px. `minWidth: 0` opts out.
 *   2. This box is itself a GRID, and its implicit column is `auto`, whose
 *      minimum is likewise min-content — so the same blowout re-enters one level
 *      down. `minmax(0, 1fr)` pins that track's minimum to 0. (At desktop widths
 *      a `1fr` track fills exactly like the `auto` track it replaces, so the
 *      uncapped full-width behaviour from #16 is unchanged.)
 *
 * Measured in headless Chromium against the dev harness at a 380px viewport,
 * Grid view: document scrollWidth 596 → 380 (viewport 380). See
 * `mobile-responsive.test.tsx` for what jsdom can and cannot pin here.
 */
export const contentStyle: CSSProperties = {
  margin: '0 auto',
  width: '100%',
  minWidth: 0,
  gridTemplateColumns: 'minmax(0, 1fr)',
  padding: 'clamp(14px, 3vw, 24px)',
  display: 'grid',
  gap: 18,
  alignContent: 'start',
  boxSizing: 'border-box',
};

/** Muted secondary text — the dimmed token at full opacity (crisper than opacity-stacking). */
export const mutedText: CSSProperties = { color: token.dimmed, fontSize: 13, lineHeight: 1.5 };

/** Smaller meta/caption text. */
export const metaText: CSSProperties = { color: token.dimmed, fontSize: 12, lineHeight: 1.45 };
