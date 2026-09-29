// "Published by you", plus ARCHIVE — the author-side hide (spec §11.3) — for ONE
// object kind, in ONE implementation.
//
// 🔴 WHY THIS FILE EXISTS: THE PREDICATE WAS OPEN-CODED THREE TIMES. `MatchupsView`
// and `PromptsView` each carried a near-identical copy of this block, and the grids
// surface is now a third caller. A predicate duplicated across call sites
// regenerates the same bug at every site — and this particular one HAS already gone
// wrong in exactly that way: the grids list filter tested `archived.has(key)` alone
// while its own `myArchived` tested `isOwnRow(...) && archived.has(key)`, so a key in
// `archived` that the viewer did NOT own was hidden from the list AND absent from the
// archived list, leaving no recovery path at all. Consolidating is what makes such a
// disagreement impossible rather than merely fixed.
//
// 🔴 ONE PREDICATE, STATED ONCE: a row belongs to the archived half iff
// `archivedKeys.has(keyOf(row))`. The caller has already narrowed `rows` to the
// viewer's OWN rows, so ownership is not re-tested here — which is the other half of
// "one place": two components each applying half of a two-part predicate is how the
// two came apart last time.
//
// 🔴 ARCHIVE IS NOT A SUPPRESSION, and the copy is part of the feature rather than
// decoration. The row stays appended, keeps its votes, and stays visible to every
// other viewer — this app HAS no power to do otherwise (`update`/`withdraw` are
// author-scoped, `report()` does not hide). {@link ARCHIVE_NOTE} says so in words,
// next to the control, and `lib/archive.ts` is where that sentence lives so a test
// can pin the WHOLE string rather than a keyword.
//
// 🔴 WHAT THIS COMPONENT DOES NOT DO: render a card. Each caller passes its own
// `renderCard`, because a matchup card, a prompt card and a grid card are genuinely
// different bodies and moving them here would put three object kinds' presentation in
// one file to save a `<Stack>`. What is shared is the PARTITION, which is the part
// that had the bug.

import { useState, type ReactNode } from 'react';

import { Button, Group, Stack } from '@civitai/blocks-react/ui';

import { ARCHIVE_NOTE } from '../lib/archive.js';
import { metaText, mutedText } from '../theme.js';

/** The object kind this panel is listing — the noun in its copy. */
export type MyNoun = 'grid' | 'matchup' | 'prompt';

export interface MyPublishedProps<Row> {
  noun: MyNoun;
  /**
   * The viewer's OWN published rows — already narrowed by the caller.
   *
   * 🔴 THE NARROWING IS THE CALLER'S, DELIBERATELY. This panel is only ever rendered
   * on the viewer's own surface, so "which rows are mine" is decided by the same
   * `isOwnRow` predicate that gates the Edit/Withdraw affordances on the cards — one
   * decision, not two that can disagree about the same row.
   */
  rows: Row[];
  keyOf: (row: Row) => string;
  /** Shared keys this viewer archived (§11.3). */
  archivedKeys: Set<string>;
  loading: boolean;
  onArchive?: (key: string) => Promise<void> | void;
  onUnarchive?: (key: string) => Promise<void> | void;
  /** Render one row's card, with whatever extra action this panel supplies. */
  renderCard: (row: Row, extraActions: ReactNode) => ReactNode;
}

export function MyPublished<Row>({
  noun,
  rows,
  keyOf,
  archivedKeys,
  loading,
  onArchive,
  onUnarchive,
  renderCard,
}: MyPublishedProps<Row>): React.JSX.Element {
  const [showArchived, setShowArchived] = useState(false);

  const isArchived = (row: Row): boolean => archivedKeys.has(keyOf(row));
  const published = rows.filter((r) => !isArchived(r));
  const archived = rows.filter(isArchived);

  return (
    <Stack gap={14}>
      <Stack gap={10}>
        <strong style={{ fontSize: 14 }}>Published by you</strong>
        {!loading && published.length === 0 ? (
          <span style={mutedText} data-testid="my-published-empty">
            You have no published {noun}s on the board right now.
          </span>
        ) : (
          <Stack gap={10} data-testid={`my-published-${noun}`}>
            {published.map((row) =>
              renderCard(
                row,
                onArchive ? (
                  <Button
                    size="sm"
                    variant="subtle"
                    onClick={() => onArchive(keyOf(row))}
                    data-testid="archive-action"
                    aria-label="Archive: hide from your own list only"
                  >
                    Archive
                  </Button>
                ) : undefined,
              ),
            )}
          </Stack>
        )}
        {/* 🔴 THE HONEST WORDING, rendered NEXT TO the control rather than behind a
            tooltip. A viewer who reads "Archive" as "removed" has been told something
            the code cannot back (§2.2 + §9 Q2). */}
        {published.length > 0 && (
          <span style={metaText} data-testid="archive-note">
            {ARCHIVE_NOTE}
          </span>
        )}
      </Stack>

      {archived.length > 0 && (
        <Stack gap={10}>
          <Group gap={8} align="center">
            <Button
              size="sm"
              variant="subtle"
              onClick={() => setShowArchived((v) => !v)}
              data-testid="archived-toggle"
            >
              {showArchived ? 'Hide archived' : `Show archived (${archived.length})`}
            </Button>
            <span style={metaText}>Still on the shared board, still visible to everyone else.</span>
          </Group>
          {/* 🔴 THE RECOVERY PATH, and it is what makes the hide an author-side hide
              rather than a suppression. An archive with no way back is a delete with a
              gentler label. */}
          {showArchived && (
            <Stack gap={10} data-testid="archived-list">
              {archived.map((row) =>
                renderCard(
                  row,
                  onUnarchive ? (
                    <Button
                      size="sm"
                      variant="subtle"
                      onClick={() => onUnarchive(keyOf(row))}
                      data-testid="unarchive-action"
                    >
                      Unarchive
                    </Button>
                  ) : undefined,
                ),
              )}
            </Stack>
          )}
        </Stack>
      )}
    </Stack>
  );
}
