// The MATCHUP row body — one component rendered in TWO places, and that is the
// whole point of extracting it:
//
//   1. inside the `matchup-card` of the Matchups section list (compact: a
//      one-line config summary), and
//   2. inside the MATCHUP DETAIL MODAL a viewer reaches by clicking the grid's
//      matchup band (`detail`: the full config list, every checkpoint and LoRA).
//
// 🔴 THE OWNERSHIP RULE IS THE ONE THING THAT MUST NOT FORK. Edit and Withdraw
// are author-scoped through `isOwnRow` — the app's single ownership predicate —
// and Report AND VOTE are its mirror (offered only on rows the viewer does NOT
// own; Report additionally only when signed in, because the host rejects an
// anonymous report). The detail modal is reached by EVERY viewer, most of whom do
// not own the matchup, so open-coding that decision a second time in the modal is
// exactly how a non-owner comes to be shown an Edit button the host will refuse.
//
// 🔴 VOTE JOINED THAT MIRROR LATE, AND IT IS THE WEAKEST OF THE FOUR. The other
// three gate a HOST-ENFORCED permission; a self-vote is something the host happily
// accepts, so hiding the control is an affordance decision and not a guarantee. See
// `canVote` below for what that does and does not buy.
//
// 🔴 AND IT HIDES THE AFFORDANCE, NOT THE SCORE. An author sees their own matchup's
// vote total — as `VoteTally`, which is the same `VoteCount` the button renders, with no
// control around it. ⚠️ This paragraph said the opposite for one revision ("including
// the vote COUNT it takes off an author's own card"), which was true of the code at the
// time and is the defect the split fixed.
//
// 🔴 "Matchup" is the USER-FACING name only. The wire value stays
// `data.kind: 'combination'` and the parsed row type is still `CombinationRow`.
//
// ── 🔴 THE THIRD IA PASS: BADGES OUT, ACTIONS INTO A MENU, TITLES INTO LINKS ──
//
// Three operator decisions, recorded here because each DELETED something a test
// used to assert and none of them is a refactor:
//
//   1. EVERY BADGE IS GONE — `matchup-included` (with its tooltip), the
//      `matchup-config-count` pill, and the per-ecosystem pills, which carried no
//      testid. The row's identity is its NAME; four pills beside it were reading
//      as chrome. The prompt side lost its badges in the same pass (the operator
//      confirmed the ecosystem pills there go too), so the two modals are
//      symmetric. Consequence worth stating: `INCLUDED_ROW_TOOLTIP` had no render
//      site left and is DELETED, and the case in `IncludedSummary.test.tsx` that
//      pinned its whole string is RETIRED — see that file for why retiring it
//      rather than retargeting it is the honest move. The `matchups-included-
//      summary` COPY is a different thing and is untouched.
//   2. EDIT / REMOVE / REPORT MOVED INTO A `⋮` MENU (`./Menu.tsx`). They are
//      row-level overflow actions and three buttons on a list row out-shouted the
//      row itself. `extraActions` (Archive / Unarchive in the My list) stays
//      OUTSIDE the menu on purpose: it is a caller-supplied slot that the GRID
//      cards also fill, and moving it in only here would make the same control
//      live in two different places on two surfaces.
//   3. RESOURCE TITLES GO THROUGH `ResourceName`, WHICH IS A LINK AGAIN — OR PLAIN
//      TEXT, PER RESOURCE.
//      ⚠️ THIS ITEM SAID THE OPPOSITE UNTIL `civitai/civitai` **#5250**. It read
//      "WHICH RENDERS PLAIN TEXT … THIS SHIPPED AS LINKS AND THE LINKS WERE REMOVED
//      BEFORE RELEASE", because all three routes out of a block's sandboxed iframe
//      were shut. #5250 opened one: `NAVIGATE` now carries a `scope`, and
//      `scope: 'site'` resolves the path at the civitai.com root.
//      ⚠️ AND "THE OTHER TWO ROUTES ARE STILL SHUT" IS RETRACTED — it was the same
//      false claim `./ResourceName.tsx`'s route 2 now names: `target: 'new_tab'` is
//      implemented, by the HOST, from the parent frame. ONE route is still a hazard
//      (a popup the BLOCK opens, which inherits the opener's sandbox), and that one
//      alone is why the control is a `<button>` posting a host message and never an
//      `<a href>` (which would navigate THIS iframe to an opaque-origin, logged-out
//      civitai.com).
//      🔴 PER RESOURCE, not globally: a title is interactive only when its `modelId`
//      is a positive safe integer — see `ResourceName`'s `usableId` for the junk the
//      wire can carry. `LoraRef.modelId` is optional forever (rows published
//      before the field existed can never be backfilled — see `../types.ts`), so the
//      plain-text variant is permanent, not a migration state. Nothing here may
//      advertise an action it cannot perform.
//      The whole record — the three routes, the live `sandbox="allow-scripts
//      allow-forms"` / `trustTier: 'unverified'` reading, and the `private-run`
//      surface where site navigation is refused and the block cannot tell — is in
//      `./ResourceName.tsx`'s header. Filed as `civitai/civitai` #5209, which upstream
//      CLOSED on the host change (#5250) — so this is the app half of a closed issue,
//      and the live click-through is a verification step owed on this change rather
//      than a tracked item. ⚠️ This read "this closes the app half of it", which
//      presupposed an open issue; `ResourceName.tsx` names that exact construction as
//      the defect and a sweep for it missed this sibling.

import type { ReactNode } from 'react';

import { Group, Stack } from '@civitai/blocks-react/ui';
import { ReportButton } from '@civitai/blocks-react/ui';

import { Fragment } from 'react';

import type { CombinationRow } from '../types.js';
import { isOwnRow } from '../lib/benchmark.js';
import { ecosystemForBaseModel, ecosystemMeta } from '../lib/ecosystem.js';
import { metaText, mutedText, token } from '../theme.js';
import { Menu, MenuControl, MenuItem } from './Menu.js';
import { ResourceName } from './ResourceName.js';
import { VoteButton, VoteTally } from './VoteButton.js';
import { WithdrawButton } from './WithdrawButton.js';

export interface MatchupBodyProps {
  combo: CombinationRow;
  voted: boolean;
  /**
   * This viewer has already REPORTED this row.
   *
   * 🔴 IT COMES FROM `App`, NOT FROM `ReportButton`'s LOCAL STATE, and moving Report
   * into the `⋮` menu is what made that necessary: `Menu` unmounts its panel on any
   * outside `mousedown` and on Escape, so a settled "Reported for review" lasted until
   * the viewer's next click and the menu then offered Report again. `report()` is not
   * documented idempotent, so that is a duplicate report. See `App.reportedKeys`.
   */
  reported: boolean;
  viewerId: number | null;
  /**
   * Render the FULL config list instead of the one-line summary.
   *
   * The modal is the only caller that passes it: a grid CARD is a list row and a
   * five-config dump there would bury the list, while the modal exists precisely
   * because the viewer asked to see this one matchup.
   */
  detail?: boolean;
  onVote: (key: string) => Promise<number> | void;
  onUnvote: (key: string) => Promise<number> | void;
  onRequireAuth: () => void;
  /** Edit — offered only to the author. Omitted by callers with no edit path. */
  onEdit?: (combo: CombinationRow) => void;
  /** Withdraw — offered only to the author. */
  onWithdraw?: (key: string) => Promise<void> | void;
  onReport: (key: string) => Promise<void>;
  /** Caller-supplied extra control (Archive / Unarchive in the My list). */
  extraActions?: ReactNode;
}

export function MatchupBody({
  combo,
  voted,
  reported,
  viewerId,
  detail = false,
  onVote,
  onUnvote,
  onRequireAuth,
  onEdit,
  onWithdraw,
  onReport,
  extraActions,
}: MatchupBodyProps): React.JSX.Element {
  const isOwn = isOwnRow(combo, viewerId);
  // Author-scoped affordances — see isOwnRow (the one ownership guard). Report is
  // their mirror: offered only on rows the viewer does NOT own, and only when
  // signed in (the host rejects an anonymous report, and an owner has Remove).
  // Filing does NOT hide the row; see ReportButton.
  const canEdit = isOwn && onEdit !== undefined;
  const canWithdraw = isOwn && onWithdraw !== undefined;
  const canReport = !isOwn && viewerId != null;
  /**
   * 🔴 VOTING IS OFFERED ONLY ON ROWS THE VIEWER DOES NOT OWN — the THIRD affordance
   * on the Report side of the ownership mirror, and an operator decision.
   *
   * Self-voting was always available and always slightly dishonest: a matchup's vote
   * total is what decides whether it becomes one of the grid's rows, so an author
   * upvoting their own row is ranking their submission with the same instrument
   * everyone else ranks it with. Taking the control away is the only enforcement this
   * app can perform — `shared.vote` is a HOST call and the host does not refuse a
   * self-vote, so a viewer with the network tab open can still cast one. This is a UI
   * affordance, NOT a guarantee, and nothing here may claim otherwise.
   *
   * 🔴 SAME PREDICATE AS Edit/Remove/Report, DELIBERATELY. `isOwnRow` is the app's one
   * ownership guard; a second ownership test spelled here is exactly how a row comes
   * to be editable-but-votable (or the reverse). It is also why ANONYMOUS viewers keep
   * the control: `isOwnRow(row, null)` is false for every row, so a signed-out viewer
   * still sees the disabled vote button that routes to the sign-in nudge — which is
   * the behaviour `report.test.tsx`'s signed-out case uses as its positive control.
   *
   * 🔴 IT HIDES THE AFFORDANCE AND NOT THE SCORE, AND THAT DISTINCTION COST A ROUND.
   * For one revision this rendered nothing at all on an author's own row, because
   * `VoteButton` carried the total INSIDE the button — so "no vote control" silently
   * meant "no vote count", and an author could not see their own matchup's score on
   * the card at all. The operator's call was to KEEP the count, which is why
   * `VoteCount` is now a component of its own and `VoteTally` renders it with no
   * affordance (see `VoteButton.tsx`). The two branches below are therefore NOT
   * "control or nothing" — they are "control, or the same number without the control".
   */
  const canVote = !isOwn;

  return (
    <Group justify="space-between" align="flex-start">
      <Stack gap={4} style={{ minWidth: 0 }}>
        <strong>{combo.name || `#${combo.key}`}</strong>
        {combo.description && <span style={mutedText}>{combo.description}</span>}
        {detail ? (
          <Stack gap={6} data-testid="matchup-detail-configs" style={{ marginTop: 4 }}>
            {combo.data.configs.map((cfg) => (
              <Stack
                key={cfg.id}
                gap={2}
                data-testid="matchup-detail-config"
                style={{ paddingLeft: 10, borderLeft: `2px solid ${token.border}` }}
              >
                <ResourceName
                  name={
                    cfg.label?.trim() ||
                    cfg.checkpoint.modelName ||
                    `Checkpoint #${cfg.checkpoint.versionId}`
                  }
                  /* `CheckpointRef.modelId` is REQUIRED — `parseCheckpoint` rejects a
                     config without it — so a checkpoint title is linkable far more
                     often than a LoRA's below.
                     ⚠️ NOT "always", which a draft of this comment claimed:
                     `parseCheckpoint` requires only `isNum(raw.modelId)`, and `isNum`
                     admits `0` and negatives, so a wire row written by another client
                     can carry an unusable id. `ResourceName` renders those as plain
                     text, which is why this passes the value through undefaulted. */
                  modelId={cfg.checkpoint.modelId}
                  versionId={cfg.checkpoint.versionId}
                  style={{ fontSize: 13, fontWeight: 600 }}
                />
                <span style={metaText}>
                  {ecosystemMeta(ecosystemForBaseModel(cfg.checkpoint.baseModel)).label}
                  {cfg.checkpoint.versionName ? ` · ${cfg.checkpoint.versionName}` : ''}
                </span>
                {cfg.loras.length > 0 && (
                  <span style={metaText}>
                    {cfg.loras.map((l, i) => (
                      <Fragment key={`${l.versionId}:${i}`}>
                        {i > 0 && ' · '}
                        {/* ⚠️ `l.modelId` IS READ NOW. This comment said it was
                            "DELIBERATELY NOT READ HERE … rendering a link off it
                            today would be the dead control `ResourceName`'s header
                            forbids", which was true until `civitai/civitai` #5250
                            shipped `scope: 'site'`.
                            🔴 AND THE NEXT SENTENCE IS RETRACTED: it said "the data
                            that accumulated in the meantime is what makes the link
                            possible on old rows at all". It does not — the field and
                            its write site BOTH arrived in `e8775c0` (2026-09-29), two
                            days before this change, so there is no accumulated data
                            and NO old row links. For LoRAs the unlinked variant is the
                            norm here, not a tail; `../types.ts` carries the derivation
                            and the bound on what it does and does not claim. That is
                            why `ResourceName` keeps a plain-text variant rather than
                            linking unconditionally.
                            🔴 PASSED STRAIGHT THROUGH, undefaulted: a `?? 0` here
                            would turn an un-backfillable LoRA into a link to
                            `/models/0`. `ResourceName` rejects an unusable id on
                            its own too — one rule, two places it cannot be got
                            wrong. */}
                        <ResourceName
                          name={l.modelName ?? `LoRA #${l.versionId}`}
                          modelId={l.modelId}
                          versionId={l.versionId}
                        />
                        {` @ ${l.weight}`}
                      </Fragment>
                    ))}
                  </span>
                )}
              </Stack>
            ))}
          </Stack>
        ) : (
          <span style={metaText} data-testid="matchup-config-summary">
            {combo.data.configs.map((cfg, i) => (
              <Fragment key={cfg.id}>
                {i > 0 && ' · '}
                {cfg.label?.trim() ||
                  cfg.checkpoint.modelName ||
                  `Checkpoint #${cfg.checkpoint.versionId}`}
                {cfg.loras.length > 0 && ` (+${cfg.loras.length} LoRA)`}
              </Fragment>
            ))}
          </span>
        )}
      </Stack>
      <Group gap={6} align="center">
        {extraActions}
        {(canEdit || canWithdraw || canReport) && (
          <Menu
            label="Matchup actions"
            data-testid="matchup-menu"
            panelTestId="matchup-menu-items"
          >
            {canEdit && (
              <MenuItem label="Edit" onSelect={() => onEdit!(combo)} data-testid="matchup-edit" />
            )}
            {canWithdraw && (
              <MenuControl>
                <WithdrawButton
                  noun="matchup"
                  onWithdraw={() => onWithdraw!(combo.key)}
                  data-testid="matchup-withdraw"
                />
              </MenuControl>
            )}
            {canReport && (
              <MenuControl>
                <ReportButton
                  noun="matchup"
                  reported={reported}
                  onReport={() => onReport(combo.key)}
                  data-testid="matchup-report"
                />
              </MenuControl>
            )}
          </Menu>
        )}
        {/* 🔴 ONE `combo.count`, TWO PRESENTATIONS. The branch decides the AFFORDANCE
            only: every viewer sees the score, and only a non-owner is offered the
            press. A reader checking "does an author see their own score" should be
            able to answer it from these few lines. */}
        {canVote ? (
          <VoteButton
            count={combo.count}
            voted={voted}
            disabled={viewerId == null}
            onVote={() => onVote(combo.key)}
            onUnvote={() => onUnvote(combo.key)}
            onRequireAuth={onRequireAuth}
            data-testid="matchup-vote"
          />
        ) : (
          <VoteTally count={combo.count} />
        )}
      </Group>
    </Group>
  );
}
