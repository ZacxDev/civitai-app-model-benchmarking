// The app-side "Model Benchmarking" data model.
//
// 🔴 The PLATFORM has no concept of a "combination", "prompt", or "result" — the
// whole benchmark is app-owned. Every contribution lives in App Blocks SHARED
// storage as a `{ title, body, data }` record: the moderated user-visible TEXT
// in `title`/`body`, and the structured payload in the opaque `data` blob (see
// lib/benchmark.ts `build*Payload` / `parse*`, and lib/grids.ts for `grid`).
// `data.kind` discriminates the four record types on the ONE shared list.

/** The four kinds of record the app appends to the single shared list.
 * 🔴 Each string is a PERSISTED WIRE VALUE carried by rows already on the board,
 * so none of them may ever be renamed (spec §6.1, restated by §11.4). */
export type RecordKind = 'combination' | 'prompt' | 'result' | 'grid';

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
// Grid — a NAMED, hand-picked set of matchups × prompts, built privately and
// then published as the FOURTH row kind on the one shared board (spec §11.2).
//
// 🔴 THIS WIRE SHAPE IS EFFECTIVELY PERMANENT from the first published grid
// onward: once another viewer appends a grid row, the app owner cannot delete or
// rewrite it — `update`/`withdraw` are author-scoped (§2.3) and `report()` does
// not hide. There is no migration path for another author's rows.
// ---------------------------------------------------------------------------

/** The opaque structured payload for a `grid` shared record. */
export interface GridData {
  v: 1;
  kind: 'grid';
  /** Ordered, de-duplicated shared keys of the matchups forming the grid's ROWS. */
  matchupKeys: string[];
  /** Ordered, de-duplicated shared keys of the prompts forming the grid's COLUMNS. */
  promptKeys: string[];
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

/** A parsed grid: the shared row's key/votes + its typed payload. Grid votes are
 * real (`shared.vote` on the grid row), so `count` orders Community Grids. */
export interface GridRow {
  key: string;
  count: number;
  authorUserId: number;
  name: string;
  description: string;
  data: GridData;
}

/** A parsed result row (key/author + typed payload). */
export interface ResultRow {
  key: string;
  authorUserId: number;
  data: ResultData;
}

// ---------------------------------------------------------------------------
// Unpublished records — an object being built PRIVATELY, before (and after) it
// is published.
//
// 🔴 An unpublished record lives in the PER-VIEWER KV (`useAppStorage`, prefix
// `draft:v1:` for matchups and `unpub:prompt:v1:` for prompts), which is the only
// store in the platform with a real per-viewer boundary. It is NOT a shared row
// with a flag on it: a `visibility` field inside a shared row's `data` would be
// cosmetic — the row is world-readable the instant it is appended and `data` is
// not moderated. Privacy here is *which store the record is in*, and publish is
// the copy from one into the other (spec §4, restated by §11.1).
//
// ⚠️ The matchup prefix keeps the historical word "draft" forever (live viewers
// hold records under it and the app cannot migrate another viewer's KV), while
// the RENDERED vocabulary dropped it in 527. The type names below follow the
// storage, not the UI.
// ---------------------------------------------------------------------------

/** A matchup that has NOT been published — the whole editable matchup, private. */
export interface DraftUnsubmitted {
  v: 1;
  /** App-chosen, per-viewer id. NOT a shared key (those are host-minted). */
  localId: string;
  name: string;
  description: string;
  configs: ModelConfig[];
  /** ISO timestamp of the last local edit (ordering only). */
  updatedAt: string;
}

/**
 * A record that HAS been published, rewritten to a pointer at its shared row.
 * Kept rather than deleted: it is the only per-viewer handle on that row (the
 * shared list has no "mine" index and its keys are host-minted, so they can
 * neither be predicted nor prefix-filtered). The editable body is dropped —
 * once public, `shared.update` owns the record.
 *
 * 🔴 ONE shape for every publishable object. Matchups and prompts write the
 * identical pointer under their own prefixes, so the pointer branch of the parse
 * — and the publish that writes it — lives once in `lib/unpublished.ts`.
 */
export interface PublishedPointer {
  v: 1;
  localId: string;
  /** The host-minted shared key `append()` resolved. */
  sharedKey: string;
  submittedAt: string;
}

/** Historical, matchup-flavoured alias of {@link PublishedPointer}. */
export type DraftPointer = PublishedPointer;

export type DraftRecord = DraftUnsubmitted | DraftPointer;

/**
 * A prompt that has NOT been published — the whole editable prompt, private.
 * Structurally the `PromptData` body plus the per-viewer bookkeeping; it is a
 * separate type rather than a reuse of `PromptData` because the stored shape is
 * app-private and versioned independently of the WIRE shape (`PromptData.v: 3`),
 * which is carried by rows already on the shared board and cannot move.
 */
export interface UnpublishedPrompt {
  v: 1;
  /** App-chosen, per-viewer id. NOT a shared key (those are host-minted). */
  localId: string;
  name: string;
  description: string;
  /** The default prompt + params, applied to ALL ecosystems. Always present. */
  default: PromptDefault;
  /** Optional, sparse per-ecosystem overrides (keyed by ecosystem group key). */
  overrides?: Record<string, PromptOverride>;
  /** ISO timestamp of the last local edit (ordering only). */
  updatedAt: string;
}

export type UnpublishedPromptRecord = UnpublishedPrompt | PublishedPointer;

/**
 * A grid that has NOT been published — the whole editable grid, private.
 *
 * 🔴 It stores the MEMBER KEYS, not copies of the member rows. A grid is a set of
 * REFERENCES to shared rows another author owns and may withdraw at any time
 * (§11.2 calls dangling references NORMAL), so copying the rows in would freeze a
 * stale snapshot of somebody else's record and hide exactly the disappearance the
 * grid is obliged to disclose.
 */
export interface UnpublishedGrid {
  v: 1;
  /** App-chosen, per-viewer id. NOT a shared key (those are host-minted). */
  localId: string;
  name: string;
  description: string;
  /** Shared keys of the chosen matchups (the grid's ROWS), in authored order. */
  matchupKeys: string[];
  /** Shared keys of the chosen prompts (the grid's COLUMNS), in authored order. */
  promptKeys: string[];
  /** ISO timestamp of the last local edit (ordering only). */
  updatedAt: string;
}

export type UnpublishedGridRecord = UnpublishedGrid | PublishedPointer;

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
  /**
   * 🔴 MONEY SAFETY: "we were about to spend, and we do not know whether we did."
   *
   * Reached from a persisted CLAIM that carries no `workflowId` (see
   * {@link InflightRun}): the app wrote the claim, then either the page went away
   * before `submit` returned, or `submit` threw with the request already in
   * flight. The submit may well have SUCCEEDED with only the response lost, so
   * this is genuinely ambiguous — it is NOT "nothing happened".
   *
   * Consequences, and they are the point of the state existing: such a cell is
   * NOT auto-adopted (there is no workflowId to resume-poll) and NOT
   * auto-runnable (that is the double charge). It renders as an explicit unknown
   * with a deliberate escape hatch, so a stuck claim can never permanently brick
   * a cell — but leaving it takes a viewer's decision, never a default.
   */
  | 'unknown'
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

/**
 * A single IN-FLIGHT cell run, persisted to per-viewer app storage and removed on
 * terminal. 🔴 MONEY SAFETY: `runs` is in-memory component state, so a reload
 * would otherwise reset a still-running cell to empty+runnable → a re-run = a
 * SECOND real Buzz charge, and the first generation's outputs never reach the
 * grid. Persisting `{ cellKey → workflowId + cell coords }` lets the app
 * rehydrate the cell as in-flight on load (never empty+runnable) and offer a
 * resume-poll instead. Keyed per cell under the `inflight:v1:` storage prefix so
 * concurrent runs never RMW-clobber each other.
 *
 * 🔴 WRITTEN IN TWO PHASES, WHICH IS WHY `workflowId` IS OPTIONAL. It used to be
 * required, and the record was written only AFTER `submit` resolved — i.e. after
 * the money was spent. `useAppStorage.set` rejects when the value exceeds 64 KB,
 * when the per-app quota would be crossed, or for an anonymous viewer, and that
 * rejection was swallowed: nothing was written, so neither the rehydrate scan nor
 * the pre-spend read could find anything, and the next load rendered the cell
 * empty and runnable → DOUBLE CHARGE, with no signal anywhere. The quota is
 * per-APP while the data is per-(block instance, viewer), so one viewer filling
 * the ceiling made that write reject for EVERY viewer at once.
 *
 *  - PHASE 1 — the CLAIM, written and AWAITED *before* `submit`: cell coords, no
 *    `workflowId`. A rejection here refuses the spend outright, so the failure now
 *    lands before the money instead of after it.
 *  - PHASE 2 — the UPGRADE, written after `submit` resolves: the same key with the
 *    `workflowId` added. Best-effort is now safe; a lost phase-2 write degrades to
 *    a claim-only record, which is a safe (unknown) state, not a runnable one.
 *
 * A record with NO `workflowId` therefore means "we were about to spend and we do
 * not know whether we did" — see the `'unknown'` {@link CellRunStatus}. It must
 * never be auto-adopted (nothing to resume-poll) nor treated as absent (that is
 * the double charge).
 */
export interface InflightRun {
  /** Present only from PHASE 2 on. Absent = an unresolved claim — see above. */
  workflowId?: string;
  comboKey: string;
  configId: string;
  promptKey: string;
  ecosystem: string;
}
