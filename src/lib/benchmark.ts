// PURE, node-testable core of Model Benchmarking. No React, no SDK hooks, no
// network — every function here is a deterministic transform over the app's own
// data model. The money-shaped logic lives here (the publish text/data split,
// the top-N-by-votes derivation, first-append-wins dedup, the WorkflowBody
// builder, the ecosystem match), so it is the primary unit-test surface.

import type {
  BlockResourceInfo,
  BlockTextToImageParams,
  SharedStorageValue,
  WorkflowBodyTextToImage,
} from '@civitai/app-sdk/blocks';

import type {
  CheckpointRef,
  CombinationData,
  CombinationRow,
  EcosystemPrompt,
  LoraRef,
  ModelConfig,
  PromptData,
  PromptDefault,
  PromptOverride,
  PromptParams,
  PromptRow,
  RecordKind,
  ResultData,
  ResultRow,
} from '../types.js';
import { ecosystemForBaseModel } from './ecosystem.js';

/** Max LoRAs the server accepts in `additionalResources` (mirrors the Zod gate). */
export const MAX_LORAS = 5;

/** Default weight clamp when a picked LoRA carries no recommended range. */
export const DEFAULT_MIN_WEIGHT = -1;
export const DEFAULT_MAX_WEIGHT = 2;
export const DEFAULT_WEIGHT = 1;

/** Default included-set size (top-N by votes) for combos AND prompts. */
export const DEFAULT_TOP_N = 5;

/** Max model configs a single combination can group. */
export const MAX_CONFIGS = 8;

/** The deterministic config id assigned to a migrated v1 combination's single
 * config. A v1 result row (no `configId`) also resolves to this id, so a
 * pre-existing v1 result still matches the migrated config. */
export const V1_CONFIG_ID = 'v1cfg';

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

/** A fresh, empty model config (no checkpoint yet) with a minted stable id. */
export function newConfig(): ModelConfig {
  return { id: newId('cfg'), checkpoint: undefined as unknown as CheckpointRef, loras: [] };
}

// ---------------------------------------------------------------------------
// Combination — build (publish) + parse (read) with the moderation split
// ---------------------------------------------------------------------------

/** The builder/edit input for a combination: a name/desc + ≥1 model configs. */
export interface CombinationInput {
  name: string;
  description: string;
  configs: ModelConfig[];
}

/** Config rows that actually carry a picked checkpoint (a half-filled row is dropped). */
function filledConfigs(configs: ModelConfig[]): ModelConfig[] {
  return configs.filter((cfg) => cfg && cfg.checkpoint && isNum(cfg.checkpoint.versionId));
}

/** Human-readable validation errors that block a combination submit. */
export function validateCombination(input: CombinationInput): string[] {
  const errs: string[] = [];
  if (!input.name.trim()) errs.push('Give the combination a name.');
  const filled = filledConfigs(input.configs);
  if (filled.length === 0) errs.push('Add at least one model config (pick a checkpoint).');
  if (filled.length > MAX_CONFIGS) errs.push(`At most ${MAX_CONFIGS} configs.`);
  if (filled.some((cfg) => cfg.loras.length > MAX_LORAS)) errs.push(`At most ${MAX_LORAS} LoRAs per config.`);
  return errs;
}

/** Display names of every resource across all configs (for the moderated body). */
function comboResourceNames(configs: ModelConfig[]): string[] {
  const names: string[] = [];
  for (const cfg of configs) {
    if (cfg.checkpoint?.modelName) names.push(cfg.checkpoint.modelName);
    for (const l of cfg.loras) if (l.modelName) names.push(l.modelName);
    if (cfg.label?.trim()) names.push(cfg.label.trim());
  }
  return names;
}

/**
 * THE SPLIT for a combination:
 *  - `title`/`body`  → ALL user-visible TEXT (name + description + every config's
 *    label + resource display names) — moderated.
 *  - `data`          → the opaque structured combo (v2 configs: resource ids +
 *    weights + baseModel). Unmoderated; carries no visible text not ALSO in
 *    title/body.
 * Half-filled config rows (no checkpoint) are dropped; each config's LoRA stack
 * is capped at MAX_LORAS and the config list at MAX_CONFIGS.
 */
export function buildCombinationPayload(input: CombinationInput): SharedStorageValue {
  const configs = filledConfigs(input.configs)
    .slice(0, MAX_CONFIGS)
    .map((cfg) => ({
      id: cfg.id || newId('cfg'),
      ...(cfg.label?.trim() ? { label: cfg.label.trim() } : {}),
      checkpoint: cfg.checkpoint,
      loras: cfg.loras.slice(0, MAX_LORAS),
    }));
  const names = comboResourceNames(configs);
  const bodyLines: string[] = [];
  if (input.description.trim()) bodyLines.push(input.description.trim());
  if (names.length) bodyLines.push(`Resources: ${names.join(', ')}`);
  const data: CombinationData = { v: 2, kind: 'combination', configs };
  return { title: input.name.trim(), body: bodyLines.join('\n'), data };
}

/** Convert a parsed combination row back into a builder input (for edit-in-place). */
export function combinationToInput(row: CombinationRow): CombinationInput {
  return {
    name: row.name,
    description: row.description,
    configs: row.data.configs.map((cfg) => ({
      id: cfg.id,
      label: cfg.label,
      checkpoint: cfg.checkpoint,
      loras: cfg.loras.map((l) => ({ ...l })),
    })),
  };
}

// ---------------------------------------------------------------------------
// Prompt — build (publish) + parse (read) with the moderation split
// ---------------------------------------------------------------------------

export interface PromptInput {
  name: string;
  description: string;
  /** The default prompt + params, applied to ALL ecosystems. Always present. */
  default: PromptDefault;
  /** Optional, sparse per-ecosystem overrides (keyed by ecosystem group key). */
  overrides: Record<string, PromptOverride>;
}

export function validatePrompt(input: PromptInput): string[] {
  const errs: string[] = [];
  if (!input.name.trim()) errs.push('Give the prompt a name.');
  if (!input.default?.prompt?.trim()) errs.push('Add a default prompt (it applies to every ecosystem).');
  return errs;
}

/** Sanitize a raw override into the stored shape: a trimmed non-empty prompt
 * and/or a non-empty params patch. Returns null when the override carries
 * NEITHER (an empty override is dropped). */
function sanitizeOverride(raw: PromptOverride | undefined): PromptOverride | null {
  const out: PromptOverride = {};
  const prompt = (raw?.prompt ?? '').trim();
  if (prompt) out.prompt = prompt;
  const params = sanitizeParams(raw?.params as PromptParams | undefined);
  if (Object.keys(params).length > 0) out.params = params;
  if (out.prompt === undefined && out.params === undefined) return null;
  return out;
}

/**
 * THE SPLIT for a prompt: the default prompt string AND every override prompt
 * string (plus their negatives) are concatenated into `body` so the
 * content-safety belt moderates them all; the structured copy (default +
 * overrides) rides the opaque `data`. Empty overrides are dropped.
 */
export function buildPromptPayload(input: PromptInput): SharedStorageValue {
  const def: PromptDefault = {
    prompt: (input.default?.prompt ?? '').trim(),
    params: sanitizeParams(input.default?.params),
  };
  const bodyLines: string[] = [];
  if (input.description.trim()) bodyLines.push(input.description.trim());
  // The default prompt (+ negative) is swept into the moderated body.
  if (def.prompt) bodyLines.push(def.prompt);
  const defNeg = (def.params.negativePrompt ?? '').trim();
  if (defNeg) bodyLines.push(`negative: ${defNeg}`);

  const overrides: Record<string, PromptOverride> = {};
  for (const [eco, raw] of Object.entries(input.overrides ?? {})) {
    const ov = sanitizeOverride(raw);
    if (!ov) continue;
    overrides[eco] = ov;
    // Push each override prompt + its negative into the moderated body too.
    if (ov.prompt) bodyLines.push(`[${eco}] ${ov.prompt}`);
    const neg = (ov.params?.negativePrompt ?? '').trim();
    if (neg) bodyLines.push(`[${eco}] negative: ${neg}`);
  }

  const data: PromptData = {
    v: 3,
    kind: 'prompt',
    default: def,
    ...(Object.keys(overrides).length > 0 ? { overrides } : {}),
  };
  return { title: input.name.trim(), body: bodyLines.join('\n'), data };
}

/** Convert a parsed prompt row back into a builder input (for edit-in-place). */
export function promptToInput(row: PromptRow): PromptInput {
  const overrides: Record<string, PromptOverride> = {};
  for (const [eco, ov] of Object.entries(row.data.overrides ?? {})) {
    overrides[eco] = {
      ...(ov.prompt !== undefined ? { prompt: ov.prompt } : {}),
      ...(ov.params !== undefined ? { params: { ...ov.params } } : {}),
    };
  }
  return {
    name: row.name,
    description: row.description,
    default: { prompt: row.data.default.prompt, params: { ...row.data.default.params } },
    overrides,
  };
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
  const full: ResultData = { v: 2, kind: 'result', ...data };
  return {
    title: `result:${data.comboKey}·${data.configId}×${data.promptKey}`,
    body: '',
    data: full,
  };
}

// ---------------------------------------------------------------------------
// Parse / migrate (defensive — `data` is app-owned but a forged row is possible)
// ---------------------------------------------------------------------------

/** The `data.kind` discriminant of a shared row, or null when unrecognised.
 * Accepts any known schema version (v1 legacy … v3 current prompt). */
export function recordKind(value: SharedStorageValue): RecordKind | null {
  const d = value.data as { kind?: unknown; v?: unknown } | undefined;
  if (!d || (d.v !== 1 && d.v !== 2 && d.v !== 3)) return null;
  if (d.kind === 'combination' || d.kind === 'prompt' || d.kind === 'result') return d.kind;
  return null;
}

export interface RawSharedItem {
  key: string;
  count: number;
  authorUserId: number;
  value: SharedStorageValue;
}

/** Defensive checkpoint parse — null when the required ids are missing/bad. */
function parseCheckpoint(raw: Partial<CheckpointRef> | undefined | null): CheckpointRef | null {
  if (!raw || !isNum(raw.versionId) || !isNum(raw.modelId)) return null;
  return {
    versionId: raw.versionId,
    modelId: raw.modelId,
    baseModel: typeof raw.baseModel === 'string' ? raw.baseModel : '',
    modelName: raw.modelName,
    versionName: raw.versionName,
  };
}

/** Defensive LoRA-stack parse — filters junk, re-clamps stale weights, caps length. */
function parseLoras(raw: unknown): LoraRef[] {
  return Array.isArray(raw)
    ? raw
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
}

/** Defensive single-config parse (v2) — null when its checkpoint is unusable. */
function parseConfig(raw: Partial<ModelConfig> | undefined | null): ModelConfig | null {
  if (!raw) return null;
  const checkpoint = parseCheckpoint(raw.checkpoint);
  if (!checkpoint) return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newId('cfg'),
    ...(typeof raw.label === 'string' && raw.label.trim() ? { label: raw.label } : {}),
    checkpoint,
    loras: parseLoras(raw.loras),
  };
}

/**
 * Parse a shared row into a typed CombinationRow, or null if it isn't one.
 * 🔴 BACK-COMPAT: a v1 combination (`data.checkpoint` + `data.loras`) migrates
 * on read into a single-config v2 (`configs:[{ id: V1_CONFIG_ID, checkpoint,
 * loras }]`) so pre-existing prod rows keep working. A v2 row parses its
 * `configs[]` defensively (junk configs dropped, length capped).
 */
export function parseCombination(item: RawSharedItem): CombinationRow | null {
  const d = item.value.data as
    | {
        v?: number;
        kind?: string;
        configs?: Array<Partial<ModelConfig>>;
        checkpoint?: Partial<CheckpointRef>;
        loras?: unknown;
      }
    | undefined;
  if (!d || d.kind !== 'combination') return null;

  let configs: ModelConfig[] = [];
  if (d.v === 2 && Array.isArray(d.configs)) {
    configs = d.configs
      .map((cfg) => parseConfig(cfg))
      .filter((cfg): cfg is ModelConfig => cfg !== null)
      .slice(0, MAX_CONFIGS);
  } else if (d.v === 1) {
    // Migrate the legacy single-checkpoint shape into one config.
    const checkpoint = parseCheckpoint(d.checkpoint);
    if (checkpoint) configs = [{ id: V1_CONFIG_ID, checkpoint, loras: parseLoras(d.loras) }];
  }
  if (configs.length === 0) return null;

  return {
    key: item.key,
    count: item.count,
    authorUserId: item.authorUserId,
    name: item.value.title ?? '',
    description: firstParagraph(item.value.body),
    data: { v: 2, kind: 'combination', configs },
  };
}

/**
 * Parse a shared row into a typed PromptRow, or null if it isn't one.
 * 🔴 BACK-COMPAT: a v3 prompt (`data.default` + optional `data.overrides`) parses
 * directly; a legacy v1 prompt (`data.byEcosystem`) MIGRATES on read into the v3
 * shape (see {@link migratePromptV1}) so pre-existing prod prompts keep working
 * AND resolve to a runnable prompt for every config. A junk/forged row → null.
 */
export function parsePrompt(item: RawSharedItem): PromptRow | null {
  const d = item.value.data as
    | { v?: number; kind?: string; default?: unknown; overrides?: unknown; byEcosystem?: unknown }
    | undefined;
  if (!d || d.kind !== 'prompt') return null;

  let data: PromptData | null = null;
  if (d.v === 3) data = parsePromptV3(d);
  else if (d.v === 1) data = migratePromptV1(d);
  if (!data) return null;

  return {
    key: item.key,
    count: item.count,
    authorUserId: item.authorUserId,
    name: item.value.title ?? '',
    description: firstParagraph(item.value.body),
    data,
  };
}

/** Defensive parse of a v3 prompt payload — null when there is no usable default
 * prompt (a prompt with no runnable default is dropped). */
function parsePromptV3(d: { default?: unknown; overrides?: unknown }): PromptData | null {
  const def = d.default as Partial<PromptDefault> | undefined;
  const prompt = typeof def?.prompt === 'string' ? def.prompt : '';
  if (!prompt.trim()) return null;
  const defaultEntry: PromptDefault = { prompt, params: sanitizeParams(def?.params) };

  const overrides: Record<string, PromptOverride> = {};
  const rawOv = (d.overrides && typeof d.overrides === 'object' ? d.overrides : {}) as Record<
    string,
    Partial<PromptOverride>
  >;
  for (const [eco, raw] of Object.entries(rawOv)) {
    const ov = sanitizeOverride(raw as PromptOverride | undefined);
    if (ov) overrides[eco] = ov;
  }
  return {
    v: 3,
    kind: 'prompt',
    default: defaultEntry,
    ...(Object.keys(overrides).length > 0 ? { overrides } : {}),
  };
}

/**
 * Migrate a legacy v1 prompt (`byEcosystem`) into the v3 default+overrides shape.
 * Rule: pick ONE ecosystem entry as the `default` (prefer SDXL if present, else
 * the first insertion-ordered entry); every OTHER entry becomes an override —
 * UNLESS it is identical to the default (identical entries collapse into just the
 * default). Returns null when no ecosystem carried a usable prompt.
 */
function migratePromptV1(d: { byEcosystem?: unknown }): PromptData | null {
  const rawMap = (d.byEcosystem && typeof d.byEcosystem === 'object' ? d.byEcosystem : {}) as Record<
    string,
    Partial<EcosystemPrompt>
  >;
  const entries: Array<[string, EcosystemPrompt]> = [];
  for (const [eco, entry] of Object.entries(rawMap)) {
    const prompt = typeof entry?.prompt === 'string' ? entry.prompt : '';
    if (!prompt.trim()) continue;
    entries.push([eco, { prompt, params: sanitizeParams(entry?.params as PromptParams | undefined) }]);
  }
  if (entries.length === 0) return null;

  const sdxlIdx = entries.findIndex(([eco]) => eco === 'SDXL');
  const [defaultEco, defaultEntry] = sdxlIdx >= 0 ? entries[sdxlIdx] : entries[0];

  const overrides: Record<string, PromptOverride> = {};
  for (const [eco, entry] of entries) {
    if (eco === defaultEco) continue;
    // Identical to the default → collapse (no override needed).
    if (JSON.stringify(entry) === JSON.stringify(defaultEntry)) continue;
    overrides[eco] = { prompt: entry.prompt, params: entry.params };
  }
  return {
    v: 3,
    kind: 'prompt',
    default: defaultEntry,
    ...(Object.keys(overrides).length > 0 ? { overrides } : {}),
  };
}

/**
 * Parse a shared row into a typed ResultRow, or null if it isn't one.
 * 🔴 BACK-COMPAT: a v1 result row (no `configId`) resolves to `V1_CONFIG_ID` —
 * the same id the v1 combination migrates its single config to — so a
 * pre-existing v1 result still lands in the right cell.
 */
export function parseResult(item: RawSharedItem): ResultRow | null {
  const d = item.value.data as (Omit<Partial<ResultData>, 'v'> & { v?: number }) | undefined;
  if (!d || (d.v !== 1 && d.v !== 2) || d.kind !== 'result') return null;
  if (typeof d.comboKey !== 'string' || typeof d.promptKey !== 'string') return null;
  const imageIds = Array.isArray(d.imageIds) ? d.imageIds.filter(isNum) : [];
  const configId = typeof d.configId === 'string' && d.configId ? d.configId : V1_CONFIG_ID;
  return {
    key: item.key,
    authorUserId: item.authorUserId,
    data: {
      v: 2,
      kind: 'result',
      comboKey: d.comboKey,
      configId,
      promptKey: d.promptKey,
      ecosystem: typeof d.ecosystem === 'string' ? d.ecosystem : '',
      imageIds,
      // App-level prompt-submitter attribution (optional; absent on v1 rows and
      // on runs against an anonymous-authored prompt). Parsed defensively.
      ...(isNum(d.promptAuthorUserId) ? { promptAuthorUserId: d.promptAuthorUserId } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// Optimistic reconcile — make a just-appended/updated row appear IMMEDIATELY,
// surviving a read-after-write-lagged list() re-fetch (item 1).
// ---------------------------------------------------------------------------

export type PendingKind = 'insert' | 'update';

/** A locally-applied optimistic mutation awaiting host confirmation. */
export interface PendingOptimistic {
  value: SharedStorageValue;
  authorUserId: number;
  kind: PendingKind;
}

function valuesEqual(a: SharedStorageValue, b: SharedStorageValue): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Merge a freshly-fetched shared list with locally-pending optimistic mutations,
 * so a just-appended row (absent from a lagging list) still shows, and a
 * just-edited row shows its new value until the host list catches up.
 *  - `insert` pending: prepended while ABSENT from the fetch; dropped once present.
 *  - `update` pending: overrides the fetched row's value while they DIFFER;
 *    dropped once the fetch reflects the new value (or the row is gone).
 * Returns the merged items (newest-first: surviving inserts, then the fetched
 * list with update-overrides applied) AND the still-pending map to carry forward.
 */
export function reconcileOptimistic(
  fetched: RawSharedItem[],
  pending: Map<string, PendingOptimistic>,
): { items: RawSharedItem[]; pending: Map<string, PendingOptimistic> } {
  const byKey = new Map(fetched.map((i) => [i.key, i]));
  const nextPending = new Map<string, PendingOptimistic>();
  const inserts: RawSharedItem[] = [];
  const overrides = new Map<string, SharedStorageValue>();
  for (const [key, p] of pending) {
    const hit = byKey.get(key);
    if (p.kind === 'insert') {
      if (hit) continue; // host confirmed the append — drop the optimistic row
      inserts.push({ key, count: 0, authorUserId: p.authorUserId, value: p.value });
      nextPending.set(key, p);
    } else {
      if (!hit) continue; // the row is gone — drop
      if (valuesEqual(hit.value, p.value)) continue; // host caught up — drop
      overrides.set(key, p.value);
      nextPending.set(key, p);
    }
  }
  const items = [
    ...inserts,
    ...fetched.map((i) => (overrides.has(i.key) ? { ...i, value: overrides.get(i.key)! } : i)),
  ];
  return { items, pending: nextPending };
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

/** Canonical key for a matrix cell (config-within-combo × prompt). */
export function cellKey(comboKey: string, configId: string, promptKey: string): string {
  return `${comboKey}::${configId}::${promptKey}`;
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
    const ck = cellKey(r.data.comboKey, r.data.configId, r.data.promptKey);
    if (!byCell.has(ck)) byCell.set(ck, r);
  }
  return byCell;
}

/** Does a result already exist for this cell? (best-effort dedup gate before a run). */
export function cellHasResult(
  results: ResultRow[],
  comboKey: string,
  configId: string,
  promptKey: string,
): boolean {
  return indexResultsByCell(results).has(cellKey(comboKey, configId, promptKey));
}

// ---------------------------------------------------------------------------
// Runner — WorkflowBody construction (pure, money-shaped)
// ---------------------------------------------------------------------------

/**
 * Resolve which ecosystem a config runs a prompt on + the EFFECTIVE prompt entry
 * for that ecosystem. 🔴 Every cell is runnable: there is always a `default`, so
 * this NEVER returns null. The effective prompt is `overrides[X]?.prompt` (when a
 * non-empty override prompt exists) else `default.prompt`; the effective params
 * are `{ ...default.params, ...(overrides[X]?.params ?? {}) }` — the default
 * params apply to every non-overridden ecosystem, a matching override patches
 * over them.
 */
export function resolveCell(
  config: ModelConfig,
  prompt: PromptRow,
): { ecosystem: string; entry: EcosystemPrompt } {
  const ecosystem = ecosystemForBaseModel(config.checkpoint.baseModel);
  const d = prompt.data;
  const ov = d.overrides?.[ecosystem];
  const effectivePrompt = ov?.prompt ? ov.prompt : d.default.prompt;
  const effectiveParams: PromptParams = { ...d.default.params, ...(ov?.params ?? {}) };
  return { ecosystem, entry: { prompt: effectivePrompt, params: effectiveParams } };
}

/**
 * Build the `WorkflowBody` for running one (config × prompt) cell. Deterministic:
 * the config checkpoint `modelVersionId` + its LoRA stack as `additionalResources`
 * + the EFFECTIVE (default, override-patched) prompt string + params +
 * `sharedContentKey = comboKey` (combo-submitter attribution). Always runnable —
 * there is always a default prompt for the config's ecosystem.
 *
 * DISCOVERY-ONLY ids: `modelVersionId` / `additionalResources[].modelVersionId`
 * are hints; the server re-validates + re-prices every id at estimate/submit.
 */
export function buildCellWorkflowBody(
  config: ModelConfig,
  comboKey: string,
  prompt: PromptRow,
): WorkflowBodyTextToImage {
  const { entry } = resolveCell(config, prompt);
  const p = entry.params;
  const params: BlockTextToImageParams = { prompt: entry.prompt };
  if (p.negativePrompt) params.negativePrompt = p.negativePrompt;
  if (isNum(p.cfgScale)) params.cfgScale = p.cfgScale;
  if (p.sampler) params.sampler = p.sampler;
  if (isNum(p.steps)) params.steps = p.steps;
  if (p.seed === null || isNum(p.seed)) params.seed = p.seed ?? null;
  if (isNum(p.width)) params.width = p.width;
  if (isNum(p.height)) params.height = p.height;
  if (isNum(p.clipSkip)) params.clipSkip = p.clipSkip;

  const body: WorkflowBodyTextToImage = {
    kind: 'textToImage',
    modelId: config.checkpoint.modelId,
    modelVersionId: config.checkpoint.versionId,
    params,
    // Combo-submitter attribution (G5): the generation runs "on behalf of" the
    // combination's shared row (still the combo key, NOT the config).
    sharedContentKey: comboKey,
  };

  const loras = config.loras.slice(0, MAX_LORAS);
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

/** All modelVersion ids a combination references (every config's checkpoint + LoRAs), deduped. */
export function comboVersionIds(combo: CombinationRow): number[] {
  const ids = new Set<number>();
  for (const cfg of combo.data.configs) {
    ids.add(cfg.checkpoint.versionId);
    for (const l of cfg.loras) ids.add(l.versionId);
  }
  return [...ids];
}

// ---------------------------------------------------------------------------
// Config flattening — the grid rows are CONFIGS grouped under their combination
// ---------------------------------------------------------------------------

/** One benchmarkable grid row: a config carried with its parent combination's
 * key/name/vote-count (so the grid can label + group configs under their combo,
 * key results on the config, and attribute runs to the combo). */
export interface BenchConfig {
  comboKey: string;
  comboName: string;
  comboCount: number;
  /** Index of this config within its combination (for a fallback label). */
  configIndex: number;
  config: ModelConfig;
}

/** Flatten included combinations into their benchmarkable config rows, in
 * combination order then config order. */
export function flattenConfigs(combos: CombinationRow[]): BenchConfig[] {
  const rows: BenchConfig[] = [];
  for (const combo of combos) {
    combo.data.configs.forEach((config, configIndex) => {
      rows.push({
        comboKey: combo.key,
        comboName: combo.name,
        comboCount: combo.count,
        configIndex,
        config,
      });
    });
  }
  return rows;
}

/** A human label for a config row (author label → checkpoint name → "Config N"). */
export function configLabel(row: BenchConfig): string {
  return (
    row.config.label?.trim() ||
    row.config.checkpoint.modelName ||
    `Config ${row.configIndex + 1}`
  );
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
