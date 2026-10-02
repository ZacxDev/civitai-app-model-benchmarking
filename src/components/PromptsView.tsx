// PROMPTS — the community board, and the viewer's own surface, as TWO SURFACES of
// one component selected by `surface`. Each card shows which ecosystems it covers.
//
// 🔴 THE MY/COMMUNITY SUB-TABS ARE GONE, for exactly the reasons `MatchupsView`'s
// header gives — "My" is a sidebar destination (My Benchmarks ▸ Prompts) and this
// board is community-only. The §11.1 partition itself is unchanged, and the
// own/archived split is `MyList`, one implementation shared with the matchup and
// grid surfaces rather than the near-identical copy this file used to carry.

import { Alert, Button, Card, Group, Loader, Stack } from '@civitai/blocks-react/ui';

import type { ReactNode } from 'react';

import type { PromptRow, UnpublishedPrompt } from '../types.js';
import { includedSummary, isOwnRow } from '../lib/benchmark.js';
import { mutedText, metaText } from '../theme.js';
import { EmptyState } from './EmptyState.js';
import { MyList } from './MyList.js';
import { MyTabSignedOut } from './MySignedOut.js';
import { PromptBody } from './PromptBody.js';

/* 🔴 `INCLUDED_COLUMN_TOOLTIP` WAS RE-EXPORTED HERE AND IS NOW DELETED with the
   `prompt-included` badge — the mirror of the matchup side. See `PromptBody`'s
   header; `prompts-included-summary` below is a different claim and is untouched. */

/** Which surface of this view to render. See `MatchupsView.surface`. */
export type PromptSurface = 'community' | 'my';

export interface PromptsViewProps {
  surface: PromptSurface;
  prompts: PromptRow[];
  /**
   * How many columns are "included" — i.e. are members of the Top Grid.
   *
   * 🔴 A NUMBER, NOT A `Set<string>` — see `MatchupsView`'s prop of the same name for
   * the record: the per-row Included badges are gone, so `.size` was the only reader
   * left and the Set was a second representation of `includedPrompts.length`.
   */
  includedCount: number;
  votedKeys: Set<string>;
  /**
   * Shared keys this viewer has already REPORTED — see `MatchupsView`'s prop of the
   * same name, and `App.reportedKeys` for the record itself.
   */
  reportedKeys: Set<string>;
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
  // rendered standalone in a test that only cares about the community list ----
  /** This viewer's UNPUBLISHED prompts (pointers at published rows excluded). */
  unpublished?: UnpublishedPrompt[];
  /** The host-reported private-storage line, or null while unread/anonymous. */
  quotaLine?: string | null;
  /** Shared keys this viewer archived — hidden from the MY surface only (§11.3). */
  archivedKeys?: Set<string>;
  onNewUnpublished?: () => void;
  onEditUnpublished?: (localId: string) => void;
  onDiscardUnpublished?: (localId: string) => Promise<void> | void;
  onPublishUnpublished?: (localId: string) => Promise<void> | void;
  onArchive?: (key: string) => Promise<void> | void;
  onUnarchive?: (key: string) => Promise<void> | void;
}

export function PromptsView({
  surface,
  prompts,
  includedCount,
  votedKeys,
  reportedKeys,
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
  const signedIn = viewerId != null;
  const own = prompts.filter((p) => isOwnRow(p, viewerId));

  // 🔴 Shared with the prompt DETAIL MODAL a grid COLUMN header opens — see
  // MatchupsView for why the body is one component rather than two.
  const card = (prompt: PromptRow, extraActions?: ReactNode): React.JSX.Element => (
    <Card key={prompt.key} withBorder padding="md" data-testid="prompt-card" data-key={prompt.key}>
      <PromptBody
        prompt={prompt}
        voted={votedKeys.has(prompt.key)}
        reported={reportedKeys.has(prompt.key)}
        viewerId={viewerId}
        onVote={onVote}
        onUnvote={onUnvote}
        onRequireAuth={onRequireAuth}
        onEdit={onEdit}
        onWithdraw={onWithdraw}
        onReport={onReport}
        extraActions={extraActions}
      />
    </Card>
  );

  /**
   * The MY-surface card — see `MatchupsView.myCard` for why `onEdit`/`onWithdraw` are
   * omitted: `MyList` supplies the whole action group, and passing them here would put
   * two `⋮` menus on one row, each holding half of it.
   */
  const myCard = (prompt: PromptRow, actions: ReactNode): React.JSX.Element => (
    <Card key={prompt.key} withBorder padding="md" data-testid="prompt-card" data-key={prompt.key}>
      <PromptBody
        prompt={prompt}
        voted={votedKeys.has(prompt.key)}
        reported={reportedKeys.has(prompt.key)}
        viewerId={viewerId}
        onVote={onVote}
        onUnvote={onUnvote}
        onRequireAuth={onRequireAuth}
        onReport={onReport}
        extraActions={actions}
      />
    </Card>
  );

  const status = (
    <>
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
    </>
  );

  if (surface === 'my') {
    return (
      <Stack gap={14} data-testid="prompts-view">
        {status}
        {!signedIn ? (
          <MyTabSignedOut noun="prompt" onRequireAuth={onRequireAuth} />
        ) : (
          <Stack gap={14} data-testid="my-panel">
            <MyList
              /* 🔴 KEYED ON THE VIEWER — see `MatchupsView` for the swap this closes. */
              key={viewerId}
              noun="prompt"
              drafts={unpublished.map((rec) => {
                const overrides = Object.keys(rec.overrides ?? {}).length;
                return {
                  localId: rec.localId,
                  name: rec.name,
                  /**
                   * 🔴 NO BADGE ON THE ZERO-OVERRIDE CASE, which is the common one.
                   * This read `'default only'` for every prompt without overrides —
                   * a pill asserting the default state, on nearly every row, next to
                   * the "Private" badge that IS informative. What survives is the
                   * minority state a viewer cannot assume: `default + N override(s)`.
                   * `MyDraftItem.meta` is optional for exactly this, and `undefined`
                   * UNMOUNTS the badge rather than rendering it empty.
                   */
                  meta:
                    overrides === 0
                      ? undefined
                      : `default + ${overrides} override${overrides === 1 ? '' : 's'}`,
                  description: rec.description,
                };
              })}
              rows={own}
              keyOf={(row) => row.key}
              archivedKeys={archivedKeys ?? new Set<string>()}
              loading={loading}
              quotaLine={quotaLine}
              onNew={() => onNewUnpublished?.()}
              onEditDraft={(localId) => onEditUnpublished?.(localId)}
              onDiscardDraft={(localId) => onDiscardUnpublished?.(localId)}
              onPublishDraft={(localId) => onPublishUnpublished?.(localId)}
              onEditPublished={onEdit}
              onWithdraw={onWithdraw}
              onArchive={onArchive}
              onUnarchive={onUnarchive}
              renderCard={myCard}
            />
          </Stack>
        )}
      </Stack>
    );
  }

  return (
    <Stack gap={14} data-testid="prompts-view">
      <Group justify="space-between" align="center" gap={12}>
        <span style={{ ...mutedText, flex: '1 1 260px', minWidth: 0 }} data-testid="prompts-included-summary">
          Submit and vote on prompts. Each prompt has a default (all ecosystems) plus optional per-ecosystem
          overrides. {includedSummary(includedCount, 'column')}
        </span>
        {/* 🔴 THE PUBLIC CREATE ROUTE FOR A PROMPT, and since the Contribute dropdown
            was deleted it is the primary one. */}
        <Button size="sm" onClick={onSubmitNew} data-testid="submit-prompt">
          Submit prompt
        </Button>
      </Group>

      {status}

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
    </Stack>
  );
}
