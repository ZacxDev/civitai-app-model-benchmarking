// 🔴 THE DOCUMENT STORE'S READ RATE LIMIT (PR #85 audit, F2).
//
// The store allows 300 reads a minute per (app, viewer) and answers 429
// `rate_limited` past it. Before this fix every private scan read ONE document per
// stored key (`store.get(key)` inside `forEachStoredKey`) on top of 25-key list pages,
// so a viewer with a few hundred private items tripped the limit on a single page
// load — their items vanished from My Benchmarks, and the grid-publish boundary said
// it "could not read your private items". Both cases below were watched failing at
// `6efbf674`.
//
// Case 1 runs against the SDK's own contract fake WITH ITS RATE LIMITS ON, so the 429
// is the store's, not one this file scripted. Case 2 drives the recovery path with the
// façade fake's 429 mode, so the timing is deterministic.

import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App, type AppDeps } from './App.js';
import { buildDraft, draftKey } from './lib/drafts.js';
import { Harness, type TestHarnessProps } from './test-harness.js';
import { CKPT_SDXL, fakeAppStorage, fakeShared, immediateSleep, openMyList } from './test-helpers.js';

const VIEWER_ID = 99;

function draft(i: number) {
  const id = `d${String(i).padStart(3, '0')}`;
  return [
    draftKey(id),
    buildDraft(
      id,
      {
        name: `Private matchup ${i}`,
        description: '',
        configs: [
          {
            id: 'cfgA',
            checkpoint: {
              versionId: CKPT_SDXL.versionId,
              modelId: CKPT_SDXL.modelId,
              baseModel: CKPT_SDXL.baseModel,
              modelName: CKPT_SDXL.modelName,
            },
            loras: [],
          },
        ],
      } as Parameters<typeof buildDraft>[1],
      new Date(1_800_000_000_000 + i),
    ),
  ] as const;
}

function mount(deps: Partial<AppDeps>, harness: Partial<TestHarnessProps> = {}) {
  render(
    <Harness
      viewer={{ id: VIEWER_ID, username: 'me' }}
      theme="dark"
      consentGranted
      buzzBudget={1000}
      buzz={{ balance: 5000 }}
      buzzBalance={{ blue: 0, green: 0, yellow: 5000 }}
      shared={{ seed: [] }}
      showLog={false}
      {...harness}
    >
      <App deps={{ resolveResources: async () => [], pollIntervalMs: 0, sleep: immediateSleep, ...deps }} />
    </Harness>,
  );
}

describe('🔴 a page load stays inside the store’s 300 reads/min', () => {
  it('a viewer with 320 private matchups sees ALL of them, with the store’s rate limits enforced', async () => {
    const seed = Object.fromEntries(Array.from({ length: 320 }, (_, i) => draft(i)));
    const reads: string[] = [];
    mount(
      {},
      {
        storage: { seed },
        docStore: { enforceRateLimits: true },
        onRequest: (c) => {
          if (c.method === 'GET' && c.path.startsWith('blocks/storage')) reads.push(c.path);
        },
      },
    );
    await openMyList('matchup');
    await waitFor(() => expect(screen.getAllByTestId('unpublished-card')).toHaveLength(320), { timeout: 8000 });
    // The budget itself, measured over the whole load (board + every private scan +
    // archive + quota + flag): far under 300. Positive control on the seam: reads
    // WERE observed.
    expect(reads.length).toBeGreaterThan(0);
    // 🔴 A LITERAL, AND ITS COMPOSITION, so a regression in EITHER lever shows:
    // 1 board page + the explainer flag + 4 draft pages of 100 (320 keys — at the
    // store's default 25 it would be 13) + 1 each for the in-flight, prompt and grid
    // scans + the archive key + `info()` for the quota line = 11. Zero per-key reads:
    // the values ride on the list pages.
    expect(reads).toHaveLength(11);
  }, 20_000);
});

describe('🔴 a read rate limit heals itself instead of wedging My Benchmarks', () => {
  it('a 429 on the private scan schedules ONE re-scan after `retryAfter`, and the items appear without a reload', async () => {
    const [key, value] = draft(1);
    const { appStorage, listCalls } = fakeAppStorage(
      { [key]: value },
      {},
      { failListTimes: 1, failListPrefix: 'draft:v1:', failListRateLimited: { retryAfter: 0.05 } },
    );
    mount({ shared: fakeShared().shared, appStorage });
    await openMyList('matchup');

    // No reload, no click: the store's wait elapses and the scan runs again.
    const card = await screen.findByTestId('unpublished-card', undefined, { timeout: 3000 });
    expect(card).toHaveTextContent('Private matchup 1');
    // Exactly one refused listing and one retry of it — bounded, not a loop.
    expect(listCalls.filter((c) => c?.prefix === 'draft:v1:')).toHaveLength(2);
  });
});
