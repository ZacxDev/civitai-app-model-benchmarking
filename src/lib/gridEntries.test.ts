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

import type { CombinationRow, GridRow, PromptRow, ResultRow } from '../types.js';
import { DEFAULT_TOP_N, indexResultsByCell } from './benchmark.js';
import {
  buildTopGrid,
  communityGridEntries,
  entryDomKey,
  entryKeys,
  gridMemberSummary,
  gridPreviewIds,
  GRID_PREVIEW_MAX,
  missingMembersNotice,
  openGridName,
  openSystemGrid,
  orderGridsByVotes,
  privateGridShortfall,
  resolveGridRows,
  resolveOpenGrid,
  SYSTEM_GRID_DOM_KEY,
  TOP_GRID_NAME,
  type GridEntry,
  type OpenGrid,
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

  it('🔴 does NOT blame the authors when the BOARD SCAN was TRUNCATED', () => {
    // 🔴 THE CLAIM THE OLD COPY MADE AND COULD NOT SUPPORT. "Missing" is a set
    // difference against the rows the scan READ, and `listAll` caps at
    // `LIST_PAGE × MAX_PAGES`. On an over-cap board a member that is perfectly
    // alive reads as missing, so "their authors removed them" is an assertion
    // about other people's actions the app has no evidence for — and it points
    // the reader at the wrong remedy. Same honesty rule the existing
    // `board-truncated-notice` already applies to the ranking.
    //
    // 🔴 THE WHOLE NORMALISED STRING is pinned, in both branches, not a keyword:
    // the artifact under test IS prose, and a guard on the word "removed" is
    // walkable by a reword that re-implies removal in different words. A cosmetic
    // reword now fails this test. That is the price of a machine-readable claim.
    const r = resolveGridRows(
      { system: false, row: grid('gk-n', 1, ['mk-alpha', 'mk-x', 'mk-y'], ['qk-tango', 'qk-z']) },
      MANY_MATCHUPS,
      MANY_PROMPTS,
    );
    expect(missingMembersNotice(r, true)).toBe(
      "3 of this grid's 5 members (2 rows, 1 column) could not be found on the board — " +
        'but this board has more entries than the app can load at once, so they may simply ' +
        'not have been read rather than removed. Everything else below still renders; ' +
        'nothing was quietly dropped.',
    );
    // The two branches are genuinely different sentences, not one string with a
    // clause bolted on — so a mutant that ignores the flag cannot satisfy both.
    expect(missingMembersNotice(r, true)).not.toBe(missingMembersNotice(r, false));
    // 🔴 THE DEFAULT IS THE COMPLETE-SCAN BRANCH. A caller that has not been
    // taught about truncation keeps the old, stronger sentence; the App passes
    // the flag explicitly.
    expect(missingMembersNotice(r)).toBe(missingMembersNotice(r, false));
  });

  it('stays NULL on a truncated scan when nothing is missing at all', () => {
    // The flag decides WHICH sentence, never WHETHER there is one: a grid whose
    // members all resolved has nothing to disclose, truncated board or not.
    const r = resolveGridRows(
      { system: false, row: grid('gk-ok', 1, ['mk-alpha'], ['qk-tango']) },
      MANY_MATCHUPS,
      MANY_PROMPTS,
    );
    expect(missingMembersNotice(r, true)).toBeNull();
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

// ===========================================================================
// The card preview READ BUDGET — in the NODE tier, where `lib/` logic belongs
// ===========================================================================

/**
 * 🔴 `gridPreviewIds` IS THE READ BUDGET, AND IT WAS ONLY EVER VERIFIED THROUGH
 * jsdom. `src/gridPreview.test.tsx` drives it through a rendered `GridsView` with a
 * mocked `useGatedImages`, which makes every claim about it also a claim about the
 * component, the hook mock and the DOM. `CLAUDE.md` names the node tier as where
 * `lib/` logic is verified, and a two-tier suite must be read in both tiers — a
 * defect in one can be structurally invisible in the other. These are the pure
 * cases: what goes into the one batched call, and how many were left out.
 *
 * FIXTURE DISCIPLINE, on top of this file's own rules:
 *
 *   - Image ids are pairwise distinct AND none of them equals `GRID_PREVIEW_MAX`
 *     (6) or any other constant an assertion names, so a mutant that hardcoded a
 *     literal cannot survive by coinciding with a fixture value.
 *   - The over-cap case carries EIGHT ids against a cap of six. Deliberately not a
 *     multiple of the cap, and deliberately not exactly on it: a fixture landing on
 *     the boundary cannot see an off-by-one in the slice, and one at 2× cannot tell
 *     `slice(0, cap)` from a halving.
 *   - Three points on the cap dimension — UNDER it, exactly ON it, and OVER it —
 *     because a single measurement is not a claim about the function.
 *   - The authored member order is NOT the vote order (mk-bravo 22 before mk-alpha
 *     91, qk-whisky 42 before qk-tango 76), so "row-major in AUTHORED order" is
 *     distinguishable from "row-major in whatever order the board happens to be in".
 */
describe('gridPreviewIds — the one batched read per card, in the node tier', () => {
  /** A published result row for one cell. `combo()` names its config `<key>-cfg`. */
  function result(comboKey: string, promptKey: string, imageIds: number[]): ResultRow {
    return {
      key: `r-${comboKey}-${promptKey}`,
      authorUserId: 53,
      data: {
        v: 2,
        kind: 'result',
        comboKey,
        configId: `${comboKey}-cfg`,
        promptKey,
        ecosystem: 'SDXL',
        imageIds,
      },
    };
  }

  /** 2 × 2, authored AGAINST the vote order on both axes. */
  const TWO_BY_TWO = grid('gk-preview', 9, ['mk-bravo', 'mk-alpha'], ['qk-whisky', 'qk-tango']);
  const resolved = resolveGridRows(
    { system: false, row: TWO_BY_TWO },
    MANY_MATCHUPS,
    MANY_PROMPTS,
  );

  const idsFor = (results: ResultRow[]) => gridPreviewIds(resolved, indexResultsByCell(results));

  it('the cap is six — stated here so a silent change of the budget fails', () => {
    // A literal, not a re-export of the constant into its own expectation. The
    // cases below are written against SIX; if that moves, they must be re-read
    // rather than silently re-scaled.
    expect(GRID_PREVIEW_MAX).toBe(6);
  });

  it('collects every cell’s ids in ROW-MAJOR AUTHORED order, and caps at six of eight', () => {
    const { ids, total } = idsFor([
      result('mk-bravo', 'qk-whisky', [71, 72]),
      result('mk-bravo', 'qk-tango', [73, 74]),
      result('mk-alpha', 'qk-whisky', [75, 76]),
      result('mk-alpha', 'qk-tango', [77, 78]),
    ]);

    // 🔴 THE ORDER IS THE CLAIM AS MUCH AS THE COUNT. Row-major over authored
    // members: bravo's row first (its two columns, whisky then tango), then
    // alpha's. A resolver that walked the board in VOTE order would return
    // `[75, 76, 77, 78, 71, 72]` — same length, same cap, different ids.
    expect(ids).toEqual([71, 72, 73, 74, 75, 76]);
    // …and the UNCAPPED total, which is what the "+2 more" disclosure is built
    // from. Folding it into `ids.length` is the silent-understatement bug.
    expect(total).toBe(8);
    expect(total - ids.length).toBe(2);
  });

  it('EXACTLY ON the cap: six ids, six read, nothing to disclose', () => {
    // The boundary point. `slice(0, 6)` and an off-by-one `slice(0, 7)` agree here
    // and disagree in the case above, which is why both are measured.
    const { ids, total } = idsFor([
      result('mk-bravo', 'qk-whisky', [81, 82, 83]),
      result('mk-bravo', 'qk-tango', [84, 85, 86]),
    ]);
    expect(ids).toEqual([81, 82, 83, 84, 85, 86]);
    expect(total).toBe(6);
    expect(total - ids.length).toBe(0);
  });

  it('UNDER the cap: nothing is padded and nothing is dropped', () => {
    const { ids, total } = idsFor([result('mk-alpha', 'qk-tango', [91, 92])]);
    expect(ids).toEqual([91, 92]);
    expect(total).toBe(2);
  });

  it('🔴 an UNRUN cell contributes NOTHING — three of four cells cost zero ids', () => {
    // This is what makes a grid of empty cells cost ZERO gated reads rather than
    // one per cell: no result row, no image id, no read.
    const { ids, total } = idsFor([result('mk-bravo', 'qk-tango', [73, 74])]);
    expect(ids).toEqual([73, 74]);
    expect(total).toBe(2);
  });

  it('🔴 a grid with NO results yields an EMPTY id list — the zero the component needs', () => {
    // `GridPreview` renders no `GatedCell` at all for an empty list, which is how
    // the zero-read case is structural rather than the hook short-circuiting.
    expect(idsFor([])).toEqual({ ids: [], total: 0 });
  });

  it('a result for a cell OUTSIDE the grid is not read', () => {
    // POSITIVE CONTROL for the zero above, in the same describe and against the
    // same helper: the board can hold results this grid must not pull in. mk-echo
    // is on the board and is NOT a member of `TWO_BY_TWO`.
    const { ids, total } = idsFor([
      result('mk-echo', 'qk-tango', [61, 62]),
      result('mk-alpha', 'qk-tango', [91, 92]),
    ]);
    expect(ids).toEqual([91, 92]);
    expect(total).toBe(2);
  });

  it('a DANGLING member contributes nothing, and the survivors still do', () => {
    // A grid naming a withdrawn row resolves to fewer members; its cells simply
    // are not among the ones walked. Never a throw, never a shifted order.
    const dangling = resolveGridRows(
      { system: false, row: grid('gk-d', 2, ['mk-gone', 'mk-alpha'], ['qk-tango']) },
      MANY_MATCHUPS,
      MANY_PROMPTS,
    );
    const { ids, total } = gridPreviewIds(
      dangling,
      indexResultsByCell([
        result('mk-gone', 'qk-tango', [51, 52]),
        result('mk-alpha', 'qk-tango', [91, 92]),
      ]),
    );
    expect(ids).toEqual([91, 92]);
    expect(total).toBe(2);
  });
});

// ===========================================================================
// 🔴 THE OPEN GRID — the third kind, and the property the whole feature rests on
//
// `OpenGrid` is a SUPERSET of `GridEntry`: the open panel can show a grid that is
// still in the viewer's own per-viewer KV, which the Grids LIST cannot. These cases
// are the node-tier half of `src/gridOpenPrivate.test.tsx`; that file drives the real
// `App` and asserts against the `shared.append` log, this one pins the pure rules the
// App composes.
// ===========================================================================

/**
 * The per-viewer LOCAL ids a private grid stores as member keys.
 *
 * 🔴 BARE, NOT STORAGE-KEY-SHAPED, AND THAT IS A CORRECTION. These fixtures used
 * `'draft:v1:dm-1'` / `'unpub:prompt:v1:dp-1'`, which are the KV KEYS the records live
 * under (`draftKey` / `unpubPromptKey`) and NOT what a grid holds: `App` builds the
 * picker's items with `key: d.localId` (`App.tsx`'s `matchupPickerItems`), so a private
 * member key on the wire is the bare local id. The absence assertions below therefore
 * scanned for a prefix production never produces — green, and about nothing.
 *
 * 🔴 PAIRWISE DISTINCT, AND NO SUBSTRING OF ANY BOARD KEY in `MANY_MATCHUPS` /
 * `MANY_PROMPTS` (all `mk-*` / `qk-*`), which is what makes a `not.toContain` over the
 * serialised result a real claim rather than one a board key could satisfy.
 */
const LOCAL_MATCHUP = 'dm-1';
const LOCAL_PROMPT = 'dp-1';
const LOCAL_PROMPT_2 = 'dp-2';

/** An `UnpublishedGrid`-shaped record: a local id, no key, no count, no author. */
function privateGrid(matchupKeys: string[], promptKeys: string[]) {
  return {
    v: 1 as const,
    localId: 'ug-local-1',
    name: 'My private grid',
    description: 'not on the board',
    matchupKeys,
    promptKeys,
    updatedAt: '2026-10-01T00:00:00.000Z',
  };
}

describe('🔴 the open grid: three kinds, one resolver', () => {
  // 🔴 THE THREE-KIND KEY READ, ASSERTED THROUGH THE RESOLVER RATHER THAN THROUGH
  // `openGridKeys`. That helper was exported with exactly one production consumer —
  // `resolveOpenGrid`, in its own module — and this case was the second call site that
  // made it look like module surface; it is module-private now. The claim is unchanged
  // and is now made where it MATTERS: which rows and columns the matrix is built from.
  // An intermediate key list that is right while the resolution is wrong buys nothing.
  it('🔴 resolveOpenGrid reads the authored keys out of each of the three kinds', () => {
    const top = openSystemGrid(buildTopGrid(MANY_MATCHUPS, MANY_PROMPTS));
    // 🔴 LITERALS, NOT `buildTopGrid(...)` RE-CALLED. An expectation computed from the
    // implementation passes whatever the implementation says. `DEFAULT_TOP_N` is 5 and
    // these are the five highest counts in `MANY_MATCHUPS`, in descending order — and
    // every one of them is on the board, so all five survive resolution.
    expect(resolveOpenGrid(top, MANY_MATCHUPS, MANY_PROMPTS).matchups.map((r) => r.key)).toEqual([
      'mk-alpha',
      'mk-echo',
      'mk-foxtrot',
      'mk-delta',
      'mk-bravo',
    ]);

    const published: OpenGrid = {
      kind: 'published',
      row: grid('gk-p', 9, ['mk-echo', 'mk-golf'], ['qk-tango']),
    };
    const pub = resolveOpenGrid(published, MANY_MATCHUPS, MANY_PROMPTS);
    expect(pub.matchups.map((r) => r.key)).toEqual(['mk-echo', 'mk-golf']);
    expect(pub.prompts.map((r) => r.key)).toEqual(['qk-tango']);

    const priv: OpenGrid = { kind: 'private', rec: privateGrid(['mk-bravo'], ['qk-romeo']) };
    const privResolved = resolveOpenGrid(priv, MANY_MATCHUPS, MANY_PROMPTS);
    expect(privResolved.matchups.map((r) => r.key)).toEqual(['mk-bravo']);
    expect(privResolved.prompts.map((r) => r.key)).toEqual(['qk-romeo']);
    // 🔴 THE DISCRIMINATOR BETWEEN THE THREE ARMS, stated as an inequality: the private
    // arm read `rec`, not `row` or the system key lists, so its members are NOT the
    // other two's. Without this, a resolver that ignored `kind` and always read the
    // system keys would satisfy the published and private expectations by accident of
    // the fixture only if they happened to coincide — they do not, and this says so.
    expect(privResolved.matchups.map((r) => r.key)).not.toEqual(pub.matchups.map((r) => r.key));
  });

  it('openGridName: the system name, else the record name, else "Untitled grid"', () => {
    expect(openGridName(openSystemGrid(buildTopGrid(MANY_MATCHUPS, MANY_PROMPTS)))).toBe(
      TOP_GRID_NAME,
    );
    expect(openGridName({ kind: 'published', row: grid('gk-p', 1, [], []) })).toBe('Grid gk-p');
    expect(openGridName({ kind: 'private', rec: privateGrid([], []) })).toBe('My private grid');
    // The empty-name fallback, on BOTH kinds that can have one — a `||` dropped from
    // either arm would otherwise render a blank title.
    expect(
      openGridName({ kind: 'published', row: { ...grid('gk-p', 1, [], []), name: '' } }),
    ).toBe('Untitled grid');
    expect(
      openGridName({ kind: 'private', rec: { ...privateGrid([], []), name: '' } }),
    ).toBe('Untitled grid');
  });

  // -------------------------------------------------------------------------
  // 🔴 THE INVARIANT: A PRIVATE MEMBER CONTRIBUTES NO ROW AND NO COLUMN.
  //
  // That is what keeps a per-viewer LOCAL id out of every cell identity, and a cell
  // identity is what every result row is written under (`buildResultPayload`). The
  // feature is safe because the resolver resolves against the BOARD — not because
  // anything checks for a local id.
  // -------------------------------------------------------------------------
  it('🔴 resolveOpenGrid excludes a PRIVATE member from both axes, and counts it as short', () => {
    // 🔴 ASYMMETRIC AND PAIRWISE DISTINCT: 2 board + 1 local on the matchup axis, 1
    // board + 2 local on the prompt axis. Every number below (1, 2, 3, 6) is distinct
    // from every other, so a count read off the wrong axis fails.
    const open: OpenGrid = {
      kind: 'private',
      rec: privateGrid(
        ['mk-alpha', LOCAL_MATCHUP, 'mk-bravo'],
        ['qk-tango', LOCAL_PROMPT, LOCAL_PROMPT_2],
      ),
    };
    const resolved = resolveOpenGrid(open, MANY_MATCHUPS, MANY_PROMPTS);

    expect(resolved.matchups.map((r) => r.key)).toEqual(['mk-alpha', 'mk-bravo']);
    expect(resolved.prompts.map((r) => r.key)).toEqual(['qk-tango']);
    expect(resolved.missingMatchups).toBe(1);
    expect(resolved.missingPrompts).toBe(2);
    expect(resolved.missingTotal).toBe(3);
    expect(resolved.authoredTotal).toBe(6);
    // 🔴 THE CLAIM STATED THE OTHER WAY ROUND, over the whole resolved shape: no local
    // id survives into anything the matrix is built from. A row that resolved would
    // put its key into a cell identity and therefore onto a result row.
    //
    // 🔴 THE EXACT IDS, which is what these used to miss — they scanned for the
    // `draft:v1:` / `unpub:prompt:v1:` STORAGE prefixes that a grid's member keys never
    // carry. See the constants' docblock. POSITIVE CONTROL first, so the absences below
    // are absences and not a `not.toContain` against an empty serialisation.
    const wire = JSON.stringify(resolved);
    expect(wire, 'the resolved shape serialised to nothing').toContain('mk-alpha');
    expect(wire).not.toContain(LOCAL_MATCHUP);
    expect(wire).not.toContain(LOCAL_PROMPT);
    expect(wire).not.toContain(LOCAL_PROMPT_2);
  });

  it('🔴 a MEMBER-ONLY publish does not rescue the reference — only the grid publish does', () => {
    // 🔴 THIS PINS A CLAIM THE VIEWER-FACING COPY MAKES, and it exists because the first
    // draft of that copy said the OPPOSITE. `PRIVATE_GRID_EMPTY_BODY` told the viewer to
    // publish their private matchups and prompts from My Benchmarks and they would appear
    // in the grid. They do not, and this is the mechanism: resolution is BY KEY, the grid
    // stores the bare LOCAL id, and publishing a member mints a NEW host-minted key. The
    // local-id → shared-key rewrite is `lib/gridCascade.ts`'s and runs only on the GRID
    // publish.
    //
    // 🔴 THE FIXTURE IS THE WHOLE POINT: the board now holds a row for the published
    // matchup, under the key the host minted (`fk_7`, which is the fake host's shape and
    // is pairwise distinct from every other key here). Its NAME is irrelevant; what
    // decides is that its key is not the local id.
    const published = combo('fk_7', 50);
    const board = [...MANY_MATCHUPS, published];
    const resolved = resolveOpenGrid(
      { kind: 'private', rec: privateGrid([LOCAL_MATCHUP], ['qk-tango']) },
      board,
      MANY_PROMPTS,
    );

    // POSITIVE CONTROL: the board row IS there and IS resolvable — by its own key.
    expect(board.map((r) => r.key)).toContain('fk_7');
    expect(
      resolveOpenGrid({ kind: 'private', rec: privateGrid(['fk_7'], ['qk-tango']) }, board, MANY_PROMPTS)
        .matchups.map((r) => r.key),
      'the newly published row is unresolvable even by its own key — wrong fixture',
    ).toEqual(['fk_7']);

    // 🔴 THE CLAIM: the grid still names the local id, so it resolves to NOTHING. One
    // axis empty means no cells, which is the state the empty-state copy renders in.
    expect(resolved.matchups).toEqual([]);
    expect(resolved.missingMatchups).toBe(1);
    expect(resolved.prompts.map((r) => r.key)).toEqual(['qk-tango']);
  });

  it('resolveOpenGrid agrees with resolveGridRows on a PUBLISHED grid', () => {
    // 🔴 A SEAM GUARD, NOT A TAUTOLOGY: the two entry points are different functions
    // over different TYPES (`OpenGrid` vs `GridEntry`) and a reader has to be able to
    // trust they delegate to the same body. If `resolveOpenGrid` ever grew its own
    // resolution rule, this is the case that notices.
    const row = grid('gk-p', 9, ['mk-echo', 'mk-gone', 'mk-golf'], ['qk-tango', 'qk-gone']);
    expect(resolveOpenGrid({ kind: 'published', row }, MANY_MATCHUPS, MANY_PROMPTS)).toEqual(
      resolveGridRows({ system: false, row }, MANY_MATCHUPS, MANY_PROMPTS),
    );
  });
});

describe('🔴 privateGridShortfall — the sentence that attributes NO cause', () => {
  it('is null when every authored member resolved', () => {
    const resolved = resolveOpenGrid(
      { kind: 'private', rec: privateGrid(['mk-alpha'], ['qk-tango']) },
      MANY_MATCHUPS,
      MANY_PROMPTS,
    );
    expect(resolved.missingTotal).toBe(0); // the premise
    expect(privateGridShortfall(resolved)).toBeNull();
  });

  it('🔴 states the arithmetic and the rule, and names no cause', () => {
    const resolved = resolveOpenGrid(
      { kind: 'private', rec: privateGrid(['mk-alpha', LOCAL_MATCHUP], ['qk-tango', LOCAL_PROMPT]) },
      MANY_MATCHUPS,
      MANY_PROMPTS,
    );
    // 🔴 THE WHOLE STRING AS A LITERAL. The artifact under test IS prose, so a keyword
    // guard is walkable by a reword — including one that puts the false attribution
    // back. 2 of 4 here, which are distinct numbers. BOTH axes resolve one member, so
    // there IS a matrix below and the reassurance clause is earned.
    expect(privateGridShortfall(resolved)).toBe(
      "2 of this grid's 4 members are not in the matrix below. The matrix is built from " +
        'the rows the app has read off the shared board, so a member with no such row is ' +
        'left out — your own private matchups and prompts until you publish them, and a ' +
        'member another author withdrew. ' +
        'Everything else below still renders; nothing was quietly dropped.',
    );
    // 🔴 THE CLAUSE THAT WAS FALSE ON A TRUNCATED SCAN, HELD OUT BY WORDS. "Only members
    // with a row on the shared board can be" is wrong when `listAll` hit its page cap: a
    // member DOES have a row there and is still excluded. The rule is stated over rows
    // the app has READ now, and this is what fails if the old absolute comes back.
    expect(privateGridShortfall(resolved)).not.toContain('Only members with a row');
  });

  it('🔴 and it DROPS the "everything else below" clause when NOTHING is below', () => {
    // 🔴 THE ALL-PRIVATE GRID, which is this feature's most likely first state: nothing
    // resolves, the matrix is empty, and "Everything else below still renders" is a
    // promise about a remainder that does not exist. Two points on the one dimension
    // that decides it — the case above has a matrix, this one does not.
    const resolved = resolveOpenGrid(
      { kind: 'private', rec: privateGrid([LOCAL_MATCHUP], [LOCAL_PROMPT]) },
      MANY_MATCHUPS,
      MANY_PROMPTS,
    );
    expect(resolved.matchups).toEqual([]); // the premise
    expect(resolved.prompts).toEqual([]);
    expect(privateGridShortfall(resolved)).toBe(
      "2 of this grid's 2 members are not in the matrix below. The matrix is built from " +
        'the rows the app has read off the shared board, so a member with no such row is ' +
        'left out — your own private matchups and prompts until you publish them, and a ' +
        'member another author withdrew.',
    );
  });

  it('🔴 ONE axis empty is ALSO nothing below — the boundary, not just the all-empty case', () => {
    // 🔴 THE BOUNDARY THE `&&` IN `hasMatrix` IS FOR, and a mutant that tested `||` —
    // "either axis has something" — would pass the two cases above and fail here. A cell
    // needs a row AND a column, so one surviving matchup with no surviving prompt renders
    // no cells at all: the clause must still be absent. The counts (1 missing of 3, not 2
    // of 2 or 2 of 4) are distinct from both cases above, so a wrong fixture cannot pass
    // by reusing another case's expectation.
    const resolved = resolveOpenGrid(
      { kind: 'private', rec: privateGrid(['mk-alpha', 'mk-bravo'], [LOCAL_PROMPT]) },
      MANY_MATCHUPS,
      MANY_PROMPTS,
    );
    expect(resolved.matchups.map((r) => r.key)).toEqual(['mk-alpha', 'mk-bravo']); // the premise
    expect(resolved.prompts).toEqual([]);
    expect(privateGridShortfall(resolved)).not.toContain('Everything else below still renders');
    // POSITIVE CONTROL: a sentence WAS produced, so the absence above is an absence and
    // not a `null` the `toContain` never saw.
    expect(privateGridShortfall(resolved)).toContain("1 of this grid's 3 members");
  });

  it('🔴 and it is NOT what `missingMembersNotice` says about the same shortfall', () => {
    // 🔴 THE DISCRIMINATING PAIR. Both functions are handed the SAME resolved shape;
    // the only difference that can show up is the copy, which is the entire reason the
    // second function exists. `missingMembersNotice`'s complete-scan arm attributes the
    // absence to the members' authors — false about the viewer's own private record —
    // and this case is what fails if the private arm is ever pointed back at it.
    const resolved = resolveOpenGrid(
      { kind: 'private', rec: privateGrid(['mk-alpha', LOCAL_MATCHUP], ['qk-tango']) },
      MANY_MATCHUPS,
      MANY_PROMPTS,
    );
    const shared = missingMembersNotice(resolved, false);
    const priv = privateGridShortfall(resolved);
    // POSITIVE CONTROL: both produced a sentence, so the inequality is between two
    // strings rather than against a null.
    expect(typeof shared).toBe('string');
    expect(typeof priv).toBe('string');
    expect(priv).not.toBe(shared);
    expect(shared).toContain('their authors removed them');
    expect(priv).not.toContain('their authors removed them');
  });
});

describe('🔴 SYSTEM_GRID_DOM_KEY is the one spelling, and entryDomKey is TOTAL', () => {
  it('the exported sentinel is what entryDomKey returns for the system entry', () => {
    // 🔴 THE LITERAL, TYPED OUT. `App` and `GridsView` both name this value now (the
    // open-filter contract), and a ledger that compared the constant to itself would
    // not notice the string changing under every consumer that hardcodes it.
    expect(SYSTEM_GRID_DOM_KEY).toBe('__system__');
    expect(entryDomKey(buildTopGrid(MANY_MATCHUPS, MANY_PROMPTS))).toBe(SYSTEM_GRID_DOM_KEY);
  });

  // ⚠️ INVARIANT GUARD — GREEN at `bb63087`. `entryDomKey` was already total there;
  // what was wrong was that `GridsView` compared `entryOpenKey` instead. This pins the
  // property the new contract RESTS on, so it is not regression coverage for the bug.
  it('🔴 no LISTABLE entry maps to null — which is what frees null to mean "none"', () => {
    // 🔴 THIS IS THE PROPERTY `GridsView`'s open-filter DEPENDS ON, and it used to be
    // violated: the filter compared `entryOpenKey`, whose `null` IS the system entry,
    // so passing `null` for "nothing in this list is open" silently hid the Top Grid.
    // Totality over the whole listed set is the fact that makes the new contract sound.
    const entries = communityGridEntries(
      buildTopGrid(MANY_MATCHUPS, MANY_PROMPTS),
      [grid('gk-one', 5, [], []), grid('gk-two', 2, [], [])],
    );
    expect(entries.length).toBe(3); // the premise: system + two published
    for (const entry of entries) {
      const key = entryDomKey(entry);
      expect(typeof key).toBe('string');
      expect(key.length).toBeGreaterThan(0);
    }
    // …and the keys are pairwise distinct, or the filter could exclude two cards at once.
    expect(new Set(entries.map(entryDomKey)).size).toBe(3);
  });
});
