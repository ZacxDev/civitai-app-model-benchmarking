/**
 * The theme to PAINT WITH before `ready`.
 *
 * 🔴 WHY THIS EXISTS AT ALL. `useBlockContext().theme` is a SENTINEL before
 * `ready`, not a signal: the SDK's pre-init snapshot hardcodes `theme: 'light'`
 * (@civitai/blocks-react `dist/internal/transport.js`, EMPTY_SNAPSHOT) and the hook
 * returns it unchanged, so its value is indistinguishable from a host that really
 * is light. Painting with it makes every viewer light until BLOCK_INIT lands — and
 * because index.html's boot skeleton is dark, that is dark → light → dark, a NEW
 * flash introduced at exactly the moment `bootSkeleton: true` stands the host's
 * veil down. Never branch on `theme` in a `!ready` path; use this instead.
 *
 * 🔴 IT READS BACK, IT DOES NOT RE-DERIVE. The inline script in index.html already
 * resolved this question before first paint and recorded its answer on
 * `<html data-civitai-boot-theme>`. Reading that attribute is what guarantees the
 * React commit and the already-painted skeleton agree; re-running the same logic
 * here would only make them agree by coincidence, and would drift the moment one
 * copy changed. The fallbacks below exist for the paths where the attribute is
 * genuinely absent (a test mounting <App> directly, or the one-line `catch` in
 * index.html where `setAttribute` threw), and they resolve the same way the
 * unattributed CSS does.
 *
 * Unknown means DARK, here and in index.html and in `<meta name="color-scheme">`.
 */
export type BootTheme = 'dark' | 'light';

export function bootThemeGuess(): BootTheme {
  try {
    const recorded = document.documentElement.getAttribute('data-civitai-boot-theme');
    if (recorded === 'dark' || recorded === 'light') return recorded;
    // The OS guess, asked the same way round as index.html: LIGHT is the positive
    // case, so `no-preference` and any UA without the query land on dark.
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
  } catch {
    // fall through
  }
  return 'dark';
}

/**
 * The value to stamp on the app root's `data-theme`.
 *
 * After `ready` the HOST's theme is authoritative and wins outright — this helper
 * exists only to keep the pre-`ready` commit off the sentinel.
 */
export function paintTheme(ready: boolean, hostTheme: string | undefined): string {
  return ready && hostTheme ? hostTheme : bootThemeGuess();
}
