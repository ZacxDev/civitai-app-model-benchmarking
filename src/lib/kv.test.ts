// Unit pins for the per-viewer KV paging rule. Pure — no React, no jsdom.
//
// 🔴 WHY `truncated` HAS ITS OWN TESTS. It is not a diagnostic: `confirmRun`
// branches on it to decide whether to pay for a store read before SPENDING. Three
// mutants used to survive the whole 240-test suite — reporting a COMPLETE scan as
// truncated, reporting an early `'stop'` as truncated, and ignoring the flag at
// the call site — because nothing anywhere distinguished "gated" from
// "unconditional". Over-reporting costs a needless round-trip on every spend;
// under-reporting is the money bug. Both directions are pinned here.

import { describe, expect, it } from 'vitest';

import type { KvStore } from './kv-store.js';

import { hasMore } from '../dev-rest.js';

import { KV_MAX_PAGES, forEachStoredKey } from './kv.js';

/**
 * A minimal paging store: `keys` served `pageSize` at a time, cursor = the last
 * key of the page (the SDK documents it as an opaque base64 last-key).
 */
function store(keys: string[], pageSize: number): KvStore & { listCalls: number } {
  const api = {
    listCalls: 0,
    async get() {
      return null;
    },
    async set() {
      return { ok: true as const };
    },
    async delete() {
      return { ok: true as const, deleted: false };
    },
    async getQuota() {
      return { usedBytes: 0, rowCount: keys.length, limitBytes: 1, limitRows: 1 };
    },
    async list(opts?: { prefix?: string; cursor?: string }) {
      api.listCalls += 1;
      const all = keys.filter((k) => !opts?.prefix || k.startsWith(opts.prefix));
      const from = opts?.cursor ? all.indexOf(atob(opts.cursor)) + 1 : 0;
      const page = all.slice(from, from + pageSize);
      const last = page[page.length - 1];
      // 🔴 THE STORE'S RULE, FROM THE ONE PLACE THAT STATES IT. `hasMore` is
      // `dev-rest.ts`'s, shared by every paging fake in the repo. The DOCUMENT STORE
      // reads `limit + 1` and emits a cursor exactly when another row exists — unlike
      // the legacy KV route, which emitted one whenever a page came back FULL. This
      // fake used the legacy rule until the 0.5.0 port; the two cases at the bottom
      // of this file are the boundary where the rules differ.
      const more = last !== undefined && hasMore(all.length - from, pageSize);
      return {
        keys: page.map((key) => ({ key, updatedAt: new Date() })),
        ...(more ? { nextCursor: btoa(last) } : {}),
      };
    },
  };
  return api as unknown as KvStore & { listCalls: number };
}

const kv = (n: number): string[] => Array.from({ length: n }, (_, i) => `p:${i}`);

describe('forEachStoredKey — what it visits', () => {
  it('walks every key across pages, in order', async () => {
    const seen: string[] = [];
    const res = await forEachStoredKey(store(kv(5), 2), 'p:', (k) => {
      seen.push(k);
    });
    expect(seen).toEqual(['p:0', 'p:1', 'p:2', 'p:3', 'p:4']);
    expect(res.pages).toBe(3);
  });

  it('drops keys the host returns outside the prefix', async () => {
    // The defensive filter every call site used to re-type by hand.
    const seen: string[] = [];
    await forEachStoredKey(store(['p:0', 'other:1', 'p:2'], 10), 'p:', (k) => {
      seen.push(k);
    });
    expect(seen).toEqual(['p:0', 'p:2']);
  });
});

describe('forEachStoredKey — `shouldStop` (new payload, so it is pinned both ways)', () => {
  it('stops BEFORE fetching the next page', async () => {
    // 🔴 Mutant "delete the check so the option is inert" survived the whole
    // suite. The saving is narrow — one `list` in the case where a page yields
    // no `onKey` call — but narrow is not the same as unobservable, and unpinned
    // new payload is how the next defect gets in.
    const s = store(kv(10), 2);
    let pages = 0;
    await forEachStoredKey(s, 'p:', () => {}, {
      shouldStop: () => {
        pages += 1;
        return pages > 2; // allow two pages, then cancel
      },
    });
    expect(s.listCalls).toBe(2);
  });

  it('a `shouldStop` exit is NOT truncation', async () => {
    // 🔴 The caller CHOSE to stop; it did not run out of budget. Reporting this
    // as truncated would arm the money backstop on every cancelled effect —
    // the mutant that returns `truncated: true` here also survived.
    const res = await forEachStoredKey(store(kv(50), 2), 'p:', () => {}, {
      shouldStop: () => true,
    });
    expect(res.truncated).toBe(false);
    expect(res.pages).toBe(0);
  });

  it('is inert when not supplied — the default must not stop anything', async () => {
    const seen: string[] = [];
    await forEachStoredKey(store(kv(5), 2), 'p:', (k) => {
      seen.push(k);
    });
    expect(seen).toHaveLength(5);
  });
});

describe('forEachStoredKey — `truncated` is a MONEY signal, so it is pinned both ways', () => {
  it('a scan that reached the end reports truncated: FALSE', async () => {
    // 🔴 Over-reporting is not free: `confirmRun` would then pay a store read
    // before every spend, forever. This is the mutant "complete scan reports
    // truncated: true", which survived the full suite.
    const res = await forEachStoredKey(store(kv(5), 2), 'p:', () => {});
    expect(res.truncated).toBe(false);
  });

  it('a scan that ended on an early `stop` reports truncated: FALSE', async () => {
    // 🔴 An early stop is "I found what I wanted", NOT "I could not see
    // everything". Conflating them arms the backstop on every successful
    // pointer lookup. Second surviving mutant.
    let seen = 0;
    const res = await forEachStoredKey(store(kv(50), 2), 'p:', () => {
      seen += 1;
      return 'stop';
    });
    expect(res.truncated).toBe(false);
    expect(seen).toBe(1);
  });

  it('🔴 a scan still holding a cursor at the page cap reports truncated: TRUE', async () => {
    // The under-reporting direction — the one that lets a spend through.
    // One key per page, more keys than the cap, so the walk runs out of budget
    // with the host still offering more.
    const s = store(kv(KV_MAX_PAGES + 5), 1);
    const res = await forEachStoredKey(s, 'p:', () => {});
    expect(res.truncated).toBe(true);
    expect(res.pages).toBe(KV_MAX_PAGES);
    // …and it really did stop at the bound rather than walking on.
    expect(s.listCalls).toBe(KV_MAX_PAGES);
  });

  it('a scan whose LAST ALLOWED page holds the last key is NOT truncated (document-store cursor rule)', async () => {
    // 🔴 THIS CASE FLIPPED WITH THE DOCUMENT-STORE PORT, AND THE FLIP IS THE STORE'S,
    // NOT `forEachStoredKey`'s. `KV_MAX_PAGES` keys at one per page puts the last key
    // on the last allowed page. The LEGACY KV route emitted a cursor for any FULL page
    // (it had not read row `limit + 1`), so the walk fell out of its loop still holding
    // one and reported `truncated: true` — the conservative answer to "may there be
    // more?". The document store reads `limit + 1` and answers `nextCursor: null`
    // exactly on the last page, so there is no "may": this walk saw every key, and
    // reporting it truncated would only make `confirmRun` pay a needless read before
    // every spend. The under-reporting direction stays pinned by the case above
    // (more keys than the cap → `truncated: true`).
    const res = await forEachStoredKey(store(kv(KV_MAX_PAGES), 1), 'p:', () => {});
    expect(res.truncated).toBe(false);
    expect(res.pages).toBe(KV_MAX_PAGES);
  });

  it('one key PAST the cap is truncated — the boundary, from the other side', async () => {
    // ⚠ The bound OVERSHOOTS by exactly one (`KV_MAX_PAGES + 1` keys at one per page):
    // the 20th page then carries a cursor for the single key the walk never reached,
    // which is the smallest store that can hide an in-flight run from the scan.
    const s = store(kv(KV_MAX_PAGES + 1), 1);
    const res = await forEachStoredKey(s, 'p:', () => {});
    expect(res.truncated).toBe(true);
    expect(res.pages).toBe(KV_MAX_PAGES);
    expect(s.listCalls).toBe(KV_MAX_PAGES);
  });

  it('a scan that ends BEFORE the cap is NOT truncated', async () => {
    const res = await forEachStoredKey(store(kv(KV_MAX_PAGES - 1), 1), 'p:', () => {});
    expect(res.truncated).toBe(false);
    expect(res.pages).toBe(KV_MAX_PAGES - 1);
  });
});
