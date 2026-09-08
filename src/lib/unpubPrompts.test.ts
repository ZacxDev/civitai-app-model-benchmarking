// The PROMPT half of the unpublished → published boundary, and the shared core
// it delegates to (spec §11.1). The end-to-end behaviour is pinned in
// `src/myCommunity.test.tsx`; this file pins the stored shape.

import { describe, expect, it } from 'vitest';

import type { PromptInput } from './benchmark.js';
import {
  buildUnpubPrompt,
  isPublishedPrompt,
  newUnpubPromptLocalId,
  parseUnpubPrompt,
  sortUnpubPrompts,
  UNPUB_PROMPT_PREFIX,
  unpubPromptKey,
  unpubPromptToInput,
} from './unpubPrompts.js';
import { DRAFT_PREFIX } from './drafts.js';
import { parsePointer, publishedPointer } from './unpublished.js';
import type { UnpublishedPrompt } from '../types.js';

const input = (over: Partial<PromptInput> = {}): PromptInput => ({
  name: '  Dawn street  ',
  description: '  a quiet one  ',
  default: { prompt: '  a quiet street at dawn  ', params: { steps: 30, cfgScale: 5 } },
  overrides: {},
  ...over,
});

describe('unpublished prompts live under their own app-chosen prefix', () => {
  it('is the prefix §11.1 fixes, written out as a literal', () => {
    expect(UNPUB_PROMPT_PREFIX).toBe('unpub:prompt:v1:');
    expect(unpubPromptKey('abc')).toBe('unpub:prompt:v1:abc');
  });

  it('🔴 is DISJOINT from the matchup prefix, in both directions', () => {
    // The whole reason §11.1 chose a new prefix instead of reusing the historical
    // one: `list({prefix})` must narrow to exactly one object type. If either
    // prefix were a prefix of the other, one object's listing would sweep up the
    // other's records — and the withdraw-time pointer sweep would delete across
    // surfaces.
    expect(UNPUB_PROMPT_PREFIX.startsWith(DRAFT_PREFIX)).toBe(false);
    expect(DRAFT_PREFIX.startsWith(UNPUB_PROMPT_PREFIX)).toBe(false);
  });

  it('mints a distinct local id per record', () => {
    expect(newUnpubPromptLocalId()).not.toBe(newUnpubPromptLocalId());
    expect(unpubPromptKey(newUnpubPromptLocalId()).startsWith(UNPUB_PROMPT_PREFIX)).toBe(true);
  });
});

describe('buildUnpubPrompt', () => {
  it('stores the whole editable prompt, trimmed, with a timestamp', () => {
    const rec = buildUnpubPrompt('l1', input(), new Date('2026-09-07T12:00:00.000Z'));
    expect(rec).toMatchObject({
      v: 1,
      localId: 'l1',
      name: 'Dawn street',
      description: 'a quiet one',
      updatedAt: '2026-09-07T12:00:00.000Z',
    });
    expect(rec.default.prompt).toBe('a quiet street at dawn');
    expect(rec.default.params).toEqual({ steps: 30, cfgScale: 5 });
  });

  it('omits `overrides` entirely when there are none, and keeps them when there are', () => {
    expect(buildUnpubPrompt('l1', input())).not.toHaveProperty('overrides');
    const withOv = buildUnpubPrompt(
      'l1',
      input({ overrides: { SDXL: { prompt: 'sdxl variant' } } }),
    );
    expect(withOv.overrides).toEqual({ SDXL: { prompt: 'sdxl variant' } });
  });

  it('round-trips through unpubPromptToInput for edit-in-place', () => {
    const rec = buildUnpubPrompt('l1', input({ overrides: { Flux: { params: { steps: 8 } } } }));
    const back = unpubPromptToInput(rec);
    expect(back.name).toBe('Dawn street');
    expect(back.default.prompt).toBe('a quiet street at dawn');
    expect(back.overrides).toEqual({ Flux: { params: { steps: 8 } } });
    // A copy, not the stored object — an edit in the form must not mutate storage.
    expect(back.default.params).not.toBe(rec.default.params);
  });
});

describe('parseUnpubPrompt is defensive about the stored value', () => {
  it('parses what buildUnpubPrompt writes', () => {
    const rec = buildUnpubPrompt('l1', input());
    expect(parseUnpubPrompt(rec)).toEqual(rec);
  });

  it('drops a record with no usable default prompt', () => {
    // The default is what makes a prompt runnable on every ecosystem, so a record
    // without one could be neither rendered honestly nor published into a usable
    // row — the mirror of the matchup parse's "no usable config" rule.
    expect(parseUnpubPrompt({ v: 1, localId: 'l1', default: { prompt: '   ' } })).toBeNull();
    expect(parseUnpubPrompt({ v: 1, localId: 'l1' })).toBeNull();
  });

  it('drops a value of the wrong version, or with no local id', () => {
    expect(parseUnpubPrompt({ v: 2, localId: 'l1', default: { prompt: 'x' } })).toBeNull();
    expect(parseUnpubPrompt({ v: 1, localId: '', default: { prompt: 'x' } })).toBeNull();
    expect(parseUnpubPrompt(null)).toBeNull();
    expect(parseUnpubPrompt('nope')).toBeNull();
  });

  it('🔴 reads a POINTER as a pointer even when a stale body is still attached', () => {
    // The pointer is the newer shape and wins — otherwise a published record with
    // leftover fields would render as editable and be publishable twice.
    const parsed = parseUnpubPrompt({
      v: 1,
      localId: 'l1',
      sharedKey: 'fk_1',
      submittedAt: 'ts',
      default: { prompt: 'stale' },
    });
    expect(parsed).toEqual({ v: 1, localId: 'l1', sharedKey: 'fk_1', submittedAt: 'ts' });
    expect(isPublishedPrompt(parsed!)).toBe(true);
  });

  it('treats an unpublished body as NOT published', () => {
    expect(isPublishedPrompt(buildUnpubPrompt('l1', input()))).toBe(false);
  });
});

describe('sortUnpubPrompts', () => {
  it('puts the newest-touched first, tie-broken by localId', () => {
    const a = buildUnpubPrompt('a', input(), new Date('2026-09-01T00:00:00.000Z'));
    const b = buildUnpubPrompt('b', input(), new Date('2026-09-05T00:00:00.000Z'));
    const c = publishedPointer('c', 'fk_1', new Date('2026-09-09T00:00:00.000Z'));
    expect(sortUnpubPrompts([a, b, c]).map((r) => r.localId)).toEqual(['c', 'b', 'a']);
  });
});

describe('the shared pointer parse', () => {
  it('reads a pointer and refuses a body, so a sweep can never delete an unpublished record', () => {
    // 🔴 `clearPointerFor` deletes what this returns. A body reading as a pointer
    // would let a withdraw destroy a record the viewer has not published.
    expect(parsePointer({ v: 1, localId: 'l1', sharedKey: 'fk_1', submittedAt: 'ts' })).toEqual({
      v: 1,
      localId: 'l1',
      sharedKey: 'fk_1',
      submittedAt: 'ts',
    });
    expect(parsePointer(buildUnpubPrompt('l1', input()) as UnpublishedPrompt)).toBeNull();
    expect(parsePointer({ v: 1, localId: 'l1', sharedKey: '' })).toBeNull();
  });
});
