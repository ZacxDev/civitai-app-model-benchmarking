// The test/dev mock host, SPLIT ACROSS TWO TRANSPORTS — which is what the port
// off the bridge did to the app, expressed once here instead of in twenty test
// files.
//
// 🔴 THE PROBLEM THIS SOLVES. `@civitai/blocks-react/testing`'s `<Harness>`
// answers the WHOLE block protocol over postMessage, and every component/e2e
// test in this repo mounts one. After the port, three of the families it answers
// — shared storage, per-viewer app storage and the Buzz balance — are HTTP, so
// the host's answers to them go unheard. A test that kept passing
// `shared={{ seed }}` / `buzzBalance={…}` to the bridge Harness would still be
// GREEN and would exercise none of the code now carrying that traffic: the
// canonical vacuous pass.
//
// 🔴 SO THIS COMPONENT TAKES THE SAME PROPS AND ROUTES THEM BY DESTINATION.
// `shared`, `storage` and `buzzBalance` go to `createRestFake` behind
// `configureSdkRuntime({ fetch })`; everything else — viewer, theme, token and
// consent, the workflow money path, the resource picker, publish, gated images —
// goes to the bridge `<Harness>` unchanged, because those genuinely still ride
// postMessage (`src/lib/sdk-runtime.ts` records which and why).
//
// Keeping the prop names identical is the point: the 20 mounted test files
// changed ONE import line each and no JSX, so the diff of this port shows the
// seam moving rather than twenty rewrites, and a case that was pinning real
// behaviour keeps pinning it.
//
// ⚠ THE THREE ROUTED PROPS ARE NOT FORWARDED TO THE BRIDGE HOST, deliberately.
// Passing them to both would let a consumer accidentally left on the bridge keep
// working, which is exactly the regression this port must not be able to hide.
//
// 🔴 BUT NOT BECAUSE "THE HOST HAS NOTHING TO SAY" — that was this comment's first
// version and it is FALSE for the balance. `createMockHost` answers
// `GET_BUZZ_BALANCE` from its OWN default ({ blue: 1000, green: 0, yellow: 5000 })
// whenever the option is absent, so a consumer left on the bridge would still get an
// affordable-looking wallet and every affordability-shaped assertion would still
// pass. What actually catches it is `buzzBalance.test.tsx`'s REST CALL COUNTS, which
// assert an exact number of `GET blocks/buzz` calls that a bridge consumer makes
// zero of. MEASURED both ways: reverting `useBuzzBalance` to the bridge reddens 3
// files, and reverting the two storage hooks reddens 2 more. So do not delete those
// counts on the strength of a "the host is silent" argument — for the balance, it is
// not silent.

import type { ReactNode } from 'react';
import { useMemo } from 'react';

import { getTransport } from '@civitai/blocks-react';
import { Harness as BridgeHarness } from '@civitai/blocks-react/testing';
import type { HarnessProps } from '@civitai/blocks-react/testing';
import type { BlockSnapshot, BlockTransport } from '@civitai/sdk';

import { createRestFake, type RestFakeOptions } from './dev-rest.js';
import { configureSdkRuntime } from './lib/sdk-runtime.js';
import { createSdkTransportAdapter } from './lib/sdk-transport.js';
import { AI_WRITE_BUDGETED, APPS_STORAGE_PUBLISH } from './scopes.js';

/**
 * This app's CONSENT-GATED scopes — what the real host's mint withholds from the
 * first token and its consent dialog grants.
 */
export const CONSENT_GATED_SCOPES = [AI_WRITE_BUDGETED, APPS_STORAGE_PUBLISH] as const;

/**
 * The adapted bridge transport, with the token carrying the WHOLE consent-gated set
 * whenever it carries any of it.
 *
 * 🔴 THIS MODELS THE REAL HOST, WHERE THE MOCK HOST DIVERGES FROM IT. On civitai the
 * consent dialog grants "the missing set the MINT computed (`missingScopes` —
 * server-known truth), NOT any scopes the block claims" (`IframeHost.tsx`'s
 * REQUEST_CONSENT handler, civitai `origin/main`), so one grant brings
 * `ai:write:budgeted` AND `apps:storage:publish` together. `@civitai/blocks-react`'s
 * mock host instead grants only what the block's hint names, and `consentGranted`
 * mints the money scope alone — so on the mock a run, which needs both
 * (`RUN_SCOPES`), could never start. Folding the set together HERE, in the test/dev
 * seam, keeps production free of a test-only branch and keeps every
 * `consentGranted` fixture meaning what it meant: "the viewer has consented".
 *
 * ⚠️ A token carrying NONE of the set is passed through untouched, so the
 * not-yet-consented path (and the REQUEST_CONSENT → TOKEN_REFRESH round trip that
 * ends it) is exercised exactly as before. The snapshot is memoised on the bridge
 * snapshot's identity because `useSyncExternalStore` re-renders forever on a fresh
 * object per read.
 */
export function hostGrantsWholeConsentSet(): BlockTransport {
  let bridge: unknown = null;
  let inner: BlockTransport | null = null;
  const current = (): BlockTransport => {
    const b = getTransport();
    if (inner === null || b !== bridge) {
      bridge = b;
      inner = createSdkTransportAdapter(b) as BlockTransport;
    }
    return inner;
  };
  let lastIn: BlockSnapshot | null = null;
  let lastOut: BlockSnapshot | null = null;
  return {
    snapshot: {
      get() {
        const snap = current().snapshot.get();
        if (snap === lastIn && lastOut !== null) return lastOut;
        lastIn = snap;
        const held = snap.token?.scopes ?? [];
        const anyGranted = CONSENT_GATED_SCOPES.some((s) => held.includes(s));
        const allGranted = CONSENT_GATED_SCOPES.every((s) => held.includes(s));
        lastOut =
          anyGranted && !allGranted
            ? { ...snap, token: { ...snap.token, scopes: [...held, ...CONSENT_GATED_SCOPES.filter((s) => !held.includes(s))] } }
            : snap;
        return lastOut;
      },
      subscribe: (listener) => current().snapshot.subscribe(listener),
    },
    notify: (message) => current().notify(message),
    request: (type, params, opts) => current().request(type, params, opts),
    on: (type, handler) => current().on(type, handler),
  };
}

/**
 * The props that moved to HTTP, plus everything `<Harness>` still owns.
 *
 * `shared`/`storage`/`buzzBalance` are re-declared against the REST fake's own
 * option types rather than inherited from `MockHostOptions`, because the fake is
 * now their authority — a seed field the mock host has and the fake does not
 * should be a compile error here, not a silently ignored fixture.
 */
export interface TestHarnessProps
  extends Omit<HarnessProps, 'shared' | 'storage' | 'buzzBalance' | 'buzzBalanceError'> {
  children: ReactNode;
  shared?: RestFakeOptions['shared'];
  storage?: RestFakeOptions['storage'];
  buzz?: HarnessProps['buzz'];
  buzzBalance?: RestFakeOptions['buzz'];
  /** The document store's own knobs: consent, rate limits, trust, … */
  docStore?: RestFakeOptions['docStore'];
  /** Observe every REST call the app makes — the successor to `onOutbound` for
   * the three families that left the bridge. */
  onRequest?: RestFakeOptions['onRequest'];
}

/**
 * Mount the mock host for a test or the dev harness.
 *
 * 🔴 `useMemo`, NOT `useEffect`. `configureSdkRuntime` must be installed BEFORE
 * the children render, because `useKvStore`/`useBuzzBalance` fire on their own
 * mount effects and a `useEffect` here runs AFTER a child's — so the first
 * balance read would go out against the production `fetch` (a real network call
 * from jsdom, failing in a way that reads nothing like a missing fixture). A
 * render-phase install is the only ordering that is correct here, and the empty
 * dependency list keeps it to once per mount: re-installing on every render would
 * discard the in-flight AppClient mid-call.
 */
export function Harness({
  children,
  shared,
  storage,
  buzzBalance,
  docStore,
  onRequest,
  ...bridge
}: TestHarnessProps) {
  useMemo(() => {
    configureSdkRuntime({
      transport: hostGrantsWholeConsentSet(),
      fetch: createRestFake({
        // The seeded viewer owns the rows and casts the votes, so the two halves
        // of the split agree on who the viewer is. `-1` for an anonymous viewer:
        // a real id would make `viewerVoted` true for rows nobody voted on.
        viewerUserId: bridge.viewer?.id ?? -1,
        ...(shared === undefined ? {} : { shared }),
        ...(storage === undefined ? {} : { storage }),
        ...(buzzBalance === undefined ? {} : { buzz: buzzBalance }),
        ...(docStore === undefined ? {} : { docStore }),
        ...(onRequest === undefined ? {} : { onRequest }),
      }),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <BridgeHarness {...bridge}>{children}</BridgeHarness>;
}
