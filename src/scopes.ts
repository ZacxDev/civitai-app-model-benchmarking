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
//  - `apps:storage:read`            → useAppStorage().get (read this viewer's
//                                     durable voted-set so their up-votes survive
//                                     a reload — the shared list carries the
//                                     aggregate `count` but NO per-viewer voted
//                                     flag, so the highlight is app-owned state).
//  - `apps:storage:write`           → useAppStorage().set (persist the voted-set).
//
// The per-user KV scopes (`apps:storage:read`/`write`) have NO OAuth bit and are
// NOT consent-gated (the server gates them by presence in the approved scope set;
// see the SDK `BLOCK_SCOPES` catalog) — the block token carries them on install,
// so `useAppStorage` works without a consent round-trip. They are a private,
// per-(viewer, block) KV store that never touches the viewer's civitai resources.
//
// `ai:write:budgeted` (above) is the ONLY consent-gated scope: the host mints the
// first token WITHOUT it and only adds it after the viewer grants consent
// (REQUEST_CONSENT → TOKEN_REFRESH). So the runner checks the live token scopes
// before generating and, if absent, requests consent first.
export const AI_WRITE_BUDGETED = 'ai:write:budgeted';
export const BUZZ_READ_SELF = 'buzz:read:self';
export const APPS_STORAGE_READ = 'apps:storage:read';
export const APPS_STORAGE_WRITE = 'apps:storage:write';
export const APPS_STORAGE_SHARED_READ = 'apps:storage:shared:read';
export const APPS_STORAGE_SHARED_WRITE = 'apps:storage:shared:write';

/** All scopes the manifest declares — kept in lockstep with block.manifest.json. */
export const DECLARED_SCOPES = [
  AI_WRITE_BUDGETED,
  BUZZ_READ_SELF,
  APPS_STORAGE_READ,
  APPS_STORAGE_WRITE,
  APPS_STORAGE_SHARED_READ,
  APPS_STORAGE_SHARED_WRITE,
] as const;

/** Does the current token carry the (consent-gated) generation scope? */
export function hasGenerateScope(tokenScopes: readonly string[] | undefined): boolean {
  return (tokenScopes ?? []).includes(AI_WRITE_BUDGETED);
}
