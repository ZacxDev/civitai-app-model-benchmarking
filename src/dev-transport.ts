// Test/dev-only transport wiring. NOT imported by production code (App.tsx uses
// the SDK hooks, which read the build-time env allowlist via getTransport()).
//
// The SDK's IframeTransport is a process-wide singleton whose FIRST
// getTransport() call fixes its origin allowlist. The mock host (dev harness AND
// vitest) replies from `window.location.origin`, and the transport DROPS any
// inbound message whose origin isn't allowlisted — so in harness/test mode we
// MUST initialize the transport with `window.location.origin` allowed BEFORE any
// hook (or the mock host) runs.

import { getTransport } from '@civitai/blocks-react';
import { resetTransport } from '@civitai/blocks-react/testing';

/** Initialize the SDK transport with the current page origin allowlisted. */
export function installHarnessTransport() {
  getTransport({ allowedParentOrigins: [window.location.origin] });
}

/** Reset + re-initialize the transport for a single test (call in beforeEach). */
export function resetHarnessTransport() {
  resetTransport();
  getTransport({ allowedParentOrigins: [window.location.origin] });
}
