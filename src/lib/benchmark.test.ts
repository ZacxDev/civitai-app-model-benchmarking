import { describe, expect, it } from 'vitest';
import type { BlockResourceInfo } from '@civitai/app-sdk/blocks';

import type { CombinationRow, PromptRow, ResultRow } from '../types.js';
import {
  buildCellWorkflowBody,
  buildCombinationPayload,
  buildPromptPayload,
  buildResultPayload,
  cellHasResult,
  cellKey,
  checkpointFromPick,
  clampWeight,
  indexResultsByCell,
  loraFromPick,
  parseCombination,
  parsePrompt,
  parseResult,
  resolveCell,
  splitRows,
  topByVotes,
  validateCombination,
  validatePrompt,
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

function comboRow(over: Partial<CombinationRow> = {}): CombinationRow {
  return {
    key: 'c1',
    count: 0,
    authorUserId: 1,
    name: 'Combo',
    description: '',
    data: {
      v: 1,
      kind: 'combination',
      checkpoint: { versionId: 1001, modelId: 500, baseModel: 'SDXL 1.0', modelName: 'JuggernautXL' },
      loras: [{ versionId: 2002, weight: 0.8, minStrength: 0, maxStrength: 1.5, modelName: 'Detail Tweaker' }],
    },
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
      v: 1,
      kind: 'prompt',
      byEcosystem: {
        SDXL: { prompt: 'cyberpunk portrait', params: { cfgScale: 5, steps: 30, sampler: 'Euler', negativePrompt: 'blurry' } },
      },
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
});

describe('combination payload (moderation split)', () => {
  it('puts names/description in title/body and ids/weights in opaque data', () => {
    const v = buildCombinationPayload({
      name: 'My Combo',
      description: 'a stack',
      checkpoint: checkpointFromPick(CKPT),
      loras: [loraFromPick(LORA)],
    });
    expect(v.title).toBe('My Combo');
    expect(v.body).toContain('a stack');
    // resource display names ride the MODERATED body, not just data
    expect(v.body).toContain('JuggernautXL');
    expect(v.body).toContain('Detail Tweaker');
    const data = v.data as { kind: string; checkpoint: { versionId: number } };
    expect(data.kind).toBe('combination');
    expect(data.checkpoint.versionId).toBe(1001);
  });
  it('validates required fields', () => {
    expect(validateCombination({ name: '', description: '', checkpoint: checkpointFromPick(CKPT), loras: [] }))
      .toContain('Give the combination a name.');
  });
});

describe('prompt payload (moderation split)', () => {
  it('concatenates every ecosystem prompt string into the moderated body', () => {
    const v = buildPromptPayload({
      name: 'Portrait',
      description: 'desc',
      byEcosystem: {
        SDXL: { prompt: 'sdxl prompt', params: { negativePrompt: 'sdxl neg' } },
        Pony: { prompt: 'pony prompt', params: {} },
      },
    });
    expect(v.title).toBe('Portrait');
    expect(v.body).toContain('sdxl prompt');
    expect(v.body).toContain('pony prompt');
    expect(v.body).toContain('sdxl neg'); // negatives are moderated too
    const data = v.data as { kind: string; byEcosystem: Record<string, unknown> };
    expect(data.kind).toBe('prompt');
    expect(Object.keys(data.byEcosystem).sort()).toEqual(['Pony', 'SDXL']);
  });
  it('drops empty-string ecosystems', () => {
    const v = buildPromptPayload({
      name: 'x',
      description: '',
      byEcosystem: { SDXL: { prompt: 'ok', params: {} }, Pony: { prompt: '   ', params: {} } },
    });
    const data = v.data as { byEcosystem: Record<string, unknown> };
    expect(Object.keys(data.byEcosystem)).toEqual(['SDXL']);
  });
  it('requires at least one non-empty ecosystem', () => {
    expect(validatePrompt({ name: 'x', description: '', byEcosystem: {} }))
      .toContain('Add a prompt for at least one ecosystem.');
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

  it('parses a combination round-trip and re-clamps stale weights', () => {
    const v = buildCombinationPayload({ name: 'C', description: 'd', checkpoint: checkpointFromPick(CKPT), loras: [{ ...loraFromPick(LORA), weight: 99 }] });
    const parsed = parseCombination({ key: 'k', count: 5, authorUserId: 2, value: v });
    expect(parsed).not.toBeNull();
    expect(parsed!.name).toBe('C');
    expect(parsed!.count).toBe(5);
    expect(parsed!.data.loras[0].weight).toBe(1.5); // re-clamped into [0,1.5]
  });

  it('rejects a row of the wrong kind / bad version', () => {
    expect(parseCombination(raw({ v: 1, kind: 'prompt' }))).toBeNull();
    expect(parseCombination(raw({ v: 2, kind: 'combination', checkpoint: { versionId: 1, modelId: 1, baseModel: 'x' } }))).toBeNull();
    expect(parsePrompt(raw({ v: 1, kind: 'combination' }))).toBeNull();
    expect(parseResult(raw({ v: 1, kind: 'prompt' }))).toBeNull();
  });

  it('parses a prompt and skips blank ecosystem entries', () => {
    const p = parsePrompt(raw({ v: 1, kind: 'prompt', byEcosystem: { SDXL: { prompt: 'x', params: {} }, Pony: { prompt: '', params: {} } } }));
    expect(p).not.toBeNull();
    expect(Object.keys(p!.data.byEcosystem)).toEqual(['SDXL']);
  });

  it('returns null for a prompt with no usable ecosystem', () => {
    expect(parsePrompt(raw({ v: 1, kind: 'prompt', byEcosystem: {} }))).toBeNull();
  });

  it('parses a result and filters non-numeric image ids', () => {
    const r = parseResult(raw({ v: 1, kind: 'result', comboKey: 'c1', promptKey: 'p1', ecosystem: 'SDXL', imageIds: [1, 2, 'x', null] }));
    expect(r).not.toBeNull();
    expect(r!.data.imageIds).toEqual([1, 2]);
  });
});

describe('splitRows', () => {
  it('splits a mixed list into typed combos / prompts / results', () => {
    const items: RawSharedItem[] = [
      { key: 'c1', count: 1, authorUserId: 1, value: buildCombinationPayload({ name: 'C', description: '', checkpoint: checkpointFromPick(CKPT), loras: [] }) },
      { key: 'p1', count: 2, authorUserId: 1, value: buildPromptPayload({ name: 'P', description: '', byEcosystem: { SDXL: { prompt: 'x', params: {} } } }) },
      { key: 'r1', count: 0, authorUserId: 1, value: buildResultPayload({ comboKey: 'c1', promptKey: 'p1', ecosystem: 'SDXL', imageIds: [7] }) },
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

describe('cell dedup (first-append-wins)', () => {
  const mk = (key: string, comboKey: string, promptKey: string): ResultRow => ({
    key,
    authorUserId: 1,
    data: { v: 1, kind: 'result', comboKey, promptKey, ecosystem: 'SDXL', imageIds: [1] },
  });

  it('the earliest (lexically-smallest key) result wins for a duplicated cell', () => {
    const idx = indexResultsByCell([mk('r9', 'c1', 'p1'), mk('r1', 'c1', 'p1')]);
    expect(idx.get(cellKey('c1', 'p1'))!.key).toBe('r1');
  });

  it('cellHasResult gates a re-run', () => {
    const results = [mk('r1', 'c1', 'p1')];
    expect(cellHasResult(results, 'c1', 'p1')).toBe(true);
    expect(cellHasResult(results, 'c1', 'p2')).toBe(false);
  });
});

describe('resolveCell + buildCellWorkflowBody', () => {
  it('resolves the matched ecosystem entry', () => {
    const cell = resolveCell(comboRow(), promptRow());
    expect(cell).not.toBeNull();
    expect(cell!.ecosystem).toBe('SDXL');
    expect(cell!.entry.prompt).toBe('cyberpunk portrait');
  });

  it('returns null when the prompt has no entry for the combo ecosystem', () => {
    const flux = comboRow({ data: { ...comboRow().data, checkpoint: { versionId: 3, modelId: 3, baseModel: 'Flux.1 D' } } });
    expect(resolveCell(flux, promptRow())).toBeNull();
  });

  it('builds the WorkflowBody with checkpoint, LoRA stack, params, and combo attribution', () => {
    const body = buildCellWorkflowBody(comboRow(), promptRow());
    expect(body.kind).toBe('textToImage');
    expect(body.modelVersionId).toBe(1001);
    expect(body.modelId).toBe(500);
    expect(body.params.prompt).toBe('cyberpunk portrait');
    expect(body.params.negativePrompt).toBe('blurry');
    expect(body.params.cfgScale).toBe(5);
    expect(body.additionalResources).toEqual([{ modelVersionId: 2002, strength: 0.8 }]);
    // combo-submitter attribution
    expect(body.sharedContentKey).toBe('c1');
  });

  it('throws when the cell is not runnable', () => {
    const flux = comboRow({ data: { ...comboRow().data, checkpoint: { versionId: 3, modelId: 3, baseModel: 'Flux.1 D' } } });
    expect(() => buildCellWorkflowBody(flux, promptRow())).toThrow(/not runnable/);
  });
});
