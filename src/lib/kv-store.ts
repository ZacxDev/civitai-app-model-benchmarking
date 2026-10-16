// The app's PER-VIEWER key/value surface, over ONE private collection of the App
// Blocks document store.
//
// The app was written against the legacy per-viewer KV (`app.storage.get/set/
// delete/list/getQuota`, scopes `apps:storage:read` + `:write`). That store is
// deprecated; the document store (`app.storage.collection(name)`, scope
// `apps:storage`) replaces it. Every call site keeps the get/set/delete/list shape it
// already had (`lib/kv.ts`'s paging rule, the drafts and in-flight scans, the money
// path's claim), and only this file knows documents exist. Same adapter shape as the
// sister app `civitai-app-sensei`'s `src/lib/kv-store.ts`.
//
// 🔴 THE MAPPING IS FIXED, AND SOMETHING OUTSIDE THIS REPO DEPENDS ON IT EXACTLY.
// Existing viewers' data is copied from the legacy KV into the document store by a
// separate, hand-run step at cutover. That copy writes what this module reads, so
// changing any of the three rules below strands every copied row — including the
// `inflight:v1:*` claims the money path reads to refuse a second charge:
//
//   1. ONE collection, named `kv`, declared `private` in `block.manifest.json`, with
//      no indexes.
//   2. Document key = the legacy KV key, byte-for-byte (`howto-dismissed:v1`,
//      `archive:v1`, `draft:v1:<id>`, `unpub:prompt:v1:<id>`, `unpub:grid:v1:<id>`,
//      `inflight:v1:<combo>::<config>::<prompt>`). Every one matches the store's key
//      rule `^[A-Za-z0-9._:-]{1,128}$`.
//   3. Document data = `{ value: <the legacy value> }` — ALWAYS wrapped, for every
//      key. A document's data must be an object and `howto-dismissed:v1` is a bare
//      `true` and `archive:v1` a bare array, so "wrap only when needed" would make the
//      shape depend on the value and the copy would have to reproduce that rule.
//
// `src/lib/kv-store.test.ts` pins all three with literal values against
// `createFakeStorage` (the SDK's own client over an in-memory server that enforces
// this repo's manifest).

import type { DocumentCallOptions, DocumentStorage, StorageCollection } from '@civitai/sdk';

/** The one private collection. Must match `block.manifest.json` → `storage.collections`. */
export const KV_COLLECTION = 'kv';

/**
 * The largest page `list` may ask for.
 *
 * 🔴 A LARGER `limit` IS REFUSED, NOT CLAMPED: the document store answers
 * `invalid_request` (`DOC_STORE_BOUNDS.listLimitMax = 100`). `forEachStoredKey`
 * sends no `limit` at all (the server's default page is 25), so this only bites a
 * caller that asks for more than the server allows.
 */
export const KV_LIST_LIMIT_MAX = 100;

/** The stored document's data. See rule 3 above. */
export interface KvDocument {
  value: unknown;
}

/** One row of a key listing — the document's VALUE included, since the page carries it. */
export interface KvKeyEntry {
  key: string;
  /** The stored value, unwrapped exactly as {@link KvStore.get} unwraps it. */
  value: unknown;
  updatedAt: Date;
}

export interface KvListResult {
  keys: KvKeyEntry[];
  /** Absent exactly when this was the last page — `lib/kv.ts`'s proof a scan completed. */
  nextCursor?: string;
}

/**
 * The viewer's storage use against their ceilings, in the document store's STORED
 * unit.
 *
 * 🔴 THESE ARE THE VIEWER'S OWN FIGURES, NOT THE APP'S. The legacy `getQuota` once
 * reported an app-wide total (and later the caller's own, silently); the document
 * store's `info()` names both, and this reads `usage.viewer` against
 * `limits.viewerBytes` / `limits.viewerDocs`. That viewer figure counts EVERY document
 * the viewer wrote in this app — private ones and their own published `records`
 * alike — because the store charges each write to the calling viewer.
 */
export interface KvQuota {
  usedBytes: number;
  rowCount: number;
  limitBytes: number;
  limitRows: number;
}

/**
 * The per-viewer surface this app consumes.
 *
 * Every failure REJECTS (the document store's `StorageError`), exactly as the legacy
 * client did; nothing here turns a refusal into an empty result. That is what lets the
 * money path tell "nothing stored" from "could not read" — the in-flight rehydrate
 * refuses to spend on anything but a COMPLETE read.
 */
export interface KvStore {
  /** The stored value, or `null` when the key has never been written (or was deleted). */
  get<T = unknown>(key: string): Promise<T | null>;
  set<T = unknown>(key: string, value: T): Promise<{ ok: true }>;
  delete(key: string): Promise<{ ok: true; deleted: boolean }>;
  /** ONE page of keys under `prefix`. Follow `nextCursor` for the next. */
  list(opts?: { prefix?: string; limit?: number; cursor?: string }): Promise<KvListResult>;
  /** The viewer's own usage and ceilings. Rejects for an anonymous viewer. */
  getQuota(): Promise<KvQuota>;
}

/**
 * Build the KV surface over a document store.
 *
 * `docs` is called per operation rather than once, so the production caller can hand
 * in "await the AppClient" and the façade stays a stable object that exists before the
 * handshake lands. `callOpts` is likewise per call, so each request gets its own fresh
 * deadline signal (`lib/sdk-runtime.ts`'s `withDeadline`).
 */
export function createKvStorage(
  docs: () => DocumentStorage | Promise<DocumentStorage>,
  callOpts: () => DocumentCallOptions = () => ({}),
): KvStore {
  const kv = async (): Promise<StorageCollection<KvDocument>> =>
    (await docs()).collection<KvDocument>(KV_COLLECTION);

  return {
    async get<T = unknown>(key: string): Promise<T | null> {
      const doc = await (await kv()).get(key, callOpts());
      // Missing → `null`, which is what the legacy `get` answered for a key never
      // written. A document whose data somehow lacks `value` reads as missing too,
      // rather than handing the caller an `undefined` it never had to handle.
      return (doc?.data.value ?? null) as T | null;
    },
    async set<T = unknown>(key: string, value: T): Promise<{ ok: true }> {
      await (await kv()).put(key, { value }, callOpts());
      return { ok: true };
    },
    async delete(key: string): Promise<{ ok: true; deleted: boolean }> {
      const { deleted } = await (await kv()).delete(key, callOpts());
      return { ok: true, deleted };
    },
    async list(opts = {}): Promise<KvListResult> {
      const page = await (await kv()).list(
        {
          ...(opts.prefix !== undefined ? { keyPrefix: opts.prefix } : {}),
          ...(opts.limit !== undefined
            ? { limit: Math.min(Math.max(1, opts.limit), KV_LIST_LIMIT_MAX) }
            : {}),
          ...(opts.cursor !== undefined ? { cursor: opts.cursor } : {}),
        },
        callOpts(),
      );
      return {
        keys: page.items.map((doc) => ({ key: doc.key, value: doc.data.value ?? null, updatedAt: doc.updatedAt })),
        ...(page.nextCursor !== null ? { nextCursor: page.nextCursor } : {}),
      };
    },
    async getQuota(): Promise<KvQuota> {
      const { usage, limits } = await (await docs()).info(callOpts());
      return {
        usedBytes: usage.viewer.bytes,
        rowCount: usage.viewer.docs,
        limitBytes: limits.viewerBytes,
        limitRows: limits.viewerDocs,
      };
    },
  };
}
