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
// `@civitai/blocks-react`. Each has its own reason, and `docs/sdk-port.md`
// records them with the evidence; the load-bearing one is the money path, where
// `@civitai/sdk@0.8.0`'s `BREAKING.md` says in terms that `app.orchestration` is
// the WRONG replacement (it drops civitai's spend caps, maturity clamp and
// attribution) and that the right one is `POST /api/v1/blocks/workflows/*`,
// which the SDK ships no client for. That is a separate change with its own
// blast radius, and `CLAUDE.md` names `src/money-path.test.tsx` as this repo's
// spec rather than a smoke test.
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
  /** Override the site base URL (`/api/v1` by default) — dev harness only. */
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

/** The one AppClient promise, created on first use. */
function app(): Promise<AppClient> {
  appPromise ??= initialize({
    transport: transport(),
    fetch: options.fetch,
    ...(options.siteUrl === undefined ? {} : { siteUrl: options.siteUrl }),
  });
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
 * nine snapshot fields. The other six had no consumer here (measured across
 * `src/`), and returning them would invite one without the port having thought
 * about it. `useBlockSnapshot` is exported for anything that needs more.
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
 * ⚠ ONE MIGRATION DELTA THE PORT INHERITS, from `@civitai/sdk`'s `BREAKING.md`
 * § App storage rather than from measurement here: an ANONYMOUS viewer gets
 * **403** where the bridge resolved an anonymous read to `null`. This app
 * already gates every KV path on `viewer` (the per-viewer stores are drafts,
 * in-flight claims and the explainer flag, all signed-in-only), so no call site
 * reads an empty result as "nothing stored" — but a new one must not start.
 */
export function useAppStorage(): StorageClient {
  return useMemo<StorageClient>(
    () => ({
      get: async (key, opts) => (await app()).storage.get(key, opts),
      set: async (key, value, opts) => (await app()).storage.set(key, value, opts),
      delete: async (key, opts) => (await app()).storage.delete(key, opts),
      list: async (query, opts) => (await app()).storage.list(query, opts),
      getQuota: async (opts) => (await app()).storage.getQuota(opts),
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
   * 🔴 `ok` IS DECLARED `boolean` AND THE TRANSPORT CAN ONLY PRODUCE `true`, and
   * that gap is deliberate and unchanged by the port. The bridge's `withdraw`
   * was typed the same way, and `App.tsx`'s `withdrawRow` branches on `!res.ok`
   * before it clears the viewer's only per-viewer pointer at that key — a
   * pointer whose loss against a surviving row is unrecoverable, because shared
   * keys are host-minted and the shared list has no "mine" index. Over REST the
   * SDK is explicit that "every failure rejects", so the branch is unreachable
   * in production today exactly as it was before; it is kept because the cost of
   * being wrong the other way is data loss. Do not describe it as an observed
   * channel.
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
      list: async (query) => (await app()).sharedStorage.list(query),
      append: async (value) => (await app()).sharedStorage.append(value),
      update: async (key, value) => {
        // The SDK resolves `{ ok: true }`; the bridge hook resolved `void` and
        // every call site discards it. Discarded here so the façade keeps the
        // narrower promise rather than exporting a value nobody reads.
        await (await app()).sharedStorage.update(key, value);
      },
      withdraw: async (key) => (await app()).sharedStorage.withdraw(key),
      vote: async (key) => {
        const reply = await (await app()).site.post<{ count?: unknown }>(SHARED_VOTE_ROUTE, { key });
        return requireCount(reply, 'vote');
      },
      unvote: async (key) => {
        const reply = await (await app()).site.post<{ count?: unknown }>(SHARED_UNVOTE_ROUTE, {
          key,
        });
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
  const [loading, setLoading] = useState(false);
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
        const pools = await (await app()).site.get<BuzzPools>(BUZZ_ROUTE);
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
