import { describe, expect, it } from 'vitest';

import { manifest, manifestBuzzBudgetPerGen, validateManifest } from './manifest.js';
import { DECLARED_SCOPES } from './scopes.js';

describe('block manifest', () => {
  it('validates as a full BlockManifest (page-app source augmented)', () => {
    const validated = validateManifest();
    expect(validated.blockId).toBe('model-benchmarking');
    expect(validated.version).toBe('0.2.1');
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
