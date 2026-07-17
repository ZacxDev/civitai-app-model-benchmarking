// Per-ecosystem DEFAULT generation params — mirrors the civitai on-site
// generator so a new prompt entry pre-fills the conventional steps/cfg/sampler/
// size/clipSkip for its base-model family.
//
// Source of truth reused (civitai monorepo, src/shared/data-graph/generation/):
//  - stable-diffusion-graph.ts:98/111/119 — the SD family (SD1/SD2/SDXL/Pony/
//    Illustrious/NoobAI): steps 30, cfgScale 7, sampler 'Euler a', clipSkip 2.
//  - stable-diffusion-graph.ts:81 + generation.constants.ts:673/680 — width/height
//    buckets: SD1 = 512×512 (sd1AspectRatioBuckets 1:1), the rest = 1024×1024
//    (sdxlAspectRatioBuckets 1:1). Default aspectRatio = '1:1' (common.ts:87).
//  - flux-graph.ts:114/116 — Flux family (Flux1/FluxKrea): steps 25, cfgScale
//    3.5, and (flux-graph.ts:7,171) NO sampler + NO clipSkip.
//  - ecosystem-graph.ts:352 — the ecosystem-key → graph wiring these mirror.
// Grouping key mirrors getBaseModelGroup (basemodel.constants.ts:4416); here the
// key is our own ecosystem key (see lib/ecosystem.ts), which lines up 1:1.

import type { PromptParams } from '../types.js';

/** SD-family scalar defaults (identical across SD1/SD2/SDXL/Pony/Illustrious/NoobAI). */
const SD_BASE = { steps: 30, cfgScale: 7, sampler: 'Euler a', clipSkip: 2 } as const;
/** Flux-family defaults — Flux uses NO sampler and NO clipSkip (omitted on purpose). */
const FLUX = { steps: 25, cfgScale: 3.5, width: 1024, height: 1024 } as const;

const DEFAULTS: Record<string, PromptParams> = {
  SD1: { ...SD_BASE, width: 512, height: 512 },
  // SD2 rides the SD graph but the aspectRatio node only special-cases SD1 → 1024².
  SD2: { ...SD_BASE, width: 1024, height: 1024 },
  // SD3 is NOT a first-class on-site graph (no ecosystem-graph.ts entry) — a
  // reasonable faithful fallback (cfg-guidance model, uses a sampler, no clipSkip).
  SD3: { steps: 28, cfgScale: 4.5, sampler: 'Euler', width: 1024, height: 1024 },
  SDXL: { ...SD_BASE, width: 1024, height: 1024 },
  Pony: { ...SD_BASE, width: 1024, height: 1024 },
  Illustrious: { ...SD_BASE, width: 1024, height: 1024 },
  NoobAI: { ...SD_BASE, width: 1024, height: 1024 },
  Flux: { ...FLUX },
  Flux1Krea: { ...FLUX },
  // The on-site generator does NOT special-case SDXL Lightning — it resolves to
  // the SDXL group and uses the SD-family defaults above.
  SDXLLightning: { ...SD_BASE, width: 1024, height: 1024 },
};

/** Generic fallback for an unknown/'Other' ecosystem (SDXL-shaped, safe baseline). */
const GENERIC: PromptParams = { ...SD_BASE, width: 1024, height: 1024 };

/**
 * Sensible default generation params for an ecosystem key, matching the on-site
 * generator's per-family defaults. Always returns a fresh object (safe to mutate
 * / spread into form state). Unknown keys fall back to a generic SDXL-shaped set.
 */
export function defaultParamsForEcosystem(ecoKey: string): PromptParams {
  const base = DEFAULTS[ecoKey] ?? GENERIC;
  return { ...base, negativePrompt: '', seed: null };
}
