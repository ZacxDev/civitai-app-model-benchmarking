// The two halves of `bootSkeleton: true` that can each fail silently:
//
//  1. THE SKELETON EXISTS AND IS INSIDE #root. With the manifest key set, the host
//     stands down its veil — so an EMPTY `#root` means the viewer stares at a blank
//     iframe for the whole load, strictly worse than not opting in. A skeleton
//     painted as a SIBLING of #root is never replaced and stays on screen forever.
//  2. REACT REMOVES IT. `createRoot(container).render(...)` clears the container's
//     children before its first commit, which is why no cleanup code exists. That
//     is a react-dom behaviour, not a law — it does NOT hold for frameworks that
//     append (Svelte's `mount`, and this org's own panorama-360, which does
//     `root.appendChild`). Pinned here so a react-dom bump cannot strand it.
//
// …plus the pre-`ready` paint, which is what makes the whole thing worth doing.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { App } from './App.js';
import { bootThemeGuess, paintTheme } from './bootTheme.js';

// 🔴 `process.cwd()`, not `import.meta.url`: under the jsdom project `import.meta.url`
// is an http URL (jsdom's document base), so `new URL('../index.html', …)` is not a
// file URL and readFileSync rejects it. vitest runs from the config root.
const INDEX_HTML = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

/** The literal `#root` subtree as index.html ships it. */
function rootInnerHtml(): string {
  const m = /<div id="root">([\s\S]*?)<\/div>\s*<script type="module"/.exec(INDEX_HTML);
  if (!m) throw new Error('could not extract #root from index.html');
  return m[1];
}

afterEach(() => {
  document.documentElement.removeAttribute('data-civitai-boot-theme');
});

describe('the shipped index.html', () => {
  it('puts a non-empty boot skeleton INSIDE #root', () => {
    const host = document.createElement('div');
    host.innerHTML = rootInnerHtml();

    // 🔴 Emptiness is what the platform gate keys on, and a container holding only
    // an inert node still reads as "non-empty" to a naive check — a `<script>`'s
    // source IS a text node. Strip inert subtrees before testing.
    host.querySelectorAll('script, style, template').forEach((n) => n.remove());
    expect(host.textContent?.trim() ?? '').toBe(''); // no copy to translate…
    expect(host.children.length).toBeGreaterThan(0); // …but real painted boxes

    const marker = host.querySelector('[data-boot-skeleton]');
    expect(marker).not.toBeNull();
    expect(marker!.getAttribute('aria-hidden')).toBe('true');
  });

  // 🔴 PARSED, not grepped. A substring check for `data-boot-skeleton` outside the
  // #root region is WALKABLE and passes for the wrong reason in one direction and
  // fails for the wrong reason in the other: the inline <style> in <head> mentions
  // `[data-boot-skeleton]` as a SELECTOR, which is legitimate and is not an element.
  // The invariant is about element PLACEMENT — a skeleton mounted as a sibling of
  // #root is never replaced by React's render and stays on screen after mount — so
  // it has to be asserted against a DOM.
  it('has every [data-boot-skeleton] ELEMENT inside #root', () => {
    const doc = new DOMParser().parseFromString(INDEX_HTML, 'text/html');
    const root = doc.querySelector('#root');
    expect(root).not.toBeNull();

    const marked = [...doc.querySelectorAll('[data-boot-skeleton]')];
    expect(marked.length).toBeGreaterThan(0); // positive control: the query CAN match
    for (const el of marked) expect(root!.contains(el)).toBe(true);
  });
});

describe('react-dom removes the boot skeleton', () => {
  // Mounts through the REAL react-dom the app ships, seeded with the REAL markup
  // from index.html. What this pins is react-dom's container-clearing behaviour —
  // the thing that could change under a bump. It does not depend on what <App>
  // renders, which is why a minimal component is mounted rather than the whole App
  // and its SDK mock host.
  it('clears the seeded children before its first commit', async () => {
    const container = document.createElement('div');
    container.id = 'root';
    container.innerHTML = rootInnerHtml();
    document.body.appendChild(container);

    expect(container.querySelector('[data-boot-skeleton]')).not.toBeNull();

    await act(async () => {
      createRoot(container).render(<p data-testid="mounted">app</p>);
    });

    expect(container.querySelector('[data-boot-skeleton]')).toBeNull();
    expect(container.querySelector('[data-testid="mounted"]')).not.toBeNull();
    document.body.removeChild(container);
  });
});

describe('the pre-ready paint agrees with the skeleton', () => {
  // 🔴 THE POINT OF THE WHOLE CHANGE. Rendered with no host (no BLOCK_INIT), the
  // SDK's snapshot reports `ready: false` and the hardcoded sentinel
  // `theme: 'light'`. Stamping that sentinel would repaint the dark boot skeleton
  // light and then dark again ~100ms later — a flash INTRODUCED by standing the
  // host's veil down.
  it('paints DARK before ready, not the SDK sentinel', () => {
    render(<App />);
    const root = screen.getByTestId('app-loading').closest('[data-theme]');
    expect(root).not.toBeNull();
    expect(root!.getAttribute('data-theme')).toBe('dark');
  });

  it('honours a light host answer recorded by the boot script', () => {
    document.documentElement.setAttribute('data-civitai-boot-theme', 'light');
    render(<App />);
    const root = screen.getByTestId('app-loading').closest('[data-theme]');
    expect(root!.getAttribute('data-theme')).toBe('light');
  });
});

describe('bootTheme helpers', () => {
  it('reads the attribute back rather than re-deriving it', () => {
    document.documentElement.setAttribute('data-civitai-boot-theme', 'light');
    expect(bootThemeGuess()).toBe('light');
    document.documentElement.setAttribute('data-civitai-boot-theme', 'dark');
    expect(bootThemeGuess()).toBe('dark');
  });

  it('resolves an absent or junk attribute to dark', () => {
    expect(bootThemeGuess()).toBe('dark');
    document.documentElement.setAttribute('data-civitai-boot-theme', 'chartreuse');
    expect(bootThemeGuess()).toBe('dark');
  });

  // After BLOCK_INIT the host is authoritative and wins outright — the helper must
  // not keep painting the boot guess once the real answer has arrived.
  it('hands over to the host theme once ready', () => {
    document.documentElement.setAttribute('data-civitai-boot-theme', 'dark');
    expect(paintTheme(true, 'light')).toBe('light');
    expect(paintTheme(false, 'light')).toBe('dark');
  });
});
