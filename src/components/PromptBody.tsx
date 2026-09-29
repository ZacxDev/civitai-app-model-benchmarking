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
//
// ── 🔴 THE THIRD IA PASS, MIRRORED FROM `MatchupBody` ────────────────────────
//
//   1. EVERY BADGE IS GONE — `prompt-included` (with its tooltip), the
//      `prompt-default-badge`, and the `prompt-override-badge` pills. The
//      operator confirmed the ECOSYSTEM badges go too, so this side and the
//      matchup side end up symmetric rather than one keeping a pill row.
//      `INCLUDED_COLUMN_TOOLTIP` had no render site left and is DELETED; the
//      `prompts-included-summary` COPY is a different thing and is untouched.
//      ⚠ What the `Default` / per-ecosystem pills used to say is NOT lost — the
//      detail view still labels the default block "Default (every ecosystem)" and
//      each override block with its ecosystem name, which is where a viewer who
//      cares about overrides is actually looking. The pills were a duplicate of
//      that, on the card, where the text they summarised was not shown at all.
//   2. EDIT / REMOVE / REPORT MOVED INTO A `⋮` MENU (`./Menu.tsx`) — the same
//      component the matchup row uses, which is the point of extracting it.
//      `extraActions` stays outside the menu; see `MatchupBody`'s header.
//
// There is no `ResourceName` here: a prompt names no model. (This read "no
// `ResourceLink`" — a component that no longer exists under that name anywhere; its
// successor is `./ResourceName.tsx`, and a stale name in a "there is no X here" note is
// how a reader concludes the note is about something already deleted.)

import type { ReactNode } from 'react';

import { Group, Stack } from '@civitai/blocks-react/ui';
import { ReportButton } from '@civitai/blocks-react/ui';

import type { PromptRow } from '../types.js';
import { isOwnRow } from '../lib/benchmark.js';
import { ecosystemMeta } from '../lib/ecosystem.js';
import { metaText, mutedText, radius, token } from '../theme.js';
import { Menu, MenuControl, MenuItem } from './Menu.js';
import { VoteButton } from './VoteButton.js';
import { WithdrawButton } from './WithdrawButton.js';

export interface PromptBodyProps {
  prompt: PromptRow;
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
  const canEdit = isOwn && onEdit !== undefined;
  const canWithdraw = isOwn && onWithdraw !== undefined;
  const canReport = !isOwn && viewerId != null;

  return (
    <Group justify="space-between" align="flex-start">
      <Stack gap={4} style={{ minWidth: 0 }}>
        <strong>{prompt.name || `#${prompt.key}`}</strong>
        {prompt.description && <span style={mutedText}>{prompt.description}</span>}
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
        {extraActions}
        {(canEdit || canWithdraw || canReport) && (
          <Menu label="Prompt actions" data-testid="prompt-menu" panelTestId="prompt-menu-items">
            {canEdit && (
              <MenuItem label="Edit" onSelect={() => onEdit!(prompt)} data-testid="prompt-edit" />
            )}
            {canWithdraw && (
              <MenuControl>
                <WithdrawButton
                  noun="prompt"
                  onWithdraw={() => onWithdraw!(prompt.key)}
                  data-testid="prompt-withdraw"
                />
              </MenuControl>
            )}
            {canReport && (
              <MenuControl>
                <ReportButton
                  noun="prompt"
                  onReport={() => onReport(prompt.key)}
                  data-testid="prompt-report"
                />
              </MenuControl>
            )}
          </Menu>
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
