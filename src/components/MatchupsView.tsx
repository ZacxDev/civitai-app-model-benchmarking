// MATCHUPS — the community board, and the viewer's own surface, as TWO SURFACES of
// one component selected by `surface`.
//
// ── 🔴 THE MY/COMMUNITY SUB-TABS ARE GONE ───────────────────────────────────
//
// The `SubTabs` strip that used to sit above this list is deleted, and with it the
// per-view `tab` state. "My" is a SIDEBAR DESTINATION now (My Benchmarks ▸ Matchups)
// and this board is community-only, so a per-board toggle would be a second, weaker
// spelling of a choice the sidebar already makes — two controls for one question, and
// the classic way for two controls to disagree.
//
// What the partition MEANT is unchanged and still §11.1:
//   - MY        = rows where `isOwnRow(row, viewerId)` and NOT archived, plus
//                 this viewer's unpublished records from per-viewer storage.
//   - COMMUNITY = every published row INCLUDING the viewer's own, so an author
//                 sees their row ranked the way everyone else sees it.
// A row the viewer authored therefore appears on BOTH surfaces. That is the design,
// not a leak: there is no server-side filter to do it any other way (§2.3 C1), and
// hiding your own row from the community ranking would misreport the board.
//
// 🔴 THE OWN/ARCHIVED SPLIT IS NOT IMPLEMENTED HERE ANY MORE — it is `MyPublished`,
// one implementation shared with the prompt and grid surfaces. It used to be
// open-coded in this file and near-identically in `PromptsView`, and a third copy in
// `GridsView` disagreed with its own sibling predicate badly enough to leave an
// archived row with no recovery path. See `MyPublished`'s header.
//
// 🔴 "Matchup" is the USER-FACING name only. The wire value stays
// `data.kind: 'combination'` (see docs/matchups.md §6.1) and the parsed row type
// is still `CombinationRow` — renaming either would be a data migration this app
// cannot perform, since `shared.update` is author-scoped.

import { Alert, Button, Card, Group, Loader, Stack } from '@civitai/blocks-react/ui';

import type { ReactNode } from 'react';

import type { CombinationRow, DraftUnsubmitted } from '../types.js';
import { includedSummary, isOwnRow } from '../lib/benchmark.js';
import { mutedText, metaText } from '../theme.js';
import { EmptyState } from './EmptyState.js';
import { MatchupBody } from './MatchupBody.js';
import { MyPublished } from './MyPublished.js';
import { MyTabSignedOut } from './MySignedOut.js';
import { UnpublishedList } from './UnpublishedList.js';

/* 🔴 `INCLUDED_ROW_TOOLTIP` WAS RE-EXPORTED HERE AND IS NOW DELETED, along with the
   `matchup-included` badge it annotated (the third IA pass — see `MatchupBody`'s
   header). It is recorded rather than quietly dropped because the constant existed
   to be pinned whole by a test: `IncludedSummary.test.tsx` names the case it
   retired. The `matchups-included-summary` copy below is a DIFFERENT claim and is
   untouched. */

/** Which surface of this view to render. */
export type MatchupSurface = 'community' | 'my';

export interface MatchupsViewProps {
  /**
   * Which surface to render.
   *
   * 🔴 IT IS A PROP, NOT LOCAL STATE, AND THAT IS THE WHOLE CHANGE. The old `tab`
   * `useState` meant the choice was per-view and invisible to everything else; the
   * sidebar owns it now, so exactly one surface is MOUNTED and the other's testids
   * are absent from the document rather than merely hidden.
   */
  surface: MatchupSurface;
  combinations: CombinationRow[];
  /**
   * How many rows are "included" — i.e. are members of the Top Grid.
   *
   * 🔴 A NUMBER, NOT THE `Set<string>` IT REPLACED. It was a Set because the view
   * rendered a per-row "Included" badge and had to ask `has(key)` per row. The third IA
   * pass DELETED both badges (see `IncludedSummary.test.tsx`'s retirement note), which
   * left `.size` as the only thing either view ever read — a `useMemo`-built Set and a
   * prop carrying a number `includedCombos.length` already held. Passing the number is
   * the same information with no second representation to keep in step.
   */
  includedCount: number;
  votedKeys: Set<string>;
  /**
   * Shared keys this viewer has already REPORTED.
   *
   * 🔴 A SET, THREADED THE SAME WAY `votedKeys` IS, and for the same reason: the
   * per-row boolean is `has(key)` at the card, so no caller has to build one lookup per
   * row. Where it comes FROM differs — see `App.reportedKeys`, and `MatchupBody.reported`
   * for the menu-unmount defect it closes.
   */
  reportedKeys: Set<string>;
  viewerId: number | null;
  loading: boolean;
  error: string | null;
  onSubmitNew: () => void;
  onVote: (key: string) => Promise<number> | void;
  onUnvote: (key: string) => Promise<number> | void;
  onRequireAuth: () => void;
  /** Edit one of the viewer's OWN combinations (in-place). */
  onEdit: (combo: CombinationRow) => void;
  /** Withdraw one of the viewer's OWN combinations from the shared grid. */
  onWithdraw: (key: string) => Promise<void> | void;
  /** Report ANOTHER viewer's row to platform moderators (escalation, not removal). */
  onReport: (key: string) => Promise<void>;

  // ---- the PRIVATE half (per-viewer storage), all optional so the view can be
  // rendered standalone in a test that only cares about the community list ----
  /** This viewer's UNPUBLISHED matchups (pointers at published rows excluded). */
  unpublished?: DraftUnsubmitted[];
  /** The host-reported private-storage line, or null while unread/anonymous. */
  quotaLine?: string | null;
  /** Shared keys this viewer archived — hidden from the MY surface only (§11.3). */
  archivedKeys?: Set<string>;
  onNewUnpublished?: () => void;
  onEditUnpublished?: (localId: string) => void;
  onDiscardUnpublished?: (localId: string) => Promise<void> | void;
  onPublishUnpublished?: (localId: string) => Promise<void> | void;
  onArchive?: (key: string) => Promise<void> | void;
  onUnarchive?: (key: string) => Promise<void> | void;
}

export function MatchupsView({
  surface,
  combinations,
  includedCount,
  votedKeys,
  reportedKeys,
  viewerId,
  loading,
  error,
  onSubmitNew,
  onVote,
  onUnvote,
  onRequireAuth,
  onEdit,
  onWithdraw,
  onReport,
  unpublished = [],
  quotaLine = null,
  archivedKeys,
  onNewUnpublished,
  onEditUnpublished,
  onDiscardUnpublished,
  onPublishUnpublished,
  onArchive,
  onUnarchive,
}: MatchupsViewProps): React.JSX.Element {
  const signedIn = viewerId != null;
  const own = combinations.filter((c) => isOwnRow(c, viewerId));

  // 🔴 The card BODY is `MatchupBody`, shared verbatim with the matchup DETAIL
  // MODAL the grid's group band opens. Sharing it is what keeps the ownership
  // decision (Edit/Withdraw vs Report) in one place — the modal is reached by
  // every viewer, most of whom do not own the row.
  const card = (combo: CombinationRow, extraActions?: ReactNode): React.JSX.Element => (
    <Card key={combo.key} withBorder padding="md" data-testid="matchup-card" data-key={combo.key}>
      <MatchupBody
        combo={combo}
        voted={votedKeys.has(combo.key)}
        reported={reportedKeys.has(combo.key)}
        viewerId={viewerId}
        onVote={onVote}
        onUnvote={onUnvote}
        onRequireAuth={onRequireAuth}
        onEdit={onEdit}
        onWithdraw={onWithdraw}
        onReport={onReport}
        extraActions={extraActions}
      />
    </Card>
  );

  const status = (
    <>
      {error && (
        <Alert color="error" data-testid="matchups-error">
          {error}
        </Alert>
      )}
      {loading && (
        <Stack align="center" gap={10} style={{ padding: '28px 0' }}>
          <Loader data-testid="matchups-loading" />
          <span style={metaText}>Loading matchups…</span>
        </Stack>
      )}
    </>
  );

  if (surface === 'my') {
    return (
      <Stack gap={14} data-testid="matchups-view">
        {status}
        {!signedIn ? (
          <MyTabSignedOut noun="matchup" onRequireAuth={onRequireAuth} />
        ) : (
          <Stack gap={14} data-testid="my-panel">
            <UnpublishedList
              /* 🔴 KEYED ON THE VIEWER, so a viewer swap gets a FRESH instance rather
                 than inheriting the previous viewer's publish `error` — local state
                 cleared only by the next `publish()`. The host can swap the signed-in
                 viewer without remounting (`src/viewer-change.test.tsx`). */
              key={viewerId}
              items={unpublished.map((rec) => ({
                localId: rec.localId,
                name: rec.name,
                meta: `${rec.configs.length} config${rec.configs.length === 1 ? '' : 's'}`,
                description: rec.description,
              }))}
              noun="matchup"
              quotaLine={quotaLine}
              onNew={() => onNewUnpublished?.()}
              onEdit={(localId) => onEditUnpublished?.(localId)}
              onDiscard={(localId) => onDiscardUnpublished?.(localId)}
              onPublish={(localId) => onPublishUnpublished?.(localId)}
            />

            <MyPublished
              noun="matchup"
              rows={own}
              keyOf={(row) => row.key}
              archivedKeys={archivedKeys ?? new Set<string>()}
              loading={loading}
              onArchive={onArchive}
              onUnarchive={onUnarchive}
              renderCard={card}
            />
          </Stack>
        )}
      </Stack>
    );
  }

  return (
    <Stack gap={14} data-testid="matchups-view">
      <Group justify="space-between" align="center" gap={12}>
        <span style={{ ...mutedText, flex: '1 1 260px', minWidth: 0 }} data-testid="matchups-included-summary">
          Submit and vote on checkpoint + LoRA matchups. {includedSummary(includedCount, 'row')}
        </span>
        {/* 🔴 THE PUBLIC CREATE ROUTE FOR A MATCHUP, and since the Contribute dropdown
            was deleted it is the primary one. It renders for an anonymous viewer too
            — the form catches its own refusal — which is the convention the vote
            control set. */}
        <Button size="sm" onClick={onSubmitNew} data-testid="submit-matchup">
          Submit matchup
        </Button>
      </Group>

      {status}

      {!loading && combinations.length === 0 && (
        <EmptyState
          data-testid="matchups-empty"
          title="No matchups yet"
          body="Be the first to submit a checkpoint + LoRA matchup for the community to vote on."
          action={
            <Button size="sm" onClick={onSubmitNew}>
              Submit matchup
            </Button>
          }
        />
      )}

      <Stack gap={10} data-testid="matchups-list">
        {combinations.map((combo) => card(combo))}
      </Stack>
    </Stack>
  );
}
