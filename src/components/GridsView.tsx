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
// published grids by vote `count` descending (see lib/gridEntries.ts).
//
// 🔴 THE OPEN GRID IS NOT IN THE LIST, and the default open grid is the TOP GRID,
// so by default the Top Grid is not listed at all. That is intended: the open grid
// renders in full in `grid-open-panel` a few hundred pixels above, so listing it
// again was a card whose only distinguishing feature was saying "Shown in full
// above" — a row the viewer cannot act on, in the one position that pushes every
// row they CAN act on further down. Open another grid and the Top Grid appears in
// the list like any other entry, still badged system-owned and still carrying no
// vote control.
//
// 🔴 ARCHIVE IS NOT ON THIS SURFACE. It is an author-side hide of the viewer's own
// row from THEIR OWN list (§11.3, and `ARCHIVE_NOTE` says so in words) — and this
// list is not that: it is the community board, where an archived row is supposed
// to stay visible to everyone INCLUDING the archiver. While the grids section had
// no My/Community split, "your own list" had nowhere else to mean, so the flag was
// pointed at this list; that reading is retired. The flag, `lib/archive.ts`,
// `ARCHIVE_KEY` and `ARCHIVE_NOTE` all survive untouched and App still reads and
// writes them — they belong to the viewer's own surface.
//
// ⚠️ THE LIST FILTER WENT WITH THE CONTROLS, AND HAD TO. Keeping
// `archived.has(key)` as a filter here while removing "Show archived" would leave
// a previously-archived row hidden from the only list that renders it with NO
// recovery path anywhere in the app — strictly worse than either end state.
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
   *
   * 🔴 REQUIRED, AND IT USED TO DEFAULT TO `[]` "for the standalone fixtures". That
   * default degraded SILENTLY: a caller that forgot it got empty previews on every
   * card with no error and no failing test — the same "no outputs yet" a genuinely
   * empty board produces, which is the one state a reader cannot tell it from.
   */
  results: ResultRow[];
  /**
   * The gated grid-cell renderer, injected so the preview's read is countable.
   *
   * 🔴 REQUIRED for the same reason, and its silent failure was worse: omitting it
   * made EVERY preview strip vanish — no strip, no "shown above" note, no error.
   * There is exactly one production call site (`App.tsx`) and it has always passed
   * it, so the optionality only ever bought a fixture the right to be wrong.
   */
  GatedCell: GatedCellComponent;
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
  //
  // 🔴 NO `archivedKeys` / `onArchive` / `onUnarchive` ANY MORE — see the header.
  // They are not "temporarily removed pending a new home": this component has no
  // business with them, because archive is a claim about the viewer's own list and
  // this one is the community board. App still holds the flag and still passes it
  // to the matchup and prompt surfaces, which do have that split.
  unpublished?: UnpublishedGrid[];
  quotaLine?: string | null;
  /**
   * Start a NEW unpublished grid.
   *
   * 🔴 STILL REQUIRED, AND THE BUTTON THAT USED TO CALL IT IS GONE. `grid-new` was
   * removed from this surface (superseded by `Contribute ▸ Grid`), but the
   * capability is NOT: `UnpublishedList`'s own `new-unpublished` control below is
   * wired to this same callback, so the private panel keeps its create route. A
   * reader who deletes this prop along with the button takes that with it.
   */
  onNewUnpublished?: () => void;
  onEditUnpublished?: (localId: string) => void;
  onDiscardUnpublished?: (localId: string) => Promise<void> | void;
  onPublishUnpublished?: (localId: string) => Promise<void> | void;

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
  results,
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
  onNewUnpublished,
  onEditUnpublished,
  onDiscardUnpublished,
  onPublishUnpublished,
  renderMatrix,
}: GridsViewProps): React.JSX.Element {
  /**
   * Which grid is OPEN, by shared key. `null` means the Top Grid — the system
   * entry has no key to name, and it is the default because it is the one grid
   * that always exists (criterion 9: this view is what the app opens on).
   */
  const [openKey, setOpenKey] = useState<string | null>(null);

  const signedIn = viewerId != null;

  const topGrid = useMemo(() => buildTopGrid(combinations, prompts), [combinations, prompts]);
  const communityEntries = useMemo(
    () => communityGridEntries(topGrid, grids),
    [topGrid, grids],
  );

  /** Cell → result index, built once per render for every card's preview. */
  const byCell = useMemo(() => indexResultsByCell(results), [results]);

  /**
   * Has THIS viewer had an unpublished grid at any point since they became the
   * viewer?
   *
   * A one-way latch (never falls back to `false`), because the private panel must
   * not disappear from under an interaction it is in the middle of reporting — see
   * where it is rendered for the publish-failure case that makes this load-bearing
   * rather than cosmetic.
   *
   * 🔴 ONE-WAY WITHIN ONE VIEWER, RESET ON A VIEWER CHANGE — and it used to be
   * one-way full stop, which leaked one viewer's private state to the next. The
   * host can swap the signed-in viewer WITHOUT remounting this component (that is
   * the documented route `src/viewer-change.test.tsx` exists for). Measured on the
   * one-way version: viewer A with one unpublished grid mounted the panel; swapping
   * to viewer B with an empty store cleared A's CARD but left
   * `my-grids-unpublished` mounted for B. And because `UnpublishedList` holds its
   * publish `error` in local state — cleared only by the next `publish()` — the
   * same persisted mount could show B the notice from A's failed publish, which is
   * actively wrong AND actionable for B ("Your grid WAS published … Do NOT publish
   * it again").
   *
   * The latch's own justification does not survive the reset: "do not unmount a
   * panel mid-report" is a claim about ONE viewer's session, and a change of viewer
   * ends that session. Sign-out was already safe (the `signedIn &&` below plus
   * `App.tsx`'s synchronous clears); it is the A→B swap that leaked.
   *
   * The `key` on `UnpublishedList` closes the residual half: when B ALSO has
   * unpublished grids the panel legitimately stays mounted across the swap, and
   * only a fresh instance guarantees A's local `error` does not come with it.
   */
  const hadUnpublishedRef = useRef(false);
  const latchedForViewerRef = useRef<number | null>(viewerId);
  if (latchedForViewerRef.current !== viewerId) {
    latchedForViewerRef.current = viewerId;
    hadUnpublishedRef.current = false;
  }
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

  /**
   * One listed grid.
   *
   * 🔴 THERE IS NO `isOpen` ANY MORE, and no `extraActions`. The only caller is the
   * all-grids list, which EXCLUDES the open entry — so `isOpen` was a constant
   * `false` and the two branches it selected were unreachable. `extraActions` had
   * exactly one user, the archive control, which is not on this surface (header).
   */
  const entryCard = (entry: GridEntry): React.JSX.Element => {
    const resolved = resolveGridRows(entry, combinations, prompts);
    const missing = missingMembersNotice(resolved, boardTruncated);
    const key = entry.system ? '__system__' : entry.row.key;
    const isOwn = !entry.system && isOwnRow(entry.row, viewerId);
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
            {/* 🔴 AN ACTION, NOT A TOGGLE, AND IT USED TO BE BOTH. It carried
                `aria-pressed` and an `isOpen ? 'Showing' : 'Open'` label back when
                the open grid was listed alongside the others. It is not listed any
                more, so every button here belongs to a CLOSED grid: a permanently
                `aria-pressed="false"` toggle would announce a state that has no
                other value on this surface. */}
            <Button
              size="sm"
              variant="light"
              onClick={() => setOpenKey(entry.system ? null : entry.row.key)}
              data-testid="grid-open"
            >
              Open
            </Button>
            {isOwn && !entry.system && (
              <WithdrawButton
                noun="grid"
                onWithdraw={() => onWithdraw(entry.row.key)}
                data-testid="grid-withdraw"
              />
            )}
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
            batched call per card. `GatedCell` is what issues it, and it is a
            REQUIRED prop: the card can no longer end up with no strip because a
            caller forgot to pass one, which used to fail silently.

            🔴 IT IS NOW UNCONDITIONAL, AND THE GUARD IT REPLACED IS NOT GONE — IT
            MOVED UP A LEVEL AND GOT STRONGER. The hazard was the OPEN grid's card
            previewing exactly the cells its own matrix already shows full-size a
            few hundred pixels above: redundant UI, and the one grid the viewer is
            looking at running the 0.4.6 timeout / auto-retry / `gated_read_error`
            machinery twice over the same ids. That used to be held off by a
            `!isOpen` condition HERE. The open grid is no longer LISTED at all, so
            there is no open card to condition on — a partition enforced by the
            list rather than by a per-card flag, which is the difference between
            "the open card renders a different way" and "the open card does not
            exist". `gridPreviewSeam.test.tsx` pins the new relationship: exactly
            one strip per listed card, the open grid absent from the list, and the
            read count unchanged at 3 rather than 4.

            ⚠️ WHAT THE PARTITION SAVES, MEASURED AND NOT ROUNDED UP: exactly ONE
            `getImages` call per page load. The matrix issues one call per FILLED
            CELL and a card strip issues ONE BATCHED call. On a ~22-card list that
            is 1 of ~23. An earlier version of this comment said "twice the weight
            on the host's 150-per-10s-per-`blockInstanceId` limiter", which
            overstated it by about an order of magnitude: the DOUBLING was
            per-output for the open grid, never per-page for the limiter.

            🔴 AND THERE IS NO ID-LEVEL DEDUPE ANYWHERE — an ACCEPTED open item, not
            an oversight. Two surfaces that share a cell each read it: the seam
            test's own ledger is `['[11]','[22]','[22]']`, i.e. image 22 read twice,
            by the matrix and by another card's strip. Overlap is the EXPECTED case
            rather than an edge one, because the Top Grid is the top-voted members
            and community grids are built from those same popular ones. It is left
            in because the host's limit is on CALLS: each card still costs exactly
            one call whatever its ids, so the per-card budget this file and
            `GridPreview` defend is unaffected by the duplication. A dedupe cache
            would be a second read path to keep correct across retry and invalidation
            for a saving nobody has measured a need for.

            ⚠️ THE PER-CARD BUDGET TESTS CANNOT SEE THE CROSS-SURFACE DUPLICATION.
            `gridPreview.test.tsx` asserts one batched call per CARD and is correct;
            the duplication lives in the SEAM between a card and the matrix, which no
            card-scoped fixture builds. `gridPreviewSeam.test.tsx` pins that
            relationship instead, in one render, by exact count. */}
        <GridPreview
          imageIds={preview.ids}
          totalCount={preview.total}
          label={name}
          GatedCell={GatedCell}
        />
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

        {/* 🔴 THE EMPTY STATE IS ABOUT THE *LIST*, AND THE LIST NO LONGER
            CONTAINS THE OPEN GRID. Its body used to read "The Top Grid above is
            always here" — a sentence that was true only because the Top Grid was
            entry 0 of this list AND the default open grid, so it was above AND
            below. It is now only above, and only while it is the one open: open a
            community grid and the Top Grid joins this list like anything else. The
            copy says what is actually invariant instead.

            🔴 AND IT CARRIES NO ACTION. `grid-new` is gone from this surface (it is
            superseded by `Contribute ▸ Grid`, which is on the open grid's own title
            row a few hundred pixels above), so an empty state offering a second
            copy of it would be the duplicated route the removal exists to close.
            The empty state's job here is to explain, not to be a second door. */}
        {!loading && grids.length === 0 && (
          <EmptyState
            data-testid="grids-empty"
            title="No published grids yet"
            body="The grid open above is all there is for now. Build your own from any matchups and prompts on the board, then publish it for the community to vote on."
          />
        )}

        {/* 🔴 THE OPEN GRID IS FILTERED OUT HERE, AND THE COMPARISON IS THE ENTRY
            IDENTITY RATHER THAN A NAME OR A FLAG. `openKey === null` means the
            system entry, so the system entry is what leaves the list in the default
            state; any other value names a published row's key. Written as a match
            against `openEntry` so the one thing that decides what the panel above
            renders is the same thing that decides what this list omits — two
            independent spellings of "which grid is open" is how they come to
            disagree about, say, an opened-then-withdrawn grid (which `openEntry`
            already falls back to the Top Grid for).

            🔴 The Top Grid is entry 0 of `communityGridEntries` by construction,
            not by a sort that happens to put it there — so when it IS listed it is
            still first. ---- */}
        <Stack gap={10} data-testid="grids-list">
          {communityEntries
            .filter((entry) =>
              entry.system ? !openEntry.system : openEntry.system || openEntry.row.key !== entry.row.key,
            )
            .map((entry) => entryCard(entry))}
        </Stack>
      </Stack>

      {/* ---- the viewer's UNPUBLISHED grids (per-viewer storage) ----
           🔴 RENDERED ONLY ONCE THERE IS (OR HAS BEEN) SOMETHING IN IT, which is a
           change from the My tab it replaced. An always-present EMPTY panel would
           add a second copy of every `unpublished-*` testid to a page that also
           mounts the matchup and prompt panels, for no affordance a viewer does not
           already have — the page's `Contribute ▸ Grid` is the route to the same
           modal, and it is on the open grid's own title row.

           ⚠️ `grid-new` USED TO BE THE OTHER ROUTE NAMED HERE and it is gone (the
           operator's call: superseded by `Contribute ▸ Grid`). What has NOT gone is
           this panel's own `new-unpublished` control below, which is wired to the
           same `onNewUnpublished` callback — so a viewer who already has an
           unpublished grid still has a create route here, and the prop is still
           required.

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
            /* 🔴 KEYED ON THE VIEWER, so a viewer swap gets a FRESH instance
               rather than inheriting the previous viewer's publish `error` —
               which is local state cleared only by the next `publish()`. See the
               latch above for the swap this closes. */
            key={viewerId ?? 'anon'}
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
