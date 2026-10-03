// The inline boot styles in index.html hardcode colour literals. Everything that
// renders inside the app spells colour as `var(--civitai-*)` instead — but the
// boot window is the one place a var is unusable, because the two stylesheets
// that DECLARE those properties both arrive with the bundle: Vite's
// render-blocking <link> for `@civitai/theme/styles.css`, and the app's own skin
// <style>, which React commits. These tests are what stop that necessary
// duplication from drifting.
//
// 🔴 AND THE AUTHORITY THEY ASSERT AGAINST HAS CHANGED — THIS FILE IS THE FIX FOR
// A GUARD THAT READ AS COVERAGE WHILE PROVIDING NONE. It used to compare every
// literal to the INSTALLED `@civitai/theme` package, and this header used to claim
// "zero hardcoded colour" of the rest of the app. Both were true until `src/theme.ts`
// grew its own token layer: `skinCss()` REDECLARES the `--civitai-*` properties on
// the app root, so from that point the stock package stopped being what the block
// paints, and this file stayed green over a four-token divergence (dark body
// #1a1b1e vs #111216, dark surface #25262b vs #1a1c22, dark text #c1c2c5 vs
// #e4e7ee, light body #fefefe vs #f7f8fa). The consequence was not that the flash
// came back — it was that the flash MOVED, from BLOCK_INIT to React mount, where
// nothing was looking for it.
//
// 🔴 AND "THE STOCK PALETTE" WAS NEVER ONE THING ANYWAY — a second, independent
// reason the old authority was the wrong one. Measured here with `pnpm why
// @civitai/theme`: THREE versions are in the graph. `0.4.0` is this repo's direct
// dependency, i.e. the one Vite emits the render-blocking `<link>` for and the one the
// old `createRequire(...).resolve('@civitai/theme/styles.css')` reached; `0.5.0`
// arrives via `@civitai/blocks-react@0.63.0`, i.e. the one `injectBlocksStyles()`
// actually injects at runtime; `0.3.2` via `@civitai/components-react@0.4.3`. The
// three values this file reads happen to be identical across 0.4.0 and 0.5.0 — but
// WHICH SELECTOR HOLDS THEM INVERTED: in 0.4.0 `:root` is the LIGHT palette, and from
// 0.5.0 `:root` IS the dark one with light moved behind an explicit
// `[data-theme='light']` block. The old cases read `:root` AS LIGHT, so a routine bump
// of the direct dependency to 0.5.0 would have silently compared the light boot
// literals against dark package values. A guard whose answer depends on which of three
// installed copies it happens to resolve is not pinning a relationship.
//
// So the relationship pinned below is index.html's literals against `SKIN_DARK` /
// `SKIN_LIGHT` in `src/theme.ts` — what the block actually paints, in one copy, in
// this repo — plus the seam that makes that the right comparison at all: the property
// the first React commit reads for its background is the same property the skin
// redeclares.
//
// ⚠️ NOT AN APPEARANCE CLAIM. This is the `node` project; there is no DOM, no
// layout and no custom-property resolution anywhere in it. Every case here is a
// STRING relationship between two files. Whether the painted skeleton and the
// painted loading frame are the same colour on a screen is a live reading, and it
// has not been taken.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { SKIN_DARK, SKIN_LIGHT, palette, pageStyle, token } from './theme.js';

const INDEX_HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

/** Pull one selector's declaration block out of a stylesheet. */
function block(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`selector not found: ${selector}`);
  const end = css.indexOf('}', start);
  if (end === -1) throw new Error(`unterminated block: ${selector}`);
  return css.slice(start, end);
}

/** Read a custom property's value out of a declaration block. */
function tokenValue(css: string, selector: string, prop: string): string {
  const m = new RegExp(`${prop}:\\s*([^;]+);`).exec(block(css, selector));
  if (!m) throw new Error(`${prop} not found in ${selector}`);
  return m[1].trim().toLowerCase();
}

/**
 * The inline `<style>` body ONLY.
 *
 * 🔴 EVERY CSS LOOKUP GOES THROUGH THIS, not through the raw file. Searching the
 * whole document for `@media (prefers-color-scheme: light)` matches the PROSE
 * mention of it inside the boot script's comment first — which is how the first
 * version of the canvas-background test below failed at baseline while appearing to
 * kill every mutant. A comment is not a rule; scope the search to the stylesheet.
 */
const BOOT_CSS = (() => {
  const m = /<style>([\s\S]*?)<\/style>/.exec(INDEX_HTML);
  if (!m) throw new Error('no inline <style> found in index.html');
  return m[1];
})();

/** Read one of the boot variables out of a region of index.html's inline <style>. */
function bootValue(selector: string, prop: string): string {
  return tokenValue(BOOT_CSS, selector, prop);
}

/** A skin's declared value for one `--civitai-*` property, comparably cased. */
function skinValue(skin: typeof SKIN_DARK, prop: string): string {
  const v = skin.vars[prop];
  if (v === undefined) throw new Error(`${prop} is not declared by the ${skin.scheme} skin`);
  return v.trim().toLowerCase();
}

// 🔴 THE SEAM THAT MAKES THE SKIN THE RIGHT AUTHORITY, AND IT IS A SEPARATE CLAIM
// FROM THE LITERALS. Comparing index.html to `SKIN_DARK` is only meaningful while
// the thing the first React commit paints its background WITH is the property the
// skin redeclares. Two sides, and a rename on either one would leave every
// colour-by-colour case below green over a skeleton that no longer matches
// anything: `pageStyle()` could be repointed at a different token, or the skin
// could stop declaring the one it reads.
describe('the boot skeleton is pinned to the property the first React commit reads', () => {
  it('🔴 `pageStyle()` paints with `--civitai-color-body`, and both skins declare it', () => {
    // The first React commit is App's `!ready` branch: a root carrying the skin
    // attribute and `pageStyle(palette())`. Its background is where the handoff
    // from index.html's skeleton happens.
    expect(pageStyle(palette()).background).toBe('var(--civitai-color-body)');
    // …and the same property, spelled once in `token`, is what the skin overrides.
    expect(token.body).toBe('var(--civitai-color-body)');
    expect(SKIN_DARK.vars).toHaveProperty('--civitai-color-body');
    expect(SKIN_LIGHT.vars).toHaveProperty('--civitai-color-body');
  });
});

// The four regions that must agree, and WHY each exists:
//   :root                                     → the unconditioned base (dark-only)
//   @media (prefers-color-scheme: light)       → the OS guess
//   :root[data-civitai-boot-theme='dark']      → the host's answer, dark
//   :root[data-civitai-boot-theme='light']     → the host's answer, light
// Dropping any one of them is a repaint at BLOCK_INIT in one of the four
// OS × host combinations, which is the flash this whole change removes.
describe('boot token parity with the app skin', () => {
  it('the DARK literals match SKIN_DARK', () => {
    const body = skinValue(SKIN_DARK, '--civitai-color-body');
    const text = skinValue(SKIN_DARK, '--civitai-color-text');
    const surface = skinValue(SKIN_DARK, '--civitai-color-surface');

    // The unconditioned base…
    expect(bootValue(':root', '--mb-boot-body'), 'boot dark body is not SKIN_DARK body').toBe(body);
    expect(bootValue(':root', '--mb-boot-text'), 'boot dark text is not SKIN_DARK text').toBe(text);
    expect(
      bootValue(':root', '--mb-boot-surface'),
      'boot dark surface is not SKIN_DARK surface',
    ).toBe(surface);

    // …and the host-answered dark override, which must be the SAME literals.
    expect(bootValue(":root[data-civitai-boot-theme='dark']", '--mb-boot-body')).toBe(body);
    expect(bootValue(":root[data-civitai-boot-theme='dark']", '--mb-boot-text')).toBe(text);
    expect(bootValue(":root[data-civitai-boot-theme='dark']", '--mb-boot-surface')).toBe(surface);
  });

  it('the LIGHT literals match SKIN_LIGHT', () => {
    const body = skinValue(SKIN_LIGHT, '--civitai-color-body');
    const text = skinValue(SKIN_LIGHT, '--civitai-color-text');
    const surface = skinValue(SKIN_LIGHT, '--civitai-color-surface');

    expect(
      bootValue(":root[data-civitai-boot-theme='light']", '--mb-boot-body'),
      'boot light body is not SKIN_LIGHT body',
    ).toBe(body);
    expect(
      bootValue(":root[data-civitai-boot-theme='light']", '--mb-boot-text'),
      'boot light text is not SKIN_LIGHT text',
    ).toBe(text);
    expect(
      bootValue(":root[data-civitai-boot-theme='light']", '--mb-boot-surface'),
      'boot light surface is not SKIN_LIGHT surface',
    ).toBe(surface);

    // The OS-guess media block is the fourth region, and it carries the light
    // values too — asserted here rather than in a fifth case, because a region
    // missing from this file is a repaint in one of the four OS × host combinations.
    const mediaAt = BOOT_CSS.indexOf('@media (prefers-color-scheme: light)');
    expect(mediaAt).toBeGreaterThan(-1);
    const mediaRoot = BOOT_CSS.slice(mediaAt);
    expect(tokenValue(mediaRoot, ':root', '--mb-boot-body')).toBe(body);
    expect(tokenValue(mediaRoot, ':root', '--mb-boot-text')).toBe(text);
    expect(tokenValue(mediaRoot, ':root', '--mb-boot-surface')).toBe(surface);
  });

  // 🔴 The load-bearing structural claim, and the one a colour-by-colour check
  // cannot make: dark must be what "no information" MEANS. A light value reachable
  // without either the media query or an explicit ='light' attribute would make a
  // no-preference viewer boot light while every other layer of this app resolves
  // unknown to dark.
  it('no light value is reachable without an explicit light signal', () => {
    const lightBody = skinValue(SKIN_LIGHT, '--civitai-color-body');
    const darkBody = skinValue(SKIN_DARK, '--civitai-color-body');

    // Sanity: the two are actually different, or this test proves nothing.
    expect(lightBody).not.toBe(darkBody);

    expect(bootValue(':root', '--mb-boot-body')).toBe(darkBody);
    expect(bootValue(':root', '--mb-boot-body')).not.toBe(lightBody);

    // The ONLY places a light value may appear are the light media block and the
    // explicit ='light' attribute rule.
    const lightRegions = [
      BOOT_CSS.indexOf('@media (prefers-color-scheme: light)'),
      BOOT_CSS.indexOf(":root[data-civitai-boot-theme='light']"),
    ];
    expect(lightRegions.every((i) => i > -1)).toBe(true);

    // There must be NO `@media (prefers-color-scheme: dark)` block: one would
    // invert the default for `no-preference` and for any UA without the query.
    // Scoped to the STYLESHEET — the claim is about rules, not about the word
    // appearing in a comment.
    expect(BOOT_CSS).not.toContain('prefers-color-scheme: dark');
  });

  // 🔴 THESE FOUR EXIST BECAUSE A MUTANT SURVIVED WITHOUT THEM. The block above
  // asserts the `--mb-boot-*` custom properties, and flipping the `background`
  // DECLARATION on `:root[data-civitai-boot-theme='dark']` to white changed nothing
  // and no test failed. That declaration is not decoration: it paints the html
  // canvas, it is the layer beneath the skeleton, and it is the ONLY thing standing
  // between a dark-host/light-OS viewer and a white flash — precisely the
  // combination the attribute rules exist to handle.
  //
  // ⚠️ AND THE CANVAS IS WHERE THE SKIN STOPS. These rules follow the BOOT theme;
  // the skin sheet is scoped to `[data-mb-skin='true']` and cannot reach `html`, so
  // after BLOCK_INIT a host theme disagreeing with the boot guess leaves the canvas
  // on the boot guess. Visible only on overscroll, behind the app root, and not
  // fixed by anything in this file — said here so nobody reads these four cases as
  // a claim that it is.
  it('every html-canvas background matches its region', () => {
    const lightBody = skinValue(SKIN_LIGHT, '--civitai-color-body');
    const darkBody = skinValue(SKIN_DARK, '--civitai-color-body');

    // The unconditioned base `html` rule — the first one in the stylesheet.
    const baseHtml = BOOT_CSS.indexOf('html {');
    expect(baseHtml).toBeGreaterThan(-1);
    const baseBg = /background:\s*([^;]+);/.exec(BOOT_CSS.slice(baseHtml))?.[1].trim();
    expect(baseBg?.toLowerCase(), 'the base html canvas is not SKIN_DARK body').toBe(darkBody);

    // The `html` rule inside the light media block.
    const mediaAt = BOOT_CSS.indexOf('@media (prefers-color-scheme: light)');
    expect(mediaAt).toBeGreaterThan(-1);
    const mediaHtmlBg = /background:\s*([^;]+);/.exec(BOOT_CSS.slice(mediaAt))?.[1].trim();
    expect(mediaHtmlBg?.toLowerCase(), 'the light-OS html canvas is not SKIN_LIGHT body').toBe(
      lightBody,
    );

    // Both host-answer overrides.
    expect(bootValue(":root[data-civitai-boot-theme='dark']", 'background')).toBe(darkBody);
    expect(bootValue(":root[data-civitai-boot-theme='light']", 'background')).toBe(lightBody);
  });

  // `color-scheme` on the override blocks pins the UA's own form-control and
  // scrollbar rendering to the host's answer rather than the OS's — and the value
  // comes from the skin's own `scheme` field, which is what `skinCss()` emits as
  // `color-scheme` inside the app root. One authority, two places it is spelled.
  it('each host-answer override declares the matching color-scheme', () => {
    expect(bootValue(":root[data-civitai-boot-theme='dark']", 'color-scheme')).toBe(
      SKIN_DARK.scheme,
    );
    expect(bootValue(":root[data-civitai-boot-theme='light']", 'color-scheme')).toBe(
      SKIN_LIGHT.scheme,
    );
  });

  // The `color-scheme` meta drives the UA canvas, which paints before ANY of the
  // CSS above. `light dark` there would paint a no-preference viewer's canvas white
  // underneath a dark skeleton.
  it('the color-scheme meta lists dark first', () => {
    expect(INDEX_HTML).toContain('content="dark light"');
    expect(INDEX_HTML).not.toContain('content="light dark"');
  });
});
