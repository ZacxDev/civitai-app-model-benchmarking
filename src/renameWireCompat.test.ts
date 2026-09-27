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
  // ---- added by the IA refactor, and `view-switch-matchups` removed by it ----
  // 🔴 THE LEDGER IS THE SET, SO IT MOVES WHEN THE SURFACE DOES — deliberately,
  // in one place, with the reason written down. The IA refactor deleted the
  // top-level tab strip (so `view-switch-matchups` has no renderer any more) and
  // added four matchup-spelled landmarks:
  //   - `section-matchups`        the page section that replaced the tab;
  //   - `contribute-item-matchup` the Contribute menu item that replaced its
  //                               submit route — NOT in this list, because the
  //                               scan below cannot see it (it reaches the DOM
  //                               through a variable). That gap is bounded and
  //                               asserted by its own case at the end of this
  //                               describe block rather than left silent;
  //   - `matchup-detail*`         the drill-in modal the grid's group band opens;
  //   - `subtab-*-matchup`        the sub-tab strip, which had to become
  //                               object-scoped once matchups and prompts are
  //                               mounted TOGETHER (see SubTabs.tsx).
  'matchup-detail',
  'matchup-detail-config',
  'matchup-detail-configs',
  'my-sign-in-matchup',
  'my-signed-out-matchup',
  'section-matchups',
  'subtab-community-matchup',
  'subtab-my-matchup',
  'subtabs-matchup',
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
/**
 * Every testid a production source renders.
 *
 * 🔴 TWO PATTERNS, AND THE SECOND ONE IS NOT OPTIONAL. The scan used to read only
 * `data-testid="literal"`, which made every TEMPLATE-LITERAL testid invisible to
 * it — a guard whose description claims "every production testid" while its
 * implementation sees one of the two spellings. That was latent (the app had no
 * templated testids) and the IA refactor made it live: `SubTabs` builds
 * `subtab-my-${noun}`, and a `combo`-spelled template would have sailed straight
 * through the combo/combination assertion below. Templated ids are expanded over
 * their declared union, so what lands in this list is what the DOM actually gets.
 */
const LITERAL_TESTIDS = Array.from(PROD_SOURCE.matchAll(/data-testid="([^"]*)"/g)).map(
  (m) => m[1],
);
/** `data-testid={`stem-${expr}`}` → one entry per member of `NOUNS`. */
const NOUNS = ['matchup', 'prompt', 'grid'] as const;
const TEMPLATED_TESTIDS = Array.from(
  PROD_SOURCE.matchAll(/data-testid=\{`([^`$]*)\$\{[^}]*\}`\}/g),
).flatMap((m) => NOUNS.map((n) => `${m[1]}${n}`));
const ALL_TESTIDS = [...LITERAL_TESTIDS, ...TEMPLATED_TESTIDS];

describe('527 Phase 1 — the renamed testid ledger', () => {
  // The positive control for every claim below: if this number is 0 the scan
  // read nothing and an empty match set would look like a clean rename.
  it('the scan actually reads the production sources', () => {
    expect(PROD_SOURCE.length).toBeGreaterThan(50_000);
    expect(new Set(ALL_TESTIDS).size).toBeGreaterThan(100);
    // 🔴 POSITIVE CONTROL ON THE SECOND PATTERN. A regex that matched nothing
    // would leave the templated half of the scan silently empty, and every claim
    // below would be about literals only — exactly the blind spot this pattern was
    // added to close. A non-zero count is what proves it CAN see them.
    expect(TEMPLATED_TESTIDS.length, 'the templated-testid scan matched nothing').toBeGreaterThan(
      0,
    );
    expect(TEMPLATED_TESTIDS).toContain('subtab-my-matchup');
  });

  it('renders exactly the 32 matchup-spelled testids of the §11.4 map, as extended', () => {
    expect(RENAMED_TESTIDS).toHaveLength(32);
    const found = new Set(ALL_TESTIDS.filter((t) => /matchup/.test(t)));
    expect([...found].sort()).toEqual([...RENAMED_TESTIDS].sort());
  });

  it('🔴 no production testid still spells combo/combination', () => {
    expect(ALL_TESTIDS.filter((t) => /combo|combination/i.test(t))).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // 🔴 THE SCAN'S BLIND SPOT, BOUNDED AND NAMED RATHER THAN LEFT SILENT.
  //
  // The two patterns above read `data-testid="literal"` and
  // `data-testid={`stem-${expr}`}`. A THIRD spelling exists and is not statically
  // resolvable: `data-testid={someVariable}`, where the value comes from a table.
  // `ContributeMenu` uses it (its three items are driven by one array, which is
  // also what a ledger test asserts over), so the ids it renders are invisible to
  // `ALL_TESTIDS` — and a `combo`-spelled id introduced that way would pass the
  // assertion above.
  //
  // What makes that acceptable is that the blind spot is CLOSED AT THE EDGES: the
  // number of such sites is pinned, so a second one cannot appear unnoticed, and
  // the ids the one site can render are pinned as source literals. Either half
  // moving fails here.
  // -------------------------------------------------------------------------
  it('🔴 pins every INDIRECT data-testid site, so the scan cannot silently miss one', () => {
    const indirect = Array.from(
      PROD_SOURCE.matchAll(/data-testid=\{\s*([A-Za-z_$][\w$]*)\s*\}/g),
    ).map((m) => m[1]);
    // A literal ledger, not a `<=`: a new indirect site is a decision someone takes.
    //
    // 🔴 THE TWO KINDS ARE NOT EQUALLY BLIND, and the distinction is the reason this
    // is a ledger of NAMES rather than a count:
    //   - `testId` (EmptyState, GridPicker) is a PROP PASS-THROUGH. The literal is
    //     supplied by the caller, in production source, so the scan above already
    //     sees it. Not a blind spot at all.
    //   - `testid` (ContributeMenu) comes from a table LOCAL to the component, so
    //     no call site carries the literal and the scan cannot reach it. That is
    //     the one genuine gap, and the literal check below closes it.
    expect(indirect.slice().sort(), 'a new indirect data-testid appeared — ledger it').toEqual([
      'testId',
      'testId',
      'testid',
    ]);

    const menu = readFileSync(resolve(SRC, 'components/ContributeMenu.tsx'), 'utf8');
    // POSITIVE CONTROL: the file really was read.
    expect(menu.length).toBeGreaterThan(1_000);
    for (const id of ['contribute-item-matchup', 'contribute-item-prompt', 'contribute-item-grid']) {
      expect(menu, `${id} is not declared in ContributeMenu`).toContain(`'${id}'`);
    }
    expect(menu).not.toMatch(/'contribute-item-(?!matchup'|prompt'|grid')/);
  });
});
