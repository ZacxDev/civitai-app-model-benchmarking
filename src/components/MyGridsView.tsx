// MY BENCHMARKS ▸ GRIDS — the viewer's own grids: their unpublished records (with
// New / Edit / Discard / Publish), their published ones (with Remove and Archive),
// and the archived half behind "Show archived".
//
// 🔴 THIS IS WHERE GRID CREATION LIVES NOW, and saying so is the point of this
// paragraph rather than a nicety. The routes this replaced, in order: the grids
// section's own `grid-new` button (removed — superseded), and `Contribute ▸ Grid` in
// the page's dropdown (removed with the dropdown itself). A grid has no PUBLIC create
// path at all — unlike a matchup or a prompt, it is assembled from other people's
// rows and there is no reason to make that assembly public before its author has
// looked at it — so "where do I make a grid" and "where are my grids" are the same
// question, and this is the one answer. `UnpublishedList`'s `new-unpublished` is the
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
// ⚠️ THE LATCH'S OTHER JUSTIFICATION IS SATISFIED ON ONE PATH AND UNGUARDED ON A NEW
// ONE — and an earlier version of this paragraph claimed the panel "cannot unmount
// mid-report at all — strictly stronger than a latch", which is FALSE on this tree.
//
// What the latch was for: `UnpublishedList` holds its publish `error` in LOCAL state,
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
// other My Benchmarks noun — unmounts `MyGridsView`, and `UnpublishedList`'s local
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
// `MyPublished`, whose `renderCard` is the same `MatchupBody` / `PromptBody` the
// community board uses — `VoteButton` included. So the viewer's own matchups and prompts
// DO carry a vote control on this very destination, and as written this paragraph read as
// a tree-wide convention that two of three surfaces violate. Left standing, it invites
// someone to "fix" the siblings by deleting a working control.
//
// 🔴 THE HALF THAT IS SOUND, AND IT IS SUFFICIENT: this list's rows are grids, and a
// grid card here has no vote control because `MyPublished` is handed a `renderCard` that
// does not build one. What makes THAT right is not duplication but the object: the only
// grid without a shared row is the Top Grid, which is not the viewer's and never appears
// on this surface, so there is no key-less row to worry about — and the community board
// plus `GridOpenPanel` already carry the affordance for every grid that HAS a row. This
// is a presentation choice on a card body, not an invariant; if the operator asks for a
// vote control here, `card` below is the one place to add it.

import { Alert, Badge, Card, Group, Loader, Stack } from '@civitai/blocks-react/ui';

import type { CombinationRow, GridRow, PromptRow, UnpublishedGrid } from '../types.js';
import {
  gridMemberSummary,
  missingMembersNotice,
  resolveGridRows,
} from '../lib/gridEntries.js';
import { metaText, mutedText } from '../theme.js';
import { MyPublished } from './MyPublished.js';
import { MyTabSignedOut } from './MySignedOut.js';
import { UnpublishedList } from './UnpublishedList.js';
import { WithdrawButton } from './WithdrawButton.js';

export interface MyGridsViewProps {
  /** The viewer's OWN published grid rows — narrowed by `App` with `isOwnRow`. */
  ownGrids: GridRow[];
  /** The live matchup rows the members are resolved against. */
  combinations: CombinationRow[];
  /** The live prompt rows, same. */
  prompts: PromptRow[];
  /** See `GridsView.boardTruncated` — an input to the missing-members COPY. */
  boardTruncated?: boolean;
  viewerId: number | null;
  loading: boolean;
  /**
   * The board-read failure, or `null`.
   *
   * 🔴 IT WAS MISSING, AND THE ABSENCE WAS A LIE. `App` reads every surface's rows from
   * ONE `listAll`, so when that read fails this surface had no way to say so — it fell
   * through to `MyPublished`'s empty line, "You have no published grids on the board
   * right now", which asserts a fact about the board that the app never observed. My ▸
   * Matchups and My ▸ Prompts both render `matchups-error` / `prompts-error` on that
   * same failure, so the grid surface was the only one of the three that answered a
   * failed read with a confident zero.
   *
   * ⚠️ WHAT WIRING IT DOES *NOT* FIX, stated so nobody reads this as more than it is:
   * the empty line still renders BESIDE the alert, because `MyPublished` is only told
   * about `loading`, not about `error`. That is true of all three nouns — the matchup
   * and prompt surfaces have always shown their own empty line next to their own error
   * — so suppressing it is a `MyPublished` change with three callers, not a grid fix,
   * and it is deliberately not bundled here.
   */
  error: string | null;
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
}

export function MyGridsView({
  ownGrids,
  combinations,
  prompts,
  boardTruncated = false,
  viewerId,
  loading,
  error,
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
}: MyGridsViewProps): React.JSX.Element {
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

  const card = (row: GridRow, extraActions: React.ReactNode): React.JSX.Element => {
    const resolved = resolveGridRows({ system: false, row }, combinations, prompts);
    const missing = missingMembersNotice(resolved, boardTruncated);
    return (
      <Card key={row.key} withBorder padding="md" data-testid="grid-card" data-key={row.key}>
        <Group justify="space-between" align="flex-start" gap={10}>
          <Stack gap={4} style={{ minWidth: 0 }}>
            <Group gap={8} align="center">
              <strong data-testid="grid-card-name">{row.name || `#${row.key}`}</strong>
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
          <Group gap={6} align="center">
            <WithdrawButton
              noun="grid"
              onWithdraw={() => onWithdraw(row.key)}
              data-testid="grid-withdraw"
            />
            {extraActions}
          </Group>
        </Group>
      </Card>
    );
  };

  return (
    <Stack gap={14} data-testid="my-grids-view">
      {status}
      <Stack gap={10} data-testid="my-grids-unpublished" style={{ minWidth: 0 }}>
        <UnpublishedList
          /* 🔴 KEYED ON THE VIEWER — see the header for the swap this closes. */
          key={viewerId}
          items={unpublished.map((rec) => ({
            localId: rec.localId,
            name: rec.name,
            meta: `${rec.matchupKeys.length} × ${rec.promptKeys.length}`,
            description: rec.description,
          }))}
          noun="grid"
          quotaLine={quotaLine}
          onNew={onNewUnpublished}
          onEdit={onEditUnpublished}
          onDiscard={onDiscardUnpublished}
          onPublish={onPublishUnpublished}
        />
      </Stack>

      {/* 🔴 ONE implementation of the own/archived partition, shared with the matchup
          and prompt surfaces — see `MyPublished` for the bug that duplication caused
          the last time this predicate existed three times. */}
      <MyPublished
        noun="grid"
        rows={ownGrids}
        keyOf={(row) => row.key}
        archivedKeys={archivedKeys}
        loading={loading}
        onArchive={onArchive}
        onUnarchive={onUnarchive}
        renderCard={card}
      />
    </Stack>
  );
}
