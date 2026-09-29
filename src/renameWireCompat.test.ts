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
  loraFromPick,
  parseCombination,
  parseResult,
  recordKind,
  V1_CONFIG_ID,
  type RawSharedItem,
} from './lib/benchmark.js';
import { DRAFT_PREFIX } from './lib/drafts.js';
import { CKPT_SDXL, LORA_SDXL } from './test-helpers.js';

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

  // -------------------------------------------------------------------------
  // 🔴 `LoraRef.modelId` — ADDED LATE, SO IT IS OPTIONAL FOREVER.
  //
  // The resource-link change stores a LoRA's model id so its title can be a link.
  // Every LoRA already on the shared board was written WITHOUT it, and nothing can
  // ever rewrite those rows (`shared.update`/`withdraw` are author-scoped, and the
  // board is cross-viewer). So the field is permanently optional, and a parse that
  // rejected or threw on its absence would empty the board for every viewer with no
  // recovery path — the same class of unrecoverable break the `kind: 'combination'`
  // literal is pinned against, one field down.
  //
  // BOTH DIRECTIONS are covered, because each is blind to the other's failure:
  // reading an OLD row that lacks it, and round-tripping a NEW row that has it.
  // -------------------------------------------------------------------------
  it('🔴 READ: a LoRA with NO `modelId` still parses, and gains no phantom one', () => {
    // `PRE_RENAME_V1_ROW`'s LoRA carries `modelId: 800`, so it cannot serve here —
    // this needs a row whose LoRA genuinely lacks the field, which is what every row
    // published before the resource-link change looks like. Written out as BYTES for
    // the reason the frozen fixtures above are: a fixture produced by this repo's own
    // builder would grow the field alongside the code and stay green through exactly
    // the break it is meant to catch.
    const preModelIdLora: RawSharedItem = {
      key: 'shared_01HZQ8NOMODELID',
      count: 1,
      authorUserId: 9,
      viewerVoted: false,
      value: {
        title: 'Pre-modelId LoRA stack',
        body: '',
        data: {
          v: 2,
          kind: 'combination',
          configs: [
            {
              id: 'cfg_old',
              checkpoint: { versionId: 3003, modelId: 700, baseModel: 'Flux.1 D' },
              loras: [{ versionId: 4004, weight: 0.6, minStrength: 0, maxStrength: 1 }],
            },
          ],
        },
      },
    } as unknown as RawSharedItem;

    const parsed = parseCombination(preModelIdLora);
    // The row is READABLE — the claim that matters, and the one whose failure would
    // be unrecoverable.
    expect(parsed).not.toBeNull();
    expect(parsed!.data.configs).toHaveLength(1);
    const lora = parsed!.data.configs[0]!.loras[0]!;
    expect(lora.versionId).toBe(4004);
    expect(lora.weight).toBe(0.6);
    // 🔴 AND NO PHANTOM VALUE IS INVENTED. A parse that defaulted `modelId` to 0, or
    // to the checkpoint's 700, would put a WRONG model id on the wire for this row,
    // permanently and unfixably — the row belongs to its author, so no later build can
    // correct it. The field must be ABSENT, not falsy.
    //
    // ⚠️ RETRACTED, BECAUSE IT NAMED A UI CONSEQUENCE THAT DOES NOT EXIST: this used to
    // say the default "would make `ResourceLink` render a LINK TO THE WRONG MODEL —
    // worse than plain text, because a wrong link cannot be told from a right one by
    // looking". `ResourceLink` was removed before release; `ResourceName` renders every
    // resource as plain text whatever `modelId` says, so nothing renders a link at all
    // today. The DATA argument above is the real one and it is strictly stronger — it
    // does not depend on when, or whether, a caller ever appears (`civitai/civitai`
    // **#5209**).
    expect(lora.modelId).toBeUndefined();
    expect('modelId' in lora).toBe(false);
  });

  it('🔴 WRITE→READ: a LoRA WITH `modelId` survives publish and re-read', () => {
    const built = buildCombinationPayload({
      name: 'Linked LoRA',
      description: 'written after the resource-link change',
      configs: [
        {
          id: 'cfg_new',
          checkpoint: checkpointFromPick(CKPT_SDXL),
          loras: [loraFromPick(LORA_SDXL)],
        },
      ],
    });

    // What the BUILDER emits — the wire bytes another viewer's client will read.
    const wire = built.data as {
      configs: { loras: { versionId: number; modelId?: number }[] }[];
    };
    // Literals, not `LORA_SDXL.modelId`: an expectation read out of the same fixture
    // the implementation read cannot check it.
    expect(wire.configs[0]!.loras[0]!.modelId).toBe(900);
    expect(wire.configs[0]!.loras[0]!.versionId).toBe(2002);

    const reread = parseCombination({
      key: 'k',
      count: 0,
      authorUserId: 1,
      viewerVoted: false,
      value: built,
    } as unknown as RawSharedItem);
    expect(reread).not.toBeNull();
    const lora = reread!.data.configs[0]!.loras[0]!;
    expect(lora.modelId).toBe(900);
    // 🔴 DISTINCT FROM THE CHECKPOINT'S, on purpose. `CKPT_SDXL.modelId` is 500 and
    // `LORA_SDXL.modelId` is 900, so a parse (or a builder) that copied the
    // checkpoint's id onto the LoRA fails here. Fixtures whose values could coincide
    // cannot see that mutant at all.
    expect(reread!.data.configs[0]!.checkpoint.modelId).toBe(500);
  });

  it('🔴 a LoRA `modelId` that is NOT a number is dropped, not carried through', () => {
    // `data` is an opaque, unmoderated blob written by other clients (and by older
    // revisions of this one). A string or null carried through here would sit in the
    // parsed `LoraRef` as a non-number `modelId`, which the TYPE says cannot happen —
    // so every future consumer is entitled to assume it. Dropping it at the parse is
    // what makes that assumption true.
    //
    // ⚠️ RETRACTED: this used to justify the case by "a string or null here reaching
    // `ResourceLink` would build `/models/null`". There is no `ResourceLink` and no
    // consumer of `modelId` at all — see the field's docblock in `src/types.ts`. The
    // type-integrity argument above is what the case actually rests on.
    const junk: RawSharedItem = {
      key: 'shared_01HZQ8JUNK',
      count: 0,
      authorUserId: 9,
      viewerVoted: false,
      value: {
        title: 'Junk modelId',
        body: '',
        data: {
          v: 2,
          kind: 'combination',
          configs: [
            {
              id: 'cfg_junk',
              checkpoint: { versionId: 3003, modelId: 700, baseModel: 'Flux.1 D' },
              loras: [{ versionId: 4004, modelId: 'nope', weight: 0.5 }],
            },
          ],
        },
      },
    } as unknown as RawSharedItem;

    const parsed = parseCombination(junk);
    expect(parsed).not.toBeNull();
    const lora = parsed!.data.configs[0]!.loras[0]!;
    expect(lora.versionId).toBe(4004);
    expect('modelId' in lora).toBe(false);
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
  'matchup-config-summary',
  'matchup-description',
  'matchup-edit',
  'matchup-errors',
  'matchup-form',
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
  // 🔴 THE LEDGER IS THE SET, SO IT MOVES WHEN THE SURFACE DOES — deliberately, in one
  // place, with the reason written down. TWO generations of movement are recorded here,
  // because the second one retired three names the first one added.
  //
  // The IA refactor deleted the top-level tab strip (so `view-switch-matchups` has no
  // renderer any more) and added:
  //   - `section-matchups`        the page section that replaced the tab;
  //   - `contribute-item-matchup` the Contribute menu item that replaced its submit
  //                               route — NEVER in this list, because the scan below
  //                               cannot see it (it reached the DOM through a variable).
  //                               That gap was bounded by its own case at the end of
  //                               this describe block; the component is now DELETED and
  //                               that case points at `SideNav` instead;
  //   - `matchup-detail*`         the drill-in modal the grid's group band opens;
  //   - `subtab-*-matchup`        the sub-tab strip, which had to become object-scoped
  //                               once matchups and prompts were mounted TOGETHER.
  //
  // 🔴 THE SIDEBAR CHANGE THEN DELETED THE SUB-TAB STRIP OUTRIGHT — "my work" is a
  // sidebar destination, not a per-board toggle — so `subtabs-matchup`,
  // `subtab-my-matchup` and `subtab-community-matchup` have NO RENDERER and are removed
  // from this ledger. Three names in, three out; the count is coincidence, not a rule.
  // The three that replace them:
  //   - `board-nav-matchups`      the board subnav segment that mounts this board
  //                               (PLURAL — it names a board, not an object kind);
  //   - `section-my-matchup`      the viewer's own matchup surface;
  //   - `my-published-matchup`    that surface's own published-rows list.
  'board-nav-matchups',
  'matchup-detail',
  'matchup-detail-config',
  'matchup-detail-configs',
  'my-published-matchup',
  // ---- added by the THIRD IA pass, which also retired two ----
  // 🔴 TWO NAMES OUT, THREE IN, and the arithmetic is written down because the
  // length assertion below is a literal someone has to move on purpose:
  //   OUT `matchup-included`     — the Included badge and its whole-string tooltip are
  //                               DELETED (every badge went, both modals, operator
  //                               decision). `IncludedSummary.test.tsx` records which
  //                               case that retired and why it was not retargeted.
  //   OUT `matchup-config-count` — the "N configs" pill, deleted with the rest.
  //   IN  `matchup-menu`         — the row's ⋮ overflow TRIGGER. Edit, Remove and
  //                               Report moved behind it, so ~30 test call sites now
  //                               open it first (`openRowMenu` in `test-helpers.tsx`).
  //   IN  `matchup-menu-items`   — that menu's PANEL. 🔴 It reaches the DOM through
  //                               `Menu`'s `panelTestId` prop, NOT a `data-testid=`
  //                               attribute, so the scan had to grow a third pattern
  //                               to see it at all — see `PANEL_TESTIDS` below. That
  //                               is a WIDENING of the scan, not an exemption from it:
  //                               the id is in this ledger like every other.
  //   IN  `grid-group-matchup-name` — the underlined NAME inside the grid's matchup
  //                               band. The band itself keeps `grid-group-matchup`
  //                               (an external capture recipe CLICKS it); the child
  //                               exists so a test can pin the underline on the name
  //                               rather than on the whole button, which also carries
  //                               the vote count.
  'my-sign-in-matchup',
  'my-signed-out-matchup',
  'grid-group-matchup-name',
  'matchup-menu',
  'matchup-menu-items',
  'section-matchups',
  'section-my-matchup',
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
/**
 * `data-testid={`stem-${expr}`}` → one entry per member of the union `expr` ranges over.
 *
 * 🔴 THE UNION IS CHOSEN BY THE VARIABLE'S NAME, AND IT USED TO BE HARDCODED TO ONE
 * UNION. Every templated testid was expanded over `NOUNS` — which was right while every
 * template was `${noun}`, and became WRONG the moment `BoardNav` introduced
 * `board-nav-${board}`: the scan produced `board-nav-matchup` (an id nothing renders)
 * and never produced `board-nav-matchups` (the id it does). A ledger built on that is
 * asserting fiction in both directions at once.
 *
 * 🔴 AND AN UNKNOWN VARIABLE FAILS LOUDLY rather than being silently mis-expanded —
 * see the `unknown templated testid variable` case. Adding a third union is a two-line
 * change; guessing which one a new variable means is how the above happened.
 */
const NOUNS = ['matchup', 'prompt', 'grid'] as const;
const BOARDS = ['matchups', 'prompts', 'grids'] as const;
const TEMPLATE_UNIONS: Record<string, readonly string[]> = { noun: NOUNS, board: BOARDS };
/**
 * 🔴 THE EXPRESSION MAY BE A MEMBER ACCESS, and the union is keyed on its LAST
 * segment. `App` renders `section-my-${view.noun}`, so a pattern that only accepted a
 * bare identifier matched nothing there — and a template the scan does not match is a
 * set of ids that silently leaves `ALL_TESTIDS`, which is the same blind spot in a new
 * shape (measured: `section-my-matchup` was missing from the scan while being rendered).
 * Taking the last segment is a heuristic, and it is a SAFE one only because the
 * known-union guard below turns anything unexpected into a failure rather than a zero.
 */
const TEMPLATED_MATCHES = Array.from(
  PROD_SOURCE.matchAll(/data-testid=\{`([^`$]*)\$\{\s*([A-Za-z_$][\w$.]*)\s*\}`\}/g),
).map((m) => ({ stem: m[1]!, variable: m[2]!.split('.').pop()! }));
const TEMPLATED_TESTIDS = TEMPLATED_MATCHES.flatMap(({ stem, variable }) =>
  (TEMPLATE_UNIONS[variable] ?? []).map((v) => `${stem}${v}`),
);
/**
 * `panelTestId="literal"` → the PANEL id of a `components/Menu.tsx` dropdown.
 *
 * 🔴 A THIRD PATTERN, AND IT IS A WIDENING OF THE SCAN RATHER THAN AN EXEMPTION
 * FROM IT. `Menu` carries two test hooks — the ⋮ trigger's (`data-testid`) and its
 * panel's — because one component cannot spell two ids under one attribute name,
 * and deriving the panel's from the trigger's would be a template over a variable
 * this scan's own union-guard does not know. The consequence is that the panel ids
 * ARE production-source literals but sit under a prop name the first pattern cannot
 * see, so `matchup-menu-items` would have been rendered on every matchup row while
 * being absent from `ALL_TESTIDS` — the exact "an empty match set reads as a clean
 * sweep" failure this whole file is built against, in a fourth shape.
 *
 * Reading the prop name is sound for the same reason reading `data-testid` is: the
 * literal is at the CALL SITE, in production source. It is not a pass-through the
 * scan already sees, because the attribute name differs.
 */
const PANEL_TESTIDS = Array.from(PROD_SOURCE.matchAll(/panelTestId="([^"]*)"/g)).map(
  (m) => m[1],
);
const ALL_TESTIDS = [...LITERAL_TESTIDS, ...TEMPLATED_TESTIDS, ...PANEL_TESTIDS];

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
    // Two live examples, one per union, so a mapping that lost either half fails here.
    expect(TEMPLATED_TESTIDS).toContain('my-signed-out-matchup');
    expect(TEMPLATED_TESTIDS).toContain('board-nav-matchups');
    // 🔴 POSITIVE CONTROL ON THE THIRD PATTERN, for the same reason as the second:
    // a `panelTestId=` regex that matched nothing would silently drop both ⋮ panels
    // out of `ALL_TESTIDS`, and the ledger assertion below would pass while covering
    // neither. A non-zero count is what proves the pattern CAN see them, and the two
    // literals are what prove it sees the right ones.
    expect(PANEL_TESTIDS.length, 'the panelTestId scan matched nothing').toBeGreaterThan(0);
    expect(PANEL_TESTIDS.slice().sort()).toEqual(['matchup-menu-items', 'prompt-menu-items']);
  });

  it('🔴 every templated testid variable maps to a KNOWN union', () => {
    // 🔴 THE GUARD ON THE SCAN ITSELF. A variable the mapping does not know contributes
    // ZERO entries, so its ids vanish from `ALL_TESTIDS` and every ledger assertion
    // below silently stops covering them — an empty match set reading as a clean sweep,
    // which is the failure this whole file is built against. MEASURED as the real thing
    // rather than a hypothetical: `board-nav-${board}` was expanded over the NOUN union
    // for one round, which invented `board-nav-matchup` and hid `board-nav-matchups`.
    const seen = TEMPLATED_MATCHES.map((m) => m.variable);
    // POSITIVE CONTROL: the scan found some.
    expect(seen.length).toBeGreaterThan(0);
    for (const variable of seen) {
      expect(
        TEMPLATE_UNIONS[variable],
        `unknown templated testid variable \`${variable}\` — add its union to TEMPLATE_UNIONS`,
      ).toBeDefined();
    }
  });

  it('renders exactly the 33 matchup-spelled testids of the §11.4 map, as extended', () => {
    expect(RENAMED_TESTIDS).toHaveLength(33);
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
    //   - `testid` (SideNav — previously ContributeMenu) comes from a table LOCAL to
    //     the component, so no call site carries the literal and the scan cannot reach
    //     it. That is the one genuine gap, and the literal check below closes it.
    //
    // ⚠️ THE OWNER OF THE THIRD ENTRY MOVED. It was `ContributeMenu`'s three-item table;
    // that component is deleted and `SideNav`'s My Benchmarks sub-items are driven by
    // the same shape, so the gap is the same size in a different file. The COUNT is
    // unchanged, which is exactly why a count alone would not have noticed the move —
    // hence a ledger of names plus the file-scoped literal check below.
    //
    // ⚠️ THE THIRD IA PASS ADDED THREE MORE, ALL PASS-THROUGHS — i.e. the harmless
    // kind, and the reason this list is names rather than a number:
    //   - `testId`      ×2 — `Menu`'s ⋮ trigger and `MenuItem`. Both literals are
    //                        supplied at the call site under `data-testid="…"`, so the
    //                        first scan pattern already sees them.
    //   - `panelTestId`     — `Menu`'s panel. Its literal is at the call site too, but
    //                        under a DIFFERENT attribute name, which is why the scan
    //                        grew `PANEL_TESTIDS`. Not a blind spot either, now.
    // What is NOT here, and must never be: a menu whose items come from a table local
    // to the component. That would be the `SideNav` shape of gap all over again.
    expect(indirect.slice().sort(), 'a new indirect data-testid appeared — ledger it').toEqual([
      'panelTestId',
      'testId',
      'testId',
      'testId',
      'testId',
      'testid',
    ]);

    const nav = readFileSync(resolve(SRC, 'components/SideNav.tsx'), 'utf8');
    // POSITIVE CONTROL: the file really was read.
    expect(nav.length).toBeGreaterThan(1_000);
    for (const id of ['nav-my-grid', 'nav-my-matchup', 'nav-my-prompt']) {
      expect(nav, `${id} is not declared in SideNav`).toContain(`'${id}'`);
    }
    expect(nav).not.toMatch(/'nav-my-(?!grid'|matchup'|prompt')/);

    // 🔴 AND THE DELETED COMPONENT'S IDS ARE GONE FROM THE WHOLE PRODUCTION TREE, not
    // merely from this one file. The scan above cannot see a variable-driven testid, so
    // "no `contribute-item-*` in ALL_TESTIDS" would have been true even while the menu
    // still existed — this is the check that is not vacuous.
    expect(PROD_SOURCE).not.toContain('contribute-item-');
    expect(PROD_SOURCE).not.toContain('contribute-trigger');
  });
});
