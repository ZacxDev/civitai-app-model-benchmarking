// 527 Phase 1 — the rename's acceptance criterion 2, pinned mechanically.
//
// 🔴 WHAT THIS FILE EXISTS TO PREVENT. The rename turns `combo`/`combos`/
// `combination` into `matchup`/`matchups`/`matchup` across 24 `data-testid`s and
// every user-visible string. The SAME word also spells a PERSISTED WIRE VALUE —
// `data.kind: 'combination'` — which discriminates every row already on the live
// shared board, in the SAME FILES as the renameable positions. There is no
// migration path: `shared.update`/`withdraw` are author-scoped, so this app can
// never rewrite another viewer's row (docs/matchups.md §6.1, §11.4).
//
// A find-and-replace that reaches the wire literal is therefore not a cosmetic
// bug — it makes every existing matchup unparseable and unrecoverable. So the
// literal is pinned two ways, because each is blind to the other's failure:
//
//   1. READ — a FROZEN pre-rename fixture, written out as a literal rather than
//      produced by this repo's own builder, still parses. A fixture built by
//      `buildCombinationPayload` would rename itself alongside the code and stay
//      green through exactly the break it is meant to catch.
//   2. WRITE — what the builder emits TODAY still carries the same literal, so a
//      row appended after the rename is still readable by a client (or a repo
//      revision) that predates it.
//
// Also pinned here: the two OTHER wire values that share the renamed word
// (`ResultData.comboKey`, the `draft:v1:` appStorage prefix), and a structural
// ledger over the 24 renamed testids.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildCombinationPayload,
  checkpointFromPick,
  parseCombination,
  parseResult,
  recordKind,
  V1_CONFIG_ID,
  type RawSharedItem,
} from './lib/benchmark.js';
import { DRAFT_PREFIX } from './lib/drafts.js';
import { CKPT_SDXL } from './test-helpers.js';

// ---------------------------------------------------------------------------
// The frozen fixtures. These are BYTES, not builder output — a snapshot of the
// two combination shapes the live board holds (measured 2026-08-29: 2 matchups,
// 4 prompts, 16 results), captured BEFORE the rename and never regenerated.
// ---------------------------------------------------------------------------

/** A v2 multi-config row, the shape `buildCombinationPayload` has emitted since v0.2. */
const PRE_RENAME_V2_ROW: RawSharedItem = {
  key: 'shared_01HZQ8ABCDEF',
  count: 7,
  authorUserId: 7,
  viewerVoted: false,
  value: {
    title: 'SDXL: base vs +detail',
    body: 'Sharp SDXL baseline, two configs\n\nJuggernautXL · Detail Tweaker',
    data: {
      v: 2,
      kind: 'combination',
      configs: [
        {
          id: 'cfg_a1',
          label: 'base',
          checkpoint: {
            versionId: 1001,
            modelId: 500,
            baseModel: 'SDXL 1.0',
            modelName: 'JuggernautXL',
            versionName: 'v9',
          },
          loras: [],
        },
        {
          id: 'cfg_a2',
          checkpoint: {
            versionId: 1001,
            modelId: 500,
            baseModel: 'SDXL 1.0',
            modelName: 'JuggernautXL',
            versionName: 'v9',
          },
          loras: [
            {
              versionId: 2002,
              modelId: 900,
              weight: 0.8,
              minStrength: 0,
              maxStrength: 1.5,
              modelName: 'Detail Tweaker',
            },
          ],
        },
      ],
    },
  },
} as unknown as RawSharedItem;

/** A LEGACY v1 row (single `checkpoint` + `loras`), still on the board. */
const PRE_RENAME_V1_ROW: RawSharedItem = {
  key: 'shared_01HZQ8LEGACY',
  count: 2,
  authorUserId: 8,
  viewerVoted: true,
  value: {
    title: 'Flux Realism (legacy v1)',
    body: 'Amateur photo look',
    data: {
      v: 1,
      kind: 'combination',
      checkpoint: { versionId: 3003, modelId: 700, baseModel: 'Flux.1 D', modelName: 'FluxRealism' },
      loras: [{ versionId: 4004, modelId: 800, weight: 0.6, minStrength: 0, maxStrength: 1 }],
    },
  },
} as unknown as RawSharedItem;

/** A v2 `result` row — it keys on `comboKey`, the second un-renameable value. */
const PRE_RENAME_RESULT_ROW: RawSharedItem = {
  key: 'shared_01HZQ8RESULT',
  count: 0,
  authorUserId: 12,
  viewerVoted: false,
  value: {
    title: 'result:shared_01HZQ8ABCDEF·cfg_a1×shared_01HZQ8PROMPT',
    data: {
      v: 2,
      kind: 'result',
      comboKey: 'shared_01HZQ8ABCDEF',
      configId: 'cfg_a1',
      promptKey: 'shared_01HZQ8PROMPT',
      ecosystem: 'SDXL',
      imageIds: [111, 222],
    },
  },
} as unknown as RawSharedItem;

describe('527 criterion 2 — the rename does not touch the wire', () => {
  it('🔴 READ: a pre-rename v2 `kind:\'combination\'` row still parses after the rename', () => {
    const parsed = parseCombination(PRE_RENAME_V2_ROW);

    // The assertion that fails when the literal is renamed: `parseCombination`
    // returns null the instant its `d.kind !== 'combination'` guard stops
    // matching what the live board actually holds.
    expect(parsed).not.toBeNull();
    expect(parsed!.key).toBe('shared_01HZQ8ABCDEF');
    expect(parsed!.count).toBe(7);
    expect(parsed!.authorUserId).toBe(7);
    expect(parsed!.name).toBe('SDXL: base vs +detail');
    expect(parsed!.description).toBe('Sharp SDXL baseline, two configs');
    expect(parsed!.data.configs).toHaveLength(2);
    expect(parsed!.data.configs[0].id).toBe('cfg_a1');
    expect(parsed!.data.configs[1].loras[0].versionId).toBe(2002);

    // …and the parsed row STILL carries the wire literal, so a re-`update` of it
    // writes the discriminant back unchanged.
    expect(parsed!.data.kind).toBe('combination');
  });

  it('🔴 READ: a pre-rename LEGACY v1 row still migrates to a single v2 config', () => {
    const parsed = parseCombination(PRE_RENAME_V1_ROW);
    expect(parsed).not.toBeNull();
    expect(parsed!.data.v).toBe(2);
    expect(parsed!.data.kind).toBe('combination');
    expect(parsed!.data.configs).toHaveLength(1);
    expect(parsed!.data.configs[0].id).toBe(V1_CONFIG_ID);
    expect(parsed!.data.configs[0].checkpoint.versionId).toBe(3003);
  });

  it('🔴 the `kind` discriminant is still recognised by recordKind', () => {
    expect(recordKind(PRE_RENAME_V2_ROW.value)).toBe('combination');
    expect(recordKind(PRE_RENAME_V1_ROW.value)).toBe('combination');
  });

  it('🔴 WRITE: what the builder emits today still carries `kind: \'combination\'` at v: 2', () => {
    const built = buildCombinationPayload({
      name: 'Fresh matchup',
      description: 'built after the rename',
      configs: [{ id: 'cfg_new', checkpoint: checkpointFromPick(CKPT_SDXL), loras: [] }],
    });
    const data = built.data as { v: number; kind: string };

    // Literal expectations, NOT derived from types.ts — deriving them from the
    // implementation is how a renamed constant passes its own test.
    expect(data.kind).toBe('combination');
    expect(data.v).toBe(2);

    // The round trip a pre-rename client would perform on that row.
    const reread = parseCombination({
      key: 'k',
      count: 0,
      authorUserId: 1,
      viewerVoted: false,
      value: built,
    } as unknown as RawSharedItem);
    expect(reread).not.toBeNull();
    expect(reread!.data.kind).toBe('combination');
  });

  it('🔴 `ResultData.comboKey` and the result payload version are unrenamed', () => {
    // Read straight off the frozen fixture: the field NAME is the wire contract.
    const raw = PRE_RENAME_RESULT_ROW.value.data as Record<string, unknown>;
    expect(Object.keys(raw)).toContain('comboKey');

    const parsed = parseResult(PRE_RENAME_RESULT_ROW);
    expect(parsed).not.toBeNull();
    expect(parsed!.data.comboKey).toBe('shared_01HZQ8ABCDEF');
    expect(parsed!.data.configId).toBe('cfg_a1');
    expect(parsed!.data.v).toBe(2);
    expect(parsed!.data.kind).toBe('result');
  });

  it('🔴 the `draft:v1:` appStorage prefix keeps its historical name', () => {
    // Live viewers hold records under this prefix; renaming it orphans them and
    // the app cannot migrate another viewer's per-viewer KV (§11.1).
    expect(DRAFT_PREFIX).toBe('draft:v1:');
  });
});

// ---------------------------------------------------------------------------
// The testid ledger — a STRUCTURAL guard over §11.4's map.
//
// It is here because eight of the 24 renamed testids have no behavioural test
// asserting them (they had none before the rename either, so nothing regressed —
// but a rename is exactly the change that breaks an unasserted selector
// silently, and four external consumers in `datapacket-talos` read them).
//
// This asserts the SET, so it fails when a rename is MISSED, when one is
// REVERTED, and when a new `combo`-spelled testid is introduced.
// ---------------------------------------------------------------------------

const RENAMED_TESTIDS = [
  'grid-empty-add-matchup',
  'grid-group-matchup',
  'matchup-cancel',
  'matchup-card',
  'matchup-config-count',
  'matchup-config-summary',
  'matchup-description',
  'matchup-edit',
  'matchup-errors',
  'matchup-form',
  'matchup-included',
  'matchup-name',
  'matchup-report',
  'matchup-submit',
  'matchup-vote',
  'matchup-withdraw',
  'matchups-empty',
  'matchups-error',
  'matchups-included-summary',
  'matchups-list',
  'matchups-loading',
  'matchups-view',
  'submit-matchup',
  'view-switch-matchups',
] as const;

/** Every production (non-test) `.ts`/`.tsx` file under src/. */
function productionSources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...productionSources(full));
    } else if (/\.tsx?$/.test(entry) && !entry.includes('.test.')) {
      out.push(full);
    }
  }
  return out;
}

const SRC = resolve(process.cwd(), 'src');
const PROD_SOURCE = productionSources(SRC)
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');
const ALL_TESTIDS = Array.from(PROD_SOURCE.matchAll(/data-testid="([^"]*)"/g)).map((m) => m[1]);

describe('527 Phase 1 — the renamed testid ledger', () => {
  // The positive control for every claim below: if this number is 0 the scan
  // read nothing and an empty match set would look like a clean rename.
  it('the scan actually reads the production sources', () => {
    expect(PROD_SOURCE.length).toBeGreaterThan(50_000);
    expect(new Set(ALL_TESTIDS).size).toBeGreaterThan(100);
  });

  it('renders exactly the 24 renamed testids from the §11.4 map', () => {
    expect(RENAMED_TESTIDS).toHaveLength(24);
    const found = new Set(ALL_TESTIDS.filter((t) => /matchup/.test(t)));
    expect([...found].sort()).toEqual([...RENAMED_TESTIDS].sort());
  });

  it('🔴 no production testid still spells combo/combination', () => {
    expect(ALL_TESTIDS.filter((t) => /combo|combination/i.test(t))).toEqual([]);
  });
});
