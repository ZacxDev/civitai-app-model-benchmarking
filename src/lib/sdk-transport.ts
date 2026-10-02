/**
 * Adapts the `@civitai/blocks-react` transport singleton to the `BlockTransport`
 * interface `@civitai/sdk`'s `initialize({ transport })` accepts.
 *
 * WHY THIS EXISTS — and why it is not just `initialize()` with no argument:
 * `/ui` stays on `@civitai/blocks-react` until starters#328 lands, and this
 * app's `/ui` usage reaches the bridge transport singleton on every production
 * boot:
 *
 *   - `BlockGate` (wraps the PRODUCTION root at `src/main.tsx`)
 *       -> `useDirectLoad` -> `useTransportSnapshot` -> `getTransport()`
 *
 * Measured by enumerating the installed pack rather than grepping it (`find …
 * -print0 | xargs -0 grep`, because `node_modules` is gitignored and this host's
 * recursive `grep` honours `.gitignore`): exactly three `/ui` files import from
 * `../hooks/` or `../internal/` — `BlockGate`, `FollowButton`, `TipButton`. This
 * app renders `BlockGate` and neither of the other two, so the bridge transport
 * is constructed for one reason, on every boot, unconditionally.
 *
 * A bare `initialize()` would stand up a SECOND transport beside it: two
 * `message` listeners, two `BLOCK_HELLO` senders, two `BLOCK_READY`
 * auto-senders, two token copies and two `TOKEN_REFRESH` handlers. Whether the
 * host tolerates two `BLOCK_READY`s is a platform question nobody has measured,
 * so this app does not ship an unverified protocol change. One transport,
 * adapted.
 *
 * Delete this file and switch to a plain `initialize()` once `/ui` no longer
 * imports from `@civitai/blocks-react` (starters#328).
 */
import { getTransport, sendTypedRequest } from '@civitai/blocks-react';
import type { BlockTransport as BridgeTransport } from '@civitai/blocks-react';

/**
 * The one request-shaped operation the SDK performs over this adapter, and the
 * reply type the bridge requires the caller to name.
 *
 * 🔴 The SDK's `request(type, params)` does NOT carry a response type — it
 * assumes the transport knows. The bridge's `sendRequest` REQUIRES one
 * (`sendTypedRequest(t, req, responseType)`), so the mapping has to live here.
 *
 * Measured against `@civitai/sdk@0.8.0` + `@civitai/blocks-react@0.51.0` by
 * (⚠️ NOT RE-MEASURED at the installed 0.10.0 / 0.61.0 — the `scope: 'site'` bump
 * moved both, and this provenance is deliberately left naming what was actually
 * measured rather than restamped to versions nobody checked)
 * enumerating the SDK's own `call(...)`/`notify(...)` sites in `dist/`: the only
 * `request`-shaped host operation it performs is `REQUEST_TOKEN`
 * (`dist/host/index.js:252`), which the token session issues when an HTTP call
 * 401s. Everything else this app routes through the adapter is notify-shaped —
 * `RESIZE_IFRAME`, `REQUEST_SIGN_IN` and `REQUEST_CONSENT` are all `notify` in
 * `dist/host/index.js` — and storage/Buzz go over REST rather than the bridge at
 * all.
 *
 * The pairing is the one the SDK's own iframe transport uses for the same
 * message (`dist/core/transports/iframe-transport.js:33`,
 * `REQUEST_TOKEN: 'TOKEN_REFRESH_RESPONSE'`), and the bridge agrees
 * (`internal/validate.js`, `hooks/useBlockToken.js`).
 *
 * An unmapped type THROWS rather than guessing: picking a plausible reply type
 * would hang the request until its timeout and surface as a dead host.
 */
// 🔴 `Object.create(null)`, NOT `{}`. A plain object inherits `constructor`,
// `toString`, `valueOf` … so `RESPONSE_TYPE['toString']` is TRUTHY and would skip
// the refusal below, handing `sendTypedRequest` a FUNCTION as the reply type. No
// real host message is named that, so this is unreachable rather than a live hole —
// but the refusal is the file's load-bearing guard and a guard with a hole in it is
// not worth arguing about when closing it costs one expression.
const RESPONSE_TYPE: Readonly<Record<string, string>> = Object.freeze(
  Object.assign(Object.create(null) as Record<string, string>, {
    REQUEST_TOKEN: 'TOKEN_REFRESH_RESPONSE',
  }),
);

/**
 * The SDK's snapshot is the bridge's plus `hostOrigin`, which the bridge exposes
 * as a separate accessor. Everything else is field-for-field identical
 * (measured: the only field in the SDK's `BlockSnapshot` absent from the
 * bridge's is `hostOrigin`; the bridge's extra `appId`/`blockId` are ignored).
 *
 * 🔴 IDENTITY IS LOAD-BEARING, NOT AN OPTIMISATION. `snapshot.get()` feeds
 * `useSyncExternalStore`, which bails out on `Object.is`. Composing `{...snap,
 * hostOrigin}` fresh on every call returns a new object every time, so the store
 * never compares equal and React re-renders forever. So: cache, and recompute
 * only when an input actually changed.
 *
 * 🔴 AND `hostOrigin` MUST COME FROM `getHostOrigin()` WITH NO FALLBACK. The
 * bridge documents it as a security invariant: the value it returns is the base
 * URL a money-scoped block bearer token is sent to, and it must only ever be an
 * origin that passed the same allowlist gate every inbound message passes.
 * `null` means "not yet established" and must stay `null` — substituting
 * `window.location.origin`, `document.referrer` or a parent's origin here would
 * turn a not-ready state into a token-exfiltration vector.
 */
function composeSnapshot(bridge: BridgeTransport) {
  let lastBase: unknown;
  let lastHostOrigin: string | null | undefined;
  let lastComposed: unknown;

  return function get() {
    const base = bridge.getSnapshot();
    const hostOrigin = bridge.getHostOrigin();
    if (base === lastBase && hostOrigin === lastHostOrigin) {
      return lastComposed;
    }
    lastBase = base;
    lastHostOrigin = hostOrigin;
    lastComposed = { ...base, hostOrigin };
    return lastComposed;
  };
}

/**
 * Wrap the bridge's transport singleton for `initialize({ transport })`.
 *
 * Takes the transport as an argument (defaulting to the singleton) so tests can
 * drive it with a fake rather than standing up a real iframe transport.
 */
export function createSdkTransportAdapter(bridge: BridgeTransport = getTransport()) {
  const get = composeSnapshot(bridge);

  return {
    snapshot: {
      get,
      subscribe: (listener: () => void) => bridge.subscribe(listener),
    },

    notify: (message: { type: string; payload?: unknown }) => {
      // The bridge's outbound union is narrower than `string`; the SDK only ever
      // sends types the bridge knows, and an unknown one is rejected by the host
      // rather than silently accepted here.
      bridge.sendMessage(message as Parameters<BridgeTransport['sendMessage']>[0]);
    },

    request: (type: string, params: unknown, opts?: { signal?: AbortSignal }) => {
      const responseType = RESPONSE_TYPE[type];
      if (!responseType) {
        throw new Error(
          `sdk-transport: no response type mapped for request '${type}'. ` +
            'The bridge requires the caller to name the reply message; add it to ' +
            'RESPONSE_TYPE with a source for the pairing rather than guessing, ' +
            'because a wrong reply type hangs until timeout and reads as a dead host.',
        );
      }
      const inflight = sendTypedRequest(
        bridge,
        { type, payload: params } as Parameters<typeof sendTypedRequest>[1],
        responseType as Parameters<typeof sendTypedRequest>[2],
        // 🔴 NOT a pass-through, and not castable: the SDK's opts is
        // `{ signal?: AbortSignal }` and the bridge's is `{ timeoutMs?: number }`
        // — no common property. Casting one to the other would compile and
        // silently discard the caller's cancellation, so the signal is honoured
        // below instead of smuggled through a cast.
        undefined,
      ) as Promise<unknown>;

      const signal = opts?.signal;
      if (!signal) return inflight;
      if (signal.aborted) return Promise.reject(signal.reason ?? new Error('aborted'));

      // ⚠ HONEST LIMITATION: this rejects the CALLER's promise on abort, but the
      // bridge exposes no cancellation, so the in-flight postMessage is NOT
      // recalled and a late reply is simply dropped. That is strictly better than
      // ignoring the signal (the caller unblocks) and strictly worse than real
      // cancellation (the host still does the work) — stated rather than implied,
      // because a reader would otherwise assume `signal` cancels the host call.
      return Promise.race([
        inflight,
        new Promise<never>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason ?? new Error('aborted')), {
            once: true,
          });
        }),
      ]);
    },

    on: (type: string, handler: (payload: unknown) => void) =>
      bridge.onMessage(type as Parameters<BridgeTransport['onMessage']>[0], handler),
  };
}
