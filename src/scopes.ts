// Block-scope constants used by the app. All are declared in the manifest.
//
// `ai:write:budgeted` is CONSENT-GATED: the host mints the first token WITHOUT
// it and only adds it after the viewer grants consent (REQUEST_CONSENT →
// TOKEN_REFRESH). So the runner must check the live token scopes before
// generating and, if absent, request consent first.
//
// Scope set (derived from the hooks actually wired in this Phase-1 block):
//  - `ai:write:budgeted`            → useBuzzWorkflow estimate/submit/poll AND
//                                     usePublishGenerationOutputs (publishing a
//                                     gen's OWN scanned outputs is part of the
//                                     generation lifecycle the budget authorizes).
//  - `buzz:read:self`               → useBuzzBalance (show the wallet / gate cost).
//  - `apps:storage:shared:read`     → useSharedStorage().list/getCount(s) (browse
//                                     combos/prompts/results, derive included set).
//  - `apps:storage:shared:write`    → useSharedStorage().append/vote/unvote/
//                                     withdraw (submit + vote + write result rows).
//
// NOT declared: `apps:storage:read`/`write` (per-user KV) — Phase 1 keeps NO
// private per-viewer state; every contribution goes straight to shared storage.
//
// 🔴 OPEN CONTRACT ITEM (pending @civitai/blocks-react@^0.30 publish): whether
// `useGatedImages()` (the per-viewer gated grid read) requires an additional
// `images:read`-style scope could not be confirmed against the installed SDK
// (0.30 not yet on npm at build time). If the host rejects the gated read under
// the current scope set, add the scope the 0.30 dist documents here + in the
// manifest. Under-declaring fails CLOSED (a rejected read), never an over-grant.
export const AI_WRITE_BUDGETED = 'ai:write:budgeted';
export const BUZZ_READ_SELF = 'buzz:read:self';
export const APPS_STORAGE_SHARED_READ = 'apps:storage:shared:read';
export const APPS_STORAGE_SHARED_WRITE = 'apps:storage:shared:write';

/** All scopes the manifest declares — kept in lockstep with block.manifest.json. */
export const DECLARED_SCOPES = [
  AI_WRITE_BUDGETED,
  BUZZ_READ_SELF,
  APPS_STORAGE_SHARED_READ,
  APPS_STORAGE_SHARED_WRITE,
] as const;

/** Does the current token carry the (consent-gated) generation scope? */
export function hasGenerateScope(tokenScopes: readonly string[] | undefined): boolean {
  return (tokenScopes ?? []).includes(AI_WRITE_BUDGETED);
}
