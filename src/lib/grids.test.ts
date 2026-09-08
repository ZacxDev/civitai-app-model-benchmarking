// The pure `grid` record kind (docs/matchups.md §11.1/§11.2). These cover the
// wire shape that §11.2 calls effectively permanent: the moderation split (name
// and description NEVER in the unmoderated `data` blob), the three normalization
// rules (order preserved, keys de-duplicated, 20×20 cap), every malformed-row
// rejection path, and the dangling-reference resolver that §11.2 requires to
// render what survives plus an honest missing count.

import { describe, expect, it } from 'vitest';

import type { GridData } from '../types.js';
import type { RawSharedItem } from './benchmark.js';
import { DRAFT_PREFIX } from './drafts.js';
import {
  buildGridPayload,
  gridToInput,
  MAX_GRID_MATCHUPS,
  MAX_GRID_PROMPTS,
  newGridLocalId,
  parseGrid,
  resolveGrid,
  resolveMembers,
  unpubGridKey,
  UNPUB_GRID_PREFIX,
  validateGrid,
  type GridInput,
} from './grids.js';

// Fixture keys are pairwise distinct, and distinct from every constant these
// assertions name (20, the prefixes, the kind strings) — a fixture that could
// only ever produce a constant's own value cannot see a hardcoding mutant.
const MK = ['mk-alpha', 'mk-bravo', 'mk-charlie', 'mk-delta'] as const;
const PK = ['pk-echo', 'pk-foxtrot', 'pk-golf'] as const;

/** n distinct keys under a prefix, e.g. seq('mk', 3) → mk-000, mk-001, mk-002. */
const seq = (prefix: string, n: number): string[] =>
  Array.from({ length: n }, (_, i) => `${prefix}-${String(i).padStart(3, '0')}`);

const input = (over: Partial<GridInput> = {}): GridInput => ({
  name: 'Anime checkpoints, hard prompts',
  description: 'Four matchups against three prompts.',
  matchupKeys: [...MK.slice(0, 2)],
  promptKeys: [...PK.slice(0, 2)],
  ...over,
});

/** A shared row as `list()` hands it back, wrapping an arbitrary `data` blob. */
const item = (data: unknown, over: Partial<RawSharedItem> = {}): RawSharedItem => ({
  key: 'shared-key-gr7',
  count: 9,
  authorUserId: 8753561,
  viewerVoted: false,
  value: { title: 'Anime checkpoints, hard prompts', body: 'Four matchups against three prompts.', data },
  ...over,
} as RawSharedItem);

const gridData = (over: Partial<GridData> = {}): GridData => ({
  v: 1,
  kind: 'grid',
  matchupKeys: [...MK.slice(0, 3)],
  promptKeys: [...PK.slice(0, 2)],
  ...over,
});

// ---------------------------------------------------------------------------

describe('unpublished grids live under their own per-viewer prefix (§11.1)', () => {
  it('uses the spec-fixed prefix and builds keys under it', () => {
    expect(UNPUB_GRID_PREFIX).toBe('unpub:grid:v1:');
    expect(unpubGridKey('abc')).toBe('unpub:grid:v1:abc');
    expect(unpubGridKey(newGridLocalId()).startsWith(UNPUB_GRID_PREFIX)).toBe(true);
  });

  it('🔴 leaves the historical draft:v1: prefix alone, and stays disjoint from it', () => {
    // Real viewers hold matchup records under `draft:v1:` today; renaming it
    // orphans them. Disjoint prefixes are what keep list({prefix}) narrowing.
    expect(DRAFT_PREFIX).toBe('draft:v1:');
    expect(UNPUB_GRID_PREFIX.startsWith(DRAFT_PREFIX)).toBe(false);
    expect(DRAFT_PREFIX.startsWith(UNPUB_GRID_PREFIX)).toBe(false);
  });

  it('mints a distinct local id per grid', () => {
    expect(newGridLocalId()).not.toBe(newGridLocalId());
  });
});

describe('buildGridPayload — the moderation split (§11.2)', () => {
  it('🔴 puts the name and description in title/body and NEVER in data', () => {
    const nameText = 'Sentinel-NAME-qx';
    const descText = 'Sentinel-DESC-qz';
    const payload = buildGridPayload(input({ name: nameText, description: descText }));

    expect(payload.title).toBe(nameText);
    expect(payload.body).toBe(descText);

    const blob = JSON.stringify(payload.data);
    expect(blob).not.toContain(nameText);
    expect(blob).not.toContain(descText);

    // Positive control: the same substring search DOES find both sentinels when
    // pointed at the whole payload — so the two `not.toContain`s above are a
    // claim about `data`, not about a search that can never match.
    const whole = JSON.stringify(payload);
    expect(whole).toContain(nameText);
    expect(whole).toContain(descText);
  });

  it('trims the moderated text and stamps v:1 + kind:grid', () => {
    const payload = buildGridPayload(input({ name: '  Spaced name  ', description: '  Spaced desc  ' }));
    expect(payload.title).toBe('Spaced name');
    expect(payload.body).toBe('Spaced desc');
    expect(payload.data).toMatchObject({ v: 1, kind: 'grid' });
  });

  it('carries ONLY structure in data — no keys beyond the four the spec fixes', () => {
    const payload = buildGridPayload(input());
    expect(Object.keys(payload.data as object).sort()).toEqual(['kind', 'matchupKeys', 'promptKeys', 'v']);
  });
});

describe('buildGridPayload — order, de-duplication, caps (§11.2)', () => {
  it('preserves the AUTHORED order rather than sorting', () => {
    // Authored order is deliberately NOT lexical, so a stray .sort() is visible.
    const authoredM = [MK[2], MK[0], MK[3], MK[1]];
    const authoredP = [PK[2], PK[0], PK[1]];
    const data = buildGridPayload(input({ matchupKeys: authoredM, promptKeys: authoredP }))
      .data as GridData;
    expect(data.matchupKeys).toEqual(authoredM);
    expect(data.promptKeys).toEqual(authoredP);
    // Guard against the test passing because the fixture happens to be sorted.
    expect(authoredM).not.toEqual([...authoredM].sort());
    expect(authoredP).not.toEqual([...authoredP].sort());
  });

  it('de-duplicates within each array, FIRST occurrence winning', () => {
    const data = buildGridPayload(
      input({
        matchupKeys: [MK[1], MK[0], MK[1], MK[2], MK[0]],
        promptKeys: [PK[2], PK[2], PK[0]],
      }),
    ).data as GridData;
    expect(data.matchupKeys).toEqual([MK[1], MK[0], MK[2]]);
    expect(data.promptKeys).toEqual([PK[2], PK[0]]);
  });

  it('de-duplicates the two arrays INDEPENDENTLY (a key may be in both)', () => {
    // Nothing forbids the same string appearing once per axis; only a repeat
    // WITHIN one axis is the duplicate-row hazard.
    const shared = 'xk-shared-both-axes';
    const data = buildGridPayload(input({ matchupKeys: [shared, MK[0]], promptKeys: [shared, PK[0]] }))
      .data as GridData;
    expect(data.matchupKeys).toEqual([shared, MK[0]]);
    expect(data.promptKeys).toEqual([shared, PK[0]]);
  });

  it('drops non-string and blank entries instead of storing them', () => {
    const data = buildGridPayload(
      input({
        matchupKeys: [MK[0], '', '   ', MK[1]] as string[],
        promptKeys: [null, PK[0], 42, undefined, PK[1]] as unknown as string[],
      }),
    ).data as GridData;
    expect(data.matchupKeys).toEqual([MK[0], MK[1]]);
    expect(data.promptKeys).toEqual([PK[0], PK[1]]);
  });

  it('keeps a list that sits exactly AT the cap', () => {
    expect(MAX_GRID_MATCHUPS).toBe(20);
    expect(MAX_GRID_PROMPTS).toBe(20);
    const data = buildGridPayload(
      input({ matchupKeys: seq('mk', MAX_GRID_MATCHUPS), promptKeys: seq('pk', MAX_GRID_PROMPTS) }),
    ).data as GridData;
    expect(data.matchupKeys).toHaveLength(MAX_GRID_MATCHUPS);
    expect(data.promptKeys).toHaveLength(MAX_GRID_PROMPTS);
    expect(data.matchupKeys.at(-1)).toBe('mk-019');
    expect(data.promptKeys.at(-1)).toBe('pk-019');
  });

  it('truncates PAST the cap, keeping the first 20 in authored order', () => {
    // 27 and 23 overshoot 20 by different, non-multiple amounts, so an off-by-one
    // or a swapped cap cannot hide behind a fixture sitting on its own boundary.
    const data = buildGridPayload({
      name: 'Over-cap grid',
      description: '',
      matchupKeys: seq('mk', 27),
      promptKeys: seq('pk', 23),
    }).data as GridData;
    expect(data.matchupKeys).toHaveLength(20);
    expect(data.promptKeys).toHaveLength(20);
    expect(data.matchupKeys[0]).toBe('mk-000');
    expect(data.matchupKeys.at(-1)).toBe('mk-019');
    expect(data.matchupKeys).not.toContain('mk-020');
    expect(data.promptKeys.at(-1)).toBe('pk-019');
    expect(data.promptKeys).not.toContain('pk-020');
  });

  it('applies the cap to the DE-DUPLICATED list, not the raw one', () => {
    // 26 raw entries, 6 of them repeats → 20 distinct, which is AT the cap and
    // must survive whole. A cap applied before dedup would keep only 15.
    const distinct = seq('mk', 20);
    const raw = [...distinct.slice(0, 6), ...distinct];
    expect(raw).toHaveLength(26);
    const data = buildGridPayload(input({ matchupKeys: raw })).data as GridData;
    expect(data.matchupKeys).toEqual(distinct);
  });
});

describe('validateGrid', () => {
  it('accepts a well-formed grid', () => {
    expect(validateGrid(input())).toEqual([]);
  });

  it('requires a name', () => {
    expect(validateGrid(input({ name: '   ' }))).toContain('Give the grid a name.');
  });

  it('requires at least one matchup and at least one prompt', () => {
    const errs = validateGrid(input({ matchupKeys: [], promptKeys: ['  '] }));
    expect(errs).toContain('Add at least one matchup (the grid needs a row).');
    expect(errs).toContain('Add at least one prompt (the grid needs a column).');
  });

  it('REPORTS an over-cap list rather than silently truncating it', () => {
    const errs = validateGrid(input({ matchupKeys: seq('mk', 27), promptKeys: seq('pk', 23) }));
    expect(errs).toContain('At most 20 matchups.');
    expect(errs).toContain('At most 20 prompts.');
  });

  it('is quiet at exactly the cap and complains at exactly ONE over it', () => {
    // The overshooting fixture above cannot see a `> cap + 1` off-by-one — only
    // the two values straddling the boundary can, so both are pinned here.
    expect(validateGrid(input({ matchupKeys: seq('mk', 20), promptKeys: seq('pk', 20) }))).toEqual([]);
    const overM = validateGrid(input({ matchupKeys: seq('mk', 21) }));
    expect(overM).toEqual(['At most 20 matchups.']);
    const overP = validateGrid(input({ promptKeys: seq('pk', 21) }));
    expect(overP).toEqual(['At most 20 prompts.']);
  });

  it('counts AFTER de-duplication, so repeats are not a cap violation', () => {
    const distinct = seq('mk', 20);
    expect(validateGrid(input({ matchupKeys: [...distinct, ...distinct.slice(0, 7)] }))).toEqual([]);
  });
});

describe('parseGrid — the round trip', () => {
  it('build → parse returns exactly what was authored', () => {
    const src = input({ matchupKeys: [MK[2], MK[0]], promptKeys: [PK[1], PK[0], PK[2]] });
    const payload = buildGridPayload(src);
    const row = parseGrid(
      item(payload.data, { value: payload, key: 'gk-round-trip', count: 4, authorUserId: 11025902 }),
    );

    expect(row).not.toBeNull();
    expect(row!.key).toBe('gk-round-trip');
    expect(row!.count).toBe(4);
    expect(row!.authorUserId).toBe(11025902);
    expect(row!.name).toBe(src.name);
    expect(row!.description).toBe(src.description);
    expect(row!.data).toEqual({
      v: 1,
      kind: 'grid',
      matchupKeys: [MK[2], MK[0]],
      promptKeys: [PK[1], PK[0], PK[2]],
    });
  });

  it('round-trips a MULTI-LINE description verbatim (body is not a meta line)', () => {
    const description = 'First line of the blurb.\nSecond line of the blurb.';
    const payload = buildGridPayload(input({ description }));
    expect(parseGrid(item(payload.data, { value: payload }))!.description).toBe(description);
  });

  it('survives a build → parse → gridToInput → build round trip unchanged', () => {
    const first = buildGridPayload(input({ matchupKeys: [MK[3], MK[1]], promptKeys: [PK[2]] }));
    const row = parseGrid(item(first.data, { value: first }))!;
    expect(buildGridPayload(gridToInput(row))).toEqual(first);
  });

  it('gridToInput hands back COPIES, so editing the form cannot mutate the row', () => {
    const payload = buildGridPayload(input());
    const row = parseGrid(item(payload.data, { value: payload }))!;
    const form = gridToInput(row);
    form.matchupKeys.push('mk-typed-into-the-form');
    expect(row.data.matchupKeys).not.toContain('mk-typed-into-the-form');
  });

  it('re-normalizes on read: an over-cap / duplicated / junk-laden stored row', () => {
    const row = parseGrid(
      item({
        v: 1,
        kind: 'grid',
        matchupKeys: [MK[1], MK[1], ...seq('mk', 27), null, ''],
        promptKeys: [PK[0], 7, PK[0], PK[1]],
      }),
    );
    expect(row!.data.matchupKeys).toHaveLength(20);
    expect(row!.data.matchupKeys[0]).toBe(MK[1]);
    expect(row!.data.matchupKeys[1]).toBe('mk-000');
    expect(row!.data.promptKeys).toEqual([PK[0], PK[1]]);
  });

  it('defaults missing title/body to empty strings rather than undefined', () => {
    const row = parseGrid(item(gridData(), { value: { data: gridData() } as RawSharedItem['value'] }));
    expect(row!.name).toBe('');
    expect(row!.description).toBe('');
  });
});

describe('parseGrid — every malformed-row rejection path', () => {
  it('rejects a row with no data blob at all', () => {
    expect(parseGrid(item(undefined))).toBeNull();
  });

  it('rejects a null data blob', () => {
    expect(parseGrid(item(null))).toBeNull();
  });

  it('rejects a non-object data blob', () => {
    expect(parseGrid(item('grid'))).toBeNull();
    expect(parseGrid(item(17))).toBeNull();
    expect(parseGrid(item([gridData()]))).toBeNull();
  });

  it('rejects the OTHER three record kinds on the one shared list', () => {
    for (const kind of ['combination', 'prompt', 'result']) {
      expect(parseGrid(item({ ...gridData(), kind }))).toBeNull();
    }
  });

  it('rejects a missing or non-string kind', () => {
    expect(parseGrid(item({ v: 1, matchupKeys: [MK[0]], promptKeys: [PK[0]] }))).toBeNull();
    expect(parseGrid(item({ ...gridData(), kind: 1 }))).toBeNull();
  });

  it('rejects any schema version other than 1', () => {
    for (const v of [0, 2, 3, '1', null, undefined]) {
      expect(parseGrid(item({ ...gridData(), v }))).toBeNull();
    }
  });

  it('rejects a row whose matchupKeys is missing or not an array', () => {
    expect(parseGrid(item({ v: 1, kind: 'grid', promptKeys: [PK[0]] }))).toBeNull();
    expect(parseGrid(item({ ...gridData(), matchupKeys: MK[0] }))).toBeNull();
    expect(parseGrid(item({ ...gridData(), matchupKeys: { 0: MK[0] } }))).toBeNull();
  });

  it('rejects a row whose promptKeys is missing or not an array', () => {
    expect(parseGrid(item({ v: 1, kind: 'grid', matchupKeys: [MK[0]] }))).toBeNull();
    expect(parseGrid(item({ ...gridData(), promptKeys: PK[0] }))).toBeNull();
  });

  it('rejects a row whose arrays are present but EMPTY', () => {
    expect(parseGrid(item({ ...gridData(), matchupKeys: [] }))).toBeNull();
    expect(parseGrid(item({ ...gridData(), promptKeys: [] }))).toBeNull();
  });

  it('rejects a row whose entries are ALL junk (nothing usable survives)', () => {
    expect(parseGrid(item({ ...gridData(), matchupKeys: [null, 3, '', '  '] }))).toBeNull();
    expect(parseGrid(item({ ...gridData(), promptKeys: [{}, false] }))).toBeNull();
  });

  it('does NOT reject a grid merely because some entries were junk', () => {
    const row = parseGrid(item({ ...gridData(), matchupKeys: [null, MK[3], ''] }));
    expect(row!.data.matchupKeys).toEqual([MK[3]]);
  });
});

describe('resolveMembers / resolveGrid — dangling references are NORMAL (§11.2)', () => {
  const onBoard = (...keys: string[]): ReadonlySet<string> => new Set(keys);

  it('returns every member when NONE are missing, in authored order', () => {
    const authored = [MK[2], MK[0], MK[1]];
    const res = resolveMembers(authored, onBoard(MK[0], MK[1], MK[2], 'mk-unrelated'));
    expect(res.present).toEqual(authored);
    expect(res.missing).toBe(0);
  });

  it('keeps the survivors in AUTHORED order when SOME are missing', () => {
    // The board holds them in a different order and holds extras; neither may
    // reorder or pad the result.
    const res = resolveMembers(
      [MK[3], MK[0], MK[2], MK[1]],
      onBoard(MK[2], 'mk-unrelated', MK[3]),
    );
    expect(res.present).toEqual([MK[3], MK[2]]);
    expect(res.missing).toBe(2);
  });

  it('returns an EMPTY present plus an honest count when ALL are missing', () => {
    const res = resolveMembers([MK[0], MK[1], MK[2]], onBoard('mk-unrelated'));
    expect(res.present).toEqual([]);
    expect(res.missing).toBe(3);
  });

  it('never throws against an empty board', () => {
    expect(() => resolveMembers([MK[0]], onBoard())).not.toThrow();
    expect(resolveMembers([MK[0]], onBoard())).toEqual({ present: [], missing: 1 });
    expect(resolveMembers([], onBoard(MK[0]))).toEqual({ present: [], missing: 0 });
  });

  it('resolves BOTH axes independently and never conflates them', () => {
    // Deliberately different survivor counts per axis (2 of 3 rows, 1 of 2
    // columns) so a resolver reading one axis twice cannot pass.
    const data = gridData();
    const res = resolveGrid(data, onBoard(MK[0], MK[2], PK[1], 'xk-unrelated'));
    expect(res.matchups.present).toEqual([MK[0], MK[2]]);
    expect(res.matchups.missing).toBe(1);
    expect(res.prompts.present).toEqual([PK[1]]);
    expect(res.prompts.missing).toBe(1);
    expect(res.missingTotal).toBe(2);
  });

  it('reports missingTotal 0 for a fully intact grid', () => {
    const data = gridData();
    const res = resolveGrid(data, onBoard(...data.matchupKeys, ...data.promptKeys));
    expect(res.matchups.present).toEqual(data.matchupKeys);
    expect(res.prompts.present).toEqual(data.promptKeys);
    expect(res.missingTotal).toBe(0);
  });

  it('a grid whose every member is withdrawn resolves EMPTY with a full count', () => {
    const data = gridData();
    const res = resolveGrid(data, onBoard('xk-nothing-in-common'));
    expect(res.matchups.present).toEqual([]);
    expect(res.prompts.present).toEqual([]);
    expect(res.missingTotal).toBe(data.matchupKeys.length + data.promptKeys.length);
  });

  it('does not mutate the grid it resolves', () => {
    const data = gridData();
    const before = JSON.stringify(data);
    resolveGrid(data, onBoard(MK[0]));
    expect(JSON.stringify(data)).toBe(before);
  });
});
