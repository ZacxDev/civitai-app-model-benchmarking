// Browse + vote on MATCHUPS. The top-N by votes are badged "Included" (they
// form the grid's rows). The submit affordance opens the matchup form.
//
// 🔴 "Matchup" is the USER-FACING name only. The wire value stays
// `data.kind: 'combination'` (see docs/matchups.md §6.1) and the parsed row type
// is still `CombinationRow` — renaming either would be a data migration this app
// cannot perform, since `shared.update` is author-scoped.

import { Alert, Badge, Button, Card, Group, Loader, Stack } from '@civitai/blocks-react/ui';
import { Tooltip } from '@civitai/components-react';

import { Fragment, type ReactNode } from 'react';

import type { CombinationRow } from '../types.js';
import { includedSummary, isOwnRow } from '../lib/benchmark.js';
import { ecosystemForBaseModel, ecosystemMeta } from '../lib/ecosystem.js';
import { mutedText, metaText } from '../theme.js';
import { EmptyState } from './EmptyState.js';
import { VoteButton } from './VoteButton.js';
import { ReportButton } from '@civitai/blocks-react/ui';
import { WithdrawButton } from './WithdrawButton.js';

export interface MatchupsViewProps {
  combinations: CombinationRow[];
  includedKeys: Set<string>;
  votedKeys: Set<string>;
  viewerId: number | null;
  loading: boolean;
  error: string | null;
  onSubmitNew: () => void;
  onVote: (key: string) => Promise<number> | void;
  onUnvote: (key: string) => Promise<number> | void;
  onRequireAuth: () => void;
  /** Edit one of the viewer's OWN combinations (in-place). */
  onEdit: (combo: CombinationRow) => void;
  /** Withdraw one of the viewer's OWN combinations from the shared grid. */
  onWithdraw: (key: string) => Promise<void> | void;
  /** Report ANOTHER viewer's row to platform moderators (escalation, not removal). */
  onReport: (key: string) => Promise<void>;
  /**
   * The PRIVATE drafts panel, rendered above the public list. A slot rather than
   * a prop bundle so this view keeps knowing nothing about per-viewer storage —
   * the whole point of the draft/submit split is that the two halves are
   * separate stores, and mixing their props here would be the first place that
   * stops being obvious.
   */
  draftsSlot?: ReactNode;
}

export function MatchupsView({
  combinations,
  includedKeys,
  votedKeys,
  viewerId,
  loading,
  error,
  onSubmitNew,
  onVote,
  onUnvote,
  onRequireAuth,
  onEdit,
  onWithdraw,
  onReport,
  draftsSlot,
}: MatchupsViewProps): React.JSX.Element {
  return (
    <Stack gap={14} data-testid="matchups-view">
      {draftsSlot}
      <Group justify="space-between" align="center" gap={12}>
        <span style={{ ...mutedText, flex: '1 1 260px', minWidth: 0 }} data-testid="matchups-included-summary">
          Submit and vote on checkpoint + LoRA matchups. {includedSummary(includedKeys.size, 'row')}
        </span>
        <Button size="sm" onClick={onSubmitNew} data-testid="submit-matchup">
          Submit matchup
        </Button>
      </Group>

      {error && (
        <Alert color="error" data-testid="matchups-error">
          {error}
        </Alert>
      )}

      {loading && (
        <Stack align="center" gap={10} style={{ padding: '28px 0' }}>
          <Loader data-testid="matchups-loading" />
          <span style={metaText}>Loading matchups…</span>
        </Stack>
      )}

      {!loading && combinations.length === 0 && (
        <EmptyState
          data-testid="matchups-empty"
          title="No matchups yet"
          body="Be the first to submit a checkpoint + LoRA matchup for the community to vote on."
          action={
            <Button size="sm" onClick={onSubmitNew}>
              Submit matchup
            </Button>
          }
        />
      )}

      <Stack gap={10} data-testid="matchups-list">
        {combinations.map((combo) => {
          const isOwn = isOwnRow(combo, viewerId);
          // Distinct ecosystems across the combo's configs (in first-seen order).
          const ecos: string[] = [];
          for (const cfg of combo.data.configs) {
            const e = ecosystemForBaseModel(cfg.checkpoint.baseModel);
            if (!ecos.includes(e)) ecos.push(e);
          }
          return (
            <Card key={combo.key} withBorder padding="md" data-testid="matchup-card" data-key={combo.key}>
              <Group justify="space-between" align="flex-start">
                <Stack gap={4}>
                  <Group gap={8}>
                    <strong>{combo.name || `#${combo.key}`}</strong>
                    {includedKeys.has(combo.key) && (
                      <Tooltip label="Included: currently in your top-N by votes, so its model configs are rows of the grid you see. Change how many in the Grid tab.">
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
                </Stack>
                <Group gap={6} align="center">
                  {/* Author-scoped affordances — see isOwnRow (the one ownership guard). */}
                  {isOwn && (
                    <Button size="sm" variant="subtle" onClick={() => onEdit(combo)} data-testid="matchup-edit">
                      Edit
                    </Button>
                  )}
                  {isOwn && (
                    <WithdrawButton
                      noun="matchup"
                      onWithdraw={() => onWithdraw(combo.key)}
                      data-testid="matchup-withdraw"
                    />
                  )}
                  {/* Escalation, and the mirror image of the two above: offered only
                      on rows the viewer does NOT own, and only when signed in —
                      the host rejects an anonymous report, and an owner has
                      Remove. Filing does NOT hide the row; see ReportButton. */}
                  {!isOwn && viewerId != null && (
                    <ReportButton
                      noun="matchup"
                      onReport={() => onReport(combo.key)}
                      data-testid="matchup-report"
                    />
                  )}
                  <VoteButton
                    count={combo.count}
                    voted={votedKeys.has(combo.key)}
                    disabled={viewerId == null}
                    onVote={() => onVote(combo.key)}
                    onUnvote={() => onUnvote(combo.key)}
                    onRequireAuth={onRequireAuth}
                    data-testid="matchup-vote"
                  />
                </Group>
              </Group>
            </Card>
          );
        })}
      </Stack>
    </Stack>
  );
}
