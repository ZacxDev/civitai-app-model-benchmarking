// The PURE half of "publish a grid that names PRIVATE members": the classifier,
// the local-id → shared-key rewrite, and every sentence the cascade shows a viewer.
//
// 🔴 WHAT THE CLASSIFIER IS FOR, SO THE CASES BELOW READ AS CLAIMS AND NOT TRIVIA.
// A grid stores member KEYS. Until the private-member change every one of them was
// a host-minted SHARED key; a private matchup or prompt has only a per-viewer LOCAL
// id. A published grid row is world-readable and effectively permanent
// (`shared.update`/`withdraw` are author-scoped, there is no merge), so a row naming
// a local id is a permanent public reference nobody else can resolve. The classifier
// is what decides, per key, whether something has to be published first and what the
// key must be rewritten to.
//
// 🔴 THE POINTER BRANCH IS THE ONE THAT IS EASY TO LOSE AND EXPENSIVE TO LOSE. A
// local id whose record has ALREADY become a `PublishedPointer` must resolve to the
// stored shared key WITHOUT appending anything — that is what makes a retry after a
// half-finished cascade publish only the grid instead of minting a second permanent
// copy of every member. `append` has no idempotency key, so the duplicate would be
// unmergeable and, from this app, unremovable.
//
// 🔴 EVERY COPY ASSERTION IS A WHOLE NORMALISED STRING AGAINST A LITERAL TYPED OUT
// HERE, and none of them calls the builder it checks. This repo has measured both
// failure modes on this exact kind of notice (see `unpublished.ts`'s
// `publishPointerFailedNotice`): a keyword guard is walkable by a reword that quietly
// re-implies something false, and a self-derived expectation moves with ANY reword and
// certifies whatever it finds. So a reword here is a test-breaking change on purpose.
//
// 🔴 AND ONE CLASS OF WORD IS ASSERTED ABSENT, because it is the specific lie this
// feature could tell: nothing may promise an ABORT, an UNDO or a ROLLBACK.
// `shared.append` is irreversible, so a notice implying the published items can be
// taken back would be false about rows that are already public and permanent.

import { describe, expect, it } from 'vitest';

import {
  cascadeConfirmNotice,
  cascadeCounts,
  cascadeStoppedNotice,
  cascadeUnresolvedNotice,
  nameList,
  planGridCascade,
  remapGridKeys,
  type CascadeDep,
  type MemberSources,
} from './gridCascade.js';
import type { GridInput } from './grids.js';

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();

/**
 * Build one axis' sources.
 *
 * 🔴 THE THREE BUCKETS ARE GIVEN PAIRWISE-DISTINCT VALUES IN EVERY CASE BELOW, and
 * that is not decoration: a fixture whose board key and pointer target are the same
 * string cannot tell "resolved from the pointer" from "left alone as a board key",
 * which is exactly the mutant that matters here.
 */
function sources(opts: {
  board?: string[];
  privateNames?: Record<string, string>;
  pointers?: Record<string, string>;
}): MemberSources {
  return {
    boardKeys: new Set(opts.board ?? []),
    privateNames: new Map(Object.entries(opts.privateNames ?? {})),
    pointers: new Map(Object.entries(opts.pointers ?? {})),
  };
}

const grid = (matchupKeys: string[], promptKeys: string[], name = 'Mixed Grid'): GridInput => ({
  name,
  description: '',
  matchupKeys,
  promptKeys,
});

// ===========================================================================
// planGridCascade — the classifier
// ===========================================================================

describe('🔴 planGridCascade classifies every member key', () => {
  it('a BOARD key needs nothing: no dependency, no rewrite, not unresolved', () => {
    const plan = planGridCascade(
      grid(['mk-a'], ['qk-1']),
      sources({ board: ['mk-a'] }),
      sources({ board: ['qk-1'] }),
    );
    expect(plan.deps, 'a published member was treated as a dependency').toEqual([]);
    // 🔴 THE REWRITE MAP MUST BE EMPTY, not "contains mk-a → mk-a". An identity
    // entry would make `remappedCount` lie and would hide a pointer branch that
    // silently rewrote a board key to itself.
    expect([...plan.resolved.entries()], 'a board key landed in the rewrite map').toEqual([]);
    expect(plan.unresolved, 'a board key was reported unresolvable').toEqual([]);
  });

  it('🔴 a LOCAL ID WITH A POINTER resolves to the stored shared key and appends NOTHING', () => {
    const plan = planGridCascade(
      // `dm-1` is a local id; `fk_7` is the shared key its earlier publish minted.
      // Distinct strings, and distinct from the board key, so each bucket is
      // attributable.
      grid(['mk-a', 'dm-1'], ['qk-1', 'dp-1']),
      sources({ board: ['mk-a'], pointers: { 'dm-1': 'fk_7' } }),
      sources({ board: ['qk-1'], pointers: { 'dp-1': 'fk_8' } }),
    );
    // 🔴 THE CLAIM: nothing to publish. This is what makes a RETRY after a
    // half-finished cascade correct instead of duplicating every member.
    expect(plan.deps, 'an already-published member was queued for a SECOND append').toEqual([]);
    expect(
      [...plan.resolved.entries()].sort(),
      'the pointer branch did not resolve the local id to its stored shared key',
    ).toEqual([
      ['dm-1', 'fk_7'],
      ['dp-1', 'fk_8'],
    ]);
    expect(plan.unresolved).toEqual([]);
  });

  it('🔴 a LOCAL ID WITH A LIVE PRIVATE RECORD is a DEPENDENCY, named', () => {
    const plan = planGridCascade(
      grid(['dm-1'], ['dp-1']),
      sources({ privateNames: { 'dm-1': 'Private Matchup P' } }),
      sources({ privateNames: { 'dp-1': 'Private Prompt Q' } }),
    );
    expect(plan.deps, 'the private records were not queued as dependencies').toEqual([
      { localId: 'dm-1', noun: 'matchup', name: 'Private Matchup P' },
      { localId: 'dp-1', noun: 'prompt', name: 'Private Prompt Q' },
    ]);
    // 🔴 NOTHING IS PRE-RESOLVED. The key is unknowable until the host mints it, so
    // a plan that already carried one would be carrying a guess.
    expect([...plan.resolved.entries()], 'a dependency was pre-resolved to some key').toEqual([]);
  });

  it('🔴 THE POINTER BRANCH WINS OVER THE PRIVATE BRANCH for the same local id', () => {
    // A record can be BOTH in the pointer map and (staler) in the private-names map
    // for one render — `publishedThisSession` filters the private list but the stores
    // are read asynchronously. Resolving must win; queueing a dependency would append
    // a SECOND permanent public row for a record that is already published.
    const plan = planGridCascade(
      grid(['dm-1'], []),
      sources({ privateNames: { 'dm-1': 'Private Matchup P' }, pointers: { 'dm-1': 'fk_7' } }),
      sources({}),
    );
    expect(
      plan.deps,
      'a record with a stored pointer was ALSO queued for publish — a second public row',
    ).toEqual([]);
    expect(plan.resolved.get('dm-1')).toBe('fk_7');
  });

  it('a key in NONE of the three buckets is `unresolved` and nothing else', () => {
    const plan = planGridCascade(
      grid(['gone-1'], ['gone-2']),
      sources({ board: ['mk-a'] }),
      sources({ board: ['qk-1'] }),
    );
    expect(plan.deps).toEqual([]);
    expect([...plan.resolved.entries()]).toEqual([]);
    expect(
      plan.unresolved,
      'a dangling member was not reported — §11.2 calls that case normal, not invisible',
    ).toEqual(['gone-1', 'gone-2']);
  });

  it('🔴 DEPENDENCIES COME OUT MATCHUPS FIRST, then PROMPTS, each in AUTHORED order', () => {
    // Authored order is deliberately NOT alphabetical and NOT the axis order, so a
    // sort or a flip is visible. `dm-2` precedes `dm-1`; the prompt axis is listed
    // first in the input object but must come second in the plan.
    const plan = planGridCascade(
      { name: 'g', description: '', promptKeys: ['dp-2', 'dp-1'], matchupKeys: ['dm-2', 'dm-1'] },
      sources({ privateNames: { 'dm-1': 'M one', 'dm-2': 'M two' } }),
      sources({ privateNames: { 'dp-1': 'P one', 'dp-2': 'P two' } }),
    );
    expect(
      plan.deps.map((d) => `${d.noun}:${d.name}`),
      'the dependency order is not matchups-then-prompts in authored order',
    ).toEqual(['matchup:M two', 'matchup:M one', 'prompt:P two', 'prompt:P one']);
  });

  it('a private record with an EMPTY name still becomes a dependency', () => {
    // The name is copy, not identity. A falsy name must not make the record vanish
    // from the plan — that would publish a grid pointing at it.
    const plan = planGridCascade(
      grid(['dm-1'], []),
      sources({ privateNames: { 'dm-1': '' } }),
      sources({}),
    );
    expect(plan.deps, 'an unnamed private record dropped out of the plan').toEqual([
      { localId: 'dm-1', noun: 'matchup', name: '' },
    ]);
  });
});

// ===========================================================================
// remapGridKeys — the rewrite
// ===========================================================================

describe('🔴 remapGridKeys rewrites a local id and nothing else', () => {
  it('swaps mapped keys, keeps unmapped ones, and preserves ORDER and name/description', () => {
    const out = remapGridKeys(
      {
        name: 'Mixed Grid',
        description: 'desc',
        matchupKeys: ['mk-a', 'dm-1', 'gone-1'],
        promptKeys: ['dp-1', 'qk-1'],
      },
      new Map([
        ['dm-1', 'fk_1'],
        ['dp-1', 'fk_2'],
      ]),
    );
    expect(out.matchupKeys, 'the matchup axis was not rewritten in place').toEqual([
      'mk-a',
      'fk_1',
      'gone-1',
    ]);
    expect(out.promptKeys, 'the prompt axis was not rewritten in place').toEqual([
      'fk_2',
      'qk-1',
    ]);
    expect(out.name).toBe('Mixed Grid');
    expect(out.description).toBe('desc');
  });

  it('an EMPTY map is the ordinary case and changes nothing', () => {
    const input = grid(['mk-a'], ['qk-1']);
    const out = remapGridKeys(input, new Map());
    expect(out).toEqual(input);
    // A new array, not the caller's — the caller still holds the stored record.
    expect(out.matchupKeys).not.toBe(input.matchupKeys);
  });
});

// ===========================================================================
// The copy. Whole normalised strings, against literals typed out here.
// ===========================================================================

const DEP_M: CascadeDep = { localId: 'dm-1', noun: 'matchup', name: 'Private Matchup P' };
const DEP_P: CascadeDep = { localId: 'dp-1', noun: 'prompt', name: 'Private Prompt Q' };
const DEP_M2: CascadeDep = { localId: 'dm-2', noun: 'matchup', name: 'Private Matchup R' };

describe('🔴 nameList and cascadeCounts', () => {
  it('enumerates one, two and three names', () => {
    expect(nameList([])).toBe('');
    expect(nameList(['A'])).toBe('A');
    expect(nameList(['A', 'B'])).toBe('A and B');
    expect(nameList(['A', 'B', 'C'])).toBe('A, B and C');
  });

  it('counts each axis and OMITS an axis with nothing in it', () => {
    expect(cascadeCounts([DEP_M, DEP_P])).toBe('1 matchup and 1 prompt');
    expect(cascadeCounts([DEP_M, DEP_M2])).toBe('2 matchups');
    expect(cascadeCounts([DEP_P])).toBe('1 prompt');
    expect(cascadeCounts([DEP_M, DEP_M2, DEP_P])).toBe('2 matchups and 1 prompt');
  });
});

describe('🔴 cascadeConfirmNotice — the whole string, and what it must not promise', () => {
  it('names the grid, the counts, the ORDER, and that publishing is final', () => {
    expect(norm(cascadeConfirmNotice('Mixed Grid', [DEP_M, DEP_P]))).toBe(
      'Publishing “Mixed Grid” also publishes 1 matchup and 1 prompt that are still ' +
        'private, because a public grid cannot point at a private row. They publish first ' +
        'and the grid last. Publishing cannot be undone.',
    );
  });

  it('🔴 promises NO abort, undo or rollback — there is none to promise', () => {
    // `shared.append` is irreversible. Any of these words would tell the viewer the
    // published members can be taken back, which nothing in this app can do.
    const text = cascadeConfirmNotice('Mixed Grid', [DEP_M, DEP_P]);
    expect(text, 'the confirm implies the publish can be reversed').not.toMatch(
      /abort|roll ?back|revert|undone later|take.{0,6}back/i,
    );
    // …and the one "undo" it DOES contain is the denial, asserted positively so this
    // case cannot pass by the sentence losing the clause altogether.
    expect(text).toContain('Publishing cannot be undone.');
  });
});

describe('🔴 cascadeStoppedNotice — three branches, three whole strings', () => {
  it('A DEPENDENCY failed: names what landed, what did not, and that the grid did not', () => {
    expect(
      norm(
        cascadeStoppedNotice({
          gridName: 'Mixed Grid',
          published: ['Private Matchup P'],
          stoppedAt: 'Private Prompt Q',
          hostError: 'QUOTA_EXCEEDED',
        }),
      ),
    ).toBe(
      '1 item was published and is now public and permanent: Private Matchup P. ' +
        'Private Prompt Q could not be published (QUOTA_EXCEEDED), so the grid “Mixed Grid” ' +
        'was not published either — a public grid must not point at a private row. The grid ' +
        'is unchanged and still private.',
    );
  });

  it('THE GRID failed after every dependency landed: says a retry will not duplicate them', () => {
    expect(
      norm(
        cascadeStoppedNotice({
          gridName: 'Mixed Grid',
          published: ['Private Matchup P', 'Private Prompt Q'],
          stoppedAt: null,
          hostError: 'RATE_LIMITED',
        }),
      ),
    ).toBe(
      '2 items were published and are now public and permanent: Private Matchup P and ' +
        'Private Prompt Q. The grid “Mixed Grid” itself could not be published ' +
        '(RATE_LIMITED), so it is still private and still lists them. Publishing it again ' +
        'will not publish them a second time.',
    );
  });

  it('🔴 THE GRID failed with NOTHING published: no dangling "them"', () => {
    // Reachable, not defensive: a cascade whose dependencies all landed and whose grid
    // was refused leaves a plan with no dependencies, so a second failing attempt
    // arrives here with an empty `published`. The "still lists them" clause must not
    // survive into a sentence that has no "them".
    const text = norm(
      cascadeStoppedNotice({
        gridName: 'Mixed Grid',
        published: [],
        stoppedAt: null,
        hostError: 'RATE_LIMITED',
      }),
    );
    expect(text).toBe(
      'Nothing was published. The grid “Mixed Grid” itself could not be published ' +
        '(RATE_LIMITED), so it is still private.',
    );
    expect(text, 'the empty-publish branch still refers to "them"').not.toMatch(/them/);
  });

  it('🔴 no branch promises a rollback, and every one quotes the host error verbatim', () => {
    for (const spec of [
      { published: ['A'], stoppedAt: 'B' },
      { published: ['A', 'B'], stoppedAt: null },
      { published: [], stoppedAt: null },
    ] as const) {
      const text = cascadeStoppedNotice({
        gridName: 'G',
        published: spec.published,
        stoppedAt: spec.stoppedAt,
        hostError: 'HOST_SAID_NO',
      });
      expect(text, `branch ${JSON.stringify(spec)} implies a rollback`).not.toMatch(
        /abort|roll ?back|revert|nothing (?:was )?changed|undone/i,
      );
      expect(text, `branch ${JSON.stringify(spec)} dropped the host error`).toContain(
        'HOST_SAID_NO',
      );
    }
  });
});

describe('🔴 cascadeUnresolvedNotice — the whole string, both pluralisations', () => {
  it('singular', () => {
    expect(norm(cascadeUnresolvedNotice(1))).toBe(
      '1 member of this grid cannot be found — not on the board and not among your private ' +
        'items. Publishing keeps it listed, and the grid renders without it.',
    );
  });

  it('plural', () => {
    expect(norm(cascadeUnresolvedNotice(2))).toBe(
      '2 members of this grid cannot be found — not on the board and not among your private ' +
        'items. Publishing keeps them listed, and the grid renders without them.',
    );
  });

  it('🔴 does NOT claim the key is dropped, because `normalizeKeys` keeps it', () => {
    // §11.2 carries a dangling key into the payload rather than truncating, so a
    // sentence saying it is removed would describe behaviour the app does not have.
    expect(cascadeUnresolvedNotice(2)).not.toMatch(/remov|dropp|delet|discard/i);
  });
});
