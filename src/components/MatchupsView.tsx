// Browse + vote on MATCHUPS, split into MY and COMMUNITY sub-tabs (spec §11.1).
// The top-N by votes are badged "Included" (they form the grid's rows). The
// submit affordance opens the matchup form.
//
// 🔴 THE PARTITION, EXACTLY (§11.1), and it is not symmetric:
//   - MY        = rows where `isOwnRow(row, viewerId)` and NOT archived, plus
//                 this viewer's unpublished records from per-viewer storage.
//   - COMMUNITY = every published row INCLUDING the viewer's own, so an author
//                 sees their row ranked the way everyone else sees it.
// A row the viewer authored therefore appears in BOTH tabs. That is the design,
// not a leak: there is no server-side filter to do it any other way (§2.3 C1),
// and hiding your own row from the community ranking would misreport the board.
//
// 🔴 "Matchup" is the USER-FACING name only. The wire value stays
// `data.kind: 'combination'` (see docs/matchups.md §6.1) and the parsed row type
// is still `CombinationRow` — renaming either would be a data migration this app
// cannot perform, since `shared.update` is author-scoped.

import { Alert, Button, Card, Group, Loader, Stack } from '@civitai/blocks-react/ui';

import { useState, type ReactNode } from 'react';

import type { CombinationRow, DraftUnsubmitted } from '../types.js';
import { includedSummary, isOwnRow } from '../lib/benchmark.js';
import { ARCHIVE_NOTE } from '../lib/archive.js';
import { mutedText, metaText } from '../theme.js';
import { EmptyState } from './EmptyState.js';
import { MatchupBody } from './MatchupBody.js';
import { SubTabs, MyTabSignedOut, type SubTab } from './SubTabs.js';
import { UnpublishedList } from './UnpublishedList.js';

/**
 * The "Included" badge's tooltip.
 *
 * 🔴 RE-EXPORTED, NOT DEFINED HERE. It moved to `MatchupBody` with the card body
 * it annotates — the detail modal renders the same badge and must make the same
 * claim. The re-export keeps every existing importer (and the whole-string guard
 * in `IncludedSummary.test.tsx`) pointing at one definition.
 */
export { INCLUDED_ROW_TOOLTIP } from './MatchupBody.js';

export interface MatchupsViewProps {
  combinations: CombinationRow[];
  includedKeys: Set<string>;
  votedKeys: Set<string>;
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
  // rendered standalone in a test that only cares about the public list ----
  /** This viewer's UNPUBLISHED matchups (pointers at published rows excluded). */
  unpublished?: DraftUnsubmitted[];
  /** The host-reported private-storage line, or null while unread/anonymous. */
  quotaLine?: string | null;
  /** Shared keys this viewer archived — hidden from MY only (§11.3). */
  archivedKeys?: Set<string>;
  onNewUnpublished?: () => void;
  onEditUnpublished?: (localId: string) => void;
  onDiscardUnpublished?: (localId: string) => Promise<void> | void;
  onPublishUnpublished?: (localId: string) => Promise<void> | void;
  onArchive?: (key: string) => Promise<void> | void;
  onUnarchive?: (key: string) => Promise<void> | void;
}

export function MatchupsView({
  combinations,
  includedKeys,
  votedKeys,
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
  const [tab, setTab] = useState<SubTab>('community');
  const [showArchived, setShowArchived] = useState(false);

  const archived = archivedKeys ?? new Set<string>();
  const signedIn = viewerId != null;
  const own = combinations.filter((c) => isOwnRow(c, viewerId));
  const myPublished = own.filter((c) => !archived.has(c.key));
  const myArchived = own.filter((c) => archived.has(c.key));
  const myCount = myPublished.length + unpublished.length;

  // 🔴 The card BODY is `MatchupBody`, shared verbatim with the matchup DETAIL
  // MODAL the grid's group band opens. Sharing it is what keeps the ownership
  // decision (Edit/Withdraw vs Report) in one place — the modal is reached by
  // every viewer, most of whom do not own the row.
  const card = (combo: CombinationRow, extraActions?: ReactNode): React.JSX.Element => (
    <Card key={combo.key} withBorder padding="md" data-testid="matchup-card" data-key={combo.key}>
      <MatchupBody
        combo={combo}
        included={includedKeys.has(combo.key)}
        voted={votedKeys.has(combo.key)}
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

  return (
    <Stack gap={14} data-testid="matchups-view">
      <Group justify="space-between" align="center" gap={12}>
        <span style={{ ...mutedText, flex: '1 1 260px', minWidth: 0 }} data-testid="matchups-included-summary">
          Submit and vote on checkpoint + LoRA matchups. {includedSummary(includedKeys.size, 'row')}
        </span>
        <Button size="sm" onClick={onSubmitNew} data-testid="submit-matchup">
          Submit matchup
        </Button>
      </Group>

      <SubTabs
        value={tab}
        onChange={setTab}
        noun="matchup"
        myCount={myCount}
        communityCount={combinations.length}
      />

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

      {tab === 'my' && !signedIn && <MyTabSignedOut noun="matchup" onRequireAuth={onRequireAuth} />}

      {tab === 'my' && signedIn && (
        <Stack gap={14} data-testid="my-panel">
          <UnpublishedList
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

          <Stack gap={10}>
            <strong style={{ fontSize: 14 }}>Published by you</strong>
            {!loading && myPublished.length === 0 ? (
              <span style={mutedText} data-testid="my-published-empty">
                You have no published matchups on the board right now.
              </span>
            ) : (
              <Stack gap={10} data-testid="matchups-list">
                {myPublished.map((combo) =>
                  card(
                    combo,
                    onArchive && (
                      <Button
                        size="sm"
                        variant="subtle"
                        onClick={() => onArchive(combo.key)}
                        data-testid="archive-action"
                        aria-label="Archive: hide from your My list only"
                      >
                        Archive
                      </Button>
                    ),
                  ),
                )}
              </Stack>
            )}
            {/* 🔴 THE HONEST WORDING, rendered NEXT TO the control rather than
                behind a tooltip. Archiving hides nothing from anyone else — the
                app has no such power (§2.2 + §9 Q2) — and a viewer who reads "Archive"
                as "removed" has been told something the code cannot back. */}
            {myPublished.length > 0 && (
              <span style={metaText} data-testid="archive-note">
                {ARCHIVE_NOTE}
              </span>
            )}
          </Stack>

          {myArchived.length > 0 && (
            <Stack gap={10}>
              <Group gap={8} align="center">
                <Button
                  size="sm"
                  variant="subtle"
                  onClick={() => setShowArchived((v) => !v)}
                  data-testid="archived-toggle"
                >
                  {showArchived ? 'Hide archived' : `Show archived (${myArchived.length})`}
                </Button>
                <span style={metaText}>Still on the shared board, still in Community.</span>
              </Group>
              {showArchived && (
                <Stack gap={10} data-testid="archived-list">
                  {myArchived.map((combo) =>
                    card(
                      combo,
                      onUnarchive && (
                        <Button
                          size="sm"
                          variant="subtle"
                          onClick={() => onUnarchive(combo.key)}
                          data-testid="unarchive-action"
                        >
                          Unarchive
                        </Button>
                      ),
                    ),
                  )}
                </Stack>
              )}
            </Stack>
          )}
        </Stack>
      )}

      {tab === 'community' && (
        <>
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
        </>
      )}
    </Stack>
  );
}
