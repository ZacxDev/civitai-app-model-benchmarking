// The community GRIDS BOARD — browse, open, vote on and report published grids
// (spec §11.2/§11.5), as ONE FLAT LIST.
//
// ── WHAT THIS COMPONENT IS, AFTER THE SIDEBAR ───────────────────────────────
//
// 🔴 IT IS THE COMMUNITY BOARD AND NOTHING ELSE. Three things that used to live here
// have moved, and each moved because it was never a community claim:
//   - the OPEN grid's panel + matrix → `GridOpenPanel`, rendered by `App` ABOVE the
//     board subnav, because the open grid stays on Home whichever board is selected;
//   - the viewer's UNPUBLISHED grids → `MyGridsView` (My Benchmarks ▸ Grids);
//   - ARCHIVE → `MyPublished`, on that same surface. Archive is an author-side hide
//     of the viewer's own row from THEIR OWN list (§11.3, and `ARCHIVE_NOTE` says so
//     in words); this list is the shared board, where an archived row is supposed to
//     stay visible to everyone INCLUDING the archiver. While the grids section had no
//     My/Community split, "your own list" had nowhere else to mean and the flag was
//     pointed at this list. That reading is retired.
//
// 🔴 THE SUB-TABS ARE STILL GONE, and now so is every other board's. Ownership is a
// BADGE (`grid-own-badge`) on the one list, derived from the same `isOwnRow` predicate
// that gates the owner-only controls beside it, so the label and the affordances
// cannot disagree.
//
// 🔴 THE OPEN GRID IS NOT IN THE LIST. The default open grid is the TOP GRID, so by
// default the Top Grid is not listed at all: it renders in full in `grid-open-panel`
// above, and a card whose only distinguishing content was "Shown in full above" is a
// row the viewer cannot act on sitting in the position that pushes every row they CAN
// act on further down. Open another grid and the Top Grid joins the list like any
// other entry, still badged system-owned and still carrying no vote control.
//
// 🔴 THE THREE CLAIMS THIS VIEW OWES THE READER, and none is decoration:
//
//   1. A grid with DANGLING MEMBERS renders what survives AND says how much is
//      gone (criterion 8). Never a throw, never a quiet shrink. (On the CARD here;
//      on the open grid it is `GridOpenPanel`'s `missing`.)
//   2. The TOP GRID is labelled system-owned and carries NO vote control,
//      because it has no shared row to vote on. An inert-looking button, or a
//      position in the vote order, would both assert something false.
//   3. A card's inline PREVIEW is a SUBSET and says so — see GridPreview, which
//      also owns the read budget (one batched gated read per card, none at all
//      for a grid with no outputs, nothing below the fold).
//
// 🔴 NOTHING HERE WRITES TO ANY STORE. Every mutation is a callback the App owns,
// so the private/public boundary stays in one place.

import { useMemo } from 'react';
import { Alert, Badge, Button, Card, Group, Loader, Stack } from '@civitai/blocks-react/ui';
import { ReportButton } from '@civitai/blocks-react/ui';

import type { CombinationRow, GridRow, PromptRow, ResultRow } from '../types.js';
import { indexResultsByCell, isOwnRow } from '../lib/benchmark.js';
import {
  buildTopGrid,
  communityGridEntries,
  entryDomKey,
  entryOpenKey,
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
   * made EVERY preview strip vanish — no strip, no error. There is exactly one
   * production call site (`App.tsx`) and it has always passed it, so the optionality
   * only ever bought a fixture the right to be wrong.
   */
  GatedCell: GatedCellComponent;
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
   * its author for removing it.
   */
  boardTruncated?: boolean;
  /**
   * Which grid is OPEN, ALREADY RESOLVED: `null` means the system Top Grid, any
   * string names a published row that is still on the board.
   *
   * 🔴 "ALREADY RESOLVED" IS THE CONTRACT AND IT MATTERS. A grid the viewer had open
   * can be withdrawn while they look at it, and `App` falls the open entry back to
   * the Top Grid in that case. If this prop carried the RAW key instead, the panel
   * above would render the Top Grid while this list — finding no entry whose key
   * matches a row that no longer exists — would ALSO list it, showing the same grid
   * twice. One spelling of "which grid is open", decided once, in `App`.
   */
  openKey: string | null;
  /** Open a listed grid (`null` for the system Top Grid). `App` holds the state. */
  onOpen: (key: string | null) => void;
  onVote: (key: string) => Promise<number> | void;
  onUnvote: (key: string) => Promise<number> | void;
  onRequireAuth: () => void;
  /** Withdraw one of the viewer's OWN grids from the shared board. */
  onWithdraw: (key: string) => Promise<void> | void;
  /** Report ANOTHER viewer's grid to platform moderators (escalation, not removal). */
  onReport: (key: string) => Promise<void>;
}

export function GridsView({
  grids,
  combinations,
  prompts,
  results,
  GatedCell,
  votedKeys,
  viewerId,
  loading,
  error,
  boardTruncated = false,
  openKey,
  onOpen,
  onVote,
  onUnvote,
  onRequireAuth,
  onWithdraw,
  onReport,
}: GridsViewProps): React.JSX.Element {
  const signedIn = viewerId != null;

  const topGrid = useMemo(() => buildTopGrid(combinations, prompts), [combinations, prompts]);
  const communityEntries = useMemo(
    () => communityGridEntries(topGrid, grids),
    [topGrid, grids],
  );

  /** Cell → result index, built once per render for every card's preview. */
  const byCell = useMemo(() => indexResultsByCell(results), [results]);

  /**
   * One listed grid.
   *
   * 🔴 THERE IS NO `isOpen` BRANCH. The only caller is the list below, which EXCLUDES
   * the open entry — so an `isOpen` flag would be a constant `false` and the two
   * branches it used to select (a "Shown in full above" note instead of a strip, and
   * an `aria-pressed` toggle label) were unreachable.
   */
  const entryCard = (entry: GridEntry): React.JSX.Element => {
    const resolved = resolveGridRows(entry, combinations, prompts);
    const missing = missingMembersNotice(resolved, boardTruncated);
    const key = entryDomKey(entry);
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
              {/* 🔴 OWNERSHIP AS A BADGE, which is what replaced the My tab on this
                  surface. It is derived from the SAME `isOwnRow` predicate that gates
                  the owner-only controls beside it, so the label and the affordances
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
            {/* 🔴 AN ACTION, NOT A TOGGLE. Every button here belongs to a CLOSED
                grid, because the open one is not listed — a permanently
                `aria-pressed="false"` toggle would announce a state that has no other
                value on this surface. */}
            <Button
              size="sm"
              variant="light"
              onClick={() => onOpen(entryOpenKey(entry))}
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

            🔴 IT IS UNCONDITIONAL, AND THE GUARD IT REPLACED IS NOT GONE — IT MOVED
            UP A LEVEL AND GOT STRONGER. The hazard was the OPEN grid's card
            previewing exactly the cells its own matrix already shows full-size a few
            hundred pixels above: redundant UI, and the one grid the viewer is looking
            at running the 0.4.6 timeout / auto-retry / `gated_read_error` machinery
            twice over the same ids. That used to be held off by a `!isOpen`
            condition HERE. The open grid is no longer LISTED at all, so there is no
            open card to condition on — a partition enforced by the list rather than by
            a per-card flag, which is the difference between "the open card renders a
            different way" and "the open card does not exist".
            `gridPreviewSeam.test.tsx` pins it: exactly one strip per listed card, the
            open grid absent from the list, and the read count unchanged at 3 not 4.

            ⚠️ WHAT THE PARTITION SAVES, MEASURED AND NOT ROUNDED UP: exactly ONE
            `getImages` call per page load. The matrix issues one call per FILLED CELL
            and a card strip issues ONE BATCHED call. On a ~22-card list that is 1 of
            ~23. An earlier version of this comment said "twice the weight on the
            host's 150-per-10s-per-`blockInstanceId` limiter", which overstated it by
            about an order of magnitude: the DOUBLING was per-output for the open grid,
            never per-page for the limiter.

            🔴 AND THERE IS NO ID-LEVEL DEDUPE ANYWHERE — an ACCEPTED open item, not
            an oversight. Two surfaces that share a cell each read it: the seam test's
            own ledger is `['[11]','[22]','[22]']`, i.e. image 22 read twice, by the
            matrix and by another card's strip. Overlap is the EXPECTED case rather
            than an edge one, because the Top Grid is the top-voted members and
            community grids are built from those same popular ones. It is left in
            because the host's limit is on CALLS: each card still costs exactly one
            call whatever its ids, so the per-card budget this file and `GridPreview`
            defend is unaffected by the duplication. A dedupe cache would be a second
            read path to keep correct across retry and invalidation for a saving
            nobody has measured a need for.

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
      <span style={{ ...mutedText, minWidth: 0 }} data-testid="grids-summary">
        A grid is a named set of matchups × prompts. Run an empty cell to contribute its outputs to
        the shared board — a cell is shared by every grid that contains it.
      </span>

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
        {/* 🔴 THE EMPTY STATE IS ABOUT THE *LIST*, AND THE LIST DOES NOT CONTAIN THE
            OPEN GRID.

            🔴 THE COPY CHANGE HERE HAS NO ESTABLISHED REASON, AND SAYING SO IS THE
            HONEST OPTION. The body used to read "The Top Grid above is always here",
            and an earlier version of this comment (and the PR body) claimed the
            sidebar/board change had made that FALSE. It did not, and the mechanism is
            worth writing down so nobody re-derives the false reason: this state renders
            iff `grids.length === 0`, which makes `communityGridEntries(topGrid, [])`
            exactly `[topGrid]`, which makes `App`'s `openEntry` the Top Grid
            UNCONDITIONALLY — `openGridKey === null` returns it, and a non-null key can
            only name a row in an empty `grids`, so it falls back to it. The Top Grid
            therefore IS always the grid above, in precisely the one state this empty
            state appears in.

            The new wording is KEPT (the operator has not objected, and being
            noun-agnostic is harmless), but it is a STYLE CHOICE with no correctness
            argument behind it. Per this repo's rule: a copy change whose reason turns
            out to be false gets recorded as having none, rather than fitted with a
            better-sounding one composed after the fact.

            🔴 AND IT CARRIES NO ACTION. Creating a grid lives on My Benchmarks ▸
            Grids, where the viewer's own grids are; an empty-state button here would
            be a second door to the same modal, which is the duplication the removal of
            `grid-new` closed. */}
        {!loading && grids.length === 0 && (
          <EmptyState
            data-testid="grids-empty"
            title="No published grids yet"
            body="The grid open above is all there is for now. Build your own from any matchups and prompts on the board, then publish it for the community to vote on."
          />
        )}

        {/* 🔴 THE OPEN GRID IS FILTERED OUT HERE, against the ALREADY-RESOLVED
            `openKey` — see that prop for why the resolution happens in `App` and not
            twice.

            🔴 AND IT COMPARES THROUGH `entryOpenKey`, THE SAME HELPER THE CARD'S
            `data-key` AND THE Open BUTTON USE. All three used to open-code the
            system/published ternary in three different shapes; this filter is the one
            where getting it wrong shows the SAME GRID TWICE, once in the panel and once
            as a card. One rule, one place.

            🔴 The Top Grid is entry 0 of `communityGridEntries` by construction, not
            by a sort that happens to put it there — so when it IS listed it is still
            first. ---- */}
        <Stack gap={10} data-testid="grids-list">
          {communityEntries
            .filter((entry) => entryOpenKey(entry) !== openKey)
            .map((entry) => entryCard(entry))}
        </Stack>
      </Stack>
    </Stack>
  );
}

/** Re-exported for the App, which resolves the OPEN grid's members the same way. */
export type { ResolvedGridRows };
