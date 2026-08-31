// The per-viewer KV (`useAppStorage`) PAGING RULE, in one place.
//
// 🔴 WHY THIS FILE EXISTS — a predicate open-coded at N sites is typically wrong
// at N−1 of them, and this one was wrong at exactly one. The app had THREE
// `appStorage.list` call sites: the drafts load and `clearDraftPointerFor` each
// open-coded the same cursor loop, bound and prefix filter; the 🔴 MONEY SAFETY
// in-flight rehydrate open-coded NONE of it and read only the FIRST page. Two
// sites got it right, one never did, and nothing made the disagreement audible
// because there was no single place the rule lived. Route every site through
// `forEachStoredKey` so the next one cannot be written wrong.
//
// What it centralises, all three of which were duplicated before:
//   - following `nextCursor` until the host runs out of keys;
//   - a page BOUND, so a misbehaving host cannot spin this forever;
//   - the defensive `key.startsWith(prefix)` filter (the host or a fake may
//     over-return, and every call site had its own copy of this line).

import type { UseAppStorage } from '@civitai/blocks-react';

/**
 * Safety cap on pages per listing. Shared by every caller so the bound is one
 * decision rather than three.
 *
 * 🔴 TRUNCATION IS NOT UNIFORMLY HARMLESS — it means something different per
 * caller, and for one of them it is a MONEY decision. `forEachStoredKey`
 * therefore REPORTS whether it stopped early instead of swallowing it, and the
 * in-flight rehydrate in App.tsx acts on that report. See `ScanResult`.
 */
export const KV_MAX_PAGES = 20;

export interface ScanResult {
  /**
   * True when the scan stopped because it hit {@link KV_MAX_PAGES} while the
   * host still had more keys — i.e. the caller has seen an INCOMPLETE view.
   *
   * 🔴 Distinct from stopping early on purpose: a caller that returns `'stop'`
   * has found what it wanted and is NOT truncated.
   */
  truncated: boolean;
  /** Pages actually fetched (a positive control for tests: proves paging ran). */
  pages: number;
}

/**
 * Page every per-viewer key under `prefix`, calling `onKey` for each.
 *
 * Return `'stop'` from `onKey` to end the scan early (a found-what-I-wanted
 * exit, or a cancelled effect). Anything else continues.
 *
 * Errors are NOT caught here — every caller today wraps this in its own
 * best-effort `try`, and they do different things on failure, so swallowing it
 * centrally would flatten three deliberate behaviours into one.
 */
export async function forEachStoredKey(
  store: UseAppStorage,
  prefix: string,
  onKey: (key: string) => Promise<'stop' | void> | 'stop' | void,
): Promise<ScanResult> {
  let cursor: string | undefined;
  for (let page = 0; page < KV_MAX_PAGES; page += 1) {
    const res = await store.list({ prefix, cursor });
    for (const { key } of res.keys) {
      // Defensive: only trust keys under our prefix (a host or fake may
      // over-return). This used to be re-typed at every call site.
      if (!key.startsWith(prefix)) continue;
      if ((await onKey(key)) === 'stop') return { truncated: false, pages: page + 1 };
    }
    if (!res.nextCursor) return { truncated: false, pages: page + 1 };
    cursor = res.nextCursor;
  }
  // Fell out of the loop with a cursor still outstanding: the host had more.
  return { truncated: true, pages: KV_MAX_PAGES };
}
