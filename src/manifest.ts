// Manifest loading + validation.
//
// The committed `block.manifest.json` is a PAGE-APP SOURCE manifest: it declares
// `page`, `scopes` etc. but OMITS `appId`, `targets`, and `iframe.src` — the
// platform injects those at deploy/serve time. The SDK's `defineBlock` validates
// the FULL runtime shape, so to get a real `defineBlock` gate we augment the
// source manifest to the full shape before validating.

import { defineBlock } from '@civitai/app-sdk/blocks';
import type { BlockManifest } from '@civitai/app-sdk/blocks';

import rawManifest from '../block.manifest.json';

/** The raw committed manifest (page-app source shape). */
export const manifest = rawManifest as unknown as Record<string, unknown>;

export class ManifestValidationError extends Error {
  override readonly name = 'ManifestValidationError';
}

/**
 * Augment the page-app source manifest to the full `BlockManifest` runtime shape
 * (adding the platform-injected `appId`, `targets`, `iframe.src`) and run the
 * SDK's `defineBlock`. Returns the validated (augmented) manifest; throws on any
 * violation.
 */
export function validateManifest(source: Record<string, unknown> = manifest): BlockManifest {
  const iframeSource = (source.iframe ?? {}) as Record<string, unknown>;

  const augmented = {
    ...(source as object),
    // Platform-injected at deploy time; placeholders for local validation.
    appId: (source.appId as string) ?? 'app_local_model_benchmarking',
    // Page apps have no manifest `targets`; the platform derives an `app.page`
    // target from `page`. Synthesize one so defineBlock's required-field check
    // passes.
    targets: (source.targets as unknown[]) ?? [{ slotId: 'app.page', priority: 100 }],
    iframe: {
      ...iframeSource,
      src: (iframeSource.src as string) ?? 'https://model-benchmarking.civit.ai/',
    },
  } as BlockManifest;

  return defineBlock({ manifest: augmented });
}

/** The `page.buzzBudgetPerGen` declared in the source manifest. */
export function manifestBuzzBudgetPerGen(
  source: Record<string, unknown> = manifest,
): number | undefined {
  const page = source.page as Record<string, unknown> | undefined;
  const v = page?.buzzBudgetPerGen;
  return typeof v === 'number' ? v : undefined;
}
