// Browse + vote on COMBINATIONS. The top-N by votes are badged "Included" (they
// form the grid's rows). The submit affordance opens the combination form.

import { Alert, Badge, Button, Card, Group, Loader, Stack } from '@civitai/blocks-react/ui';

import { Fragment } from 'react';

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
                      <Badge color="success" variant="light" data-testid="combo-included">
                        Included
                      </Badge>
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
                  {combo.description && <span style={{ opacity: 0.7, fontSize: 13 }}>{combo.description}</span>}
                  <span style={{ opacity: 0.6, fontSize: 12 }} data-testid="combo-config-summary">
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
