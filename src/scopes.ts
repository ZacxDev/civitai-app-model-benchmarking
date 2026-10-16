// Block-scope constants used by the app. All are declared in the manifest.
//
// Scope set (derived from what the code actually calls):
//  - `ai:write:budgeted`    → the generation money path (estimate/submit/poll) AND
//                             publishing a generation's own scanned outputs.
//                             CONSENT-GATED: the host mints the first token without it.
//  - `buzz:read:self`       → the viewer's balance (show the wallet / gate Confirm).
//  - `apps:storage`         → the App Blocks DOCUMENT STORE: every read of both
//                             collections, the viewer's private `kv` documents
//                             (drafts, in-flight claims, archive, the explainer flag),
//                             the `vote` mark, the built-in `report` mark, and deleting
//                             the viewer's OWN shared documents. Not consent-gated.
//  - `apps:storage:publish` → creating or editing a document in the SHARED `records`
//                             collection (a matchup, prompt, grid or result row other
//                             viewers read). SENSITIVE and CONSENT-GATED: the server
//                             refuses a create/put without it as `consent_required`.
//
// 🔴 THE LEGACY STORAGE SCOPES ARE GONE (`apps:storage:read`/`write`,
// `apps:storage:shared:read`/`write`) together with the legacy routes they gated. The
// platform refuses a manifest that requests `apps:storage` with nothing declared under
// `storage.collections`, and `apps:storage:publish` without a viewer-written shared
// collection (`block-storage.constants.ts`'s `appStorageScopeErrors`), so the scope
// list and the `storage` block move together.
export const AI_WRITE_BUDGETED = 'ai:write:budgeted';
export const BUZZ_READ_SELF = 'buzz:read:self';
export const APPS_STORAGE = 'apps:storage';
export const APPS_STORAGE_PUBLISH = 'apps:storage:publish';

/** All scopes the manifest declares — kept in lockstep with block.manifest.json. */
export const DECLARED_SCOPES = [AI_WRITE_BUDGETED, BUZZ_READ_SELF, APPS_STORAGE, APPS_STORAGE_PUBLISH] as const;

/**
 * The scopes a cell RUN needs on the live token before anything is priced.
 *
 * 🔴 `apps:storage:publish` IS HERE BECAUSE THE LAST STEP OF A PAID RUN IS A SHARED
 * WRITE. `driveToResult` appends the result row only AFTER the viewer has paid and the
 * outputs are published; without the publish grant that create is refused
 * `consent_required`, so the generation is charged and its cell never fills on the
 * board. Asking for both grants at press time, before the estimate, keeps every
 * consent question in front of the money rather than behind it.
 */
export const RUN_SCOPES = [AI_WRITE_BUDGETED, APPS_STORAGE_PUBLISH] as const;

/** Does the current token carry every scope a run needs? See {@link RUN_SCOPES}. */
export function hasGenerateScope(tokenScopes: readonly string[] | undefined): boolean {
  const held = tokenScopes ?? [];
  return RUN_SCOPES.every((s) => held.includes(s));
}

/** The {@link RUN_SCOPES} the token is still missing — what a run asks consent for. */
export function missingRunScopes(tokenScopes: readonly string[] | undefined): Array<(typeof RUN_SCOPES)[number]> {
  const held = tokenScopes ?? [];
  return RUN_SCOPES.filter((s) => !held.includes(s));
}
