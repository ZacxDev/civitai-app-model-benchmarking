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
//   - ARCHIVE → `MyList`, on that same surface. Archive is an author-side hide
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
// above. Open another grid and the Top Grid joins the list like any other entry, still
// badged system-owned and still carrying no vote control.
//
// ⚠️ THE JUSTIFICATION THIS PARAGRAPH USED TO GIVE WAS FALSE, and it is recorded rather
// than replaced with a better-sounding one. It read: a card whose only distinguishing
// content was "Shown in full above" is "a row the viewer cannot act on sitting in the
// position that pushes every row they CAN act on further down". The second half is
// fine. The first half was wrong on this very file's own markup — `entryCard` renders
// Open, Remove, Report and the vote control, so the open grid's card carried THREE
// action buttons and was the most actionable row in the list. Excluding it therefore
// REMOVED affordances rather than removing dead weight, which is the defect
// `GridOpenPanel` now closes by carrying vote / withdraw / report itself.
//
// 🔴 WHAT THE EXCLUSION IS ACTUALLY FOR, and it is the one reason that survives
// measurement: the open grid's card previewed exactly the cells its own matrix already
// renders full-size a few hundred pixels above — a duplicate gated read of the same
// ids, pinned by `gridPreviewSeam.test.tsx` at 3 calls not 4. See the `GridPreview`
// comment below, which has the numbers. Position is a secondary, real benefit; "the
// viewer cannot act on it" is not a reason at all.
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
  entryOpenRef,
  gridMemberSummary,
  gridPreviewIds,
  missingMembersNotice,
  resolveGridRows,
  TOP_GRID_NAME,
  TOP_GRID_NOTE,
  type GridEntry,
  type OpenGridRef,
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
  /**
   * Shared keys this viewer has already REPORTED — see `App.reportedKeys` for why the
   * record lives there and not in `ReportButton`'s local state.
   */
  reportedKeys: Set<string>;
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
   * Which LISTED entry is OPEN, ALREADY RESOLVED, as its `entryDomKey` — the
   * `'__system__'` sentinel for the Top Grid, a shared key for a published row, and
   * `null` for "nothing in this list is open".
   *
   * 🔴 "ALREADY RESOLVED" IS THE CONTRACT AND IT MATTERS. A grid the viewer had open
   * can be withdrawn while they look at it, and `App` falls the open grid back to
   * the Top Grid in that case. If this prop carried the RAW key instead, the panel
   * above would render the Top Grid while this list — finding no entry whose key
   * matches a row that no longer exists — would ALSO list it, showing the same grid
   * twice. One spelling of "which grid is open", decided once, in `App`.
   *
   * 🔴 IT WAS `null` = "THE TOP GRID IS OPEN", AND THAT COLLAPSED TWO STATES THE
   * MOMENT A THIRD KIND OF GRID COULD BE OPEN. The filter compared an `entryOpenKey`
   * (deleted since — see `entryDomKey`), which returned `null` for the system entry, so
   * the comparison excluded the Top Grid from the list whenever `openKey` was `null` —
   * which is exactly what `App` passes while one of the viewer's own PRIVATE grids is
   * open. The Top Grid then vanished from the board for a reason no one could see: it is
   * not open, and it is not listed either. Measured by `src/gridOpenPrivate.test.tsx`'s
   * list-completeness case, which failed on the first implementation of the private open
   * path.
   *
   * `entryDomKey` is the fix because it is TOTAL on the listable entries — every one
   * of them maps to a non-null string — which leaves `null` free to mean "none of
   * them". It is also the same helper the card's React key and `data-key` use, so the
   * filter cannot drift from the thing it filters.
   */
  openKey: string | null;
  /**
   * Open a listed grid. `App` holds the state and this IS its setter.
   *
   * 🔴 AN {@link OpenGridRef}, NOT A KEY, SO THERE IS NO ADAPTER. It was
   * `(key: string | null) => void` with `null` meaning the Top Grid, which needed a
   * `key === null ? {kind:'system'} : …` translation in `App` — a second place reading
   * the same `null` that `openKey` above uses for "nothing in this list is open". The
   * tagged reference removes both the adapter and the shared sentinel; this component
   * builds it with `entryOpenRef` and names no identity of its own.
   */
  onOpen: (ref: OpenGridRef) => void;
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
  reportedKeys,
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

  /**
   * The entries this list actually RENDERS — every community entry except the open one.
   *
   * 🔴 ONE FILTER, READ BY BOTH THE LIST AND ITS EMPTY STATE. The empty state used to
   * gate on `grids.length === 0`, a different predicate that agreed with this one only
   * while the Top Grid could not be left in the list — see the empty state's own
   * comment for the state that broke the agreement.
   */
  const listed = useMemo(
    () => communityEntries.filter((entry) => entryDomKey(entry) !== openKey),
    [communityEntries, openKey],
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
        {/* 🔴 NO `space-between` ROW HERE ANY MORE — the content column is a direct
            child of the card's Stack and the actions are its LAST child, below the
            preview strip. `MatchupBody`'s header carries the measured reflow this
            removes; all five card shapes took the same change in one pass. */}
          <Stack gap={4} style={{ minWidth: 0 }}>
            <Group gap={8} align="center">
              <strong data-testid="grid-card-name">{name}</strong>
              {/* 🔴 NO "System grid" BADGE. It was removed on operator feedback: the
                  card already carries `grid-system-note` — a full sentence saying
                  what the system entry IS and why it cannot be voted on — so the
                  badge restated the note's first two words in a pill and pushed the
                  member summary along the row for nothing. The NOTE is the label;
                  every test that used the badge as "this is the system entry" reads
                  the note instead. Do not re-add it without deleting the note. */}
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
        {/* 🔴 THE ACTION CLUSTER, AT THE BOTTOM OF THE CARD. `row-actions` is the one
            spelling shared by all five card shapes; see `MatchupBody` for the measured
            reflow this placement removes and for why the id is noun-neutral. */}
        <Group gap={6} align="center" data-testid="row-actions">
          {/* 🔴 AN ACTION, NOT A TOGGLE. Every button here belongs to a CLOSED
              grid, because the open one is not listed — a permanently
              `aria-pressed="false"` toggle would announce a state that has no other
              value on this surface. */}
          <Button
            size="sm"
            variant="light"
            onClick={() => onOpen(entryOpenRef(entry))}
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
              /* 🔴 KEYED BY THE ROW, per `ReportButtonProps`' own example: the
                 settled state belongs to the grid, and this list RE-ORDERS (by vote
                 count) and gains/loses the open entry as the viewer navigates. */
              key={entry.row.key}
              noun="grid"
              reported={reportedKeys.has(entry.row.key)}
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
        {/* 🔴 THE EMPTY STATE IS GATED ON THE RENDERED LIST, NOT ON `grids.length`, AND
            THAT IS A FIX RATHER THAN A TIDY-UP. `grids.length === 0` USED TO IMPLY the
            rendered list was empty, because the only entry it could hold besides a
            published row was the Top Grid and the Top Grid was always the open one in
            that state. A PRIVATE grid can be open now, in which case `openKey` is `null`
            ("nothing in this list is open") and `entryDomKey(topGrid)` is `'__system__'`,
            so the Top Grid IS listed — and the banner saying there are no grids rendered
            directly above a card that is one. `listed` is the thing the sentence is
            about, so `listed` is what it reads.

            🔴 THE COPY IS NOW TRUE IN EXACTLY THE STATE IT RENDERS, which is what the
            gate change bought. `listed.length === 0` requires BOTH that nothing is
            published AND that the open grid is the Top Grid (it is entry 0 of
            `communityGridEntries` by construction, so the only way the list is empty is
            that the filter removed it) — so "the grid open above is all there is" is
            literally the case, every time this renders.

            ⚠️ THE PARAGRAPH THIS REPLACES SAID THE COPY HAD NO ESTABLISHED REASON, and
            that was honest at the time and is recorded rather than dropped: an earlier
            version claimed the sidebar/board change had made "The Top Grid above is
            always here" false, which it had not. What makes the sentence load-bearing is
            the gate above it, which did not exist then.

            🔴 AND IT CARRIES NO ACTION. Creating a grid lives on My Benchmarks ▸
            Grids, where the viewer's own grids are; an empty-state button here would
            be a second door to the same modal, which is the duplication the removal of
            `grid-new` closed. */}
        {!loading && listed.length === 0 && (
          <EmptyState
            data-testid="grids-empty"
            title="No published grids yet"
            body="The grid open above is all there is for now. Build your own from any matchups and prompts on the board, then publish it for the community to vote on."
          />
        )}

        {/* 🔴 THE OPEN GRID IS FILTERED OUT HERE, against the ALREADY-RESOLVED
            `openKey` — see that prop for why the resolution happens in `App` and not
            twice.

            🔴 AND IT COMPARES THROUGH `entryDomKey`, THE SAME HELPER THE CARD'S REACT
            KEY AND `data-key` USE. All three used to open-code the system/published
            ternary in three different shapes; this filter is the one where getting it
            wrong shows the SAME GRID TWICE, once in the panel and once as a card. One
            rule, one place.

            🔴 `entryDomKey` RATHER THAN THE `entryOpenKey` THIS USED TO READ, AND THAT
            IS A FIX, NOT A STYLE CHOICE. That helper no longer exists — it was replaced
            by `entryDomKey`, not kept alongside it. It returned `null` for the system
            entry, so this comparison silently excluded the Top Grid whenever `openKey`
            was `null` — including when `null` means "a PRIVATE grid is open and nothing
            in this list is". `entryDomKey` is total on listable entries, which is what
            leaves `null` free to mean "none of them". See the prop's own docblock, and
            `lib/gridEntries.ts`'s `entryDomKey` for the replacement itself.

            🔴 The Top Grid is entry 0 of `communityGridEntries` by construction, not
            by a sort that happens to put it there — so when it IS listed it is still
            first.

            🔴 AND THE FILTERED LIST IS COMPUTED ONCE, ABOVE, BECAUSE THE EMPTY STATE
            READS IT TOO. Two `.filter()` calls over the same predicate is how a banner
            comes to disagree with the list it is about — which is the defect the gate
            on `listed.length` closes. ---- */}
        <Stack gap={10} data-testid="grids-list">
          {listed.map((entry) => entryCard(entry))}
        </Stack>
      </Stack>
    </Stack>
  );
}

/** Re-exported for the App, which resolves the OPEN grid's members the same way. */
export type { ResolvedGridRows };
