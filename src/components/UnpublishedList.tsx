// The PRIVATE half of the create → publish boundary, for BOTH publishable
// objects: this viewer's unpublished matchups or prompts, read from and written
// to the per-viewer KV (`appStorage`, prefixes `draft:v1:` / `unpub:prompt:v1:`).
//
// 🔴 NOTHING IN THIS COMPONENT WRITES TO ANY STORE. It renders records and raises
// intent; the one callback that crosses into the public board is `onPublish`, and
// it is wired to a single explicit button per record. That separation is the
// acceptance criterion this surface exists for — an unpublished record is
// invisible to every other viewer precisely because it never reaches
// `shared.append`, not because of any flag on it.
//
// 🔴 IT IS ONE COMPONENT, NOT TWO. Matchups and prompts differ only in the noun
// and in the one-line structural summary each record contributes; duplicating the
// card, the publish-in-flight guard and the privacy copy per object is how the
// two drift apart, and the copy is the half that must not.

import { useState } from 'react';
import { Badge, Button, Card, Group, Stack } from '@civitai/blocks-react/ui';

import { metaText, mutedText } from '../theme.js';

/** One unpublished record, flattened to what this list renders. */
export interface UnpublishedItem {
  /** App-chosen, per-viewer id — NOT a shared key. */
  localId: string;
  name: string;
  /** A short STRUCTURAL summary (e.g. "2 configs", "3 ecosystems"). */
  meta: string;
  description?: string;
}

export interface UnpublishedListProps {
  items: UnpublishedItem[];
  /** What the object is, for the accessible names and the empty-state copy. */
  noun: 'matchup' | 'prompt' | 'grid';
  /** The host-reported private-storage line, or null while unread/anonymous. */
  quotaLine?: string | null;
  onNew: () => void;
  onEdit: (localId: string) => void;
  onDiscard: (localId: string) => Promise<void> | void;
  /** 🔴 The ONE callback that reaches the public board. */
  onPublish: (localId: string) => Promise<void> | void;
}

export function UnpublishedList({
  items,
  noun,
  quotaLine,
  onNew,
  onEdit,
  onDiscard,
  onPublish,
}: UnpublishedListProps): React.JSX.Element {
  // Which record is mid-publish — the button that could mint a public row is
  // disabled while its own call is in flight, so a double-tap can't append twice.
  const [publishing, setPublishing] = useState<string | null>(null);

  const publish = async (localId: string) => {
    if (publishing) return;
    setPublishing(localId);
    try {
      await onPublish(localId);
    } finally {
      setPublishing(null);
    }
  };

  return (
    <Stack gap={10} data-testid="unpublished-panel">
      <Group justify="space-between" align="center" gap={12}>
        <Stack gap={2} style={{ flex: '1 1 260px', minWidth: 0 }}>
          <strong style={{ fontSize: 14 }}>Not published yet</strong>
          <span style={metaText}>
            Saved to your own storage and invisible to everyone else until you publish. Publishing is
            a separate step; a published {noun} can be edited or removed, but not made private again.
          </span>
          {quotaLine && (
            <span style={metaText} data-testid="storage-quota">
              {quotaLine}
            </span>
          )}
        </Stack>
        <Button size="sm" variant="light" onClick={onNew} data-testid="new-unpublished">
          New {noun}
        </Button>
      </Group>

      {items.length === 0 ? (
        <span style={mutedText} data-testid="unpublished-empty">
          Nothing unpublished. Start a {noun} and publish it when it's ready.
        </span>
      ) : (
        <Stack gap={8} data-testid="unpublished-list">
          {items.map((item) => (
            <Card
              key={item.localId}
              withBorder
              padding="sm"
              data-testid="unpublished-card"
              data-local-id={item.localId}
            >
              <Group justify="space-between" align="center" gap={10}>
                <Stack gap={2} style={{ minWidth: 0 }}>
                  <Group gap={8} align="center">
                    <strong data-testid="unpublished-name">{item.name || `Untitled ${noun}`}</strong>
                    <Badge variant="light" data-testid="unpublished-meta">
                      {item.meta}
                    </Badge>
                  </Group>
                  {item.description && <span style={mutedText}>{item.description}</span>}
                </Stack>
                <Group gap={6} align="center" wrap={false}>
                  <Button
                    size="sm"
                    variant="subtle"
                    onClick={() => onEdit(item.localId)}
                    data-testid="unpublished-edit"
                    aria-label={`Edit your unpublished ${noun}`}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="subtle"
                    color="error"
                    onClick={() => onDiscard(item.localId)}
                    data-testid="unpublished-discard"
                    aria-label={`Discard your unpublished ${noun}`}
                  >
                    Discard
                  </Button>
                  <Button
                    size="sm"
                    loading={publishing === item.localId}
                    disabled={publishing !== null}
                    onClick={() => publish(item.localId)}
                    data-testid="unpublished-publish"
                    aria-label={`Publish your ${noun} to the shared board`}
                  >
                    Publish
                  </Button>
                </Group>
              </Group>
            </Card>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
