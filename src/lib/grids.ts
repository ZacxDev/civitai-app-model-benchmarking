// PURE, node-testable core of the `grid` record kind (spec `docs/matchups.md`
// §11.1/§11.2). No React, no SDK hooks, no network.
//
// A GRID is a named, hand-picked set of matchups × prompts: built privately in
// the per-viewer KV under `UNPUB_GRID_PREFIX`, then PUBLISHED as the fourth row
// kind on the one shared board. §11.1's boundary is unchanged and is what makes
// an unpublished grid private: WHICH STORE the record is in. There is no
// `visibility` field and nothing here builds one — a shared row is
// world-readable the instant it is appended, and its `data` is not moderated.
//
// 🔴 THE WIRE SHAPE IS EFFECTIVELY PERMANENT. `update`/`withdraw` are
// author-scoped, so once another viewer appends a grid row the app owner can
// neither delete nor rewrite it. `v: 1` is carried from the first row so a later
// shape change is a migration-on-read (as `parseCombination`/`parsePrompt` already
// do for their kinds) rather than a break.

import type { SharedStorageValue } from '@civitai/app-sdk/blocks';

import type { GridData, GridRow } from '../types.js';
import { newId, type RawSharedItem } from './benchmark.js';

/**
 * Cap on a grid's rows and columns (spec §11.2). Not arbitrary: 20 is the `max`
 * of the per-viewer "Show top N" `Slider` this rework deletes, so a hand-built
 * grid may not exceed what the app already rendered. It also keeps the payload
 * far inside appStorage's 64 KB per-value limit while the grid is unpublished.
 */
export const MAX_GRID_MATCHUPS = 20;
export const MAX_GRID_PROMPTS = 20;

/**
 * The per-viewer KV key PREFIX every UNPUBLISHED grid lives under (spec §11.1).
 *
 * 🔴 Deliberately disjoint from `drafts.ts`'s `DRAFT_PREFIX` (`draft:v1:`), which
 * keeps its historical name FOREVER — real viewers hold matchup records under it
 * today and the app cannot migrate another viewer's per-viewer KV. Disjoint
 * prefixes are what keep `list({prefix})` narrowing cleanly per object kind.
 */
export const UNPUB_GRID_PREFIX = 'unpub:grid:v1:';

/** The per-viewer storage key for one unpublished grid. */
export function unpubGridKey(localId: string): string {
  return `${UNPUB_GRID_PREFIX}${localId}`;
}

/** A fresh local id for a new grid (per-viewer and app-chosen — NOT a shared key,
 * which only the host mints, at publish time). */
export function newGridLocalId(): string {
  return newId('grid');
}

// ---------------------------------------------------------------------------
// Key normalization — the ONE place order/dedup/cap are decided
// ---------------------------------------------------------------------------

/**
 * Normalize an authored key list into the stored shape, applying §11.2's three
 * rules in this order:
 *
 *  1. **Order is preserved.** The author picked a row/column order; the array
 *     carries it. A `Set` round-trip or a sort would silently discard an
 *     authored decision.
 *  2. **Keys are de-duplicated**, FIRST occurrence winning (so rule 1 still
 *     holds). A repeated key would render a duplicate row whose cells share one
 *     `(comboKey, configId, promptKey)` identity.
 *  3. **The cap applies to the DE-DUPLICATED list** — 22 entries with 3
 *     repeats is 19 members, not a cap violation.
 *
 * Non-string and blank entries are dropped rather than throwing: `data` is
 * app-owned but a forged or older-build row can carry anything.
 *
 * Used by BOTH `buildGridPayload` and `parseGrid` so a built payload and a
 * re-parsed one can never disagree about what the grid contains.
 */
function normalizeKeys(raw: unknown, cap: number): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== 'string') continue;
    const key = entry.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
    if (out.length >= cap) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Grid — build (publish) + parse (read) with the moderation split
// ---------------------------------------------------------------------------

/** The builder/edit input for a grid: a name/desc + the picked member keys. */
export interface GridInput {
  name: string;
  description: string;
  /** Shared keys of the chosen matchups (the grid's ROWS), in authored order. */
  matchupKeys: string[];
  /** Shared keys of the chosen prompts (the grid's COLUMNS), in authored order. */
  promptKeys: string[];
}

/** Human-readable validation errors that block a grid publish. Counts are taken
 * AFTER normalization, so they describe what would actually be stored. */
export function validateGrid(input: GridInput): string[] {
  const errs: string[] = [];
  if (!input.name.trim()) errs.push('Give the grid a name.');
  // Normalize with no cap so an over-cap list is REPORTED rather than silently
  // truncated at the point a human could still fix it.
  const matchups = normalizeKeys(input.matchupKeys, Number.POSITIVE_INFINITY);
  const prompts = normalizeKeys(input.promptKeys, Number.POSITIVE_INFINITY);
  if (matchups.length === 0) errs.push('Add at least one matchup (the grid needs a row).');
  if (prompts.length === 0) errs.push('Add at least one prompt (the grid needs a column).');
  if (matchups.length > MAX_GRID_MATCHUPS) errs.push(`At most ${MAX_GRID_MATCHUPS} matchups.`);
  if (prompts.length > MAX_GRID_PROMPTS) errs.push(`At most ${MAX_GRID_PROMPTS} prompts.`);
  return errs;
}

/**
 * THE SPLIT for a grid:
 *  - `title`/`body` → ALL user-visible TEXT (the grid's name + description),
 *    which is the MODERATED half of a shared row (§2.2).
 *  - `data`         → ONLY structure: the ordered, de-duplicated, capped member
 *    keys. Unmoderated, and it carries no author prose at all.
 *
 * 🔴 The name and description are NOT in `data` and must never be added to it:
 * putting author-supplied text in the unmoderated blob routes user text around
 * the content-safety belt (spec §11.2, first decision).
 *
 * `body` is the description VERBATIM (unlike a combination's, which appends a
 * `Resources:` meta line) — a grid's members are named by their own rows, so
 * there is nothing to append, and the round trip through `parseGrid` is exact.
 */
export function buildGridPayload(input: GridInput): SharedStorageValue {
  const data: GridData = {
    v: 1,
    kind: 'grid',
    matchupKeys: normalizeKeys(input.matchupKeys, MAX_GRID_MATCHUPS),
    promptKeys: normalizeKeys(input.promptKeys, MAX_GRID_PROMPTS),
  };
  return { title: input.name.trim(), body: input.description.trim(), data };
}

/**
 * Parse a shared row into a typed `GridRow`, or null if it isn't one — the
 * migration-on-read seam, matching `parseCombination`/`parsePrompt`.
 *
 * Rejects (→ null): a missing/non-object `data`; a `kind` that isn't `'grid'`;
 * any `v` other than 1 (an unknown future version is dropped, not guessed at);
 * and a row left with NO usable matchup key or NO usable prompt key once junk
 * entries are dropped — such a row can render nothing, so it is not a grid.
 *
 * 🔴 That last rejection is about the STORED PAYLOAD being empty, and is NOT the
 * dangling-reference case: a grid whose members were withdrawn still parses
 * fine (its keys are intact) and is resolved against the live board by
 * {@link resolveGrid}, which never drops a member silently.
 */
export function parseGrid(item: RawSharedItem): GridRow | null {
  const d = item.value.data as
    | { v?: unknown; kind?: unknown; matchupKeys?: unknown; promptKeys?: unknown }
    | undefined;
  if (!d || typeof d !== 'object') return null;
  if (d.kind !== 'grid') return null;
  if (d.v !== 1) return null;

  const matchupKeys = normalizeKeys(d.matchupKeys, MAX_GRID_MATCHUPS);
  const promptKeys = normalizeKeys(d.promptKeys, MAX_GRID_PROMPTS);
  if (matchupKeys.length === 0 || promptKeys.length === 0) return null;

  return {
    key: item.key,
    count: item.count,
    authorUserId: item.authorUserId,
    name: item.value.title ?? '',
    description: item.value.body ?? '',
    data: { v: 1, kind: 'grid', matchupKeys, promptKeys },
  };
}

/** Convert a parsed grid row back into a builder input (for edit-in-place via
 * `shared.update`, which is the only post-publish mutation — there is no
 * unpublish). */
export function gridToInput(row: GridRow): GridInput {
  return {
    name: row.name,
    description: row.description,
    matchupKeys: [...row.data.matchupKeys],
    promptKeys: [...row.data.promptKeys],
  };
}

// ---------------------------------------------------------------------------
// Dangling references — NORMAL, not exceptional (spec §11.2)
// ---------------------------------------------------------------------------

/** One axis of a grid resolved against the live board. */
export interface ResolvedMembers {
  /** The authored keys that still exist on the board, in AUTHORED order. */
  present: string[];
  /** How many authored keys are GONE. Never folded into `present.length`. */
  missing: number;
}

/** A whole grid resolved against the live board. */
export interface ResolvedGrid {
  matchups: ResolvedMembers;
  prompts: ResolvedMembers;
  /** Missing members across BOTH axes — the one number the honest notice shows. */
  missingTotal: number;
}

/**
 * Resolve one authored key list against the keys currently on the shared board.
 *
 * 🔴 A grid names keys whose rows another author may `withdraw` at any time, and
 * the grid's author cannot repair another author's row — so dangling references
 * are the NORMAL case. This function therefore never throws and never silently
 * shrinks: it returns what survives, in authored order, alongside a COUNT of what
 * is gone, so the caller can disclose the gap. A quietly-shrinking grid is the
 * same class of lie as the §7.2 truncation this repo already discloses.
 *
 * `keys` is expected to be already normalized (see `parseGrid`); duplicates are
 * not the concern of this function and are passed through as authored.
 */
export function resolveMembers(keys: readonly string[], available: ReadonlySet<string>): ResolvedMembers {
  const present: string[] = [];
  let missing = 0;
  for (const key of keys) {
    if (available.has(key)) present.push(key);
    else missing += 1;
  }
  return { present, missing };
}

/**
 * Resolve BOTH axes of a grid against the keys currently on the shared board.
 * See {@link resolveMembers}: never throws, order preserved, missing counted.
 * A grid all of whose members are gone resolves to two empty `present` arrays
 * and a truthy `missingTotal` — an EMPTY grid with an honest count, which the
 * caller renders as such rather than treating as an error.
 */
export function resolveGrid(data: GridData, available: ReadonlySet<string>): ResolvedGrid {
  const matchups = resolveMembers(data.matchupKeys, available);
  const prompts = resolveMembers(data.promptKeys, available);
  return { matchups, prompts, missingTotal: matchups.missing + prompts.missing };
}
