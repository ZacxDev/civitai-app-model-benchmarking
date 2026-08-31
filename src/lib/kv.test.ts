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

import type { UseAppStorage } from '@civitai/blocks-react';

import { KV_MAX_PAGES, forEachStoredKey } from './kv.js';

/**
 * A minimal paging store: `keys` served `pageSize` at a time, cursor = the last
 * key of the page (the SDK documents it as an opaque base64 last-key).
 */
function store(keys: string[], pageSize: number): UseAppStorage & { listCalls: number } {
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
      const more = last !== undefined && all.indexOf(last) < all.length - 1;
      return {
        keys: page.map((key) => ({ key, updatedAt: new Date() })),
        ...(more ? { nextCursor: btoa(last) } : {}),
      };
    },
  };
  return api as unknown as UseAppStorage & { listCalls: number };
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

  it('a scan that exactly exhausts the keys on its last allowed page is NOT truncated', async () => {
    // The boundary the two branches meet at: budget spent, but nothing left
    // behind. Chosen deliberately over a round multiple — a fixture that can
    // only land mid-range cannot see an off-by-one at the edge.
    const res = await forEachStoredKey(store(kv(KV_MAX_PAGES), 1), 'p:', () => {});
    expect(res.truncated).toBe(false);
    expect(res.pages).toBe(KV_MAX_PAGES);
  });
});
