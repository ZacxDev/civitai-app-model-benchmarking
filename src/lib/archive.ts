// ARCHIVE — an author-side hide of one of the viewer's OWN published rows, and
// NOT a suppression (spec §11.3).
//
// 🔴 WHAT ARCHIVING ACTUALLY DOES, exactly: it removes the row from THIS
// viewer's My list. The row stays on the shared board, stays in Community for
// everyone including the archiver, keeps its votes, and keeps serving any grid
// that references it. Nothing about it changes for another viewer.
//
// 🔴 AND WHY THE COPY BELOW IS PART OF THE FEATURE RATHER THAN DECORATION. The
// app HAS no power to remove another viewer's view of a row — `update` and
// `withdraw` are author-scoped and `report()` does not hide (spec §2.3) — so an
// "Archive" a viewer could reasonably read as "removed" is a claim the code
// cannot back. `taste.json`'s `suppressionNamedAsSuppression` rubric item is the
// standing rule; {@link ARCHIVE_NOTE} is this feature's discharge of it, and it
// is rendered next to the control rather than hidden behind a tooltip.
//
// The one true delete remains the author-only Remove (`shared.withdraw`), which
// is unchanged and coexists with this.

/** The single per-viewer KV key holding the archived shared keys (§11.3). */
export const ARCHIVE_KEY = 'archive:v1';

/**
 * 🔴 THE HONEST WORDING, in one place so the two surfaces cannot drift apart and
 * so a test can pin the WHOLE string rather than a keyword (a keyword guard here
 * is walkable by a reword that quietly re-asserts removal).
 */
export const ARCHIVE_NOTE =
  'Archiving only hides a row from your My list. It stays on the shared board, ' +
  'stays in Community for everyone including you, and keeps its votes. ' +
  'Remove is the only action that takes it off the board for everyone.';

/**
 * Defensive parse of the stored value into the archived key list. The store is
 * per-viewer and app-owned, but a value can still be from an older/newer build,
 * so anything unusable degrades to "nothing archived" — which shows MORE rows,
 * never fewer. Failing the other way would hide a viewer's own rows because of a
 * malformed blob.
 */
export function parseArchive(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== 'string' || !v) continue;
    if (!out.includes(v)) out.push(v);
  }
  return out;
}

/** The archived list with `key` added (idempotent, order-preserving). */
export function withArchived(archived: string[], key: string): string[] {
  return archived.includes(key) ? [...archived] : [...archived, key];
}

/** The archived list with `key` removed (idempotent). */
export function withoutArchived(archived: string[], key: string): string[] {
  return archived.filter((k) => k !== key);
}
