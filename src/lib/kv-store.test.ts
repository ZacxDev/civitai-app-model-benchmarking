// The PRIVATE half of the document-store mapping, pinned with literal values.
//
// 🔴 WHY LITERALS AND RAW DOCUMENTS. A production data copy writes the legacy KV into
// the `kv` collection by hand at cutover, and it writes EXACTLY: legacy key verbatim,
// data `{ value: <legacy value> }`. A test that only round-trips through the adapter
// cannot see a mapping change — a mutant that stops wrapping on write AND unwrapping
// on read round-trips perfectly and strands every copied row. So each case here writes
// or reads the RAW document in the SDK's contract fake (over this repo's manifest)
// and checks the adapter against it.

import { describe, expect, it } from 'vitest';

import { createFakeStorage } from '@civitai/sdk/testing';

import manifest from '../../block.manifest.json';
import { KV_COLLECTION, createKvStorage } from './kv-store.js';

function setup() {
  const fake = createFakeStorage({ manifest, viewer: { username: 'viewer', id: 99 } });
  const kv = createKvStorage(() => fake.storage);
  const raw = fake.storage.collection<Record<string, unknown>>(KV_COLLECTION);
  return { fake, kv, raw };
}

describe('the `kv` mapping — what the production copy writes', () => {
  it('writes the legacy value WRAPPED in `{ value }` at the legacy key — every value shape', async () => {
    const { kv, raw } = setup();
    await kv.set('howto-dismissed:v1', true);
    await kv.set('archive:v1', ['01JA', '01JB']);
    await kv.set('draft:v1:loc_1', { localId: 'loc_1', name: 'x' });
    await kv.set('inflight:v1:01JC::cfgA::01JD', { comboKey: '01JC', configId: 'cfgA', promptKey: '01JD' });

    expect((await raw.get('howto-dismissed:v1'))?.data).toEqual({ value: true });
    expect((await raw.get('archive:v1'))?.data).toEqual({ value: ['01JA', '01JB'] });
    expect((await raw.get('draft:v1:loc_1'))?.data).toEqual({ value: { localId: 'loc_1', name: 'x' } });
    expect((await raw.get('inflight:v1:01JC::cfgA::01JD'))?.data).toEqual({
      value: { comboKey: '01JC', configId: 'cfgA', promptKey: '01JD' },
    });
  });

  it('reads a document the COPY wrote — unwrapping `{ value }` — for every legacy key family', async () => {
    const { kv, raw } = setup();
    const copied: Record<string, unknown> = {
      'howto-dismissed:v1': true,
      'voted:v1': ['01JX'],
      'archive:v1': ['01JA'],
      'draft:v1:loc_9': { localId: 'loc_9', sharedKey: '01JS', submittedAt: 1 },
      'unpub:grid:v1:g_1': { localId: 'g_1' },
      'unpub:prompt:v1:p_1': { localId: 'p_1' },
      'inflight:v1:a::b::c': { comboKey: 'a', configId: 'b', promptKey: 'c', workflowId: 'wf' },
    };
    for (const [key, value] of Object.entries(copied)) await raw.put(key, { value });
    for (const [key, value] of Object.entries(copied)) {
      await expect(kv.get(key), key).resolves.toEqual(value);
    }
  });

  it('a missing key reads as `null`, not `undefined`', async () => {
    const { kv } = setup();
    await expect(kv.get('draft:v1:never')).resolves.toBeNull();
  });

  it('delete removes exactly the named document', async () => {
    const { kv, raw } = setup();
    await raw.put('draft:v1:a', { value: 1 });
    await raw.put('draft:v1:b', { value: 2 });
    await expect(kv.delete('draft:v1:a')).resolves.toEqual({ ok: true, deleted: true });
    expect(await raw.get('draft:v1:a')).toBeNull();
    expect((await raw.get('draft:v1:b'))?.data).toEqual({ value: 2 });
    await expect(kv.delete('draft:v1:a')).resolves.toEqual({ ok: true, deleted: false });
  });

  it('a prefix walk pages with the store’s exact cursor and sees every key', async () => {
    const { kv, raw } = setup();
    const keys = Array.from({ length: 230 }, (_, i) => `inflight:v1:k${String(i).padStart(3, '0')}`);
    for (const k of keys) await raw.put(k, { value: { comboKey: 'c', configId: 'g', promptKey: 'p' } });
    await raw.put('draft:v1:outside', { value: 1 });

    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await kv.list({ prefix: 'inflight:v1:', limit: 100, ...(cursor ? { cursor } : {}) });
      pages += 1;
      seen.push(...page.keys.map((k) => k.key));
      cursor = page.nextCursor;
    } while (cursor);
    expect(pages).toBe(3);
    expect(seen).toEqual(keys);
  });
});

describe('the manifest declares exactly what the copy and the code depend on', () => {
  it('pins the `storage` block and the scopes, literally', () => {
    expect(manifest.storage).toEqual({
      collections: {
        kv: { visibility: 'private' },
        records: { visibility: 'shared', write: 'own', marks: ['vote'] },
      },
    });
    expect([...manifest.scopes].sort()).toEqual(
      ['ai:write:budgeted', 'apps:storage', 'apps:storage:publish', 'buzz:read:self'].sort(),
    );
    // The publish scope is sensitive: the platform requires a justification for it.
    expect(Object.keys(manifest.scopeJustifications)).toContain('apps:storage:publish');
  });
});
