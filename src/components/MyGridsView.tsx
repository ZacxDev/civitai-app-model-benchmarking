// MY BENCHMARKS ▸ GRIDS — the viewer's own grids, drafts and published rows in ONE
// list (`MyList`), plus the archived half behind "Show archived".
//
// 🔴 THIS IS WHERE GRID CREATION LIVES NOW, and saying so is the point of this
// paragraph rather than a nicety. The routes this replaced, in order: the grids
// section's own `grid-new` button (removed — superseded), and `Contribute ▸ Grid` in
// the page's dropdown (removed with the dropdown itself). A grid has no PUBLIC create
// path at all — unlike a matchup or a prompt, it is assembled from other people's
// rows and there is no reason to make that assembly public before its author has
// looked at it — so "where do I make a grid" and "where are my grids" are the same
// question, and this is the one answer. `MyList`'s `new-unpublished` is the
// control; `App.openNewGrid` is still the single place the auth decision is made.
//
// 🔴 THE PANEL IS UNCONDITIONAL HERE, AND THE LATCH IT REPLACED IS GONE. `GridsView`
// rendered the unpublished panel only once the viewer had (or had had) a record, held
// by a one-way `hadUnpublishedRef` latch, for a reason that was real at the time: the
// page mounted the grid, matchup and prompt panels TOGETHER, so an always-present
// empty panel added a second copy of every `unpublished-*` testid to the document. My
// Benchmarks mounts exactly ONE noun at a time, so that collision cannot happen and
// the panel can simply always render.
//
// 🔴 AND THE CONSOLIDATION DID NOT RE-OPEN IT. `MyList` is one component holding both
// halves, mounted unconditionally for a signed-in viewer, with the publish `error`
// alert OUTSIDE the list body — so neither "the drafts ran out" nor "the published
// rows ran out" can unmount the notice. A `length > 0` condition anywhere above the
// alert is what the paragraph below is about; do not add one.
//
// ⚠️ THE LATCH'S OTHER JUSTIFICATION IS SATISFIED ON ONE PATH AND UNGUARDED ON A NEW
// ONE — and an earlier version of this paragraph claimed the panel "cannot unmount
// mid-report at all — strictly stronger than a latch", which is FALSE on this tree.
//
// What the latch was for: `MyList` holds its publish `error` in LOCAL state,
// cleared only by the next `publish()` — and the one case where the list empties WHILE
// having something to say is a publish whose pointer write was refused. The row went
// public, the private copy did not retire, and `unpublished-error` is the ONLY place a
// viewer learns that. A `length > 0` condition unmounted the panel at exactly that
// moment and took the notice with it (`publishPointerFailure.test.tsx`'s grid arm).
//
// ✅ THE LIST EMPTYING no longer unmounts anything: the panel is unconditional, so that
// path really is closed, and more simply than a latch closed it.
//
// 🔴 BUT THE NAV IS A SECOND UNMOUNT PATH AND IT IS UNGUARDED. Selecting Home — or any
// other My Benchmarks noun — unmounts `MyGridsView`, and `MyList`'s local
// `error` goes with it. A viewer who navigates away after a half-published grid loses
// the only sentence telling them the public row landed while their private copy did
// not, and nothing brings it back: the notice is not re-derived on return, because the
// App does not hold it. The latch never covered this either — there was no nav
// destination to cover — so it is a gap this IA opened, not one it inherited.
// `src/publishPointerFailure.test.tsx` pins the actual behaviour (the notice renders,
// and a nav away destroys it) so this paragraph cannot drift back into a guarantee.
//
// ⚠️ THE FIX THAT WOULD CLOSE IT, NOT TAKEN HERE: hoist the publish `error` to `App`,
// where `runs` already lives for exactly this reason, so it survives the unmount for
// all three nouns. It was left for a separate change because it moves state on the
// publish path — the half of a publish that is IRREVERSIBLE (`shared.append`) — and
// that is a behaviour change with its own verification, not a prose correction. The
// harm it would close is discoverability, never a second public row: nothing about the
// notice's absence makes `append` run again.
//
// 🔴 KEYED ON THE VIEWER, for the residual half a latch never covered: the host can
// swap the signed-in viewer WITHOUT remounting (`src/viewer-change.test.tsx`), and
// when viewer B also has records the panel legitimately stays mounted across the
// swap. Only a fresh instance guarantees A's local publish `error` does not come with
// it.
//
// 🔴 WHAT THIS SURFACE DELIBERATELY DOES NOT OFFER: a vote control. The reason is
// GRID-SPECIFIC, and the general version of it that used to be here is FALSE.
//
// ⚠️ THE FALSE HALF, RETRACTED RATHER THAN REWORDED: "A second vote button here would
// be a second copy of the same affordance keyed off the same row." That is contradicted
// two files over. `MatchupsView` and `PromptsView` with `surface="my"` render
// `MyList`, whose `renderCard` is the same `MatchupBody` / `PromptBody` the
// community board uses — `VoteButton` included. So the viewer's own matchups and prompts
// DO carry a vote control on this very destination, and as written this paragraph read as
// a tree-wide convention that two of three surfaces violate. Left standing, it invites
// someone to "fix" the siblings by deleting a working control.
//
// 🔴 THE HALF THAT IS SOUND, AND IT IS SUFFICIENT: this list's rows are grids, and a
// grid card here has no vote control because `MyList` is handed a `renderCard` that
// does not build one. What makes THAT right is not duplication but the object: the only
// grid without a shared row is the Top Grid, which is not the viewer's and never appears
// on this surface, so there is no key-less row to worry about — and the community board
// plus `GridOpenPanel` already carry the affordance for every grid that HAS a row. This
// is a presentation choice on a card body, not an invariant; if the operator asks for a
// vote control here, `card` below is the one place to add it.

import { useMemo } from 'react';
import { Alert, Badge, Card, Group, Loader, Stack } from '@civitai/blocks-react/ui';

import type { CombinationRow, GridRow, PromptRow, ResultRow, UnpublishedGrid } from '../types.js';
import { indexResultsByCell } from '../lib/benchmark.js';
import {
  gridMemberSummary,
  gridPreviewIds,
  missingMembersNotice,
  resolveGridRows,
  resolveMemberRows,
} from '../lib/gridEntries.js';
import { metaText, mutedText } from '../theme.js';
import type { GatedCellComponent } from './GatedCell.js';
import { GridPreview } from './GridPreview.js';
import { MyList } from './MyList.js';
import { MyTabSignedOut } from './MySignedOut.js';

export interface MyGridsViewProps {
  /** The viewer's OWN published grid rows — narrowed by `App` with `isOwnRow`. */
  ownGrids: GridRow[];
  /** The live matchup rows the members are resolved against. */
  combinations: CombinationRow[];
  /** The live prompt rows, same. */
  prompts: PromptRow[];
  /**
   * Every published RESULT row on the board — the source of each card's inline
   * preview thumbnails, private and published cards alike.
   *
   * 🔴 REQUIRED, AND NOT DEFAULTED TO `[]`, for the reason `GridsView` records on
   * its own copy of this prop: an empty default degrades SILENTLY to "no outputs
   * yet", which is the one state a reader cannot tell a forgotten prop from.
   *
   * 🔴 PASSED IN RATHER THAN READ HERE. This component issues no host call of its
   * own; the preview's gated read goes through the injected `GatedCell` so it
   * inherits 0.4.6's timeout/retry/telemetry rather than forking it.
   */
  results: ResultRow[];
  /**
   * The gated grid-cell renderer, injected so the preview's read is countable.
   *
   * 🔴 ONE BATCHED READ PER CARD, and that budget is this surface's too now. My
   * Benchmarks mounts exactly ONE noun at a time and the community grids board is
   * a DIFFERENT destination, so these cards never coexist with `GridsView`'s —
   * which is why adding a strip here does not move the open/listed partition
   * `gridPreviewSeam.test.tsx` pins. `src/myGridsPreview.test.tsx` counts the
   * calls on THIS surface, with a positive control in the same case.
   */
  GatedCell: GatedCellComponent;
  /** See `GridsView.boardTruncated` — an input to the missing-members COPY. */
  boardTruncated?: boolean;
  viewerId: number | null;
  loading: boolean;
  /**
   * The board-read failure, or `null`.
   *
   * 🔴 IT WAS MISSING, AND THE ABSENCE WAS A LIE. `App` reads every surface's rows from
   * ONE `listAll`, so when that read fails this surface had no way to say so — it fell
   * through to the list's empty line, which asserts a fact about the board that the app
   * never observed. My ▸ Matchups and My ▸ Prompts both render `matchups-error` /
   * `prompts-error` on that same failure, so the grid surface was the only one of the
   * three that answered a failed read with a confident zero.
   *
   * ⚠️ WHAT WIRING IT DOES *NOT* FIX, stated so nobody reads this as more than it is:
   * the empty line still renders BESIDE the alert, because `MyList` is only told
   * about `loading`, not about `error`. That is true of all three nouns — the matchup
   * and prompt surfaces have always shown their own empty line next to their own error
   * — so suppressing it is a `MyList` change with three callers, not a grid fix,
   * and it is deliberately not bundled here.
   */
  error: string | null;
  /**
   * The grid-publish REFUSAL or CASCADE FAILURE notice, held by `App`.
   *
   * 🔴 ITS RENDER SITE IS HERE AND NOT IN THE DIALOG, AND THAT IS THE WHOLE POINT OF
   * THE PROP. The notice used to render inside the cascade's confirm dialog, nested
   * under "the grid's record still exists" — and the single most important thing it
   * has to say arrives at the exact moment that stops being true: when the grid's own
   * pointer write is refused, `publishRecord` retires the local id, the record leaves
   * `unpublishedGrids`, and the dialog body became unrenderable. Measured: two rows
   * public and permanent, and nothing at all on screen.
   *
   * It is the SAME argument `MyList` makes one level down about its own
   * `unpublished-error` ("the failure that matters most is the one where the record
   * has just been retired FROM the list"), applied one level up — the record's
   * lifetime must not gate the notice about the record.
   *
   * ⚠️ IT IS NOT THE ONLY PUBLISH-FAILURE CHANNEL ON THIS SURFACE, and the other one
   * is unchanged: the direct, no-dependency publish still rejects into `MyList`, which
   * renders `unpublished-error` from its own LOCAL state. That one still dies on a nav
   * away (`publishPointerFailure.test.tsx` pins it as a characterisation). This one
   * does not, because `App` holds it.
   */
  publishError: string | null;
  archivedKeys: Set<string>;
  unpublished: UnpublishedGrid[];
  quotaLine?: string | null;
  onRequireAuth: () => void;
  onWithdraw: (key: string) => Promise<void> | void;
  onArchive?: (key: string) => Promise<void> | void;
  onUnarchive?: (key: string) => Promise<void> | void;
  onNewUnpublished: () => void;
  onEditUnpublished: (localId: string) => void;
  onDiscardUnpublished: (localId: string) => Promise<void> | void;
  onPublishUnpublished: (localId: string) => Promise<void> | void;
  /**
   * Edit an already-PUBLISHED grid — name, description AND members.
   *
   * 🔴 THIS IS NEW FUNCTIONALITY AND IT IS SAFE FOR A GRID-SPECIFIC REASON. A grid
   * stores `matchupKeys[]` / `promptKeys[]` — REFERENCES, not content — while a
   * result cell is keyed `comboKey::configId::promptKey` and is shared by every grid
   * that contains those members. So dropping a member from a grid stops DISPLAYING
   * its cells here; it orphans nothing, and re-adding the member brings them back.
   *
   * ⚠️ THE ASYMMETRY IS REAL AND IS WHY THIS IS NOT A GENERAL LICENCE. Editing a
   * MATCHUP can drop a `configId`, and the cells keyed on that id are then
   * unreachable and unrecoverable — the results rows stay on the board naming an id
   * no live matchup carries. Do not reason from "grids are editable" to "everything
   * is".
   */
  onEditPublished: (row: GridRow) => void;
  /**
   * OPEN one of the viewer's own PRIVATE grids — the Ask-D route.
   *
   * 🔴 IT IS THE ONLY WAY A PRIVATE GRID'S MATRIX CAN BE REACHED. A private grid has
   * no shared row, so it is not on the community board and `GridsView`'s `grid-open`
   * cannot name it; before this control a viewer had to PUBLISH a grid to generate
   * into it, which is the wrong order — publishing is irreversible and the grid is
   * what they were still assembling.
   *
   * 🔴 WHAT THE APP DOES WITH IT, AND WHY THIS COMPONENT STILL WRITES NOTHING: `App`
   * holds the open-grid state (see its `openGridRef`), resolves the local id back to
   * the KV record, and resolves that record's MEMBER KEYS against the live board with
   * the same `resolveMemberRows` every other grid uses. A member that is one of the
   * viewer's own private matchups/prompts therefore contributes no row and no column —
   * so the matrix is built from board rows only and a local id cannot reach a result
   * row. That property belongs to the resolver, not to this prop.
   *
   * ⚠️ AND THE GRID'S PRIVACY DOES NOT COVER A RUN'S OUTPUTS. A result row is keyed
   * `comboKey · configId × promptKey` and is not grid-scoped, so once a cell's images
   * reach the shared board they are there for every grid that contains the cell, whether
   * or not this one is ever published. 🔴 WHAT GETS THEM THERE IS A SECOND HUMAN CONFIRM,
   * not this press — `publish()` opens the HOST's "Publish to the shared grid?" dialog
   * and rejects on refusal (`App.tsx`'s `driveToResult`). A draft of this paragraph said
   * the images "go to the shared board" as though the press settled it; it does not. The
   * viewer is told the whole of it on the confirm path (`PRIVATE_GRID_RUN_NOTICE`), not
   * here.
   *
   * ⚠️ THERE IS NO `onOpenPublished` BESIDE IT, AND THERE WAS FOR ONE ROUND. The
   * published half of this list carried an Open too, on the argument that the
   * alternative is "go to Home, switch to the Grids board, find your card, press Open".
   * It was cut: a published grid IS on that board with a `grid-open` of its own, so the
   * control was a second door to one destination — for the one kind of grid that was
   * never short of doors — and it also appeared on the ARCHIVED rows, which `MyList`
   * renders through the same action group.
   */
  onOpenUnpublished: (localId: string) => void;
}

export function MyGridsView({
  ownGrids,
  combinations,
  prompts,
  results,
  GatedCell,
  boardTruncated = false,
  viewerId,
  loading,
  error,
  publishError,
  archivedKeys,
  unpublished,
  quotaLine = null,
  onRequireAuth,
  onWithdraw,
  onArchive,
  onUnarchive,
  onNewUnpublished,
  onEditUnpublished,
  onDiscardUnpublished,
  onPublishUnpublished,
  onEditPublished,
  onOpenUnpublished,
}: MyGridsViewProps): React.JSX.Element {
  /** Cell → result index, built ONCE per render and shared by every card's strip. */
  const byCell = useMemo(() => indexResultsByCell(results), [results]);

  /**
   * The read's status, rendered on BOTH branches.
   *
   * 🔴 THE SAME SHAPE AND THE SAME TESTIDS AS THE COMMUNITY GRIDS BOARD, deliberately.
   * `MatchupsView` reuses `matchups-error` / `matchups-loading` across its own two
   * surfaces for the same reason: exactly one of Home and My Benchmarks is MOUNTED, so
   * the ids cannot collide, and a second spelling would be a second thing to keep in
   * step with the copy.
   *
   * 🔴 IT IS ABOVE THE SIGNED-OUT BRANCH TOO, matching `MatchupsView`. A read can fail
   * for an anonymous viewer as easily as for a signed-in one, and the sign-in panel is
   * not an answer to "the board could not be read".
   */
  const status = (
    <>
      {error && (
        <Alert color="error" data-testid="grids-error">
          {error}
        </Alert>
      )}
      {/* 🔴 ABOVE THE LIST AND OUTSIDE IT, and unconditional on anything about the
          grid it is about — see the `publishError` prop. Rendered on the SIGNED-OUT
          branch too, because `status` is shared: a viewer whose session changed
          mid-publish should not lose the sentence telling them two rows went public. */}
      {publishError && (
        <Alert color="error" data-testid="grid-publish-error">
          {publishError}
        </Alert>
      )}
      {loading && (
        <Stack align="center" gap={10} style={{ padding: '28px 0' }}>
          <Loader data-testid="grids-loading" />
          <span style={metaText}>Loading grids…</span>
        </Stack>
      )}
    </>
  );

  if (viewerId == null) {
    return (
      <Stack gap={14} data-testid="my-grids-view">
        {status}
        <MyTabSignedOut noun="grid" onRequireAuth={onRequireAuth} />
      </Stack>
    );
  }

  const card = (row: GridRow, actions: React.ReactNode): React.JSX.Element => {
    const resolved = resolveGridRows({ system: false, row }, combinations, prompts);
    const missing = missingMembersNotice(resolved, boardTruncated);
    const name = row.name || `#${row.key}`;
    const preview = gridPreviewIds(resolved, byCell);
    return (
      <Card key={row.key} withBorder padding="md" data-testid="grid-card" data-key={row.key}>
        <Stack gap={10} style={{ minWidth: 0 }}>
        {/* 🔴 NO `space-between` ROW HERE ANY MORE — the content column is a direct
            child of the card's Stack and the actions are its LAST child, below the
            preview strip. `MatchupBody`'s header carries the measured reflow this
            removes; all five card shapes took the same change in one pass. */}
          <Stack gap={4} style={{ minWidth: 0 }}>
            <Group gap={8} align="center">
              <strong data-testid="grid-card-name">{name}</strong>
              <Badge variant="light" data-testid="grid-card-members">
                {gridMemberSummary(resolved)}
              </Badge>
            </Group>
            {row.description && <span style={mutedText}>{row.description}</span>}
            {/* 🔴 Criterion 8 again, on the author's own card: the count of what is
                gone is owed wherever the grid is listed, not only on the board. */}
            {missing && (
              <span style={metaText} data-testid="grid-card-missing">
                {missing}
              </span>
            )}
          </Stack>
        {/* 🔴 THE INLINE PREVIEW, the SAME component and the SAME budget as the
            community grid cards: ids collected by `gridPreviewIds`, handed to ONE
            `GatedCell`, so a card costs exactly one batched `getImages` call
            whatever its tile count. See the `GatedCell` prop for why adding this
            surface does not move `gridPreviewSeam.test.tsx`'s ledger. */}
        <GridPreview
          imageIds={preview.ids}
          totalCount={preview.total}
          label={name}
          GatedCell={GatedCell}
        />
        {/* 🔴 THE ACTIONS COME FROM `MyList`, not from here. Remove used to be an
            inline button beside an inline Archive; both are behind this row's `⋮`
            now, and Edit — which a published grid had no route to at all — plus Open
            are the controls on the row. `row-actions` is the one spelling shared by
            all five card shapes; see `MatchupBody`. */}
        <Group gap={6} align="center" data-testid="row-actions">{actions}</Group>
        </Stack>
      </Card>
    );
  };

  return (
    <Stack gap={14} data-testid="my-grids-view">
      {status}
      {/* 🔴 ONE list and ONE implementation of the own/archived partition, shared with
          the matchup and prompt surfaces — see `MyList` for the bug that duplication
          caused the last time this predicate existed three times. */}
      <Stack gap={10} data-testid="my-grids-unpublished" style={{ minWidth: 0 }}>
        <MyList
          /* 🔴 KEYED ON THE VIEWER — see the header for the swap this closes. */
          key={viewerId}
          noun="grid"
          drafts={unpublished.map((rec) => {
            /* 🔴 THE PRIVATE CARD GETS A STRIP TOO, resolved from BARE KEY LISTS —
               a private grid has no shared row, so there is no `GridEntry` to
               resolve. `resolveMemberRows` is the body `resolveGridRows` delegates
               to, so the cell order (and therefore the strip) is the same rule.

               🔴 AND NO MISSING NOTICE ON THIS CARD, deliberately. A private
               MEMBER resolves as absent here (it has only a local id), and
               `missingMembersNotice`'s complete-scan arm says "their authors
               removed them" — which about the viewer's own private matchup is
               simply false. The count the row already carries is the authored one
               (`matchupKeys.length × promptKeys.length`), which stays true either
               way. See `resolveMemberRows` for the whole argument.

               ⚠️ SO A PRIVATE MEMBER'S CELLS CANNOT APPEAR IN THIS STRIP, and that
               is the same property that keeps a local id out of every result row.
               A grid of only private members previews nothing and reads
               `grid-preview-empty`; one that mixes in board members previews those. */
            const resolved = resolveMemberRows(
              rec.matchupKeys,
              rec.promptKeys,
              combinations,
              prompts,
            );
            const preview = gridPreviewIds(resolved, byCell);
            return {
              localId: rec.localId,
              name: rec.name,
              meta: `${rec.matchupKeys.length} × ${rec.promptKeys.length}`,
              description: rec.description,
              preview: (
                <GridPreview
                  imageIds={preview.ids}
                  totalCount={preview.total}
                  label={rec.name || 'Untitled grid'}
                  GatedCell={GatedCell}
                />
              ),
            };
          })}
          rows={ownGrids}
          keyOf={(row) => row.key}
          archivedKeys={archivedKeys}
          loading={loading}
          quotaLine={quotaLine}
          onNew={onNewUnpublished}
          onEditDraft={onEditUnpublished}
          onDiscardDraft={onDiscardUnpublished}
          onPublishDraft={onPublishUnpublished}
          onEditPublished={onEditPublished}
          onWithdraw={onWithdraw}
          onArchive={onArchive}
          onUnarchive={onUnarchive}
          /* 🔴 ONLY THE PRIVATE HALF GETS Open, and `MyList` has no published-row Open
             to wire any more. A published grid is on the community board with a
             `grid-open` of its own; a private one has no shared row and therefore no
             other route to its matrix at all. See `onOpenUnpublished`. */
          onOpenDraft={onOpenUnpublished}
          renderCard={card}
        />
      </Stack>
    </Stack>
  );
}
