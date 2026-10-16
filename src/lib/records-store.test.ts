// The SHARED half of the document-store mapping, pinned against raw documents in the
// SDK's contract fake (over this repo's manifest) — see `kv-store.test.ts` for why
// raw documents rather than an adapter round trip.

import { describe, expect, it, vi } from 'vitest';

import { FAKE_STORAGE_MODERATION, createFakeStorage } from '@civitai/sdk/testing';

import manifest from '../../block.manifest.json';
import {
  PUBLISH_CONSENT_MESSAGE,
  PUBLISH_CONTENT_REJECTED_MESSAGE,
  PUBLISH_SIGN_IN_MESSAGE,
  RECORDS_COLLECTION,
  SharedWriteRefusal,
  createRecordsStore,
} from './records-store.js';

const ME = { username: 'me', id: 99 };
const OTHER = { username: 'other', id: 7 };
const VOTER = { username: 'voter', id: 3 };

const LEGACY_VALUE = {
  title: 'SDXL: base vs +detail',
  body: 'Sharp SDXL baseline',
  data: { v: 2, kind: 'combination', configs: [{ id: 'cfgA', checkpoint: { versionId: 1, modelId: 2 }, loras: [] }] },
};

function setup(opts: Parameters<typeof createFakeStorage>[0] extends infer O ? Partial<O> : never = {}) {
  const fake = createFakeStorage({ manifest, viewer: ME, ...opts });
  const hooks = { onConsentRequired: vi.fn(), onSignInRequired: vi.fn() };
  const store = createRecordsStore(() => fake.storage, () => ({}), hooks);
  const rawAs = (viewer: typeof ME) => fake.as({ viewer }).storage.collection<Record<string, unknown>>(RECORDS_COLLECTION);
  return { fake, store, hooks, rawAs };
}

describe('the `records` mapping — what the production copy writes', () => {
  it('reads a copied document at its legacy key with its data VERBATIM (not wrapped)', async () => {
    const { store, rawAs } = setup();
    await rawAs(OTHER).put('01JLEGACY00000000000000001', LEGACY_VALUE);
    const { items } = await store.list();
    expect(items).toHaveLength(1);
    expect(items[0]!.key).toBe('01JLEGACY00000000000000001');
    expect(items[0]!.value).toEqual(LEGACY_VALUE);
  });

  it('a new row is CREATED (server-minted key) with the value verbatim as its data', async () => {
    const { store, rawAs } = setup();
    const { key } = await store.append(LEGACY_VALUE);
    expect((await rawAs(ME).get(key))?.data).toEqual(LEGACY_VALUE);
  });

  it('an edit replaces the data at the SAME key — references to it stay valid', async () => {
    const { store, rawAs } = setup();
    const { key } = await store.append(LEGACY_VALUE);
    const edited = { ...LEGACY_VALUE, title: 'Renamed' };
    await store.update(key, edited);
    const doc = await rawAs(ME).get(key);
    expect(doc?.data).toEqual(edited);
    expect(doc?.version).toBe(2);
  });

  it('lists NEWEST-FIRST by key (the legacy board order)', async () => {
    const { store, rawAs } = setup();
    for (const k of ['01JA0000000000000000000001', '01JA0000000000000000000003', '01JA0000000000000000000002']) {
      await rawAs(OTHER).put(k, LEGACY_VALUE);
    }
    expect((await store.list()).items.map((i) => i.key)).toEqual([
      '01JA0000000000000000000003',
      '01JA0000000000000000000002',
      '01JA0000000000000000000001',
    ]);
  });
});

describe('votes, reports and ownership are the store’s answers', () => {
  it('a vote is the `vote` mark: the tally is `marks.vote` and `viewerVoted` is the viewer’s own mark', async () => {
    const { store, rawAs } = setup();
    await rawAs(OTHER).put('01JV0000000000000000000001', LEGACY_VALUE);
    await rawAs(VOTER).mark('01JV0000000000000000000001', 'vote');

    let [row] = (await store.list()).items;
    expect(row).toMatchObject({ count: 1, viewerVoted: false });

    await expect(store.vote('01JV0000000000000000000001')).resolves.toBe(2);
    [row] = (await store.list()).items;
    expect(row).toMatchObject({ count: 2, viewerVoted: true });
    // The raw document agrees — the mark is the record, there is no counter.
    const raw = await rawAs(ME).get('01JV0000000000000000000001');
    expect(raw?.marks).toEqual({ vote: 2 });
    expect(raw?.viewer?.marks).toEqual(['vote']);
    expect(raw?.counters).toEqual({});

    await expect(store.unvote('01JV0000000000000000000001')).resolves.toBe(1);
    [row] = (await store.list()).items;
    expect(row).toMatchObject({ count: 1, viewerVoted: false });
  });

  it('ownership is `author.isViewer` — true for the viewer’s row, false for another author’s', async () => {
    const { store, rawAs } = setup();
    await rawAs(ME).put('01JO0000000000000000000001', LEGACY_VALUE);
    await rawAs(OTHER).put('01JO0000000000000000000002', LEGACY_VALUE);
    const byKey = Object.fromEntries((await store.list()).items.map((i) => [i.key, i.authoredByViewer]));
    expect(byKey).toEqual({ '01JO0000000000000000000001': true, '01JO0000000000000000000002': false });
  });

  it('a report is the built-in `report` mark: filed, row untouched, tally untouched', async () => {
    const { store, rawAs, fake } = setup();
    await rawAs(OTHER).put('01JR0000000000000000000001', LEGACY_VALUE);
    await store.report('01JR0000000000000000000001');
    const report = fake.calls.find((c) => c.path.endsWith('/marks/report'));
    expect(report).toMatchObject({ method: 'PUT', status: 200 });
    const [row] = (await store.list()).items;
    expect(row).toMatchObject({ key: '01JR0000000000000000000001', count: 0 });
  });

  it('the `own` policy: another author’s row cannot be edited or withdrawn', async () => {
    const { store, rawAs } = setup();
    await rawAs(OTHER).put('01JN0000000000000000000001', LEGACY_VALUE);
    await expect(store.update('01JN0000000000000000000001', LEGACY_VALUE)).rejects.toMatchObject({ code: 'not_author' });
    await expect(store.withdraw('01JN0000000000000000000001')).rejects.toMatchObject({ code: 'not_author' });
  });
});

describe('viewer-fixable refusals of a shared write', () => {
  it('`consent_required` calls the consent hook and rejects with VIEWER copy', async () => {
    const { store, hooks } = setup({ consent: { revoked: ['apps:storage:publish'] } });
    const err = await store.append(LEGACY_VALUE).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SharedWriteRefusal);
    expect((err as SharedWriteRefusal).code).toBe('consent_required');
    expect((err as Error).message).toBe(PUBLISH_CONSENT_MESSAGE);
    expect(hooks.onConsentRequired).toHaveBeenCalledTimes(1);
    expect(hooks.onSignInRequired).not.toHaveBeenCalled();
  });

  it('marks need no publish consent — a vote lands on a token WITHOUT the publish scope', async () => {
    const { fake, rawAs } = setup();
    await rawAs(OTHER).put('01JC0000000000000000000001', LEGACY_VALUE);
    // The viewer's token carries only `apps:storage` — what the host mints before the
    // viewer has ever consented to publishing.
    const unconsented = createRecordsStore(() => fake.as({ viewer: ME, scopes: ['apps:storage'] }).storage);
    await expect(unconsented.vote('01JC0000000000000000000001')).resolves.toBe(1);
    // …while a create on that same token is refused for consent (positive control).
    await expect(unconsented.append(LEGACY_VALUE)).rejects.toMatchObject({ code: 'consent_required' });
  });

  it('`sign_in_required` (anonymous) calls the sign-in hook and rejects with viewer copy', async () => {
    const { store, hooks } = setup({ viewer: null });
    const err = await store.append(LEGACY_VALUE).catch((e: unknown) => e);
    expect((err as Error).message).toBe(PUBLISH_SIGN_IN_MESSAGE);
    expect(hooks.onSignInRequired).toHaveBeenCalledTimes(1);
    expect(hooks.onConsentRequired).not.toHaveBeenCalled();
  });

  it('`content_rejected` (enforce-mode moderation) rejects with VIEWER copy, not the server’s string', async () => {
    const { store, hooks } = setup();
    const err = await store
      .append({ ...LEGACY_VALUE, title: `My ${FAKE_STORAGE_MODERATION.blockedText} matchup` })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SharedWriteRefusal);
    expect((err as SharedWriteRefusal).code).toBe('content_rejected');
    expect((err as Error).message).toBe(PUBLISH_CONTENT_REJECTED_MESSAGE);
    // 🔴 THE WHOLE STRING, LITERALLY (round-2 audit, 🟡3): the server scans every text
    // leaf — a prompt's own text included — so copy naming only "the name or
    // description" sent authors to edit the wrong field. Pinned whole so a reword
    // that narrows it again fails here rather than passing on the constant.
    expect(PUBLISH_CONTENT_REJECTED_MESSAGE).toBe(
      "This couldn't be published: the platform's content check rejected some of its text — the name, the description, or the prompt itself. Edit the text and try again.",
    );
    // An edit is moderated too.
    const { key } = await store.append(LEGACY_VALUE);
    await expect(
      store.update(key, { ...LEGACY_VALUE, body: FAKE_STORAGE_MODERATION.blockedText }),
    ).rejects.toThrow(PUBLISH_CONTENT_REJECTED_MESSAGE);
    expect(hooks.onConsentRequired).not.toHaveBeenCalled();
  });

  it('any other refusal passes through UNCHANGED (the store’s own code)', async () => {
    const { store, hooks } = setup({ viewer: { ...ME, trusted: false } });
    await expect(store.append(LEGACY_VALUE)).rejects.toMatchObject({ code: 'not_eligible' });
    expect(hooks.onConsentRequired).not.toHaveBeenCalled();
    expect(hooks.onSignInRequired).not.toHaveBeenCalled();
  });

  it('a create is refused 429 `rate_limited` once the shared write budget is spent', async () => {
    let now = 1_800_000_000_000;
    const { store } = setup({ enforceRateLimits: true, now: () => now });
    const outcomes: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      outcomes.push(
        await store.append({ ...LEGACY_VALUE, title: `t${i}` }).then(
          () => 'ok',
          (e: { code?: string; status?: number }) => `${e.status} ${e.code}`,
        ),
      );
    }
    now += 1;
    // The burst is 10: ten creates land, then the budget refuses.
    expect(outcomes.slice(0, 10)).toEqual(Array(10).fill('ok'));
    expect(outcomes[10]).toBe('429 rate_limited');
  });
});
