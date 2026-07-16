// Browse + vote on COMBINATIONS. The top-N by votes are badged "Included" (they
// form the grid's rows). The submit affordance opens the combination form.

import { Alert, Badge, Button, Card, Group, Loader, Stack } from '@civitai/blocks-react/ui';

import type { CombinationRow } from '../types.js';
import { ecosystemForBaseModel, ecosystemMeta } from '../lib/ecosystem.js';
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
}: CombosViewProps): React.JSX.Element {
  return (
    <Stack gap={14} data-testid="combos-view">
      <Group justify="space-between">
        <span style={{ opacity: 0.7, fontSize: 13 }}>
          Submit and vote on checkpoint + LoRA combinations. The top {includedKeys.size || 'N'} are included as
          the grid's rows.
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

      {loading && <Loader data-testid="combos-loading" />}

      {!loading && combinations.length === 0 && (
        <span style={{ opacity: 0.6 }} data-testid="combos-empty">
          No combinations yet — be the first to submit one.
        </span>
      )}

      <Stack gap={10} data-testid="combos-list">
        {combinations.map((combo) => {
          const eco = ecosystemForBaseModel(combo.data.checkpoint.baseModel);
          return (
            <Card key={combo.key} withBorder padding="md" data-testid="combo-card" data-key={combo.key}>
              <Group justify="space-between" align="flex-start">
                <Stack gap={4}>
                  <Group gap={8}>
                    <strong>{combo.name || `#${combo.key}`}</strong>
                    {includedKeys.has(combo.key) && (
                      <Badge color="success" variant="light" data-testid="combo-included">
                        Included
                      </Badge>
                    )}
                    <Badge variant="light">{ecosystemMeta(eco).label}</Badge>
                  </Group>
                  {combo.description && <span style={{ opacity: 0.7, fontSize: 13 }}>{combo.description}</span>}
                  <span style={{ opacity: 0.6, fontSize: 12 }}>
                    {combo.data.checkpoint.modelName ?? `Checkpoint #${combo.data.checkpoint.versionId}`}
                    {combo.data.loras.length > 0 && ` · ${combo.data.loras.length} LoRA`}
                  </span>
                </Stack>
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
            </Card>
          );
        })}
      </Stack>
    </Stack>
  );
}
