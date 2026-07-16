import { describe, expect, it } from 'vitest';

import { defaultParamsForEcosystem } from './gen-defaults.js';
import { ECOSYSTEMS } from './ecosystem.js';

describe('defaultParamsForEcosystem (mirrors the on-site generator per family)', () => {
  it('SD 1.5 → SD-family scalars at 512×512', () => {
    expect(defaultParamsForEcosystem('SD1')).toMatchObject({
      steps: 30,
      cfgScale: 7,
      sampler: 'Euler a',
      clipSkip: 2,
      width: 512,
      height: 512,
    });
  });

  it('SDXL / Pony / Illustrious / NoobAI → SD-family scalars at 1024×1024', () => {
    for (const key of ['SDXL', 'Pony', 'Illustrious', 'NoobAI']) {
      expect(defaultParamsForEcosystem(key)).toMatchObject({
        steps: 30,
        cfgScale: 7,
        sampler: 'Euler a',
        clipSkip: 2,
        width: 1024,
        height: 1024,
      });
    }
  });

  it('Flux / Flux Krea → cfg 3.5, steps 25, NO sampler + NO clipSkip', () => {
    for (const key of ['Flux', 'Flux1Krea']) {
      const p = defaultParamsForEcosystem(key);
      expect(p).toMatchObject({ steps: 25, cfgScale: 3.5, width: 1024, height: 1024 });
      expect(p.sampler).toBeUndefined();
      expect(p.clipSkip).toBeUndefined();
    }
  });

  it('an unknown ecosystem falls back to a generic SDXL-shaped set', () => {
    expect(defaultParamsForEcosystem('Other')).toMatchObject({
      steps: 30,
      cfgScale: 7,
      sampler: 'Euler a',
      width: 1024,
      height: 1024,
    });
  });

  it('returns a FRESH object each call (safe to mutate into form state)', () => {
    const a = defaultParamsForEcosystem('SDXL');
    const b = defaultParamsForEcosystem('SDXL');
    expect(a).not.toBe(b);
    a.steps = 1;
    expect(b.steps).toBe(30); // untouched
    // negativePrompt/seed are always seeded (form-friendly)
    expect(a.negativePrompt).toBe('');
    expect(a.seed).toBeNull();
  });

  it('every declared ecosystem key resolves to a usable default set', () => {
    for (const eco of ECOSYSTEMS) {
      const p = defaultParamsForEcosystem(eco.key);
      expect(typeof p.steps).toBe('number');
      expect(typeof p.cfgScale).toBe('number');
      expect(typeof p.width).toBe('number');
      expect(typeof p.height).toBe('number');
    }
  });
});
