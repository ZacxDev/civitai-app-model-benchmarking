// The MATCHUP half of the unpublished → published boundary (spec §4, restated by
// §11.1 of `docs/matchups.md`). The rule itself lives in ./unpublished.ts and is
// shared with prompts; this file contributes only the matchup-shaped record and
// its historical storage prefix.
//
// 🔴 THE PREFIX KEEPS ITS HISTORICAL NAME. Real viewers hold records under
// `draft:v1:` today, and the app cannot migrate another viewer's per-viewer KV —
// renaming it orphans them permanently. So the STORAGE keeps the word "draft"
// forever while the rendered vocabulary does not (§11.1): an unpublished matchup
// now appears in the My Matchups tab carrying a Publish action, and the word
// "draft" appears in no user-visible string.
//
// The shared payload for a publish is built by `buildCombinationPayload` in
// ./benchmark.ts — unchanged, so a published record is byte-identical to a row
// submitted directly. 🔴 `data.kind: 'combination'` is a PERSISTED WIRE VALUE
// that discriminates every row already on the board; it is never renamed.

import type { AppStorageQuota } from '@civitai/blocks-react';

import type { DraftPointer, DraftRecord, DraftUnsubmitted, ModelConfig } from '../types.js';
import { type CombinationInput } from './benchmark.js';
import {
  formatQuota as formatQuotaShared,
  isPublished,
  newLocalId,
  parseUnpublished,
  publishedPointer,
  sortUnpublished,
  unpublishedKey,
} from './unpublished.js';

/**
 * The per-viewer KV key PREFIX every unpublished matchup lives under. The app
 * chooses its own keys in THIS store, so `list({prefix})` genuinely narrows here
 * — which is the whole reason unpublished records live in it and not on the
 * shared board, where keys are host-minted and a prefix filter can never work
 * (spec §2.3 C1).
 *
 * 🔴 NEVER RENAMED — see the file header. Pinned by `renameWireCompat.test.ts`.
 */
export const DRAFT_PREFIX = 'draft:v1:';

/** The storage key for one unpublished matchup. */
export function draftKey(localId: string): string {
  return unpublishedKey(DRAFT_PREFIX, localId);
}

/** A fresh local id (per-viewer and app-chosen — NOT a shared key). */
export function newDraftLocalId(): string {
  return newLocalId('draft');
}

/** Has this record been published? (i.e. is it now a pointer at a shared row?) */
export function isSubmitted(draft: DraftRecord): draft is DraftPointer {
  return isPublished(draft);
}

/** Build the stored shape of an UNPUBLISHED matchup from the form input. */
export function buildDraft(
  localId: string,
  input: CombinationInput,
  now: Date = new Date(),
): DraftUnsubmitted {
  return {
    v: 1,
    localId,
    name: input.name.trim(),
    description: input.description.trim(),
    configs: input.configs.map((cfg) => ({
      id: cfg.id,
      ...(cfg.label?.trim() ? { label: cfg.label.trim() } : {}),
      checkpoint: cfg.checkpoint,
      loras: cfg.loras.map((l) => ({ ...l })),
    })),
    updatedAt: now.toISOString(),
  };
}

/**
 * Rewrite a record to the POINTER it becomes after publish (see the shared core).
 *
 * ⚠ TEST-ONLY — SAME CLASS AS `recordKind` IN `benchmark.ts`, and labelled for
 * the same reason: an exported helper that reads like a live path and is not one.
 * It lost its last production import when `App.tsx`'s three publish paths were
 * consolidated into `publishRecord`, which calls `publishedPointer` from
 * `unpublished.ts` directly. The only caller left is `drafts.test.ts`, so it is
 * dropped from the built bundle entirely.
 *
 * Kept rather than inlined for the one thing it still does: it states, in the
 * matchup object's own module, that a matchup's pointer is the SHARED shape and
 * not a per-object one — the boundary `unpublished.ts` exists to hold. Do not
 * read it as coverage of the publish path; `src/publishPointerFailure.test.tsx`
 * covers that, through the real `App`.
 */
export function submittedPointer(
  localId: string,
  sharedKey: string,
  now: Date = new Date(),
): DraftPointer {
  return publishedPointer(localId, sharedKey, now);
}

/** Turn an unpublished matchup back into a form input (for edit-in-place). */
export function draftToInput(draft: DraftUnsubmitted): CombinationInput {
  return {
    name: draft.name,
    description: draft.description,
    configs: draft.configs.map((cfg) => ({
      id: cfg.id,
      label: cfg.label,
      checkpoint: cfg.checkpoint,
      loras: cfg.loras.map((l) => ({ ...l })),
    })),
  };
}

/**
 * Defensive parse of one stored KV value into a matchup record. A row carrying a
 * `sharedKey` parses as a POINTER even if it also carries a stale body — the
 * pointer is the newer shape and wins (that branch lives in the shared core).
 * A body with no usable config is dropped rather than crashing the list.
 */
export function parseDraft(raw: unknown): DraftRecord | null {
  return parseUnpublished<DraftUnsubmitted>(raw, (d, localId) => {
    const configs = Array.isArray(d.configs)
      ? (d.configs.filter(
          (cfg) => !!cfg && !!(cfg as ModelConfig).checkpoint && typeof (cfg as ModelConfig).id === 'string',
        ) as ModelConfig[])
      : [];
    if (configs.length === 0) return null;
    return {
      v: 1,
      localId,
      name: typeof d.name === 'string' ? d.name : '',
      description: typeof d.description === 'string' ? d.description : '',
      configs,
      updatedAt: typeof d.updatedAt === 'string' ? d.updatedAt : '',
    };
  });
}

/** Newest-edited first, then by localId so the order is deterministic. */
export function sortDrafts(drafts: DraftRecord[]): DraftRecord[] {
  return sortUnpublished(drafts);
}

export { formatBytes } from './unpublished.js';

/** The host-reported storage line (see the shared core for the scope split). */
export function formatQuota(quota: AppStorageQuota | null): string | null {
  return formatQuotaShared(quota);
}
