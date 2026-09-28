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
// and Report is its mirror (offered only on rows the viewer does NOT own, and
// only when signed in, because the host rejects an anonymous report). The detail
// modal is reached by EVERY viewer, most of whom do not own the matchup, so
// open-coding that decision a second time in the modal is exactly how a
// non-owner comes to be shown an Edit button the host will refuse.
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
//   3. RESOURCE TITLES ARE LINKS in the DETAIL view only — see `ResourceLink`,
//      and read `lib/resourceLink.ts` for what the host actually does with the
//      path, which is measured and is not what the docs say. The card summary
//      stays plain text: it is a list row that already has a drill-in, and a row
//      of links inside a clickable band is two competing affordances.

import type { ReactNode } from 'react';

import { Group, Stack } from '@civitai/blocks-react/ui';
import { ReportButton } from '@civitai/blocks-react/ui';

import { Fragment } from 'react';

import type { CombinationRow } from '../types.js';
import { isOwnRow } from '../lib/benchmark.js';
import { ecosystemForBaseModel, ecosystemMeta } from '../lib/ecosystem.js';
import { metaText, mutedText, token } from '../theme.js';
import { Menu, MenuControl, MenuItem } from './Menu.js';
import { ResourceLink } from './ResourceLink.js';
import { VoteButton } from './VoteButton.js';
import { WithdrawButton } from './WithdrawButton.js';

export interface MatchupBodyProps {
  combo: CombinationRow;
  voted: boolean;
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
                {/* `checkpoint.modelId` is REQUIRED on the wire (and a row whose
                    checkpoint lacks it does not parse at all — see
                    `parseCheckpoint`), so a checkpoint title is always a link. */}
                <ResourceLink
                  name={
                    cfg.label?.trim() ||
                    cfg.checkpoint.modelName ||
                    `Checkpoint #${cfg.checkpoint.versionId}`
                  }
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
                        {/* 🔴 `LoraRef.modelId` IS OPTIONAL AND ALWAYS WILL BE for
                            rows published before it existed — `ResourceLink`
                            renders those as plain, un-underlined text rather than
                            as a link that goes nowhere. */}
                        <ResourceLink
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
                  onReport={() => onReport(combo.key)}
                  data-testid="matchup-report"
                />
              </MenuControl>
            )}
          </Menu>
        )}
        <VoteButton
          count={combo.count}
          voted={voted}
          disabled={viewerId == null}
          onVote={() => onVote(combo.key)}
          onUnvote={() => onUnvote(combo.key)}
          onRequireAuth={onRequireAuth}
          data-testid="matchup-vote"
        />
      </Group>
    </Group>
  );
}
