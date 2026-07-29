import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { useBlockAnalytics } from '@civitai/blocks-react';
import { BlockGate, injectBlocksStyles } from '@civitai/blocks-react/ui';
import { injectStyles as injectComponentStyles } from '@civitai/components-react';

// Design-system tokens (`--civitai-*` custom properties, light/dark via
// `[data-theme]`). The pack's injectBlocksStyles() also injects these at runtime,
// but importing the stylesheet makes @civitai/theme an explicit, first-paint
// token source rather than a transitive side-effect of the pack.
import '@civitai/theme/styles.css';

import { App } from './App.js';
import { Harness } from './Harness.js';
import { RootBoundary } from './components/RootBoundary.js';
import { installHarnessTransport } from './dev-transport.js';
import './index.css';

// Inject the /ui pack's themed stylesheet once up-front (idempotent; the pack
// components also self-inject on first render — this just guarantees tokens
// exist before the first paint). The `@civitai/components-react` primitives
// (Image / Tooltip) self-inject too; pre-injecting avoids a first-paint flash.
injectBlocksStyles();
injectComponentStyles();

/**
 * The app subtree, wrapped in the recoverable error boundary. Sits INSIDE
 * <BlockGate> (below) so it only mounts on the embedded happy path — where the
 * SDK transport is live — letting it read `useBlockAnalytics()` to report a
 * caught render error as `block_error`.
 */
function Root(): React.JSX.Element {
  const { track } = useBlockAnalytics();
  return (
    <RootBoundary onError={(error) => track('block_error', { message: error.message })}>
      <App />
    </RootBoundary>
  );
}

// `npm run dev:harness` sets VITE_DEV_HARNESS=true to mount the local mock host
// (the published `@civitai/blocks-react/testing` Harness / createMockHost) that
// answers the FULL block protocol. Never set VITE_DEV_HARNESS in prod.
const useHarness = import.meta.env.VITE_DEV_HARNESS === 'true';

// The mock host replies from window.location.origin; the SDK transport drops
// mismatched-origin messages. Allowlist this origin BEFORE any hook runs.
if (useHarness) installHarnessTransport();

const container = document.getElementById('root');
if (!container) throw new Error('#root missing from index.html');

// `<BlockGate>` shows an "Open on Civitai" landing when the block is loaded
// DIRECTLY (top-level at its bare `<slug>.civit.ai` origin, no BLOCK_INIT)
// instead of hanging on the app's loading state. It's inert on the embedded
// happy path and the dev harness (both post BLOCK_INIT), so it renders the app
// unchanged there. The run slug is derived from `location.hostname`.
createRoot(container).render(
  <StrictMode>
    <BlockGate>{useHarness ? <Harness><Root /></Harness> : <Root />}</BlockGate>
  </StrictMode>,
);
