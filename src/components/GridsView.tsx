// Browse, open, build, publish and vote on GRIDS — the fourth row kind on the one
// shared board (spec §11.2/§11.5), split into MY and COMMUNITY sub-tabs with the
// same partition the Matchups and Prompts views use (§11.1):
//
//   - MY        = grids where `isOwnRow(row, viewerId)` and NOT archived, plus
//                 this viewer's unpublished grids from per-viewer storage.
//   - COMMUNITY = every published grid INCLUDING the viewer's own, ordered by
//                 vote `count` descending — with the system-owned TOP GRID pinned
//                 first, OUTSIDE that ordering (see lib/gridEntries.ts).
//
// 🔴 THE TWO CLAIMS THIS VIEW OWES THE READER, and neither is decoration:
//
//   1. A grid with DANGLING MEMBERS renders what survives AND says how much is
//      gone (criterion 8). Never a throw, never a quiet shrink.
//   2. The TOP GRID is labelled system-owned and carries NO vote control,
//      because it has no shared row to vote on. An inert-looking button, or a
//      position in the vote order, would both assert something false.
//
// 🔴 NOTHING HERE WRITES TO ANY STORE. Every mutation is a callback the App owns,
// so the private/public boundary stays in one place.

import { useMemo, useState, type ReactNode } from 'react';
import { Alert, Badge, Button, Card, Group, Loader, Stack } from '@civitai/blocks-react/ui';
import { ReportButton } from '@civitai/blocks-react/ui';

import type { CombinationRow, GridRow, PromptRow, UnpublishedGrid } from '../types.js';
import { isOwnRow } from '../lib/benchmark.js';
import { ARCHIVE_NOTE } from '../lib/archive.js';
import {
  buildTopGrid,
  communityGridEntries,
  gridMemberSummary,
  missingMembersNotice,
  resolveGridRows,
  TOP_GRID_NAME,
  TOP_GRID_NOTE,
  type GridEntry,
  type ResolvedGridRows,
} from '../lib/gridEntries.js';
import { metaText, mutedText } from '../theme.js';
import { EmptyState } from './EmptyState.js';
import { SubTabs, MyTabSignedOut, type SubTab } from './SubTabs.js';
import { UnpublishedList } from './UnpublishedList.js';
import { VoteButton } from './VoteButton.js';
import { WithdrawButton } from './WithdrawButton.js';

export interface GridsViewProps {
  /** Every published grid row on the board. */
  grids: GridRow[];
  /** The live matchup rows — the Top Grid's source AND the row set every grid's
   * ROW members are resolved against. */
  combinations: CombinationRow[];
  /** The live prompt rows — same, for COLUMN members. */
  prompts: PromptRow[];
  votedKeys: Set<string>;
  viewerId: number | null;
  loading: boolean;
  error: string | null;
  /**
   * Whether the board scan hit its page cap (`listAll`'s `truncated`).
   *
   * 🔴 IT IS AN INPUT TO THE MISSING-MEMBERS COPY, not decoration. A member reads
   * as "missing" by set difference against the rows the scan READ — so on a
   * truncated scan it may not be missing at all, and the notice must not blame
   * its author for removing it. The App computes this for the
   * `board-truncated-notice` already; it just never reached here.
   */
  boardTruncated?: boolean;
  onVote: (key: string) => Promise<number> | void;
  onUnvote: (key: string) => Promise<number> | void;
  onRequireAuth: () => void;
  /** Withdraw one of the viewer's OWN grids from the shared board. */
  onWithdraw: (key: string) => Promise<void> | void;
  /** Report ANOTHER viewer's grid to platform moderators (escalation, not removal). */
  onReport: (key: string) => Promise<void>;

  // ---- the PRIVATE half (per-viewer storage) ----
  unpublished?: UnpublishedGrid[];
  quotaLine?: string | null;
  archivedKeys?: Set<string>;
  onNewUnpublished?: () => void;
  onEditUnpublished?: (localId: string) => void;
  onDiscardUnpublished?: (localId: string) => Promise<void> | void;
  onPublishUnpublished?: (localId: string) => Promise<void> | void;
  onArchive?: (key: string) => Promise<void> | void;
  onUnarchive?: (key: string) => Promise<void> | void;

  /**
   * Render the OPEN grid's results matrix from its surviving members.
   *
   * 🔴 A callback rather than the matrix itself: the matrix needs the whole
   * runner wiring (runs, buzz, consent, the confirm/resume/cancel path), which is
   * App state and money-shaped. Passing it through this component would put a
   * spend path inside a browse surface for no reason.
   */
  renderMatrix: (matchups: CombinationRow[], prompts: PromptRow[]) => ReactNode;
}

export function GridsView({
  grids,
  combinations,
  prompts,
  votedKeys,
  viewerId,
  loading,
  error,
  boardTruncated = false,
  onVote,
  onUnvote,
  onRequireAuth,
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
  renderMatrix,
}: GridsViewProps): React.JSX.Element {
  const [tab, setTab] = useState<SubTab>('community');
  const [showArchived, setShowArchived] = useState(false);
  /**
   * Which grid is OPEN, by shared key. `null` means the Top Grid — the system
   * entry has no key to name, and it is the default because it is the one grid
   * that always exists (criterion 9: this view is what the app opens on).
   */
  const [openKey, setOpenKey] = useState<string | null>(null);

  const archived = archivedKeys ?? new Set<string>();
  const signedIn = viewerId != null;

  const topGrid = useMemo(() => buildTopGrid(combinations, prompts), [combinations, prompts]);
  const communityEntries = useMemo(
    () => communityGridEntries(topGrid, grids),
    [topGrid, grids],
  );

  const own = grids.filter((g) => isOwnRow(g, viewerId));
  const myPublished = own.filter((g) => !archived.has(g.key));
  const myArchived = own.filter((g) => archived.has(g.key));
  const myCount = myPublished.length + unpublished.length;

  /** The open entry, falling back to the Top Grid when the opened row is gone —
   * a grid the viewer had open can itself be withdrawn while they look at it. */
  const openEntry: GridEntry = useMemo(() => {
    if (openKey === null) return topGrid;
    const row = grids.find((g) => g.key === openKey);
    return row ? { system: false, row } : topGrid;
  }, [openKey, grids, topGrid]);

  const openResolved = useMemo(
    () => resolveGridRows(openEntry, combinations, prompts),
    [openEntry, combinations, prompts],
  );
  const openMissing = missingMembersNotice(openResolved, boardTruncated);
  const openName = openEntry.system ? TOP_GRID_NAME : openEntry.row.name || 'Untitled grid';

  const entryCard = (entry: GridEntry, extraActions?: ReactNode): React.JSX.Element => {
    const resolved = resolveGridRows(entry, combinations, prompts);
    const missing = missingMembersNotice(resolved, boardTruncated);
    const key = entry.system ? '__system__' : entry.row.key;
    const isOwn = !entry.system && isOwnRow(entry.row, viewerId);
    const isOpen = entry.system ? openKey === null : openKey === entry.row.key;
    return (
      <Card key={key} withBorder padding="md" data-testid="grid-card" data-key={key}>
        <Group justify="space-between" align="flex-start" gap={10}>
          <Stack gap={4} style={{ minWidth: 0 }}>
            <Group gap={8} align="center">
              <strong data-testid="grid-card-name">
                {entry.system ? TOP_GRID_NAME : entry.row.name || `#${entry.row.key}`}
              </strong>
              {entry.system && (
                <Badge variant="light" data-testid="grid-system-badge">
                  System grid
                </Badge>
              )}
              <Badge variant="light" data-testid="grid-card-members">
                {gridMemberSummary(resolved)}
              </Badge>
            </Group>
            {entry.system ? (
              <span style={mutedText} data-testid="grid-system-note">
                {TOP_GRID_NOTE}
              </span>
            ) : (
              entry.row.description && <span style={mutedText}>{entry.row.description}</span>
            )}
            {/* 🔴 Criterion 8, on the CARD: a grid whose members were withdrawn
                says so where it is listed, not only once it is opened. */}
            {missing && (
              <span style={metaText} data-testid="grid-card-missing">
                {missing}
              </span>
            )}
          </Stack>
          <Group gap={6} align="center">
            <Button
              size="sm"
              variant={isOpen ? 'filled' : 'light'}
              onClick={() => setOpenKey(entry.system ? null : entry.row.key)}
              data-testid="grid-open"
              aria-pressed={isOpen}
            >
              {isOpen ? 'Showing' : 'Open'}
            </Button>
            {isOwn && !entry.system && (
              <WithdrawButton
                noun="grid"
                onWithdraw={() => onWithdraw(entry.row.key)}
                data-testid="grid-withdraw"
              />
            )}
            {extraActions}
            {!entry.system && !isOwn && signedIn && (
              <ReportButton
                noun="grid"
                onReport={() => onReport(entry.row.key)}
                data-testid="grid-report"
              />
            )}
            {/* 🔴 THE TOP GRID GETS NO VOTE CONTROL AT ALL — not a disabled one.
                It has no shared row, so there is no key to pass to
                `shared.vote`; a greyed button would imply a vote is possible for
                somebody, and it is possible for nobody. */}
            {!entry.system && (
              <VoteButton
                count={entry.row.count}
                voted={votedKeys.has(entry.row.key)}
                disabled={!signedIn}
                onVote={() => onVote(entry.row.key)}
                onUnvote={() => onUnvote(entry.row.key)}
                onRequireAuth={onRequireAuth}
                data-testid="grid-vote"
              />
            )}
          </Group>
        </Group>
      </Card>
    );
  };

  return (
    <Stack gap={14} data-testid="grids-panel">
      <Group justify="space-between" align="center" gap={12}>
        <span style={{ ...mutedText, flex: '1 1 260px', minWidth: 0 }} data-testid="grids-summary">
          A grid is a named set of matchups × prompts. Run an empty cell to contribute its outputs to
          the shared board — a cell is shared by every grid that contains it.
        </span>
        {signedIn && onNewUnpublished && (
          <Button size="sm" onClick={onNewUnpublished} data-testid="grid-new">
            New grid
          </Button>
        )}
      </Group>

      {/* ---- the OPEN grid ---- */}
      <Stack gap={8} data-testid="grid-open-panel" style={{ minWidth: 0 }}>
        <Group gap={8} align="center">
          <strong style={{ fontSize: 15 }} data-testid="grid-open-title">
            {openName}
          </strong>
          {openEntry.system && (
            <Badge variant="light" data-testid="grid-open-system-badge">
              System grid
            </Badge>
          )}
        </Group>
        {/* 🔴 Criterion 8, on the OPEN grid: the surviving members render below
            and this sentence carries the honest count of what is not there. */}
        {openMissing && (
          <Alert color="warning" data-testid="grid-missing-notice">
            {openMissing}
          </Alert>
        )}
        {renderMatrix(openResolved.matchups, openResolved.prompts)}
      </Stack>

      <SubTabs value={tab} onChange={setTab} myCount={myCount} communityCount={grids.length} />

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

      {tab === 'my' && !signedIn && <MyTabSignedOut noun="grid" onRequireAuth={onRequireAuth} />}

      {tab === 'my' && signedIn && (
        <Stack gap={14} data-testid="my-panel">
          <UnpublishedList
            items={unpublished.map((rec) => ({
              localId: rec.localId,
              name: rec.name,
              meta: `${rec.matchupKeys.length} × ${rec.promptKeys.length}`,
              description: rec.description,
            }))}
            noun="grid"
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
                You have no published grids on the board right now.
              </span>
            ) : (
              <Stack gap={10} data-testid="grids-list">
                {myPublished.map((row) =>
                  entryCard(
                    { system: false, row },
                    onArchive && (
                      <Button
                        size="sm"
                        variant="subtle"
                        onClick={() => onArchive(row.key)}
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
                  {myArchived.map((row) =>
                    entryCard(
                      { system: false, row },
                      onUnarchive && (
                        <Button
                          size="sm"
                          variant="subtle"
                          onClick={() => onUnarchive(row.key)}
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
          {!loading && grids.length === 0 && (
            <EmptyState
              data-testid="grids-empty"
              title="No published grids yet"
              body="The Top Grid above is always here. Build your own from any matchups and prompts on the board, then publish it for the community to vote on."
              action={
                signedIn && onNewUnpublished ? (
                  <Button size="sm" onClick={onNewUnpublished}>
                    New grid
                  </Button>
                ) : undefined
              }
            />
          )}

          {/* 🔴 The Top Grid is entry 0 by construction (communityGridEntries),
              not by a sort that happens to put it there. */}
          <Stack gap={10} data-testid="grids-list">
            {communityEntries.map((entry) => entryCard(entry))}
          </Stack>
        </>
      )}
    </Stack>
  );
}

/** Re-exported for the App, which resolves the OPEN grid's members the same way. */
export type { ResolvedGridRows };
