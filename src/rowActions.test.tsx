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
//      card;
//   5. a named CONTENT node of the card precedes it in document order.
//
// 🔴 (4) IS THE DISCRIMINATING ONE AND (5) ALONE IS VACUOUS. DOM order was ALREADY
// content-then-actions in the `space-between` shape — the content Stack was the first
// flex item and the action Group the second — so a document-order check passes on the
// pre-change code and proves nothing. What changed is the CONTAINER: a row became a
// column, and the cluster became that column's last child. Claims 2–4 are what fail
// at `bb63087`; claim 5 is kept because it is the sentence a reader expects to see,
// labelled here as the weak one rather than quietly counted.
//
// ── WHY FIVE SHAPES AND A LEDGER ────────────────────────────────────────────
//
// The defect is shared by five independently-written card bodies (two community row
// bodies, the private row, and two grid cards) — exercised below as SIX cases, because
// the private row is rendered twice: once bare and once with the `preview` strip only
// `MyGridsView` passes, where a third child sits between the content and the cluster.
// A per-shape case would leave a sixth FILE free to reintroduce the defect silently,
// so the SOURCE LEDGER at the bottom asserts the exact SET of production files that
// render `row-actions` — failing when the set GROWS (a new card shape nobody checked)
// as well as when it SHRINKS (a shape that lost its cluster).
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
import { scannedSources } from './lib/sourceScan.js';

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
          onOpenPublished={vi.fn()}
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
          onOpenPublished={vi.fn()}
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
    // structural fact available here. Both halves are asserted: a parent that is
    // neither would satisfy a lone `not.toBe('group')`.
    expect(parent!.getAttribute('data-civitai-ui')).toBe('stack');
    expect(parent!.getAttribute('data-civitai-ui')).not.toBe('group');

    // CLAIM 3 — no `space-between`, which is what the old row shape used to spread
    // the content and the actions to opposite ends of one line.
    expect(parent!.style.justifyContent).not.toBe('space-between');

    // CLAIM 4 — the BOTTOM of that container.
    const siblings = Array.from(parent!.children);
    expect(siblings[siblings.length - 1]).toBe(actions);
    // …and it is not the ONLY child, or "last" would be trivially true.
    expect(siblings.length).toBeGreaterThan(1);

    // CLAIM 5 — content first. 🔴 LABELLED WEAK: this was already true before the
    // change (see the header) and is NOT regression coverage.
    const content = within(card!).getByTestId(contentId);
    expect(
      content.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING,
      'the action cluster precedes the content',
    ).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 🔴 THE LEDGER — which production files render a row action cluster.
//
// Five shapes carried the same defect because each was written separately. This
// asserts the SET, so it fails when a SIXTH card shape appears (nobody checked its
// placement) and when one of the five LOSES its cluster (the id was renamed, or the
// `space-between` row came back). A per-shape case cannot see either.
// ---------------------------------------------------------------------------

const SRC = resolve(process.cwd(), 'src');

const ROW_ACTION_FILES = [
  'components/GridsView.tsx',
  'components/MatchupBody.tsx',
  'components/MyGridsView.tsx',
  'components/MyList.tsx',
  'components/PromptBody.tsx',
] as const;

describe('🔴 the row-actions ledger', () => {
  it('exactly these five production files render a `row-actions` cluster', () => {
    const files = scannedSources(SRC);
    // POSITIVE CONTROL on the scan: it read files at all, so an empty `found` below
    // would be an absence and not a walker that returned nothing.
    expect(files.length, 'the source walker found no files').toBeGreaterThan(20);

    const found = files
      .filter((f) => readFileSync(f, 'utf8').includes('data-testid="row-actions"'))
      .map((f) => relative(SRC, f).split('\\').join('/'))
      .sort();

    expect(found).toEqual([...ROW_ACTION_FILES]);
  });
});
