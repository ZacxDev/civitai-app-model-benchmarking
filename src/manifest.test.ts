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

  it('declares exactly the scopes the code depends on (in lockstep with scopes.ts)', () => {
    const declared = (manifest.scopes as string[]) ?? [];
    expect([...declared].sort()).toEqual([...DECLARED_SCOPES].sort());
  });

  it('exposes a page app with a per-gen buzz budget', () => {
    expect((manifest.page as { path: string }).path).toBe('/');
    expect(manifestBuzzBudgetPerGen()).toBe(1000);
  });
});
