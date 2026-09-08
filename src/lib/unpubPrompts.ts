// The PROMPT half of the unpublished → published boundary (spec §11.1). The rule
// itself lives in ./unpublished.ts and is shared with matchups; this file
// contributes only the prompt-shaped record and its storage prefix.
//
// 🔴 THE PREFIX IS NEW AND DISJOINT FROM `draft:v1:` ON PURPOSE. §11.1 fixes it
// as `unpub:prompt:v1:` precisely so `list({prefix})` still narrows cleanly to
// exactly one object type — the matchup prefix could not be reused, and the
// matchup prefix could not be renamed to match (live viewers hold records under
// it). Two prefixes, one rule.
//
// The shared payload for a publish is built by `buildPromptPayload` in
// ./benchmark.ts — unchanged, so a published record is byte-identical to a row
// submitted directly, including `data.kind: 'prompt'` and the moderation split
// (user-authored text in `title`/`body`, structure only in `data`).

import type {
  PromptDefault,
  PromptOverride,
  PublishedPointer,
  UnpublishedPrompt,
  UnpublishedPromptRecord,
} from '../types.js';
import { sanitizeParams, type PromptInput } from './benchmark.js';
import {
  isPublished,
  newLocalId,
  parseUnpublished,
  sortUnpublished,
  unpublishedKey,
} from './unpublished.js';

/** The per-viewer KV key PREFIX every unpublished prompt lives under (§11.1). */
export const UNPUB_PROMPT_PREFIX = 'unpub:prompt:v1:';

/** The storage key for one unpublished prompt. */
export function unpubPromptKey(localId: string): string {
  return unpublishedKey(UNPUB_PROMPT_PREFIX, localId);
}

/** A fresh local id (per-viewer and app-chosen — NOT a shared key). */
export function newUnpubPromptLocalId(): string {
  return newLocalId('unpubprompt');
}

/** Has this record been published? (i.e. is it now a pointer at a shared row?) */
export function isPublishedPrompt(rec: UnpublishedPromptRecord): rec is PublishedPointer {
  return isPublished(rec);
}

/** Build the stored shape of an UNPUBLISHED prompt from the form input. */
export function buildUnpubPrompt(
  localId: string,
  input: PromptInput,
  now: Date = new Date(),
): UnpublishedPrompt {
  const def: PromptDefault = {
    prompt: (input.default?.prompt ?? '').trim(),
    params: sanitizeParams(input.default?.params),
  };
  const overrides: Record<string, PromptOverride> = {};
  for (const [eco, raw] of Object.entries(input.overrides ?? {})) {
    if (!raw) continue;
    overrides[eco] = {
      ...(raw.prompt !== undefined ? { prompt: raw.prompt } : {}),
      ...(raw.params !== undefined ? { params: { ...raw.params } } : {}),
    };
  }
  return {
    v: 1,
    localId,
    name: input.name.trim(),
    description: input.description.trim(),
    default: def,
    ...(Object.keys(overrides).length > 0 ? { overrides } : {}),
    updatedAt: now.toISOString(),
  };
}

/** Turn an unpublished prompt back into a form input (for edit-in-place). */
export function unpubPromptToInput(rec: UnpublishedPrompt): PromptInput {
  const overrides: Record<string, PromptOverride> = {};
  for (const [eco, ov] of Object.entries(rec.overrides ?? {})) {
    overrides[eco] = {
      ...(ov.prompt !== undefined ? { prompt: ov.prompt } : {}),
      ...(ov.params !== undefined ? { params: { ...ov.params } } : {}),
    };
  }
  return {
    name: rec.name,
    description: rec.description,
    default: { prompt: rec.default.prompt, params: { ...rec.default.params } },
    overrides,
  };
}

/**
 * Defensive parse of one stored KV value into a prompt record. A row carrying a
 * `sharedKey` parses as a POINTER (that branch lives in the shared core).
 *
 * A body with no usable default prompt is DROPPED, mirroring the matchup parse's
 * "no usable config" rule: the default is what makes a prompt runnable on every
 * ecosystem, so a record without one could neither be rendered honestly nor
 * published into a usable row.
 */
export function parseUnpubPrompt(raw: unknown): UnpublishedPromptRecord | null {
  return parseUnpublished<UnpublishedPrompt>(raw, (d, localId) => {
    const rawDefault = d.default as { prompt?: unknown; params?: unknown } | undefined;
    const prompt = typeof rawDefault?.prompt === 'string' ? rawDefault.prompt : '';
    if (!prompt.trim()) return null;
    const overrides: Record<string, PromptOverride> = {};
    const rawOverrides = d.overrides;
    if (rawOverrides && typeof rawOverrides === 'object') {
      for (const [eco, ov] of Object.entries(rawOverrides as Record<string, unknown>)) {
        if (!ov || typeof ov !== 'object') continue;
        const o = ov as PromptOverride;
        overrides[eco] = {
          ...(typeof o.prompt === 'string' ? { prompt: o.prompt } : {}),
          ...(o.params && typeof o.params === 'object' ? { params: sanitizeParams(o.params) } : {}),
        };
      }
    }
    return {
      v: 1,
      localId,
      name: typeof d.name === 'string' ? d.name : '',
      description: typeof d.description === 'string' ? d.description : '',
      default: { prompt, params: sanitizeParams(rawDefault?.params as never) },
      ...(Object.keys(overrides).length > 0 ? { overrides } : {}),
      updatedAt: typeof d.updatedAt === 'string' ? d.updatedAt : '',
    };
  });
}

/** Newest-edited first, then by localId so the order is deterministic. */
export function sortUnpubPrompts(recs: UnpublishedPromptRecord[]): UnpublishedPromptRecord[] {
  return sortUnpublished(recs);
}
