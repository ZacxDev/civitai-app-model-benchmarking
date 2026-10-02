// Regression guard for the Combinations/Prompts header copy.
//
// At v0.2.3 both headers rendered `The top {includedKeys.size || 'N'} are …`,
// which carried three defects, all observed on the LIVE app on 2026-08-17:
//   1. number disagreement — with exactly one included combination the live app
//      read "The top 1 are included as the grid's rows.";
//   2. a leaked placeholder — with nothing included it read "The top N …";
//   3. a false claim about the SHARED grid — inclusion was `topByVotes(rows,
//      topN)` where topN was the Grid tab's per-viewer "Show top N" slider, which
//      that same tab described as changing "how many rows/columns YOU see".
//
// ⚠ 527 DELETED that slider (§11.5). Inclusion is now `topByVotes(rows,
// DEFAULT_TOP_N)` — the same set for every viewer, except that the set is ranked
// over the rows THIS CLIENT's scan read, which the board-truncation notice
// discloses separately. "in your view" is therefore still not false, and the
// header copy is unchanged; the TOOLTIP is what had to move, because it named the
// deleted control by name.
//
// These assert the RENDERED output of the real components, so they fail on the
// pre-fix tree rather than merely re-stating the helper's unit tests.
//
// ⚠️ THE FIXTURE PASSES A COUNT, NOT A KEY SET — the views' prop is `includedCount:
// number` now. It was `includedKeys: Set<string>` while each row carried an "Included"
// badge needing `has(key)`; those badges were deleted (see the retirement note at the
// foot of this file) and `.size` became the only reader, so the Set and the two
// `useMemo`s behind it were a second representation of `includedCombos.length`.
// ⚠️ ONE THING THAT COSTS: a Set fixture could not disagree with its own row list,
// whereas a number can — `renderCombos([...one row], 3)` is now expressible. That is
// FINE HERE and deliberately so: every case below is about the COPY the number
// produces, and decoupling the number from the row count is what lets the "top 1 are"
// and leaked-"N" defects be driven at all. It is not a claim that the App's number
// agrees with its rows; `gridsView.test.tsx`'s criterion-10 cases hold that, through
// the App, against `DEFAULT_TOP_N`.

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { CombinationRow, PromptRow } from '../types.js';
import { MatchupsView } from './MatchupsView.js';
import { PromptsView } from './PromptsView.js';

const noop = () => {};

function comboRow(key: string, count: number): CombinationRow {
  return {
    key,
    name: `Combo ${key}`,
    description: '',
    count,
    authorUserId: 1,
    data: {
      v: 2,
      kind: 'combination',
      configs: [
        {
          id: `${key}-c1`,
          checkpoint: { versionId: 1, modelId: 2, modelName: 'CKPT', baseModel: 'SDXL 1.0' },
          loras: [],
        },
      ],
    },
  } as unknown as CombinationRow;
}

function promptRow(key: string, count: number): PromptRow {
  return {
    key,
    name: `Prompt ${key}`,
    description: '',
    count,
    authorUserId: 1,
    data: { v: 2, kind: 'prompt', default: { prompt: 'x', params: {} }, overrides: {} },
  } as unknown as PromptRow;
}

function renderCombos(rows: CombinationRow[], includedCount: number) {
  return render(
    <MatchupsView
      surface="community"
      combinations={rows}
      includedCount={includedCount}
      votedKeys={new Set()}
      reportedKeys={new Set()}
      viewerId={1}
      loading={false}
      error={null}
      onSubmitNew={noop}
      onVote={noop}
      onUnvote={noop}
      onRequireAuth={noop}
      onEdit={noop}
      onWithdraw={noop}
      onReport={async () => {}}
    />,
  );
}

function renderPrompts(rows: PromptRow[], includedCount: number) {
  return render(
    <PromptsView
      surface="community"
      prompts={rows}
      includedCount={includedCount}
      votedKeys={new Set()}
      reportedKeys={new Set()}
      viewerId={1}
      loading={false}
      error={null}
      onSubmitNew={noop}
      onVote={noop}
      onUnvote={noop}
      onRequireAuth={noop}
      onEdit={noop}
      onWithdraw={noop}
      onReport={async () => {}}
    />,
  );
}

// Assert against the WHOLE rendered view, not against a data-testid this change
// introduced: a test keyed on the new marker fails on the pre-fix tree merely
// because the marker is absent, which proves nothing about the copy. Reading the
// rendered text makes these fail on the pre-fix tree for the RIGHT reason.
const viewText = () => (document.body.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('included-summary copy (rendered)', () => {
  it('agrees in number with exactly ONE included row — the live 0.2.3 defect', () => {
    renderCombos([comboRow('a', 3)], 1);
    // The exact broken string the live app rendered on 2026-08-17.
    expect(viewText()).not.toContain("The top 1 are included as the grid's rows.");
    expect(viewText()).not.toMatch(/top 1 by votes are/);
    expect(viewText()).toContain("The top 1 by votes is showing as the grid's row in your view.");
  });

  it('agrees in number with SEVERAL included columns', () => {
    renderPrompts([promptRow('a', 3), promptRow('b', 2), promptRow('c', 1)], 3);
    expect(viewText()).toContain("The top 3 by votes are showing as the grid's columns in your view.");
  });

  it('never leaks the literal placeholder "N" when nothing is included', () => {
    renderCombos([], 0);
    expect(viewText()).not.toMatch(/\btop N\b/);
    document.body.innerHTML = '';
    renderPrompts([], 0);
    expect(viewText()).not.toMatch(/\btop N\b/);
  });

  it('scopes the claim to the viewer rather than asserting what the shared grid holds', () => {
    renderCombos([comboRow('a', 3), comboRow('b', 1)], 2);
    expect(viewText()).toContain('in your view');
    document.body.innerHTML = '';
    renderPrompts([promptRow('a', 3)], 1);
    expect(viewText()).toContain('in your view');
  });

  // -------------------------------------------------------------------------
  // 🔴 RETIRED, NOT RETARGETED — 'the Included tooltip renders the WHOLE pinned
  // string, on both axes'.
  //
  // That case pinned `INCLUDED_ROW_TOOLTIP` / `INCLUDED_COLUMN_TOOLTIP` whole,
  // because each was PROSE MAKING A CLAIM about what "Included" meant and each
  // claim had already been wrong twice (it named the deleted per-viewer `Slider`,
  // then the deleted Grids *tab*). The whole-string form was the fix for a keyword
  // guard that a reword walked straight past.
  //
  // The third IA pass DELETED both badges and both tooltips (operator decision:
  // every badge is gone from both modals — see `MatchupBody`'s header). There is no
  // longer any prose making that claim, so there is nothing left to pin: a guard
  // retargeted at the nearest surviving string would be asserting a DIFFERENT claim
  // under the old case's name, which is how a test comes to read as coverage it does
  // not provide.
  //
  // 🔴 WHAT SURVIVES IS A DIFFERENT THING, DELIBERATELY. The four cases above pin
  // the `matchups-included-summary` / `prompts-included-summary` HEADER COPY — "The
  // top N by votes are showing as the grid's columns in your view." That copy was
  // never the badge tooltip, it is still rendered, and it still carries the three
  // live-app defects this file was written for (number disagreement, the leaked "N"
  // placeholder, the false claim about the shared grid). Removing the badge did not
  // weaken any of them.
  //
  // The two retracted strings the retired case also guarded against are pinned
  // below instead, over the WHOLE view. They are what the claim used to say
  // wrongly, and both name controls this app no longer has — so they must never
  // reappear in ANY copy, not merely in a tooltip that no longer exists. This is
  // strictly wider than the position the retired case checked.
  // -------------------------------------------------------------------------
  it('never re-introduces either retracted "Included" claim, in any copy', () => {
    renderCombos([comboRow('a', 3)], 1);
    expect(viewText()).not.toContain('Change how many in the Grid tab');
    expect(viewText()).not.toContain("it forms one of the grid's rows.");

    document.body.innerHTML = '';
    renderPrompts([promptRow('a', 3)], 1);
    expect(viewText()).not.toContain('Change how many in the Grid tab');
    expect(viewText()).not.toContain("it forms one of the grid's columns.");
  });

  it('🔴 renders NO Included badge on either axis — the third IA pass removed both', () => {
    // ABSENCE FROM THE DOM, not invisibility: a hidden badge is still a badge, and
    // `queryByTestId` is the only form that distinguishes the two.
    const { queryByTestId } = renderCombos([comboRow('a', 3)], 1);
    // POSITIVE CONTROL: the row really rendered, so the null below is about the
    // badge and not about a view that failed to mount.
    //
    // ⚠️ IT USED TO BE `matchup-vote` AND THAT WAS SILENTLY OWNERSHIP-DEPENDENT.
    // `comboRow` carries `authorUserId: 1` and `renderCombos` passes `viewerId={1}`,
    // so every row this file renders is the VIEWER'S OWN — and the vote control is
    // now hidden on an author's own matchups (`MatchupBody`'s `canVote`). A control
    // that can vanish for a reason unrelated to the claim is not a control; the
    // config summary renders for every viewer on every matchup, owned or not.
    expect(queryByTestId('matchup-config-summary')).not.toBeNull();
    expect(queryByTestId('matchup-included')).toBeNull();
    expect(queryByTestId('matchup-config-count')).toBeNull();

    document.body.innerHTML = '';
    // 🔴 THE OVERRIDE IS NOT DECORATION. `promptRow`'s default fixture carries
    // `overrides: {}`, so a `prompt-override-badge` assertion over it would have
    // been 0 at base too — vacuous. One real override makes the count move at base
    // (1 → 0 here), which is what gives this half of the case its teeth.
    const withOverride = promptRow('a', 3);
    withOverride.data.overrides = { SDXL: { prompt: 'sdxl variant' } };
    const p = renderPrompts([withOverride], 1);
    expect(p.queryByTestId('prompt-vote')).not.toBeNull();
    expect(p.queryByTestId('prompt-included')).toBeNull();
    expect(p.queryByTestId('prompt-default-badge')).toBeNull();
    expect(p.queryAllByTestId('prompt-override-badge')).toHaveLength(0);
  });
});
