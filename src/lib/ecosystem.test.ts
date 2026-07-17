import { describe, expect, it } from 'vitest';

import { ecosystemForBaseModel, ecosystemMeta, OTHER_ECOSYSTEM } from './ecosystem.js';

describe('ecosystemForBaseModel', () => {
  it.each([
    ['SD 1.5', 'SD1'],
    ['SD 2.1', 'SD2'],
    ['SD 3.5', 'SD3'],
    ['SDXL 1.0', 'SDXL'],
    ['SDXL 1.0 LCM', 'SDXL'],
    ['Pony', 'Pony'],
    ['Illustrious', 'Illustrious'],
    ['NoobAI', 'NoobAI'],
    ['Flux.1 D', 'Flux'],
    ['Flux.1 Krea', 'Flux1Krea'],
    ['SDXL Lightning', 'SDXLLightning'],
  ])('maps %s → %s', (baseModel, expected) => {
    expect(ecosystemForBaseModel(baseModel)).toBe(expected);
  });

  it('is case + whitespace insensitive', () => {
    expect(ecosystemForBaseModel('  sdxl 1.0  ')).toBe('SDXL');
    expect(ecosystemForBaseModel('pOnY')).toBe('Pony');
  });

  it('prefers the SDXL-derivative family name over "SDXL" itself', () => {
    // Pony/Illustrious are SDXL-derived but their baseModel does NOT contain
    // "SDXL"; a base model that literally says Pony must NOT fall to SDXL.
    expect(ecosystemForBaseModel('Pony')).toBe('Pony');
    expect(ecosystemForBaseModel('Illustrious XL')).toBe('Illustrious');
  });

  it('falls back to Other for unknown / empty base models', () => {
    expect(ecosystemForBaseModel('SomeFutureModel')).toBe(OTHER_ECOSYSTEM);
    expect(ecosystemForBaseModel('')).toBe(OTHER_ECOSYSTEM);
    expect(ecosystemForBaseModel(undefined)).toBe(OTHER_ECOSYSTEM);
    expect(ecosystemForBaseModel(null)).toBe(OTHER_ECOSYSTEM);
  });
});

describe('ecosystemMeta', () => {
  it('returns known metadata', () => {
    expect(ecosystemMeta('SDXL').label).toBe('SDXL');
    expect(ecosystemMeta('SDXL').baseModelGroup).toBe('SDXL');
  });
  it('synthesises metadata for an unknown key so a forged/legacy row still renders', () => {
    expect(ecosystemMeta('Zzz')).toEqual({ key: 'Zzz', label: 'Zzz', baseModelGroup: 'Zzz' });
  });
});
