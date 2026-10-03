// Design tokens for the app chrome the `@civitai/blocks-react/ui` pack doesn't
// cover (page background, muted text, the results-matrix grid scaffolding, sticky
// headers, cell states). Every CONSUMER resolves its value through a `--civitai-*`
// CSS custom property, so no component spells a colour and light/dark is driven
// entirely by the `[data-theme]` attribute the host sets on the block root (see
// App.tsx). The pack (Button/Card/Badge/…) is self-themed off the same properties,
// so the hand-rolled matrix reads as one system with it.
//
// 🔴 THIS FILE ITSELF NOW HOLDS 38 HARDCODED COLOUR VALUES (36 quoted hex + 2
// `rgba()`, counted over the code with comments stripped), AND THAT IS THE
// DELIBERATE REVERSAL OF A RECORDED DECISION. The header used to end "so there are
// ZERO hardcoded colors", which was true of the whole repo while the app rode the
// platform's palette. `taste.json`'s 2026-09-03 pass recorded `brandDepth: "accent"`
// with a decision titled "brandDepth stays `accent`, not `skin`"; that was REVERSED
// on the operator's ask on 2026-10-02 (see {@link skinCss} and `taste.json`'s
// `brandDepthReversal`). The trade, stated once: a custom palette cannot exist
// without this app naming colours, so light/dark correctness moves FROM the platform
// TO this app — every pair below is this repo's to keep correct, and nothing in the
// design system will catch it if a value is wrong. `PLAYBOOK.md` §1e's "zero
// hardcoded hex" gate is scoped around this one file for the same reason.
//
// Token source: `@civitai/theme` (installed: 0.4.0) — imported once in main.tsx via
// `@civitai/theme/styles.css` (and also injected at runtime by the pack's
// injectBlocksStyles()). NOTE: the `--civitai-color-gray-*` ramp is theme-
// INVARIANT (not redefined under [data-theme='dark']), so it is deliberately NOT
// used for any theme-responsive surface here — only the theme-aware tokens
// (text/body/surface/border/primary/error/success) are — and surface-2 is NOT among
// them any more; see the `token` docblock below.
//
// ── 🔴 THIS APP NOW HAS ITS OWN SKIN, AND IT WORKS AT THE TOKEN LAYER ───────
//
// Everything above stays true: no component spells a colour. What CHANGED is what
// the `--civitai-*` properties RESOLVE TO inside this block — {@link skinCss}
// REDECLARES them on the app root, per theme. That is the whole mechanism, and it is
// the reason the skin is one sheet rather than a sweep through 40 components: the
// pack's Button/Card/Badge/SegmentedControl read the same properties this module's
// {@link token} table does, so one redeclaration re-skins the app AND the pack
// together and they cannot drift.
//
// ⚠️ NOTHING IN THIS REPO CAN SEE THAT IT LOOKS RIGHT. jsdom performs no layout and
// resolves NO custom property, so `getComputedStyle` cannot be asked what any of the
// values below render as. `theme.test.ts` pins the declared text and the light/dark
// RELATIONSHIP; a live reading in both themes is owed and has not been taken.

import type { CSSProperties } from 'react';

/** Marks the app root the skin's token layer is scoped to. See {@link skinCss}. */
export const SKIN_ATTR = 'data-mb-skin';

/**
 * The accent-AS-TEXT custom property — this app's own, not `@civitai/theme`'s.
 *
 * 🔴 IT IS NOT A SECOND SPELLING OF `--civitai-color-primary`, AND THE ARITHMETIC IS
 * WHY. `primary` has to carry TWO incompatible jobs in the stock token set: it is the
 * FILL behind `--civitai-color-primary-fg` text (pack Button/Badge `filled`), and it
 * is also used directly AS a text colour (this app's active nav row, the brand mark).
 * Those two pull the accent in opposite directions on a dark body, and not by a
 * little — they are arithmetically unsatisfiable at WCAG AA with a near-white
 * `primary-fg`:
 *
 *   - white text on the fill needs contrast ≥ 4.5, i.e. the fill's relative
 *     luminance L ≤ 0.183;
 *   - the same colour as text on this skin's dark body (L ≈ 0.0060) needs L ≥ 0.204.
 *
 * There is no L satisfying both, which is exactly why the STOCK dark theme ships a
 * `primary` (#1971C2) that is DARKER than its light-theme one — fine as a fill,
 * ~3.1:1 as 13px text on the dark body.
 *
 * 🔴 AND `primary-fg` CANNOT BE THE VARIABLE THAT MOVES. The obvious alternative —
 * flip `primary-fg` to a dark ink in dark theme and let `primary` go light — breaks a
 * consumer that is nowhere near a primary fill: the pack's TOOLTIP bubble is
 * `background: var(--civitai-color-gray-9); color: var(--civitai-color-primary-fg)`
 * (measured in `@civitai/blocks-react`'s `BLOCKS_UI_STYLES`), and the gray ramp is
 * theme-invariant, so a dark `primary-fg` renders every tooltip dark-on-dark. The
 * pack's intent-coloured `filled` Badges put `primary-fg` over error/success/warning
 * fills for the same reason. So `primary-fg` stays near-white in both themes, the
 * fill stays white-text-safe, and the TEXT use gets its own property.
 */
export const ACCENT_TEXT_PROP = '--mb-accent-text';

/**
 * The roving-CURSOR ring colour — a neutral, deliberately NOT the accent.
 *
 * 🔴 IT EXISTS TO SEPARATE TWO STATES THAT WERE SPELLED THE SAME. `GridPicker`'s
 * option rows marked SELECTED with a primary border and the keyboard-ACTIVE row with
 * a 2px primary outline, so moving the arrow keys over an unselected row made it look
 * chosen. The accent is this app's selection colour; a cursor is a neutral ring.
 */
export const CURSOR_PROP = '--mb-cursor';

/**
 * The theme-aware `--civitai-*` tokens this app consumes (all flip with `[data-theme]`).
 *
 * 🔴 `surface2` IS DELIBERATELY ABSENT, AND ITS ABSENCE IS THE FIX. See
 * {@link recessedSurface}: `--civitai-color-surface-2` resolves to the SAME value as
 * `--civitai-color-body` in light theme, so anything filled with it loses its fill
 * there. The rule was WRITTEN DOWN three times — here, in `GatedCell.tsx`, and as a
 * grep gate in `PLAYBOOK.md` §1e — and still got open-coded wrong at a fourth site
 * (`PromptBody.tsx`'s `<pre>`), because a prose warning beside a token that is right
 * there to be reached for does not stop anyone reaching for it. Not offering the
 * token is what makes the wrong choice unspellable; `src/theme.test.ts` keeps it
 * unspellable across the whole of `src/`.
 *
 * ⚠️ THE COLLISION ITSELF IS NOW FIXED, AND THE BAN STAYS ANYWAY — read both halves
 * before concluding this docblock is stale. {@link SKIN_LIGHT} redeclares
 * `--civitai-color-surface-2` to a value distinct from `--civitai-color-body` in BOTH
 * themes, so the measurement the paragraphs above rest on — surface-2 resolving to the
 * same value as body in light theme — describes `@civitai/theme`'s STOCK token set,
 * not what resolves inside this block any more. The ban is kept on two grounds that
 * never depended on the collision: the app's recess has to have ONE home
 * ({@link recessedSurface}) or it goes back to being a per-site judgement call, and a
 * call site cannot tell by reading whether the skin is in effect. Do not re-derive
 * the old light-theme reading off the stock package and report it as live.
 */
export const token = {
  text: 'var(--civitai-color-text)',
  dimmed: 'var(--civitai-color-text-dimmed)',
  body: 'var(--civitai-color-body)',
  surface: 'var(--civitai-color-surface)',
  border: 'var(--civitai-color-border)',
  primary: 'var(--civitai-color-primary)',
  primaryLight: 'var(--civitai-color-primary-light)',
  /**
   * The accent AS TEXT. See {@link ACCENT_TEXT_PROP} — `primary` is the accent as a
   * FILL and the two cannot be one value, so this is not a synonym and swapping them
   * back re-opens a contrast failure.
   */
  accent: `var(${ACCENT_TEXT_PROP})`,
  /**
   * The ROVING-CURSOR ring. See {@link CURSOR_PROP}: a keyboard cursor must not be
   * spelled in the accent, because the accent is what marks a SELECTION.
   */
  cursor: `var(${CURSOR_PROP})`,
  error: 'var(--civitai-color-error)',
  success: 'var(--civitai-color-success)',
  radius: 'var(--civitai-radius)',
  font: 'var(--civitai-font)',
} as const;

/**
 * `--civitai-radius` and its common multiples, as strings.
 *
 * ⚠️ NO FIGURES HERE, DELIBERATELY — this comment used to say "(0.25rem)", which is
 * `@civitai/theme`'s STOCK value and not what resolves inside this block, because both
 * skins redeclare `--civitai-radius` ({@link SKIN_LIGHT}, {@link SKIN_DARK}). **Read the
 * value off those two and nowhere else.**
 *
 * 🔴 You are at least the THIRD writer of this paragraph. The first stated a stale
 * figure; the second declared "no px equivalents here, deliberately" and then stated
 * three fresh ones in the same breath — the same defect with a longer fuse, because
 * `theme.test.ts` pins the `--civitai-radius` KEY but not its VALUE, so any figure
 * written here is unpinned by construction and rots silently on the next palette edit.
 * Do not add a fourth figure. The multiples are `calc()` over whatever the property
 * resolves to, which is the point: the radius is the identity's one geometric lever and
 * moves in ONE place.
 */
export const radius = {
  sm: token.radius,
  md: `calc(${token.radius} * 2)`,
  lg: `calc(${token.radius} * 3)`,
} as const;

/**
 * A subtle, theme-agnostic elevation tint derived from the tokens: mix a little
 * `text` into `surface`. Works in BOTH themes (in light this darkens white; in
 * dark it lightens the panel) without touching the invariant gray ramp.
 *
 * ⚠️ This used to end "— which is why we don't just use `surface-2` (identical to
 * `body` in light mode)". That reason is a reading of `@civitai/theme`'s STOCK token
 * set and has EXPIRED inside this block ({@link SKIN_LIGHT} gives surface-2 a value
 * distinct from body in both themes). The ban on surface-2 stays regardless, on the
 * two grounds that never depended on the collision — see {@link recessedSurface}.
 */
export function elevate(pct: number): string {
  return `color-mix(in srgb, var(--civitai-color-text) ${pct}%, var(--civitai-color-surface))`;
}

/**
 * THE app's recessed fill — a block that has to read as *inset* from the surface
 * it sits on: a gated placeholder tile, a quoted prompt body, anything that would
 * otherwise reach for `surface-2`.
 *
 * 🔴 THIS CONSTANT IS THE WHOLE POINT OF THE CHANGE THAT ADDED IT, and the reason
 * it is a constant rather than a third comment. The predicate "surface-2 is not
 * safe as a fill" was open-coded at three sites and WRONG AT ONE:
 *
 *   - `theme.ts` said it in a sentence beside the token itself;
 *   - `GatedCell.tsx` said it in a comment above its own `elevate(5)`;
 *   - `PLAYBOOK.md` §1e said it as a hand-run `grep` gate, which nobody ran;
 *   - and `PromptBody.tsx` filled its `<pre>` with `token.surface2` anyway, so the
 *     prompt text block had NO fill in light theme.
 *
 * Three statements of a rule and one violation is the signature of a rule with no
 * single home. The rule now has one: `surface2` is gone from {@link token}, so the
 * wrong value cannot be reached for, and the right one has a name. The percentage
 * is `GatedCell`'s long-shipped 5 — light enough to stay under body text, heavy
 * enough to read against `surface` in both themes.
 *
 * ⚠️ IT IS A FILL, NOT A BOUNDARY. `color-mix` gives a *contrast step*, and how big
 * that step reads is a live-rendering question jsdom cannot answer — so every
 * consumer pairs it with `1px solid ${token.border}`, exactly as `GatedCell` always
 * has. Do not drop the border on the grounds that the fill is enough.
 */
export const recessedSurface = elevate(5);

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

// ───────────────────────────────────────────────────────────────────────────────
// THE SKIN
// ───────────────────────────────────────────────────────────────────────────────

/**
 * One theme's worth of the skin: a `color-scheme` keyword and the custom-property
 * redeclarations that go with it.
 *
 * 🔴 `vars` IS A RECORD, NOT A TYPED STRUCT, FOR ONE REASON: it lets `theme.test.ts`
 * assert the light and dark KEY SETS against each other. A struct would make that
 * relationship a type-level fact that no test can watch fail, and the failure mode
 * this skin actually has is a token redeclared in ONE theme — which renders the
 * stock value in the other and reads as "the theme half-applied".
 */
export interface Skin {
  readonly scheme: 'light' | 'dark';
  /**
   * ⚠️ AN INDEX SIGNATURE, NOT `Readonly<Record<string, string>>`, AND A TEST IS WHY.
   * `rowActions.test.tsx`'s structural scanner walks production source for JSX start
   * tags and keeps a ledger of every `<` it could not close; a generic's angle bracket
   * lands in that ledger, which both reds the ledger and silently narrows the scan
   * over this file. The two spellings are the same type.
   */
  readonly vars: { readonly [prop: string]: string };
}

/**
 * The light skin.
 *
 * ── WHAT THE IDENTITY IS, AND WHY ──────────────────────────────────────────────
 *
 * The app ranks model setups against identical prompts and spends money doing it. So
 * the look is INSTRUMENT, not gallery: a cool neutral ground that gets out of the way
 * of the images in the matrix, a single saturated indigo accent carrying every
 * interactive and "selected" meaning, and semantic colours that never compete with
 * the accent for attention.
 *
 * ── THE THREE THINGS THIS FIXES AT THE TOKEN LAYER ─────────────────────────────
 *
 * 1. 🔴 `surface` IS NOW DISTINCT FROM `body`. Stock light is `#fefefe` for `body`,
 *    `surface` AND `surface-2` — three names, one colour — so every Card, panel and
 *    sticky header in light theme was a bordered outline on an identical ground, and
 *    `elevate()` existed to manufacture the step the token set does not provide.
 *    Here `body`/`surface`/`surface-2` are three values in BOTH themes. (`elevate()`
 *    stays: it is still what gives a sub-step inside a surface, and every consumer of
 *    it still pairs it with a border.)
 * 2. 🔴 `text-dimmed` CLEARS WCAG AA. Stock `#868e96` on `#fefefe` is ≈2.9:1 — below
 *    4.5 — and this app uses `mutedText`/`metaText` for real prose (quota lines,
 *    descriptions, the truncation disclosure). `#5A6472` on this body is ≈5.6:1.
 * 3. 🔴 CARDS KEEP A BORDER IN DARK. `--civitai-card-border-width` is `0` under the
 *    stock dark theme, so a dark-theme Card is a fill with no edge; with a distinct
 *    `surface` that edge is what makes a panel a panel. 1px in both themes.
 *
 * ⚠️ EVERY CONTRAST FIGURE IN THIS FILE IS COMPUTED FROM THE HEX, NOT MEASURED ON A
 * SCREEN. They are arithmetic over the sRGB formula and they are worth exactly that:
 * they say a pair cannot be *obviously* wrong, not that the result reads well.
 */
export const SKIN_LIGHT: Skin = {
  scheme: 'light',
  vars: {
    // Ink. ~15.9:1 on `body`.
    '--civitai-color-text': '#15171C',
    // ~5.6:1 on `body` — the AA fix described above.
    '--civitai-color-text-dimmed': '#5A6472',
    // Ground / panel / recessed panel: three VALUES, not three names for one.
    '--civitai-color-body': '#F7F8FA',
    '--civitai-color-surface': '#FFFFFF',
    '--civitai-color-surface-2': '#EEF0F5',
    '--civitai-color-border': '#D8DCE4',
    // The accent as a FILL. White on it is ≈6.4:1.
    '--civitai-color-primary': '#5647D6',
    '--civitai-color-primary-hover': '#4738BF',
    '--civitai-color-primary-fg': '#FFFFFF',
    '--civitai-color-primary-light': 'rgba(86, 71, 214, 0.10)',
    '--civitai-color-error': '#C92A3B',
    '--civitai-color-success': '#0E7A5F',
    '--civitai-color-warning': '#A85A08',
    '--civitai-color-info': '#2A6FBF',
    '--civitai-color-track': '#E6E9F0',
    '--civitai-color-segmented-bg': '#EDEFF5',
    '--civitai-color-media-placeholder': '#E6E9F0',
    // See the note on point 3 above.
    '--civitai-card-border-width': '1px',
    // The identity's one geometric lever, and it reaches the pack too: every
    // `radius.sm/md/lg` in this app is a multiple of this one property.
    '--civitai-radius': '0.375rem',
    // The two app-own properties. ~8.2:1 and ~15.9:1 on `body`.
    [ACCENT_TEXT_PROP]: '#4335B8',
    [CURSOR_PROP]: '#15171C',
  },
};

/**
 * The dark skin — the DEFAULT, because `bootTheme.ts` and `index.html` both resolve
 * an unknown theme to dark and the boot skeleton is painted dark before React runs.
 *
 * 🔴 THE ACCENT GETS LIGHTER HERE AND THE STOCK ONE GETS DARKER. Stock dark `primary`
 * is `#1971C2` against a light-theme `#228BE6` — i.e. the accent loses luminance
 * exactly where the ground lost it too. `ACCENT_TEXT_PROP`'s docblock has the
 * arithmetic for why the fill cannot simply be brightened instead.
 */
export const SKIN_DARK: Skin = {
  scheme: 'dark',
  vars: {
    // ~15.1:1 on `body`.
    '--civitai-color-text': '#E4E7EE',
    // ~7.2:1 on `body`.
    '--civitai-color-text-dimmed': '#99A1B2',
    '--civitai-color-body': '#111216',
    '--civitai-color-surface': '#1A1C22',
    '--civitai-color-surface-2': '#22252D',
    '--civitai-color-border': '#2E323C',
    // White on it is ≈4.9:1 — the brightest this fill can go and still take
    // near-white `primary-fg` at AA.
    '--civitai-color-primary': '#6B5CE7',
    '--civitai-color-primary-hover': '#7D70EC',
    '--civitai-color-primary-fg': '#FFFFFF',
    // ⚠️ THIS IS NOT A TRANSLUCENT FORM OF THE DARK `primary` ABOVE, AND NO REASON
    // FOR THAT IS RECORDED. `primary` is #6B5CE7 = rgb(107, 92, 231); this wash's base
    // is rgb(123, 108, 240), which matches neither it nor `primary-hover` (#7D70EC =
    // rgb(125, 112, 236)). SKIN_LIGHT's pair IS derived — `primary` #5647D6 =
    // rgb(86, 71, 214) and the wash is `rgba(86, 71, 214, 0.10)` — so the asymmetry
    // is in this block alone. Left as it is rather than "fixed" to rgb(107, 92, 231):
    // it is a visible colour on the brand mark (`brandMarkStyle` in App.tsx puts
    // `accent` on it) and the `aria-expanded` row-menu trigger, jsdom resolves no
    // custom property, and nothing in this repo can tell whether the derived value
    // reads better or worse. A live reading in dark theme is owed; whoever takes it
    // either derives this value or writes down why it is bespoke.
    '--civitai-color-primary-light': 'rgba(123, 108, 240, 0.18)',
    '--civitai-color-error': '#E5484D',
    '--civitai-color-success': '#2BA37C',
    '--civitai-color-warning': '#D9822B',
    '--civitai-color-info': '#4A9EDA',
    '--civitai-color-track': '#22252D',
    '--civitai-color-segmented-bg': '#1A1C22',
    '--civitai-color-media-placeholder': '#22252D',
    '--civitai-card-border-width': '1px',
    '--civitai-radius': '0.375rem',
    // ~8.8:1 and ~15.1:1 on `body`.
    [ACCENT_TEXT_PROP]: '#B3A7FF',
    [CURSOR_PROP]: '#E4E7EE',
  },
};

/** Serialise one theme's declarations, indented for the emitted sheet. */
function skinBlock(skin: Skin): string {
  const lines = [`  color-scheme: ${skin.scheme};`];
  for (const [prop, value] of Object.entries(skin.vars)) lines.push(`  ${prop}: ${value};`);
  return lines.join('\n');
}

/**
 * The SKIN stylesheet — this app's own token layer, plus the few identity rules that
 * are not expressible as a token value.
 *
 * 🔴 EVERY THEME SELECTOR CARRIES **TWO** ATTRIBUTES, AND THAT IS NOT STYLE. The pack
 * injects `@civitai/theme`'s own `[data-theme='dark']` / `[data-theme='light']` rules
 * — specificity (0,1,0) — onto the very element this app stamps `data-theme` on. A
 * single-attribute selector here would tie with those and the winner would then be
 * decided by DOCUMENT ORDER, i.e. by whether `injectBlocksStyles()` happened to run
 * before React committed this `<style>`. `[data-mb-skin='true'][data-theme='dark']` is
 * (0,2,0) and wins outright, with no `!important` and no ordering assumption.
 *
 * 🔴 THE BARE `[data-mb-skin='true']` BLOCK IS THE UNKNOWN-THEME FALLBACK, AND IT IS
 * DARK. `paintTheme()` returns the HOST's theme string once `ready`, which this app
 * does not validate — a host sending anything but `dark`/`light` matches neither
 * specific rule. Unknown means dark here, in `bootTheme.ts` and in `index.html`'s
 * inline script, so the three agree. Its (0,1,0) DOES tie with the pack's
 * `[data-theme='light']`, but that tie can only arise for a theme value that is
 * neither `dark` nor `light`, in which case the pack's light rule does not match
 * either.
 *
 * ── THE NON-TOKEN RULES, AND THE BLAST RADIUS OF EACH ──────────────────────────
 *
 *   - `font-variant-numeric: tabular-nums` on the root, inherited everywhere. This is
 *     the typographic half of the identity and it is the one choice here that is
 *     about this app specifically: almost every number on screen is a COMPARISON —
 *     vote counts stacked down a column, Buzz costs, "N selected", the per-cell
 *     counts in the matrix — and proportional digits make columns of them ragged.
 *     Chosen over a typeface because a block cannot load one: the CSP on a published
 *     block blocks external hosts, so a `font-family` naming a face nobody has is a
 *     declaration with no effect.
 *   - `scrollbar-color` on the two horizontal scrollers this app builds (the results
 *     matrix and the compact nav strip). They are the only places content is clipped
 *     on purpose, which is exactly where a scrollbar earns its ink.
 *   - A focus ring on the app's OWN controls. The pack rings several of its own with
 *     `2px solid var(--civitai-color-primary)` and those follow the skin for free; the
 *     hand-built ones — nav items, menu items, the matrix's group band — had no
 *     `:focus-visible` rule at all.
 *
 *     ⚠️ THE OFFSET IS NOT ONE NUMBER, so do not copy a single figure from here.
 *     Measured in `@civitai/components@0.9.1`'s `styles.css`: four ring sites, at
 *     offsets **2, 4, 2 and 2** — the slider's is the 4. An earlier draft of this
 *     comment gave "offset 2" for all five named controls, which would have had anyone
 *     matching the pack's ring write the wrong offset on the slider. If you need the
 *     exact pairing, grep `outline-offset:` in that sheet rather than trusting a list
 *     here; this paragraph deliberately records the SPREAD, not the mapping.
 *
 *     🔴 THE SELECTOR LIST IS ENUMERATED RATHER THAN A BARE `:focus-visible`, AND THE
 *     REASON GIVEN FOR THAT HERE WAS BACKWARDS. It said a bare `:focus-visible` "would
 *     outrank several of the pack's own rings ON SPECIFICITY". Specificity is not what
 *     decides it: `@civitai/components`'s whole sheet ships inside
 *     `@layer civitai.components` (its `styles.css` line 17) and this sheet is
 *     UNLAYERED, and an unlayered declaration beats EVERY layered one regardless of
 *     specificity. So a bare `:focus-visible` would win over those rings at any
 *     specificity, including a lower one — the opposite of the reassurance the old
 *     wording gives a reader adding "just a low-specificity rule". The conclusion is
 *     unchanged and the hazard is wider than stated.
 *
 *     (The one nuance: the rings `@civitai/blocks-react` keeps in its own
 *     `INTERACTIVE_STYLES` are UNLAYERED, so for those specificity DOES decide. ⚠️ An
 *     earlier draft listed six components there — Modal, Select, Slider, Collapse,
 *     SegmentedControl, ResourceCard. That is the set whose CSS lives in that file,
 *     NOT the set that carries a ring: measured, it holds exactly **three**
 *     `outline-offset` declarations — `[data-civitai-ui-range]` at 2, `resource-card`
 *     at −2 and `segmented-control` at 1. Modal, Select and Collapse have no ring at
 *     all. Either way, enumerate.)
 *   - `::selection` in the accent, so dragging over the matrix looks like part of the
 *     app rather than the UA default.
 *   - 🔴 A RESTING BOX ON THE `⋮` ROW-MENU TRIGGER. It is a pack `Button` with
 *     `variant="subtle"`, and the pack's subtle rule is `background: transparent;
 *     border-color: transparent` — so the app's only overflow affordance rendered as a
 *     bare three-dot glyph floating in a row of real buttons, with nothing saying it
 *     was pressable until a pointer was already on it. A touch viewer never gets that
 *     hover. The rule gives it a surface, a border and a dimmed glyph at rest; hover
 *     fills it and takes the accent border; and `[aria-expanded='true']` — the state
 *     the trigger already publishes — marks it OPEN in the accent, which is the part a
 *     `variant` change could not have bought.
 *   - 🔴 LEFT-ALIGNING THE MENU PANEL'S CONFIRM-FLOW CONTROLS. Inside one `role="menu"`
 *     panel, `MenuItem` (Edit) is a hand-built button with `text-align: left` while
 *     Remove and Report are pack `Button`s, whose base rule is
 *     `justify-content: center` — so one panel had a left-aligned first row and a
 *     centred second row. The fix is on the WRAPPER (`[data-mb-menu-control] button`)
 *     rather than on `MenuItem`, because the pack buttons are the ones out of step and
 *     the wrapper is the only handle this app has on them.
 *
 * ⚠️ FOUR SELECTORS HERE ARE SPELLED AS LITERALS THAT ANOTHER MODULE OWNS, AND THAT IS
 * A SEAM. `data-mb-icon-button` and `data-mb-nav-item` are `compact.ts`'s
 * (`ICON_BUTTON_SELECTOR`, `NAV_ITEM_SELECTOR`), `data-mb-menu-control` is `Menu.tsx`'s
 * (`MENU_CONTROL_ATTR`), and `grid-group-matchup` is `ResultsGrid.tsx`'s testid. They
 * are NOT imported, because `compact.ts` already imports THIS module and `Menu.tsx` is
 * a React component this React-free module must not pull in. So the lockstep is a
 * TEST instead, the way `navIndentVar`'s two ends are pinned: `theme.test.ts` (the
 * `compact.ts` constants) and `designPass.test.tsx` (`MENU_CONTROL_ATTR`, and the
 * reachability of each selector against live nodes) assert each owner's constant
 * appears in this sheet, so a rename on either side is red rather than a silently dead
 * rule. ⚠️ This used to name `skin.test.tsx`, which does not exist anywhere in the
 * tree — a pointer to a nonexistent guard reads as coverage while providing none.
 *
 * ⚠️ NO COMMENTS INSIDE THE TEMPLATE LITERAL, DELIBERATELY, AND BOTH REASONS HAVE
 * COST THIS REPO A ROUND. This string is rendered as a `<style>` ELEMENT, so anything
 * in it lands in `document.body.textContent` where `myCommunity.test.tsx`'s
 * vocabulary scan reads it — a stray banned word in CSS commentary fails a test whose
 * stack trace points at a test file. And the literal is backtick-delimited, so one
 * unescaped backtick in a comment ends it. All commentary lives in this docblock,
 * which is compiled away.
 */
export const skinCss = (): string => `
[${SKIN_ATTR}='true'] {
${skinBlock(SKIN_DARK)}
  font-variant-numeric: tabular-nums;
}

[${SKIN_ATTR}='true'][data-theme='dark'] {
${skinBlock(SKIN_DARK)}
}

[${SKIN_ATTR}='true'][data-theme='light'] {
${skinBlock(SKIN_LIGHT)}
}

[${SKIN_ATTR}='true'] [data-testid='results-grid'],
[${SKIN_ATTR}='true'] [data-testid='side-nav-list'] {
  scrollbar-color: var(--civitai-color-border) transparent;
}

[${SKIN_ATTR}='true'] [data-mb-nav-item]:focus-visible,
[${SKIN_ATTR}='true'] [role='menuitem']:focus-visible,
[${SKIN_ATTR}='true'] [data-testid='grid-group-matchup']:focus-visible {
  outline: 2px solid var(--civitai-color-primary);
  outline-offset: 2px;
}

[${SKIN_ATTR}='true'] ::selection {
  background: var(--civitai-color-primary);
  color: var(--civitai-color-primary-fg);
}

[${SKIN_ATTR}='true'] [data-civitai-ui='button'][data-mb-icon-button] {
  border-color: var(--civitai-color-border);
  background: var(--civitai-color-surface);
  color: ${token.dimmed};
}

[${SKIN_ATTR}='true'] [data-civitai-ui='button'][data-variant='subtle'][data-mb-icon-button]:hover:not(:disabled) {
  background: ${recessedSurface};
  border-color: ${token.accent};
  color: ${token.text};
}

[${SKIN_ATTR}='true'] [data-civitai-ui='button'][data-mb-icon-button][aria-expanded='true'] {
  border-color: ${token.accent};
  background: var(--civitai-color-primary-light);
  color: ${token.accent};
}

[${SKIN_ATTR}='true'] [role='menu'] [data-mb-menu-control] button {
  justify-content: flex-start;
  width: 100%;
}
`;
