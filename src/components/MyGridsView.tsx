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
// ⚠️ THE LATCH'S OTHER JUSTIFICATION IS SATISFIED RATHER THAN DISCARDED, and the
// difference matters. It also existed because `UnpublishedList` holds its publish
// `error` in LOCAL state, cleared only by the next `publish()` — and the one case
// where the list empties WHILE having something to say is a publish whose pointer
// write was refused: the row went public, the private copy did not retire, and the
// notice saying so is the only place the viewer learns it. A `length > 0` condition
// unmounted the panel at exactly that moment and took the notice with it
// (`publishPointerFailure.test.tsx`'s grid arm). An UNCONDITIONAL panel cannot unmount
// at all, which is strictly stronger than a latch.
//
// 🔴 KEYED ON THE VIEWER, for the residual half a latch never covered: the host can
// swap the signed-in viewer WITHOUT remounting (`src/viewer-change.test.tsx`), and
// when viewer B also has records the panel legitimately stays mounted across the
// swap. Only a fresh instance guarantees A's local publish `error` does not come with
// it.
//
// 🔴 WHAT THIS SURFACE DELIBERATELY DOES NOT OFFER: a vote control. Voting is a
// community act on a shared row and it lives on the community board, where the row is
// also listed. A second vote button here would be a second copy of the same
// affordance keyed off the same row — and the Top Grid, which has no shared row at
// all, is not the viewer's and never appears here.

import { Badge, Card, Group, Stack } from '@civitai/blocks-react/ui';

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
  if (viewerId == null) {
    return (
      <Stack gap={14} data-testid="my-grids-view">
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
