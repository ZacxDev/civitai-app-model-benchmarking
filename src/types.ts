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
// Combination — a checkpoint + weighted LoRA stack to benchmark (vote-able).
// ---------------------------------------------------------------------------

/** A checkpoint pinned to a combination (from useResourcePicker, Checkpoint). */
export interface CheckpointRef {
  versionId: number;
  modelId: number;
  /** The base model family (e.g. 'SDXL 1.0', 'Pony', 'Flux.1 D') — the ECOSYSTEM
   * discriminant. A combination runs a prompt's entry for the ecosystem this
   * base model maps to (see lib/ecosystem.ts). */
  baseModel: string;
  modelName?: string;
  versionName?: string;
}

/** One weighted LoRA in a combination's stack (from useResourcePicker, LORA). */
export interface LoraRef {
  versionId: number;
  /** Applied weight/strength (clamped to [min,max]). */
  weight: number;
  modelName?: string;
  versionName?: string;
  minStrength?: number;
  maxStrength?: number;
}

/** The opaque structured payload for a `combination` shared record. */
export interface CombinationData {
  v: 1;
  kind: 'combination';
  checkpoint: CheckpointRef;
  loras: LoraRef[];
}

// ---------------------------------------------------------------------------
// Prompt — a multi-ecosystem prompt (vote-able). One entry per ecosystem.
// ---------------------------------------------------------------------------

/** Per-ecosystem generation parameters (subset of BlockTextToImageParams). */
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

/** One ecosystem's raw prompt string + params inside a multi-ecosystem prompt. */
export interface EcosystemPrompt {
  prompt: string;
  params: PromptParams;
}

/** The opaque structured payload for a `prompt` shared record. Keyed by the
 * ecosystem group key (see lib/ecosystem.ts `ECOSYSTEMS`). */
export interface PromptData {
  v: 1;
  kind: 'prompt';
  byEcosystem: Record<string, EcosystemPrompt>;
}

// ---------------------------------------------------------------------------
// Result — a run's published outputs for one (combo × prompt) cell (small refs).
// ---------------------------------------------------------------------------

/** The opaque structured payload for a `result` shared record. Small refs only —
 * NO image URLs (URLs are read per-viewer via the gated hook at render time). */
export interface ResultData {
  v: 1;
  kind: 'result';
  /** The shared key of the combination this result belongs to (matrix ROW). */
  comboKey: string;
  /** The shared key of the prompt this result belongs to (matrix COLUMN). */
  promptKey: string;
  /** The ecosystem the prompt was matched to the combo on. */
  ecosystem: string;
  /** The bare scanned Image row ids the runner published (via the gated bridge). */
  imageIds: number[];
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
  promptKey: string;
  ecosystem: string;
  status: CellRunStatus;
  estimatedCost?: number;
  workflowId?: string;
  error?: string;
}
