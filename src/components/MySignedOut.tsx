// The viewer's-own surface for an ANONYMOUS viewer.
//
// ── WHAT THIS FILE USED TO BE, AND WHAT SURVIVED ────────────────────────────
//
// It was `SubTabs.tsx`, and it exported the My/Community `SegmentedControl` strip
// that `MatchupsView` and `PromptsView` rendered above their lists. That strip is
// GONE: "My" is a sidebar destination now (My Benchmarks ▸ Grids/Matchups/Prompts)
// and the boards below the grid are community-only, so a per-board My/Community
// toggle would be a second, weaker spelling of a choice the sidebar already makes.
// `SubTabs` and the `SubTab` type went with it.
//
// 🔴 WHAT DID *NOT* GO IS THIS PANEL, AND THE REASONING BEHIND ITS TESTIDS. Both are
// re-recorded here rather than deleted with the file that carried them, because the
// old header's two claims have different fates:
//
//   1. "IT OFFERS NO WRITE AFFORDANCE AT ALL" — UNCHANGED AND STILL LOAD-BEARING.
//      `StorageClient.set` REJECTS for an anonymous viewer and `shared.append`
//      rejects too, so a Publish / New / Archive button rendered here could only ever
//      produce an unhandled rejection out of a click handler. The one control is the
//      host's own sign-in request. `myCommunity.test.tsx`'s anon walk is what holds
//      this, by asserting an EMPTY write ledger over surfaces it actually pressed.
//
//   2. "THE TESTIDS ARE OBJECT-SCOPED BECAUSE TWO SURFACES ARE MOUNTED AT ONCE" —
//      ⚠️ THAT PREMISE IS RETIRED. It was true of the one-page IA: matchups and
//      prompts were simultaneous sections, so a neutral `my-signed-out` resolved
//      TWICE and `getByTestId` failed with "found multiple elements", which reads
//      nothing like the real cause. My Benchmarks mounts exactly ONE noun at a time,
//      so scoping is no longer forced.
//      🔴 THE NAMES ARE KEPT ANYWAY, and the reason is not inertia: they are in
//      `renameWireCompat.test.ts`'s §11.4 ledger and they are the kind of selector an
//      external consumer reads. Renaming them buys nothing and costs a cross-repo
//      coordination. So: scoped by CHOICE now, not by necessity — and if a future
//      surface does mount two nouns together, the names already survive it.
//
// 🔴 AND `'grid'` IS BACK IN THE NOUN UNION, WITH A REAL CONSUMER. The IA refactor
// removed it because the grids section had no My/Community split, which left
// `my-signed-out-grid` / `my-sign-in-grid` emittable by nothing — `gridsView.test.tsx`
// and `myCommunity.test.tsx` both relabelled their queries for those names as
// INVARIANT GUARDS, vacuous by construction. My Benchmarks ▸ Grids renders this panel
// for an anonymous viewer, so those two testids are now REAL and the queries against
// them are coverage again. Those comments are corrected where they stand.

import { Button, Stack } from '@civitai/blocks-react/ui';

import { EmptyState } from './EmptyState.js';

/**
 * The object kind this panel is standing in for — the discriminant in its testids.
 *
 * 🔴 THREE NOUNS. It was three, then two (the IA refactor deleted the grids sub-tabs
 * and `'grid'` outlived its only caller), and it is three again for a reason that is
 * stated rather than assumed: My Benchmarks has a Grids destination, and it renders
 * this panel when nobody is signed in.
 */
export type MyNoun = 'grid' | 'matchup' | 'prompt';

export function MyTabSignedOut({
  noun,
  onRequireAuth,
}: {
  noun: MyNoun;
  onRequireAuth: () => void;
}): React.JSX.Element {
  return (
    <Stack gap={10} data-testid={`my-signed-out-${noun}`}>
      <EmptyState
        title="Sign in to see your own work"
        body={`Your unpublished ${noun}s are stored against your account, so there is nothing to show while you're signed out. The community boards are readable either way.`}
        action={
          <Button size="sm" onClick={onRequireAuth} data-testid={`my-sign-in-${noun}`}>
            Sign in
          </Button>
        }
      />
    </Stack>
  );
}
