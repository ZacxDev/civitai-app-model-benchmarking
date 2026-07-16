// Seed data for the local dev harness (`npm run dev:harness`) — a couple of
// combinations + prompts so the submit/vote/grid loop is explorable offline.
// Shapes match the app's own `data.kind` records (see lib/benchmark.ts).

import type { MockSharedSeed } from '@civitai/blocks-react/testing';

import type { CombinationData, PromptData } from './types.js';

const comboSdxl: CombinationData = {
  v: 1,
  kind: 'combination',
  checkpoint: { versionId: 1001, modelId: 500, baseModel: 'SDXL 1.0', modelName: 'JuggernautXL', versionName: 'v9' },
  loras: [{ versionId: 2002, weight: 0.8, modelName: 'Detail Tweaker XL', minStrength: 0, maxStrength: 1.5 }],
};

const comboPony: CombinationData = {
  v: 1,
  kind: 'combination',
  checkpoint: { versionId: 1101, modelId: 600, baseModel: 'Pony', modelName: 'AutismMix', versionName: 'confetti' },
  loras: [],
};

const promptPortrait: PromptData = {
  v: 1,
  kind: 'prompt',
  byEcosystem: {
    SDXL: { prompt: 'cyberpunk portrait, neon rim light, 85mm', params: { cfgScale: 5, steps: 30, sampler: 'DPM++ 2M Karras' } },
    Pony: { prompt: 'score_9, cyberpunk portrait, neon rim light', params: { cfgScale: 6, steps: 28 } },
  },
};

const promptLandscape: PromptData = {
  v: 1,
  kind: 'prompt',
  byEcosystem: {
    SDXL: { prompt: 'sweeping alien landscape, twin moons, volumetric fog', params: { cfgScale: 4.5, steps: 32 } },
  },
};

export const DEMO_SHARED_SEED: MockSharedSeed[] = [
  { value: { title: 'JuggernautXL + Detail Tweaker', body: 'Sharp SDXL baseline', data: comboSdxl }, authorUserId: 7, voters: [1, 2, 3] },
  { value: { title: 'AutismMix Pony', body: 'Pony baseline', data: comboPony }, authorUserId: 8, voters: [1] },
  { value: { title: 'Cyberpunk portrait', body: '[SDXL] cyberpunk portrait\n[Pony] score_9, cyberpunk portrait', data: promptPortrait }, authorUserId: 9, voters: [1, 2, 3, 4] },
  { value: { title: 'Alien landscape', body: '[SDXL] sweeping alien landscape', data: promptLandscape }, authorUserId: 9, voters: [2] },
];
