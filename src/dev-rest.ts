// An in-memory stand-in for the REST families this app reaches: the App Blocks
// DOCUMENT STORE (`/api/v1/blocks/storage/*` — the private `kv` and shared `records`
// collections) and the Buzz balance. Used by the dev harness (`main.tsx`) and by the
// tests that seed those stores through `src/test-harness.tsx`.
//
// 🔴 WHY THIS IS A `fetch` FAKE AND NOT A MOCK HOST, which is the whole point. These
// families are HTTP, not postMessage, so a transport-level fake would "answer a
// conversation nobody is having" — the suite would pass while exercising none of the
// code that now carries the traffic. The app's real boundary for them is `fetch`, so
// the fake belongs there, and the app's REAL clients (`initialize()`'s
// `app.storage.collection(…)`) are what talk to it.
//
// 🔴 THE DOCUMENT STORE IS ANSWERED BY THE SDK's OWN CONTRACT FAKE, NOT RE-IMPLEMENTED
// HERE. `createFakeStorage` (`@civitai/sdk/testing`) is the server half of the store —
// this repo's `block.manifest.json` declarations, scopes and consent, the `own` write
// policy (`not_author`), marks and `viewer.marks`, the min-trust gate, key rules, the
// list `limit` ceiling (1–100) and its exact-rule cursors, size and quota ceilings
// (413), rate limits (429, opt-in) and the error envelope — and the SDK runs the
// platform's own storage contract against it. This file only converts between `fetch`
// and its `Http` seam, maps this repo's numeric test viewer ids onto its viewers, and
// adds the one server behaviour it does not model: a moderator-HIDDEN document, which
// reads as not found (see `RestSharedSeed.hidden`).
//
// The Buzz balance route is still hand-modelled: one bare `{ blue, green, yellow }`.

import type { SharedStorageValue } from '@civitai/app-sdk/blocks';
import { ApiError } from '@civitai/sdk';
import {
  createFakeStorage,
  type FakeStorage,
  type FakeStorageOptions,
  type FakeStorageViewer,
} from '@civitai/sdk/testing';

import manifest from '../block.manifest.json';
import { createKvStorage } from './lib/kv-store.js';
import { RECORDS_COLLECTION, VOTE_MARK } from './lib/records-store.js';

/** The viewer's per-pool balance, as `GET blocks/buzz` returns it. */
export interface RestBuzzPools {
  blue: number;
  green: number;
  yellow: number;
}

/** One seeded `records` document. */
export interface RestSharedSeed {
  /** The document's data — the legacy shared value, verbatim. */
  value: SharedStorageValue;
  /**
   * WHICH FAKE USER WROTE IT. Defaults to the configured viewer, i.e. "the viewer
   * wrote this". A fixture-side identity only: the store never discloses it, and the
   * app learns nothing but `author.isViewer`.
   */
  authorUserId?: number;
  /** Fake user ids holding a `vote` mark. The row's `marks.vote` is this list's length. */
  voters?: number[];
  /** Pin the document's key instead of minting one. */
  key?: string;
  /**
   * A moderator HID it. The server then answers every read of it — `get`, `list`,
   * a mark — as if it did not exist (`not_found`, or absent from the page). The SDK
   * fake does not model moderator hides, so this file does.
   */
  hidden?: boolean;
}

export interface RestFakeOptions {
  /**
   * The signed-in viewer's id — who the app's requests are made AS. `<= 0` (the test
   * harness passes `-1`) is an ANONYMOUS viewer: the store refuses them every private
   * call (`sign_in_required`) and every shared write, and serves shared reads.
   */
  viewerUserId?: number;
  /** The viewer's private `kv` collection. */
  storage?: {
    /** Legacy-shaped seed (key → the value the app stores), written through `lib/kv-store.ts`. */
    seed?: Record<string, unknown>;
    /** The viewer's byte ceiling (`limits.viewerBytes`). */
    limitBytes?: number;
    /** The viewer's document ceiling (`limits.viewerDocs`). */
    limitRows?: number;
    /**
     * The page size the store applies to a `kv` list that names no `limit` — the
     * server's own default is 25. Smaller values make a fixture span pages.
     */
    pageSize?: number;
  };
  /** The shared `records` collection, seeded in the order given. */
  shared?: { seed?: RestSharedSeed[] };
  /** Passed straight to `createFakeStorage`: consent, rate limits, clock, trust, … */
  docStore?: Pick<FakeStorageOptions, 'consent' | 'enforceRateLimits' | 'now' | 'disabled' | 'moderate'> & {
    /** The viewer fails the min-trust gate on shared writes (`not_eligible`). */
    untrusted?: boolean;
  };
  /**
   * The viewer's per-pool balance. Omit for {@link DEFAULT_BUZZ_BALANCE}; pass
   * `null` to make the balance route REFUSE (403), which is how a missing
   * `buzz:read:self` grant or an anonymous viewer reads.
   *
   * 🔴 A FUNCTION IS ACCEPTED, and that is not a convenience: `buzzBalance.test.tsx`
   * needs a read that FAILS on mount and SUCCEEDS on the viewer's retry press. A plain
   * value is snapshotted at construction and cannot express it.
   */
  buzz?: RestBuzzPools | null | (() => RestBuzzPools | null);
  /**
   * Called for every request this fake answers — the observation seam a test needs
   * now that these families are HTTP. `path` is relative to `/api/v1/`.
   */
  onRequest?: (call: { path: string; method: string; body: Record<string, unknown> }) => void;
}

/**
 * Whether a list page should carry a cursor, under the DOCUMENT STORE's rule.
 *
 * 🔴 EXPORTED, AND EVERY HAND-ROLLED PAGING FAKE IN THE REPO MUST USE IT —
 * `test-helpers.tsx`'s `fakeAppStorage` and `lib/kv.test.ts`'s `store`. Several
 * copies of one predicate is several chances to be wrong in the same direction.
 *
 * 🔴 THE RULE CHANGED WITH THE PORT. The legacy routes emitted a cursor whenever a
 * page came back FULL (`rows.length === limit`), because they never read row
 * `limit + 1`. The document store reads `limit + 1` (`doc-store.ts`'s list SQL) and
 * emits a cursor EXACTLY when another row exists — `nextCursor` is `null` exactly on
 * the last page, and the SDK fake (`ordered.length > limit`) agrees. So "a full final
 * page" is no longer "there may be more": it is a complete read, and `forEachStoredKey`
 * reports it untruncated. Pass the number of matching rows from the cursor ON —
 * including this page's.
 */
export const hasMore = (matchingFromCursor: number, limit: number): boolean =>
  matchingFromCursor > limit;

/**
 * The balance reported when none is seeded.
 *
 * 🔴 COPIED FROM THE MOCK HOST ON PURPOSE (`@civitai/blocks-react`'s own default
 * balance), because this fake INHERITS the job of answering the tests that never
 * seeded one. Defaulting to zeros instead would make every un-seeded case read as a
 * viewer who cannot afford anything, and this app DISABLES Confirm when the balance
 * is below the estimate.
 */
const DEFAULT_BUZZ_BALANCE: RestBuzzPools = { blue: 1000, green: 0, yellow: 5000 };

/** Crockford base32, the ULID alphabet. */
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * A 26-character ULID-SHAPED key for a seed, derived from a counter.
 *
 * Not a real ULID — not time-ordered, no entropy — and it does not pretend to be.
 * What matters at this seam is that it looks nothing like an index, so a test cannot
 * accidentally hard-code `shared_2` and pass. Documents the APP creates get the SDK
 * fake's own server-minted keys.
 */
function mintKey(n: number): string {
  let rest = n;
  const tail: string[] = [];
  for (let i = 0; i < 26; i += 1) {
    tail.push(CROCKFORD[rest % 32] as string);
    rest = Math.floor(rest / 32) + 7;
  }
  return tail.reverse().join('');
}

/** This repo's numeric test viewer id → the SDK fake's viewer. `<= 0` is anonymous. */
export function fakeViewer(id: number, untrusted = false): FakeStorageViewer | null {
  if (id <= 0) return null;
  return { username: `user${id}`, id, ...(untrusted ? { trusted: false } : {}) };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** The store's `not_found` envelope, exactly as the SDK fake shapes every refusal. */
function notFound(): Response {
  const message = 'document not found';
  return json({ code: 'not_found', message, error: message }, 404);
}

/** `blocks/storage/<collection>/<key>[/<op>/<name>]` → its parts, or null. */
function storageRoute(path: string): { coll: string; key?: string } | null {
  const parts = path.split('/').map((p) => decodeURIComponent(p));
  if (parts[0] !== 'blocks' || parts[1] !== 'storage' || parts.length < 3) return null;
  return { coll: parts[2] as string, ...(parts[3] !== undefined ? { key: parts[3] } : {}) };
}

/**
 * Build a `fetch` that answers the app's REST surface from memory.
 *
 * Anything it does not recognise gets a 404 carrying the method and path — LOUD on
 * purpose. A fake that answered `{}` to an unknown route would turn a wrong path into a
 * quietly empty screen.
 */
export function createRestFake(options: RestFakeOptions = {}): typeof globalThis.fetch {
  const viewerUserId = options.viewerUserId ?? 99;
  const untrusted = options.docStore?.untrusted ?? false;
  const { untrusted: _untrusted, ...docStoreOptions } = options.docStore ?? {};
  const docStore: FakeStorage = createFakeStorage({
    manifest,
    viewer: fakeViewer(viewerUserId, untrusted),
    ...docStoreOptions,
    ...(options.storage?.limitBytes !== undefined || options.storage?.limitRows !== undefined
      ? {
          limits: {
            ...(options.storage?.limitBytes !== undefined ? { viewerBytes: options.storage.limitBytes } : {}),
            ...(options.storage?.limitRows !== undefined ? { viewerDocs: options.storage.limitRows } : {}),
          },
        }
      : {}),
  });
  const hidden = new Set<string>();

  // Seeds are FIXTURE, not traffic: written as each seed's own author with a full,
  // consented token, before the first request is answered.
  const seeded = (async () => {
    const seedViewer = fakeViewer(viewerUserId > 0 ? viewerUserId : 99) as FakeStorageViewer;
    const kv = createKvStorage(() => docStore.as({ viewer: seedViewer }).storage);
    for (const [k, v] of Object.entries(options.storage?.seed ?? {})) await kv.set(k, v);
    let minted = 0;
    for (const seed of options.shared?.seed ?? []) {
      minted += 1;
      const key = seed.key ?? mintKey(minted);
      const author = fakeViewer(seed.authorUserId ?? (viewerUserId > 0 ? viewerUserId : 99)) as FakeStorageViewer;
      await docStore
        .as({ viewer: author })
        .storage.collection(RECORDS_COLLECTION)
        .put(key, seed.value as unknown as Record<string, unknown>);
      for (const voter of seed.voters ?? []) {
        const who = fakeViewer(voter);
        if (who) await docStore.as({ viewer: who }).storage.collection(RECORDS_COLLECTION).mark(key, VOTE_MARK);
      }
      if (seed.hidden) hidden.add(key);
    }
  })();

  const balanceNow = (): RestBuzzPools | null => {
    const seededBalance = options.buzz;
    if (seededBalance === undefined) return DEFAULT_BUZZ_BALANCE;
    return typeof seededBalance === 'function' ? seededBalance() : seededBalance;
  };

  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'https://civitai.com');
    const path = url.pathname.replace(/^.*\/api\/v1\//, '');
    const method = (init?.method ?? 'GET').toUpperCase();
    const body: Record<string, unknown> =
      init?.body == null ? {} : (JSON.parse(String(init.body)) as Record<string, unknown>);
    options.onRequest?.({ path, method, body });

    // --- the balance: GET blocks/buzz → a BARE { blue, green, yellow } ---------
    if (path === 'blocks/buzz') {
      const balance = balanceNow();
      if (balance === null) return json({ error: 'Forbidden' }, 403);
      return json(balance);
    }

    // --- the document store: blocks/storage/* ---------------------------------
    if (path === 'blocks/storage' || path.startsWith('blocks/storage/')) {
      await seeded;
      const route = storageRoute(path);
      // A hidden document reads as absent, on every route that names it.
      if (route?.key !== undefined && hidden.has(route.key)) return notFound();
      const query: Record<string, string | string[]> = {};
      for (const name of new Set(url.searchParams.keys())) {
        const all = url.searchParams.getAll(name);
        query[name] = all.length === 1 ? (all[0] as string) : all;
      }
      // The store's DEFAULT page size, modelled for the private collection only.
      if (
        options.storage?.pageSize !== undefined &&
        method === 'GET' &&
        route?.coll === 'kv' &&
        route.key === undefined &&
        query.limit === undefined
      ) {
        query.limit = String(options.storage.pageSize);
      }
      try {
        const reply = await docStore.http<unknown>(method, path, {
          query,
          ...(init?.body == null ? {} : { body }),
        });
        if (hidden.size > 0 && route?.key === undefined && reply && typeof reply === 'object') {
          const page = reply as { items?: Array<{ key: string }> };
          if (Array.isArray(page.items)) {
            return json({ ...page, items: page.items.filter((d) => !hidden.has(d.key)) });
          }
        }
        return json(reply ?? {});
      } catch (err) {
        if (err instanceof ApiError) return json(err.body, err.status);
        throw err;
      }
    }

    return json({ error: `dev-rest: no route for ${method} ${path}` }, 404);
  }) as typeof globalThis.fetch;
}
