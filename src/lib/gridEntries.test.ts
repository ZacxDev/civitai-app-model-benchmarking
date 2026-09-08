// The Grids view's pure core: the Top Grid, the Community ordering, and the
// resolution of a grid's authored members against the live board.
//
// 🔴 FIXTURE DISCIPLINE, because these cases are all about ORDER and COUNTS and
// both are easy to assert vacuously:
//
//   - Vote counts are PAIRWISE DISTINCT and NOT in input order, so a sort test
//     cannot pass against the order it was handed.
//   - Keys are pairwise distinct and their LEXICAL order is deliberately made to
//     differ from the vote order, so a "sort" that secretly sorted by key would
//     fail rather than coincide.
//   - The Top Grid cases use MORE than `DEFAULT_TOP_N` candidates on both axes,
//     so the truncation is observable — and they import `DEFAULT_TOP_N` rather
//     than spelling 5, which is the number that would go stale silently.
//   - The dangling-reference case is ASYMMETRIC: present 3 / missing 2 on one
//     axis and present 2 / missing 6 on the other, so every number in the
//     assertions is distinct from every other. A 1-of-2 fixture cannot tell the
//     correct count from its inverse.

import { describe, expect, it } from 'vitest';

import type { CombinationRow, GridRow, PromptRow } from '../types.js';
import { DEFAULT_TOP_N } from './benchmark.js';
import {
  buildTopGrid,
  communityGridEntries,
  entryKeys,
  gridMemberSummary,
  missingMembersNotice,
  orderGridsByVotes,
  resolveGridRows,
  TOP_GRID_NAME,
  type GridEntry,
} from './gridEntries.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function combo(key: string, count: number): CombinationRow {
  return {
    key,
    count,
    authorUserId: 41,
    name: `Matchup ${key}`,
    description: '',
    data: {
      v: 2,
      kind: 'combination',
      configs: [
        {
          id: `${key}-cfg`,
          checkpoint: { versionId: 11, modelId: 22, baseModel: 'SDXL 1.0', modelName: 'CKPT' },
          loras: [],
        },
      ],
    },
  };
}

function prompt(key: string, count: number): PromptRow {
  return {
    key,
    count,
    authorUserId: 43,
    name: `Prompt ${key}`,
    description: '',
    data: { v: 3, kind: 'prompt', default: { prompt: 'p', params: {} } },
  };
}

function grid(key: string, count: number, matchupKeys: string[], promptKeys: string[]): GridRow {
  return {
    key,
    count,
    authorUserId: 47,
    name: `Grid ${key}`,
    description: '',
    data: { v: 1, kind: 'grid', matchupKeys, promptKeys },
  };
}

/**
 * Seven matchups and six prompts — both strictly MORE than `DEFAULT_TOP_N`, so
 * the Top Grid's cut is observable. Counts are pairwise distinct and neither in
 * input order nor in key order.
 */
const MANY_MATCHUPS: CombinationRow[] = [
  combo('mk-hotel', 14),
  combo('mk-alpha', 91),
  combo('mk-golf', 3),
  combo('mk-delta', 47),
  combo('mk-echo', 68),
  combo('mk-bravo', 22),
  combo('mk-foxtrot', 55),
];
const MANY_PROMPTS: PromptRow[] = [
  prompt('qk-sierra', 8),
  prompt('qk-tango', 76),
  prompt('qk-romeo', 31),
  prompt('qk-victor', 64),
  prompt('qk-uniform', 19),
  prompt('qk-whisky', 42),
];

describe('the Top Grid (criterion 10, spec §11.5)', () => {
  it(`takes DEFAULT_TOP_N top-voted matchups × DEFAULT_TOP_N top-voted prompts`, () => {
    // PREMISE: there is more on the board than the Top Grid can hold, so the
    // truncation is observable at all.
    expect(MANY_MATCHUPS.length).toBeGreaterThan(DEFAULT_TOP_N);
    expect(MANY_PROMPTS.length).toBeGreaterThan(DEFAULT_TOP_N);

    const top = buildTopGrid(MANY_MATCHUPS, MANY_PROMPTS);

    expect(top.matchupKeys).toHaveLength(DEFAULT_TOP_N);
    expect(top.promptKeys).toHaveLength(DEFAULT_TOP_N);
    // LITERAL expected values, in vote order — not derived from `topByVotes`.
    // 91, 68, 55, 47, 22 … and 14 / 3 are cut.
    expect(top.matchupKeys).toEqual([
      'mk-alpha',
      'mk-echo',
      'mk-foxtrot',
      'mk-delta',
      'mk-bravo',
    ]);
    // 76, 64, 42, 31, 19 … and 8 is cut.
    expect(top.promptKeys).toEqual([
      'qk-tango',
      'qk-victor',
      'qk-whisky',
      'qk-romeo',
      'qk-uniform',
    ]);
  });

  it('is SYSTEM-owned: no key, no count, no author to vote on', () => {
    const top = buildTopGrid(MANY_MATCHUPS, MANY_PROMPTS);
    expect(top.system).toBe(true);
    // The union has no `row`, so there is structurally nothing to vote on. This
    // is the assertion that would stop compiling if someone gave the system
    // entry a fake `count` to sort it by.
    expect('row' in top).toBe(false);
  });

  it('is empty — not broken — on an empty board', () => {
    const top = buildTopGrid([], []);
    expect(top.matchupKeys).toEqual([]);
    expect(top.promptKeys).toEqual([]);
  });
});

describe('Community Grids ordering (criterion 11, spec §11.5/§7.1)', () => {
  // Counts pairwise distinct except the deliberate TIE, and the input order is
  // neither the answer nor its reverse.
  const GRIDS: GridRow[] = [
    grid('gk-bravo', 9, ['mk-alpha'], ['qk-tango']),
    grid('gk-alpha', 9, ['mk-alpha'], ['qk-tango']),
    grid('gk-mike', 2, ['mk-alpha'], ['qk-tango']),
    grid('gk-zulu', 40, ['mk-alpha'], ['qk-tango']),
  ];

  it('sorts by vote count DESCENDING, ties broken lexically by key', () => {
    const ordered = orderGridsByVotes(GRIDS).map((g) => g.key);
    // 40, then the 9-tie in key order, then 2.
    expect(ordered).toEqual(['gk-zulu', 'gk-alpha', 'gk-bravo', 'gk-mike']);

    // CONTROLS: the answer is neither the input order nor plain key order, so a
    // no-op and a key-sort are both distinguishable from the real ordering.
    expect(ordered).not.toEqual(GRIDS.map((g) => g.key));
    expect(ordered).not.toEqual([...GRIDS.map((g) => g.key)].sort());
  });

  it('keeps every grid — this list is ordered, never truncated', () => {
    expect(orderGridsByVotes(GRIDS)).toHaveLength(GRIDS.length);
  });

  it('🔴 PINS THE TOP GRID FIRST, OUTSIDE the vote ordering', () => {
    const top = buildTopGrid(MANY_MATCHUPS, MANY_PROMPTS);
    const entries = communityGridEntries(top, GRIDS);

    // First, and system — even though `gk-zulu` has 40 votes and the Top Grid
    // has none. A Top Grid folded into the sort with an invented count of 0
    // would land LAST here, which is the exact failure this pins.
    expect(entries[0].system).toBe(true);
    expect(entries).toHaveLength(GRIDS.length + 1);
    expect(entries.slice(1).map((e) => (e.system ? '?' : e.row.key))).toEqual([
      'gk-zulu',
      'gk-alpha',
      'gk-bravo',
      'gk-mike',
    ]);
    // …and it is the ONLY system entry, so "first" is unambiguous.
    expect(entries.filter((e) => e.system)).toHaveLength(1);
  });

  it('still pins the Top Grid first when there are no published grids at all', () => {
    const entries = communityGridEntries(buildTopGrid(MANY_MATCHUPS, MANY_PROMPTS), []);
    expect(entries).toHaveLength(1);
    expect(entries[0].system).toBe(true);
  });

  it('reads member keys off EITHER kind of entry', () => {
    const top = buildTopGrid(MANY_MATCHUPS, MANY_PROMPTS);
    expect(entryKeys(top).matchupKeys).toEqual(top.matchupKeys);

    const published: GridEntry = { system: false, row: GRIDS[0] };
    expect(entryKeys(published)).toEqual({
      matchupKeys: ['mk-alpha'],
      promptKeys: ['qk-tango'],
    });
  });
});

describe('dangling references (criterion 8, spec §11.2)', () => {
  // ASYMMETRIC ON BOTH AXES, and every number in the assertions below is
  // distinct from every other: present 3 / missing 2 rows, present 2 / missing 6
  // columns, 8 missing of 13 authored.
  const AUTHORED_MATCHUPS = ['mk-alpha', 'mk-gone-1', 'mk-echo', 'mk-gone-2', 'mk-bravo'];
  const AUTHORED_PROMPTS = [
    'qk-tango',
    'qk-gone-1',
    'qk-gone-2',
    'qk-whisky',
    'qk-gone-3',
    'qk-gone-4',
    'qk-gone-5',
    'qk-gone-6',
  ];
  const DANGLING = grid('gk-dangling', 5, AUTHORED_MATCHUPS, AUTHORED_PROMPTS);
  const entry: GridEntry = { system: false, row: DANGLING };

  it('renders the members that survive, IN AUTHORED ORDER, and counts the rest', () => {
    const r = resolveGridRows(entry, MANY_MATCHUPS, MANY_PROMPTS);

    // ⚠ THIS FIXTURE'S authored order happens to coincide with vote order on
    // both axes, so it does NOT discriminate a resolver that sorts. The case
    // below ("preserves an authored order that is NOT the vote order") is the
    // one that does; this one is about the COUNTS.
    expect(r.matchups.map((m) => m.key)).toEqual(['mk-alpha', 'mk-echo', 'mk-bravo']);
    expect(r.prompts.map((p) => p.key)).toEqual(['qk-tango', 'qk-whisky']);

    expect(r.missingMatchups).toBe(2);
    expect(r.missingPrompts).toBe(6);
    expect(r.missingTotal).toBe(8);
    expect(r.authoredTotal).toBe(13);
    // 🔴 The missing count is NEVER folded into a length: present + missing is
    // the authored count on each axis, which is what makes the disclosure honest.
    expect(r.matchups.length + r.missingMatchups).toBe(AUTHORED_MATCHUPS.length);
    expect(r.prompts.length + r.missingPrompts).toBe(AUTHORED_PROMPTS.length);
  });

  it('preserves an authored order that is NOT the vote order', () => {
    // mk-bravo (22) authored FIRST, ahead of mk-alpha (91). A resolver that
    // sorted — or that resolved by walking the board instead of the authored
    // list — would return them the other way round.
    const reordered = grid('gk-reordered', 1, ['mk-bravo', 'mk-alpha'], ['qk-whisky', 'qk-tango']);
    const r = resolveGridRows({ system: false, row: reordered }, MANY_MATCHUPS, MANY_PROMPTS);
    expect(r.matchups.map((m) => m.key)).toEqual(['mk-bravo', 'mk-alpha']);
    expect(r.prompts.map((p) => p.key)).toEqual(['qk-whisky', 'qk-tango']);
    expect(r.missingTotal).toBe(0);
  });

  it('🔴 does not let a PROMPT key satisfy a MATCHUP slot', () => {
    // The reason this resolves per-axis rather than against one flat set of board
    // keys: a prompt key named as a row is a member that can render NO row, and a
    // single `available` set would report it present.
    const crossed = grid('gk-crossed', 1, ['qk-tango'], ['mk-alpha']);
    const r = resolveGridRows({ system: false, row: crossed }, MANY_MATCHUPS, MANY_PROMPTS);
    expect(r.matchups).toEqual([]);
    expect(r.prompts).toEqual([]);
    expect(r.missingTotal).toBe(2);
  });

  it('never throws, and resolves to an EMPTY grid with an honest count', () => {
    const allGone = grid('gk-orphan', 1, ['mk-nope-a', 'mk-nope-b'], ['qk-nope-c']);
    const r = resolveGridRows({ system: false, row: allGone }, MANY_MATCHUPS, MANY_PROMPTS);
    expect(r.matchups).toEqual([]);
    expect(r.prompts).toEqual([]);
    expect(r.missingTotal).toBe(3);
    expect(r.authoredTotal).toBe(3);
  });

  it('resolves the SYSTEM entry through the same path', () => {
    const top = buildTopGrid(MANY_MATCHUPS, MANY_PROMPTS);
    const r = resolveGridRows(top, MANY_MATCHUPS, MANY_PROMPTS);
    // The Top Grid is built FROM the board, so nothing of it can be missing.
    expect(r.missingTotal).toBe(0);
    expect(r.matchups).toHaveLength(DEFAULT_TOP_N);
    expect(r.prompts).toHaveLength(DEFAULT_TOP_N);
  });
});

describe('the disclosure copy', () => {
  it('names the missing count, the authored total AND which axes lost members', () => {
    const r = resolveGridRows(
      { system: false, row: grid('gk-n', 1, ['mk-alpha', 'mk-x', 'mk-y'], ['qk-tango', 'qk-z']) },
      MANY_MATCHUPS,
      MANY_PROMPTS,
    );
    const notice = missingMembersNotice(r);
    expect(notice).toBe(
      "3 of this grid's 5 members (2 rows, 1 column) are no longer on the board — " +
        'their authors removed them. Everything else below still renders; nothing was quietly dropped.',
    );
  });

  it('names only the axis that lost members, and singularises', () => {
    const r = resolveGridRows(
      { system: false, row: grid('gk-one', 1, ['mk-alpha', 'mk-x'], ['qk-tango']) },
      MANY_MATCHUPS,
      MANY_PROMPTS,
    );
    expect(missingMembersNotice(r)).toBe(
      "1 of this grid's 3 members (1 row) are no longer on the board — " +
        'their authors removed them. Everything else below still renders; nothing was quietly dropped.',
    );
  });

  it('🔴 is NULL when nothing is missing — no reassuring "0 missing" line', () => {
    const r = resolveGridRows(
      { system: false, row: grid('gk-ok', 1, ['mk-alpha'], ['qk-tango']) },
      MANY_MATCHUPS,
      MANY_PROMPTS,
    );
    expect(r.missingTotal).toBe(0);
    expect(missingMembersNotice(r)).toBeNull();
  });

  it('summarises the SURVIVING members, singular and plural', () => {
    const many = resolveGridRows(
      { system: false, row: grid('gk-s', 1, ['mk-alpha', 'mk-echo'], ['qk-tango', 'qk-whisky']) },
      MANY_MATCHUPS,
      MANY_PROMPTS,
    );
    expect(gridMemberSummary(many)).toBe('2 matchups × 2 prompts');

    const one = resolveGridRows(
      { system: false, row: grid('gk-1', 1, ['mk-alpha'], ['qk-tango']) },
      MANY_MATCHUPS,
      MANY_PROMPTS,
    );
    expect(gridMemberSummary(one)).toBe('1 matchup × 1 prompt');
  });

  it('names the Top Grid the same way everywhere', () => {
    expect(TOP_GRID_NAME).toBe('Top Grid');
  });
});
