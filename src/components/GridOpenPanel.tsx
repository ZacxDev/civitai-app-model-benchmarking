// The OPEN grid — its name, whether it is the system entry, the honest count of any
// members that are gone, and the runnable matrix.
//
// 🔴 WHY IT IS ITS OWN COMPONENT NOW. It used to be the top third of `GridsView`,
// which was fine while the grids list sat directly underneath it. The board subnav
// goes BETWEEN them — the open grid stays on Home whichever board is selected,
// because it is the app's primary object and the boards below it are what feed it —
// so the two halves are no longer adjacent and cannot be one component's return
// value.
//
// 🔴 IT HOLDS NO STATE AND RESOLVES NOTHING. Which grid is open, and what its members
// resolve to against the live board, are `App`'s (see `openGridKey` there). That is
// not a style choice: hoisting the open key above the board switch is what makes an
// in-flight run survive a trip to My Benchmarks and back, on the grid the viewer
// actually started it on — a `useState` in here would reset to the Top Grid on
// remount and leave a stalled cell on a grid nobody is looking at.
//
// 🔴 EVERY TESTID HERE IS UNCHANGED from when this markup lived in `GridsView`
// (`grid-open-panel`, `grid-open-title`, `grid-open-system-badge`,
// `grid-missing-notice`). Extracting a component is not a reason to rename a
// selector: `grid-open-panel` is addressed by `capture-landmarks.test.tsx` and read by
// an external capture recipe.

import type { ReactNode } from 'react';

import { Alert, Badge, Group, Stack } from '@civitai/blocks-react/ui';

export interface GridOpenPanelProps {
  /** The open grid's display name. */
  name: string;
  /** Is this the system-owned Top Grid? */
  system: boolean;
  /**
   * The "N matchups × N prompts" summary, already built by `gridMemberSummary` from
   * the RESOLVED members — the same string the cards show in `grid-card-members`.
   *
   * 🔴 IT IS HERE BECAUSE EXCLUDING THE OPEN GRID FROM THE LIST TOOK IT OFF THE PAGE.
   * The count only ever rendered on a card, and the open grid has no card — so on a
   * default load (Top Grid open, nothing else published) the app showed a matrix with
   * no statement anywhere of how many members it has. The count is information in its
   * own right, which is why every card carries it; that is the whole reason, and it is
   * the operator's.
   *
   * ⚠️ A DRAFT OF THIS DOCBLOCK ADDED "a viewer could not tell a grid whose members are
   * all present from one that silently resolved short". RETRACTED — it is FALSE, and it
   * is the exact error class the round that added this prop was fixing. They CAN tell:
   * `missingMembersNotice` returns null iff nothing is missing, so the notice's presence
   * and the shortfall are equivalent. Do not re-derive it; the size-is-information
   * reason above needs no help.
   *
   * 🔴 BUILT BY THE CALLER, FROM THE RESOLVED ROWS — never counted from the authored
   * key lists. A grid's members are what survives resolution against the live board,
   * so an authored length would over-report the moment another author withdraws a
   * row, and it would disagree with the cards, which resolve. One helper
   * (`gridMemberSummary`), two surfaces.
   */
  members: string;
  /**
   * The missing-members sentence, or null.
   *
   * 🔴 CRITERION 8: a grid whose members another author withdrew renders what
   * survives AND says how much is gone. Never a throw, never a quiet shrink — and
   * never blaming an author on a TRUNCATED board scan, which is why the sentence is
   * built by `missingMembersNotice` from the scan's own truncation flag rather than
   * from a set difference alone.
   */
  missing: string | null;
  /** The runnable matrix. Money-shaped, so it is passed in rather than built here. */
  children: ReactNode;
}

export function GridOpenPanel({
  name,
  system,
  members,
  missing,
  children,
}: GridOpenPanelProps): React.JSX.Element {
  return (
    <Stack gap={8} data-testid="grid-open-panel" style={{ minWidth: 0 }}>
      <Group justify="space-between" align="center" gap={12}>
        <Group gap={8} align="center" style={{ minWidth: 0 }}>
          <strong style={{ fontSize: 15 }} data-testid="grid-open-title">
            {name}
          </strong>
          {system && (
            <Badge variant="light" data-testid="grid-open-system-badge">
              System grid
            </Badge>
          )}
          {/* 🔴 A DISTINCT TESTID FROM THE CARD'S `grid-card-members`, on purpose. The
              two are the same STRING from the same helper but different SURFACES, and
              a shared testid would make `getByTestId` ambiguous the moment the open
              grid and a card are both on screen — which is the normal state as soon
              as anything is published. Same reason every other `grid-open-*` name
              exists. ⚠️ jsdom performs no layout, so nothing here judges whether it
              READS as beside the title; only that it is in the panel. */}
          <Badge variant="light" data-testid="grid-open-members">
            {members}
          </Badge>
        </Group>
      </Group>
      {missing && (
        <Alert color="warning" data-testid="grid-missing-notice">
          {missing}
        </Alert>
      )}
      {children}
    </Stack>
  );
}
