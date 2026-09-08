// The My / Community sub-tabs shared by the Matchups and Prompts views (spec
// §11.1), plus the signed-out panel the My side shows instead of a list.
//
// 🔴 A NESTED `SegmentedControl`, NOT a Tabs primitive: `@civitai/blocks-react/ui`
// exports no Tabs component (checked against the pinned 0.46.0 — the pack's tab
// semantics come from `SegmentedControl`, whose items already render
// `role="tab"`). Nesting one inside the view switch is therefore the pack-native
// composition rather than a workaround.
//
// 🔴 THE TESTIDS ARE DELIBERATELY OBJECT-NEUTRAL (`subtab-my`, not
// `subtab-my-matchups`). Exactly one of the two views is mounted at a time — the
// view switch unmounts the other — so the names are unambiguous in the DOM, and
// keeping the word "matchup" out of them keeps `renameWireCompat.test.ts`'s
// ledger over §11.4's 24 renamed testids exactly as tight as it was.

import { SegmentedControl, Button, Stack } from '@civitai/blocks-react/ui';

import { EmptyState } from './EmptyState.js';

export type SubTab = 'my' | 'community';

export interface SubTabsProps {
  value: SubTab;
  onChange: (next: SubTab) => void;
  /** Own published rows (minus archived) + unpublished records. */
  myCount: number;
  /** Every published row, INCLUDING the viewer's own (§11.1). */
  communityCount: number;
}

export function SubTabs({ value, onChange, myCount, communityCount }: SubTabsProps): React.JSX.Element {
  return (
    <SegmentedControl
      fullWidth
      value={value}
      onChange={(v) => onChange(v as SubTab)}
      data-testid="subtabs"
      data={[
        { value: 'my', label: <span data-testid="subtab-my">My ({myCount})</span> },
        {
          value: 'community',
          label: <span data-testid="subtab-community">Community ({communityCount})</span>,
        },
      ]}
    />
  );
}

/**
 * The My tab for an ANONYMOUS viewer.
 *
 * 🔴 IT OFFERS NO WRITE AFFORDANCE AT ALL, which is the point rather than a
 * nicety: `useAppStorage.set` REJECTS for an anonymous viewer and
 * `useSharedStorage.append` rejects too, so a Publish / New / Archive button
 * rendered here could only ever produce an unhandled rejection. The one control
 * is the host's own sign-in request.
 */
export function MyTabSignedOut({
  noun,
  onRequireAuth,
}: {
  noun: 'matchup' | 'prompt' | 'grid';
  onRequireAuth: () => void;
}): React.JSX.Element {
  return (
    <Stack gap={10} data-testid="my-signed-out">
      <EmptyState
        title="Sign in to see your own work"
        body={`Your unpublished ${noun}s are stored against your account, so there is nothing to show while you're signed out. Community is readable either way.`}
        action={
          <Button size="sm" onClick={onRequireAuth} data-testid="my-sign-in">
            Sign in
          </Button>
        }
      />
    </Stack>
  );
}
