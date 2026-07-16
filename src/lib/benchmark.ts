// PURE, node-testable core of Model Benchmarking. No React, no SDK hooks, no
// network — every function here is a deterministic transform over the app's own
// data model. The money-shaped logic lives here (the publish text/data split,
// the top-N-by-votes derivation, first-append-wins dedup, the WorkflowBody
// builder, the ecosystem match), so it is the primary unit-test surface.

import type {
  BlockResourceInfo,
  SharedStorageValue,
  WorkflowBody,
} from '@civitai/app-sdk/blocks';

import type {
  CheckpointRef,
  CombinationData,
  CombinationRow,
  EcosystemPrompt,
  LoraRef,
  PromptData,
  PromptParams,
  PromptRow,
  RecordKind,
  ResultData,
  ResultRow,
} from '../types.js';
import { ecosystemForBaseModel, matchPromptToCombo } from './ecosystem.js';

/** Max LoRAs the server accepts in `additionalResources` (mirrors the Zod gate). */
export const MAX_LORAS = 5;

/** Default weight clamp when a picked LoRA carries no recommended range. */
export const DEFAULT_MIN_WEIGHT = -1;
export const DEFAULT_MAX_WEIGHT = 2;
export const DEFAULT_WEIGHT = 1;

/** Default included-set size (top-N by votes) for combos AND prompts. */
export const DEFAULT_TOP_N = 5;

let idCounter = 0;
/** A process-local stable id (persistence-irrelevant local ids only). */
export function newId(prefix = 'id'): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter}`;
}

// ---------------------------------------------------------------------------
// Weight clamping + resource-pick mapping (pure)
// ---------------------------------------------------------------------------

/** Clamp a weight into [min,max]; non-finite falls back to the default weight. */
export function clampWeight(value: number, min: number, max: number): number {
  const lo = Number.isFinite(min) ? min : DEFAULT_MIN_WEIGHT;
  const hi = Number.isFinite(max) ? max : DEFAULT_MAX_WEIGHT;
  const v = Number.isFinite(value) ? value : DEFAULT_WEIGHT;
  if (lo > hi) return v; // degenerate range — leave as-is
  return Math.min(hi, Math.max(lo, v));
}

/** Map a Checkpoint pick to the stored checkpoint ref. */
export function checkpointFromPick(pick: BlockResourceInfo): CheckpointRef {
  return {
    versionId: pick.versionId,
    modelId: pick.modelId,
    baseModel: pick.baseModel,
    modelName: pick.modelName,
    versionName: pick.versionName,
  };
}

/** Seed a LoRA ref from a pick — weight seeded from `strength`, clamped to range. */
export function loraFromPick(pick: BlockResourceInfo): LoraRef {
  const min = pick.minStrength ?? DEFAULT_MIN_WEIGHT;
  const max = pick.maxStrength ?? DEFAULT_MAX_WEIGHT;
  const seed = pick.strength ?? DEFAULT_WEIGHT;
  return {
    versionId: pick.versionId,
    weight: clampWeight(seed, min, max),
    modelName: pick.modelName,
    versionName: pick.versionName,
    minStrength: min,
    maxStrength: max,
  };
}

// ---------------------------------------------------------------------------
// Combination — build (publish) + parse (read) with the moderation split
// ---------------------------------------------------------------------------

export interface CombinationInput {
  name: string;
  description: string;
  checkpoint: CheckpointRef;
  loras: LoraRef[];
}

/** Human-readable validation errors that block a combination submit. */
export function validateCombination(input: CombinationInput): string[] {
  const errs: string[] = [];
  if (!input.name.trim()) errs.push('Give the combination a name.');
  if (!input.checkpoint) errs.push('Pick a checkpoint.');
  if (input.loras.length > MAX_LORAS) errs.push(`At most ${MAX_LORAS} LoRAs.`);
  return errs;
}

/**
 * THE SPLIT for a combination:
 *  - `title`/`body`  → ALL user-visible TEXT (name + description + the resource
 *    display names) — moderated.
 *  - `data`          → the opaque structured combo (resource ids + weights +
 *    baseModel). Unmoderated; carries no visible text not ALSO in title/body.
 */
export function buildCombinationPayload(input: CombinationInput): SharedStorageValue {
  const names = [
    input.checkpoint.modelName,
    ...input.loras.map((l) => l.modelName).filter(Boolean),
  ].filter(Boolean) as string[];
  const bodyLines: string[] = [];
  if (input.description.trim()) bodyLines.push(input.description.trim());
  if (names.length) bodyLines.push(`Resources: ${names.join(', ')}`);
  const data: CombinationData = {
    v: 1,
    kind: 'combination',
    checkpoint: input.checkpoint,
    loras: input.loras.slice(0, MAX_LORAS),
  };
  return { title: input.name.trim(), body: bodyLines.join('\n'), data };
}

// ---------------------------------------------------------------------------
// Prompt — build (publish) + parse (read) with the moderation split
// ---------------------------------------------------------------------------

export interface PromptInput {
  name: string;
  description: string;
  byEcosystem: Record<string, EcosystemPrompt>;
}

export function validatePrompt(input: PromptInput): string[] {
  const errs: string[] = [];
  if (!input.name.trim()) errs.push('Give the prompt a name.');
  const ecos = Object.keys(input.byEcosystem).filter((k) => input.byEcosystem[k]?.prompt.trim());
  if (ecos.length === 0) errs.push('Add a prompt for at least one ecosystem.');
  return errs;
}

/**
 * THE SPLIT for a prompt: EVERY per-ecosystem prompt string is concatenated into
 * `body` so the content-safety belt moderates them all; the structured copy
 * (prompt + params keyed by ecosystem) rides the opaque `data.byEcosystem`.
 * Empty-string ecosystems are dropped.
 */
export function buildPromptPayload(input: PromptInput): SharedStorageValue {
  const byEcosystem: Record<string, EcosystemPrompt> = {};
  const bodyLines: string[] = [];
  if (input.description.trim()) bodyLines.push(input.description.trim());
  for (const [eco, entry] of Object.entries(input.byEcosystem)) {
    const prompt = (entry?.prompt ?? '').trim();
    if (!prompt) continue;
    byEcosystem[eco] = { prompt, params: sanitizeParams(entry.params) };
    // Push BOTH the prompt and the negative into the moderated body.
    bodyLines.push(`[${eco}] ${prompt}`);
    const neg = (entry.params?.negativePrompt ?? '').trim();
    if (neg) bodyLines.push(`[${eco}] negative: ${neg}`);
  }
  const data: PromptData = { v: 1, kind: 'prompt', byEcosystem };
  return { title: input.name.trim(), body: bodyLines.join('\n'), data };
}

/** Keep only defined, in-shape param fields (drops undefined + unknown keys). */
export function sanitizeParams(p: PromptParams | undefined): PromptParams {
  const out: PromptParams = {};
  if (!p) return out;
  if (typeof p.negativePrompt === 'string') out.negativePrompt = p.negativePrompt;
  if (isNum(p.cfgScale)) out.cfgScale = p.cfgScale;
  if (isNum(p.steps)) out.steps = p.steps;
  if (typeof p.sampler === 'string' && p.sampler) out.sampler = p.sampler;
  if (p.seed === null || isNum(p.seed)) out.seed = p.seed ?? null;
  if (isNum(p.width)) out.width = p.width;
  if (isNum(p.height)) out.height = p.height;
  if (isNum(p.clipSkip)) out.clipSkip = p.clipSkip;
  return out;
}

// ---------------------------------------------------------------------------
// Result — build (write) with the small-refs shape
// ---------------------------------------------------------------------------

/**
 * Build the shared `append` value for a run's result. Results carry NO
 * user-authored text (the prompt/combo text already lives on their own
 * moderated rows), so `title`/`body` are a terse machine label and `data` holds
 * the small refs (combo/prompt keys, ecosystem, published image ids).
 */
export function buildResultPayload(data: Omit<ResultData, 'v' | 'kind'>): SharedStorageValue {
  const full: ResultData = { v: 1, kind: 'result', ...data };
  return {
    title: `result:${data.comboKey}×${data.promptKey}`,
    body: '',
    data: full,
  };
}

// ---------------------------------------------------------------------------
// Parse / migrate (defensive — `data` is app-owned but a forged row is possible)
// ---------------------------------------------------------------------------

/** The `data.kind` discriminant of a shared row, or null when unrecognised. */
export function recordKind(value: SharedStorageValue): RecordKind | null {
  const d = value.data as { kind?: unknown; v?: unknown } | undefined;
  if (!d || d.v !== 1) return null;
  if (d.kind === 'combination' || d.kind === 'prompt' || d.kind === 'result') return d.kind;
  return null;
}

export interface RawSharedItem {
  key: string;
  count: number;
  authorUserId: number;
  value: SharedStorageValue;
}

/** Parse a shared row into a typed CombinationRow, or null if it isn't one. */
export function parseCombination(item: RawSharedItem): CombinationRow | null {
  const d = item.value.data as Partial<CombinationData> | undefined;
  if (!d || d.v !== 1 || d.kind !== 'combination') return null;
  if (!d.checkpoint || !isNum(d.checkpoint.versionId) || !isNum(d.checkpoint.modelId)) return null;
  const checkpoint: CheckpointRef = {
    versionId: d.checkpoint.versionId,
    modelId: d.checkpoint.modelId,
    baseModel: typeof d.checkpoint.baseModel === 'string' ? d.checkpoint.baseModel : '',
    modelName: d.checkpoint.modelName,
    versionName: d.checkpoint.versionName,
  };
  const loras: LoraRef[] = Array.isArray(d.loras)
    ? d.loras
        .filter((l): l is LoraRef => !!l && isNum((l as LoraRef).versionId))
        .slice(0, MAX_LORAS)
        .map((l) => ({
          versionId: l.versionId,
          weight: clampWeight(
            l.weight,
            l.minStrength ?? DEFAULT_MIN_WEIGHT,
            l.maxStrength ?? DEFAULT_MAX_WEIGHT,
          ),
          modelName: l.modelName,
          versionName: l.versionName,
          minStrength: l.minStrength,
          maxStrength: l.maxStrength,
        }))
    : [];
  return {
    key: item.key,
    count: item.count,
    authorUserId: item.authorUserId,
    name: item.value.title ?? '',
    description: firstParagraph(item.value.body),
    data: { v: 1, kind: 'combination', checkpoint, loras },
  };
}

/** Parse a shared row into a typed PromptRow, or null if it isn't one. */
export function parsePrompt(item: RawSharedItem): PromptRow | null {
  const d = item.value.data as Partial<PromptData> | undefined;
  if (!d || d.v !== 1 || d.kind !== 'prompt') return null;
  const rawMap = (d.byEcosystem && typeof d.byEcosystem === 'object' ? d.byEcosystem : {}) as Record<
    string,
    Partial<EcosystemPrompt>
  >;
  const byEcosystem: Record<string, EcosystemPrompt> = {};
  for (const [eco, entry] of Object.entries(rawMap)) {
    const prompt = typeof entry?.prompt === 'string' ? entry.prompt : '';
    if (!prompt.trim()) continue;
    byEcosystem[eco] = { prompt, params: sanitizeParams(entry?.params as PromptParams | undefined) };
  }
  if (Object.keys(byEcosystem).length === 0) return null;
  return {
    key: item.key,
    count: item.count,
    authorUserId: item.authorUserId,
    name: item.value.title ?? '',
    description: firstParagraph(item.value.body),
    data: { v: 1, kind: 'prompt', byEcosystem },
  };
}

/** Parse a shared row into a typed ResultRow, or null if it isn't one. */
export function parseResult(item: RawSharedItem): ResultRow | null {
  const d = item.value.data as Partial<ResultData> | undefined;
  if (!d || d.v !== 1 || d.kind !== 'result') return null;
  if (typeof d.comboKey !== 'string' || typeof d.promptKey !== 'string') return null;
  const imageIds = Array.isArray(d.imageIds) ? d.imageIds.filter(isNum) : [];
  return {
    key: item.key,
    authorUserId: item.authorUserId,
    data: {
      v: 1,
      kind: 'result',
      comboKey: d.comboKey,
      promptKey: d.promptKey,
      ecosystem: typeof d.ecosystem === 'string' ? d.ecosystem : '',
      imageIds,
    },
  };
}

/** Split a flat list of shared rows into typed combos / prompts / results. */
export function splitRows(items: RawSharedItem[]): {
  combinations: CombinationRow[];
  prompts: PromptRow[];
  results: ResultRow[];
} {
  const combinations: CombinationRow[] = [];
  const prompts: PromptRow[] = [];
  const results: ResultRow[] = [];
  for (const it of items) {
    const c = parseCombination(it);
    if (c) {
      combinations.push(c);
      continue;
    }
    const p = parsePrompt(it);
    if (p) {
      prompts.push(p);
      continue;
    }
    const r = parseResult(it);
    if (r) results.push(r);
  }
  return { combinations, prompts, results };
}

// ---------------------------------------------------------------------------
// Included set — top-N by votes (stable)
// ---------------------------------------------------------------------------

/**
 * The included set = top-N by vote `count`, descending. Ties break by `key`
 * (lexical) so the order is DETERMINISTIC across reads (the shared list is
 * newest-first, which is unstable for equal counts). N<=0 ⇒ empty; N omitted ⇒
 * DEFAULT_TOP_N.
 */
export function topByVotes<T extends { key: string; count: number }>(
  rows: T[],
  n: number = DEFAULT_TOP_N,
): T[] {
  if (n <= 0) return [];
  return [...rows]
    .sort((a, b) => (b.count - a.count) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .slice(0, n);
}

// ---------------------------------------------------------------------------
// Cell dedup — first-append-wins
// ---------------------------------------------------------------------------

/** Canonical key for a matrix cell (combo × prompt). */
export function cellKey(comboKey: string, promptKey: string): string {
  return `${comboKey}::${promptKey}`;
}

/**
 * Index existing result rows by cell, FIRST-append-wins: if two runners raced
 * and both published a result for the same cell, the earliest row (by shared
 * key, which is monotonic/minted-in-order) is the canonical one. Returns a map
 * cellKey → the winning ResultRow.
 */
export function indexResultsByCell(results: ResultRow[]): Map<string, ResultRow> {
  const byCell = new Map<string, ResultRow>();
  // Sort by key so the lexically-smallest (earliest-minted) wins deterministically.
  for (const r of [...results].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))) {
    const ck = cellKey(r.data.comboKey, r.data.promptKey);
    if (!byCell.has(ck)) byCell.set(ck, r);
  }
  return byCell;
}

/** Does a result already exist for this cell? (best-effort dedup gate before a run). */
export function cellHasResult(
  results: ResultRow[],
  comboKey: string,
  promptKey: string,
): boolean {
  return indexResultsByCell(results).has(cellKey(comboKey, promptKey));
}

// ---------------------------------------------------------------------------
// Runner — WorkflowBody construction (pure, money-shaped)
// ---------------------------------------------------------------------------

/**
 * Resolve which ecosystem a combination runs a prompt on + that ecosystem's
 * prompt entry. Returns null when the prompt has no entry for the combo's
 * ecosystem (the cell is not runnable — skip/disable it).
 */
export function resolveCell(
  combo: CombinationRow,
  prompt: PromptRow,
): { ecosystem: string; entry: EcosystemPrompt } | null {
  const m = matchPromptToCombo(combo.data.checkpoint.baseModel, prompt.data.byEcosystem);
  if (!m) return null;
  return { ecosystem: m.ecosystem, entry: m.entry as EcosystemPrompt };
}

/**
 * Build the `WorkflowBody` for running one (combo × prompt) cell. Deterministic:
 * the checkpoint `modelVersionId` + the LoRA stack as `additionalResources` +
 * the ecosystem's prompt string + its params + `sharedContentKey = combo.key`
 * (combo-submitter attribution). Throws when the cell isn't runnable (no prompt
 * entry for the combo's ecosystem) — callers gate with {@link resolveCell}.
 *
 * DISCOVERY-ONLY ids: `modelVersionId` / `additionalResources[].modelVersionId`
 * are hints; the server re-validates + re-prices every id at estimate/submit.
 */
export function buildCellWorkflowBody(combo: CombinationRow, prompt: PromptRow): WorkflowBody {
  const cell = resolveCell(combo, prompt);
  if (!cell) {
    throw new Error(
      `Prompt "${prompt.name}" has no entry for the "${ecosystemForBaseModel(
        combo.data.checkpoint.baseModel,
      )}" ecosystem — cell is not runnable.`,
    );
  }
  const { entry } = cell;
  const p = entry.params;
  const params: WorkflowBody['params'] = { prompt: entry.prompt };
  if (p.negativePrompt) params.negativePrompt = p.negativePrompt;
  if (isNum(p.cfgScale)) params.cfgScale = p.cfgScale;
  if (p.sampler) params.sampler = p.sampler;
  if (isNum(p.steps)) params.steps = p.steps;
  if (p.seed === null || isNum(p.seed)) params.seed = p.seed ?? null;
  if (isNum(p.width)) params.width = p.width;
  if (isNum(p.height)) params.height = p.height;
  if (isNum(p.clipSkip)) params.clipSkip = p.clipSkip;

  const body: WorkflowBody = {
    kind: 'textToImage',
    modelId: combo.data.checkpoint.modelId,
    modelVersionId: combo.data.checkpoint.versionId,
    params,
    // Combo-submitter attribution (G5): the generation runs "on behalf of" the
    // combination's shared row.
    sharedContentKey: combo.key,
  };

  const loras = combo.data.loras.slice(0, MAX_LORAS);
  if (loras.length > 0) {
    body.additionalResources = loras.map((l) => ({
      modelVersionId: l.versionId,
      strength: clampWeight(
        l.weight,
        l.minStrength ?? DEFAULT_MIN_WEIGHT,
        l.maxStrength ?? DEFAULT_MAX_WEIGHT,
      ),
    }));
  }
  return body;
}

/** All modelVersion ids a combination references (checkpoint + LoRAs), deduped. */
export function comboVersionIds(combo: CombinationRow): number[] {
  const ids = new Set<number>([combo.data.checkpoint.versionId]);
  for (const l of combo.data.loras) ids.add(l.versionId);
  return [...ids];
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function firstParagraph(body: string | undefined): string {
  if (!body) return '';
  const line = body.split('\n')[0] ?? '';
  // The first body line is the description UNLESS the author left it blank, in
  // which case line 0 is a meta line (Resources: … / an ecosystem prompt).
  if (line.startsWith('Resources: ') || /^\[.+\]/.test(line)) return '';
  return line;
}
