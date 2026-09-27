// 🔴 THE CROSS-REPO CAPTURE CONTRACT. Every landmark an external screenshot
// recipe needs is addressable BY NAME here, not by position.
//
// ── WHY THIS FILE EXISTS (card 449, re-aimed by the IA refactor) ────────────
//
// `datapacket-talos`'s app-capture recipe
// (`.claude/skills/app-capture/scripts/recipes/model-benchmarking.json`) drives a
// real browser against this block to produce the store-listing screenshots a
// PLATFORM MODERATOR reviews. It used to select the three top-level tabs
// `[data-testid='view-switch'] > button:nth-of-type(1|2|3)` — a POSITIONAL
// selector that silently re-points at the wrong panel the moment a tab is
// reordered or added, and a capture of the wrong view still exits 0, so nothing
// downstream notices. Card 449 replaced that with per-tab NAMES, and this file
// pinned them.
//
// 🔴 THE IA REFACTOR DELETED THE TABS. `view-switch`, `view-switch-matchups`,
// `view-switch-prompts` and `view-switch-grid` DO NOT EXIST any more: the app is
// one page with three sections and one Contribute menu. So:
//
//   ⚠️ THE TALOS RECIPE MUST BE RE-POINTED AT THE NAMES BELOW. Until it is, a
//   capture against this version fails `element_not_found` on its first step.
//   That PR is deliberately sequenced AFTER this one — the new selector names do
//   not exist until this lands — and this file is the list it should be written
//   from. Nothing in `datapacket-talos` is touched here.
//
// ── WHAT THIS FILE PINS, AND WHY EACH PART IS HERE ──────────────────────────
//
//   1. EXISTENCE — each landmark resolves. The bare claim.
//   2. A LEDGER — the set of landmarks is EXACTLY this set, so a landmark being
//      ADDED without being ledgered fails here rather than silently leaving the
//      recipe half-blind, and so does one being removed or renamed. This is the
//      half that survives a future fourth section.
//   3. THE NAME→SURFACE MAPPING, asserted BEHAVIOURALLY and against LITERAL
//      expected values — never derived from the component's own tables. A
//      structural check alone is walkable by putting the right names on the wrong
//      elements, which is precisely the defect class ("the capture succeeds, of
//      the wrong thing") this file removes.
//
// ⚠ ROLES CHANGED WITH THE REFACTOR. The old strip's controls exposed
// `role="tab"`. The new landmarks do NOT: the Contribute trigger and the matchup
// band are `button`s, the sections are `<section>` elements with no role at all.
// `getAllByRole('tab')` now finds only the per-section My/Community sub-tabs, and
// asking for a tab by a view's name fails in a way that reads exactly like the app
// not rendering.

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Harness } from '@civitai/blocks-react/testing';

import { App } from './App.js';
import {
  CKPT_SDXL,
  fakeAppStorage,
  fakeGatedCell,
  fakeShared,
  immediateSleep,
} from './test-helpers.js';
import type { CombinationData, PromptData } from './types.js';

/**
 * Every landmark the capture recipe may address, as
 * `[testid, how to verify it, the literal expected outcome]`.
 *
 * Literals on BOTH sides — this table IS the contract the recipe buys. `contains`
 * means "this landmark is a container, and the named testid must be inside it";
 * `click` means "pressing it must make the named testid appear".
 */
const LANDMARKS = [
  ['contribute-trigger', 'click', 'contribute-menu-items'],
  ['section-grids', 'contains', 'results-grid'],
  ['grids-all-section', 'contains', 'grids-list'],
  ['section-matchups', 'contains', 'matchups-view'],
  ['section-prompts', 'contains', 'prompts-view'],
  ['grid-group-matchup', 'click', 'matchup-detail'],
] as const satisfies ReadonlyArray<readonly [string, 'click' | 'contains', string]>;

/** The testids the old tab strip exposed. NONE of them may come back. */
const RETIRED_TESTIDS = [
  'view-switch',
  'view-switch-matchups',
  'view-switch-prompts',
  'view-switch-grid',
] as const;

const VIEWER_ID = 99;

const comboData: CombinationData = {
  v: 2,
  kind: 'combination',
  configs: [
    {
      id: 'cfg-1',
      label: 'base',
      checkpoint: { versionId: 1001, modelId: 500, baseModel: 'SDXL 1.0', modelName: 'JuggernautXL' },
      loras: [],
    },
  ],
};

const promptData: PromptData = {
  v: 3,
  kind: 'prompt',
  default: { prompt: 'a cyberpunk portrait', params: {} },
};

/** A board with one matchup and one prompt, so the matrix — and therefore the
 * group band and the column header — actually render. */
function seed() {
  return [
    {
      key: 'mk-1',
      authorUserId: 7,
      count: 3,
      viewerVoted: false,
      value: { title: 'Anime Showdown', body: '', data: comboData },
      createdAt: new Date(0),
      updatedAt: new Date(0),
    },
    {
      key: 'pk-1',
      authorUserId: 8,
      count: 2,
      viewerVoted: false,
      value: { title: 'Cyberpunk portrait', body: '', data: promptData },
      createdAt: new Date(0),
      updatedAt: new Date(0),
    },
  ];
}

function renderApp() {
  const { shared } = fakeShared({ seed: seed() });
  render(
    <Harness
      viewer={{ id: VIEWER_ID, username: 'me' }}
      theme="dark"
      consentGranted
      buzzBudget={1000}
      cannedPicks={{ Checkpoint: CKPT_SDXL }}
      shared={{ seed: [] }}
      showLog={false}
    >
      <App
        deps={{
          resolveResources: async () => [],
          pollIntervalMs: 0,
          sleep: immediateSleep,
          shared,
          appStorage: fakeAppStorage().appStorage,
          GatedCell: fakeGatedCell(),
        }}
      />
    </Harness>,
  );
}

describe('capture landmarks — criterion 1: each one resolves by name', () => {
  it('resolves every landmark in the table, exactly once each', async () => {
    renderApp();
    await screen.findByTestId('results-grid');

    for (const [testid] of LANDMARKS) {
      // `getAllBy` + a length assertion rather than `getBy`: a landmark that
      // resolved TWICE would make the recipe's single-node selector ambiguous,
      // and `getBy`'s own error would report it as a different problem.
      expect(screen.getAllByTestId(testid), `${testid} does not resolve exactly once`).toHaveLength(
        1,
      );
    }
  });

  it('🔴 the retired view-switch testids are GONE — not merely unused', async () => {
    // 🔴 THIS CASE IS THE ONE THAT MUST BE WATCHED FAILING AT THE PRE-CHANGE BASE.
    // At `5c146d4` the strip exists and all four of these resolve, so it goes RED
    // there and green here. A shim tab left in the DOM to keep an old selector
    // working would fail it too, which is the point: the talos recipe has to be
    // re-pointed, and a silent compatibility layer would hide that it hasn't been.
    renderApp();
    await screen.findByTestId('results-grid');

    for (const testid of RETIRED_TESTIDS) {
      expect(screen.queryAllByTestId(testid), `${testid} is still rendered`).toEqual([]);
    }
    // …and no `role="tab"` names a top-level VIEW any more. The sub-tabs still use
    // that role, so an absence of tabs altogether would be the wrong assertion —
    // what must be gone is a tab that names one of the three former views.
    const tabNames = screen.getAllByRole('tab').map((t) => t.textContent ?? '');
    expect(tabNames.length, 'no tabs at all — the sub-tabs should still be here').toBeGreaterThan(0);
    for (const name of tabNames) {
      expect(name, `a tab still names a former view: ${name}`).not.toMatch(
        /^(Matchups|Prompts|Grids)\b/,
      );
    }
  });
});

describe('capture landmarks — criterion 2: the LEDGER', () => {
  it('the page carries EXACTLY the ledgered landmarks, and no unmarked section', async () => {
    renderApp();
    const content = await screen.findByTestId('app-content');

    // (a) The SECTION markers are exactly the three sections, IN ORDER. Failing
    //     when the set grows is the whole point — a fourth section is a loud
    //     failure here instead of a capture that silently misses it.
    const marked = Array.from(content.querySelectorAll('[data-mb-section]'));
    expect(marked.map((el) => el.getAttribute('data-mb-section'))).toEqual([
      'grids',
      'matchups',
      'prompts',
    ]);

    // (b) …and there is no `<section>` that ISN'T marked. Without this, (a) is
    //     walkable by adding a fourth section and simply not giving it the
    //     attribute — the exact shape of "adding a tab without a testid" that the
    //     original ledger was written to catch.
    expect(Array.from(content.querySelectorAll('section'))).toEqual(marked);

    // (c) The non-section landmarks resolve, and every element the table names
    //     really is a DISTINCT node. Three names stamped on one element would
    //     satisfy a plain existence check and leave the recipe coupled to
    //     whatever that one element happens to be.
    const nodes = LANDMARKS.map(([testid]) => screen.getByTestId(testid));
    expect(new Set(nodes).size).toBe(LANDMARKS.length);
  });
});

describe('capture landmarks — criterion 3: the name→surface mapping', () => {
  for (const [testid, kind, expected] of LANDMARKS) {
    if (kind === 'contains') {
      it(`[data-testid='${testid}'] contains ${expected}`, async () => {
        renderApp();
        await screen.findByTestId('results-grid');
        const host = screen.getByTestId(testid);
        expect(within(host).getByTestId(expected)).toBeInTheDocument();
      });
    } else {
      it(`clicking [data-testid='${testid}'] opens ${expected}`, async () => {
        renderApp();
        await screen.findByTestId('results-grid');
        expect(screen.queryByTestId(expected), `${expected} was already open`).toBeNull();

        await userEvent.click(screen.getByTestId(testid));

        expect(await screen.findByTestId(expected)).toBeInTheDocument();
      });
    }
  }

  it('the matchup band names its matchup in its accessible name', async () => {
    renderApp();
    await screen.findByTestId('results-grid');
    // A literal: the seeded matchup's title. A capture step that clicks "the
    // matchup band" has to be able to tell WHICH matchup it opened, and the
    // accessible name is what a recipe (and a screen reader) reads.
    expect(screen.getByTestId('grid-group-matchup')).toHaveAccessibleName(
      'Open matchup: Anime Showdown',
    );
  });

  it('the prompt column header opens the prompt detail', async () => {
    renderApp();
    await screen.findByTestId('results-grid');
    await userEvent.click(screen.getByTestId('grid-col-header'));
    await waitFor(() => expect(screen.getByTestId('prompt-detail')).toBeInTheDocument());
  });
});
