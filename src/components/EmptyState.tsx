// A consistent empty-state panel: a dashed, token-bordered card with a title,
// a muted explanatory line, and an optional primary action. Used wherever a list
// is empty so "nothing here" always comes with a clear next step. Styled entirely
// off `--civitai-*` tokens (via ../theme) so it flips with `[data-theme]`.

import type { ReactNode } from 'react';

import { Stack } from '@civitai/blocks-react/ui';
import { token, radius, metaText } from '../theme.js';

export interface EmptyStateProps {
  title: string;
  body?: string;
  action?: ReactNode;
  'data-testid'?: string;
}

export function EmptyState({
  title,
  body,
  action,
  'data-testid': testId,
}: EmptyStateProps): React.JSX.Element {
  return (
    <Stack
      align="center"
      gap={8}
      data-testid={testId}
      style={{
        textAlign: 'center',
        padding: '32px 24px',
        borderRadius: radius.md,
        border: `1px dashed ${token.border}`,
        background: token.surface,
      }}
    >
      <strong style={{ fontSize: 15, color: token.text }}>{title}</strong>
      {body && <span style={{ ...metaText, maxWidth: 380 }}>{body}</span>}
      {action && <div style={{ marginTop: 4 }}>{action}</div>}
    </Stack>
  );
}
