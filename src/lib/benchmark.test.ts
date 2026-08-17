import { describe, expect, it } from 'vitest';
import type { BlockResourceInfo } from '@civitai/app-sdk/blocks';

import type { CombinationRow, ModelConfig, PromptRow, ResultRow } from '../types.js';
import {
  buildCellWorkflowBody,
  buildCombinationPayload,
  buildPromptPayload,
  buildResultPayload,
  cellHasResult,
  cellKey,
  checkpointFromPick,
  clampWeight,
  combinationToInput,
  comboVersionIds,
  configLabel,
  flattenConfigs,
  includedSummary,
  indexResultsByCell,
  loraFromPick,
  newConfig,
  parseCombination,
  parsePrompt,
  parseResult,
  promptToInput,
  reconcileOptimistic,
  resolveCell,
  splitRows,
  topByVotes,
  V1_CONFIG_ID,
  validateCombination,
  validatePrompt,
  type PendingOptimistic,
  type RawSharedItem,
} from './benchmark.js';

const CKPT: BlockResourceInfo = {
  versionId: 1001,
  modelId: 500,
  modelName: 'JuggernautXL',
  versionName: 'v9',
  baseModel: 'SDXL 1.0',
  modelType: 'Checkpoint',
};
const LORA: BlockResourceInfo = {
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

/** A config with the SDXL checkpoint + one LoRA (weight 0.8). */
function sdxlConfig(over: Partial<ModelConfig> = {}): ModelConfig {
  return {
    id: 'cfg1',
    checkpoint: { versionId: 1001, modelId: 500, baseModel: 'SDXL 1.0', modelName: 'JuggernautXL' },
    loras: [{ versionId: 2002, weight: 0.8, minStrength: 0, maxStrength: 1.5, modelName: 'Detail Tweaker' }],
    ...over,
  };
}

function comboRow(over: Partial<CombinationRow> = {}): CombinationRow {
  return {
    key: 'c1',
    count: 0,
    authorUserId: 1,
    name: 'Combo',
    description: '',
    data: { v: 2, kind: 'combination', configs: [sdxlConfig()] },
    ...over,
  };
}

function promptRow(over: Partial<PromptRow> = {}): PromptRow {
  return {
    key: 'p1',
    count: 0,
    authorUserId: 1,
    name: 'Portrait',
    description: '',
    data: {
      v: 3,
      kind: 'prompt',
      default: { prompt: 'cyberpunk portrait', params: { cfgScale: 5, steps: 30, sampler: 'Euler', negativePrompt: 'blurry' } },
      overrides: { Pony: { prompt: 'score_9 portrait', params: { cfgScale: 7 } } },
    },
    ...over,
  };
}

describe('clampWeight', () => {
  it('clamps into range and handles non-finite', () => {
    expect(clampWeight(3, 0, 1.5)).toBe(1.5);
    expect(clampWeight(-2, -1, 2)).toBe(-1);
    expect(clampWeight(NaN, 0, 1)).toBe(1); // default weight
  });
  it('leaves value as-is on a degenerate range', () => {
    expect(clampWeight(0.5, 2, 1)).toBe(0.5);
  });
});

describe('resource-pick mapping', () => {
  it('maps a checkpoint pick', () => {
    expect(checkpointFromPick(CKPT)).toEqual({
      versionId: 1001,
      modelId: 500,
      baseModel: 'SDXL 1.0',
      modelName: 'JuggernautXL',
      versionName: 'v9',
    });
  });
  it('seeds + clamps a LoRA weight from the pick', () => {
    const l = loraFromPick(LORA);
    expect(l.versionId).toBe(2002);
    expect(l.weight).toBe(0.8);
    expect(l.minStrength).toBe(0);
    expect(l.maxStrength).toBe(1.5);
  });
  it('mints a fresh empty config with a stable id', () => {
    const a = newConfig();
    const b = newConfig();
    expect(a.id).not.toBe(b.id);
    expect(a.loras).toEqual([]);
  });
});

describe('combination payload (v2 multi-config, moderation split)', () => {
  it('puts name/description/labels/resource-names in title/body and configs in opaque data', () => {
    const v = buildCombinationPayload({
      name: 'My Combo',
      description: 'a stack',
      configs: [
        { id: 'cfg1', label: 'base', checkpoint: checkpointFromPick(CKPT), loras: [] },
        { id: 'cfg2', label: 'with detail', checkpoint: checkpointFromPick(CKPT), loras: [loraFromPick(LORA)] },
      ],
    });
    expect(v.title).toBe('My Combo');
    expect(v.body).toContain('a stack');
    // resource display names + config labels ride the MODERATED body
    expect(v.body).toContain('JuggernautXL');
    expect(v.body).toContain('Detail Tweaker');
    expect(v.body).toContain('base');
    expect(v.body).toContain('with detail');
    const data = v.data as { v: number; kind: string; configs: Array<{ checkpoint: { versionId: number } }> };
    expect(data.v).toBe(2);
    expect(data.kind).toBe('combination');
    expect(data.configs).toHaveLength(2);
    expect(data.configs[0].checkpoint.versionId).toBe(1001);
  });

  it('drops half-filled configs (no checkpoint)', () => {
    const v = buildCombinationPayload({
      name: 'C',
      description: '',
      configs: [
        { id: 'a', checkpoint: checkpointFromPick(CKPT), loras: [] },
        newConfig(), // no checkpoint → dropped
      ],
    });
    const data = v.data as { configs: unknown[] };
    expect(data.configs).toHaveLength(1);
  });

  it('validates required fields', () => {
    expect(
      validateCombination({ name: '', description: '', configs: [{ id: 'a', checkpoint: checkpointFromPick(CKPT), loras: [] }] }),
    ).toContain('Give the combination a name.');
    expect(validateCombination({ name: 'X', description: '', configs: [newConfig()] })).toContain(
      'Add at least one model config (pick a checkpoint).',
    );
  });
});

describe('prompt payload (v3 default + overrides, moderation split)', () => {
  it('sweeps the default AND every override prompt string (+ negatives) into the moderated body', () => {
    const v = buildPromptPayload({
      name: 'Portrait',
      description: 'desc',
      default: { prompt: 'default prompt', params: { negativePrompt: 'default neg' } },
      overrides: {
        Pony: { prompt: 'pony prompt', params: { negativePrompt: 'pony neg' } },
        Flux: { params: { cfgScale: 3.5 } }, // params-only override (no prompt)
      },
    });
    expect(v.title).toBe('Portrait');
    expect(v.body).toContain('default prompt');
    expect(v.body).toContain('default neg'); // default negative moderated
    expect(v.body).toContain('pony prompt');
    expect(v.body).toContain('pony neg'); // override negatives moderated too
    const data = v.data as { v: number; kind: string; default: { prompt: string }; overrides: Record<string, unknown> };
    expect(data.v).toBe(3);
    expect(data.kind).toBe('prompt');
    expect(data.default.prompt).toBe('default prompt');
    expect(Object.keys(data.overrides).sort()).toEqual(['Flux', 'Pony']);
  });

  it('drops an empty override (no prompt, no params) and trims the default prompt', () => {
    const v = buildPromptPayload({
      name: 'x',
      description: '',
      default: { prompt: '  ok  ', params: {} },
      overrides: { Pony: { prompt: '   ', params: {} }, SDXL: { prompt: 'sdxl', params: {} } },
    });
    const data = v.data as { default: { prompt: string }; overrides?: Record<string, unknown> };
    expect(data.default.prompt).toBe('ok');
    expect(Object.keys(data.overrides ?? {})).toEqual(['SDXL']); // Pony (empty) dropped
  });

  it('omits `overrides` entirely when there are none', () => {
    const v = buildPromptPayload({ name: 'x', description: '', default: { prompt: 'ok', params: {} }, overrides: {} });
    expect((v.data as { overrides?: unknown }).overrides).toBeUndefined();
  });

  it('requires a non-empty default prompt', () => {
    expect(validatePrompt({ name: 'x', description: '', default: { prompt: '  ', params: {} }, overrides: {} }))
      .toContain('Add a default prompt (it applies to every ecosystem).');
    expect(validatePrompt({ name: 'x', description: '', default: { prompt: 'ok', params: {} }, overrides: {} }))
      .toHaveLength(0);
  });
});

describe('parse / migrate (defensive)', () => {
  const raw = (data: unknown, over: Partial<RawSharedItem> = {}): RawSharedItem => ({
    key: 'k',
    count: 3,
    authorUserId: 1,
    value: { title: 'T', body: 'B', data },
    ...over,
  });

  it('parses a v2 multi-config combination round-trip and re-clamps stale weights', () => {
    const v = buildCombinationPayload({
      name: 'C',
      description: 'd',
      configs: [{ id: 'cfg1', checkpoint: checkpointFromPick(CKPT), loras: [{ ...loraFromPick(LORA), weight: 99 }] }],
    });
    const parsed = parseCombination({ key: 'k', count: 5, authorUserId: 2, value: v });
    expect(parsed).not.toBeNull();
    expect(parsed!.name).toBe('C');
    expect(parsed!.count).toBe(5);
    expect(parsed!.data.v).toBe(2);
    expect(parsed!.data.configs[0].loras[0].weight).toBe(1.5); // re-clamped into [0,1.5]
  });

  it('🔴 MIGRATES a legacy v1 combination (checkpoint+loras) into a single v2 config', () => {
    const v1 = {
      v: 1,
      kind: 'combination',
      checkpoint: { versionId: 1001, modelId: 500, baseModel: 'SDXL 1.0', modelName: 'JuggernautXL' },
      loras: [{ versionId: 2002, weight: 0.8, minStrength: 0, maxStrength: 1.5, modelName: 'Detail Tweaker' }],
    };
    const parsed = parseCombination(raw(v1, { key: 'legacy', count: 2 }));
    expect(parsed).not.toBeNull();
    expect(parsed!.data.v).toBe(2);
    expect(parsed!.data.configs).toHaveLength(1);
    expect(parsed!.data.configs[0].id).toBe(V1_CONFIG_ID);
    expect(parsed!.data.configs[0].checkpoint.versionId).toBe(1001);
    expect(parsed!.data.configs[0].loras[0].versionId).toBe(2002);
  });

  it('rejects a row of the wrong kind / bad version and a config-less combination', () => {
    expect(parseCombination(raw({ v: 1, kind: 'prompt' }))).toBeNull();
    expect(parseCombination(raw({ v: 3, kind: 'combination', configs: [] }))).toBeNull();
    expect(parseCombination(raw({ v: 2, kind: 'combination', configs: [] }))).toBeNull();
    // v2 with only a junk config (no valid checkpoint) → null
    expect(parseCombination(raw({ v: 2, kind: 'combination', configs: [{ id: 'x', loras: [] }] }))).toBeNull();
    expect(parsePrompt(raw({ v: 1, kind: 'combination' }))).toBeNull();
    expect(parseResult(raw({ v: 1, kind: 'prompt' }))).toBeNull();
  });

  it('parses a v3 prompt (default + overrides) and drops empty overrides', () => {
    const p = parsePrompt(
      raw({
        v: 3,
        kind: 'prompt',
        default: { prompt: 'base', params: { cfgScale: 6 } },
        overrides: { Pony: { prompt: 'pony', params: {} }, Flux: { prompt: '  ', params: {} } },
      }),
    );
    expect(p).not.toBeNull();
    expect(p!.data.v).toBe(3);
    expect(p!.data.default.prompt).toBe('base');
    expect(Object.keys(p!.data.overrides ?? {})).toEqual(['Pony']); // Flux (empty) dropped
  });

  it('returns null for a v3 prompt with no usable default prompt', () => {
    expect(parsePrompt(raw({ v: 3, kind: 'prompt', default: { prompt: '  ', params: {} } }))).toBeNull();
    expect(parsePrompt(raw({ v: 3, kind: 'prompt' }))).toBeNull();
  });

  it('🔴 MIGRATES a legacy v1 byEcosystem prompt → v3 default + overrides (SDXL preferred as default)', () => {
    const p = parsePrompt(
      raw({
        v: 1,
        kind: 'prompt',
        byEcosystem: {
          Pony: { prompt: 'pony prompt', params: { cfgScale: 7 } },
          SDXL: { prompt: 'sdxl prompt', params: { cfgScale: 5 } },
          Flux: { prompt: 'flux prompt', params: { cfgScale: 3.5 } },
        },
      }),
    );
    expect(p).not.toBeNull();
    expect(p!.data.v).toBe(3);
    // SDXL is present → chosen as the default; the rest become overrides.
    expect(p!.data.default.prompt).toBe('sdxl prompt');
    expect(Object.keys(p!.data.overrides ?? {}).sort()).toEqual(['Flux', 'Pony']);
    expect(p!.data.overrides!.Pony.prompt).toBe('pony prompt');
    expect(p!.data.overrides!.Flux.params!.cfgScale).toBe(3.5);
  });

  it('🔴 MIGRATES a v1 prompt with NO SDXL entry using the first entry as default', () => {
    const p = parsePrompt(
      raw({ v: 1, kind: 'prompt', byEcosystem: { Flux: { prompt: 'flux', params: {} }, Pony: { prompt: 'pony', params: {} } } }),
    );
    expect(p!.data.default.prompt).toBe('flux'); // first insertion-ordered entry
    expect(Object.keys(p!.data.overrides ?? {})).toEqual(['Pony']);
  });

  it('🔴 collapses identical v1 entries into just the default (no redundant overrides)', () => {
    const same = { prompt: 'same', params: { cfgScale: 7, steps: 30 } };
    const p = parsePrompt(raw({ v: 1, kind: 'prompt', byEcosystem: { SDXL: same, Pony: same } }));
    expect(p!.data.default.prompt).toBe('same');
    expect(p!.data.overrides).toBeUndefined(); // Pony identical to default → collapsed
  });

  it('returns null for a v1 prompt with no usable ecosystem', () => {
    expect(parsePrompt(raw({ v: 1, kind: 'prompt', byEcosystem: {} }))).toBeNull();
  });

  it('parses a v2 result and filters non-numeric image ids', () => {
    const r = parseResult(raw({ v: 2, kind: 'result', comboKey: 'c1', configId: 'cfg1', promptKey: 'p1', ecosystem: 'SDXL', imageIds: [1, 2, 'x', null] }));
    expect(r).not.toBeNull();
    expect(r!.data.configId).toBe('cfg1');
    expect(r!.data.imageIds).toEqual([1, 2]);
  });

  it('🔴 MIGRATES a legacy v1 result (no configId) to V1_CONFIG_ID', () => {
    const r = parseResult(raw({ v: 1, kind: 'result', comboKey: 'c1', promptKey: 'p1', ecosystem: 'SDXL', imageIds: [7] }));
    expect(r).not.toBeNull();
    expect(r!.data.v).toBe(2);
    expect(r!.data.configId).toBe(V1_CONFIG_ID);
  });

  it('records the PROMPT-submitter attribution on the result payload and round-trips it', () => {
    const v = buildResultPayload({
      comboKey: 'c1',
      configId: 'cfg1',
      promptKey: 'p1',
      ecosystem: 'SDXL',
      imageIds: [7],
      promptAuthorUserId: 42,
    });
    const parsed = parseResult({ key: 'r1', count: 0, authorUserId: 9, value: v });
    expect(parsed).not.toBeNull();
    // The row's authorUserId is the RUNNER (9); the prompt-submitter attribution
    // (42) is recorded separately in the payload data.
    expect(parsed!.authorUserId).toBe(9);
    expect(parsed!.data.promptAuthorUserId).toBe(42);
  });

  it('omits prompt attribution when absent and drops a non-numeric one defensively', () => {
    const noAttr = parseResult(raw({ v: 2, kind: 'result', comboKey: 'c1', configId: 'cfg1', promptKey: 'p1', ecosystem: 'SDXL', imageIds: [1] }));
    expect(noAttr!.data.promptAuthorUserId).toBeUndefined();
    const badAttr = parseResult(raw({ v: 2, kind: 'result', comboKey: 'c1', configId: 'cfg1', promptKey: 'p1', ecosystem: 'SDXL', imageIds: [1], promptAuthorUserId: 'nope' }));
    expect(badAttr!.data.promptAuthorUserId).toBeUndefined();
  });
});

describe('splitRows', () => {
  it('splits a mixed list into typed combos / prompts / results', () => {
    const items: RawSharedItem[] = [
      { key: 'c1', count: 1, authorUserId: 1, value: buildCombinationPayload({ name: 'C', description: '', configs: [{ id: 'a', checkpoint: checkpointFromPick(CKPT), loras: [] }] }) },
      { key: 'p1', count: 2, authorUserId: 1, value: buildPromptPayload({ name: 'P', description: '', default: { prompt: 'x', params: {} }, overrides: {} }) },
      { key: 'r1', count: 0, authorUserId: 1, value: buildResultPayload({ comboKey: 'c1', configId: 'a', promptKey: 'p1', ecosystem: 'SDXL', imageIds: [7] }) },
      { key: 'junk', count: 0, authorUserId: 1, value: { title: 'x', body: '', data: { hello: true } } },
    ];
    const { combinations, prompts, results } = splitRows(items);
    expect(combinations.map((c) => c.key)).toEqual(['c1']);
    expect(prompts.map((p) => p.key)).toEqual(['p1']);
    expect(results.map((r) => r.key)).toEqual(['r1']);
  });
});

describe('topByVotes (included set)', () => {
  it('takes top-N by count desc, tie-broken by key (deterministic)', () => {
    const rows = [
      { key: 'b', count: 5 },
      { key: 'a', count: 5 },
      { key: 'c', count: 9 },
      { key: 'd', count: 1 },
    ];
    expect(topByVotes(rows, 3).map((r) => r.key)).toEqual(['c', 'a', 'b']);
  });
  it('N<=0 is empty; default N applies', () => {
    expect(topByVotes([{ key: 'a', count: 1 }], 0)).toEqual([]);
    expect(topByVotes([{ key: 'a', count: 1 }]).map((r) => r.key)).toEqual(['a']);
  });
});

describe('includedSummary (header copy)', () => {
  // Pinned literal strings, NOT re-derived from the implementation: these are a
  // user-facing contract and the whole point of the helper is the exact wording.
  it('agrees in number — "is" for one row, "are" for several', () => {
    expect(includedSummary(1, 'row')).toBe(
      "The top 1 by votes is showing as the grid's row in your view.",
    );
    expect(includedSummary(4, 'row')).toBe(
      "The top 4 by votes are showing as the grid's rows in your view.",
    );
    // The defect this replaces rendered "The top 1 are included as the grid's
    // rows." — observed live on 2026-08-17 with exactly one combination.
    expect(includedSummary(1, 'row')).not.toContain('1 by votes are');
  });

  it('never leaks the literal placeholder "N" when nothing is included', () => {
    for (const n of [0, -1]) {
      const s = includedSummary(n, 'column');
      expect(s).toBe("The top-voted ones become the grid's columns.");
      // The old copy was `The top {size || 'N'} are …`, which printed a bare
      // "N" at users. Assert on the whole normalised string AND on the token,
      // so a reword cannot quietly reintroduce it.
      expect(s).not.toMatch(/\btop N\b/);
    }
  });

  it('never asserts a fact about the SHARED grid — inclusion is per-viewer', () => {
    // topN is the Grid tab's personal "Show top N" slider, so a sentence
    // claiming what "the grid's columns" ARE would be wrong for every viewer
    // whose slider differs. Any non-empty summary must scope itself.
    for (const n of [1, 2, 7]) {
      for (const noun of ['row', 'column'] as const) {
        expect(includedSummary(n, noun)).toContain('in your view');
      }
    }
  });

  it('uses the noun it is given', () => {
    expect(includedSummary(3, 'column')).toContain("grid's columns");
    expect(includedSummary(3, 'row')).toContain("grid's rows");
  });
});

describe('flattenConfigs (grid rows are configs grouped under combos)', () => {
  it('flattens combos into per-config rows in combo-then-config order', () => {
    const combos = [
      comboRow({ key: 'c1', name: 'One', count: 3, data: { v: 2, kind: 'combination', configs: [sdxlConfig({ id: 'a', label: 'base' }), sdxlConfig({ id: 'b', label: 'detail' })] } }),
      comboRow({ key: 'c2', name: 'Two', count: 1, data: { v: 2, kind: 'combination', configs: [sdxlConfig({ id: 'c' })] } }),
    ];
    const rows = flattenConfigs(combos);
    expect(rows.map((r) => [r.comboKey, r.config.id])).toEqual([
      ['c1', 'a'],
      ['c1', 'b'],
      ['c2', 'c'],
    ]);
    expect(rows[0].comboName).toBe('One');
    expect(rows[0].comboCount).toBe(3);
    expect(configLabel(rows[0])).toBe('base');
    // Falls back to checkpoint name when no label
    expect(configLabel(rows[2])).toBe('JuggernautXL');
  });
});

describe('cell dedup (first-append-wins, keyed on config)', () => {
  const mk = (key: string, comboKey: string, configId: string, promptKey: string): ResultRow => ({
    key,
    authorUserId: 1,
    data: { v: 2, kind: 'result', comboKey, configId, promptKey, ecosystem: 'SDXL', imageIds: [1] },
  });

  it('the earliest (lexically-smallest key) result wins for a duplicated cell', () => {
    const idx = indexResultsByCell([mk('r9', 'c1', 'cfg1', 'p1'), mk('r1', 'c1', 'cfg1', 'p1')]);
    expect(idx.get(cellKey('c1', 'cfg1', 'p1'))!.key).toBe('r1');
  });

  it('different configs of the SAME combo are distinct cells', () => {
    const results = [mk('r1', 'c1', 'cfgA', 'p1')];
    expect(cellHasResult(results, 'c1', 'cfgA', 'p1')).toBe(true);
    expect(cellHasResult(results, 'c1', 'cfgB', 'p1')).toBe(false); // sibling config, no result
    expect(cellHasResult(results, 'c1', 'cfgA', 'p2')).toBe(false);
  });
});

describe('resolveCell + buildCellWorkflowBody (per config, default + overrides)', () => {
  it('resolves a non-overridden config to the DEFAULT prompt + params', () => {
    const cell = resolveCell(sdxlConfig(), promptRow()); // SDXL has no override
    expect(cell.ecosystem).toBe('SDXL');
    expect(cell.entry.prompt).toBe('cyberpunk portrait'); // the default
    expect(cell.entry.params.cfgScale).toBe(5); // default params
  });

  it('🔴 a default-only prompt runs on EVERY ecosystem (no more N/A cells)', () => {
    const defaultOnly = promptRow({
      data: { v: 3, kind: 'prompt', default: { prompt: 'universal', params: { steps: 20 } } },
    });
    for (const baseModel of ['SDXL 1.0', 'Flux.1 D', 'Pony', 'SD 1.5', 'NoobAI', 'SomeFutureModel']) {
      const cfg = sdxlConfig({ checkpoint: { versionId: 9, modelId: 9, baseModel } });
      const cell = resolveCell(cfg, defaultOnly);
      expect(cell.entry.prompt).toBe('universal');
      expect(cell.entry.params.steps).toBe(20);
    }
  });

  it('🔴 an override applies ONLY for its ecosystem; params merge over the default', () => {
    // Pony config → the Pony override prompt; cfgScale overridden to 7, other
    // default params (steps 30, sampler) preserved via the merge.
    const pony = sdxlConfig({ checkpoint: { versionId: 4, modelId: 4, baseModel: 'Pony' } });
    const cellPony = resolveCell(pony, promptRow());
    expect(cellPony.ecosystem).toBe('Pony');
    expect(cellPony.entry.prompt).toBe('score_9 portrait'); // the override prompt
    expect(cellPony.entry.params.cfgScale).toBe(7); // overridden
    expect(cellPony.entry.params.steps).toBe(30); // default preserved through the merge
    expect(cellPony.entry.params.sampler).toBe('Euler'); // default preserved

    // A DIFFERENT ecosystem (Flux) is untouched by the Pony override → default.
    const flux = sdxlConfig({ checkpoint: { versionId: 3, modelId: 3, baseModel: 'Flux.1 D' } });
    const cellFlux = resolveCell(flux, promptRow());
    expect(cellFlux.ecosystem).toBe('Flux');
    expect(cellFlux.entry.prompt).toBe('cyberpunk portrait'); // the default, not the Pony override
    expect(cellFlux.entry.params.cfgScale).toBe(5);
  });

  it('a params-only override keeps the default prompt but patches params', () => {
    const p = promptRow({
      data: {
        v: 3,
        kind: 'prompt',
        default: { prompt: 'base', params: { cfgScale: 5, steps: 30 } },
        overrides: { Flux: { params: { cfgScale: 3.5 } } },
      },
    });
    const flux = sdxlConfig({ checkpoint: { versionId: 3, modelId: 3, baseModel: 'Flux.1 D' } });
    const cell = resolveCell(flux, p);
    expect(cell.entry.prompt).toBe('base'); // default prompt (no prompt override)
    expect(cell.entry.params.cfgScale).toBe(3.5); // patched
    expect(cell.entry.params.steps).toBe(30); // default retained
  });

  it('builds the WorkflowBody from the config with combo-key attribution (default resolution)', () => {
    const body = buildCellWorkflowBody(sdxlConfig(), 'c1', promptRow());
    expect(body.kind).toBe('textToImage');
    expect(body.modelVersionId).toBe(1001);
    expect(body.modelId).toBe(500);
    expect(body.params.prompt).toBe('cyberpunk portrait');
    expect(body.params.negativePrompt).toBe('blurry');
    expect(body.params.cfgScale).toBe(5);
    expect(body.additionalResources).toEqual([{ modelVersionId: 2002, strength: 0.8 }]);
    // combo-submitter attribution stays the COMBO key, not the config
    expect(body.sharedContentKey).toBe('c1');
  });

  it('builds a runnable WorkflowBody for a config with no matching override (uses the default)', () => {
    const flux = sdxlConfig({ checkpoint: { versionId: 3, modelId: 3, baseModel: 'Flux.1 D' } });
    const body = buildCellWorkflowBody(flux, 'c1', promptRow());
    expect(body.params.prompt).toBe('cyberpunk portrait'); // default — no throw, always runnable
    expect(body.modelVersionId).toBe(3);
  });
});

describe('comboVersionIds (across all configs)', () => {
  it('collects every config checkpoint + LoRA id, deduped', () => {
    const combo = comboRow({
      data: {
        v: 2,
        kind: 'combination',
        configs: [
          sdxlConfig({ id: 'a' }),
          sdxlConfig({ id: 'b', checkpoint: { versionId: 3003, modelId: 700, baseModel: 'Pony' }, loras: [] }),
        ],
      },
    });
    expect(comboVersionIds(combo).sort()).toEqual([1001, 2002, 3003]);
  });
});

describe('reconcileOptimistic (item 1 — list refresh survives read-after-write lag)', () => {
  const val = (title: string): RawSharedItem['value'] => ({ title, body: '', data: { v: 2, kind: 'combination', configs: [] } });
  const item = (key: string, title: string): RawSharedItem => ({ key, count: 0, authorUserId: 5, value: val(title) });

  it('🔴 keeps an optimistic INSERT that a lagging list() has not yet returned', () => {
    const pending = new Map<string, PendingOptimistic>([
      ['new1', { value: val('New'), authorUserId: 5, kind: 'insert' }],
    ]);
    const { items, pending: next } = reconcileOptimistic([item('old', 'Old')], pending);
    // The just-appended row is prepended even though list() lacks it…
    expect(items.map((i) => i.key)).toEqual(['new1', 'old']);
    // …and it stays pending until the host confirms it.
    expect(next.has('new1')).toBe(true);
  });

  it('drops an optimistic INSERT once the fetched list contains it', () => {
    const pending = new Map<string, PendingOptimistic>([
      ['new1', { value: val('New'), authorUserId: 5, kind: 'insert' }],
    ]);
    const { items, pending: next } = reconcileOptimistic([item('new1', 'New'), item('old', 'Old')], pending);
    expect(items.map((i) => i.key)).toEqual(['new1', 'old']); // no duplicate
    expect(next.size).toBe(0);
  });

  it('overrides a lagging fetched value with an optimistic UPDATE until the host catches up', () => {
    const pending = new Map<string, PendingOptimistic>([
      ['k', { value: val('Edited'), authorUserId: 5, kind: 'update' }],
    ]);
    // list() still returns the OLD value → override wins, stays pending
    const r1 = reconcileOptimistic([item('k', 'Original')], pending);
    expect(r1.items[0].value.title).toBe('Edited');
    expect(r1.pending.has('k')).toBe(true);
    // once list() reflects the new value → override drops
    const r2 = reconcileOptimistic([item('k', 'Edited')], r1.pending);
    expect(r2.items[0].value.title).toBe('Edited');
    expect(r2.pending.size).toBe(0);
  });
});

describe('round-trip to builder input (edit-in-place prefill)', () => {
  it('combinationToInput reproduces the builder input from a parsed row', () => {
    const row = comboRow({ name: 'Combo', description: 'desc' });
    const input = combinationToInput(row);
    expect(input.name).toBe('Combo');
    expect(input.description).toBe('desc');
    expect(input.configs).toHaveLength(1);
    expect(input.configs[0].checkpoint.versionId).toBe(1001);
    // Re-building from the input yields the same config ids (stable through edit).
    const rebuilt = buildCombinationPayload(input).data as { configs: Array<{ id: string }> };
    expect(rebuilt.configs[0].id).toBe('cfg1');
  });

  it('promptToInput reproduces the builder input (default + overrides) from a parsed row', () => {
    const row = promptRow({ name: 'P', description: 'd' });
    const input = promptToInput(row);
    expect(input.name).toBe('P');
    expect(input.default.prompt).toBe('cyberpunk portrait');
    expect(input.default.params.cfgScale).toBe(5);
    expect(input.overrides.Pony.prompt).toBe('score_9 portrait');
    expect(input.overrides.Pony.params!.cfgScale).toBe(7);
  });

  it('🔴 edit-in-place round-trip: promptToInput → buildPromptPayload → parsePrompt is stable', () => {
    const row = promptRow({ name: 'P', description: 'd' });
    const rebuilt = buildPromptPayload(promptToInput(row));
    const reparsed = parsePrompt({ key: 'p1', count: 0, authorUserId: 1, value: rebuilt });
    expect(reparsed).not.toBeNull();
    expect(reparsed!.data.default.prompt).toBe('cyberpunk portrait');
    expect(reparsed!.data.default.params.cfgScale).toBe(5);
    expect(reparsed!.data.overrides!.Pony.prompt).toBe('score_9 portrait');
    expect(reparsed!.data.overrides!.Pony.params!.cfgScale).toBe(7);
  });
});
