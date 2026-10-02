// 🔴 THE ROW ACTION CLUSTER SITS BELOW THE CONTENT, ON EVERY CARD SHAPE.
//
// ── THE DEFECT, MEASURED ────────────────────────────────────────────────────
//
// Every list card was `<Group justify="space-between" align="flex-start">` with the
// content on the left and the row's controls (`⋮` plus the vote affordance) on the
// right. Measured live on 0.4.14, two matchup cards in ONE list: the card whose
// description wrapped to 1 line put the control pair at **top-right (y 17, x 1055)**
// and the card whose description wrapped to 2 lines put the SAME pair at
// **bottom-left (y 113, x 17)**. Same controls, same list, opposite corners.
//
// The mechanism is the ownership mirror in `MatchupBody`, and that mirror is CORRECT:
// a foreign card's vote is an interactive `VoteButton` inside the cluster while the
// owner's is a non-interactive `VoteTally` (`VoteButton.tsx`'s `VoteCount` split), so
// the cluster's intrinsic width differs per row, the flex line wraps for some rows and
// not others, and the wrapped cluster lands under the content at the left margin.
// 🔴 DO NOT "FIX" THE VoteButton/VoteTally SPLIT — it is what lets an author see
// their own score without being offered the press. Moving the cluster BELOW the
// content removes the reflow structurally: there is no second flex item on the
// content's line left to wrap.
//
// ── 🔴 WHAT THIS FILE CAN AND CANNOT ASSERT ─────────────────────────────────
//
// jsdom performs NO LAYOUT. `getBoundingClientRect()`, `scrollWidth` and
// `clientWidth` are all 0 here, so NOTHING in this file is evidence about the
// positions quoted above, about whether the cluster still wraps, or about how any of
// it looks. Those remain unverified from this repo and need a human in a real host.
//
// What IS assertable, and is the whole content of the change, is the emitted DOM
// SHAPE. For each card shape:
//
//   1. the card renders exactly ONE `row-actions` cluster;
//   2. its PARENT is a `Stack` — `data-civitai-ui="stack"`, the pack's COLUMN
//      container — and not a `Group` (`"group"`, the pack's ROW container);
//   3. that parent carries NO `justify-content: space-between` inline, which is the
//      property the old shape's reflow depended on;
//   4. `row-actions` is the LAST element child of that parent, i.e. the bottom of the
//      card.
//
// ── 🔴 WHAT THE BASE MATRIX DOES AND DOES NOT PROVE ─────────────────────────
//
// ⚠️ THIS FILE USED TO CLAIM "Claims 2–4 are what fail at `bb63087`", AND THAT
// ATTRIBUTION WAS FALSE. Rolled back to base, all six shape cases fail at CLAIM 1 —
// `Unable to find … [data-testid="row-actions"]`, because the testid is NEW — so claims
// 2, 3 and 4 never execute there. A 6/6-red matrix over a whole-file rollback is
// evidence that a new selector did not exist at base and nothing more: it is the
// enclosing-condition shape, where the mutation removes the guard TOGETHER with the
// condition that reaches it.
//
// 🔴 THE GUARD IS NONETHELESS SOUND, AND THIS IS THE MEASUREMENT THAT SHOWS IT.
// ISOLATED MUTATION: `MatchupBody`'s outer `<Stack gap={10}>` changed to
// `<Group justify="space-between" align="flex-start">` — i.e. the defect itself,
// reintroduced in ONE file, with the `row-actions` testid KEPT so claim 1 still passes
// and the later claims still run. Result, re-run at this HEAD: 2 failed / 6 passed of
// the 8 cases in this file. The `MatchupBody` shape case dies on CLAIM 2's own
// assertion with its own message — `expected 'group' to be 'stack'` — and the
// STRUCTURAL ledger dies on its own, with
// `expected [ 'components/MatchupBody.tsx' ] to deeply equal []`. That is each guard
// firing on its own condition, on the narrowest expression that can be wrong, which is
// what a whole-file rollback cannot show.
//
// ⚠️ THE EARLIER REPORT OF THIS MUTATION SAID "1 failed / 6 passed" AND THAT NUMBER IS
// STALE RATHER THAN WRONG: it was taken before the structural ledger existed and before
// claim 5 was deleted, so the file held 7 cases and only one guard could see the
// mutant. Re-measured here rather than restated.
//
// 🔴 AND THE SECOND LEDGER WAS VALIDATED THE SAME WAY, SEPARATELY. Reverting
// `GridPicker`'s option row to the `space-between` / `flex-start` shape takes the
// structural ledger red — `expected [ 'components/GridPicker.tsx' ] to deeply equal []`
// — at 1 failed / 7 passed, with the ACTION-CLUSTER ledger and all six shape cases
// GREEN. That green is the point: the first ledger is structurally blind to a card
// shape that ships the defect under no `row-actions` id, which is why there are two.
//
// ⚠️ AND NOTHING HERE IS A CLAIM ABOUT THE OTHER FOUR SHAPES' MUTANTS. Two isolated
// mutations were run, in `MatchupBody` and `GridPicker`. The remaining shapes are
// covered by the SET ledgers below rather than by four more mutants.
//
// ── WHY FIVE SHAPES AND TWO LEDGERS ─────────────────────────────────────────
//
// The defect is shared by five independently-written card bodies (two community row
// bodies, the private row, and two grid cards) — exercised below as SIX cases, because
// the private row is rendered twice: once bare and once with the `preview` strip only
// `MyGridsView` passes, where a third child sits between the content and the cluster.
// A per-shape case would leave a sixth FILE free to reintroduce the defect silently,
// so the SOURCE LEDGERS at the bottom assert SETS. There are TWO of them because a new
// card shape can ship the defect under its own testid or under none at all, and the
// first ledger cannot see either:
//
//   - the ACTION-CLUSTER ledger — the exact set of production files rendering
//     `data-testid="row-actions"`, failing when it GROWS (a card shape nobody checked)
//     and when it SHRINKS (a shape that lost its cluster or had the id renamed);
//   - the STRUCTURAL ledger — the exact set of production files containing the
//     SIGNATURE, `justify="space-between"` together with `align="flex-start"` on one
//     element. That is the shape with a variable-width right cluster on the content's
//     own flex line, whatever the id on it. It found a SIXTH instance the first ledger
//     was blind to: `GridPicker`'s option row, which has the identical two-flex-item
//     shape with an optional `meta` plus a conditional `Selected`/`Limit reached`
//     badge, under no `row-actions` id at all because nothing in that cluster is an
//     action. Its allowlist is EMPTY, and an addition to it is a decision someone has
//     to write down.
//
// 🔴 THE ID IS NOUN-NEUTRAL (`row-actions`, not `matchup-actions`) FOR TWO REASONS.
// One concept spelled five ways is five things to keep in step; and a matchup-spelled
// selector would have to join `renameWireCompat.test.ts`'s 33-entry ledger for a name
// that says nothing about matchups.

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

import { SYSTEM_GRID_DOM_KEY } from './lib/gridEntries.js';
import { scannedSources, stripComments } from './lib/sourceScan.js';

import { GridsView } from './components/GridsView.js';
import { MatchupBody } from './components/MatchupBody.js';
import { MyGridsView } from './components/MyGridsView.js';
import { MyList } from './components/MyList.js';
import { PromptBody } from './components/PromptBody.js';
import { fakeGatedCell } from './test-helpers.js';
import type { CombinationRow, GridRow, PromptRow, UnpublishedGrid } from './types.js';

const VIEWER_ID = 42;
/** The rows' author — distinct from the viewer, so the FOREIGN-row branch renders
 *  (an interactive `VoteButton` plus a Report item), which is the wider cluster. */
const OTHER_ID = 7;

const matchupRow: CombinationRow = {
  key: 'mk-a',
  count: 3,
  authorUserId: OTHER_ID,
  name: 'Echo showdown',
  description: 'two realism checkpoints, one of them freshly merged',
  data: {
    v: 2,
    kind: 'combination',
    configs: [
      {
        id: 'cfg-a',
        checkpoint: {
          versionId: 1001,
          modelId: 500,
          baseModel: 'SDXL 1.0',
          modelName: 'JuggernautXL',
        },
        loras: [],
      },
    ],
  },
};

const promptRow: PromptRow = {
  key: 'qk-1',
  count: 2,
  authorUserId: OTHER_ID,
  name: 'Whisky portrait',
  description: 'a moody close-up with a lot of description text behind it',
  data: { v: 3, kind: 'prompt', default: { prompt: 'a moody close-up', params: {} } },
};

const gridRow: GridRow = {
  key: 'gk-1',
  count: 5,
  authorUserId: OTHER_ID,
  name: 'Realism sweep',
  description: 'the realism checkpoints against the portrait prompts',
  data: { v: 1, kind: 'grid', matchupKeys: ['mk-a'], promptKeys: ['qk-1'] },
};

/** The viewer's OWN grid row — `MyGridsView` only lists rows the caller narrowed. */
const ownGridRow: GridRow = { ...gridRow, key: 'gk-own', authorUserId: VIEWER_ID };

const privateGrid: UnpublishedGrid = {
  v: 1,
  localId: 'ug-1',
  name: 'A private grid',
  description: 'not on the board yet',
  matchupKeys: ['mk-a'],
  promptKeys: ['qk-1'],
  updatedAt: '2026-10-01T00:00:00.000Z',
};

/**
 * The five card shapes, as `[label, render, cardTestId, contentTestId]`.
 *
 * `contentTestId` is a node that is unambiguously CONTENT rather than an action, so
 * claim 5 is about a real content/action pair and not about two controls.
 */
const SHAPES: ReadonlyArray<
  readonly [label: string, mount: () => void, card: string, content: string]
> = [
  [
    'MatchupBody — the community matchup card',
    () =>
      render(
        <div data-testid="shape-card">
          <MatchupBody
            combo={matchupRow}
            voted={false}
            reported={false}
            viewerId={VIEWER_ID}
            onVote={vi.fn()}
            onUnvote={vi.fn()}
            onRequireAuth={vi.fn()}
            onReport={vi.fn()}
          />
        </div>,
      ),
    'shape-card',
    'matchup-config-summary',
  ],
  [
    'PromptBody — the community prompt card',
    () =>
      render(
        <div data-testid="shape-card">
          <PromptBody
            prompt={promptRow}
            voted={false}
            reported={false}
            viewerId={VIEWER_ID}
            /* 🔴 `detail` SO THERE IS A NAMED CONTENT NODE TO ORDER AGAINST — and so
               the two bodies between them cover BOTH branches: the matchup shape above
               is rendered as a CARD (`matchup-config-summary`) and this one as the
               DETAIL MODAL (`prompt-detail-text`). One component, two call shapes, and
               the cluster's placement is the same claim in each. */
            detail
            onVote={vi.fn()}
            onUnvote={vi.fn()}
            onRequireAuth={vi.fn()}
            onReport={vi.fn()}
          />
        </div>,
      ),
    'shape-card',
    'prompt-detail-text',
  ],
  [
    "MyList — the viewer's PRIVATE row",
    () =>
      render(
        <MyList
          noun="matchup"
          drafts={[
            {
              localId: 'dm-1',
              name: 'A private matchup',
              meta: '2 models',
              description: 'kept in my own storage, with a long enough line to wrap',
            },
          ]}
          rows={[]}
          keyOf={(r: CombinationRow) => r.key}
          archivedKeys={new Set()}
          loading={false}
          onNew={vi.fn()}
          onEditDraft={vi.fn()}
          onDiscardDraft={vi.fn()}
          onPublishDraft={vi.fn()}
          onEditPublished={vi.fn()}
          onWithdraw={vi.fn()}
          renderCard={() => null}
        />,
      ),
    'unpublished-card',
    'unpublished-name',
  ],
  [
    'MyGridsView — the published grid card on My Benchmarks',
    () =>
      render(
        <MyGridsView
          ownGrids={[ownGridRow]}
          combinations={[matchupRow]}
          prompts={[promptRow]}
          results={[]}
          GatedCell={fakeGatedCell()}
          viewerId={VIEWER_ID}
          loading={false}
          error={null}
          publishError={null}
          archivedKeys={new Set()}
          unpublished={[]}
          onRequireAuth={vi.fn()}
          onWithdraw={vi.fn()}
          onNewUnpublished={vi.fn()}
          onEditUnpublished={vi.fn()}
          onDiscardUnpublished={vi.fn()}
          onPublishUnpublished={vi.fn()}
          onEditPublished={vi.fn()}
          onOpenUnpublished={vi.fn()}
        />,
      ),
    'grid-card',
    'grid-card-name',
  ],
  [
    // 🔴 A SIXTH CASE OVER THE SAME COMPONENT AS case 3, AND NOT A DUPLICATE OF IT:
    // only `MyGridsView` hands `MyList` a `preview`, so this is the one shape where a
    // THIRD node sits between the content and the cluster. "Last child" is a different
    // claim once a middle child exists — and the preview is CONTENT, so it belongs
    // above the actions.
    'MyList via MyGridsView — the PRIVATE grid row, which also carries a preview strip',
    () =>
      render(
        <MyGridsView
          ownGrids={[]}
          combinations={[matchupRow]}
          prompts={[promptRow]}
          results={[]}
          GatedCell={fakeGatedCell()}
          viewerId={VIEWER_ID}
          loading={false}
          error={null}
          publishError={null}
          archivedKeys={new Set()}
          unpublished={[privateGrid]}
          onRequireAuth={vi.fn()}
          onWithdraw={vi.fn()}
          onNewUnpublished={vi.fn()}
          onEditUnpublished={vi.fn()}
          onDiscardUnpublished={vi.fn()}
          onPublishUnpublished={vi.fn()}
          onEditPublished={vi.fn()}
          onOpenUnpublished={vi.fn()}
        />,
      ),
    'unpublished-card',
    'unpublished-name',
  ],
  [
    'GridsView — the community grid card',
    () =>
      render(
        <GridsView
          grids={[gridRow]}
          combinations={[matchupRow]}
          prompts={[promptRow]}
          results={[]}
          GatedCell={fakeGatedCell()}
          votedKeys={new Set()}
          reportedKeys={new Set()}
          viewerId={VIEWER_ID}
          loading={false}
          error={null}
          /* The Top Grid is the open one, so the list holds exactly ONE card and the
             shape lookup below cannot pick the wrong one. `openKey` is an
             `entryDomKey`; `null` would mean "nothing in this list is open" and would
             list the Top Grid as a second card. */
          openKey={SYSTEM_GRID_DOM_KEY}
          onOpen={vi.fn()}
          onVote={vi.fn()}
          onUnvote={vi.fn()}
          onRequireAuth={vi.fn()}
          onWithdraw={vi.fn()}
          onReport={vi.fn()}
        />,
      ),
    'grid-card',
    'grid-card-name',
  ],
];

describe('🔴 the row action cluster is the LAST child of a COLUMN container', () => {
  it.each(SHAPES)('%s', (_label, mount, cardId, contentId) => {
    mount();

    // The card. `GridsView` lists the Top Grid as well, so take the one that holds
    // the content node this shape named.
    const cards = screen.getAllByTestId(cardId);
    const card = cards.find((c) => within(c).queryByTestId(contentId) !== null);
    expect(card, `no ${cardId} holding ${contentId} — the shape did not render`).toBeDefined();

    // CLAIM 1 — exactly one cluster.
    const clusters = within(card!).getAllByTestId('row-actions');
    expect(clusters).toHaveLength(1);
    const actions = clusters[0]!;

    const parent = actions.parentElement;
    expect(parent, 'the cluster has no parent element').not.toBeNull();

    // CLAIM 2 — a COLUMN container. `Stack` stamps `data-civitai-ui="stack"` and
    // `Group` stamps `"group"` (measured in `@civitai/blocks-react/dist/ui/*.js`);
    // the flex DIRECTION lives in the pack's injected sheet, so the attribute is the
    // structural fact available here.
    //
    // 🔴 THIS IS THE CLAIM THE ISOLATED MUTATION KILLS — see the header. A
    // `<Group justify="space-between">` in place of the Stack fails here, with this
    // message, and nothing else in the file moves.
    //
    // ⚠️ THE `not.toBe('group')` THAT USED TO FOLLOW IS GONE: it is SUBSUMED by the
    // equality above (a value cannot be both `'stack'` and `'group'`), and its stated
    // reason — "a parent that is neither would satisfy a lone `not.toBe('group')`" —
    // argued for the equality, not for the pair.
    expect(parent!.getAttribute('data-civitai-ui')).toBe('stack');

    // CLAIM 3 — no `space-between`, which is what the old row shape used to spread
    // the content and the actions to opposite ends of one line.
    expect(parent!.style.justifyContent).not.toBe('space-between');

    // CLAIM 4 — the BOTTOM of that container.
    const siblings = Array.from(parent!.children);
    expect(siblings[siblings.length - 1]).toBe(actions);
    // …and it is not the ONLY child, or "last" would be trivially true.
    expect(siblings.length).toBeGreaterThan(1);

    // ⚠️ THERE WAS A CLAIM 5 — "a named CONTENT node precedes the cluster in document
    // order" — AND IT IS DELETED, not demoted. It was VERIFIED VACUOUS: DOM order was
    // already content-then-actions in the `space-between` shape (the content Stack was
    // the first flex item, the action Group the second), so it is GREEN at `bb63087`
    // against the very defect this file exists to pin, and it was self-labelled weak.
    // A green assertion that reads as coverage while providing none is worse than its
    // absence, because it stops anyone looking. Claim 4 above — last child of a COLUMN —
    // is the discriminating form of the same idea, and the `contentTestId` the shape
    // table still carries is what locates the right card in a multi-card render.
  });
});

// ---------------------------------------------------------------------------
// 🔴 TWO LEDGERS — see the header for why one is not enough.
//
// The first asserts which production files render a row ACTION CLUSTER. The second
// asserts which contain the STRUCTURAL SIGNATURE of the defect, under any id or none.
// ---------------------------------------------------------------------------

const SRC = resolve(process.cwd(), 'src');

const ROW_ACTION_FILES = [
  'components/GridsView.tsx',
  'components/MatchupBody.tsx',
  'components/MyGridsView.tsx',
  'components/MyList.tsx',
  'components/PromptBody.tsx',
] as const;

/**
 * The defect's structural signature: `justify="space-between"` and
 * `align="flex-start"` on ONE element.
 *
 * 🔴 BOTH HALVES, AND IN EITHER ORDER. `space-between` alone is an ordinary and correct
 * pattern in this tree — a section header with a title on the left and ONE
 * fixed-width primary button on the right (`MyList`'s "Your grids / New grid",
 * `GridOpenPanel`'s title row, the forms' footers). Those are safe because the right
 * item's width does not vary with the row's content, which is exactly what
 * `align="flex-start"` signals the author was NOT doing: aligning to the top of a
 * TALL content column, i.e. a column with a variable-height, variable-width sibling
 * beside it. The conjunction is the discriminating predicate; either half alone is
 * either noisy or blind.
 */
const SIGNATURE =
  /<[A-Za-z][^>]*justify="space-between"[^>]*align="flex-start"|<[A-Za-z][^>]*align="flex-start"[^>]*justify="space-between"/;

/**
 * Production files ALLOWED to carry the signature. 🔴 EMPTY, AND THAT IS THE POINT: an
 * addition here is a decision someone has to write down, next to the reason.
 */
const SIGNATURE_ALLOWLIST: readonly string[] = [];

/** `src`-relative, forward-slashed, for a stable comparison on either platform. */
const rel = (f: string): string => relative(SRC, f).split('\\').join('/');

describe('🔴 the row-actions ledger', () => {
  it('exactly these five production files render a `row-actions` cluster', () => {
    const files = scannedSources(SRC);
    // POSITIVE CONTROL on the scan: it read files at all, so an empty `found` below
    // would be an absence and not a walker that returned nothing.
    expect(files.length, 'the source walker found no files').toBeGreaterThan(20);

    const found = files
      .filter((f) => readFileSync(f, 'utf8').includes('data-testid="row-actions"'))
      .map(rel)
      .sort();

    expect(found).toEqual([...ROW_ACTION_FILES]);
  });
});

describe('🔴 the STRUCTURAL ledger — no production source carries the defect shape', () => {
  it('🔴 no `justify="space-between"` + `align="flex-start"` element outside the allowlist', () => {
    // 🔴 POSITIVE CONTROL ON THE PATTERN, FIRST, BECAUSE THE EXPECTED RESULT IS A ZERO.
    // An empty `found` is indistinguishable from a regex that can never match, so the
    // signature is fed a case it MUST hit — in BOTH attribute orders, which is the half
    // of the pattern a single control would leave unproven.
    expect(SIGNATURE.test('<Group justify="space-between" align="flex-start" gap={8}>')).toBe(
      true,
    );
    expect(SIGNATURE.test('<Group align="flex-start" justify="space-between">')).toBe(true);
    // 🔴 AND NEGATIVE CONTROLS: the safe header shape, and either half alone. A pattern
    // that matched these would make the ledger permanently red and therefore worthless.
    expect(SIGNATURE.test('<Group justify="space-between" align="center" gap={12}>')).toBe(false);
    expect(SIGNATURE.test('<Stack align="flex-start">')).toBe(false);

    const files = scannedSources(SRC);
    expect(files.length, 'the source walker found no files').toBeGreaterThan(20);

    // 🔴 COMMENTS ARE STRIPPED, AND WITHOUT THAT THIS LEDGER IS PERMANENTLY RED. Two
    // production files — `MatchupBody.tsx` and `GridPicker.tsx` — QUOTE the old markup
    // in the comment explaining why it is gone, which is this repo's discipline; a raw
    // scan reports those explanations as instances of the defect. `stripComments` is
    // `lib/sourceScan.ts`', validated by `sourceScanLedger.test.ts`'s own controls.
    const found = files
      .filter((f) => SIGNATURE.test(stripComments(readFileSync(f, 'utf8'))))
      .map(rel)
      .sort();

    expect(found).toEqual([...SIGNATURE_ALLOWLIST].sort());

    // 🔴 THE SECOND POSITIVE CONTROL, ON THE REAL TREE: the prose instances DO exist, so
    // the zero above is the stripper working rather than a scan that read nothing. This
    // is what tells a reader the empty `found` is a measurement.
    const inProse = files
      .filter((f) => SIGNATURE.test(readFileSync(f, 'utf8')))
      .map(rel)
      .sort();
    expect(inProse, 'no production file quotes the old shape — the stripper is untested here')
      .toEqual(['components/GridPicker.tsx', 'components/MatchupBody.tsx']);
  });
});
