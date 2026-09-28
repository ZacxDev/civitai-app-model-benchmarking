// An in-memory stand-in for the three REST families this app reaches after the
// port off the bridge: per-viewer app storage, cross-user shared storage, and the
// Buzz balance. Used by the dev harness (`main.tsx`) and by the tests that used
// to seed those stores through the mock host.
//
// 🔴 WHY THIS IS A `fetch` FAKE AND NOT A MOCK HOST, which is the whole point.
// Before the port, `useAppStorage`/`useSharedStorage`/`useBuzzBalance` were
// postMessage conversations and `@civitai/blocks-react/testing`'s mock host
// answered them. After it, they are HTTP. A transport-level fake would therefore
// "answer a conversation nobody is having" — the suite would pass while
// exercising none of the code that now carries the traffic. The app's real
// boundary for these three is `fetch`, so the fake belongs there.
//
// 🔴 WHAT IT IS NOT. It is not a second implementation of the platform's policy:
// no scope checks, no min-trust gate, no rate limits, no moderation. Those are
// the server's and they are NOT re-asserted here, because a fake that
// reimplemented them would drift and start certifying its own behaviour. What it
// does own is the ROUTE SHAPES — path, method, body, reply envelope — and those
// are taken from two places that agree: the route files in civitai
// `origin/main` @ `329c89a23e` (`src/pages/api/v1/blocks/{buzz,app-storage,
// shared-storage}`), and `@civitai/sdk@0.8.0`'s own clients, which are what
// actually parse these replies (`dist/{storage,shared-storage}/index.js`) and
// throw rather than default on a field they cannot find.
//
// 🔴 KEYS ARE ULID-SHAPED, NOT `shared_<n>`. The real server GENERATES a ULID
// (`apps-shared.router.ts`), so a seed may pin its own key but the mint must not
// look like an index — a test that hard-codes a fake's counter convention is
// asserting the fake rather than the platform. The mint is deliberately
// DETERMINISTIC so a test can predict it without a clock.

import type { SharedStorageValue } from '@civitai/app-sdk/blocks';

/** The viewer's per-pool balance, as `GET blocks/buzz` returns it. */
export interface RestBuzzPools {
  blue: number;
  green: number;
  yellow: number;
}

/** One seeded shared row. A superset of the mock host's `MockSharedSeed`. */
export interface RestSharedSeed {
  value: SharedStorageValue;
  /** Defaults to the configured viewer, i.e. "the viewer wrote this". */
  authorUserId?: number;
  /** Viewer ids holding an up-vote. The row's `count` is this list's length. */
  voters?: number[];
  /** Pin the row's key instead of minting one. */
  key?: string;
}

export interface RestFakeOptions {
  /** The signed-in viewer's id — decides `viewerVoted` and default authorship. */
  viewerUserId?: number;
  /** Per-viewer KV seed (key → JSON value). Mirrors `MockStorageScenario.seed`. */
  storage?: {
    seed?: Record<string, unknown>;
    limitBytes?: number;
    limitRows?: number;
    /** Page size for `list`; one page for everything when omitted. */
    pageSize?: number;
  };
  /** Shared-store seed, listed newest-first in the order given. */
  shared?: { seed?: RestSharedSeed[] };
  /**
   * The viewer's per-pool balance. Omit for {@link DEFAULT_BUZZ_BALANCE}; pass
   * `null` to make the balance route REFUSE (403), which is how a missing
   * `buzz:read:self` grant or an anonymous viewer reads.
   *
   * 🔴 A FUNCTION IS ACCEPTED, and that is not a convenience: the mock host it
   * replaces had `setScenario({ buzzBalanceError })`, and `buzzBalance.test.tsx`
   * needs exactly that — a read that FAILS on mount and SUCCEEDS on the viewer's
   * retry press. A plain value is snapshotted at construction and cannot express
   * it, so the recovery case would have had nothing to recover from.
   */
  buzz?: RestBuzzPools | null | (() => RestBuzzPools | null);
  /**
   * Called for every request this fake answers. The observation seam a test needs
   * now that these three families are HTTP: a guard that used to count
   * `GET_BUZZ_BALANCE` postMessages through the mock host's `onOutbound` counts
   * `GET blocks/buzz` calls here.
   */
  onRequest?: (call: { path: string; method: string; body: Record<string, unknown> }) => void;
}

interface SharedRow {
  key: string;
  authorUserId: number;
  value: unknown;
  voters: Set<number>;
  createdAt: string;
  updatedAt: string;
}

/** A fixed instant, so nothing here reads a clock a test cannot control. */
const EPOCH = '2026-01-01T00:00:00.000Z';

/**
 * The balance reported when none is seeded.
 *
 * 🔴 COPIED FROM THE MOCK HOST ON PURPOSE (`@civitai/blocks-react`'s own default
 * balance), because this fake INHERITS the job of answering the tests that never
 * seeded one. Defaulting to zeros instead would make every un-seeded case read as
 * a viewer who cannot afford anything, and this app DISABLES Confirm when the
 * balance is below the estimate — so a zero default turns "nobody seeded a
 * balance" into "the money path is broken", three steps from the thing that
 * changed.
 */
const DEFAULT_BUZZ_BALANCE: RestBuzzPools = { blue: 1000, green: 0, yellow: 5000 };

/** Crockford base32, the ULID alphabet. */
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * A 26-character ULID-SHAPED key, derived from a counter.
 *
 * Not a real ULID — it is not time-ordered and carries no entropy — and it does
 * not pretend to be. What matters at this seam is that it looks nothing like an
 * index, so a test cannot accidentally hard-code `shared_2` and pass.
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

function bytesOf(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value) ?? '').length;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Build a `fetch` that answers the app's REST surface from memory.
 *
 * Anything it does not recognise gets a 404 carrying the method and path — LOUD
 * on purpose. A fake that answered `{}` to an unknown route would turn a wrong
 * path into a quietly empty screen, which is the failure this whole port is most
 * able to introduce.
 */
export function createRestFake(options: RestFakeOptions = {}): typeof globalThis.fetch {
  const viewerUserId = options.viewerUserId ?? 99;
  const kv = new Map<string, { value: unknown; updatedAt: string }>(
    Object.entries(options.storage?.seed ?? {}).map(([k, v]) => [k, { value: v, updatedAt: EPOCH }]),
  );
  const limitBytes = options.storage?.limitBytes ?? 50 * 1024 * 1024;
  const limitRows = options.storage?.limitRows ?? 1_000_000;

  let minted = 0;
  const rows: SharedRow[] = (options.shared?.seed ?? []).map((seed) => {
    minted += 1;
    return {
      key: seed.key ?? mintKey(minted),
      authorUserId: seed.authorUserId ?? viewerUserId,
      value: seed.value,
      voters: new Set(seed.voters ?? []),
      createdAt: EPOCH,
      updatedAt: EPOCH,
    };
  });

  const project = (row: SharedRow) => ({
    key: row.key,
    authorUserId: row.authorUserId,
    value: row.value,
    count: row.voters.size,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    viewerVoted: row.voters.has(viewerUserId),
  });

  const balanceNow = (): RestBuzzPools | null => {
    const seeded = options.buzz;
    if (seeded === undefined) return DEFAULT_BUZZ_BALANCE;
    return typeof seeded === 'function' ? seeded() : seeded;
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

    // --- per-viewer KV: POST blocks/app-storage/* ------------------------------
    // Shapes from src/pages/api/v1/blocks/app-storage/{get,set,delete,list,quota}.ts,
    // cross-checked against what `@civitai/sdk`'s StorageClient parses.
    if (path.startsWith('blocks/app-storage/')) {
      const op = path.slice('blocks/app-storage/'.length);
      const key = String(body.key ?? '');
      if (op === 'get') return json({ value: kv.get(key)?.value ?? null });
      if (op === 'set') {
        const size = bytesOf(body.value);
        kv.set(key, { value: body.value, updatedAt: EPOCH });
        // `{ ok: true, sizeBytes }`, and `sizeBytes` is REQUIRED — the SDK's
        // client throws without it, and the route's docblock says there is "no
        // 2xx path that means not written".
        return json({ ok: true, sizeBytes: size });
      }
      if (op === 'delete') return json({ ok: true, deleted: kv.delete(key) });
      if (op === 'list') {
        const prefix = body.prefix === undefined ? '' : String(body.prefix);
        const all = [...kv.entries()].filter(([k]) => k.startsWith(prefix));
        // Page size: the caller's own `limit` wins, else the fixture's, else one
        // page for everything. 🔴 REAL CURSOR PAGING, because this app's
        // in-flight-run rehydrate scan pages the per-viewer store and REFUSES TO
        // SPEND when the scan was truncated — a fake that always returned one
        // page would make that money guard's paging loop dead code.
        const size = Number(body.limit ?? options.storage?.pageSize ?? all.length) || all.length;
        const cursor = body.cursor === undefined ? undefined : String(body.cursor);
        const from = cursor ? all.findIndex(([k]) => k === atob(cursor)) + 1 : 0;
        const page = all.slice(from, from + Math.max(size, 1));
        const last = page[page.length - 1];
        const more = last !== undefined && from + page.length < all.length;
        return json({
          keys: page.map(([k, v]) => ({ key: k, updatedAt: v.updatedAt })),
          // The cursor is "opaque, base64-encoded last key" per the route's own
          // docstring — modelled faithfully, so a caller that tries to read it as
          // an index breaks here rather than in production.
          ...(more && last ? { nextCursor: btoa(last[0]) } : {}),
        });
      }
      if (op === 'quota') {
        let usedBytes = 0;
        for (const [, v] of kv) usedBytes += bytesOf(v.value);
        return json({ usedBytes, rowCount: kv.size, limitBytes, limitRows });
      }
    }

    // --- shared store: blocks/shared-storage/* ---------------------------------
    // Shapes from src/pages/api/v1/blocks/shared-storage/*.ts. Reads are GET with
    // a query string, writes are POST with a body — the route table's own split;
    // a read sent as POST is a 405 on the real surface.
    if (path.startsWith('blocks/shared-storage/')) {
      const op = path.slice('blocks/shared-storage/'.length);
      if (op === 'list' && method === 'GET') {
        // 🔴 REAL `prefix` + `cursor` PAGING, and its absence was a coverage hole
        // rather than a simplification. This fake used to ignore both and never emit
        // `metadata.nextCursor`, so `App.tsx`'s `listAll` — which pages the whole
        // board and reports `truncated: true` when it runs out of pages — was
        // exercised only through `deps.shared` overrides and NEVER over the wire it
        // now actually uses. That `truncated` flag is what stops the vote ranking and
        // the Top Grid being computed over a silent prefix of the board.
        //
        // The real route emits a cursor exactly when the page it returned was FULL
        // (`apps-shared.router.ts`: `rows.length === limit ? base64(lastKey) :
        // undefined`), and the cursor is the base64 of the last key — modelled here,
        // so a caller that tries to read it as an index breaks here rather than in
        // production.
        const prefix = url.searchParams.get('prefix') ?? '';
        const cursorParam = url.searchParams.get('cursor');
        const limitParam = url.searchParams.get('limit');
        const matching = rows.filter((r) => r.key.startsWith(prefix));
        const after = cursorParam ? atob(cursorParam) : null;
        const from = after === null ? 0 : matching.findIndex((r) => r.key === after) + 1;
        const limit = limitParam === null ? matching.length : Number(limitParam);
        const page = matching.slice(from, from + Math.max(limit, 1));
        const last = page[page.length - 1];
        // FULL page ⇒ there may be more. Note this yields a cursor on the exact-fit
        // case too, which is what the server does: it cannot know the page was the
        // last one without reading one more row.
        const more = last !== undefined && page.length === limit;
        // `metadata` is where `nextCursor` lives, and the SDK guards its presence as
        // strictly as `items` — so it is always sent, even when empty.
        return json({
          items: page.map(project),
          metadata: more && last ? { nextCursor: btoa(last.key) } : {},
        });
      }
      if (op === 'item' && method === 'GET') {
        const found = rows.find((r) => r.key === url.searchParams.get('key'));
        return json({ item: found ? project(found) : null });
      }
      if (op === 'append' && method === 'POST') {
        minted += 1;
        const row: SharedRow = {
          key: mintKey(minted),
          authorUserId: viewerUserId,
          value: body.value,
          voters: new Set(),
          createdAt: EPOCH,
          updatedAt: EPOCH,
        };
        // Newest-first, which is the order `list` documents.
        rows.unshift(row);
        return json({ key: row.key });
      }
      if (op === 'update' && method === 'POST') {
        const row = rows.find((r) => r.key === body.key);
        if (!row) return json({ error: 'NOT_FOUND' }, 404);
        row.value = body.value;
        return json({ ok: true });
      }
      if (op === 'withdraw' && method === 'POST') {
        const at = rows.findIndex((r) => r.key === body.key);
        // `{ ok: true, deleted }` — the route's documented shape. The SDK's client
        // reads only `deleted` and hardcodes `ok`, so omitting `ok` here changed no
        // test; it is sent because this fake's whole job is the WIRE, and a shape
        // that differs from the server's is the thing a reader would trust.
        // `deleted: false` is a legitimate SUCCESS: another author's key, an
        // already-withdrawn row and one that never existed all answer identically,
        // so this cannot probe for other viewers' rows.
        if (at < 0) return json({ ok: true, deleted: false });
        rows.splice(at, 1);
        return json({ ok: true, deleted: true });
      }
      if (op === 'vote' && method === 'POST') {
        const row = rows.find((r) => r.key === body.key);
        // The real route pre-checks existence and answers 404 for a missing or
        // hidden row, so it is not an oracle for withdrawn rows.
        if (!row) return json({ error: 'NOT_FOUND' }, 404);
        // 🔴 IDEMPOTENT, because the platform's is: a `Set` reproduces the real
        // route's "atomic insert-gated counter — a double vote is a no-op and the
        // tally never inflates". A fake that incremented per call would make an
        // inflating count look correct.
        row.voters.add(viewerUserId);
        return json({ count: row.voters.size });
      }
      if (op === 'unvote' && method === 'POST') {
        const row = rows.find((r) => r.key === body.key);
        if (!row) return json({ error: 'NOT_FOUND' }, 404);
        // The counter drops by exactly the number of vote rows deleted (0 or 1),
        // with the real route's `CHECK(count >= 0)` making underflow impossible —
        // which a `Set.delete` reproduces exactly.
        row.voters.delete(viewerUserId);
        return json({ count: row.voters.size });
      }
      if (op === 'report' && method === 'POST') {
        const row = rows.find((r) => r.key === body.key);
        if (!row) return json({ error: 'NOT_FOUND' }, 404);
        // 🔴 THE ROW IS NOT TOUCHED. The real route files a row for moderator
        // review and explicitly does NOT hide the reported row, and it answers
        // identically whether the report was newly filed or deduped, so it cannot
        // be used to probe who has already reported what. A fake that spliced the
        // row here would make this app's honest behaviour (the board is left
        // exactly as it was) look like a bug.
        return json({ ok: true });
      }
      if (method !== 'GET' && method !== 'POST') {
        return json({ error: 'Method not allowed' }, 405);
      }
    }

    return json({ error: `dev-rest: no route for ${method} ${path}` }, 404);
  }) as typeof globalThis.fetch;
}
