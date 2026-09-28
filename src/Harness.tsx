import type { ReactNode } from 'react';

import { Harness as SplitHarness } from './test-harness.js';
import { DEMO_SHARED_SEED } from './demo-data.js';

/**
 * Local dev mock host for the Model Benchmarking PAGE app.
 *
 * The real full-page surface mounts the block in an iframe, brokers the protocol
 * (BLOCK_INIT, viewer, consent, resource picker, workflow) AND serves `/api/v1`
 * for the data. Locally `src/test-harness.tsx` plays both halves: the published
 * mock host (`createMockHost`) over postMessage, and `src/dev-rest.ts` at the
 * `fetch` boundary for the three families that moved to REST. We seed it
 * consent-granted with demo matchups/prompts + a Buzz wallet so the submit → vote
 * → grid loop is exercisable offline.
 *
 * 🔴 `shared` AND `buzzBalance` NOW GO TO THE REST FAKE, NOT THE MOCK HOST — see
 * `src/test-harness.tsx` for the split. Before the port they were mock-host
 * scenarios; the mock host answers no HTTP, so seeding it instead would leave the
 * dev board empty with nothing on screen to explain why.
 *
 * NOTE: the 0.30 publish/gated hooks have no mock-host scenario in the installed
 * (pre-0.30) testing package, so the grid's gated cells render fail-closed
 * (hidden) in the harness until 0.30 lands. Component tests inject fakes for
 * those paths.
 */
export function Harness({ children }: { children: ReactNode }) {
  return (
    <SplitHarness
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
    </SplitHarness>
  );
}
