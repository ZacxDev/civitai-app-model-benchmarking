// Browse + vote on multi-ecosystem PROMPTS. The top-N by votes are badged
// "Included" (they form the grid's columns). Each card shows which ecosystems
// the prompt covers.

import { Alert, Badge, Button, Card, Group, Loader, Stack } from '@civitai/blocks-react/ui';
import { Tooltip } from '@civitai/components-react';

import type { PromptRow } from '../types.js';
import { includedSummary, isOwnRow } from '../lib/benchmark.js';
import { ecosystemMeta } from '../lib/ecosystem.js';
import { mutedText, metaText } from '../theme.js';
import { EmptyState } from './EmptyState.js';
import { VoteButton } from './VoteButton.js';
import { ReportButton } from '@civitai/blocks-react/ui';
import { WithdrawButton } from './WithdrawButton.js';

export interface PromptsViewProps {
  prompts: PromptRow[];
  includedKeys: Set<string>;
  votedKeys: Set<string>;
  viewerId: number | null;
  loading: boolean;
  error: string | null;
  onSubmitNew: () => void;
  onVote: (key: string) => Promise<number> | void;
  onUnvote: (key: string) => Promise<number> | void;
  onRequireAuth: () => void;
  /** Edit one of the viewer's OWN prompts (in-place). */
  onEdit: (prompt: PromptRow) => void;
  /** Withdraw one of the viewer's OWN prompts from the shared grid. */
  onWithdraw: (key: string) => Promise<void> | void;
  /** Report ANOTHER viewer's row to platform moderators (escalation, not removal). */
  onReport: (key: string) => Promise<void>;
}

export function PromptsView({
  prompts,
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
}: PromptsViewProps): React.JSX.Element {
  return (
    <Stack gap={14} data-testid="prompts-view">
      <Group justify="space-between" align="center" gap={12}>
        <span style={{ ...mutedText, flex: '1 1 260px', minWidth: 0 }} data-testid="prompts-included-summary">
          Submit and vote on prompts. Each prompt has a default (all ecosystems) plus optional per-ecosystem
          overrides. {includedSummary(includedKeys.size, 'column')}
        </span>
        <Button size="sm" onClick={onSubmitNew} data-testid="submit-prompt">
          Submit prompt
        </Button>
      </Group>

      {error && (
        <Alert color="error" data-testid="prompts-error">
          {error}
        </Alert>
      )}

      {loading && (
        <Stack align="center" gap={10} style={{ padding: '28px 0' }}>
          <Loader data-testid="prompts-loading" />
          <span style={metaText}>Loading prompts…</span>
        </Stack>
      )}

      {!loading && prompts.length === 0 && (
        <EmptyState
          data-testid="prompts-empty"
          title="No prompts yet"
          body="Be the first to submit a prompt. Add optional per-ecosystem overrides so every model family gets a fair test."
          action={
            <Button size="sm" onClick={onSubmitNew}>
              Submit prompt
            </Button>
          }
        />
      )}

      <Stack gap={10} data-testid="prompts-list">
        {prompts.map((prompt) => {
          const overrideEcos = Object.keys(prompt.data.overrides ?? {});
          const isOwn = isOwnRow(prompt, viewerId);
          return (
            <Card key={prompt.key} withBorder padding="md" data-testid="prompt-card" data-key={prompt.key}>
              <Group justify="space-between" align="flex-start">
                <Stack gap={4}>
                  <Group gap={8}>
                    <strong>{prompt.name || `#${prompt.key}`}</strong>
                    {includedKeys.has(prompt.key) && (
                      <Tooltip label="Included: currently in your top-N by votes, so it forms a column of the grid you see. Change how many in the Grid tab.">
                        <span tabIndex={0} style={{ display: 'inline-flex', borderRadius: 999, cursor: 'help' }}>
                          <Badge color="success" variant="light" data-testid="prompt-included">
                            Included
                          </Badge>
                        </span>
                      </Tooltip>
                    )}
                  </Group>
                  {prompt.description && <span style={mutedText}>{prompt.description}</span>}
                  <Group gap={4} wrap>
                    <Badge color="success" variant="light" size="sm" data-testid="prompt-default-badge">
                      Default
                    </Badge>
                    {overrideEcos.map((eco) => (
                      <Badge key={eco} variant="light" size="sm" data-testid="prompt-override-badge">
                        {ecosystemMeta(eco).label}
                      </Badge>
                    ))}
                  </Group>
                </Stack>
                <Group gap={6} align="center">
                  {/* Author-scoped affordances — see isOwnRow (the one ownership guard). */}
                  {isOwn && (
                    <Button size="sm" variant="subtle" onClick={() => onEdit(prompt)} data-testid="prompt-edit">
                      Edit
                    </Button>
                  )}
                  {isOwn && (
                    <WithdrawButton
                      noun="prompt"
                      onWithdraw={() => onWithdraw(prompt.key)}
                      data-testid="prompt-withdraw"
                    />
                  )}
                  {/* Escalation, and the mirror image of the two above: offered only
                      on rows the viewer does NOT own, and only when signed in —
                      the host rejects an anonymous report, and an owner has
                      Remove. Filing does NOT hide the row; see ReportButton. */}
                  {!isOwn && viewerId != null && (
                    <ReportButton
                      noun="prompt"
                      onReport={() => onReport(prompt.key)}
                      data-testid="prompt-report"
                    />
                  )}
                  <VoteButton
                    count={prompt.count}
                    voted={votedKeys.has(prompt.key)}
                    disabled={viewerId == null}
                    onVote={() => onVote(prompt.key)}
                    onUnvote={() => onUnvote(prompt.key)}
                    onRequireAuth={onRequireAuth}
                    data-testid="prompt-vote"
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
