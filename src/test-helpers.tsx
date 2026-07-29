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
export function fakeShared(opts: { reflectMutations?: boolean; seed?: SharedListItem[] } = {}) {
  const reflect = opts.reflectMutations ?? true;
  const rows: SharedListItem[] = [...(opts.seed ?? [])];
  let n = 0;
  const appends: SharedAppendValue[] = [];
  const shared: UseSharedStorage = {
    async list() {
      return { items: [...rows] };
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
      if (reflect) rows.unshift({ key, authorUserId: 0, value, count: 0, createdAt: new Date(), updatedAt: new Date() });
      return { key };
    },
    async update(key, value) {
      const r = rows.find((x) => x.key === key);
      if (reflect && r) r.value = value;
    },
    async vote() {
      return 1;
    },
    async unvote() {
      return 0;
    },
    async withdraw() {
      return { ok: true, deleted: true };
    },
  };
  return { shared, appends };
}

/**
 * An in-memory fake {@link UseAppStorage} (per-viewer KV) seeded from a plain
 * object. Records every `set` so a test can assert what the app persisted (used
 * for the durable voted-set). Mirrors the host contract: `get` resolves the
 * stored value or `null`; `set`/`delete` resolve ok.
 */
export function fakeAppStorage(seed: Record<string, unknown> = {}) {
  const store = new Map<string, unknown>(Object.entries(seed));
  const sets: Array<{ key: string; value: unknown }> = [];
  const appStorage: UseAppStorage = {
    async get<T = unknown>(key: string) {
      return (store.has(key) ? (store.get(key) as T) : null) as T | null;
    },
    async set<T = unknown>(key: string, value: T) {
      store.set(key, value);
      sets.push({ key, value });
      return { ok: true as const };
    },
    async delete(key: string) {
      const deleted = store.delete(key);
      return { ok: true as const, deleted };
    },
    async list() {
      return { keys: [...store.keys()].map((key) => ({ key, updatedAt: new Date() })) };
    },
    async getQuota() {
      return { usedBytes: 0, rowCount: store.size, limitBytes: 50_000_000, limitRows: 1_000_000 };
    },
  };
  return { appStorage, sets, store };
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
