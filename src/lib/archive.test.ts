// The archive store's pure core (spec §11.3). The BEHAVIOUR — that archiving
// removes a row from My and from nowhere else, and that the UI says so — is
// pinned end-to-end in `src/myCommunity.test.tsx`; this file pins the value
// handling underneath it.

import { describe, expect, it } from 'vitest';

import { ARCHIVE_KEY, ARCHIVE_NOTE, parseArchive, withArchived, withoutArchived } from './archive.js';

describe('the archive lives under one per-viewer key', () => {
  it('is the key §11.3 fixes, written out as a literal', () => {
    expect(ARCHIVE_KEY).toBe('archive:v1');
  });
});

describe('parseArchive degrades toward SHOWING rows, never hiding them', () => {
  it('reads a list of shared keys', () => {
    expect(parseArchive(['a', 'b'])).toEqual(['a', 'b']);
  });

  it('drops non-string and empty entries rather than rejecting the whole list', () => {
    expect(parseArchive(['a', 1, null, '', { k: 'b' }, 'c'])).toEqual(['a', 'c']);
  });

  it('de-duplicates, preserving first-seen order', () => {
    expect(parseArchive(['b', 'a', 'b'])).toEqual(['b', 'a']);
  });

  it('reads anything that is not an array as NOTHING archived', () => {
    // 🔴 THE DIRECTION MATTERS. A malformed blob must fail toward showing MORE of
    // the viewer's own rows; failing the other way would hide a viewer's own work
    // because of a value they cannot see or repair.
    for (const bad of [null, undefined, 'a', 42, { a: 1 }]) {
      expect(parseArchive(bad)).toEqual([]);
    }
  });
});

describe('withArchived / withoutArchived', () => {
  it('appends, preserving order, and is idempotent', () => {
    expect(withArchived(['a'], 'b')).toEqual(['a', 'b']);
    expect(withArchived(['a', 'b'], 'b')).toEqual(['a', 'b']);
  });

  it('removes exactly the named key, and is idempotent', () => {
    expect(withoutArchived(['a', 'b'], 'a')).toEqual(['b']);
    expect(withoutArchived(['b'], 'a')).toEqual(['b']);
  });

  it('returns a NEW array both ways, so a caller cannot mutate stored state', () => {
    const before = ['a'];
    expect(withArchived(before, 'b')).not.toBe(before);
    expect(withoutArchived(before, 'a')).not.toBe(before);
    expect(before).toEqual(['a']);
  });
});

describe('the honest wording', () => {
  it('says what archiving does NOT do, in three separate claims', () => {
    // 🔴 Not a keyword check on "archive": the failure mode is a sentence that
    // reads as removal, so each of the three facts the code can back is asserted
    // — the row stays on the board, it stays in Community, and it keeps its votes
    // — plus the pointer to the one control that IS a delete.
    expect(ARCHIVE_NOTE).toContain('hides a row from your My list');
    expect(ARCHIVE_NOTE).toContain('stays on the shared board');
    expect(ARCHIVE_NOTE).toContain('stays in Community for everyone including you');
    expect(ARCHIVE_NOTE).toContain('keeps its votes');
    expect(ARCHIVE_NOTE).toContain('Remove is the only action');
  });

  it('never claims the row was removed or hidden from anyone else', () => {
    expect(ARCHIVE_NOTE).not.toMatch(/\bremoved\b/i);
    expect(ARCHIVE_NOTE).not.toMatch(/\bdeleted?\b/i);
    expect(ARCHIVE_NOTE).not.toMatch(/hidden from (everyone|others)/i);
  });
});
