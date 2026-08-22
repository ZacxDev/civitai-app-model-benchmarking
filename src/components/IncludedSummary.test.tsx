// Regression guard for the Combinations/Prompts header copy.
//
// At v0.2.3 both headers rendered `The top {includedKeys.size || 'N'} are …`,
// which carried three defects, all observed on the LIVE app on 2026-08-17:
//   1. number disagreement — with exactly one included combination the live app
//      read "The top 1 are included as the grid's rows.";
//   2. a leaked placeholder — with nothing included it read "The top N …";
//   3. a false claim about the SHARED grid — inclusion is `topByVotes(rows,
//      topN)` where topN is the Grid tab's per-viewer "Show top N" slider, which
//      that same tab describes as changing "how many rows/columns YOU see".
//
// These assert the RENDERED output of the real components, so they fail on the
// pre-fix tree rather than merely re-stating the helper's unit tests.

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { CombinationRow, PromptRow } from '../types.js';
import { CombosView } from './CombosView.js';
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

function renderCombos(rows: CombinationRow[], includedKeys: Set<string>) {
  return render(
    <CombosView
      combinations={rows}
      includedKeys={includedKeys}
      votedKeys={new Set()}
      viewerId={1}
      loading={false}
      error={null}
      onSubmitNew={noop}
      onVote={noop}
      onUnvote={noop}
      onRequireAuth={noop}
      onEdit={noop}
      onWithdraw={noop}
    />,
  );
}

function renderPrompts(rows: PromptRow[], includedKeys: Set<string>) {
  return render(
    <PromptsView
      prompts={rows}
      includedKeys={includedKeys}
      votedKeys={new Set()}
      viewerId={1}
      loading={false}
      error={null}
      onSubmitNew={noop}
      onVote={noop}
      onUnvote={noop}
      onRequireAuth={noop}
      onEdit={noop}
      onWithdraw={noop}
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
    renderCombos([comboRow('a', 3)], new Set(['a']));
    // The exact broken string the live app rendered on 2026-08-17.
    expect(viewText()).not.toContain("The top 1 are included as the grid's rows.");
    expect(viewText()).not.toMatch(/top 1 by votes are/);
    expect(viewText()).toContain("The top 1 by votes is showing as the grid's row in your view.");
  });

  it('agrees in number with SEVERAL included columns', () => {
    renderPrompts(
      [promptRow('a', 3), promptRow('b', 2), promptRow('c', 1)],
      new Set(['a', 'b', 'c']),
    );
    expect(viewText()).toContain("The top 3 by votes are showing as the grid's columns in your view.");
  });

  it('never leaks the literal placeholder "N" when nothing is included', () => {
    renderCombos([], new Set());
    expect(viewText()).not.toMatch(/\btop N\b/);
    document.body.innerHTML = '';
    renderPrompts([], new Set());
    expect(viewText()).not.toMatch(/\btop N\b/);
  });

  it('scopes the claim to the viewer rather than asserting what the shared grid holds', () => {
    renderCombos([comboRow('a', 3), comboRow('b', 1)], new Set(['a', 'b']));
    expect(viewText()).toContain('in your view');
    document.body.innerHTML = '';
    renderPrompts([promptRow('a', 3)], new Set(['a']));
    expect(viewText()).toContain('in your view');
  });

  it('the Included tooltip does not claim membership of the shared grid either', () => {
    renderPrompts([promptRow('a', 3)], new Set(['a']));
    // The badge is wrapped by the tooltip trigger; the label rides an attribute.
    const html = document.body.innerHTML;
    expect(html).not.toContain("it forms one of the grid's columns.");
    expect(html).toMatch(/top-N by votes/);
  });
});
