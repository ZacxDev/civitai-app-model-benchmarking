// The PRIVATE half of the create → submit boundary: this viewer's drafts, read
// from and written to the per-viewer KV (`appStorage`, prefix `draft:v1:`).
//
// 🔴 NOTHING IN THIS COMPONENT WRITES TO SHARED STORAGE. It renders drafts and
// raises intent; the one callback that crosses into the public board is
// `onSubmitDraft`, and it is wired to a single explicit button per draft. That
// separation is the acceptance criterion this card exists for — a draft is
// invisible to every other viewer precisely because it never reaches
// `shared.append`, not because of any flag on it.
//
// Two kinds of row render here:
//  - an UNSUBMITTED draft: editable, deletable, submittable.
//  - a SUBMITTED pointer: not editable here. Its Edit routes to the shared row's
//    own editor (`shared.update`), which preserves the key AND the vote total.
//    There is no un-submit — see docs/matchups.md §9 Q2 (decided 2026-08-30).

import { useState } from 'react';
import { Badge, Button, Card, Group, Stack } from '@civitai/blocks-react/ui';

import type { DraftRecord, DraftUnsubmitted } from '../types.js';
import { isSubmitted } from '../lib/drafts.js';
import { metaText, mutedText } from '../theme.js';

export interface DraftsPanelProps {
  drafts: DraftRecord[];
  /** The host-reported private-storage line, or null while unread/anonymous. */
  quotaLine: string | null;
  /** Shared keys currently loaded, so a pointer only offers Edit when its row is there. */
  loadedSharedKeys: Set<string>;
  /** Anonymous viewers have no per-viewer store at all (host rejects the write). */
  canDraft: boolean;
  onNewDraft: () => void;
  onEditDraft: (draft: DraftUnsubmitted) => void;
  onSubmitDraft: (draft: DraftUnsubmitted) => Promise<void> | void;
  onDeleteDraft: (localId: string) => Promise<void> | void;
  /** Edit the PUBLIC row a submitted pointer refers to (via shared.update). */
  onEditSubmitted: (sharedKey: string) => void;
}

export function DraftsPanel({
  drafts,
  quotaLine,
  loadedSharedKeys,
  canDraft,
  onNewDraft,
  onEditDraft,
  onSubmitDraft,
  onDeleteDraft,
  onEditSubmitted,
}: DraftsPanelProps): React.JSX.Element | null {
  // Which draft is mid-submit — the button that could mint a public row is
  // disabled while its own call is in flight, so a double-tap can't append twice.
  const [submitting, setSubmitting] = useState<string | null>(null);

  if (!canDraft) return null;

  const submit = async (draft: DraftUnsubmitted) => {
    if (submitting) return;
    setSubmitting(draft.localId);
    try {
      await onSubmitDraft(draft);
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <Stack gap={10} data-testid="drafts-panel">
      <Group justify="space-between" align="center" gap={12}>
        <Stack gap={2} style={{ flex: '1 1 260px', minWidth: 0 }}>
          <strong style={{ fontSize: 14 }}>Your drafts</strong>
          <span style={metaText}>
            Drafts are saved to your own storage and stay invisible to everyone else until you submit
            them. Submitting is a separate step.
          </span>
          {quotaLine && (
            <span style={metaText} data-testid="drafts-quota">
              {quotaLine}
            </span>
          )}
        </Stack>
        <Button size="sm" variant="light" onClick={onNewDraft} data-testid="new-draft">
          New draft
        </Button>
      </Group>

      {drafts.length === 0 ? (
        <span style={mutedText} data-testid="drafts-empty">
          No drafts yet. Start one and submit it when it's ready.
        </span>
      ) : (
        <Stack gap={8} data-testid="drafts-list">
          {drafts.map((draft) =>
            isSubmitted(draft) ? (
              <Card
                key={draft.localId}
                withBorder
                padding="sm"
                data-testid="draft-card"
                data-local-id={draft.localId}
                data-shared-key={draft.sharedKey}
              >
                <Group justify="space-between" align="center" gap={10}>
                  <Group gap={8} align="center">
                    <Badge color="success" variant="light" data-testid="draft-submitted">
                      Submitted
                    </Badge>
                    <span style={metaText}>
                      Live on the board. Edits keep its votes.
                    </span>
                  </Group>
                  {loadedSharedKeys.has(draft.sharedKey) && (
                    <Button
                      size="sm"
                      variant="subtle"
                      onClick={() => onEditSubmitted(draft.sharedKey)}
                      data-testid="draft-edit-submitted"
                    >
                      Edit the live one
                    </Button>
                  )}
                </Group>
              </Card>
            ) : (
              <Card
                key={draft.localId}
                withBorder
                padding="sm"
                data-testid="draft-card"
                data-local-id={draft.localId}
              >
                <Group justify="space-between" align="center" gap={10}>
                  <Stack gap={2} style={{ minWidth: 0 }}>
                    <Group gap={8} align="center">
                      <strong data-testid="draft-name">{draft.name || 'Untitled draft'}</strong>
                      <Badge variant="light" data-testid="draft-config-count">
                        {draft.configs.length} config{draft.configs.length === 1 ? '' : 's'}
                      </Badge>
                    </Group>
                    {draft.description && <span style={mutedText}>{draft.description}</span>}
                  </Stack>
                  <Group gap={6} align="center" wrap={false}>
                    <Button
                      size="sm"
                      variant="subtle"
                      onClick={() => onEditDraft(draft)}
                      data-testid="draft-edit"
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="subtle"
                      color="error"
                      onClick={() => onDeleteDraft(draft.localId)}
                      data-testid="draft-delete"
                    >
                      Discard
                    </Button>
                    <Button
                      size="sm"
                      loading={submitting === draft.localId}
                      disabled={submitting !== null}
                      onClick={() => submit(draft)}
                      data-testid="draft-submit"
                    >
                      Submit
                    </Button>
                  </Group>
                </Group>
              </Card>
            ),
          )}
        </Stack>
      )}
    </Stack>
  );
}
