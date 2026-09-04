import { describe, expect, it } from 'vitest';

import pkg from '../package.json';
import { manifest, manifestBuzzBudgetPerGen, validateManifest } from './manifest.js';
import { DECLARED_SCOPES } from './scopes.js';

describe('block manifest', () => {
  it('validates as a full BlockManifest (page-app source augmented)', () => {
    const validated = validateManifest();
    expect(validated.blockId).toBe('model-benchmarking');
  });

  // 🔴 This assertion used to be a LITERAL (`toBe('0.1.2')`). The v0.1.3
  // design-system bump moved the manifest and left the literal behind, so `main`
  // went red on a version bump and STAYED red — every subsequent PR inherited a
  // failing build it had not caused. A permanently-red gate is worse than no
  // gate: it trains everyone to merge through it, and the next real defect
  // arrives looking exactly like this one.
  //
  // The literal also pinned nothing worth pinning. Nobody learns anything from
  // "the version is the version". The invariant that DOES matter is that the
  // manifest and the package agree — the store reads one, the build reads the
  // other, and a bump that touches only one is a real, shippable defect. That
  // cannot rot on a bump, and it still fires when someone bumps just one.
  it('keeps block.manifest.json and package.json versions in lockstep', () => {
    const validated = validateManifest();
    expect(validated.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(validated.version).toBe(pkg.version);
  });

  // 🔴 THIS GUARD EXISTS BECAUSE ITS ABSENCE SHIPPED AN INERT CHANGE. PR #32 added
  // the whole boot-skeleton mechanism — the pre-paint script, the dark-base inline
  // stylesheet, the skeleton markup, `paintTheme()` — and 23 tests covering all of
  // it, then merged WITHOUT this key. Every one of those tests passed, because they
  // each verify the mechanism works; none asserted the one line that turns it on.
  //
  // The key is not decoration. `bootSkeleton: true` is what makes the full-page run
  // host stand down its opaque veil; without it the host keeps covering the iframe
  // and the entire mechanism is dead code that nobody can see working or failing.
  // Its counterpart in index.html (the skeleton inside #root) is asserted by
  // src/bootSkeleton.test.tsx — the two must ship together, because the key over an
  // EMPTY #root is strictly worse than not opting in at all.
  it('opts into the boot skeleton, and the markup that entitles it to', () => {
    expect(manifest.bootSkeleton).toBe(true);
  });

  it('declares exactly the scopes the code depends on (in lockstep with scopes.ts)', () => {
    const declared = (manifest.scopes as string[]) ?? [];
    expect([...declared].sort()).toEqual([...DECLARED_SCOPES].sort());
  });

  it('exposes a page app with a per-gen buzz budget', () => {
    expect((manifest.page as { path: string }).path).toBe('/');
    expect(manifestBuzzBudgetPerGen()).toBe(1000);
  });
});
