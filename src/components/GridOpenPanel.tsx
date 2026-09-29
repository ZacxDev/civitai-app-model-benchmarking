// The OPEN grid — its name, whether it is the system entry, the honest count of any
// members that are gone, the controls that act on it, and the runnable matrix.
//
// 🔴 IT CARRIES THE ROW'S ACTIONS, AND IT HAS TO, BECAUSE THE OPEN GRID HAS NO CARD.
// Excluding the open entry from the all-grids list removed its card, and `GridsView`'s
// `entryCard` was the ONLY place that rendered `VoteButton`, `WithdrawButton`,
// `ReportButton`, the ownership badge and the row's description. The consequence was
// not cosmetic: a viewer could not upvote the grid they were reading, an author could
// not withdraw it, and nobody could report it — with the recovery being to open a
// DIFFERENT grid so the first came back to the list and got its buttons again. Voting
// feeds `buildTopGrid`, so this is the ranking mechanic, not a nicety.
//
// 🔴 WHAT THE SYSTEM ENTRY OFFERS: NOTHING OF THE THREE, AND IT IS DERIVED FROM THE
// ENTRY. The Top Grid has no shared row, so there is no key to pass to `shared.vote`,
// `shared.withdraw` or `shared.report` — and it is never the viewer's. Every one of
// those decisions branches on `entry.system` / `isOwnRow(entry.row, viewerId)`, never
// on the rendered NAME: a spelling test would pass for a published grid an author
// happened to call "Top Grid".
//
// 🔴 WHY IT IS ITS OWN COMPONENT NOW. It used to be the top third of `GridsView`,
// which was fine while the grids list sat directly underneath it. The board subnav
// goes BETWEEN them — the open grid stays on Home whichever board is selected,
// because it is the app's primary object and the boards below it are what feed it —
// so the two halves are no longer adjacent and cannot be one component's return
// value.
//
// 🔴 IT HOLDS NO STATE AND RESOLVES NOTHING. Which grid is open, and what its members
// resolve to against the live board, are `App`'s (see `openGridKey` there). That is
// not a style choice: hoisting the open key above the board switch is what makes an
// in-flight run survive a trip to My Benchmarks and back, on the grid the viewer
// actually started it on — a `useState` in here would reset to the Top Grid on
// remount and leave a stalled cell on a grid nobody is looking at.
//
// 🔴 NO TESTID THAT EXISTED WHEN THIS MARKUP LIVED IN `GridsView` WAS RENAMED —
// `grid-open-panel`, `grid-open-title`, `grid-open-system-badge` and
// `grid-missing-notice` are the originals. Extracting a component is not a reason to
// rename a selector: `grid-open-panel` is addressed by `capture-landmarks.test.tsx` and
// read by an external capture recipe.
//
// ⚠️ THE SET HAS SINCE GROWN, so do not read the paragraph above as "these four are all
// of them" — it said exactly that for one round and was falsified by the very next
// change. `grid-open-members` came with the member count; `grid-open-own-badge`,
// `grid-open-withdraw`, `grid-open-report`, `grid-open-vote`, `grid-open-system-note`
// and `grid-open-description` came with the controls above. Every one is prefixed
// `grid-open-` and DISTINCT from the card's equivalent, for the reason spelled out on
// `grid-open-members` below: the panel and a card are both on screen as soon as
// anything else is published, so a shared name makes `getByTestId` ambiguous.

import type { ReactNode } from 'react';

import { Alert, Badge, Group, Stack } from '@civitai/blocks-react/ui';
import { ReportButton } from '@civitai/blocks-react/ui';

import { isOwnRow } from '../lib/benchmark.js';
import { TOP_GRID_NOTE, type GridEntry } from '../lib/gridEntries.js';
import { mutedText } from '../theme.js';
import { VoteButton } from './VoteButton.js';
import { WithdrawButton } from './WithdrawButton.js';

export interface GridOpenPanelProps {
  /**
   * The open entry itself — the ONE source of "is this the system grid", "which row
   * key do the mutations name" and "is it the viewer's".
   *
   * 🔴 IT REPLACED A `system: boolean` PROP, and that is not tidiness. The panel now
   * renders three row-scoped controls, and every one of them needs the row's KEY as
   * well as the system flag. Two props derived from one object, threaded separately,
   * is how a panel comes to show a Remove button for one grid and pass another
   * grid's key to `withdraw`. `system` is still readable as `entry.system`.
   */
  entry: GridEntry;
  /**
   * The signed-in viewer, or `null`.
   *
   * 🔴 IT GATES REPORT AND DECIDES OWNERSHIP, through the app's ONE `isOwnRow`
   * predicate — the same one `GridsView`'s cards and `App.ownGrids` use, so the badge
   * and the affordances beside it cannot disagree about whose grid this is.
   */
  viewerId: number | null;
  /** The open grid's display name. */
  name: string;
  /**
   * The "N matchups × N prompts" summary, already built by `gridMemberSummary` from
   * the RESOLVED members — the same string the cards show in `grid-card-members`.
   *
   * 🔴 IT IS HERE BECAUSE EXCLUDING THE OPEN GRID FROM THE LIST TOOK IT OFF THE PAGE.
   * The count only ever rendered on a card, and the open grid has no card — so on a
   * default load (Top Grid open, nothing else published) the app showed a matrix with
   * no statement anywhere of how many members it has. The count is information in its
   * own right, which is why every card carries it; that is the whole reason, and it is
   * the operator's.
   *
   * ⚠️ A DRAFT OF THIS DOCBLOCK ADDED "a viewer could not tell a grid whose members are
   * all present from one that silently resolved short". RETRACTED — it is FALSE, and it
   * is the exact error class the round that added this prop was fixing. They CAN tell:
   * `missingMembersNotice` returns null iff nothing is missing, so the notice's presence
   * and the shortfall are equivalent. Do not re-derive it; the size-is-information
   * reason above needs no help.
   *
   * 🔴 BUILT BY THE CALLER, FROM THE RESOLVED ROWS — never counted from the authored
   * key lists. A grid's members are what survives resolution against the live board,
   * so an authored length would over-report the moment another author withdraws a
   * row, and it would disagree with the cards, which resolve. One helper
   * (`gridMemberSummary`), two surfaces.
   */
  members: string;
  /**
   * The missing-members sentence, or null.
   *
   * 🔴 CRITERION 8: a grid whose members another author withdrew renders what
   * survives AND says how much is gone. Never a throw, never a quiet shrink — and
   * never blaming an author on a TRUNCATED board scan, which is why the sentence is
   * built by `missingMembersNotice` from the scan's own truncation flag rather than
   * from a set difference alone.
   */
  missing: string | null;
  /** Shared keys this viewer has voted on — the same set the cards read. */
  votedKeys: Set<string>;
  /**
   * Shared keys this viewer has already REPORTED this session.
   *
   * 🔴 IT IS `App`'s, NOT `ReportButton`'s LOCAL STATE, and the reason is the same one
   * that put the cards' reports there — see `App.reportedKeys`. Here it matters even
   * without a menu: the panel re-renders on every board switch and every `list()`
   * refresh, and a settled control that resets to "Report" invites a duplicate report
   * of the same row.
   */
  reportedKeys: Set<string>;
  onVote: (key: string) => Promise<number> | void;
  onUnvote: (key: string) => Promise<number> | void;
  onRequireAuth: () => void;
  /** Withdraw the open grid — offered only when it is the viewer's own row. */
  onWithdraw: (key: string) => Promise<void> | void;
  /** Report the open grid to platform moderators (escalation, not removal). */
  onReport: (key: string) => Promise<void>;
  /** The runnable matrix. Money-shaped, so it is passed in rather than built here. */
  children: ReactNode;
}

export function GridOpenPanel({
  entry,
  viewerId,
  name,
  members,
  missing,
  votedKeys,
  reportedKeys,
  onVote,
  onUnvote,
  onRequireAuth,
  onWithdraw,
  onReport,
  children,
}: GridOpenPanelProps): React.JSX.Element {
  const signedIn = viewerId != null;
  /**
   * The shared row behind the open grid, or `null` for the system entry.
   *
   * 🔴 ONE NARROWING, READ BY ALL THREE CONTROLS. Each of them needs both "is there a
   * row" and "what is its key", and deriving that per control is how two of them come
   * to disagree — the shape `App`'s `openEntry` docblock already records one level up.
   * It also keeps the gates type-safe without a cast.
   */
  const row = entry.system ? null : entry.row;
  // 🔴 DERIVED FROM THE ENTRY, never from `name`. See this file's header.
  const isOwn = row !== null && isOwnRow(row, viewerId);

  return (
    <Stack gap={8} data-testid="grid-open-panel" style={{ minWidth: 0 }}>
      <Group justify="space-between" align="center" gap={12}>
        <Group gap={8} align="center" style={{ minWidth: 0 }}>
          <strong style={{ fontSize: 15 }} data-testid="grid-open-title">
            {name}
          </strong>
          {entry.system && (
            <Badge variant="light" data-testid="grid-open-system-badge">
              System grid
            </Badge>
          )}
          {/* 🔴 OWNERSHIP AS A BADGE, from the SAME `isOwn` that gates Remove below —
              one predicate, so the label and the affordance cannot disagree. A
              DISTINCT testid from the card's `grid-own-badge` for the reason every
              other `grid-open-*` name exists: both surfaces can be on screen at once. */}
          {isOwn && (
            <Badge color="success" variant="light" data-testid="grid-open-own-badge">
              Yours
            </Badge>
          )}
          {/* 🔴 A DISTINCT TESTID FROM THE CARD'S `grid-card-members`, on purpose. The
              two are the same STRING from the same helper but different SURFACES, and
              a shared testid would make `getByTestId` ambiguous the moment the open
              grid and a card are both on screen — which is the normal state as soon
              as anything is published. Same reason every other `grid-open-*` name
              exists. ⚠️ jsdom performs no layout, so nothing here judges whether it
              READS as beside the title; only that it is in the panel. */}
          <Badge variant="light" data-testid="grid-open-members">
            {members}
          </Badge>
        </Group>

        {/* ---- THE ROW'S ACTIONS. Every one of the three is gated on the ENTRY, and
             each gate is the SAME condition the card applies, so a viewer is offered
             exactly what they were offered before the open grid stopped being listed.
             ---- */}
        <Group gap={6} align="center" wrap={false}>
          {row !== null && isOwn && (
            <WithdrawButton
              noun="grid"
              onWithdraw={() => onWithdraw(row.key)}
              data-testid="grid-open-withdraw"
            />
          )}
          {row !== null && !isOwn && signedIn && (
            <ReportButton
              /* 🔴 KEYED BY THE ROW, per `ReportButtonProps`' own example: the settled
                 state belongs to the grid, and this one component instance survives
                 the open grid CHANGING. Without the key, opening grid B would show it
                 still settled from a report filed against grid A. */
              key={row.key}
              noun="grid"
              reported={reportedKeys.has(row.key)}
              onReport={() => onReport(row.key)}
              data-testid="grid-open-report"
            />
          )}
          {/* 🔴 THE TOP GRID GETS NO VOTE CONTROL AT ALL — not a disabled one. It has
              no shared row, so there is no key to pass to `shared.vote`; a greyed
              button would imply a vote is possible for somebody, and it is possible
              for nobody. Same rule, same words, as the card's. */}
          {row !== null && (
            <VoteButton
              count={row.count}
              voted={votedKeys.has(row.key)}
              disabled={!signedIn}
              onVote={() => onVote(row.key)}
              onUnvote={() => onUnvote(row.key)}
              onRequireAuth={onRequireAuth}
              data-testid="grid-open-vote"
            />
          )}
        </Group>
      </Group>

      {/* ---- THE ROW'S OWN WORDS, which also only ever rendered on a card. The
           system entry's note is the one that earns its place twice over: it is
           where a viewer learns WHY there is no vote control beside the title. ---- */}
      {row === null ? (
        <span style={mutedText} data-testid="grid-open-system-note">
          {TOP_GRID_NOTE}
        </span>
      ) : (
        row.description && (
          <span style={mutedText} data-testid="grid-open-description">
            {row.description}
          </span>
        )
      )}

      {missing && (
        <Alert color="warning" data-testid="grid-missing-notice">
          {missing}
        </Alert>
      )}
      {children}
    </Stack>
  );
}
