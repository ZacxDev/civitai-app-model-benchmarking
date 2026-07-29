// The app-side "Model Benchmarking" data model.
//
// 🔴 The PLATFORM has no concept of a "combination", "prompt", or "result" — the
// whole benchmark is app-owned. Every contribution lives in App Blocks SHARED
// storage as a `{ title, body, data }` record: the moderated user-visible TEXT
// in `title`/`body`, and the structured payload in the opaque `data` blob (see
// lib/benchmark.ts `build*Payload` / `parse*`). `data.kind` discriminates the
// three record types on the ONE shared list.

/** The three kinds of record the app appends to the single shared list. */
export type RecordKind = 'combination' | 'prompt' | 'result';

// ---------------------------------------------------------------------------
// Combination — a NAMED GROUP of model configs to benchmark together (vote-able).
//
// 🔴 v2 data-model reframe: a "combination" is no longer ONE checkpoint + a LoRA
// stack. It is an array of `ModelConfig`s — each config (one checkpoint + its
// own LoRA stack) is the atomic BENCHMARKABLE unit. The grid's rows are the
// configs (grouped under their combination); each (config × prompt) is a cell.
// v1 combinations (single `checkpoint`+`loras`) migrate on read into a single
// config (see lib/benchmark.ts `parseCombination`).
// ---------------------------------------------------------------------------

/** A checkpoint pinned to a model config (from useResourcePicker, Checkpoint). */
export interface CheckpointRef {
  versionId: number;
  modelId: number;
  /** The base model family (e.g. 'SDXL 1.0', 'Pony', 'Flux.1 D') — the ECOSYSTEM
   * discriminant. A config runs a prompt's entry for the ecosystem this base
   * model maps to (see lib/ecosystem.ts). */
  baseModel: string;
  modelName?: string;
  versionName?: string;
}

/** One weighted LoRA in a config's stack (from useResourcePicker, LORA). */
export interface LoraRef {
  versionId: number;
  /** Applied weight/strength (clamped to [min,max]). */
  weight: number;
  modelName?: string;
  versionName?: string;
  minStrength?: number;
  maxStrength?: number;
}

/**
 * One benchmarkable model setup inside a combination: a checkpoint + its own
 * (checkpoint-scoped) LoRA stack, plus a stable `id` (so result rows survive a
 * config being reordered/renamed) and an optional author label.
 */
export interface ModelConfig {
  /** Stable id for result keying. Minted on create; a deterministic sentinel
   * (`V1_CONFIG_ID`) on a v1 migration so pre-existing v1 result rows still
   * match the migrated config. */
  id: string;
  /** Optional author-supplied label (e.g. "with detail LoRA"). */
  label?: string;
  checkpoint: CheckpointRef;
  loras: LoraRef[];
}

/** The opaque structured payload for a `combination` shared record (v2). */
export interface CombinationData {
  v: 2;
  kind: 'combination';
  /** ≥1 model configs to benchmark together. */
  configs: ModelConfig[];
}

// ---------------------------------------------------------------------------
// Prompt — a DEFAULT prompt (+ params) applying to ALL ecosystems, with OPTIONAL
// sparse per-ecosystem overrides (vote-able).
//
// 🔴 v3 data-model reframe: a prompt is no longer "one required entry per
// ecosystem". It is ONE `default` prompt + params that runs on EVERY ecosystem,
// plus optional `overrides` that replace the prompt and/or patch the params for a
// specific base-model family. Consequence: every config is ALWAYS runnable —
// there is always a default. Legacy v1 `byEcosystem` prompts migrate on read (see
// lib/benchmark.ts `parsePrompt`): one entry becomes the `default`, the rest
// become `overrides` (identical entries collapse into just the default).
// ---------------------------------------------------------------------------

/** Generation parameters (subset of BlockTextToImageParams). */
export interface PromptParams {
  negativePrompt?: string;
  cfgScale?: number;
  steps?: number;
  sampler?: string;
  seed?: number | null;
  width?: number;
  height?: number;
  clipSkip?: number;
}

/** One fully-resolved prompt entry — a raw prompt string + full params. Used for
 * the `default` AND for the per-cell EFFECTIVE prompt the runner resolves. */
export interface EcosystemPrompt {
  prompt: string;
  params: PromptParams;
}

/** The DEFAULT prompt (+ full params) applied to EVERY ecosystem unless a
 * per-ecosystem override narrows it. Structurally an {@link EcosystemPrompt}. */
export type PromptDefault = EcosystemPrompt;

/** An OPTIONAL, sparse per-ecosystem override: a replacement prompt string
 * and/or a partial params patch layered over the default's params. Both fields
 * are optional (a params-only or prompt-only override is valid). */
export interface PromptOverride {
  prompt?: string;
  params?: Partial<PromptParams>;
}

/** The opaque structured payload for a `prompt` shared record (v3).
 *  - `default` runs on EVERY ecosystem (so every config is runnable).
 *  - `overrides[baseModelGroup]` optionally replaces the prompt and/or patches
 *    the params for configs whose checkpoint maps to that ecosystem group key
 *    (see lib/ecosystem.ts `ECOSYSTEMS`). Sparse — most prompts carry none. */
export interface PromptData {
  v: 3;
  kind: 'prompt';
  default: PromptDefault;
  overrides?: Record<string, PromptOverride>;
}

// ---------------------------------------------------------------------------
// Result — a run's published outputs for one (combo × prompt) cell (small refs).
// ---------------------------------------------------------------------------

/** The opaque structured payload for a `result` shared record. Small refs only —
 * NO image URLs (URLs are read per-viewer via the gated hook at render time).
 * v2: a result now keys on (comboKey, configId, promptKey) since the benchmark
 * unit is a CONFIG, not the whole combination. v1 result rows (no `configId`)
 * migrate on read to `configId = V1_CONFIG_ID` — matching the migrated v1
 * combination's single config. */
export interface ResultData {
  v: 2;
  kind: 'result';
  /** The shared key of the combination this result belongs to. */
  comboKey: string;
  /** The stable id of the config (within the combination) this result is for. */
  configId: string;
  /** The shared key of the prompt this result belongs to (matrix COLUMN). */
  promptKey: string;
  /** The ecosystem the prompt was matched to the config on. */
  ecosystem: string;
  /** The bare scanned Image row ids the runner published (via the gated bridge). */
  imageIds: number[];
  /**
   * App-level attribution of the PROMPT submitter (the column author), recorded
   * on the result so the prompt author is credited for the cell alongside the
   * combination author.
   *
   * 🔴 WHY app-level, not host spend-attribution: the generation's Buzz spend is
   * host-attributed to a SINGLE `sharedContentKey` (the combination — see
   * `buildCellWorkflowBody`), because the host contract exposes exactly one
   * shared-content key per workflow (`WorkflowBody.sharedContentKey: string`),
   * which it resolves to ONE content author. A cell is co-authored (combo × prompt),
   * so the prompt submitter gets app-level credit recorded here (derivable from
   * `promptKey` too, but recorded explicitly so a consumer needn't re-resolve the
   * prompt row). True dual SPEND attribution would require a host/platform change.
   * Optional (a v1 result / a run against an anonymous-authored prompt omits it).
   */
  promptAuthorUserId?: number;
}

// ---------------------------------------------------------------------------
// Parsed (display) views — a shared row + its typed data, ready to render.
// ---------------------------------------------------------------------------

/** A parsed combination: the shared row's key/votes + its typed payload. */
export interface CombinationRow {
  key: string;
  count: number;
  authorUserId: number;
  name: string;
  description: string;
  data: CombinationData;
}

/** A parsed prompt: the shared row's key/votes + its typed payload. */
export interface PromptRow {
  key: string;
  count: number;
  authorUserId: number;
  name: string;
  description: string;
  data: PromptData;
}

/** A parsed result row (key/author + typed payload). */
export interface ResultRow {
  key: string;
  authorUserId: number;
  data: ResultData;
}

// ---------------------------------------------------------------------------
// Runner queue (the estimate → confirm → submit → poll → publish lifecycle).
// ---------------------------------------------------------------------------

export type CellRunStatus =
  | 'idle'
  | 'estimating'
  | 'confirming'
  | 'submitting'
  | 'processing'
  /** The poll window elapsed while still generating — keep the workflowId, offer
   * a re-poll rather than dropping to a blank/failed state. */
  | 'stalled'
  | 'publishing'
  | 'succeeded'
  | 'failed'
  | 'canceled';

export interface CellRun {
  comboKey: string;
  /** The config (within the combination) this run is for. */
  configId: string;
  promptKey: string;
  ecosystem: string;
  status: CellRunStatus;
  estimatedCost?: number;
  workflowId?: string;
  error?: string;
}
