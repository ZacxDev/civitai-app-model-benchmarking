// Shared test doubles for the component/e2e suites (jsdom). Injected into the
// App's `deps` bag so the exact production App is driven with canned
// picks/publish/gated, alongside the real SDK mock host (<Harness>) for the base
// protocol (shared storage, workflow, picker, consent, viewer). NOT a *.test
// file, so it isn't collected as a suite.

import type { BlockResourceInfo } from '@civitai/app-sdk/blocks';

import type { PublishOutputs, GatedCellComponent } from './lib/generation-bridge.js';

export const CKPT_SDXL: BlockResourceInfo = {
  versionId: 1001,
  modelId: 500,
  modelName: 'JuggernautXL',
  versionName: 'v9',
  baseModel: 'SDXL 1.0',
  modelType: 'Checkpoint',
};

export const LORA_SDXL: BlockResourceInfo = {
  versionId: 2002,
  modelId: 900,
  modelName: 'Detail Tweaker',
  versionName: 'v1',
  baseModel: 'SDXL 1.0',
  modelType: 'LORA',
  strength: 0.8,
  minStrength: 0,
  maxStrength: 1.5,
};

export const immediateSleep = () => Promise.resolve();

/** A recording publish fake that returns a fixed set of published image ids. */
export function fakePublish(imageIds: number[]) {
  const calls: Array<{ workflowId: string; imageIndexes?: number[] }> = [];
  const publishOutputs: PublishOutputs = async (args) => {
    calls.push(args);
    return { imageIds };
  };
  return { publishOutputs, calls };
}

/**
 * A fake gated-cell component: renders `result-image` for any id in `visibleIds`
 * and `result-hidden` for any id in `hiddenIds` — so a test can assert BOTH the
 * visible and the gated-hidden render paths deterministically (without the real
 * 0.30 hook). Any id not listed defaults to hidden (fail-closed, mirrors the
 * real bridge).
 */
export function fakeGatedCell(opts: { visibleIds?: number[]; hiddenIds?: number[] } = {}): GatedCellComponent {
  const visible = new Set(opts.visibleIds ?? []);
  return function FakeGatedCell({ imageIds }: { imageIds: number[]; label?: string }) {
    return (
      <div data-testid="gated-cell">
        {imageIds.map((id) =>
          visible.has(id) ? (
            <img key={id} data-testid="result-image" src={`https://image.civitai.com/${id}.jpeg`} alt={`out ${id}`} />
          ) : (
            <div key={id} data-testid="result-hidden">
              hidden
            </div>
          ),
        )}
      </div>
    );
  };
}
