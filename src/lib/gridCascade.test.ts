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
  cascadeLandedSentence,
  cascadeRefusal,
  cascadeStoppedNotice,
  nameList,
  planGridCascade,
  remapGridKeys,
  type BoardRead,
  type CascadeDep,
  type GridCascadePlan,
  type MemberSources,
} from './gridCascade.js';
import { newLocalId } from './unpublished.js';
import type { GridInput } from './grids.js';

/**
 * 🔴 LOCAL-ID-SHAPED FIXTURES, MINTED BY THE REAL MINTER.
 *
 * The unresolved-bucket case used to feed `'gone-1'` / `'gone-2'`, which are not
 * local-id-shaped — so it could not tell the CORRECT pass-through (a withdrawn
 * SHARED key) from the FORBIDDEN one (an unaccountable per-viewer LOCAL id), and the
 * three paths that put a local id on the public board walked straight past it.
 * `newLocalId` is what `drafts.ts`/`unpubPrompts.ts` actually call, so these strings
 * have production's shape rather than a guessed one.
 *
 * ⚠️ AND THE SHAPE IS NOT WHAT THE GUARD TESTS. `cascadeRefusal` refuses on STATE —
 * "is this key in one of the three buckets?" — never on the key's text, because a
 * host-minted shared key's real shape is not verified anywhere in this repo. These
 * fixtures exist so the case EXERCISES the dangerous input, not so the code can
 * pattern-match it.
 */
const DEAD_MATCHUP_ID = newLocalId('draft');
const DEAD_PROMPT_ID = newLocalId('unpubprompt');

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

  it('🔴 a LOCAL ID in NONE of the three buckets lands in `unresolved`', () => {
    // 🔴 THE INPUT THE OLD VERSION OF THIS CASE COULD NOT EXERCISE. Its fixtures were
    // `'gone-1'` / `'gone-2'`, which look like withdrawn shared keys — the ONE thing
    // this bucket could hold before private members existed, and the one thing it is
    // right to carry through. These are LOCAL IDS with no live record and no pointer,
    // which is what three measured paths produce, and what must never reach the board.
    const plan = planGridCascade(
      grid([DEAD_MATCHUP_ID], [DEAD_PROMPT_ID]),
      sources({ board: ['mk-a'] }),
      sources({ board: ['qk-1'] }),
    );
    expect(plan.deps, 'an unaccountable local id was queued as a publishable dependency').toEqual(
      [],
    );
    expect(
      [...plan.resolved.entries()],
      'an unaccountable local id was given a key out of nowhere',
    ).toEqual([]);
    expect(
      plan.unresolved,
      'an unaccountable local id did not reach the bucket the publish boundary reads',
    ).toEqual([DEAD_MATCHUP_ID, DEAD_PROMPT_ID]);
  });

  it('a WITHDRAWN SHARED key lands in the same bucket — the two are indistinguishable here', () => {
    // ⚠️ AND THAT IS THE ARGUMENT FOR REFUSING BOTH. Nothing in a key's text separates
    // them, so `cascadeRefusal` tests the STATE. This case exists to make the
    // indistinguishability explicit rather than implied: if a future reader wants to
    // allow the withdrawn case through, THIS is the assertion that tells them the
    // planner cannot tell them apart.
    const plan = planGridCascade(
      grid(['shared_01HZQ8GONE'], []),
      sources({ board: ['mk-a'] }),
      sources({}),
    );
    expect(plan.unresolved).toEqual(['shared_01HZQ8GONE']);
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
    // 🔴 THE SINGLE-AXIS ARMS COME FIRST, AND THAT ORDER IS THE MEASUREMENT. The
    // MIXED case cannot say WHICH arm a mutation removed, so with it first every
    // arm-removing mutant dies on "the mixed-axis count is wrong" and the
    // arm-specific diagnostics never execute — measured, on the mutant that deletes
    // the prompt arm. Each arm is now asserted alone, before the mixed case.
    //
    // ⚠️ The counts are deliberately 2-vs-1 rather than 1-vs-1 in the last case, so a
    // SWAP of the two arms is visible as well as a deletion.
    expect(cascadeCounts([DEP_P]), 'the prompt arm is missing from the counts').toBe('1 prompt');
    expect(cascadeCounts([DEP_M]), 'the matchup arm is missing from the counts').toBe('1 matchup');
    expect(cascadeCounts([DEP_M, DEP_M2]), 'the matchup-only count is wrong').toBe('2 matchups');
    expect(cascadeCounts([DEP_M, DEP_P]), 'the mixed-axis count is wrong').toBe(
      '1 matchup and 1 prompt',
    );
    expect(cascadeCounts([DEP_M, DEP_M2, DEP_P]), 'the 2×1 mixed count is wrong').toBe(
      '2 matchups and 1 prompt',
    );
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

describe('🔴 cascadeLandedSentence — the shared half, both pluralisations and the zero', () => {
  it('names every published item, with the verb agreeing', () => {
    expect(cascadeLandedSentence([]), 'the zero sentence moved').toBe('Nothing was published.');
    expect(cascadeLandedSentence(['A']), 'the singular sentence moved').toBe(
      '1 item was published and is now public and permanent: A.',
    );
    expect(cascadeLandedSentence(['A', 'B']), 'the plural sentence moved').toBe(
      '2 items were published and are now public and permanent: A and B.',
    );
  });
});

describe('🔴 cascadeStoppedNotice — four outcomes, and the one that is NOT here', () => {
  it('A DEPENDENCY’s APPEND was refused: names what landed, what did not, and that the grid did not', () => {
    expect(
      norm(
        cascadeStoppedNotice({
          gridName: 'Mixed Grid',
          published: ['Private Matchup P'],
          stoppedAt: { name: 'Private Prompt Q', appended: false },
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

  it('🔴 A DEPENDENCY’s POINTER write failed: it IS published, and the sentence says so', () => {
    // 🔴 THE ARM THAT DID NOT EXIST, AND THE SELF-CONTRADICTION IT REPLACES. This
    // sub-case was routed into the `appended: false` arm above with the dependency
    // left OUT of `published`, so the notice opened "Nothing was published." and then
    // quoted a host error about a row the append log proves is public and permanent.
    // One sentence, contradicting itself. The dependency is now named in `published`
    // (its row really is public) and the arm says which HALF failed.
    const text = norm(
      cascadeStoppedNotice({
        gridName: 'Mixed Grid',
        published: ['Private Matchup P'],
        stoppedAt: { name: 'Private Matchup P', appended: true },
        hostError: 'QUOTA_EXCEEDED',
      }),
    );
    // The named claim first: it must NOT say nothing was published.
    expect(
      text,
      'the half-published arm still claims nothing was published, about a public row',
    ).not.toMatch(/Nothing was published/);
    // 🔴 AND A CLAIM THE ARM'S **EXISTENCE** OWNS, named separately. The assertion
    // above cannot see the arm being deleted: the caller supplies `published`, so the
    // landed sentence is correct either way and only the WHICH-HALF clause disappears.
    // Measured — a mutant deleting the arm died on the whole-string `.toBe` below,
    // which carries no message. This is the clause that only this arm produces.
    expect(
      text,
      'the half-published arm is gone — the notice no longer says WHICH half failed',
    ).toContain("own private copy could not be updated with its key");
    expect(text).toBe(
      '1 item was published and is now public and permanent: Private Matchup P. But Private ' +
        "Matchup P's own private copy could not be updated with its key (QUOTA_EXCEEDED), so " +
        'you have no stored handle on that row. The grid “Mixed Grid” was not published — a ' +
        'public grid must not point at a member this app can no longer account for. The grid ' +
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
    // ⚠️ DEFENSIVE — NO UI ROUTE REACHES THIS STATE, and this case is the only thing
    // that exercises it. Both previous rationales are dead: the in-dialog retry was
    // killed by moving `closeModal()` into `finally`, and "the direct no-dependency
    // publish path" was never true — every `cascadeStoppedNotice` call site is inside
    // `runGridCascade`, which only the dialog reaches, and the dialog opens only on a
    // non-empty dependency list. The copy is still worth pinning: the "still lists
    // them" clause must not survive into a sentence that has no "them".
    const text = norm(
      cascadeStoppedNotice({
        gridName: 'Mixed Grid',
        published: [],
        stoppedAt: null,
        hostError: 'RATE_LIMITED',
      }),
    );
    // 🔴 THE NAMED CLAIM COMES FIRST, DELIBERATELY. A whole-string `.toBe` placed
    // above it would kill every mutant with ITS diff and this assertion's own
    // diagnostic would never execute — the pre-emption this repo has measured five
    // times. The `.toBe` below is the stronger guard and is kept; it just runs second.
    expect(text, 'the empty-publish branch still refers to "them"').not.toMatch(/them/);
    expect(text).toBe(
      'Nothing was published. The grid “Mixed Grid” itself could not be published ' +
        '(RATE_LIMITED), so it is still private.',
    );
  });

  it('🔴 no branch promises a rollback, and every one quotes the host error verbatim', () => {
    for (const spec of [
      { published: ['A'], stoppedAt: { name: 'B', appended: false } },
      { published: ['A', 'B'], stoppedAt: { name: 'B', appended: true } },
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

// ===========================================================================
// 🔴 cascadeRefusal — THE PUBLISH BOUNDARY
//
// This replaces `cascadeUnresolvedNotice`, which DISCLOSED an unaccountable member
// and let the publish proceed. Three measured paths put a per-viewer LOCAL ID on the
// permanent public board that way, with no error and (because all three have zero
// dependencies) no dialog either. Round 0 proposed deleting the disclosure; this is
// the stronger reading — it is kept and rewired onto the REFUSAL path, which is where
// a viewer can act on it.
// ===========================================================================

/** A plan with `n` unaccountable members and nothing else — the refusal's only input. */
const planWith = (unresolved: string[]): GridCascadePlan => ({
  deps: [],
  resolved: new Map(),
  unresolved,
});

describe('🔴 cascadeRefusal — what may reach `shared.append`', () => {
  it('🔴 PERMITS a plan whose every member is accounted for', () => {
    // The NEGATIVE CONTROL for every refusal below. Without it, "refuses" is
    // satisfiable by a boundary that refuses unconditionally — which would break
    // publishing outright and pass every other case in this block.
    expect(
      cascadeRefusal({
        gridName: 'Mixed Grid',
        plan: {
          deps: [DEP_M],
          resolved: new Map([['dp-1', 'fk_2']]),
          unresolved: [],
        },
        scanComplete: true,
        boardRead: 'complete',
      }),
      'a fully accountable grid was refused — publishing is broken, not guarded',
    ).toBeNull();
  });

  it('🔴 PERMITS a fully accountable grid even while the board is UNREAD or ERRORED', () => {
    // 🔴 THE OTHER HALF OF THE REGRESSION. The fix had to stop refusing ordinary
    // publishes on an unread board — but it must not start refusing on the FLAGS
    // either. These two states return `null` because `unresolved` is empty, which is
    // the whole design: per-key positive accounting is the guard, the flags only pick
    // the sentence. A boundary that gated on `boardRead` would refuse every publish
    // for the length of a page load.
    for (const boardRead of ['unread', 'error', 'truncated'] as const) {
      expect(
        cascadeRefusal({
          gridName: 'G',
          plan: { deps: [DEP_M], resolved: new Map(), unresolved: [] },
          scanComplete: false,
          boardRead,
        }),
        `boardRead=${boardRead} refused a grid whose every key is accounted for`,
      ).toBeNull();
    }
  });

  it('🔴 REFUSES an unaccountable member, and the refusal is the whole string', () => {
    const text = cascadeRefusal({
      gridName: 'Mixed Grid',
      plan: planWith([DEAD_MATCHUP_ID]),
      scanComplete: true,
      boardRead: 'complete',
    });
    expect(text, 'an unaccountable member was PERMITTED onto the public board').not.toBeNull();
    expect(norm(text!)).toBe(
      '1 member of “Mixed Grid” cannot be accounted for: it is not among your private items, ' +
        'and not on the board as this build can read it — it is either gone, or in a shape ' +
        'this build does not understand. Publishing is refused rather than putting a key on ' +
        'the public board that nobody — including you — could resolve afterwards. ⚠ The ' +
        'picker keeps members it cannot show, so editing the grid cannot remove it: try a ' +
        'newer build first, and discard this grid and build it again if that does not help.',
    );
  });

  it('plural, same branch', () => {
    expect(
      norm(
        cascadeRefusal({
          gridName: 'Mixed Grid',
          plan: planWith([DEAD_MATCHUP_ID, DEAD_PROMPT_ID]),
          scanComplete: true,
          boardRead: 'complete',
        })!,
      ),
    ).toBe(
      '2 members of “Mixed Grid” cannot be accounted for: they are not among your private ' +
        'items, and not on the board as this build can read it — they are either gone, or ' +
        'in a shape this build does not understand. Publishing is refused rather than ' +
        'putting keys on the public board that nobody — including you — could resolve ' +
        'afterwards. ⚠ The picker keeps members it cannot show, so editing the grid cannot ' +
        'remove them: try a newer build first, and discard this grid and build it again if ' +
        'that does not help.',
    );
  });

  it('🔴 an INCOMPLETE PRIVATE SCAN names THAT cause, not a removal', () => {
    // 🔴 THE INVERSION THE `ScanResult` CAPTURE EXISTS FOR. When the `draft:v1:`
    // listing throws or truncates, the member may be sitting in the viewer's own
    // storage unread — so "not among your private items" would be a claim the app has
    // no evidence for. Same honesty rule as `missingMembersNotice`'s `boardTruncated`
    // split, one store over.
    const text = norm(
      cascadeRefusal({
        gridName: 'Mixed Grid',
        plan: planWith([DEAD_MATCHUP_ID]),
        scanComplete: false,
        boardRead: 'complete',
      })!,
    );
    expect(
      text,
      'the incomplete-scan branch still asserts the member is not among the private items',
    ).not.toMatch(/not among your private items/);
    expect(text).toBe(
      '1 member of “Mixed Grid” cannot be accounted for, because this app could not read ' +
        'all of your private items. It therefore cannot tell whether it is yours and ' +
        'unpublished, or simply gone. Publishing is refused rather than putting a key on the ' +
        'public board that nobody — including you — could resolve afterwards. Reload and try ' +
        'again.',
    );
  });

  it('🔴 a TRUNCATED BOARD SCAN does not claim the member is "not on the board"', () => {
    // Finding 7: the old disclosure asserted "not on the board" unconditionally.
    // "Missing" is a set difference against the rows the scan actually READ, so on a
    // truncated board the member may be there and simply unfetched.
    const text = norm(
      cascadeRefusal({
        gridName: 'Mixed Grid',
        plan: planWith([DEAD_MATCHUP_ID]),
        scanComplete: true,
        boardRead: 'truncated',
      })!,
    );
    expect(
      text,
      'the truncated-board branch still asserts the member is not on the board',
    ).not.toMatch(/not on the board/);
    expect(text).toBe(
      '1 member of “Mixed Grid” cannot be accounted for: it is not among your private items, ' +
        'and not in the part of the board this app could read — this board has more entries ' +
        'than one load fetches. Publishing is refused rather than putting a key on the public ' +
        'board that nobody — including you — could resolve afterwards. ⚠ A retry may not ' +
        'help: the same members may be past the same cap every time.',
    );
  });

  it.each(['unread', 'error'] as const)(
    '🔴 boardRead=%s NEVER tells the viewer to remove the member — it is a REGRESSION guard',
    (boardRead) => {
      // 🔴 THE MEASURED REGRESSION THIS BRANCH EXISTS FOR. `boardRead` replaced a
      // `boardTruncated` boolean that was written only on the board read's SUCCESS
      // arm — so a read that THREW, and the window before the first read resolves,
      // were both `false`, every ordinary published member fell through to
      // `unresolved`, and this function refused with the branch that says the member
      // is not on the board and tells the viewer to DELETE it. A viewer who followed
      // that advice destroyed good members over a publish that would have worked a
      // second later.
      const text = norm(
        cascadeRefusal({
          gridName: 'Mixed Grid',
          plan: planWith(['mk-a', 'qk-1']),
          scanComplete: true,
          boardRead,
        })!,
      );
      // The two named claims FIRST, in the order the hazard matters: no destructive
      // remedy, and no assertion about a board this app never read.
      expect(
        text,
        `boardRead=${boardRead} advises destroying a grid whose members the app never read`,
      ).not.toMatch(/remove|discard/i);
      expect(
        text,
        `boardRead=${boardRead} asserts the members are not on the board it could not read`,
      ).not.toMatch(/not on the board/);
      expect(text).toBe(
        '2 members of “Mixed Grid” cannot be accounted for, because this app has not been ' +
          'able to read the board. It therefore cannot tell whether they are published rows ' +
          'it has not seen, or gone. Publishing is refused rather than putting keys on the ' +
          'public board that nobody — including you — could resolve afterwards. Reload and ' +
          'try again.',
      );
    },
  );

  it('🔴 ONLY the `complete` branch may advise DESTROYING anything', () => {
    // 🔴 THE LOOP IS DERIVED FROM `BoardRead`, NOT TYPED OUT BESIDE IT. It used to be
    // a `['unread','error','truncated','complete'] as const` literal under a
    // description that claimed "the relationship, over the whole enum, so a fifth
    // value cannot quietly inherit the destructive remedy" — a docstring naming a
    // relationship whose body inspected one side, for the third time in this PR. A
    // fifth union member simply would not have been visited.
    //
    // `satisfies Record<BoardRead, 1>` is what fixes that at COMPILE time: adding a
    // member to `BoardRead` makes this object literal fail to type-check until it is
    // listed here, so the loop cannot silently stop covering the enum.
    const EVERY_BOARD_READ = {
      unread: 1,
      error: 1,
      truncated: 1,
      complete: 1,
    } satisfies Record<BoardRead, 1>;
    const states = Object.keys(EVERY_BOARD_READ) as BoardRead[];
    // POSITIVE CONTROL on the derivation: it really did enumerate something.
    expect(states.length, 'the derived enum list is empty — this case covers nothing').toBe(4);

    const destructive: string[] = [];
    for (const boardRead of states) {
      const text = cascadeRefusal({
        gridName: 'G',
        plan: planWith([DEAD_MATCHUP_ID]),
        scanComplete: true,
        boardRead,
      })!;
      // 🔴 EVERY DESTRUCTIVE VERB, NOT JUST "discard". The old pattern was
      // `/discard/i` alone, so a remedy spelled "delete" or "remove" passed — a
      // spelled guard walkable by rewording the one word it knew.
      if (/discard|delete|remove/i.test(text)) destructive.push(boardRead);
    }
    expect(
      destructive,
      'a board state the app could not fully read still advises destroying the grid',
    ).toEqual(['complete']);
  });

  it('🔴 THE INCOMPLETE SCAN WINS over the truncated board — one cause, named', () => {
    // Both flags can be true at once. The private-scan cause is the one that makes the
    // app unable to tell the two cases apart at all, so it is the one reported; a
    // sentence naming both would leave the viewer no action.
    const both = cascadeRefusal({
      gridName: 'G',
      plan: planWith([DEAD_MATCHUP_ID]),
      scanComplete: false,
      boardRead: 'truncated',
    })!;
    expect(both).toContain('could not read all of your private items');
    expect(both, 'two causes were named at once').not.toMatch(/not in the part of the board/);
  });

  it('🔴 no branch claims the key is REMOVED, and every branch refuses in words', () => {
    for (const spec of [
      { scanComplete: true, boardRead: 'complete' },
      { scanComplete: true, boardRead: 'truncated' },
      { scanComplete: true, boardRead: 'unread' },
      { scanComplete: true, boardRead: 'error' },
      { scanComplete: false, boardRead: 'complete' },
    ] as const) {
      const text = cascadeRefusal({
        gridName: 'G',
        plan: planWith([DEAD_MATCHUP_ID]),
        ...spec,
      })!;
      // `normalizeKeys` carries a key into the payload rather than truncating it, and
      // nothing here deletes anything from the stored grid — so a sentence saying the
      // member was dropped would describe behaviour the app does not have. (The viewer
      // is ASKED to remove it; that is an instruction, not a claim about what happened,
      // which is why the pattern is tense-specific.)
      expect(text, `branch ${JSON.stringify(spec)} claims the key was removed`).not.toMatch(
        /was (?:removed|dropped|deleted|discarded)/i,
      );
      expect(text, `branch ${JSON.stringify(spec)} does not say it refuses`).toContain(
        'Publishing is refused',
      );
    }
  });
});
