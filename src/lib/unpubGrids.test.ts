// The PRIVATE half of a grid: the per-viewer record under `unpub:grid:v1:`, its
// build/parse round trip, and the pointer it becomes on publish.
//
// 🔴 WHAT THESE PIN: the record survives a round trip through the store well
// enough that an edit re-opens on what the author actually saved, the prefix is
// disjoint from the other two publishable objects, and a stored blob from an
// older or forged build degrades rather than crashing the My list.

import { describe, expect, it } from 'vitest';

import { DRAFT_PREFIX } from './drafts.js';
import { UNPUB_GRID_PREFIX, unpubGridKey } from './grids.js';
import { UNPUB_PROMPT_PREFIX } from './unpubPrompts.js';
import { publishedPointer } from './unpublished.js';
import {
  buildUnpubGrid,
  isPublishedGrid,
  parseUnpubGrid,
  sortUnpubGrids,
  unpubGridToInput,
} from './unpubGrids.js';

const AT = new Date('2026-09-07T11:22:33.000Z');

describe('the unpublished-grid record', () => {
  it('stores name, description and the two authored key lists, trimmed', () => {
    const rec = buildUnpubGrid(
      'gl-77',
      {
        name: '  Sharpness sweep  ',
        description: '  four checkpoints, three prompts  ',
        matchupKeys: ['mk-alpha', 'mk-echo'],
        promptKeys: ['qk-tango'],
      },
      AT,
    );

    expect(rec).toEqual({
      v: 1,
      localId: 'gl-77',
      name: 'Sharpness sweep',
      description: 'four checkpoints, three prompts',
      matchupKeys: ['mk-alpha', 'mk-echo'],
      promptKeys: ['qk-tango'],
      updatedAt: '2026-09-07T11:22:33.000Z',
    });
  });

  it('preserves AUTHORED order and de-duplicates, first occurrence winning', () => {
    const rec = buildUnpubGrid(
      'gl-78',
      {
        name: 'n',
        description: '',
        // Reverse-alphabetical on purpose, with a repeat in the middle: a `Set`
        // round trip or a sort would both change this answer.
        matchupKeys: ['mk-zulu', 'mk-alpha', 'mk-zulu', 'mk-mike'],
        promptKeys: ['qk-yankee', ' qk-yankee ', 'qk-bravo'],
      },
      AT,
    );
    expect(rec.matchupKeys).toEqual(['mk-zulu', 'mk-alpha', 'mk-mike']);
    expect(rec.promptKeys).toEqual(['qk-yankee', 'qk-bravo']);
  });

  it('🔴 does NOT cap the authored lists — the cap belongs at publish', () => {
    // `grids.ts` caps at 20 when it BUILDS THE PAYLOAD, which is right for a
    // payload. Truncating a record a human is still editing would silently drop
    // members they can still see and still remove; `validateGrid` reports the
    // overflow instead. 23 entries in, 23 entries out.
    const many = Array.from({ length: 23 }, (_, i) => `mk-${i}`);
    const rec = buildUnpubGrid('gl-79', { name: 'n', description: '', matchupKeys: many, promptKeys: ['qk-tango'] }, AT);
    expect(rec.matchupKeys).toHaveLength(23);
  });

  it('round-trips through the store into an editable input', () => {
    const input = {
      name: 'Sharpness sweep',
      description: 'a note',
      matchupKeys: ['mk-zulu', 'mk-alpha'],
      promptKeys: ['qk-tango', 'qk-whisky'],
    };
    const stored = JSON.parse(JSON.stringify(buildUnpubGrid('gl-80', input, AT)));
    const parsed = parseUnpubGrid(stored);
    expect(parsed).not.toBeNull();
    expect(isPublishedGrid(parsed!)).toBe(false);
    expect(unpubGridToInput(parsed as never)).toEqual(input);
  });

  it('the input it hands back is a COPY — editing it cannot mutate the record', () => {
    const rec = buildUnpubGrid('gl-81', { name: 'n', description: '', matchupKeys: ['mk-alpha'], promptKeys: ['qk-tango'] }, AT);
    const input = unpubGridToInput(rec);
    input.matchupKeys.push('mk-injected');
    expect(rec.matchupKeys).toEqual(['mk-alpha']);
  });
});

describe('parsing a stored blob defensively', () => {
  it('drops junk entries rather than throwing', () => {
    const parsed = parseUnpubGrid({
      v: 1,
      localId: 'gl-82',
      name: 'n',
      description: '',
      matchupKeys: ['mk-alpha', 42, null, '', '   ', 'mk-echo'],
      promptKeys: ['qk-tango', { nope: true }],
      updatedAt: '',
    });
    expect(parsed).not.toBeNull();
    expect((parsed as { matchupKeys: string[] }).matchupKeys).toEqual(['mk-alpha', 'mk-echo']);
    expect((parsed as { promptKeys: string[] }).promptKeys).toEqual(['qk-tango']);
  });

  it('drops a record with NO usable member on either axis', () => {
    expect(
      parseUnpubGrid({ v: 1, localId: 'gl-83', name: 'n', matchupKeys: [], promptKeys: [] }),
    ).toBeNull();
    expect(
      parseUnpubGrid({ v: 1, localId: 'gl-84', name: 'n', matchupKeys: [7], promptKeys: 'nope' }),
    ).toBeNull();
  });

  it('🔴 KEEPS a record that still has ONE axis — it is editable, not garbage', () => {
    // The author picked rows and has not picked columns yet. `validateGrid`
    // blocks the publish; dropping the record here would silently delete work.
    const parsed = parseUnpubGrid({
      v: 1,
      localId: 'gl-85',
      name: 'half-built',
      matchupKeys: ['mk-alpha'],
      promptKeys: [],
    });
    expect(parsed).not.toBeNull();
    expect((parsed as { promptKeys: string[] }).promptKeys).toEqual([]);
  });

  it('rejects a non-object, a wrong version and a missing localId', () => {
    expect(parseUnpubGrid(null)).toBeNull();
    expect(parseUnpubGrid('nope')).toBeNull();
    expect(parseUnpubGrid({ v: 2, localId: 'gl-86', matchupKeys: ['mk-alpha'], promptKeys: ['qk-tango'] })).toBeNull();
    expect(parseUnpubGrid({ v: 1, matchupKeys: ['mk-alpha'], promptKeys: ['qk-tango'] })).toBeNull();
  });

  it('reads a PUBLISHED record back as a pointer, and the pointer wins over a stale body', () => {
    const pointer = publishedPointer('gl-87', 'shared_zzz', AT);
    const parsed = parseUnpubGrid(pointer);
    expect(parsed).not.toBeNull();
    expect(isPublishedGrid(parsed!)).toBe(true);
    expect((parsed as { sharedKey: string }).sharedKey).toBe('shared_zzz');

    // A record carrying BOTH is a pointer: the pointer is the newer shape.
    const both = parseUnpubGrid({ ...pointer, matchupKeys: ['mk-alpha'], promptKeys: ['qk-tango'] });
    expect(isPublishedGrid(both!)).toBe(true);
  });
});

describe('the storage prefix', () => {
  it('is `unpub:grid:v1:` and is DISJOINT from the other two objects', () => {
    expect(UNPUB_GRID_PREFIX).toBe('unpub:grid:v1:');
    expect(unpubGridKey('gl-88')).toBe('unpub:grid:v1:gl-88');
    // 🔴 Disjoint is what keeps `list({prefix})` narrowing to one object kind,
    // and what keeps a grid withdraw from ever reaching a matchup's pointer.
    expect(UNPUB_GRID_PREFIX.startsWith(DRAFT_PREFIX)).toBe(false);
    expect(DRAFT_PREFIX.startsWith(UNPUB_GRID_PREFIX)).toBe(false);
    expect(UNPUB_GRID_PREFIX.startsWith(UNPUB_PROMPT_PREFIX)).toBe(false);
    expect(UNPUB_PROMPT_PREFIX.startsWith(UNPUB_GRID_PREFIX)).toBe(false);
  });
});

describe('ordering the My list', () => {
  it('is newest-edited first, then by localId', () => {
    const older = buildUnpubGrid('gl-b', { name: 'b', description: '', matchupKeys: ['mk-alpha'], promptKeys: ['qk-tango'] }, new Date('2026-09-01T00:00:00.000Z'));
    const newer = buildUnpubGrid('gl-a', { name: 'a', description: '', matchupKeys: ['mk-echo'], promptKeys: ['qk-whisky'] }, new Date('2026-09-05T00:00:00.000Z'));
    const tieA = buildUnpubGrid('gl-c', { name: 'c', description: '', matchupKeys: ['mk-echo'], promptKeys: ['qk-whisky'] }, new Date('2026-09-05T00:00:00.000Z'));

    // Input order is neither the answer nor its reverse.
    const sorted = sortUnpubGrids([tieA, older, newer]).map((r) => r.localId);
    expect(sorted).toEqual(['gl-a', 'gl-c', 'gl-b']);
  });
});
