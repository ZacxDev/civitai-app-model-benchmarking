// The boot-theme script in index.html DUPLICATES the SDK's `parseBlockInitFragment`
// on purpose — it has to run before the bundle that would carry the SDK. These
// tests are what keeps the duplicate honest: they extract the real script out of
// the real index.html, execute it, and feed it the SDK's OWN encoder output. A
// hand-written fixture would let both sides drift together; the encoder cannot.
//
// This is a `.tsx` so it lands in the jsdom project — the script writes to
// `document.documentElement` and reads `window.matchMedia`.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { encodeBlockInitFragment } from '@civitai/app-sdk/blocks';
import { afterEach, describe, expect, it, vi } from 'vitest';

// 🔴 `process.cwd()`, not `import.meta.url`: under the jsdom project `import.meta.url`
// is an http URL (jsdom's document base), so `new URL('../index.html', …)` is not a
// file URL and readFileSync rejects it. vitest runs from the config root.
const INDEX_HTML = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

/**
 * The inline `<script>` in <head> — the FIRST attribute-less script tag. The
 * module script in <body> carries `type="module"`, so `<script>` with no
 * attributes selects the boot script unambiguously.
 */
function bootScriptSource(): string {
  const m = /<script>([\s\S]*?)<\/script>/.exec(INDEX_HTML);
  if (!m) throw new Error('no inline boot script found in index.html');
  return m[1];
}

/** Run the real boot script against a given hash + OS preference. */
function runBootScript(hash: string, osPrefersLight = false): string | null {
  document.documentElement.removeAttribute('data-civitai-boot-theme');
  window.location.hash = hash;
  vi.stubGlobal('matchMedia', ((query: string) => ({
    matches: /prefers-color-scheme: light/.test(query) ? osPrefersLight : false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia);

  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function(bootScriptSource())();
  return document.documentElement.getAttribute('data-civitai-boot-theme');
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.location.hash = '';
  document.documentElement.removeAttribute('data-civitai-boot-theme');
});

describe('boot script vs the SDK encoder', () => {
  // 🔴 The POSITIVE CONTROL for this whole file: fed the SDK's own output, the
  // script must read the host's theme back. If this ever fails to move, every
  // "falls back to dark" assertion below is indistinguishable from a script that
  // is wired to nothing and always writes dark.
  it.each(['dark', 'light'] as const)('reads theme=%s out of an SDK-encoded fragment', (theme) => {
    const fragment = encodeBlockInitFragment({
      theme,
      renderMode: 'iframe',
      blockInstanceId: 'bi_abc',
    });
    // Encoded WITH the OS pointing the other way, so a pass cannot be the OS guess
    // agreeing by luck.
    expect(runBootScript(`#${fragment}`, theme === 'dark')).toBe(theme);
  });

  it('the host answer beats the OS preference in both directions', () => {
    const dark = encodeBlockInitFragment({
      theme: 'dark',
      renderMode: 'iframe',
      blockInstanceId: 'bi_1',
    });
    const light = encodeBlockInitFragment({
      theme: 'light',
      renderMode: 'iframe',
      blockInstanceId: 'bi_1',
    });
    expect(runBootScript(`#${dark}`, true)).toBe('dark'); // OS light, host dark
    expect(runBootScript(`#${light}`, false)).toBe('light'); // OS dark, host light
  });
});

describe('boot script fallbacks — unknown means DARK', () => {
  it.each([
    ['no fragment at all', ''],
    ["a block's own hash route", '#/grid?tab=combos'],
    ['a truncated fragment', '#civitai-block=v1&the'],
    ['a future version', '#civitai-block=v2&theme=light'],
    ['a missing marker', '#theme=light'],
    ['an invalid theme value', '#civitai-block=v1&theme=blue'],
  ])('falls back to the OS guess for %s', (_label, hash) => {
    expect(runBootScript(hash, false)).toBe('dark');
    // …and the OS guess itself is honoured when it says light.
    expect(runBootScript(hash, true)).toBe('light');
  });

  // 🔴 THIS TEST EXISTS BECAUSE A MUTANT SURVIVED WITHOUT IT. Flipping the script's
  // `var t = 'dark'` initializer to `'light'` changed nothing and no test failed —
  // correctly, because every non-throwing path REASSIGNS `t` before the write. The
  // initializer is defensive redundancy; the value that actually decides the
  // throwing case is the one in the `catch`, and nothing reached it. A UA whose
  // `matchMedia` throws (or a hardened embedder) takes exactly this path.
  it('resolves DARK when the OS query itself throws', () => {
    document.documentElement.removeAttribute('data-civitai-boot-theme');
    window.location.hash = '';
    vi.stubGlobal('matchMedia', (() => {
      throw new Error('matchMedia unavailable');
    }) as unknown as typeof window.matchMedia);

    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    new Function(bootScriptSource())();
    expect(document.documentElement.getAttribute('data-civitai-boot-theme')).toBe('dark');
  });

  it('no preference (and any UA without the query) lands on DARK', () => {
    // `osPrefersLight: false` models both `no-preference` and `prefers dark`:
    // the script asks the LIGHT question positively, so both answer the same way.
    expect(runBootScript('', false)).toBe('dark');
  });

  // 🔴 The precedence rule the reference implementation gets wrong if it uses an
  // unanchored test. `URLSearchParams.get` returns the FIRST key, so the SDK sees
  // `v2` here and refuses; a `/civitai-block=v1/.test(h)` would find the SECOND
  // marker and accept a theme the host never asked for.
  it('takes the FIRST marker key, matching the SDK, not any later valid one', () => {
    expect(runBootScript('#civitai-block=v2&civitai-block=v1&theme=light', false)).toBe('dark');
  });

  it('takes the FIRST theme key, matching the SDK', () => {
    expect(runBootScript('#civitai-block=v1&theme=blue&theme=light', false)).toBe('dark');
  });
});
