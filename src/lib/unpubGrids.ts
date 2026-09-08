// The GRID half of the unpublished → published boundary (spec §11.1/§11.2). The
// rule itself lives in ./unpublished.ts and is shared with matchups and prompts;
// this file contributes only the grid-shaped record.
//
// 🔴 THE PREFIX IS `unpub:grid:v1:` AND IT IS OWNED BY ./grids.ts, which is where
// §11.2's grid constants live. It is imported here rather than re-spelled: a
// second literal is a second thing to get wrong, and a prefix that drifts orphans
// every record a live viewer already holds under the old one.
//
// The SHARED payload for a publish is built by `buildGridPayload` in ./grids.ts —
// unchanged — so a published grid carries `data.kind: 'grid'` at `v: 1` and the
// moderation split (name/description in `title`/`body`, member keys only in
// `data`).

import type { PublishedPointer, UnpublishedGrid, UnpublishedGridRecord } from '../types.js';
import { UNPUB_GRID_PREFIX, type GridInput } from './grids.js';
import { isPublished, parseUnpublished, sortUnpublished } from './unpublished.js';

/** Has this record been published? (i.e. is it now a pointer at a shared row?) */
export function isPublishedGrid(rec: UnpublishedGridRecord): rec is PublishedPointer {
  return isPublished(rec);
}

/**
 * Keep only the usable string keys of an authored list, first-occurrence-wins.
 *
 * 🔴 NO CAP IS APPLIED HERE, deliberately, and it is the same rule `GridPicker`
 * follows: `grids.ts`'s `normalizeKeys` truncates at WRITE time, which is right
 * for a payload, but truncating a record a human is still editing would silently
 * discard members they can still see and still remove themselves. The cap is
 * reported by `validateGrid` and enforced by `buildGridPayload` at publish.
 */
function keepKeys(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== 'string') continue;
    const key = entry.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/** Build the stored shape of an UNPUBLISHED grid from the form input. */
export function buildUnpubGrid(
  localId: string,
  input: GridInput,
  now: Date = new Date(),
): UnpublishedGrid {
  return {
    v: 1,
    localId,
    name: input.name.trim(),
    description: input.description.trim(),
    matchupKeys: keepKeys(input.matchupKeys),
    promptKeys: keepKeys(input.promptKeys),
    updatedAt: now.toISOString(),
  };
}

/** Turn an unpublished grid back into a form input (for edit-in-place). */
export function unpubGridToInput(rec: UnpublishedGrid): GridInput {
  return {
    name: rec.name,
    description: rec.description,
    matchupKeys: [...rec.matchupKeys],
    promptKeys: [...rec.promptKeys],
  };
}

/**
 * Defensive parse of one stored KV value into a grid record. A row carrying a
 * `sharedKey` parses as a POINTER (that branch lives in the shared core).
 *
 * 🔴 A record with NO usable member on either axis is DROPPED, mirroring
 * `parseGrid`'s rule for the shared row: such a record can render no cell and can
 * never pass `validateGrid`, so it is not a grid. That is about the STORED
 * payload being empty and is NOT the dangling-reference case — a record whose
 * members were withdrawn from the board still has its keys and still parses.
 */
export function parseUnpubGrid(raw: unknown): UnpublishedGridRecord | null {
  return parseUnpublished<UnpublishedGrid>(raw, (d, localId) => {
    const matchupKeys = keepKeys(d.matchupKeys);
    const promptKeys = keepKeys(d.promptKeys);
    if (matchupKeys.length === 0 && promptKeys.length === 0) return null;
    return {
      v: 1,
      localId,
      name: typeof d.name === 'string' ? d.name : '',
      description: typeof d.description === 'string' ? d.description : '',
      matchupKeys,
      promptKeys,
      updatedAt: typeof d.updatedAt === 'string' ? d.updatedAt : '',
    };
  });
}

/** Newest-edited first, then by localId so the order is deterministic. */
export function sortUnpubGrids(recs: UnpublishedGridRecord[]): UnpublishedGridRecord[] {
  return sortUnpublished(recs);
}

/** Re-exported so a caller needs exactly one import for the private grid store. */
export { UNPUB_GRID_PREFIX };
