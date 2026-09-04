// The inline boot styles in index.html hardcode colour literals. Everything else
// in this app is `var(--civitai-*)` with zero hardcoded colour (src/theme.ts), and
// that is deliberate — but the boot window is the one place a var is unusable,
// because `@civitai/theme/styles.css` is a render-blocking <link> that has not
// loaded yet. These tests are what stop that necessary duplication from drifting:
// every literal is asserted against the INSTALLED @civitai/theme package, per
// region, so a theme bump that moves a value fails here instead of shipping a
// colour jump at handoff.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const INDEX_HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const THEME_CSS = readFileSync(
  createRequire(import.meta.url).resolve('@civitai/theme/styles.css'),
  'utf8',
);

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

// The four regions that must agree, and WHY each exists:
//   :root                                     → the unconditioned base (dark-only)
//   @media (prefers-color-scheme: light)       → the OS guess
//   :root[data-civitai-boot-theme='dark']      → the host's answer, dark
//   :root[data-civitai-boot-theme='light']     → the host's answer, light
// Dropping any one of them is a repaint at BLOCK_INIT in one of the four
// OS × host combinations, which is the flash this whole change removes.
describe('boot token parity with @civitai/theme', () => {
  it('the DARK literals match the package [data-theme=dark] block', () => {
    const body = tokenValue(THEME_CSS, "[data-theme='dark']", '--civitai-color-body');
    const text = tokenValue(THEME_CSS, "[data-theme='dark']", '--civitai-color-text');
    const surface = tokenValue(THEME_CSS, "[data-theme='dark']", '--civitai-color-surface');

    // The unconditioned base…
    expect(bootValue(':root', '--mb-boot-body')).toBe(body);
    expect(bootValue(':root', '--mb-boot-text')).toBe(text);
    expect(bootValue(':root', '--mb-boot-surface')).toBe(surface);

    // …and the host-answered dark override, which must be the SAME literals.
    expect(bootValue(":root[data-civitai-boot-theme='dark']", '--mb-boot-body')).toBe(body);
    expect(bootValue(":root[data-civitai-boot-theme='dark']", '--mb-boot-text')).toBe(text);
    expect(bootValue(":root[data-civitai-boot-theme='dark']", '--mb-boot-surface')).toBe(surface);
  });

  it('the LIGHT literals match the package :root block', () => {
    const body = tokenValue(THEME_CSS, ':root', '--civitai-color-body');
    const text = tokenValue(THEME_CSS, ':root', '--civitai-color-text');
    const surface = tokenValue(THEME_CSS, ':root', '--civitai-color-surface');

    expect(bootValue(":root[data-civitai-boot-theme='light']", '--mb-boot-body')).toBe(body);
    expect(bootValue(":root[data-civitai-boot-theme='light']", '--mb-boot-text')).toBe(text);
    expect(bootValue(":root[data-civitai-boot-theme='light']", '--mb-boot-surface')).toBe(surface);
  });

  // 🔴 The load-bearing structural claim, and the one a colour-by-colour check
  // cannot make: dark must be what "no information" MEANS. A light value reachable
  // without either the media query or an explicit ='light' attribute would make a
  // no-preference viewer boot light while every other layer of this app resolves
  // unknown to dark.
  it('no light value is reachable without an explicit light signal', () => {
    const lightBody = tokenValue(THEME_CSS, ':root', '--civitai-color-body');
    const darkBody = tokenValue(THEME_CSS, "[data-theme='dark']", '--civitai-color-body');

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
  it('every html-canvas background matches its region', () => {
    const lightBody = tokenValue(THEME_CSS, ':root', '--civitai-color-body');
    const darkBody = tokenValue(THEME_CSS, "[data-theme='dark']", '--civitai-color-body');

    // The unconditioned base `html` rule — the first one in the stylesheet.
    const baseHtml = BOOT_CSS.indexOf('html {');
    expect(baseHtml).toBeGreaterThan(-1);
    const baseBg = /background:\s*([^;]+);/.exec(BOOT_CSS.slice(baseHtml))?.[1].trim();
    expect(baseBg?.toLowerCase()).toBe(darkBody);

    // The `html` rule inside the light media block.
    const mediaAt = BOOT_CSS.indexOf('@media (prefers-color-scheme: light)');
    expect(mediaAt).toBeGreaterThan(-1);
    const mediaHtmlBg = /background:\s*([^;]+);/.exec(BOOT_CSS.slice(mediaAt))?.[1].trim();
    expect(mediaHtmlBg?.toLowerCase()).toBe(lightBody);

    // Both host-answer overrides.
    expect(bootValue(":root[data-civitai-boot-theme='dark']", 'background')).toBe(darkBody);
    expect(bootValue(":root[data-civitai-boot-theme='light']", 'background')).toBe(lightBody);
  });

  // `color-scheme` on the override blocks pins the UA's own form-control and
  // scrollbar rendering to the host's answer rather than the OS's.
  it('each host-answer override declares the matching color-scheme', () => {
    expect(bootValue(":root[data-civitai-boot-theme='dark']", 'color-scheme')).toBe('dark');
    expect(bootValue(":root[data-civitai-boot-theme='light']", 'color-scheme')).toBe('light');
  });

  // The `color-scheme` meta drives the UA canvas, which paints before ANY of the
  // CSS above. `light dark` there would paint a no-preference viewer's canvas white
  // underneath a dark skeleton.
  it('the color-scheme meta lists dark first', () => {
    expect(INDEX_HTML).toContain('content="dark light"');
    expect(INDEX_HTML).not.toContain('content="light dark"');
  });
});
