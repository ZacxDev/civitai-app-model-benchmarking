// ---------------------------------------------------------------------------
// 0.30 generation-output bridge (usePublishGenerationOutputs + useGatedImages)
// ---------------------------------------------------------------------------
//
// 🔴 These two hooks ship in @civitai/blocks-react@^0.30 — which was NOT yet
// published to npm when this block was built (latest was 0.29). So this module
// accesses them DEFENSIVELY off the package namespace (an `unknown`-cast lookup)
// instead of a static named import, which would fail typecheck against 0.29.
// The moment 0.30 is installed the real hooks are picked up at runtime with no
// code change; if it's still absent, the normalized adapters below throw/return
// a clear "unavailable" state (the App wires these through injectable `deps`, so
// TESTS never hit either — they inject fakes).
//
// ⚠️ SIGNATURE CONFIRMATION OWED: the exact return shapes below are the
// DOCUMENTED contract (per the Phase-1 brief), NOT yet verified against an
// installed 0.30 dist. Both adapters normalise across the plausible shapes
// (hook-returns-fn vs hook-returns-{publish}; gated hook-returns-array vs
// -{images}) so a shape surprise degrades gracefully. When 0.30 is installed,
// read `dist/hooks/usePublishGenerationOutputs.d.ts` + `useGatedImages.d.ts` and
// tighten these to the real names/shapes (this is the ONE file to touch).

import type { ComponentType } from 'react';

import * as BlocksReact from '@civitai/blocks-react';

const ns = BlocksReact as unknown as Record<string, unknown>;

// ---- usePublishGenerationOutputs ----

/** Args for publishing a completed generation's own scanned outputs. */
export interface PublishOutputsArgs {
  workflowId: string;
  /** Optional subset of the workflow's output images to publish (default: all). */
  imageIndexes?: number[];
}

/** Result: the bare scanned Image row ids the app publishes to its grid. */
export interface PublishOutputsResult {
  imageIds: number[];
}

/** The app-facing publish function (normalised across the hook's plausible shapes). */
export type PublishOutputs = (args: PublishOutputsArgs) => Promise<PublishOutputsResult>;

type PublishHookReturn =
  | PublishOutputs
  | { publish?: PublishOutputs; publishOutputs?: PublishOutputs };

/** True iff the installed @civitai/blocks-react actually exports the 0.30 publish hook. */
export function hasPublishHook(): boolean {
  return typeof ns.usePublishGenerationOutputs === 'function';
}

/**
 * A hook that always returns a normalised {@link PublishOutputs}. Calls the real
 * 0.30 hook when present (unconditionally — the export's presence is constant for
 * the process life, so the hook-call order is stable), else returns a stub that
 * rejects with a clear "requires 0.30" error.
 */
export function usePublishOutputs(): PublishOutputs {
  const real = ns.usePublishGenerationOutputs as (() => PublishHookReturn) | undefined;
  if (real) {
    const ret = real();
    return normalizePublish(ret);
  }
  return async () => {
    throw new Error(
      'usePublishGenerationOutputs is unavailable — requires @civitai/blocks-react@^0.30 (not installed at build time).',
    );
  };
}

function normalizePublish(ret: PublishHookReturn): PublishOutputs {
  if (typeof ret === 'function') return ret;
  const fn = ret.publish ?? ret.publishOutputs;
  if (typeof fn === 'function') return fn;
  return async () => {
    throw new Error('usePublishGenerationOutputs returned an unrecognised shape.');
  };
}

// ---- useGatedImages ----

/** Per-viewer gated display data for one published image id. */
export type GatedImage =
  | { imageId: number; status: 'visible'; url: string; nsfwLevel?: number; width?: number; height?: number }
  | { imageId: number; status: 'hidden'; reason?: string };

export interface GatedImagesState {
  images: GatedImage[];
  loading: boolean;
}

type GatedHook = (imageIds: number[]) => GatedImage[] | { images?: GatedImage[]; loading?: boolean };

/** True iff the installed @civitai/blocks-react actually exports the 0.30 gated hook. */
export function hasGatedHook(): boolean {
  return typeof ns.useGatedImages === 'function';
}

/**
 * A hook returning normalised {@link GatedImagesState} for a set of image ids.
 * NEVER hand back raw URLs the app holds itself — the gated read is the
 * per-viewer moderation boundary, so a hidden image yields `{status:'hidden'}`
 * with no url. When 0.30 is absent, every id resolves to hidden (fail-closed)
 * and `loading:false`.
 */
export function useGatedImagesState(imageIds: number[]): GatedImagesState {
  const real = ns.useGatedImages as GatedHook | undefined;
  if (real) {
    const ret = real(imageIds);
    if (Array.isArray(ret)) return { images: ret, loading: false };
    return { images: ret.images ?? [], loading: ret.loading ?? false };
  }
  // Fail-closed: no gated read available → treat every id as hidden.
  return {
    images: imageIds.map((imageId) => ({ imageId, status: 'hidden' as const, reason: 'gated read unavailable' })),
    loading: false,
  };
}

/**
 * The injectable render seam for a gated grid cell. The App wires the default
 * (backed by {@link useGatedImagesState}); tests inject a fake ComponentType so
 * the visible / hidden / empty paths are driven deterministically without the
 * real hook. Keeping this a COMPONENT (not a bare function) respects the rules
 * of hooks — the gated hook is called once per mounted cell, not per app render.
 */
export type GatedCellComponent = ComponentType<{ imageIds: number[]; label?: string }>;
