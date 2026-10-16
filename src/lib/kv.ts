// The per-viewer KV (`useKvStore` — the document store's private `kv`
// collection since 0.5.0, `lib/kv-store.ts`) PAGING RULE, in one place.
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

import { KV_LIST_LIMIT_MAX, type KvStore } from './kv-store.js';

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
  /**
   * Pages actually fetched. A positive control on the walk itself — `kv.test.ts`
   * asserts it to prove a scan really paged, and to pin the boundary where a
   * scan spends its whole budget without leaving anything behind.
   */
  pages: number;
}

/**
 * Page every per-viewer key under `prefix`, calling `onKey` for each with the
 * key AND ITS STORED VALUE.
 *
 * 🔴 THE VALUE COMES WITH THE PAGE, AND THAT IS A RATE-LIMIT DECISION (PR #85, F2).
 * A document-store list page carries every document's data, so the value is read
 * here for free. Every caller used to `store.get(key)` per key instead — one READ
 * per stored record on top of the list calls — against the store's 300 reads/min
 * per (app, viewer). A viewer with a few hundred private records then tripped
 * `rate_limited` on a single page load, and a scan that throws reads as "could
 * not read your private items" at the grid-publish boundary. Now a scan costs one
 * read per page of up to {@link KV_LIST_LIMIT_MAX} keys, and NOTHING per key.
 *
 * 🔴 AND IT ASKS FOR THE LARGEST PAGE. With no `limit` the store's default page is
 * 25, which made the {@link KV_MAX_PAGES} bound a 500-key ceiling (half the legacy
 * scan's 1,000) and four times the reads. `limit: 100` is the store's own maximum
 * (`listLimitMax`), so the bound is 2,000 keys — above the 1,000-document per-viewer
 * quota, i.e. a scan cannot truncate on a viewer who is within quota.
 *
 * Return `'stop'` from `onKey` to end the scan early (a found-what-I-wanted
 * exit, or a cancelled effect). Anything else continues.
 *
 * Errors are NOT caught here — every caller today wraps this in its own
 * best-effort `try`, and they do different things on failure, so swallowing it
 * centrally would flatten three deliberate behaviours into one.
 */
export async function forEachStoredKey(
  store: KvStore,
  prefix: string,
  onKey: (key: string, value: unknown) => Promise<'stop' | void> | 'stop' | void,
  opts: {
    /**
     * Checked BEFORE each page is fetched, so a cancelled effect can stop
     * without issuing another `list`.
     *
     * 🔴 SCOPE, STATED NARROWLY, because an earlier version of this docstring
     * was wrong on two axes and a reader believing it could have deleted the
     * per-key `cancelled` checks in the callbacks. It claimed "the callers' old
     * open-coded loops each had this check": of the two pre-consolidation loops,
     * ONE did (the drafts load) and one did NOT (`clearDraftPointerFor`). And it
     * implied the callbacks would otherwise page on, which they would not —
     * both `onKey` callbacks already return `'stop'` on `cancelled` right after
     * their awaited `get`, so a cancelled scan stops at the first key of the
     * next page regardless.
     *
     * What this option actually buys: it saves ONE `list` call in the narrow
     * case where a page yields no `onKey` call at all — an empty page that
     * still carries a cursor, or one whose keys are all prefix-filtered. Real,
     * cheap, and much smaller than "stops an unmounted effect paging on".
     *
     * A stop here is NOT truncation: the caller chose to stop, it did not run
     * out of budget. Reporting it as truncated would arm the money backstop on
     * every cancelled effect.
     */
    shouldStop?: () => boolean;
  } = {},
): Promise<ScanResult> {
  let cursor: string | undefined;
  for (let page = 0; page < KV_MAX_PAGES; page += 1) {
    if (opts.shouldStop?.()) return { truncated: false, pages: page };
    const res = await store.list({ prefix, cursor, limit: KV_LIST_LIMIT_MAX });
    for (const { key, value } of res.keys) {
      // Defensive: only trust keys under our prefix (a host or fake may
      // over-return). This used to be re-typed at every call site.
      if (!key.startsWith(prefix)) continue;
      if ((await onKey(key, value)) === 'stop') return { truncated: false, pages: page + 1 };
    }
    if (!res.nextCursor) return { truncated: false, pages: page + 1 };
    cursor = res.nextCursor;
  }
  // Fell out of the loop with a cursor still outstanding: the host had more.
  return { truncated: true, pages: KV_MAX_PAGES };
}
