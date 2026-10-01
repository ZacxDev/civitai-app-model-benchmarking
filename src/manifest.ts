// Manifest loading + validation.
//
// The committed `block.manifest.json` is a PAGE-APP SOURCE manifest: it declares
// `page`, `scopes` etc. but OMITS `appId`, `targets`, and `iframe.src` — the
// platform injects those at deploy/serve time.
//
// ── ⚠️ THE AUGMENTATION IS GONE, AND IT WAS NOT A SIMPLIFICATION ─────────────
//
// This file used to synthesize `appId`, `targets` and `iframe.src` onto the source
// manifest before validating, because `@civitai/app-sdk@0.42.0`'s `defineBlock` was
// a HAND-WRITTEN mirror of the canonical schema that required all three. The
// `app-sdk@0.54.0` bump replaced that mirror with the canonical schema itself
// (`schemas/app-block/v1.json`, compiled with Ajv), and it moved the FOUR ways that
// matter here:
//
//   1. `required` is now the canonical's five fields — `blockId`, `version`, `name`,
//      `contentRating`, `scopes` — all of which the committed manifest already has.
//      So `targets` is no longer required and the synthesized `app.page` target is
//      not merely unnecessary, it describes a target this app does not declare.
//   2. `appId` is not a schema property at all. The canonical top level is not
//      `additionalProperties: false`, so adding it was accepted and meant nothing.
//   3. 🔴 `iframe.src` is now REJECTED when present (`SCHEMA_DIVERGENCES['iframe.src']`
//      — the platform stamps it at approve time and refuses one in a submission). So
//      the old augmentation would make this gate FAIL on a manifest the platform
//      accepts. Keeping the augmentation was the defect; removing it is the fix.
//   4. `defineBlock` moved to the NODE-ONLY `@civitai/app-sdk/manifest` subpath,
//      because it reads the vendored schema with `node:fs` and compiles it with Ajv
//      (an optional peer — hence the `ajv` devDependency). `./blocks` keeps zero
//      runtime dependencies so it can ship into the sandboxed iframe.
//
// This module is already test-only (`manifest.test.ts` is its only importer, and
// `sourceScanLedger.test.ts`'s ledger asserts it is outside `main.tsx`'s graph), so
// the node-only subpath costs the browser bundle nothing.
//
// ⚠️ PASSING THIS IS NECESSARY, NOT SUFFICIENT. `defineBlock`'s own `KNOWN_GAPS`
// names what only the server can check; `civitai app validate` (the Go CLI) is the
// pre-submit gate.

import { defineBlock } from '@civitai/app-sdk/manifest';
import type { BlockManifest } from '@civitai/app-sdk/blocks';

import rawManifest from '../block.manifest.json';

/** The raw committed manifest (page-app source shape). */
export const manifest = rawManifest as unknown as Record<string, unknown>;

export class ManifestValidationError extends Error {
  override readonly name = 'ManifestValidationError';
}

/**
 * Validate the committed manifest against the canonical schema and return it.
 *
 * 🔴 THE SOURCE IS PASSED THROUGH UNCHANGED — see the header for the four schema
 * moves that made the old augmentation wrong rather than redundant. The bytes
 * validated here are the bytes `civitai app submit` packages, which is the only
 * version of this gate worth having.
 */
export function validateManifest(source: Record<string, unknown> = manifest): BlockManifest {
  return defineBlock({ manifest: source as unknown as BlockManifest });
}

/** The `page.buzzBudgetPerGen` declared in the source manifest. */
export function manifestBuzzBudgetPerGen(
  source: Record<string, unknown> = manifest,
): number | undefined {
  const page = source.page as Record<string, unknown> | undefined;
  const v = page?.buzzBudgetPerGen;
  return typeof v === 'number' ? v : undefined;
}
