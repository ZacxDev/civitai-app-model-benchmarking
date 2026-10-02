// The OPEN grid — its name, whether it is the system entry, the honest count of any
// members that are gone, the controls that act on it, and the runnable matrix.
//
// 🔴 IT CARRIES THE ROW'S ACTIONS, AND IT HAS TO, BECAUSE THE OPEN GRID HAS NO CARD.
// Excluding the open entry from the all-grids list removed its card, and `GridsView`'s
// `entryCard` was the ONLY place that rendered `VoteButton`, `WithdrawButton`,
// `ReportButton`, the ownership badge and the row's description. The consequence was
// not cosmetic: a viewer could not upvote the grid they were reading, an author could
// not withdraw it, and nobody could report it — with the recovery being to open a
// DIFFERENT grid so the first came back to the list and got its buttons again.
//
// 🔴 AND THE VOTE IS A RANKING MECHANIC, NOT A NICETY — but name the RIGHT ranking. A
// GRID's `count` feeds `orderGridsByVotes`, which is the community grids list's whole
// order (§7.1's tie-break included). It does NOT feed `buildTopGrid`: that reads
// MATCHUP and PROMPT votes to pick the Top Grid's members, and a grid row's votes are
// invisible to it. ⚠️ A draft of this paragraph said "voting feeds `buildTopGrid`",
// which is false for every control this panel renders; recorded rather than quietly
// swapped, because the two rankings are easy to conflate and the file next door
// (`lib/gridEntries.ts`) keeps them deliberately separate.
//
// 🔴 WHAT THE SYSTEM ENTRY OFFERS: NOTHING OF THE THREE, AND IT IS DERIVED FROM THE
// OPEN GRID. The Top Grid has no shared row, so there is no key to pass to
// `shared.vote`, `shared.withdraw` or `shared.report` — and it is never the viewer's.
// Every one of those decisions branches on `open.kind` / `isOwnRow(open.row, viewerId)`,
// never on the rendered NAME: a spelling test would pass for a published grid an author
// happened to call "Top Grid".
//
// 🔴 AND THERE IS NOW A THIRD KIND, WHICH OFFERS NONE OF THE THREE FOR THE SAME
// REASON. A viewer can open one of their OWN PRIVATE grids — a record in per-viewer KV
// with a local id and no shared row — so they can generate into it before publishing
// it. No shared row means no key, so vote/withdraw/report are absent by the same
// derivation rather than by a second rule. What it DOES get is the "Private" badge and,
// where it matters, the sentence on the confirm path saying the OUTPUTS are not private
// even though the grid is (`cell-private-grid-notice` in `ResultsGrid`).
//
// ⚠️ THE PANEL STILL HOLDS NO STATE AND RESOLVES NOTHING. Which grid is open and what
// its members resolve to is `App`'s, and for a private grid the resolution goes through
// the SAME `resolveMemberRows` every other grid uses — which is what keeps a private
// member (and therefore a local id) out of every cell identity. See
// `lib/gridEntries.ts`'s `resolveOpenGrid`.
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
// rename a selector. (⚠️ `grid-open-system-badge` has since been DELETED, not
// renamed — the "System grid" pill was removed on operator feedback and
// `grid-open-system-note` is the system marker now. The don't-rename rule is
// unaffected: deleting a control deletes its selector.)
//
// ⚠️ THE REASON GIVEN FOR THAT USED TO BE A FALSE CROSS-REFERENCE: "`grid-open-panel`
// is addressed by `capture-landmarks.test.tsx` and read by an external capture recipe".
// It is NOT in that file — `git grep` finds `grid-open-panel` nowhere in it. What that
// file's `LANDMARKS` ledger actually carries is `['section-open-grid', 'contains',
// 'results-grid']`, i.e. the SECTION this panel sits inside, plus the matrix below it.
// Whether an external recipe reads `grid-open-panel` itself cannot be checked from this
// repo (the recipe lives elsewhere), so no claim is made about it either way. The
// don't-rename rule stands on its own; it needed no borrowed authority.
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
import { TOP_GRID_NOTE, type OpenGrid } from '../lib/gridEntries.js';
import { mutedText } from '../theme.js';
import { VoteButton } from './VoteButton.js';
import { WithdrawButton } from './WithdrawButton.js';

export interface GridOpenPanelProps {
  /**
   * The open grid itself — the ONE source of "which of the three kinds is this",
   * "which row key do the mutations name" and "is it the viewer's".
   *
   * 🔴 IT REPLACED A `system: boolean` PROP, and that is not tidiness. The panel
   * renders three row-scoped controls, and every one of them needs the row's KEY as
   * well as the kind. Two props derived from one object, threaded separately, is how a
   * panel comes to show a Remove button for one grid and pass another grid's key to
   * `withdraw`.
   *
   * 🔴 AND IT IS NOW `OpenGrid`, NOT `GridEntry`, BECAUSE THIS PANEL HAS A THIRD STATE
   * THE GRIDS LIST DOES NOT. A viewer can open one of their OWN PRIVATE grids — a
   * record in per-viewer KV, with a local id and no shared row — so that it can be
   * generated into before it is published. `GridEntry`'s `system: true | false`
   * discriminant cannot spell that without making `entry.row` a lie at every consumer
   * that narrows on it; `lib/gridEntries.ts`'s `OpenGrid` docblock carries the whole
   * argument. The prop is named `open` rather than `entry` so the rename is a compile
   * error at the call site instead of a silent type widening.
   */
  open: OpenGrid;
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
   *
   * 🔴 ONE SLOT, TWO BUILDERS, AND THE CALLER PICKS. For a system or published grid
   * the sentence is `missingMembersNotice`'s. For a PRIVATE grid it is
   * `privateGridShortfall`'s, because the other one attributes the absence to "their
   * authors removed them" and the commonest cause here is the viewer's own
   * still-private member. Both are in `lib/gridEntries.ts`; this panel renders
   * whichever string it is handed and attributes nothing itself.
   */
  missing: string | null;
  /** Shared keys this viewer has voted on — the same set the cards read. */
  votedKeys: Set<string>;
  /**
   * Shared keys this viewer has already REPORTED this session.
   *
   * 🔴 IT IS `App`'s, NOT `ReportButton`'s LOCAL STATE, and the reason is the same one
   * that put the cards' reports there — see `App.reportedKeys`.
   *
   * 🔴 WHAT RESETS THE CONTROL ON *THIS* SURFACE, named precisely, because a draft of
   * this docblock named a mechanism that does not exist. There is no ⋮ menu here, so the
   * two resets are:
   *   1. a SIDEBAR NAVIGATION — leaving Home unmounts the whole `view.kind === 'home'`
   *      branch, `section-open-grid` included, and takes the control's local `done`
   *      with it;
   *   2. OPENING A DIFFERENT GRID — the `key={row.key}` below changes, which is a fresh
   *      instance by construction (and is there so grid B is not shown settled from a
   *      report filed against grid A).
   *
   * ⚠️ IT IS *NOT* "the panel re-renders on every board switch and every `list()`
   * refresh", which is what a draft said. `section-open-grid` is a SIBLING of the
   * `board === …` sections inside the one Home branch, so a board switch re-renders this
   * panel and never unmounts it — and a React re-render does not reset local state.
   * Measured by an adversarial audit: with this prop deleted, a board-switch test stayed
   * green. Recorded rather than quietly swapped, because "re-render" and "remount" are
   * exactly the two a reader conflates.
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
  open,
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
   * The shared row behind the open grid, or `null` when there is none — which is now
   * TWO states, the system Top Grid and this viewer's own PRIVATE grid.
   *
   * 🔴 ONE NARROWING, READ BY ALL THREE CONTROLS. Each of them needs both "is there a
   * row" and "what is its key", and deriving that per control is how two of them come
   * to disagree — the shape `App`'s open-grid docblock already records one level up.
   * It also keeps the gates type-safe without a cast.
   *
   * 🔴 THE PRIVATE GRID GETS NONE OF THE THREE, FOR THE SAME REASON THE TOP GRID DOES
   * NOT: there is no shared key to pass to `shared.vote` / `withdraw` / `report`. It
   * is not a permission decision and must not be re-spelled as one.
   */
  const row = open.kind === 'published' ? open.row : null;
  // 🔴 DERIVED FROM THE OPEN GRID, never from `name`. See this file's header.
  const isOwn = row !== null && isOwnRow(row, viewerId);

  return (
    <Stack gap={8} data-testid="grid-open-panel" style={{ minWidth: 0 }}>
      <Group justify="space-between" align="center" gap={12}>
        <Group gap={8} align="center" style={{ minWidth: 0 }}>
          <strong style={{ fontSize: 15 }} data-testid="grid-open-title">
            {name}
          </strong>
          {/* 🔴 NO "System grid" BADGE — removed on operator feedback, same call as
              the card's in `GridsView.tsx`. `grid-open-system-note` below already
              says what this entry is, in a sentence, under the same `entry.system`
              condition; the badge was its first two words in a pill. The NOTE is the
              system marker on this surface now, and it is what the tests read. */}
          {/* 🔴 OWNERSHIP AS A BADGE, from the SAME `isOwn` that gates Remove below —
              one predicate, so the label and the affordance cannot disagree. A
              DISTINCT testid from the card's `grid-own-badge` for the reason every
              other `grid-open-*` name exists: both surfaces can be on screen at once. */}
          {isOwn && (
            <Badge color="success" variant="light" data-testid="grid-open-own-badge">
              Yours
            </Badge>
          )}
          {/* 🔴 THE PRIVATE STATE MARKER, AND IT READS THE SAME WORD `MyList`'s row
              badge does — "Private", not "Draft". It names the one thing the state
              actually means: the record lives in this viewer's own per-viewer KV and
              has never reached `shared.append`, so no other viewer can see THE GRID.
              ⚠️ IT SAYS NOTHING ABOUT THE OUTPUTS, and must not be read as covering
              them — a cell's images are keyed on the matchup and the prompt, not on the
              grid, and are published to the shared board. That is stated where the
              viewer commits to it (`cell-private-grid-notice` in `ResultsGrid`), which
              is the only place a badge beside a title cannot be mistaken for.
              🔴 ITS TESTID IS `grid-open-private-badge`, distinct from `draft-badge` on
              the list row, for the reason every other `grid-open-*` id exists: the panel
              and a card can be on screen at once. */}
          {open.kind === 'private' && (
            <Badge variant="filled" data-testid="grid-open-private-badge">
              Private
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
      {/* 🔴 BRANCHED ON `open.kind`, NOT ON `row === null`. It used to be the latter,
           which was equivalent while `null` meant "the system entry" and ONLY that;
           the private grid makes `row === null` ambiguous, and the system note
           ("Nobody owns it, so it cannot be voted on") is flatly wrong about a grid the
           viewer owns. A `switch`-shaped read is also what makes a fourth kind a
           compile error here rather than a silently-taken else. */}
      {open.kind === 'system' ? (
        <span style={mutedText} data-testid="grid-open-system-note">
          {TOP_GRID_NOTE}
        </span>
      ) : open.kind === 'private' ? (
        open.rec.description && (
          <span style={mutedText} data-testid="grid-open-description">
            {open.rec.description}
          </span>
        )
      ) : (
        open.row.description && (
          <span style={mutedText} data-testid="grid-open-description">
            {open.row.description}
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
