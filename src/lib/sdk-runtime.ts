// The eight runtime bindings this app used to take from `@civitai/blocks-react`,
// re-expressed on `@civitai/sdk`'s `initialize({ transport })`.
//
// WHY A MODULE AND NOT EIGHT INLINE REWRITES: the SDK is not hook-shaped. It is
// one async `initialize()` returning clients, so every consumer would otherwise
// have to solve the same three problems — when the client exists, how a snapshot
// field reaches React without re-rendering forever, and which operations are
// still messages rather than HTTP. Those answers belong in one place.
//
// THE SPLIT, WHICH IS THE WHOLE DESIGN. Three groups, and they differ in kind:
//
//   1. SNAPSHOT (ready/viewer/theme/token) — available SYNCHRONOUSLY from the
//      transport, before `initialize()` resolves, because the bridge transport
//      already holds `BLOCK_INIT`. These must not wait on anything: the app
//      paints its boot skeleton off `ready`/`theme` (`src/bootTheme.ts`).
//   2. HOST-MEDIATED (resize, sign-in, consent) — still postMessage, and
//      `createHost(transport)` is synchronous, so these need no await either.
//   3. REST (app storage, shared storage, Buzz balance) — these moved off the
//      bridge onto `/api/v1`, and they are the only group that must wait for
//      `initialize({ transport })` to resolve, because only the AppClient carries
//      the http clients bound to the token session.
//
// 🔴 WHAT IS DELIBERATELY *NOT* HERE. The generation money path
// (`useBuzzWorkflow`, `WorkflowEstimateError`), the resource picker
// (`useResourcePicker`), the generation-resource rehydrate
// (`useGenerationResources`), output publishing (`usePublishGenerationOutputs`),
// gated images (`useGatedImages`) and analytics (`useBlockAnalytics`) STAY on
// `@civitai/blocks-react`.
//
// ═══════════════════════════════════════════════════════════════════════════
// 🔴 THREE TRAPS THE NEXT PORT WALKS INTO, EACH VERIFIED AGAINST PLATFORM
// SOURCE HERE RATHER THAN TAKEN FROM THE MIGRATION GUIDE. All three were
// measured on civitai `origin/main` @ `329c89a23e`; none of them is reachable
// from THIS file today, which is exactly why they are recorded here — the next
// person to move one of the six bindings above is the one who needs them, and
// they will read the guide first.
//
// (1) GATED IMAGES: `@civitai/sdk@0.8.0`'s `BREAKING.md` NAMED THE WRONG ROUTE,
//     (version deliberately pinned in the past tense — it dates the DOCUMENT this
//     retraction is about; the installed SDK is 0.10.0 and its docs were not re-read)
//     AND THE WRONG ONE FAILS SILENTLY. It maps (`BREAKING.md:20`, and again at
//     `:242`) `GET_IMAGES_BY_IDS` → `GET /api/v1/blocks/images?ids=`. The
//     correct route is `GET /api/v1/blocks/gated-images?ids=`, whose own
//     docblock calls itself "the REST twin of the `GET_IMAGES_BY_IDS` →
//     `IMAGES_RESULT` bridge message, for apps porting off the postMessage
//     bridge onto `@civitai/sdk`".
//     🔴 THE TWO CORPORA ARE DISJOINT, by complementary SQL predicates — read
//     both, not the prose: `blocks/images` serves `runImageSearch` over the
//     Meilisearch images index, whose source query hard-filters
//     `i."postId" IS NOT NULL` (`images.search-index.ts:134`, and `:282` for the
//     incremental pass); `gated-images` is the exact complement,
//     `AND i."postId" IS NULL` (`block-gated-images.service.ts:184`), further
//     scoped to `blockPublishedAppId = claims.appId`. An image cannot satisfy
//     both. So `blocks/images?ids=` returns an EMPTY ARRAY for every id THIS APP
//     PUBLISHED — at any ceiling, for any viewer, forever — and because that
//     route reports misses BY OMISSION (deliberate non-disclosure), it is a 200
//     with `[]` and never an error. A test whose fake returns rows passes; the
//     grid renders nothing in production.
//     ⚠ Both routes clamp ids to `IMAGE_IDS_BATCH_MAX = 100`
//     (`server/common/constants.ts:83`), enforced in each route's zod schema.
//     This app is well inside it and needs no clamp of its own: the preview
//     strip slices to `GRID_PREVIEW_MAX = 6` (`lib/gridEntries.ts`), and a
//     cell's read is one shared `result` row's ids, i.e. one workflow's outputs.
//     That second path is unbounded in TYPE — a 100+-output workflow would 400 —
//     but the bridge message enforces the same ceiling today, so it is a
//     pre-existing property and NOT something to "fix" while porting.
//
// (2) THE MONEY PATH IS `POST /api/v1/blocks/workflows/*`, NOT
//     `app.orchestration`. `BREAKING.md` calls the substitution "the sharpest
//     trap in the migration, because the wrong version compiles": it drops
//     civitai's per-call `buzzBudget`, the per-viewer and per-app daily caps,
//     the viewer's browsing-level clamp, and per-app attribution. The SDK ships
//     no client for the right routes, so an app-layer wrapper is the work. Three
//     shape facts, read off the route files:
//       • `estimate`, `submit`, `poll` and `cancel` all reply `{ snapshot }`
//         WRAPPED — a `BlockWorkflowSnapshot` under that key. `query` does not:
//         it replies `{ workflows, cursor }`.
//       • 🔴 `submit` REQUIRES `idempotencyKey` — body `{ body, idempotencyKey }`,
//         `z.string().regex(BLOCK_IDEMPOTENCY_KEY_REGEX)` with no `.optional()`,
//         and the route's docblock says "REQUIRED — no `?`". The bridge hook
//         minted it; an app-layer wrapper must mint its own, and the cost of
//         getting it wrong is a DOUBLE CHARGE, which is the one failure
//         `src/money-path.test.tsx` exists to prevent.
//
// (3) PUBLISH CANNOT BE A PASS-THROUGH ACROSS THIS ADAPTER. The host answers
//     `PUBLISH_RESULT` with the ids NESTED — the bridge hook reads
//     `reply.result.imageIds` (`usePublishGenerationOutputs.js:49`) — while the
//     SDK's `app.host.publishGenerationOutputs` destructures `{ imageIds }` at
//     the TOP level (`dist/host/index.js:49`). Over a pass-through adapter that
//     reads `undefined`, and the SDK then throws `BridgeError('malformed', …)`
//     for a publish that SUCCEEDED, after the viewer paid.
//     ✅ Not reachable from here, and it fails LOUD rather than silently:
//     `sdk-transport.ts`'s `RESPONSE_TYPE` maps only `REQUEST_TOKEN` and THROWS
//     for anything else, so `PUBLISH_GENERATION_OUTPUTS` cannot cross this
//     adapter at all until someone adds the mapping — at which point they must
//     un-nest, not map and move on. That refusal is the guard working.
// ═══════════════════════════════════════════════════════════════════════════
//
// So the load-bearing reason the six stay is (1)–(3): each is a separate change
// with its own blast radius, and `CLAUDE.md` names `src/money-path.test.tsx` as
// this repo's spec rather than a smoke test.
//
// 🔴 ONE TRANSPORT, AND IT IS THE BRIDGE'S. `src/lib/sdk-transport.ts` explains
// why (`/ui`'s `BlockGate` wraps the production root and keeps constructing the
// bridge singleton, so a bare `initialize()` would stand up a second one). The
// consequence that matters HERE: the `@civitai/blocks-react/testing` Harness
// drives that same singleton, so every existing Harness-mounted test keeps
// answering group 1 and group 2 unchanged. Only group 3 leaves the Harness's
// reach — it answers HTTP now — which is why `configureSdkRuntime({ fetch })`
// and `src/dev-rest.ts` exist rather than a mock-host seam.

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { RefObject } from 'react';

import { getTransport } from '@civitai/blocks-react';
import type { SharedStorageValue } from '@civitai/app-sdk/blocks';
import { createHost, initialize } from '@civitai/sdk';
import type {
  AppClient,
  BlockSnapshot,
  BlockToken,
  BlockTransport,
  Host,
  Scope,
  SharedItem,
  StorageClient,
  Theme,
  ViewerInfo,
} from '@civitai/sdk';

import { createSdkTransportAdapter } from './sdk-transport.js';

/** What the viewer's per-pool balance looks like — the shape `blocks/buzz` returns. */
export interface BuzzPools {
  blue: number;
  green: number;
  yellow: number;
}

export interface SdkRuntimeOptions {
  /**
   * The transport the SDK reads. Defaults to the bridge singleton adapted by
   * `createSdkTransportAdapter()`; a test passes a fake so no iframe is needed.
   */
  transport?: BlockTransport;
  /**
   * Injected into `initialize`, so group 3 (the REST clients) can be answered at
   * the `fetch` boundary. 🔴 THIS IS THE SEAM THE PORT CREATES. Before the port a
   * test seeded shared storage and the Buzz balance through the mock HOST
   * (`<Harness shared={…} buzzBalance={…}>`); after it, those calls are HTTP and
   * the host never sees them, so a test that kept seeding the host would pass
   * while exercising nothing. `src/test-harness.tsx` routes those two props to
   * `createRestFake` instead, which is why the 20 Harness-mounted test files
   * needed an import change and not a rewrite.
   */
  fetch?: typeof globalThis.fetch;
  /**
   * Override the site base URL — dev harness only.
   *
   * ⚠ THE DEFAULT IS ABSOLUTE, AND THIS LINE USED TO SAY IT WAS RELATIVE. Omitted,
   * `@civitai/sdk` uses `DEFAULT_SITE_URL = 'https://civitai.com/api/v1'`; it is NOT
   * `/api/v1`, and passing that relative string throws `Invalid URL` from the
   * client's own `new URL(...)` rather than resolving against the page.
   *
   * 🔴 SO THE THREE REST FAMILIES ARE PINNED TO PRODUCTION `civitai.com`, WHERE THE
   * BRIDGE SPOKE TO WHICHEVER ORIGIN EMBEDDED IT. Confirmed shipped: `civitai.com/api/v1`
   * is a literal in `dist/assets/*.js`. On a non-production civitai host, generation
   * keeps working over the bridge while these three 401 or fail CORS against
   * production — a split-brain a bridge-only block could not produce. The adapter
   * already composes the allowlist-VALIDATED `hostOrigin` into the snapshot
   * (`sdk-transport.ts`), so deriving `siteUrl` from it is the obvious fix and is
   * deliberately NOT taken here: `hostOrigin` is the parent PAGE's origin, which is
   * not guaranteed to be the API's, and this port has exercised no non-production
   * host to check. Filed rather than guessed.
   */
  siteUrl?: string;
}

let options: SdkRuntimeOptions = {};
let transportSingleton: BlockTransport | null = null;
let bridgeWrapped: unknown = null;
let appPromise: Promise<AppClient> | null = null;

/**
 * Set the runtime's options — the transport, the `fetch` the REST clients use,
 * and the site base URL. `src/main.tsx` calls it for the dev harness;
 * production needs no call at all, because every default is already right there.
 *
 * 🔴 IT DISCARDS ANY AppClient BUILT UNDER THE PREVIOUS OPTIONS, and that is the
 * whole contract: the hazard is a STALE CLIENT still holding the previous
 * `fetch`, and dropping the client removes it where refusing would merely report
 * it — and would refuse a legitimate case this repo's suite contains (a test
 * that renders the app twice, with different fixtures, inside one case).
 *
 * It is NOT a full reset: `resetSdkRuntime` is what tests use between cases,
 * because that also clears options back to the defaults.
 */
export function configureSdkRuntime(next: SdkRuntimeOptions): void {
  options = next;
  transportSingleton = next.transport ?? null;
  bridgeWrapped = null;
  appPromise = null;
}

/**
 * Drop all runtime state. A test seam, and the counterpart every singleton needs:
 * without it the first test's transport and fetch leak into every later test in
 * the same file. `src/test-setup.ts` calls it in the global `beforeEach`, beside
 * the bridge transport's own reset.
 */
export function resetSdkRuntime(): void {
  options = {};
  transportSingleton = null;
  bridgeWrapped = null;
  appPromise = null;
}

/**
 * The one transport.
 *
 * 🔴 THE CACHE IS KEYED ON THE BRIDGE TRANSPORT'S IDENTITY, AND THAT IS NOT
 * DEFENSIVE POLISH — IT IS REQUIRED BY THIS REPO'S TEST SETUP. The bridge's
 * transport is a process-wide singleton that `resetTransport()` NULLS, so the
 * next `getTransport()` returns a brand-new object; `src/test-setup.ts` calls
 * `resetHarnessTransport()` in a global `beforeEach`, i.e. before EVERY dom test.
 * A plain `??=` would therefore wrap the first test's transport and keep wrapping
 * it after it had been disposed — every later test reading a dead snapshot. The
 * AppClient is bound to the transport too (its session and host both close over
 * it), so a swap must drop that as well.
 *
 * An explicitly configured transport is never re-derived: a test that passed one
 * owns it, and silently replacing it with the singleton would be worse than any
 * staleness this guards against.
 */
function transport(): BlockTransport {
  if (options.transport) return options.transport;
  const bridge = getTransport();
  if (transportSingleton === null || bridge !== bridgeWrapped) {
    bridgeWrapped = bridge;
    transportSingleton = createSdkTransportAdapter(bridge) as BlockTransport;
    appPromise = null;
  }
  return transportSingleton;
}

/**
 * How long a REST call may hang before it is abandoned.
 *
 * 🔴 THE PORT LOST THE BRIDGE'S DEADLINES AND THIS PUTS ONE BACK. Every bridge
 * message carried a client timeout — `DEFAULT_REQUEST_TIMEOUT_MS = 30_000` in
 * `@civitai/blocks-react/dist/internal/requestTimeouts.js`, applied by the iframe
 * transport to every `sendRequest`. `@civitai/sdk` dropped them deliberately
 * ("Request deadlines: per-message client timeouts → none; pass an
 * `AbortSignal`"), and `fetch` has no default, so a façade passing no signal hangs
 * forever on a stalled connection.
 *
 * That is not merely slow — it is money-adjacent. `confirmRun` adds the cell to
 * `inFlightRef` BEFORE awaiting the claim write, and the matching `delete`s all sit
 * AFTER the await with no `finally`; a never-settling `appStorage.set` therefore
 * leaves the cell permanently un-runnable AND un-resumable for the life of the
 * page, with no `CLAIM_FAILED_MESSAGE` shown. With a deadline it rejects, the claim
 * is released and the viewer sees the refusal and can retry — which is what the
 * bridge did.
 *
 * 30s to match the bridge's default exactly: this restores a bound the port
 * removed, and a different number would be an unrelated behaviour change smuggled
 * in beside it.
 */
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * The caller's own options if they carry a signal, else a default deadline.
 *
 * 🔴 IT MUST NOT CLOBBER A CALLER'S SIGNAL. Every façade method forwards the `opts`
 * its `StorageClient`/`SharedStorageClient` signature accepts, so a caller passing
 * its own cancellation owns the deadline; this only fills the gap where none was
 * given. Overwriting would silently discard a caller's abort — the same defect
 * `sdk-transport.ts` refuses to introduce by casting.
 */
function withDeadline<T extends { signal?: AbortSignal }>(
  opts: T | undefined,
): T | (T & { signal: AbortSignal }) | { signal: AbortSignal } {
  if (opts?.signal) return opts;
  return { ...(opts ?? ({} as T)), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) };
}

/**
 * The one AppClient promise, created on first use.
 *
 * 🔴 A REJECTED `initialize()` MUST NOT BE CACHED, and caching it was a real
 * availability bug this port introduced. `initialize()` awaits the host's
 * `BLOCK_INIT` and REJECTS after its own 10s deadline. `<BlockGate>` renders
 * children immediately — `useDirectLoad` starts false, it is not a ready gate — so
 * `<App>` mounts on frame 1 and `useBuzzBalance`'s mount effect calls `app()`
 * before a slow host has answered. With a plain `??=` that rejection became the
 * permanent value of `appPromise`: every later `useSharedStorage.list`,
 * `useAppStorage.get/set` and even `refetch()` reused it, so the board never loaded
 * and the balance's Retry button could not work — for the life of the page,
 * recoverable only by a full reload.
 *
 * MEASURED before the fix, with a `ready: false` transport advanced past 10s and
 * then flipped ready: `refetch()` left `balance = null` and the original
 * "No Civitai host responded within 10000ms" error in place. The bridge had no such
 * state — each message was independent and simply started working once the host
 * answered — so this restores the bridge's behaviour rather than inventing one.
 *
 * ⚠ THE RETRY IS UNBOUNDED, DELIBERATELY. A caller that keeps calling while the
 * host stays silent keeps re-initialising — but each attempt costs the SDK's own
 * 10s wait, so it is rate-limited by construction, and this is what the bridge did
 * per message. A backoff here would be new policy, not restored policy.
 *
 * 🔴 `transport()` IS CALLED UNCONDITIONALLY, NOT INSIDE THE `??=`. That is the
 * other half of the bridge-identity guard documented on `transport()`, and `??=`
 * short-circuited it: with `appPromise` already set the right-hand side was never
 * evaluated, so a swapped bridge transport went unnoticed on any path reaching
 * `app()` without a snapshot-reading render first, and the client kept serving from
 * the DISPOSED transport. The guard's docblock claimed it covered this; now it does.
 */
function app(): Promise<AppClient> {
  // Evaluated on EVERY call: this is what runs the bridge-identity check, and it
  // may null `appPromise` before the check below reads it.
  const t = transport();
  if (appPromise === null) {
    const pending: Promise<AppClient> = initialize({
      transport: t,
      fetch: options.fetch,
      ...(options.siteUrl === undefined ? {} : { siteUrl: options.siteUrl }),
    }).catch((cause: unknown) => {
      // Only clear OUR entry: a `configureSdkRuntime` or a bridge swap during the
      // await has already installed a newer promise, and dropping that one would
      // discard a client someone else is waiting on.
      if (appPromise === pending) appPromise = null;
      throw cause;
    });
    appPromise = pending;
  }
  return appPromise;
}

/** The host client. Synchronous — `createHost` needs only the transport. */
function host(): Host {
  return createHost(transport());
}

// ---------------------------------------------------------------------------
// Group 1 — the snapshot
// ---------------------------------------------------------------------------

/**
 * Read one field out of the live snapshot.
 *
 * 🔴 `select` MUST RETURN A FIELD, NEVER A FRESH OBJECT. `useSyncExternalStore`
 * bails out on `Object.is`, so a selector composing `{ a, b }` returns a new
 * identity every call, never compares equal, and re-renders forever. The
 * transport adapter memoises the snapshot itself for exactly this reason; a
 * composing selector here would throw that away one layer up. Compose with
 * `useMemo` on the fields instead, as `useBlockContext` does below.
 */
export function useBlockSnapshot<T>(select: (snapshot: BlockSnapshot) => T): T {
  const t = transport();
  const subscribe = useCallback((onChange: () => void) => t.snapshot.subscribe(onChange), [t]);
  const get = useCallback(() => select(t.snapshot.get()), [t, select]);
  return useSyncExternalStore(subscribe, get, get);
}

const selectReady = (s: BlockSnapshot) => s.ready;
const selectViewer = (s: BlockSnapshot) => s.viewer;
const selectTheme = (s: BlockSnapshot) => s.theme;
const selectToken = (s: BlockSnapshot) => s.token;

export interface BlockContextValue {
  ready: boolean;
  viewer: ViewerInfo | null;
  theme: Theme;
}

/**
 * `{ ready, viewer, theme }` — the three fields `App.tsx` destructures off the
 * bridge hook of the same name.
 *
 * ⚠ DELIBERATELY NARROWER than the bridge's `useBlockContext`, which returned
 * TEN snapshot fields — `Pick<BlockSnapshot, 'ready'|'renderMode'|'context'|'token'
 * |'settings'|'viewer'|'theme'|'blockId'|'blockInstanceId'|'appId'>`, counted off
 * the declaration rather than recalled (an earlier draft of this line said nine).
 * So seven were dropped, and the substantive claim is unchanged: none of the seven
 * had a consumer in `src/`, and returning them would invite one without the port
 * having thought about it. `useBlockSnapshot` is exported for anything needing more.
 */
export function useBlockContext(): BlockContextValue {
  const ready = useBlockSnapshot(selectReady);
  const viewer = useBlockSnapshot(selectViewer);
  const theme = useBlockSnapshot(selectTheme);
  return useMemo(() => ({ ready, viewer, theme }), [ready, viewer, theme]);
}

/**
 * The block JWT, straight off the snapshot.
 *
 * ⚠ NO `refresh()`, and that is a removal rather than an omission: the bridge
 * hook returned `BlockToken & { refresh }` and nothing in this app ever called
 * `refresh` (measured — the only token field any non-test module reads is
 * `token.scopes`, at `App.tsx`'s `hasGenerateScope` call sites). The SDK's HTTP
 * clients re-mint the token themselves on a 401 via the `REQUEST_TOKEN` mapping
 * in `sdk-transport.ts`, so the one caller that would have needed it is the one
 * that no longer exists.
 *
 * ⚠ ONE DELIBERATE IMPROVEMENT ON THE BRIDGE HOOK, and `App.tsx`'s comment about
 * it is now stale rather than wrong: the bridge returned `{...token, refresh}`, a
 * FRESH object every render. This returns the snapshot's own token object, whose
 * identity is stable between mints (the adapter memoises the snapshot), so a
 * consumer may depend on it directly.
 */
export function useBlockToken(): BlockToken {
  return useBlockSnapshot(selectToken);
}

// ---------------------------------------------------------------------------
// Group 2 — host-mediated, still postMessage
// ---------------------------------------------------------------------------

/**
 * Keep the host iframe sized to `ref`'s content.
 *
 * `host.autoResize(element)` owns the observer and the initial report, and
 * returns its own teardown — so this hook is a lifecycle wrapper and nothing
 * more. It waits for the element: `ref.current` is null on the first effect run
 * for a ref attached below it in the tree.
 */
export function useBlockResize(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    return host().autoResize(element);
  }, [ref]);
}

/** `{ requestSignIn }` — asks the host to open its sign-in flow. */
export function useRequestSignIn(): { requestSignIn: () => void } {
  const requestSignIn = useCallback(() => host().requestSignIn(), []);
  return useMemo(() => ({ requestSignIn }), [requestSignIn]);
}

/**
 * How long a pending consent request is held open before its listeners are
 * released. The viewer is not on a clock — the host's dialog is theirs to leave
 * open — so this is deliberately generous; it exists only so a declined request
 * cannot retain a snapshot subscription for the life of the page.
 */
const CONSENT_WAIT_MS = 5 * 60_000;

/**
 * `{ requestConsent }` — fire-and-forget, exactly as the bridge hook was.
 *
 * 🔴 THE SDK's `requestGrants` IS AWAITABLE AND THE BRIDGE's WAS NOT, AND THAT
 * DIFFERENCE HAD TO BE HANDLED RATHER THAN CAST AWAY. `requestGrants` resolves
 * `true` when the re-minted token carries the scopes, `false` on
 * `CONSENT_UNAVAILABLE` — and against a viewer who simply closes the dialog it
 * resolves NEITHER, holding a snapshot subscription and a message listener per
 * press. This app's call site is `beginRun`'s press-time consent gate, which is
 * fire-and-forget by design (on grant the host re-mints and the snapshot flips
 * `hasGenerate`; declining changes nothing and must raise no error), so:
 *
 *   - the promise is not awaited, preserving the call site's semantics;
 *   - it is bounded by a signal, so an abandoned dialog releases its listeners;
 *   - the rejection that abort produces is swallowed HERE, because an unhandled
 *     rejection in a click handler is a console error a viewer can produce at
 *     will by closing a dialog.
 *
 * ⚠ `scopes` IS THE SDK's `Scope` UNION, NOT `string[]`, and that is a deliberate
 * tightening rather than an accident of the signature: a scope this platform does
 * not define is now a compile error at the call site instead of a runtime
 * `CONSENT_UNAVAILABLE` nobody traces back to a typo. `src/scopes.ts`'s
 * constants are `const` string literals and all six are in the SDK's `SCOPES`
 * list, so they satisfy it unchanged.
 */
export function useRequestConsent(): {
  requestConsent: (args: { scopes: readonly Scope[] }) => void;
} {
  const requestConsent = useCallback(({ scopes }: { scopes: readonly Scope[] }) => {
    void app()
      .then((client) =>
        client.requestGrants(scopes, { signal: AbortSignal.timeout(CONSENT_WAIT_MS) }),
      )
      .catch(() => {
        /* declined, abandoned, or aborted — all "nothing changed", never an error */
      });
  }, []);
  return useMemo(() => ({ requestConsent }), [requestConsent]);
}

// ---------------------------------------------------------------------------
// Group 3 — REST
// ---------------------------------------------------------------------------

/**
 * Per-(block instance, viewer) KV.
 *
 * Returns a STABLE façade whose methods await the AppClient internally, rather
 * than `StorageClient | null`. Two reasons, both load-bearing:
 *   - the object goes into `deps` and thence into `useEffect`/`useMemo`
 *     dependency arrays, and the bridge hook documented itself as stable;
 *   - a `null` would make every call site grow a branch for a state that lasts
 *     milliseconds and that the app already gates on `ready`.
 *
 * 🔴 ONE MIGRATION DELTA THE PORT INHERITS, and it is REAL — verified against the
 * platform, not taken from `BREAKING.md`. An ANONYMOUS viewer gets **403** on every
 * one of these five routes, where the bridge resolved an anonymous read to `null`.
 * The refusal is `enforceContextBinding`'s `case 'apps:storage:read': case
 * 'apps:storage:write':` — `if (claims.sub === ANON_SUBJECT) throw
 * forbidden(\`\${scope} requires authenticated subject\`)`
 * (`server/middleware/block-scope.middleware.ts`) — and `get.ts`'s own docblock
 * states the divergence in terms: "🔴 AN ANONYMOUS VIEWER GETS 403 HERE, NOT THE
 * BRIDGE'S CLEAN `{ value: null }`, AND THAT DIVERGENCE IS DELIBERATE."
 *
 * ⚠ DO NOT "CORRECT" THIS BY READING THE SERVICE — a round-1 audit did, and
 * concluded the opposite. `app-storage.service.ts` is ONE BODY FOR BOTH TRANSPORTS
 * and its anon arms are clean: `get` returns `{ value: null }`, `list` returns
 * `{ keys: [] }`, `quota` returns zeros, and only `set`/`delete` throw (as 401, not
 * 403). All true, and all UNREACHABLE on the REST transport, because
 * `withBlockScope` refuses the anon subject BEFORE the handler runs. The middleware
 * in front of the shared body is the whole delta; the service alone cannot show it.
 *
 * This app already gates every KV path on `viewer` (the per-viewer stores are
 * drafts, in-flight claims and the explainer flag, all signed-in-only), so no call
 * site reads an empty result as "nothing stored" — but a new one must not start,
 * and the hazard it must not walk into is the SILENT one: a 403 is loud, an empty
 * page that means "you are anonymous" is not.
 */
export function useAppStorage(): StorageClient {
  return useMemo<StorageClient>(
    () => ({
      get: async (key, opts) => (await app()).storage.get(key, withDeadline(opts)),
      set: async (key, value, opts) => (await app()).storage.set(key, value, withDeadline(opts)),
      delete: async (key, opts) => (await app()).storage.delete(key, withDeadline(opts)),
      list: async (query, opts) => (await app()).storage.list(query, withDeadline(opts)),
      getQuota: async (opts) => (await app()).storage.getQuota(withDeadline(opts)),
    }),
    [],
  );
}

/**
 * Where the three app-layer shared-storage routes live, relative to the site base
 * URL.
 *
 * 🔴 SPELLED OUT HERE BECAUSE THE SDK DELIBERATELY DOES NOT CARRY THEM.
 * `starters#479` decided `AppClient.sharedStorage` is GENERIC KEY-VALUE ONLY —
 * `list`/`get`/`append`/`update`/`withdraw`. `vote`, `unvote`, `counts`, `top`,
 * `increment` and `report` are app-layer by that decision, so the eleven routes
 * existing is not a gap the SDK is expected to close, and adding a method there
 * is explicitly refused by its own module note.
 *
 * Verified against the route files rather than guessed (civitai `origin/main` @
 * `329c89a23e`, `src/pages/api/v1/blocks/shared-storage/{vote,unvote,report}.ts`),
 * all three POST under scope `apps:storage:shared:write`:
 *
 *   - `vote`   body `{ key }`          → `{ count }` — the row's new aggregate
 *     tally. Its docblock records an "atomic insert-gated counter — a double vote
 *     is a no-op and the tally never inflates", which is what makes the app's
 *     optimistic vote safe to re-issue.
 *   - `unvote` body `{ key }`          → `{ count }`, on the SAME per-minute
 *     bucket as `vote` so a toggle-spam loop is one budget rather than two.
 *   - `report` body `{ key, reason? }` → `{ ok: true }`, identical whether the
 *     report was newly filed or deduped, and it does NOT hide the row.
 */
const SHARED_VOTE_ROUTE = 'blocks/shared-storage/vote';
const SHARED_UNVOTE_ROUTE = 'blocks/shared-storage/unvote';
const SHARED_REPORT_ROUTE = 'blocks/shared-storage/report';

/**
 * The seven shared-storage operations this app performs.
 *
 * Four come from `AppClient.sharedStorage`; `vote`, `unvote` and `report` are
 * app-layer over `app.site`, per {@link SHARED_VOTE_ROUTE}. `get`, `getCount`
 * and `getCounts` are absent because no call site in this app used them — the
 * board is always read as a full paged `list` (`App.tsx`'s `listAll`).
 */
export interface SharedStore {
  list(query?: { prefix?: string; limit?: number; cursor?: string }): Promise<{
    items: SharedItem[];
    nextCursor?: string;
  }>;
  append(value: SharedStorageValue): Promise<{ key: string }>;
  update(key: string, value: SharedStorageValue): Promise<void>;
  /**
   * Delete a row the viewer authored.
   *
   * 🔴 `ok` IS DECLARED `boolean`, THE TRANSPORT CAN ONLY PRODUCE `true`, AND
   * THE WIDENING IS THIS PORT'S OWN — not, as an earlier draft of this comment
   * claimed, a gap inherited unchanged from the bridge. That claim was FALSE and
   * is retracted: `@civitai/sdk`'s `SharedStorageClient.withdraw` is declared
   * `Promise<{ ok: true; deleted: boolean }>` — the LITERAL `true` — and
   * `dist/shared-storage/index.js` hardcodes `return { ok: true, … }`, throwing on
   * anything else. So `boolean` here is a widening introduced BY this façade, and
   * it is the only reason `App.tsx`'s `!res.ok` branch is type-reachable at all.
   *
   * ⚠ SO THE BRANCH IS AN INVARIANT GUARD, AND MUST BE LABELLED ONE. It guards
   * the step that clears the viewer's only per-viewer pointer at a host-minted
   * key — a loss that is unrecoverable, because the shared list has no "mine"
   * index — but over REST the thing it guards against cannot happen: every
   * failure REJECTS, so the `await` already skips every line below. The live
   * guard is the ORDER, exactly as `withdrawRow` says; this is belt.
   *
   * ⚠ WHY THE WIDENING WAS KEPT RATHER THAN NARROWED, stated so the next reader
   * can overturn it on better grounds than mine. Narrowing to `ok: true` is the
   * simpler code and has a real advantage: the day the SDK starts resolving a
   * refusal, the façade would stop compiling — a LOUD signal, where a widened
   * type absorbs the change in silence. It was not taken here because it deletes
   * a guard installed against unrecoverable data loss, on a path this port has
   * NOT exercised against the real platform, and because it also deletes
   * `test-helpers.tsx`'s `withdrawRefuses` fake and the `withdraw.test.tsx` case
   * that drives it. That is a deletion worth making deliberately, in its own
   * change, with a live read behind it — not as a side effect of a transport port.
   * Filed as a follow-up; do not describe the channel as observed either way.
   */
  withdraw(key: string): Promise<{ ok: boolean; deleted: boolean }>;
  vote(key: string): Promise<number>;
  unvote(key: string): Promise<number>;
  report(key: string, reason?: string): Promise<void>;
}

/**
 * Assert a vote/unvote reply's `count`.
 *
 * 🔴 ASSERTED, NOT COERCED. `Number(undefined)` is NaN and `?? 0` would report a
 * vote that did not land as a tally of zero — and this app writes that number
 * straight into the row's displayed count, which is what the Top Grid's
 * membership is ranked on. A malformed reply is a failure, not a count.
 */
function requireCount(reply: { count?: unknown } | null, op: string): number {
  if (typeof reply?.count !== 'number' || !Number.isFinite(reply.count)) {
    throw new Error(`shared-storage ${op}: reply carried no numeric \`count\``);
  }
  return reply.count;
}

/**
 * Cross-user shared storage. Stable identity, for the same reason as
 * {@link useAppStorage}.
 */
export function useSharedStorage(): SharedStore {
  return useMemo<SharedStore>(
    () => ({
      list: async (query) => (await app()).sharedStorage.list(query, withDeadline(undefined)),
      append: async (value) => (await app()).sharedStorage.append(value, withDeadline(undefined)),
      update: async (key, value) => {
        // The SDK resolves `{ ok: true }`; the bridge hook resolved `void` and
        // every call site discards it. Discarded here so the façade keeps the
        // narrower promise rather than exporting a value nobody reads.
        await (await app()).sharedStorage.update(key, value, withDeadline(undefined));
      },
      withdraw: async (key) => (await app()).sharedStorage.withdraw(key, withDeadline(undefined)),
      vote: async (key) => {
        const reply = await (await app()).site.post<{ count?: unknown }>(SHARED_VOTE_ROUTE, { key }, withDeadline(undefined));
        return requireCount(reply, 'vote');
      },
      unvote: async (key) => {
        const reply = await (await app()).site.post<{ count?: unknown }>(
          SHARED_UNVOTE_ROUTE,
          { key },
          withDeadline(undefined),
        );
        return requireCount(reply, 'unvote');
      },
      report: async (key, reason) => {
        await (await app()).site.post(
          SHARED_REPORT_ROUTE,
          // 🔴 `reason` OMITTED WHEN ABSENT, never sent as `undefined` or `''`:
          // the route's zod schema is `z.string().max(N).optional()`, so an
          // empty string is a 400 where an absent key takes the router's
          // `'user-report'` default. This app never passes one today.
          reason === undefined ? { key } : { key, reason },
          withDeadline(undefined),
        );
      },
    }),
    [],
  );
}

export interface BuzzBalanceValue {
  balance: BuzzPools | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Where the viewer's per-pool balance comes from.
 *
 * 🔴 `GET /api/v1/blocks/buzz`, and this route's existence is what lets the port
 * move the balance at all. It was deleted once and RESTORED by `civitai#5051`
 * specifically on the bridge's three-account shape: its docblock states it
 * returns the SAME projection as the `blocks.getMyBuzzBalance` tRPC mutation the
 * bridge's `useBuzzBalance()` read, "field for field, so a consumer can switch
 * transports without a shape change". A bare `{ blue, green, yellow }`, no
 * envelope, scope `buzz:read:self`, anonymous rejected.
 *
 * ⚠ ONE KNOWN DIVERGENCE, from that same docblock rather than from measurement
 * here: the tRPC procedure also evaluates the `app-blocks-enabled` kill-switch
 * and charges the per-instance catalog rate-limit bucket; this route does
 * neither. Recorded because it is a behaviour difference the port inherits, not
 * one it introduces.
 */
const BUZZ_ROUTE = 'blocks/buzz';

/**
 * The viewer's per-pool Buzz balance. Fetches ONCE on mount and exposes
 * `refetch` for after a spend — the budget `src/buzzBalance.test.tsx` pins.
 *
 * 🔴 LATE REPLIES ARE DROPPED ON UNMOUNT, which the bridge hook also did. Under
 * React 18+ a `setState` after unmount is a silent no-op rather than a warning,
 * so this guard is invisible to a mutation that deletes it — it is here for the
 * abandoned-fetch case (a `refetch` in flight when the view closes), not for a
 * console warning that no longer exists.
 */
export function useBuzzBalance(): BuzzBalanceValue {
  const [balance, setBalance] = useState<BuzzPools | null>(null);
  // 🔴 `true`, MATCHING THE BRIDGE HOOK, which also started `true`. It started
  // `false` here and the flip moved into the post-paint effect below, which painted
  // one frame of "could not be read" before "Checking…" on a Retry press — because
  // `ResultsGrid` derives `balanceReadFailed = gate === 'balance-unknown' &&
  // !buzzBalanceLoading`. Not reachable at mount (the confirm gate is not open
  // then), so this is a flicker rather than a wrong verdict; restored anyway,
  // because "the port changed it" is not a reason and matching the bridge is.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [nonce, setNonce] = useState(0);
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const pools = await (await app()).site.get<BuzzPools>(BUZZ_ROUTE, withDeadline(undefined));
        if (!current || !live.current) return;
        setBalance(pools);
      } catch (cause) {
        if (!current || !live.current) return;
        setError(cause instanceof Error ? cause : new Error(String(cause)));
      } finally {
        if (current && live.current) setLoading(false);
      }
    })();
    return () => {
      current = false;
    };
  }, [nonce]);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);
  return useMemo(() => ({ balance, loading, error, refetch }), [balance, loading, error, refetch]);
}
