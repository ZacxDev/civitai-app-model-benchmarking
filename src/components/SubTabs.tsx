// The My / Community sub-tabs shared by the Matchups and Prompts views (spec
// §11.1), plus the signed-out panel the My side shows instead of a list.
//
// 🔴 A NESTED `SegmentedControl`, NOT a Tabs primitive: `@civitai/blocks-react/ui`
// exports no Tabs component (checked against the pinned 0.46.0 — the pack's tab
// semantics come from `SegmentedControl`, whose items already render
// `role="tab"`). Nesting one inside the view switch is therefore the pack-native
// composition rather than a workaround.
//
// 🔴 THE TESTIDS ARE OBJECT-SCOPED (`subtab-my-matchup`), AND THEY USED NOT TO BE.
// They were deliberately neutral (`subtab-my`) on a premise that held at the time:
// exactly one of the two views was mounted, because the top-level view switch
// unmounted the other, so a neutral name was unambiguous in the DOM. The IA
// refactor retired that premise — matchups and prompts are now SECTIONS of one
// page and both are mounted at once, so every neutral name resolved TWICE and a
// bare `getByTestId('subtab-my')` failed with "found multiple elements", which
// reads nothing like the real cause. Scoping the name is the fix at the source;
// scoping every query at every call site would be the same fix applied N times and
// wrong at N−1 of them the next time a surface is added.
//
// The cost is that `renameWireCompat.test.ts`'s ledger over §11.4's renamed
// testids gains the matchup-spelled ones — accounted for there, deliberately.

import { SegmentedControl, Button, Stack } from '@civitai/blocks-react/ui';

import { EmptyState } from './EmptyState.js';

export type SubTab = 'my' | 'community';

/**
 * The object a sub-tab strip belongs to — the discriminant in its testids.
 *
 * 🔴 TWO NOUNS, NOT THREE. `'grid'` was here until the IA refactor deleted the
 * grids section's sub-tabs, and it outlived its only caller: `GridsView` renders
 * neither `SubTabs` nor `MyTabSignedOut`, so nothing could pass it and the type
 * permitted a state no code path can reach. An unreachable variant is not free —
 * `gridsView.test.tsx`'s `queryByTestId('my-signed-out-grid')` and
 * `myCommunity.test.tsx`'s `my-sign-in-grid` were counted as anon-walk coverage
 * while being VACUOUS BY CONSTRUCTION: no component can emit those testids. They
 * are relabelled as invariant guards over there, not as coverage.
 */
export type SubTabNoun = 'matchup' | 'prompt';

export interface SubTabsProps {
  value: SubTab;
  onChange: (next: SubTab) => void;
  /** Which object's list this strip filters — scopes the testids. */
  noun: SubTabNoun;
  /** Own published rows (minus archived) + unpublished records. */
  myCount: number;
  /** Every published row, INCLUDING the viewer's own (§11.1). */
  communityCount: number;
}

export function SubTabs({
  value,
  onChange,
  noun,
  myCount,
  communityCount,
}: SubTabsProps): React.JSX.Element {
  return (
    <SegmentedControl
      fullWidth
      value={value}
      onChange={(v) => onChange(v as SubTab)}
      data-testid={`subtabs-${noun}`}
      data={[
        { value: 'my', label: <span data-testid={`subtab-my-${noun}`}>My ({myCount})</span> },
        {
          value: 'community',
          label: (
            <span data-testid={`subtab-community-${noun}`}>Community ({communityCount})</span>
          ),
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
  noun: SubTabNoun;
  onRequireAuth: () => void;
}): React.JSX.Element {
  return (
    <Stack gap={10} data-testid={`my-signed-out-${noun}`}>
      <EmptyState
        title="Sign in to see your own work"
        body={`Your unpublished ${noun}s are stored against your account, so there is nothing to show while you're signed out. Community is readable either way.`}
        action={
          <Button size="sm" onClick={onRequireAuth} data-testid={`my-sign-in-${noun}`}>
            Sign in
          </Button>
        }
      />
    </Stack>
  );
}
