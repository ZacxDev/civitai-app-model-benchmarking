// Browse, open, build, publish and vote on GRIDS — the fourth row kind on the one
// shared board (spec §11.2/§11.5), as ONE FLAT LIST.
//
// 🔴 THE SUB-TABS ARE GONE FROM THIS VIEW, and only from this view. The IA
// refactor made the whole app one page; a My/Community split inside a section of
// that page put the viewer's own grids behind a click for no gain, since every
// owner-only control already keys off `viewerId` and can simply be rendered on the
// owner's own card. Ownership is now a BADGE (`grid-own-badge`) on the one list.
// Matchups and Prompts keep their sub-tabs — their lists are much longer, and the
// vote ranking they feed is what stops the Top Grid starving.
//
// The list's order is unchanged: the system-owned TOP GRID pinned first, then the
// published grids by vote `count` descending (see lib/gridEntries.ts). What the
// viewer's own ARCHIVE flag now does is hide their own row from this one list —
// an author-side hide, still on the shared board for everybody else — reachable
// again through "Show archived".
//
// 🔴 THE THREE CLAIMS THIS VIEW OWES THE READER, and none is decoration:
//
//   1. A grid with DANGLING MEMBERS renders what survives AND says how much is
//      gone (criterion 8). Never a throw, never a quiet shrink.
//   2. The TOP GRID is labelled system-owned and carries NO vote control,
//      because it has no shared row to vote on. An inert-looking button, or a
//      position in the vote order, would both assert something false.
//   3. A card's inline PREVIEW is a SUBSET and says so — see GridPreview, which
//      also owns the read budget (one batched gated read per card, none at all
//      for a grid with no outputs, nothing below the fold).
//
// 🔴 NOTHING HERE WRITES TO ANY STORE. Every mutation is a callback the App owns,
// so the private/public boundary stays in one place.

import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert, Badge, Button, Card, Group, Loader, Stack } from '@civitai/blocks-react/ui';
import { ReportButton } from '@civitai/blocks-react/ui';

import type {
  CombinationRow,
  GridRow,
  PromptRow,
  ResultRow,
  UnpublishedGrid,
} from '../types.js';
import { indexResultsByCell, isOwnRow } from '../lib/benchmark.js';
import { ARCHIVE_NOTE } from '../lib/archive.js';
import {
  buildTopGrid,
  communityGridEntries,
  gridMemberSummary,
  gridPreviewIds,
  missingMembersNotice,
  resolveGridRows,
  TOP_GRID_NAME,
  TOP_GRID_NOTE,
  type GridEntry,
  type ResolvedGridRows,
} from '../lib/gridEntries.js';
import { metaText, mutedText } from '../theme.js';
import { EmptyState } from './EmptyState.js';
import type { GatedCellComponent } from './GatedCell.js';
import { GridPreview } from './GridPreview.js';
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
  /**
   * Every published RESULT row on the board — the source of each card's inline
   * preview thumbnails.
   *
   * 🔴 Passed in rather than read here: this component issues no host call of its
   * own, and the preview's gated read goes through the injected `GatedCell` so it
   * inherits 0.4.6's timeout/retry/telemetry hardening rather than forking it.
   */
  results?: ResultRow[];
  /** The gated grid-cell renderer, injected so the preview's read is countable. */
  GatedCell?: GatedCellComponent;
  /**
   * A control rendered beside the open grid's title — the page's Contribute menu.
   * Optional so the view still renders standalone in a test.
   */
  headerAction?: ReactNode;
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
  results = [],
  GatedCell,
  headerAction,
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

  /**
   * The viewer's OWN grids they have archived.
   *
   * 🔴 ARCHIVE STILL MEANS "hide from MY OWN view", and with the My tab gone that
   * is this one list. It is NOT a suppression: the row stays appended, keeps its
   * votes, and stays visible to every other viewer — the app HAS no power to do
   * otherwise (`update`/`withdraw` are author-scoped, `report()` does not hide),
   * which is why `ARCHIVE_NOTE` says so in words next to the control.
   */
  const myArchived = grids.filter((g) => isOwnRow(g, viewerId) && archived.has(g.key));

  /** Cell → result index, built once per render for every card's preview. */
  const byCell = useMemo(() => indexResultsByCell(results), [results]);

  /**
   * Has the viewer had an unpublished grid at any point this session?
   *
   * A one-way latch (never falls back to `false`), because the private panel must
   * not disappear from under an interaction it is in the middle of reporting — see
   * where it is rendered for the publish-failure case that makes this load-bearing
   * rather than cosmetic.
   */
  const hadUnpublishedRef = useRef(false);
  if (unpublished.length > 0) hadUnpublishedRef.current = true;
  const hadUnpublished = hadUnpublishedRef.current;

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
    const name = entry.system ? TOP_GRID_NAME : entry.row.name || `#${entry.row.key}`;
    const preview = gridPreviewIds(resolved, byCell);
    return (
      <Card key={key} withBorder padding="md" data-testid="grid-card" data-key={key}>
        <Stack gap={10} style={{ minWidth: 0 }}>
        <Group justify="space-between" align="flex-start" gap={10}>
          <Stack gap={4} style={{ minWidth: 0 }}>
            <Group gap={8} align="center">
              <strong data-testid="grid-card-name">{name}</strong>
              {entry.system && (
                <Badge variant="light" data-testid="grid-system-badge">
                  System grid
                </Badge>
              )}
              {/* 🔴 OWNERSHIP AS A BADGE, which is what replaced the My tab. It is
                  derived from the SAME `isOwnRow` predicate that gates the
                  owner-only controls beside it, so the label and the affordances
                  cannot disagree. */}
              {isOwn && (
                <Badge color="success" variant="light" data-testid="grid-own-badge">
                  Yours
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
        {/* 🔴 THE INLINE PREVIEW — real thumbnails, through the gated read, ONE
            batched call per card. `GatedCell` is what issues it; omit the
            component and the card simply has no strip (the standalone fixtures),
            never a second read path. */}
        {GatedCell && (
          <GridPreview
            imageIds={preview.ids}
            totalCount={preview.total}
            label={name}
            GatedCell={GatedCell}
          />
        )}
        </Stack>
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
        <Group justify="space-between" align="center" gap={12}>
          <Group gap={8} align="center" style={{ minWidth: 0 }}>
            <strong style={{ fontSize: 15 }} data-testid="grid-open-title">
              {openName}
            </strong>
            {openEntry.system && (
              <Badge variant="light" data-testid="grid-open-system-badge">
                System grid
              </Badge>
            )}
          </Group>
          {/* The page's Contribute menu sits here — on the primary object's own
              title row, where the top-level tab strip used to be. */}
          {headerAction}
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

      {/* ---- ALL GRIDS: one flat list, no sub-tabs ---- */}
      <Stack gap={10} data-testid="grids-all-section" style={{ minWidth: 0 }}>
        <strong style={{ fontSize: 14 }}>All grids</strong>

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

        {/* 🔴 The Top Grid is entry 0 by construction (communityGridEntries), not
            by a sort that happens to put it there. Own-and-archived rows are
            filtered out HERE and nowhere else, so "archived" cannot come to mean
            two things on two lists. */}
        <Stack gap={10} data-testid="grids-list">
          {communityEntries
            .filter((entry) => entry.system || !archived.has(entry.row.key))
            .map((entry) =>
              entryCard(
                entry,
                !entry.system && isOwnRow(entry.row, viewerId) && onArchive ? (
                  <Button
                    size="sm"
                    variant="subtle"
                    onClick={() => onArchive(entry.row.key)}
                    data-testid="archive-action"
                    aria-label="Archive: hide from your own list only"
                  >
                    Archive
                  </Button>
                ) : undefined,
              ),
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
              <span style={metaText}>Still on the shared board, still visible to everyone else.</span>
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

        {/* 🔴 THE HONEST WORDING, rendered NEXT TO the control rather than behind a
            tooltip. Archiving hides nothing from anyone else — the app has no such
            power (§2.2 + §9 Q2). */}
        {(myArchived.length > 0 || grids.some((g) => isOwnRow(g, viewerId))) && (
          <span style={metaText} data-testid="archive-note">
            {ARCHIVE_NOTE}
          </span>
        )}
      </Stack>

      {/* ---- the viewer's UNPUBLISHED grids (per-viewer storage) ----
           🔴 RENDERED ONLY ONCE THERE IS (OR HAS BEEN) SOMETHING IN IT, which is a
           change from the My tab it replaced. The panel's own "New grid" button is
           redundant here — `grid-new` above and the page's Contribute ▸ Build a
           grid are both routes to the same modal — so an always-present EMPTY
           panel would add a second copy of every `unpublished-*` testid to a page
           that also mounts the matchup and prompt panels, for no affordance a
           viewer does not already have.

           🔴 WHY THE LATCH AND NOT A PLAIN `length > 0`. `UnpublishedList` holds
           its publish ERROR in local state, so unmounting the panel throws that
           error away — and the one case where the panel empties WHILE having
           something to say is exactly a publish whose pointer write was refused:
           the row went public, the private copy did not retire, and the notice
           saying so is the only place the viewer learns it. A plain `length > 0`
           unmounted the panel at that moment and took the notice with it (caught
           by `publishPointerFailure.test.tsx`'s grid arm). Once the panel has had
           a record this session it stays mounted. ------------------------------ */}
      {signedIn && hadUnpublished && (
        <Stack gap={10} data-testid="my-grids-unpublished" style={{ minWidth: 0 }}>
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
        </Stack>
      )}
    </Stack>
  );
}

/** Re-exported for the App, which resolves the OPEN grid's members the same way. */
export type { ResolvedGridRows };
