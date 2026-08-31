// PURE, node-testable core of the DRAFT ↔ SUBMIT boundary (spec §4 of
// `docs/matchups.md`). No React, no SDK hooks, no network.
//
// 🔴 THE BOUNDARY THIS FILE EXISTS TO HOLD: a draft lives in the PER-VIEWER KV
// (`useAppStorage`, keys chosen by the app, quota-bounded, anonymous viewers
// rejected), and SUBMIT is the copy of that draft into the app-scoped PUBLIC
// board (`useSharedStorage.append`). Those are two different stores, and which
// store a record is in is the ONLY thing that makes it private. There is no
// `visibility` field to set: a shared row is world-readable the instant it is
// appended, and its `data` blob is not even moderated. So nothing in this file
// may ever reach shared storage, and nothing here builds a privacy flag.
//
// The shared payload for a submit is built by `buildCombinationPayload` in
// ./benchmark.ts — unchanged, so a submitted draft is byte-identical to a row
// submitted directly. 🔴 `data.kind: 'combination'` is a PERSISTED WIRE VALUE
// that discriminates every row already on the board; it is never renamed.

import type { AppStorageQuota } from '@civitai/blocks-react';

import type { DraftPointer, DraftRecord, DraftUnsubmitted, ModelConfig } from '../types.js';
import { newId, type CombinationInput } from './benchmark.js';

/**
 * The per-viewer KV key PREFIX every draft lives under. The app chooses its own
 * keys in THIS store, so `list({prefix})` genuinely narrows here — which is the
 * whole reason drafts live in it and not on the shared board, where keys are
 * host-minted and a prefix filter can never work (spec §2.3 C1).
 */
export const DRAFT_PREFIX = 'draft:v1:';

/** The storage key for one draft. */
export function draftKey(localId: string): string {
  return `${DRAFT_PREFIX}${localId}`;
}

/** A fresh local id for a new draft (per-viewer and app-chosen — NOT a shared key). */
export function newDraftLocalId(): string {
  return newId('draft');
}

/** Has this draft been submitted? (i.e. is it now a pointer at a shared row?) */
export function isSubmitted(draft: DraftRecord): draft is DraftPointer {
  return typeof (draft as DraftPointer).sharedKey === 'string' && !!(draft as DraftPointer).sharedKey;
}

/** Build the stored shape of an UNSUBMITTED draft from the form input. */
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
 * Rewrite a draft to the POINTER it becomes after submit: `{ localId, sharedKey,
 * submittedAt }`, exactly as spec §4 specifies. The draft is KEPT rather than
 * deleted because it is the only PER-VIEWER handle on the row — the shared list
 * carries no "mine" index, and a shared key cannot be predicted or prefixed.
 * The editable body is dropped: once the row is public, `shared.update` (which
 * preserves the key and the vote total) is the single source of truth for it,
 * and a stale private copy would be a second one.
 */
export function submittedPointer(
  localId: string,
  sharedKey: string,
  now: Date = new Date(),
): DraftPointer {
  return { v: 1, localId, sharedKey, submittedAt: now.toISOString() };
}

/** Turn an unsubmitted draft back into a form input (for edit-in-place). */
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
 * Defensive parse of one stored KV value into a draft. The store is per-viewer
 * and app-owned, but a value can still be from an older/newer build, so an
 * unusable row is dropped rather than crashing the list.
 *
 * A row carrying a `sharedKey` parses as a POINTER even if it also carries a
 * stale body — the pointer is the newer shape and wins.
 */
export function parseDraft(raw: unknown): DraftRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Partial<DraftUnsubmitted & DraftPointer>;
  if (d.v !== 1) return null;
  if (typeof d.localId !== 'string' || !d.localId) return null;

  if (typeof d.sharedKey === 'string' && d.sharedKey) {
    return {
      v: 1,
      localId: d.localId,
      sharedKey: d.sharedKey,
      submittedAt: typeof d.submittedAt === 'string' ? d.submittedAt : '',
    };
  }

  const configs = Array.isArray(d.configs)
    ? (d.configs.filter(
        (cfg) => !!cfg && !!(cfg as ModelConfig).checkpoint && typeof (cfg as ModelConfig).id === 'string',
      ) as ModelConfig[])
    : [];
  if (configs.length === 0) return null;
  return {
    v: 1,
    localId: d.localId,
    name: typeof d.name === 'string' ? d.name : '',
    description: typeof d.description === 'string' ? d.description : '',
    configs,
    updatedAt: typeof d.updatedAt === 'string' ? d.updatedAt : '',
  };
}

/** Newest-edited first, then by localId so the order is deterministic. */
export function sortDrafts(drafts: DraftRecord[]): DraftRecord[] {
  const stamp = (d: DraftRecord): string => (isSubmitted(d) ? d.submittedAt : d.updatedAt) || '';
  return [...drafts].sort(
    (a, b) =>
      (stamp(b) < stamp(a) ? -1 : stamp(b) > stamp(a) ? 1 : 0) ||
      (a.localId < b.localId ? -1 : a.localId > b.localId ? 1 : 0),
  );
}

/** A short human size (the host reports bytes; nobody reads bytes). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/**
 * The storage line shown above the drafts list.
 *
 * 🔴 EVERY NUMBER IN IT COMES FROM `getQuota()` — the ceilings are host-enforced
 * and host-reported, so a hard-coded "50 MB" is a claim this block is not
 * entitled to make and would go silently stale the day the host moves it
 * (acceptance criterion 6). `null` means the quota has not been read yet (or the
 * viewer is anonymous), and the caller renders nothing rather than a guess.
 *
 * 🔴 THE PRIVACY CLAIM AND THE NUMBERS ARE DELIBERATELY IN SEPARATE CLAUSES,
 * and that separation is the whole point of this string. The two halves have
 * DIFFERENT SCOPES and the SDK contract says so explicitly
 * (`@civitai/blocks-react` `useAppStorage`):
 *
 *   - the DATA is per-viewer  — `get()` reads "the current (block instance,
 *     viewer) tuple", so a draft really is invisible to everyone else;
 *   - the QUOTA is PER-APP    — `set()` rejects "when the per-app 50MB quota
 *     would be crossed", and the hook doc reads "50 MB + ~1M rows per app".
 *
 * So `usedBytes`/`rowCount` are APP-WIDE totals summed over every viewer. This
 * line used to open `Private to you — ${usedBytes} of ${limitBytes} used…`,
 * which fused the two and told the viewer those were their own figures. It was
 * measured false on 2026-08-31: two different viewers (ids 8753561 and
 * 11025902) saw byte-identical quota lines, including a row count that had just
 * moved 27 -> 28 because of the FIRST viewer's draft. Never re-fuse them.
 */
export function formatQuota(quota: AppStorageQuota | null): string | null {
  if (!quota) return null;
  return (
    'Drafts are private to you. Storage is app-wide, shared with every other viewer: ' +
    `${formatBytes(quota.usedBytes)} of ${formatBytes(quota.limitBytes)} used, ` +
    `${quota.rowCount.toLocaleString('en-US')} of ${quota.limitRows.toLocaleString('en-US')} rows.`
  );
}
