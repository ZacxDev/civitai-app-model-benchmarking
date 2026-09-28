// The community BOARD subnav — Grids / Matchups / Prompts, one at a time.
//
// 🔴 IT REPLACED THE "All grids" HEADING, and it changed what the page mounts. The
// one-page IA rendered all three boards simultaneously as `section-grids`,
// `section-matchups`, `section-prompts`; the page came to 2166 CSS px and the host's
// iframe (sized to the VIEWPORT, inside an `overflow: hidden` parent) clipped two of
// the three so badly they could not be photographed for the store listing at any
// tested viewport height. Only ONE board is mounted now.
//
// 🔴 THE UNSELECTED BOARDS ARE UNMOUNTED, NOT HIDDEN, and that is asserted by
// ABSENCE (`src/boardNav.test.tsx`). A `display: none` would satisfy a visibility
// assertion, keep every one of those sections' testids resolving, and keep their
// gated image reads running — the read budget the grid-preview suites defend is a
// claim about what is MOUNTED.
//
// 🔴 WHY A PACK `SegmentedControl` RATHER THAN A HAND-BUILT STRIP. Three reasons,
// and the third is the one that would otherwise cost a regression:
//   1. it is what the pack gives for tab semantics — `@civitai/blocks-react/ui`
//      exports no Tabs component (the same finding `SubTabs` recorded), and its
//      segments already render `role="tab"`;
//   2. `SubTabs` used the same primitive, so the switch from a My/Community strip to
//      a board strip is a change of MEANING, not of mechanism;
//   3. `compact.ts`'s 44px tap-target rule already reaches
//      `[data-civitai-ui-segment]`. Hand-building this strip would have put a fourth
//      app-built tap target under the floor — which `compact.ts`'s own header records
//      as having happened THREE times, each time because the rule's other selectors
//      reach pack controls and an app-built one slips the list.
//
// The three-way choice is deliberately NOT a discriminated union: it is a closed set
// of three strings that also spell the section testids, so one value drives both the
// segment and the `section-*` landmark the capture recipe addresses.

import { SegmentedControl } from '@civitai/blocks-react/ui';

/** Which community board is mounted. Also the `section-<board>` testid suffix. */
export type Board = 'grids' | 'matchups' | 'prompts';

/**
 * The board ledger, as `[value, label]`, exported so a test asserts the SET.
 *
 * 🔴 THE LABELS ARE LITERALS AND THEY ARE THE VISIBLE TEXT. A capture recipe and a
 * screen reader both read them, and `capture-landmarks.test.tsx` pins that the only
 * `role="tab"` elements on the page are these three — which is what stops a
 * reintroduced top-level `view-switch` strip hiding behind the same role.
 */
export const BOARDS = [
  ['grids', 'Grids'],
  ['matchups', 'Matchups'],
  ['prompts', 'Prompts'],
] as const satisfies ReadonlyArray<readonly [Board, string]>;

export interface BoardNavProps {
  value: Board;
  onChange: (next: Board) => void;
}

export function BoardNav({ value, onChange }: BoardNavProps): React.JSX.Element {
  return (
    <SegmentedControl
      fullWidth
      value={value}
      onChange={(v) => onChange(v as Board)}
      data-testid="board-nav"
      data={BOARDS.map(([board, label]) => ({
        value: board,
        label: <span data-testid={`board-nav-${board}`}>{label}</span>,
      }))}
    />
  );
}
