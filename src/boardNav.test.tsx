// The BOARD SUBNAV — Grids / Matchups / Prompts, ONE MOUNTED AT A TIME, driven through
// the real App.
//
// 🔴 WHAT IT REPLACED AND WHY. The one-page IA rendered all three community boards
// simultaneously under an "All grids" heading and two sibling sections. Measured against
// the live host while restoring the store listing: the page came to 2166 CSS px, the
// host sizes the iframe with `flex: 1 1 0%` inside an `overflow: hidden` parent — to the
// VIEWPORT, not to content — and `section-matchups` (y 1175..1482) and `section-prompts`
// (y 1500..2142) were below the iframe edge at EVERY tested viewport height
// (900/1100/1400 → iframe 752/952/1253). Two of the three boards were unphotographable
// by the capture pipeline, which is a real loss the tabbed IA did not have.
//
// 🔴 EVERY CLAIM HERE IS AN ABSENCE, AND THAT IS DELIBERATE. "One board at a time" is
// only worth anything if the other two are UNMOUNTED:
//   - a `display: none` would satisfy any visibility assertion;
//   - it would keep every hidden section's testids resolving, so an external capture
//     recipe could address the wrong board and still exit 0;
//   - it would keep their gated image reads running, and the read budget the
//     grid-preview suites defend is a claim about what is MOUNTED, not what is painted.
// So the assertions are `queryByTestId(...) === null`, plus a positive control on the
// selected board in the same frame so an absence cannot be an absence of everything.
//
// ⚠️ jsdom performs NO LAYOUT, so nothing here measures the page's height and nothing
// here can confirm the boards became photographable. That needs a released artifact and
// a re-shoot; it is owed, not done.

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Harness } from './test-harness.js';
import type { SharedItem } from '@civitai/sdk';

import { App, type AppDeps } from './App.js';
import { BOARDS } from './components/BoardNav.js';
import { fakeAppStorage, fakeGatedCell, fakeShared, immediateSleep } from './test-helpers.js';
import type { CombinationData, PromptData } from './types.js';

const VIEWER_ID = 99;

const comboData: CombinationData = {
  v: 2,
  kind: 'combination',
  configs: [
    {
      id: 'cfgA',
      checkpoint: { versionId: 1001, modelId: 500, baseModel: 'SDXL 1.0', modelName: 'JuggernautXL' },
      loras: [],
    },
  ],
};
const promptData: PromptData = {
  v: 3,
  kind: 'prompt',
  default: { prompt: 'a portrait', params: {} },
};

const row = (key: string, title: string, data: unknown): SharedItem => ({
  key,
  authorUserId: 7,
  count: 3,
  viewerVoted: false,
  value: { title, body: '', data },
  createdAt: new Date(0),
  updatedAt: new Date(0),
});

const SEED: SharedItem[] = [
  row('mk-1', 'A matchup', comboData),
  row('qk-1', 'A prompt', promptData),
];

function renderApp(deps: Partial<AppDeps> = {}) {
  const { shared } = fakeShared({ seed: SEED });
  render(
    <Harness
      viewer={{ id: VIEWER_ID, username: 'me' }}
      theme="dark"
      consentGranted
      buzzBudget={1000}
      buzzBalance={{ blue: 0, green: 0, yellow: 5000 }}
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
          ...deps,
        }}
      />
    </Harness>,
  );
}

/** The board sections currently mounted, by their marker attribute. */
const mountedBoards = (): string[] =>
  Array.from(document.querySelectorAll('[data-mb-section]'))
    .map((el) => el.getAttribute('data-mb-section') ?? '')
    .filter((m) => m !== 'open-grid');

describe('🔴 the board subnav mounts exactly ONE board, and unmounts the others', () => {
  it('LEDGER: the subnav offers exactly these three boards, with these labels', async () => {
    renderApp();
    await screen.findByTestId('results-grid');

    // Fails when a board is ADDED as loudly as when one is removed or renamed.
    // Literals on both sides; `BOARDS` is cross-checked against this table rather than
    // used to build it.
    const expected = [
      ['grids', 'Grids'],
      ['matchups', 'Matchups'],
      ['prompts', 'Prompts'],
    ];
    const nav = screen.getByTestId('board-nav');
    for (const [board, label] of expected) {
      expect(within(nav).getByTestId(`board-nav-${board}`)).toHaveTextContent(label!);
    }
    expect(within(nav).getAllByRole('tab')).toHaveLength(3);
    expect(BOARDS.map(([b, l]) => [b, l])).toEqual(expected);
  });

  it('opens on GRIDS, with the other two boards ABSENT from the DOM', async () => {
    renderApp();
    await screen.findByTestId('results-grid');

    // POSITIVE CONTROL first, in the same frame: the selected board really rendered, so
    // the two nulls below are one board's absence and not the page failing to mount.
    expect(screen.getByTestId('section-grids')).toBeInTheDocument();
    expect(screen.getByTestId('grids-list')).toBeInTheDocument();

    expect(screen.queryByTestId('section-matchups')).toBeNull();
    expect(screen.queryByTestId('section-prompts')).toBeNull();
    // …and by the content, not only the wrapper: an unmounted board contributes no
    // cards, no lists and no submit control.
    expect(screen.queryByTestId('matchups-view')).toBeNull();
    expect(screen.queryByTestId('prompts-view')).toBeNull();
    expect(screen.queryByTestId('submit-matchup')).toBeNull();
    expect(screen.queryByTestId('submit-prompt')).toBeNull();
    expect(mountedBoards()).toEqual(['grids']);
  });

  for (const [board, label] of BOARDS) {
    it(`selecting ${label} mounts only ${board}`, async () => {
      renderApp();
      await screen.findByTestId('results-grid');

      await userEvent.click(screen.getByTestId(`board-nav-${board}`));

      await waitFor(() => expect(screen.getByTestId(`section-${board}`)).toBeInTheDocument());
      // 🔴 THE RELATIONSHIP, not three per-board nulls: the mounted set is EXACTLY one
      // board, whichever it is. A filter that dropped the wrong section — or none —
      // fails on the set as well as on the name.
      expect(mountedBoards()).toEqual([board]);
      for (const [other] of BOARDS) {
        if (other === board) continue;
        expect(
          screen.queryByTestId(`section-${other}`),
          `${other} is still mounted alongside ${board}`,
        ).toBeNull();
      }
    });
  }

  it('the OPEN GRID and its matrix stay mounted on every board', async () => {
    // 🔴 THE ONE THING THE SUBNAV MUST *NOT* UNMOUNT. The open grid is the app's primary
    // object and the boards below it are what feed it — and its matrix is the money
    // path. A subnav that swapped it out with the grids board would take a viewer's
    // in-flight run off screen every time they looked at a prompt list.
    renderApp();
    await screen.findByTestId('results-grid');

    for (const [board] of BOARDS) {
      await userEvent.click(screen.getByTestId(`board-nav-${board}`));
      await waitFor(() => expect(screen.getByTestId(`section-${board}`)).toBeInTheDocument());
      expect(screen.getByTestId('section-open-grid'), `open grid lost on ${board}`).toBeInTheDocument();
      expect(screen.getByTestId('results-grid'), `matrix lost on ${board}`).toBeInTheDocument();
      expect(screen.getByTestId('grid-open-title')).toBeInTheDocument();
    }
  });

  it('🔴 the "All grids" heading it replaced is GONE, not merely restyled', async () => {
    // A shim heading left above the list would satisfy every structural assertion here
    // while leaving two headings for one list. Pinned as the rendered TEXT, because the
    // heading never had a testid to query.
    renderApp();
    await screen.findByTestId('results-grid');
    expect(screen.queryByText('All grids')).toBeNull();
    // POSITIVE CONTROL for the scan: the surface it replaced really is on screen.
    expect(screen.getByTestId('grids-all-section')).toBeInTheDocument();
  });

  it('the selected board is NOT persisted across a remount', async () => {
    // 🔴 AN OPERATOR DECISION (YAGNI): no KV write, no URL, no deep-linking. A remount
    // is what a reload looks like from the app's side.
    renderApp();
    await screen.findByTestId('results-grid');
    await userEvent.click(screen.getByTestId('board-nav-prompts'));
    await waitFor(() => expect(screen.getByTestId('section-prompts')).toBeInTheDocument());

    // A second, independent mount of the same app.
    renderApp();
    await waitFor(() => expect(screen.getAllByTestId('board-nav')).toHaveLength(2));
    // The fresh instance is on GRIDS. Read through the second `app-layout`, because the
    // first is still in the document.
    const layouts = screen.getAllByTestId('app-layout');
    expect(within(layouts[1]!).getByTestId('section-grids')).toBeInTheDocument();
    expect(within(layouts[1]!).queryByTestId('section-prompts')).toBeNull();
  });
});
