// Shared test doubles for the component/e2e suites (jsdom). Injected into the
// App's `deps` bag so the exact production App is driven with canned
// picks/publish/gated, alongside the real SDK mock host (<Harness>) for the base
// protocol (shared storage, workflow, picker, consent, viewer). NOT a *.test
// file, so it isn't collected as a suite.

import type { BlockResourceInfo } from '@civitai/app-sdk/blocks';
import type {
  SharedAppendValue,
  SharedListItem,
  UseAppStorage,
  UseSharedStorage,
} from '@civitai/blocks-react';

import type { GatedCellComponent } from './components/GatedCell.js';

export const CKPT_SDXL: BlockResourceInfo = {
  versionId: 1001,
  modelId: 500,
  modelName: 'JuggernautXL',
  versionName: 'v9',
  baseModel: 'SDXL 1.0',
  modelType: 'Checkpoint',
};

export const LORA_SDXL: BlockResourceInfo = {
  versionId: 2002,
  modelId: 900,
  modelName: 'Detail Tweaker',
  versionName: 'v1',
  baseModel: 'SDXL 1.0',
  modelType: 'LORA',
  strength: 0.8,
  minStrength: 0,
  maxStrength: 1.5,
};

export const immediateSleep = () => Promise.resolve();

/**
 * An in-memory fake {@link UseSharedStorage} whose `list()` can be made to LAG —
 * i.e. NOT reflect a just-appended/updated row (`reflectMutations: false`). Used
 * to prove the App's optimistic reconcile makes a new row appear WITHOUT the
 * list() re-fetch returning it (item 1, read-after-write lag).
 */
export function fakeShared(
  opts: {
    reflectMutations?: boolean;
    seed?: SharedListItem[];
    /**
     * Make `withdraw()` RESOLVE `{ok: false}` instead of removing the row.
     *
     * 🔴 This models the SDK's non-rejecting failure channel, and it is the one
     * behaviour this fake could not express before. `UseSharedStorage.withdraw`
     * is typed `Promise<{ok: boolean; deleted: boolean}>` — the ONLY SDK write
     * whose `ok` is `boolean` rather than the literal `true` (`appStorage.set`
     * and `.delete` are both `ok: true`). That asymmetry is a refusal the host
     * can signal WITHOUT throwing, so a caller that awaits and discards the
     * result treats it as success. Hardcoding `ok: true` here made that branch
     * unreachable from any test in the repo, in either direction.
     */
    withdrawRefuses?: boolean;
  } = {},
) {
  const reflect = opts.reflectMutations ?? true;
  const rows: SharedListItem[] = [...(opts.seed ?? [])];
  let n = 0;
  const appends: SharedAppendValue[] = [];
  /** Every key passed to `withdraw()`, in call order (a test asserts what the app
   * told the shared store — and, just as importantly, that it told it NOTHING
   * before the viewer confirmed). */
  const withdraws: string[] = [];
  /** Every `(key, value)` passed to `update()`, in call order. Lets a test assert
   * that an EDIT of a submitted row went through `update` on the SAME key — i.e.
   * that it did not mint a new row (which would reset the vote total to zero). */
  const updates: Array<{ key: string; value: SharedAppendValue }> = [];
  /** One entry per `list()` call — lets a test wait for the post-mutation re-fetch
   * to actually LAND before asserting the optimistic state survived it. */
  const listCalls: Array<{ prefix?: string; limit?: number; cursor?: string } | undefined> = [];
  const shared: UseSharedStorage = {
    async list(listOpts) {
      listCalls.push(listOpts);
      return { items: [...rows] };
    },
    async get(key) {
      return rows.find((x) => x.key === key) ?? null;
    },
    async report() {
      // The app does not call report() yet; present so the fake satisfies the
      // full UseSharedStorage contract (added in @civitai/app-sdk 0.29.0).
    },
    async getCount() {
      return 0;
    },
    async getCounts() {
      return {};
    },
    async append(value) {
      appends.push(value);
      const key = `fk_${(n += 1)}`;
      if (reflect)
        rows.unshift({ key, authorUserId: 0, value, count: 0, viewerVoted: false, createdAt: new Date(), updatedAt: new Date() });
      return { key };
    },
    async update(key, value) {
      updates.push({ key, value });
      const r = rows.find((x) => x.key === key);
      // The HOST preserves the row identity on update — same key, same `count`.
      // Modelling that faithfully is what lets a test prove an edit kept its votes.
      if (reflect && r) r.value = value;
    },
    async vote() {
      return 1;
    },
    async unvote() {
      return 0;
    },
    async withdraw(key) {
      withdraws.push(key);
      // The host REFUSED, without throwing. The row is untouched and still on
      // the public board — see `withdrawRefuses` above.
      if (opts.withdrawRefuses) return { ok: false, deleted: false };
      const i = rows.findIndex((x) => x.key === key);
      // The HOST always removes the row; `reflect: false` models a list() that
      // hasn't caught up yet (read-after-write lag), so the row keeps coming back
      // from list() and only the optimistic delete can keep it off screen.
      if (reflect && i >= 0) rows.splice(i, 1);
      return { ok: true, deleted: i >= 0 };
    },
  };
  return { shared, appends, updates, withdraws, listCalls };
}

/**
 * An in-memory fake {@link UseAppStorage} (per-viewer KV) seeded from a plain
 * object. Records every `set` so a test can assert what the app persisted (used
 * for the durable voted-set). Mirrors the host contract: `get` resolves the
 * stored value or `null`; `set`/`delete` resolve ok.
 */
export function fakeAppStorage(
  seed: Record<string, unknown> = {},
  /**
   * Host-reported ceilings. 🔴 Deliberately OVERRIDABLE, and deliberately NOT
   * 50 MB / 1,000,000 by default in the tests that use it: a fixture whose
   * values equal the constant a bug would hard-code cannot tell the two apart,
   * so the quota assertions feed numbers the hard-coded version could never
   * produce.
   */
  quota: { usedBytes?: number; limitBytes?: number; limitRows?: number } = {},
  /**
   * Make the first N `list()` calls REJECT.
   *
   * 🔴 Models the route by which the App's `drafts` render-state is empty while
   * the store is not: the mount effect's `list()` throws and the App swallows it
   * on purpose, so a KV failure cannot take the public board down. `drafts`
   * then stays `[]` with nothing to retry it. Any code that looks a draft up in
   * that render state — rather than in the store — is silently inert here, which
   * is exactly the defect this option exists to expose.
   *
   * 🔴 `failListPrefix` is NOT optional in practice — pass it. The App issues
   * TWO independent prefixed listings on mount and the INFLIGHT-runs rehydrate
   * (`inflight:v1:`) goes FIRST, so an untargeted `failListTimes: 1` eats that
   * one and lets the drafts listing succeed. A test built that way loads the
   * drafts fine and then asserts nothing it claims to. Caught by a positive
   * control on the premise; keep that control.
   *
   * 🔴 `pageSize` turns on REAL CURSOR PAGING — `nextCursor` and all. Without it
   * this fake returned every matching key in one page and NEVER a `nextCursor`,
   * so every caller's paging loop broke out after page 1 and the whole loop was
   * dead code as far as the suite was concerned: an altering mutant replacing
   * `cursor = res.nextCursor` with `cursor = undefined` in App.tsx passed the
   * FULL SUITE, 234/234 green. A viewer whose `draft:v1:` keys span more than
   * one host page is a real case (it is one of the three reasons the pointer
   * lookup reads the store at all), so set this in any test that cares about
   * page 2.
   *
   * 🔴 `latencyMs` PUTS EVERY KV CALL ON A MACROTASK, and without it this fake is
   * STRUCTURALLY UNABLE to see an ordering bug. The real `useAppStorage` is a
   * cross-origin `postMessage` bridge, so every call is at minimum a macrotask;
   * this fake resolves in a MICROTASK, which makes a long serial scan look
   * instantaneous. That difference hid a live 🔴 money bug: a backstop armed
   * only when the in-flight scan FINISHED passed every test here, while in
   * production a Confirm landing during the scan — the truncated case is the
   * slowest, up to 20 `list` calls plus a `get` per key — read the un-armed flag
   * and spent. Set this on any test of a guard whose correctness depends on
   * WHEN state becomes true.
   */
  opts: {
    failListTimes?: number;
    failListPrefix?: string;
    pageSize?: number;
    latencyMs?: number;
  } = {},
) {
  const store = new Map<string, unknown>(Object.entries(seed));
  const sets: Array<{ key: string; value: unknown }> = [];
  const deletes: string[] = [];
  /** Every `get()` key, in call order — lets a test assert a read did NOT happen. */
  const gets: string[] = [];
  const listCalls: Array<{ prefix?: string; limit?: number; cursor?: string } | undefined> = [];
  let listFailuresLeft = opts.failListTimes ?? 0;
  /** One macrotask hop per call when `latencyMs` is set; a no-op otherwise. */
  const hop = (): Promise<void> =>
    opts.latencyMs === undefined
      ? Promise.resolve()
      : new Promise((r) => setTimeout(r, opts.latencyMs));
  const appStorage: UseAppStorage = {
    async get<T = unknown>(key: string) {
      gets.push(key);
      await hop();
      return (store.has(key) ? (store.get(key) as T) : null) as T | null;
    },
    async set<T = unknown>(key: string, value: T) {
      await hop();
      store.set(key, value);
      sets.push({ key, value });
      return { ok: true as const };
    },
    async delete(key: string) {
      await hop();
      deletes.push(key);
      const deleted = store.delete(key);
      return { ok: true as const, deleted };
    },
    async list(listOpts?: { prefix?: string; limit?: number; cursor?: string }) {
      listCalls.push(listOpts);
      await hop();
      const targeted =
        opts.failListPrefix === undefined || (listOpts?.prefix ?? '').startsWith(opts.failListPrefix);
      if (listFailuresLeft > 0 && targeted) {
        listFailuresLeft -= 1;
        throw new Error('KV list unavailable');
      }
      const prefix = listOpts?.prefix;
      const all = [...store.keys()].filter((k) => !prefix || k.startsWith(prefix));
      // Page size: the caller's own `limit` wins, else the fixture's, else one
      // page for everything (the historical behaviour).
      const size = listOpts?.limit ?? opts.pageSize ?? all.length;
      // The cursor is "opaque, base64-encoded last key" per the SDK's own
      // docstring — modelled faithfully, so a caller that tries to interpret it
      // as an index breaks here rather than in production.
      const from = listOpts?.cursor ? all.indexOf(atob(listOpts.cursor)) + 1 : 0;
      const page = all.slice(from, from + Math.max(size, 1));
      const last = page[page.length - 1];
      const more = last !== undefined && all.indexOf(last) < all.length - 1;
      return {
        keys: page.map((key) => ({ key, updatedAt: new Date() })),
        ...(more ? { nextCursor: btoa(last) } : {}),
      };
    },
    async getQuota() {
      return {
        usedBytes: quota.usedBytes ?? 0,
        rowCount: store.size,
        limitBytes: quota.limitBytes ?? 50_000_000,
        limitRows: quota.limitRows ?? 1_000_000,
      };
    },
  };
  return { appStorage, sets, deletes, gets, store, listCalls };
}

/**
 * A pure gated-cell COMPONENT stub for the standalone ResultsGrid render test
 * (which renders the grid WITHOUT a mock host). Renders `result-image` for any id
 * in `visibleIds` and `result-hidden` otherwise. This is a component render stub
 * matching the real `GatedCellComponent` prop shape — NOT a hook-shape fake; the
 * full run→publish→gated path is covered end-to-end against the real mock host in
 * e2e.test.tsx (`useGatedImages`/`usePublishGenerationOutputs`).
 */
export function fakeGatedCell(opts: { visibleIds?: number[]; hiddenIds?: number[] } = {}): GatedCellComponent {
  const visible = new Set(opts.visibleIds ?? []);
  return function FakeGatedCell({ imageIds }: { imageIds: number[]; label?: string }) {
    return (
      <div data-testid="gated-cell">
        {imageIds.map((id) =>
          visible.has(id) ? (
            <img key={id} data-testid="result-image" src={`https://image.civitai.com/${id}.jpeg`} alt={`out ${id}`} />
          ) : (
            <div key={id} data-testid="result-hidden">
              hidden
            </div>
          ),
        )}
      </div>
    );
  };
}
