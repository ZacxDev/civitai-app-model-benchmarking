// Seed data for the local dev harness (`npm run dev:harness`) — a couple of
// combinations + prompts so the submit/vote/grid loop is explorable offline.
// Shapes match the app's own `data.kind` records (see lib/benchmark.ts).

import type { MockSharedSeed } from '@civitai/blocks-react/testing';

import type { CombinationData, PromptData } from './types.js';

// A multi-config combination (v2): benchmark an SDXL base vs the same base + a
// detail LoRA, side by side, under one voteable combination.
const comboSdxl: CombinationData = {
  v: 2,
  kind: 'combination',
  configs: [
    {
      id: 'cfg_sdxl_base',
      label: 'base',
      checkpoint: { versionId: 1001, modelId: 500, baseModel: 'SDXL 1.0', modelName: 'JuggernautXL', versionName: 'v9' },
      loras: [],
    },
    {
      id: 'cfg_sdxl_detail',
      label: '+ Detail Tweaker',
      checkpoint: { versionId: 1001, modelId: 500, baseModel: 'SDXL 1.0', modelName: 'JuggernautXL', versionName: 'v9' },
      loras: [{ versionId: 2002, weight: 0.8, modelName: 'Detail Tweaker XL', minStrength: 0, maxStrength: 1.5 }],
    },
  ],
};

const comboPony: CombinationData = {
  v: 2,
  kind: 'combination',
  configs: [
    {
      id: 'cfg_pony',
      checkpoint: { versionId: 1101, modelId: 600, baseModel: 'Pony', modelName: 'AutismMix', versionName: 'confetti' },
      loras: [],
    },
  ],
};

// A LEGACY v1 combination (single checkpoint + loras) — left intentionally in the
// old shape so the harness exercises the v1→v2 back-compat migration on read.
const comboLegacyV1 = {
  v: 1,
  kind: 'combination',
  checkpoint: { versionId: 1201, modelId: 700, baseModel: 'Flux.1 D', modelName: 'FluxRealism', versionName: 'v1' },
  loras: [{ versionId: 2201, weight: 1, modelName: 'Amateur Photo', minStrength: 0, maxStrength: 1.5 }],
} as unknown as CombinationData;

// A v3 prompt: a DEFAULT that runs on every ecosystem, plus a Pony override (a
// score_-prefixed prompt) and a Flux override (Flux's cfg/steps, no sampler).
const promptPortrait: PromptData = {
  v: 3,
  kind: 'prompt',
  default: { prompt: 'cyberpunk portrait, neon rim light, 85mm', params: { cfgScale: 7, steps: 30, sampler: 'Euler a', width: 1024, height: 1024, clipSkip: 2 } },
  overrides: {
    Pony: { prompt: 'score_9, cyberpunk portrait, neon rim light', params: { cfgScale: 7, steps: 30, sampler: 'Euler a' } },
    Flux: { params: { cfgScale: 3.5, steps: 25 } },
  },
};

// A LEGACY v1 prompt (byEcosystem) — left intentionally in the old shape so the
// harness exercises the v1→v3 default+overrides migration on read.
const promptLandscape = {
  v: 1,
  kind: 'prompt',
  byEcosystem: {
    SDXL: { prompt: 'sweeping alien landscape, twin moons, volumetric fog', params: { cfgScale: 7, steps: 30, sampler: 'Euler a', width: 1024, height: 1024, clipSkip: 2 } },
  },
} as unknown as PromptData;

export const DEMO_SHARED_SEED: MockSharedSeed[] = [
  { value: { title: 'SDXL: base vs +detail', body: 'Sharp SDXL baseline, two configs', data: comboSdxl }, authorUserId: 7, voters: [1, 2, 3] },
  { value: { title: 'AutismMix Pony', body: 'Pony baseline', data: comboPony }, authorUserId: 8, voters: [1] },
  { value: { title: 'Flux Realism (legacy v1)', body: 'Amateur photo look', data: comboLegacyV1 }, authorUserId: 8, voters: [1, 2] },
  { value: { title: 'Cyberpunk portrait', body: 'cyberpunk portrait, neon rim light, 85mm\n[Pony] score_9, cyberpunk portrait, neon rim light', data: promptPortrait }, authorUserId: 9, voters: [1, 2, 3, 4] },
  { value: { title: 'Alien landscape', body: '[SDXL] sweeping alien landscape', data: promptLandscape }, authorUserId: 9, voters: [2] },
];
