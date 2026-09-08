// The PURE, node-testable core of the UNPUBLISHED → PUBLISHED boundary, shared
// by every publishable object (spec §11.1 of `docs/matchups.md`). No React, no
// SDK hooks, no network.
//
// 🔴 THE BOUNDARY THIS FILE EXISTS TO HOLD: an unpublished record lives in the
// PER-VIEWER KV (`useAppStorage`, keys chosen by the app, quota-bounded,
// anonymous writes rejected), and PUBLISH is the copy of that record into the
// app-scoped PUBLIC board (`useSharedStorage.append`). Those are two different
// stores, and which store a record is in is the ONLY thing that makes it
// private. There is no `visibility` field to set: a shared row is world-readable
// the instant it is appended, and its `data` blob is not even moderated. So
// nothing in this file may ever reach shared storage, and nothing here builds a
// privacy flag.
//
// 🔴 WHY IT IS ONE FILE RATHER THAN ONE PER OBJECT. Matchups reached this
// boundary first (`drafts.ts`, prefix `draft:v1:`); prompts joined in 527 with
// their own prefix. Every part of the rule EXCEPT the record body is identical
// between them — the key shape, the pointer written on publish, the
// pointer-wins parse, the ordering, the quota line. A predicate open-coded at
// two sites is typically wrong at one of them, so the rule lives here once and
// each object contributes only its own body parser.

import type { AppStorageQuota } from '@civitai/blocks-react';

import type { PublishedPointer } from '../types.js';
import { newId } from './benchmark.js';

/** The per-viewer KV key for one unpublished record under an object's prefix. */
export function unpublishedKey(prefix: string, localId: string): string {
  return `${prefix}${localId}`;
}

/** A fresh local id (per-viewer and app-chosen — NOT a host-minted shared key). */
export function newLocalId(tag: string): string {
  return newId(tag);
}

/**
 * Has this record been PUBLISHED? (i.e. is it now a pointer at a shared row?)
 * The presence of a non-empty `sharedKey` is the whole test, for every object.
 */
export function isPublished<T extends { localId: string }>(
  record: T | PublishedPointer,
): record is PublishedPointer {
  const p = record as PublishedPointer;
  return typeof p.sharedKey === 'string' && !!p.sharedKey;
}

/**
 * Rewrite a record to the POINTER it becomes after publish: `{ localId,
 * sharedKey, submittedAt }`. The record is KEPT rather than deleted because it
 * is the only PER-VIEWER handle on the row — the shared list carries no "mine"
 * index, and a shared key can neither be predicted nor prefix-filtered. The
 * editable body is dropped: once the row is public, `shared.update` (which
 * preserves the key and the vote total) is the single source of truth for it,
 * and a stale private copy would be a second one.
 */
export function publishedPointer(
  localId: string,
  sharedKey: string,
  now: Date = new Date(),
): PublishedPointer {
  return { v: 1, localId, sharedKey, submittedAt: now.toISOString() };
}

/**
 * The honest copy for a publish whose `shared.append` SUCCEEDED but whose
 * pointer write did not.
 *
 * 🔴 THE ASYMMETRY THIS SENTENCE EXISTS TO STATE. `append` is IRREVERSIBLE by
 * this app: the row is public the instant it resolves, `update`/`withdraw` are
 * author-scoped-but-key-addressed (and the key only ever reached the pointer
 * write that just failed), `report()` does not hide, and there is no merge. The
 * per-viewer `set` that records the row's key, by contrast, rejects routinely —
 * on the per-APP 50MB quota (so one viewer at the ceiling breaks it for
 * everyone), on a >64KB value, and for an anonymous viewer.
 *
 * So the two halves of a publish do NOT fail together, and the failure that
 * matters is the one where the PUBLIC half landed and the PRIVATE half did not.
 * Saying "publish failed" there would be a lie that invites a second click, and
 * a second click on `append` mints a SECOND permanent public row — there is no
 * idempotency key to collapse them. This sentence says which half landed, that
 * the record is gone from this list, and where the published copy now lives.
 */
export function publishPointerFailedNotice(noun: string, hostError: string): string {
  return (
    `Your ${noun} WAS published to the shared board — but your private copy could not be ` +
    `updated, so it is no longer listed here and cannot be published again. ` +
    `Find it under Published by you to edit or remove it. (${hostError})`
  );
}

/**
 * Defensive parse of one stored KV value. The store is per-viewer and app-owned,
 * but a value can still be from an older/newer build, so an unusable row is
 * dropped rather than crashing the list.
 *
 * A row carrying a `sharedKey` parses as a POINTER even if it also carries a
 * stale body — the pointer is the newer shape and wins. Only when it is NOT a
 * pointer does `parseBody` get a say, so each object parses just its own body.
 */
export function parseUnpublished<TBody>(
  raw: unknown,
  parseBody: (d: Record<string, unknown>, localId: string) => TBody | null,
): TBody | PublishedPointer | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
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
  return parseBody(d, d.localId);
}

/**
 * Parse a stored value as a POINTER ONLY — a record still carrying its editable
 * body reads as `null` here.
 *
 * 🔴 It is defined in terms of {@link parseUnpublished} rather than re-typing the
 * three checks, so the "what counts as a pointer" rule cannot drift between the
 * list load (which needs the body too) and the withdraw-time pointer sweep (which
 * does not). The sweep deletes per-viewer rows; a second, subtly different copy
 * of this predicate is how it comes to delete the wrong one.
 */
export function parsePointer(raw: unknown): PublishedPointer | null {
  return parseUnpublished<never>(raw, () => null) as PublishedPointer | null;
}

/** Newest-edited first, then by localId so the order is deterministic. */
export function sortUnpublished<T extends { localId: string }>(records: T[]): T[] {
  const stamp = (r: T): string =>
    (isPublished(r) ? r.submittedAt : (r as { updatedAt?: string }).updatedAt) || '';
  return [...records].sort(
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
 * The storage line shown above a viewer's unpublished items.
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
 *     viewer) tuple", so an unpublished item really is invisible to everyone else;
 *   - the QUOTA is PER-APP    — `set()` rejects "when the per-app 50MB quota
 *     would be crossed", and the hook doc reads "50 MB + ~1M rows per app".
 *
 * So `usedBytes`/`rowCount` are APP-WIDE totals summed over every viewer. This
 * line used to open `Private to you — ${usedBytes} of ${limitBytes} used…`,
 * which fused the two and told the viewer those were their own figures. It was
 * measured false on 2026-08-31: two different viewers (ids 8753561 and
 * 11025902) saw byte-identical quota lines, including a row count that had just
 * moved 27 -> 28 because of the FIRST viewer's record. Never re-fuse them.
 *
 * ⚠️ The leading noun changed from "Drafts" to "Unpublished items" in 527: the
 * word "draft" left the rendered vocabulary (§11.1) while the `draft:v1:` STORAGE
 * prefix kept its historical name. The two clauses and their scopes are unchanged.
 */
export function formatQuota(quota: AppStorageQuota | null): string | null {
  if (!quota) return null;
  return (
    'Unpublished items are private to you. Storage is app-wide, shared with every other viewer: ' +
    `${formatBytes(quota.usedBytes)} of ${formatBytes(quota.limitBytes)} used, ` +
    `${quota.rowCount.toLocaleString('en-US')} of ${quota.limitRows.toLocaleString('en-US')} rows.`
  );
}
