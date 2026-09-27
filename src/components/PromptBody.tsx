// The PROMPT row body — the column-side mirror of `MatchupBody`, rendered in the
// `prompt-card` of the Prompts section list AND in the PROMPT DETAIL MODAL a
// viewer reaches by clicking a grid COLUMN header.
//
// 🔴 Same ownership rule, same reason it is shared rather than copied: the modal
// is reached by every viewer, most of whom do not own the prompt.
//
// 🔴 THE DETAIL VIEW SHOWS THE PROMPT TEXT, and the card deliberately does not.
// A prompt's text is the thing a viewer actually wants when they click a column
// header ("what was this column asking for?"), and it is multi-line — which is
// exactly why it does not belong in a list row.

import type { ReactNode } from 'react';

import { Badge, Button, Group, Stack } from '@civitai/blocks-react/ui';
import { ReportButton } from '@civitai/blocks-react/ui';
import { Tooltip } from '@civitai/components-react';

import type { PromptRow } from '../types.js';
import { isOwnRow } from '../lib/benchmark.js';
import { ecosystemMeta } from '../lib/ecosystem.js';
import { metaText, mutedText, radius, token } from '../theme.js';
import { VoteButton } from './VoteButton.js';
import { WithdrawButton } from './WithdrawButton.js';

/** The "Included" badge's tooltip — the column-side mirror of
 * `INCLUDED_ROW_TOOLTIP`. Exported for the same reason: it is a claim, it has been
 * wrong twice (it named the deleted `Slider`, then the deleted Grids *tab*), and a
 * test pins it whole. */
export const INCLUDED_COLUMN_TOOLTIP =
  'Included: currently in the top by votes, so it forms a column of the ' +
  'system-owned Top Grid — ranked over the entries this app has loaded. To pick ' +
  'your own columns, build a grid in the Grids section on this page.';

export interface PromptBodyProps {
  prompt: PromptRow;
  included: boolean;
  voted: boolean;
  viewerId: number | null;
  /** Render the prompt TEXT and its per-ecosystem overrides (the detail modal). */
  detail?: boolean;
  onVote: (key: string) => Promise<number> | void;
  onUnvote: (key: string) => Promise<number> | void;
  onRequireAuth: () => void;
  onEdit?: (prompt: PromptRow) => void;
  onWithdraw?: (key: string) => Promise<void> | void;
  onReport: (key: string) => Promise<void>;
  extraActions?: ReactNode;
}

const preStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  lineHeight: 1.45,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  background: token.surface2,
  border: `1px solid ${token.border}`,
  borderRadius: radius.sm,
  padding: '6px 8px',
  color: token.text,
};

export function PromptBody({
  prompt,
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
}: PromptBodyProps): React.JSX.Element {
  const overrideEcos = Object.keys(prompt.data.overrides ?? {});
  const isOwn = isOwnRow(prompt, viewerId);

  return (
    <Group justify="space-between" align="flex-start">
      <Stack gap={4} style={{ minWidth: 0 }}>
        <Group gap={8}>
          <strong>{prompt.name || `#${prompt.key}`}</strong>
          {included && (
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
        {detail && (
          <Stack gap={6} data-testid="prompt-detail-text" style={{ marginTop: 4, minWidth: 0 }}>
            <span style={metaText}>Default (every ecosystem)</span>
            <pre style={preStyle}>{prompt.data.default.prompt}</pre>
            {overrideEcos.map((eco) => {
              const ov = prompt.data.overrides?.[eco];
              return (
                <Stack key={eco} gap={4} data-testid="prompt-detail-override">
                  <span style={metaText}>{ecosystemMeta(eco).label} override</span>
                  {ov?.prompt ? (
                    <pre style={preStyle}>{ov.prompt}</pre>
                  ) : (
                    <span style={metaText}>Parameters only — the default prompt text is reused.</span>
                  )}
                </Stack>
              );
            })}
          </Stack>
        )}
      </Stack>
      <Group gap={6} align="center">
        {/* Author-scoped affordances — see isOwnRow (the one ownership guard). */}
        {isOwn && onEdit && (
          <Button size="sm" variant="subtle" onClick={() => onEdit(prompt)} data-testid="prompt-edit">
            Edit
          </Button>
        )}
        {extraActions}
        {isOwn && onWithdraw && (
          <WithdrawButton
            noun="prompt"
            onWithdraw={() => onWithdraw(prompt.key)}
            data-testid="prompt-withdraw"
          />
        )}
        {!isOwn && viewerId != null && (
          <ReportButton
            noun="prompt"
            onReport={() => onReport(prompt.key)}
            data-testid="prompt-report"
          />
        )}
        <VoteButton
          count={prompt.count}
          voted={voted}
          disabled={viewerId == null}
          onVote={() => onVote(prompt.key)}
          onUnvote={() => onUnvote(prompt.key)}
          onRequireAuth={onRequireAuth}
          data-testid="prompt-vote"
        />
      </Group>
    </Group>
  );
}
