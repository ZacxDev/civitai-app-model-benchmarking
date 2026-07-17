import type { ReactNode } from 'react';

import { Harness as SdkHarness } from '@civitai/blocks-react/testing';
import { DEMO_SHARED_SEED } from './demo-data.js';

/**
 * Local dev mock host for the Model Benchmarking PAGE app.
 *
 * The real full-page surface mounts the block in an iframe and brokers the
 * protocol (BLOCK_INIT, viewer, consent, resource picker, workflow, shared
 * storage). Locally the published SDK mock host (`createMockHost`) plays one. We
 * seed it consent-granted with demo combinations/prompts + a Buzz wallet so the
 * submit → vote → grid loop is exercisable offline.
 *
 * NOTE: the 0.30 publish/gated hooks have no mock-host scenario in the installed
 * (pre-0.30) testing package, so the grid's gated cells render fail-closed
 * (hidden) in the harness until 0.30 lands. Component tests inject fakes for
 * those paths.
 */
export function Harness({ children }: { children: ReactNode }) {
  return (
    <SdkHarness
      viewer={{ id: 99, username: 'me' }}
      theme="dark"
      consentGranted
      buzzBudget={1000}
      buzz={{ balance: 5000 }}
      buzzBalance={{ blue: 1200, green: 0, yellow: 5000 }}
      generation={{ costPerGen: 12, latencyMs: 400, images: ['https://image.civitai.com/demo/out.jpeg'] }}
      shared={{ seed: DEMO_SHARED_SEED }}
    >
      {children}
    </SdkHarness>
  );
}
