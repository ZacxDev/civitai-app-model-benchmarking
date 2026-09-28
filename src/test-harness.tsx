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
// Passing them to both would let a consumer that was accidentally left on the
// bridge keep working, which is exactly the regression this port must not be
// able to hide. If something still asks the host for shared storage or the
// balance, the host now has nothing to say and the test fails.

import type { ReactNode } from 'react';
import { useMemo } from 'react';

import { Harness as BridgeHarness } from '@civitai/blocks-react/testing';
import type { HarnessProps } from '@civitai/blocks-react/testing';

import { createRestFake, type RestFakeOptions } from './dev-rest.js';
import { configureSdkRuntime } from './lib/sdk-runtime.js';

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
  /** Observe every REST call the app makes — the successor to `onOutbound` for
   * the three families that left the bridge. */
  onRequest?: RestFakeOptions['onRequest'];
}

/**
 * Mount the mock host for a test or the dev harness.
 *
 * 🔴 `useMemo`, NOT `useEffect`. `configureSdkRuntime` must be installed BEFORE
 * the children render, because `useAppStorage`/`useBuzzBalance` fire on their own
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
  onRequest,
  ...bridge
}: TestHarnessProps) {
  useMemo(() => {
    configureSdkRuntime({
      fetch: createRestFake({
        // The seeded viewer owns the rows and casts the votes, so the two halves
        // of the split agree on who the viewer is. `-1` for an anonymous viewer:
        // a real id would make `viewerVoted` true for rows nobody voted on.
        viewerUserId: bridge.viewer?.id ?? -1,
        ...(shared === undefined ? {} : { shared }),
        ...(storage === undefined ? {} : { storage }),
        ...(buzzBalance === undefined ? {} : { buzz: buzzBalance }),
        ...(onRequest === undefined ? {} : { onRequest }),
      }),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <BridgeHarness {...bridge}>{children}</BridgeHarness>;
}
