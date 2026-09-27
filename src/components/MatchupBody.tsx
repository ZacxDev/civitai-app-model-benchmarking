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

import type { ReactNode } from 'react';

import { Badge, Button, Group, Stack } from '@civitai/blocks-react/ui';
import { ReportButton } from '@civitai/blocks-react/ui';
import { Tooltip } from '@civitai/components-react';

import { Fragment } from 'react';

import type { CombinationRow } from '../types.js';
import { isOwnRow } from '../lib/benchmark.js';
import { ecosystemForBaseModel, ecosystemMeta } from '../lib/ecosystem.js';
import { metaText, mutedText, token } from '../theme.js';
import { VoteButton } from './VoteButton.js';
import { WithdrawButton } from './WithdrawButton.js';

/**
 * The "Included" badge's tooltip.
 *
 * 🔴 EXPORTED SO A TEST CAN PIN THE WHOLE STRING. It is a CLAIM about what the
 * badge means, and this claim has now been wrong TWICE. First it read "Change how
 * many in the Grid tab", naming the per-viewer `Slider` that 527 deleted. Then it
 * read "build a grid in the Grids tab" — and the IA refactor deleted the tab
 * strip, so there is no Grids *tab* to go to; the grids list is a section on the
 * one page. A keyword guard would have stayed green through both rewords; the
 * whole normalised string is what makes the claim machine-readable, and a
 * cosmetic reword failing the test is the price of that.
 */
export const INCLUDED_ROW_TOOLTIP =
  'Included: currently in the top by votes, so its model configs are rows of the ' +
  'system-owned Top Grid — ranked over the entries this app has loaded. To pick ' +
  'your own rows, build a grid in the Grids section on this page.';

export interface MatchupBodyProps {
  combo: CombinationRow;
  /** Is this matchup in the top-N that forms the Top Grid's rows? */
  included: boolean;
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
  /** Edit — rendered only for the author. Omitted by callers with no edit path. */
  onEdit?: (combo: CombinationRow) => void;
  /** Withdraw — rendered only for the author. */
  onWithdraw?: (key: string) => Promise<void> | void;
  onReport: (key: string) => Promise<void>;
  /** Caller-supplied extra control (Archive / Unarchive in the My list). */
  extraActions?: ReactNode;
}

export function MatchupBody({
  combo,
  included,
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
  // Distinct ecosystems across the combo's configs (in first-seen order).
  const ecos: string[] = [];
  for (const cfg of combo.data.configs) {
    const e = ecosystemForBaseModel(cfg.checkpoint.baseModel);
    if (!ecos.includes(e)) ecos.push(e);
  }

  return (
    <Group justify="space-between" align="flex-start">
      <Stack gap={4} style={{ minWidth: 0 }}>
        <Group gap={8}>
          <strong>{combo.name || `#${combo.key}`}</strong>
          {included && (
            <Tooltip label={INCLUDED_ROW_TOOLTIP}>
              <span tabIndex={0} style={{ display: 'inline-flex', borderRadius: 999, cursor: 'help' }}>
                <Badge color="success" variant="light" data-testid="matchup-included">
                  Included
                </Badge>
              </span>
            </Tooltip>
          )}
          <Badge variant="light" data-testid="matchup-config-count">
            {combo.data.configs.length} config{combo.data.configs.length === 1 ? '' : 's'}
          </Badge>
          {ecos.map((e) => (
            <Badge key={e} variant="light" size="sm">
              {ecosystemMeta(e).label}
            </Badge>
          ))}
        </Group>
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
                <span style={{ fontSize: 13, fontWeight: 600 }}>
                  {cfg.label?.trim() ||
                    cfg.checkpoint.modelName ||
                    `Checkpoint #${cfg.checkpoint.versionId}`}
                </span>
                <span style={metaText}>
                  {ecosystemMeta(ecosystemForBaseModel(cfg.checkpoint.baseModel)).label}
                  {cfg.checkpoint.versionName ? ` · ${cfg.checkpoint.versionName}` : ''}
                </span>
                {cfg.loras.length > 0 && (
                  <span style={metaText}>
                    {cfg.loras.map((l, i) => (
                      <Fragment key={`${l.versionId}:${i}`}>
                        {i > 0 && ' · '}
                        {l.modelName ?? `LoRA #${l.versionId}`} @ {l.weight}
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
        {/* Author-scoped affordances — see isOwnRow (the one ownership guard). */}
        {isOwn && onEdit && (
          <Button size="sm" variant="subtle" onClick={() => onEdit(combo)} data-testid="matchup-edit">
            Edit
          </Button>
        )}
        {extraActions}
        {isOwn && onWithdraw && (
          <WithdrawButton
            noun="matchup"
            onWithdraw={() => onWithdraw(combo.key)}
            data-testid="matchup-withdraw"
          />
        )}
        {/* Escalation, and the mirror image of the two above: offered only on rows
            the viewer does NOT own, and only when signed in — the host rejects an
            anonymous report, and an owner has Remove. Filing does NOT hide the
            row; see ReportButton. */}
        {!isOwn && viewerId != null && (
          <ReportButton
            noun="matchup"
            onReport={() => onReport(combo.key)}
            data-testid="matchup-report"
          />
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
