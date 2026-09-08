// Browse + vote on multi-ecosystem PROMPTS, split into MY and COMMUNITY sub-tabs
// (spec §11.1). The top-N by votes are badged "Included" (they form the grid's
// columns). Each card shows which ecosystems the prompt covers.
//
// 🔴 THE PARTITION IS THE SAME ONE THE MATCHUPS VIEW USES, and deliberately so
// (§11.1): MY = own rows (minus archived) + this viewer's unpublished prompts;
// COMMUNITY = every published row INCLUDING the viewer's own. A prompt the viewer
// authored appears in both.

import { Alert, Badge, Button, Card, Group, Loader, Stack } from '@civitai/blocks-react/ui';
import { Tooltip } from '@civitai/components-react';

import { useState, type ReactNode } from 'react';

import type { PromptRow, UnpublishedPrompt } from '../types.js';
import { includedSummary, isOwnRow } from '../lib/benchmark.js';
import { ARCHIVE_NOTE } from '../lib/archive.js';
import { ecosystemMeta } from '../lib/ecosystem.js';
import { mutedText, metaText } from '../theme.js';
import { EmptyState } from './EmptyState.js';
import { VoteButton } from './VoteButton.js';
import { ReportButton } from '@civitai/blocks-react/ui';
import { WithdrawButton } from './WithdrawButton.js';
import { SubTabs, MyTabSignedOut, type SubTab } from './SubTabs.js';
import { UnpublishedList } from './UnpublishedList.js';

/** The "Included" badge's tooltip — the column-side mirror of
 * `INCLUDED_ROW_TOOLTIP`. Exported for the same reason: it is a claim, it has
 * been wrong once (it named the `Slider` 527 deletes), and a test pins it whole. */
export const INCLUDED_COLUMN_TOOLTIP =
  'Included: currently in the top by votes, so it forms a column of the ' +
  'system-owned Top Grid — ranked over the entries this app has loaded. To pick ' +
  'your own columns, build a grid in the Grids tab.';

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

  // ---- the PRIVATE half (per-viewer storage), all optional so the view can be
  // rendered standalone in a test that only cares about the public list ----
  /** This viewer's UNPUBLISHED prompts (pointers at published rows excluded). */
  unpublished?: UnpublishedPrompt[];
  /** The host-reported private-storage line, or null while unread/anonymous. */
  quotaLine?: string | null;
  /** Shared keys this viewer archived — hidden from MY only (§11.3). */
  archivedKeys?: Set<string>;
  onNewUnpublished?: () => void;
  onEditUnpublished?: (localId: string) => void;
  onDiscardUnpublished?: (localId: string) => Promise<void> | void;
  onPublishUnpublished?: (localId: string) => Promise<void> | void;
  onArchive?: (key: string) => Promise<void> | void;
  onUnarchive?: (key: string) => Promise<void> | void;
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
  unpublished = [],
  quotaLine = null,
  archivedKeys,
  onNewUnpublished,
  onEditUnpublished,
  onDiscardUnpublished,
  onPublishUnpublished,
  onArchive,
  onUnarchive,
}: PromptsViewProps): React.JSX.Element {
  const [tab, setTab] = useState<SubTab>('community');
  const [showArchived, setShowArchived] = useState(false);

  const archived = archivedKeys ?? new Set<string>();
  const signedIn = viewerId != null;
  const own = prompts.filter((p) => isOwnRow(p, viewerId));
  const myPublished = own.filter((p) => !archived.has(p.key));
  const myArchived = own.filter((p) => archived.has(p.key));
  const myCount = myPublished.length + unpublished.length;

  const card = (prompt: PromptRow, extraActions?: ReactNode): React.JSX.Element => {
    const overrideEcos = Object.keys(prompt.data.overrides ?? {});
    const isOwn = isOwnRow(prompt, viewerId);
    return (
      <Card key={prompt.key} withBorder padding="md" data-testid="prompt-card" data-key={prompt.key}>
        <Group justify="space-between" align="flex-start">
          <Stack gap={4}>
            <Group gap={8}>
              <strong>{prompt.name || `#${prompt.key}`}</strong>
              {includedKeys.has(prompt.key) && (
                <Tooltip label={INCLUDED_COLUMN_TOOLTIP}>
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
            {extraActions}
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
  };

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

      <SubTabs value={tab} onChange={setTab} myCount={myCount} communityCount={prompts.length} />

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

      {tab === 'my' && !signedIn && <MyTabSignedOut noun="prompt" onRequireAuth={onRequireAuth} />}

      {tab === 'my' && signedIn && (
        <Stack gap={14} data-testid="my-panel">
          <UnpublishedList
            items={unpublished.map((rec) => {
              const overrides = Object.keys(rec.overrides ?? {}).length;
              return {
                localId: rec.localId,
                name: rec.name,
                meta:
                  overrides === 0
                    ? 'default only'
                    : `default + ${overrides} override${overrides === 1 ? '' : 's'}`,
                description: rec.description,
              };
            })}
            noun="prompt"
            quotaLine={quotaLine}
            onNew={() => onNewUnpublished?.()}
            onEdit={(localId) => onEditUnpublished?.(localId)}
            onDiscard={(localId) => onDiscardUnpublished?.(localId)}
            onPublish={(localId) => onPublishUnpublished?.(localId)}
          />

          <Stack gap={10}>
            <strong style={{ fontSize: 14 }}>Published by you</strong>
            {!loading && myPublished.length === 0 ? (
              <span style={mutedText} data-testid="my-published-empty">
                You have no published prompts on the board right now.
              </span>
            ) : (
              <Stack gap={10} data-testid="prompts-list">
                {myPublished.map((prompt) =>
                  card(
                    prompt,
                    onArchive && (
                      <Button
                        size="sm"
                        variant="subtle"
                        onClick={() => onArchive(prompt.key)}
                        data-testid="archive-action"
                        aria-label="Archive: hide from your My list only"
                      >
                        Archive
                      </Button>
                    ),
                  ),
                )}
              </Stack>
            )}
            {/* 🔴 THE HONEST WORDING — see MatchupsView for why it is rendered
                next to the control rather than behind a tooltip. */}
            {myPublished.length > 0 && (
              <span style={metaText} data-testid="archive-note">
                {ARCHIVE_NOTE}
              </span>
            )}
          </Stack>

          {myArchived.length > 0 && (
            <Stack gap={10}>
              <Group gap={8} align="center">
                <Button
                  size="sm"
                  variant="subtle"
                  onClick={() => setShowArchived((v) => !v)}
                  data-testid="archived-toggle"
                >
                  {showArchived ? 'Hide archived' : `Show archived (${myArchived.length})`}
                </Button>
                <span style={metaText}>Still on the shared board, still in Community.</span>
              </Group>
              {showArchived && (
                <Stack gap={10} data-testid="archived-list">
                  {myArchived.map((prompt) =>
                    card(
                      prompt,
                      onUnarchive && (
                        <Button
                          size="sm"
                          variant="subtle"
                          onClick={() => onUnarchive(prompt.key)}
                          data-testid="unarchive-action"
                        >
                          Unarchive
                        </Button>
                      ),
                    ),
                  )}
                </Stack>
              )}
            </Stack>
          )}
        </Stack>
      )}

      {tab === 'community' && (
        <>
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
            {prompts.map((prompt) => card(prompt))}
          </Stack>
        </>
      )}
    </Stack>
  );
}
