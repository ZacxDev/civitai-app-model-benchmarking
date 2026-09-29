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
