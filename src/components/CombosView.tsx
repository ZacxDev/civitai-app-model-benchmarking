// Browse + vote on COMBINATIONS. The top-N by votes are badged "Included" (they
// form the grid's rows). The submit affordance opens the combination form.

import { Alert, Badge, Button, Card, Group, Loader, Stack } from '@civitai/blocks-react/ui';
import { Tooltip } from '@civitai/components-react';

import { Fragment } from 'react';

import type { CombinationRow } from '../types.js';
import { includedSummary } from '../lib/benchmark.js';
import { ecosystemForBaseModel, ecosystemMeta } from '../lib/ecosystem.js';
import { mutedText, metaText } from '../theme.js';
import { EmptyState } from './EmptyState.js';
import { VoteButton } from './VoteButton.js';

export interface CombosViewProps {
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
}

export function CombosView({
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
}: CombosViewProps): React.JSX.Element {
  return (
    <Stack gap={14} data-testid="combos-view">
      <Group justify="space-between" align="center" gap={12}>
        <span style={{ ...mutedText, flex: '1 1 260px', minWidth: 0 }} data-testid="combos-included-summary">
          Submit and vote on checkpoint + LoRA combinations. {includedSummary(includedKeys.size, 'row')}
        </span>
        <Button size="sm" onClick={onSubmitNew} data-testid="submit-combination">
          Submit combination
        </Button>
      </Group>

      {error && (
        <Alert color="error" data-testid="combos-error">
          {error}
        </Alert>
      )}

      {loading && (
        <Stack align="center" gap={10} style={{ padding: '28px 0' }}>
          <Loader data-testid="combos-loading" />
          <span style={metaText}>Loading combinations…</span>
        </Stack>
      )}

      {!loading && combinations.length === 0 && (
        <EmptyState
          data-testid="combos-empty"
          title="No combinations yet"
          body="Be the first to submit a checkpoint + LoRA combination for the community to vote on."
          action={
            <Button size="sm" onClick={onSubmitNew}>
              Submit combination
            </Button>
          }
        />
      )}

      <Stack gap={10} data-testid="combos-list">
        {combinations.map((combo) => {
          const isOwn = viewerId != null && combo.authorUserId === viewerId;
          // Distinct ecosystems across the combo's configs (in first-seen order).
          const ecos: string[] = [];
          for (const cfg of combo.data.configs) {
            const e = ecosystemForBaseModel(cfg.checkpoint.baseModel);
            if (!ecos.includes(e)) ecos.push(e);
          }
          return (
            <Card key={combo.key} withBorder padding="md" data-testid="combo-card" data-key={combo.key}>
              <Group justify="space-between" align="flex-start">
                <Stack gap={4}>
                  <Group gap={8}>
                    <strong>{combo.name || `#${combo.key}`}</strong>
                    {includedKeys.has(combo.key) && (
                      <Tooltip label="Included: currently in your top-N by votes, so its model configs are rows of the grid you see. Change how many in the Grid tab.">
                        <span tabIndex={0} style={{ display: 'inline-flex', borderRadius: 999, cursor: 'help' }}>
                          <Badge color="success" variant="light" data-testid="combo-included">
                            Included
                          </Badge>
                        </span>
                      </Tooltip>
                    )}
                    <Badge variant="light" data-testid="combo-config-count">
                      {combo.data.configs.length} config{combo.data.configs.length === 1 ? '' : 's'}
                    </Badge>
                    {ecos.map((e) => (
                      <Badge key={e} variant="light" size="sm">
                        {ecosystemMeta(e).label}
                      </Badge>
                    ))}
                  </Group>
                  {combo.description && <span style={mutedText}>{combo.description}</span>}
                  <span style={metaText} data-testid="combo-config-summary">
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
                  {isOwn && (
                    <Button size="sm" variant="subtle" onClick={() => onEdit(combo)} data-testid="combo-edit">
                      Edit
                    </Button>
                  )}
                  <VoteButton
                    count={combo.count}
                    voted={votedKeys.has(combo.key)}
                    disabled={viewerId == null}
                    onVote={() => onVote(combo.key)}
                    onUnvote={() => onUnvote(combo.key)}
                    onRequireAuth={onRequireAuth}
                    data-testid="combo-vote"
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
