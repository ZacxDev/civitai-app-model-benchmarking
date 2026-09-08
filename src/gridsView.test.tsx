// 527 Phase 3 — the GRIDS view, driven through the real App.
//
// Acceptance criteria covered here, each named on its own case:
//
//   8  — a published grid whose members another author withdrew renders the
//         members it still has PLUS an honest count of what is gone. Never a
//         throw, never a quiet shrink.
//   9  — Grids is the DEFAULT view on load, and the per-viewer "Show top N"
//         slider is gone from the whole rendered app.
//   10 — the system-owned TOP GRID: DEFAULT_TOP_N top-voted matchups ×
//         DEFAULT_TOP_N top-voted prompts, pinned FIRST and carrying no vote
//         control, because it has no shared row to vote on.
//   11 — grid votes go through `shared.vote`/`unvote` on the GRID row, the
//         button hydrates from `viewerVoted`, and Community Grids is ordered by
//         count descending.
//
// Plus: an anonymous viewer gets a readable Community and makes no rejecting
// write, and the private → publish boundary holds for grids.
//
// ⚠ jsdom performs NO LAYOUT. `scrollWidth`, `getBoundingClientRect()` and
// friends are 0 here and `scrollIntoView` is unimplemented, so NOTHING in this
// file observes geometry — every claim is about the DOM, the calls the app made,
// and the text it rendered.

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Harness } from '@civitai/blocks-react/testing';
import type { SharedListItem, UseSharedStorage } from '@civitai/blocks-react';

import { App, type AppDeps } from './App.js';
import { DEFAULT_TOP_N } from './lib/benchmark.js';
import { UNPUB_GRID_PREFIX } from './lib/grids.js';
import { TOP_GRID_NAME } from './lib/gridEntries.js';
import { fakeAppStorage, fakeShared, immediateSleep, openView } from './test-helpers.js';
import type { CombinationData, GridData, PromptData } from './types.js';

const VIEWER_ID = 99;
const OTHER_ID = 7;

// ---------------------------------------------------------------------------
// Fixtures.
//
// 🔴 Vote counts are PAIRWISE DISTINCT and deliberately NOT in seed order, so a
// case about ordering cannot pass against the order it was handed. Keys are
// pairwise distinct, and their lexical order is made to differ from the vote
// order so a secret key-sort is distinguishable from a real one.
// ---------------------------------------------------------------------------

const comboData = (id: string): CombinationData => ({
  v: 2,
  kind: 'combination',
  configs: [
    {
      id,
      checkpoint: { versionId: 1001, modelId: 500, baseModel: 'SDXL 1.0', modelName: 'JuggernautXL' },
      loras: [],
    },
  ],
});

const promptData: PromptData = {
  v: 3,
  kind: 'prompt',
  default: { prompt: 'a portrait', params: {} },
};

const gridData = (matchupKeys: string[], promptKeys: string[]): GridData => ({
  v: 1,
  kind: 'grid',
  matchupKeys,
  promptKeys,
});

function row(
  key: string,
  count: number,
  title: string,
  data: unknown,
  opts: { authorUserId?: number; viewerVoted?: boolean; body?: string } = {},
): SharedListItem {
  return {
    key,
    count,
    authorUserId: opts.authorUserId ?? OTHER_ID,
    viewerVoted: opts.viewerVoted ?? false,
    value: { title, body: opts.body ?? '', data },
    createdAt: new Date(0),
    updatedAt: new Date(0),
  } as unknown as SharedListItem;
}

/** SEVEN matchups and SIX prompts — both strictly more than `DEFAULT_TOP_N`, so
 * the Top Grid's cut is observable rather than vacuous. */
const MATCHUPS: SharedListItem[] = [
  row('mk-hotel', 14, 'Hotel', comboData('cfg-hotel')),
  row('mk-alpha', 91, 'Alpha', comboData('cfg-alpha')),
  row('mk-golf', 3, 'Golf', comboData('cfg-golf')),
  row('mk-delta', 47, 'Delta', comboData('cfg-delta')),
  row('mk-echo', 68, 'Echo', comboData('cfg-echo')),
  row('mk-bravo', 22, 'Bravo', comboData('cfg-bravo')),
  row('mk-foxtrot', 55, 'Foxtrot', comboData('cfg-foxtrot')),
];
const PROMPTS: SharedListItem[] = [
  row('qk-sierra', 8, 'Sierra', promptData),
  row('qk-tango', 76, 'Tango', promptData),
  row('qk-romeo', 31, 'Romeo', promptData),
  row('qk-victor', 64, 'Victor', promptData),
  row('qk-uniform', 19, 'Uniform', promptData),
  row('qk-whisky', 42, 'Whisky', promptData),
];

/** The vote counts a rendered vote/unvote resolves to. Deliberately unlike ANY
 * fixture count, so a button showing one of these can only have got it from the
 * host's answer. */
const VOTE_ANSWER = 123;
const UNVOTE_ANSWER = 7;

function sharedWithVotes(seed: SharedListItem[]) {
  const base = fakeShared({ seed });
  const votes: string[] = [];
  const unvotes: string[] = [];
  const shared: UseSharedStorage = {
    ...base.shared,
    async vote(key: string) {
      votes.push(key);
      return VOTE_ANSWER;
    },
    async unvote(key: string) {
      unvotes.push(key);
      return UNVOTE_ANSWER;
    },
  };
  return { ...base, shared, votes, unvotes };
}

function renderApp(deps: Partial<AppDeps>, viewer: { id: number; username: string } | null = { id: VIEWER_ID, username: 'me' }) {
  render(
    <Harness
      // 🔴 `null` is passed THROUGH, never coerced to `undefined`: the mock host
      // documents `viewer` as defaulting to a `dev-viewer`, so `undefined` gives
      // a SIGNED-IN viewer and the anon cases silently stop being anon cases.
      viewer={viewer}
      theme="dark"
      consentGranted
      buzzBudget={1000}
      buzz={{ balance: 5000 }}
      buzzBalance={{ blue: 0, green: 0, yellow: 5000 }}
      shared={{ seed: [] }}
      showLog={false}
    >
      <App
        deps={{ resolveResources: async () => [], pollIntervalMs: 0, sleep: immediateSleep, ...deps }}
      />
    </Harness>,
  );
}

/** The grid cards in the order the Community list renders them. */
const cardKeys = (): (string | null)[] =>
  screen.getAllByTestId('grid-card').map((el) => el.getAttribute('data-key'));

// ===========================================================================
// Criterion 9 — Grids is the default view, and the slider is gone
// ===========================================================================

describe('🔴 criterion 9: Grids is the DEFAULT view and the top-N slider is gone', () => {
  it('opens on the Grids view without anyone clicking a tab', async () => {
    renderApp({ shared: fakeShared({ seed: [...MATCHUPS, ...PROMPTS] }).shared, appStorage: fakeAppStorage().appStorage });

    expect(await screen.findByTestId('grid-view')).toBeInTheDocument();
    // …and ONLY that view: a default that also left a sibling mounted would put
    // two panels on screen at once.
    expect(screen.queryByTestId('matchups-view')).toBeNull();
    expect(screen.queryByTestId('prompts-view')).toBeNull();

    // The tab a human sees selected agrees with the panel that mounted.
    const strip = screen.getByTestId('view-switch');
    const selected = within(strip)
      .getAllByRole('tab')
      .filter((t) => t.getAttribute('aria-selected') === 'true');
    expect(selected).toHaveLength(1);
    expect(within(selected[0]!).getByTestId('view-switch-grid')).toBeInTheDocument();
  });

  it('🔴 renders NO "Show top N" control, and no such copy, anywhere in the app', async () => {
    renderApp({ shared: fakeShared({ seed: [...MATCHUPS, ...PROMPTS] }).shared, appStorage: fakeAppStorage().appStorage });
    await screen.findByTestId('grid-view');

    // The control's own testid is gone from the view it used to live in…
    expect(screen.queryByTestId('top-n')).toBeNull();
    // …and so is every string that described it. POSITIVE CONTROL below proves
    // this walk actually reads a populated DOM, so the three nulls above are not
    // three ways of saying "the app did not render".
    const html = document.body.innerHTML;
    expect(html).not.toContain('Show top N');
    expect(html).not.toContain("doesn't change the shared grid");
    expect(html).not.toContain('Change how many in the Grid tab');
    expect(document.querySelectorAll('[data-civitai-ui-range]')).toHaveLength(0);

    // POSITIVE CONTROL for all four assertions above.
    expect(html.length).toBeGreaterThan(2000);
    expect(screen.getAllByTestId('grid-card').length).toBeGreaterThan(0);

    // The other two views carry no such control either.
    await openView('Matchups');
    expect(screen.queryByTestId('top-n')).toBeNull();
    expect(document.body.innerHTML).not.toContain('Show top N');
    await openView('Prompts');
    expect(screen.queryByTestId('top-n')).toBeNull();
    expect(document.body.innerHTML).not.toContain('Show top N');
  });
});

// ===========================================================================
// Criterion 10 — the Top Grid
// ===========================================================================

describe('🔴 criterion 10: the system-owned Top Grid', () => {
  it(`is DEFAULT_TOP_N top-voted matchups × DEFAULT_TOP_N top-voted prompts`, async () => {
    renderApp({ shared: fakeShared({ seed: [...MATCHUPS, ...PROMPTS] }).shared, appStorage: fakeAppStorage().appStorage });
    await screen.findByTestId('grid-view');

    // PREMISE: the board holds MORE than the Top Grid can, so the cut is real.
    expect(MATCHUPS.length).toBeGreaterThan(DEFAULT_TOP_N);
    expect(PROMPTS.length).toBeGreaterThan(DEFAULT_TOP_N);

    const top = await waitFor(() => {
      const card = screen.getAllByTestId('grid-card')[0];
      expect(within(card).getByTestId('grid-card-members')).toHaveTextContent(/matchups/);
      return card;
    });
    // The count is read from the imported constant, never spelled as 5.
    expect(within(top).getByTestId('grid-card-members')).toHaveTextContent(
      `${DEFAULT_TOP_N} matchups × ${DEFAULT_TOP_N} prompts`,
    );

    // And the OPEN matrix renders exactly those rows — the top five by votes
    // (91, 68, 55, 47, 22), not the seven on the board and not the seed order.
    // The row group header carries the matchup's NAME, so read it there.
    const matrix = await screen.findByTestId('results-grid');
    const groups = within(matrix)
      .getAllByTestId('grid-group-matchup')
      .map((el) => el.textContent ?? '');
    expect(groups).toHaveLength(DEFAULT_TOP_N);
    for (const name of ['Alpha', 'Echo', 'Foxtrot', 'Delta', 'Bravo']) {
      expect(groups.some((g) => g.includes(name)), `${name} is not a row`).toBe(true);
    }
    // Hotel (14) and Golf (3) fall outside the cut.
    expect(groups.some((g) => g.includes('Hotel'))).toBe(false);
    expect(groups.some((g) => g.includes('Golf'))).toBe(false);
  });

  it('🔴 is PINNED FIRST and carries NO vote control, because it has no shared row', async () => {
    // A published grid with far more votes than anything else: if the Top Grid
    // were folded into the ordering with an invented count it would land BELOW
    // this row, which is exactly the fake position the criterion forbids.
    const seed = [
      ...MATCHUPS,
      ...PROMPTS,
      row('gk-zulu', 40, 'Loud grid', gridData(['mk-alpha'], ['qk-tango'])),
    ];
    renderApp({ shared: fakeShared({ seed }).shared, appStorage: fakeAppStorage().appStorage });
    await screen.findByTestId('grid-view');

    await waitFor(() => expect(screen.getAllByTestId('grid-card')).toHaveLength(2));
    const [first, second] = screen.getAllByTestId('grid-card');

    expect(within(first).getByTestId('grid-system-badge')).toBeInTheDocument();
    expect(within(first).getByTestId('grid-card-name')).toHaveTextContent(TOP_GRID_NAME);
    expect(second.getAttribute('data-key')).toBe('gk-zulu');

    // 🔴 NO vote control at all — not a disabled one. A greyed button would imply
    // that somebody, somewhere, can vote on it; nobody can.
    expect(within(first).queryByTestId('grid-vote')).toBeNull();
    // The published grid next to it HAS one, so the absence above is a property
    // of the system entry and not of the card template.
    expect(within(second).getByTestId('grid-vote')).toBeInTheDocument();

    // …and it says so in words, next to the card.
    expect(within(first).getByTestId('grid-system-note')).toHaveTextContent(
      /cannot be voted on and it is not part of the vote order/i,
    );
  });

  it('offers no author affordances on the Top Grid — there is no author', async () => {
    renderApp({ shared: fakeShared({ seed: [...MATCHUPS, ...PROMPTS] }).shared, appStorage: fakeAppStorage().appStorage });
    const first = (await screen.findAllByTestId('grid-card'))[0];
    expect(within(first).queryByTestId('grid-withdraw')).toBeNull();
    expect(within(first).queryByTestId('grid-report')).toBeNull();
  });
});

// ===========================================================================
// Criterion 11 — grid votes and the Community ordering
// ===========================================================================

describe('🔴 criterion 11: grid votes, hydrated from the host and ordered by count', () => {
  // Four published grids. Seed order is neither the answer nor its reverse, the
  // 9-tie forces the deterministic key tie-break to do real work, and the
  // answer's order differs from plain key order too.
  const GRID_ROWS = [
    row('gk-bravo', 9, 'Bravo grid', gridData(['mk-alpha'], ['qk-tango'])),
    row('gk-alpha', 9, 'Alpha grid', gridData(['mk-echo'], ['qk-whisky'])),
    row('gk-mike', 2, 'Mike grid', gridData(['mk-delta'], ['qk-victor'])),
    row('gk-zulu', 40, 'Zulu grid', gridData(['mk-bravo'], ['qk-romeo'])),
  ];

  it('orders Community Grids by count DESCENDING, ties broken by key', async () => {
    renderApp({ shared: fakeShared({ seed: [...MATCHUPS, ...PROMPTS, ...GRID_ROWS] }).shared, appStorage: fakeAppStorage().appStorage });
    await screen.findByTestId('grid-view');
    await waitFor(() => expect(screen.getAllByTestId('grid-card')).toHaveLength(5));

    // Entry 0 is the pinned system grid; the rest are the vote order.
    expect(cardKeys()).toEqual(['__system__', 'gk-zulu', 'gk-alpha', 'gk-bravo', 'gk-mike']);

    // CONTROLS: the rendered order is neither the seed order nor key order, so
    // a no-op and a key-sort are both distinguishable from the real ordering.
    expect(cardKeys().slice(1)).not.toEqual(GRID_ROWS.map((r) => r.key));
    expect(cardKeys().slice(1)).not.toEqual([...GRID_ROWS.map((r) => r.key)].sort());
  });

  it('🔴 hydrates each vote button from the ROW’s viewerVoted, in BOTH states', async () => {
    const seed = [
      ...MATCHUPS,
      ...PROMPTS,
      row('gk-voted', 30, 'Voted grid', gridData(['mk-alpha'], ['qk-tango']), { viewerVoted: true }),
      row('gk-unvoted', 11, 'Unvoted grid', gridData(['mk-echo'], ['qk-whisky']), { viewerVoted: false }),
    ];
    // 🔴 EMPTY per-viewer KV: the highlight can only have come from the row.
    const { appStorage, store } = fakeAppStorage();
    renderApp({ shared: sharedWithVotes(seed).shared, appStorage });
    await screen.findByTestId('grid-view');
    await waitFor(() => expect(screen.getAllByTestId('grid-card')).toHaveLength(3));

    const voted = screen.getAllByTestId('grid-card').find((el) => el.getAttribute('data-key') === 'gk-voted')!;
    const unvoted = screen.getAllByTestId('grid-card').find((el) => el.getAttribute('data-key') === 'gk-unvoted')!;

    const votedBtn = within(voted).getByTestId('grid-vote');
    const unvotedBtn = within(unvoted).getByTestId('grid-vote');
    expect(votedBtn).toHaveAttribute('aria-pressed', 'true');
    expect(unvotedBtn).toHaveAttribute('aria-pressed', 'false');
    // `aria-pressed` in BOTH states, so the attribute is not merely present.
    expect(votedBtn.getAttribute('aria-pressed')).not.toBe(unvotedBtn.getAttribute('aria-pressed'));

    // PREMISE for "hydrated from the row": nothing was read out of per-viewer KV.
    expect([...store.keys()]).toEqual([]);
  });

  it('votes through shared.vote on the GRID row and takes the host’s count', async () => {
    const seed = [
      ...MATCHUPS,
      ...PROMPTS,
      row('gk-target', 11, 'Target grid', gridData(['mk-alpha'], ['qk-tango']), { viewerVoted: false }),
      row('gk-other', 30, 'Other grid', gridData(['mk-echo'], ['qk-whisky']), { viewerVoted: false }),
    ];
    const s = sharedWithVotes(seed);
    const track = vi.fn();
    renderApp({ shared: s.shared, appStorage: fakeAppStorage().appStorage, track });
    await screen.findByTestId('grid-view');
    await waitFor(() => expect(screen.getAllByTestId('grid-card')).toHaveLength(3));

    const target = screen.getAllByTestId('grid-card').find((el) => el.getAttribute('data-key') === 'gk-target')!;
    await userEvent.click(within(target).getByTestId('grid-vote'));

    // The GRID's own key — not a member's, and not the other grid's.
    expect(s.votes).toEqual(['gk-target']);
    expect(s.unvotes).toEqual([]);
    await waitFor(() =>
      expect(within(target).getByTestId('vote-count')).toHaveTextContent(String(VOTE_ANSWER)),
    );
    expect(within(target).getByTestId('grid-vote')).toHaveAttribute('aria-pressed', 'true');
    expect(track).toHaveBeenCalledWith('vote');
  });

  it('🔴 a row the viewer ALREADY voted on UNVOTES on the first click', async () => {
    // The double-click-to-unvote bug: a button that ignored `viewerVoted` and
    // started from local `false` would send a second VOTE here and need a second
    // click to undo. Exactly one click, and it must be an unvote.
    const seed = [
      ...MATCHUPS,
      ...PROMPTS,
      row('gk-mine', 30, 'Already voted', gridData(['mk-alpha'], ['qk-tango']), { viewerVoted: true }),
    ];
    const s = sharedWithVotes(seed);
    renderApp({ shared: s.shared, appStorage: fakeAppStorage().appStorage });
    await screen.findByTestId('grid-view');
    await waitFor(() => expect(screen.getAllByTestId('grid-card')).toHaveLength(2));

    const card = screen.getAllByTestId('grid-card').find((el) => el.getAttribute('data-key') === 'gk-mine')!;
    await userEvent.click(within(card).getByTestId('grid-vote'));

    expect(s.unvotes).toEqual(['gk-mine']);
    expect(s.votes).toEqual([]);
    await waitFor(() =>
      expect(within(card).getByTestId('vote-count')).toHaveTextContent(String(UNVOTE_ANSWER)),
    );
    expect(within(card).getByTestId('grid-vote')).toHaveAttribute('aria-pressed', 'false');
  });
});

// ===========================================================================
// Criterion 8 — dangling references
// ===========================================================================

describe('🔴 criterion 8: a grid whose members were withdrawn', () => {
  // ASYMMETRIC by construction: 4 authored rows of which 3 survive, 8 authored
  // columns of which 2 survive. Every number in the assertions (3, 1, 2, 6, 7,
  // 12) is distinct from every other, so a correct count and its inverse cannot
  // both satisfy the case.
  const DANGLING = row(
    'gk-dangling',
    17,
    'Half-gone grid',
    gridData(
      ['mk-alpha', 'mk-withdrawn-1', 'mk-echo', 'mk-bravo'],
      [
        'qk-tango',
        'qk-withdrawn-1',
        'qk-withdrawn-2',
        'qk-whisky',
        'qk-withdrawn-3',
        'qk-withdrawn-4',
        'qk-withdrawn-5',
        'qk-withdrawn-6',
      ],
    ),
  );

  async function openDangling() {
    renderApp({ shared: fakeShared({ seed: [...MATCHUPS, ...PROMPTS, DANGLING] }).shared, appStorage: fakeAppStorage().appStorage });
    await screen.findByTestId('grid-view');
    const card = await waitFor(() =>
      screen.getAllByTestId('grid-card').find((el) => el.getAttribute('data-key') === 'gk-dangling')!,
    );
    return card;
  }

  it('renders the SURVIVING members and does not throw', async () => {
    const card = await openDangling();
    // 3 of 4 rows, 2 of 8 columns — counted from what is on the board, never
    // from the authored length.
    expect(within(card).getByTestId('grid-card-members')).toHaveTextContent('3 matchups × 2 prompts');

    await userEvent.click(within(card).getByTestId('grid-open'));
    const matrix = await screen.findByTestId('results-grid');
    const rows = within(matrix).getAllByTestId('grid-group-matchup').map((el) => el.textContent ?? '');
    expect(rows).toHaveLength(3);
    for (const name of ['Alpha', 'Echo', 'Bravo']) {
      expect(rows.some((r) => r.includes(name)), `${name} is not a row`).toBe(true);
    }
    const cols = within(matrix).getAllByTestId('grid-col-header').map((el) => el.textContent ?? '');
    expect(cols).toHaveLength(2);
    expect(cols.some((c) => c.includes('Tango'))).toBe(true);
    expect(cols.some((c) => c.includes('Whisky'))).toBe(true);
    // Nothing invented in place of the missing members.
    expect(within(matrix).queryByText(/withdrawn/i)).toBeNull();
  });

  it('🔴 DISCLOSES the count of what is gone — it does not silently render shorter', async () => {
    const card = await openDangling();

    // On the CARD, where it is listed…
    expect(within(card).getByTestId('grid-card-missing')).toHaveTextContent(
      "7 of this grid's 12 members (1 row, 6 columns) are no longer on the board",
    );

    // …and on the OPEN grid, as a warning next to the matrix.
    await userEvent.click(within(card).getByTestId('grid-open'));
    const notice = await screen.findByTestId('grid-missing-notice');
    expect(notice).toHaveTextContent(
      "7 of this grid's 12 members (1 row, 6 columns) are no longer on the board — " +
        'their authors removed them. Everything else below still renders; nothing was quietly dropped.',
    );
  });

  it('NEGATIVE CONTROL: an intact grid shows no missing notice at all', async () => {
    const intact = row('gk-intact', 17, 'Intact grid', gridData(['mk-alpha', 'mk-echo'], ['qk-tango']));
    renderApp({ shared: fakeShared({ seed: [...MATCHUPS, ...PROMPTS, intact] }).shared, appStorage: fakeAppStorage().appStorage });
    await screen.findByTestId('grid-view');

    const card = await waitFor(() =>
      screen.getAllByTestId('grid-card').find((el) => el.getAttribute('data-key') === 'gk-intact')!,
    );
    expect(within(card).getByTestId('grid-card-members')).toHaveTextContent('2 matchups × 1 prompt');
    expect(within(card).queryByTestId('grid-card-missing')).toBeNull();

    await userEvent.click(within(card).getByTestId('grid-open'));
    await screen.findByTestId('results-grid');
    expect(screen.queryByTestId('grid-missing-notice')).toBeNull();
  });

  it('survives a grid whose members are ALL gone — empty, disclosed, still no throw', async () => {
    const orphan = row('gk-orphan', 4, 'Orphan grid', gridData(['mk-nope-a', 'mk-nope-b'], ['qk-nope-c']));
    renderApp({ shared: fakeShared({ seed: [...MATCHUPS, ...PROMPTS, orphan] }).shared, appStorage: fakeAppStorage().appStorage });
    await screen.findByTestId('grid-view');

    const card = await waitFor(() =>
      screen.getAllByTestId('grid-card').find((el) => el.getAttribute('data-key') === 'gk-orphan')!,
    );
    expect(within(card).getByTestId('grid-card-members')).toHaveTextContent('0 matchups × 0 prompts');
    expect(within(card).getByTestId('grid-card-missing')).toHaveTextContent(
      "3 of this grid's 3 members (2 rows, 1 column) are no longer on the board",
    );

    await userEvent.click(within(card).getByTestId('grid-open'));
    // The matrix's own empty state, not a crash and not a blank panel.
    expect(await screen.findByTestId('grid-empty')).toBeInTheDocument();
    expect(await screen.findByTestId('grid-missing-notice')).toBeInTheDocument();
  });
});

// ===========================================================================
// The private → publish boundary, for grids
// ===========================================================================

describe('a grid is built PRIVATELY and published as one explicit step', () => {
  it('🔴 saves to per-viewer KV under unpub:grid:v1: with ZERO shared writes', async () => {
    const s = fakeShared({ seed: [...MATCHUPS, ...PROMPTS] });
    const { appStorage, sets } = fakeAppStorage();
    renderApp({ shared: s.shared, appStorage });
    await screen.findByTestId('grid-view');

    await userEvent.click(await screen.findByTestId('grid-new'));
    const form = await screen.findByTestId('grid-form');
    await userEvent.type(within(form).getByTestId('grid-form-name'), 'My sweep');

    // Rows.
    await userEvent.click(within(form).getByTestId('grid-form-pick-rows'));
    const rowPicker = await screen.findByTestId('grid-pick-rows');
    const rowOption = within(rowPicker)
      .getAllByTestId('grid-pick-rows-option')
      .find((el) => el.getAttribute('data-key') === 'mk-echo')!;
    await userEvent.click(rowOption);
    await userEvent.click(within(rowPicker).getByTestId('grid-pick-rows-confirm'));

    // Columns.
    await userEvent.click(within(form).getByTestId('grid-form-pick-cols'));
    const colPicker = await screen.findByTestId('grid-pick-cols');
    const colOption = within(colPicker)
      .getAllByTestId('grid-pick-cols-option')
      .find((el) => el.getAttribute('data-key') === 'qk-whisky')!;
    await userEvent.click(colOption);
    await userEvent.click(within(colPicker).getByTestId('grid-pick-cols-confirm'));

    await userEvent.click(within(form).getByTestId('grid-form-submit'));

    await waitFor(() => expect(sets.some((w) => w.key.startsWith(UNPUB_GRID_PREFIX))).toBe(true));
    const written = sets.find((w) => w.key.startsWith(UNPUB_GRID_PREFIX))!;
    expect(written.value).toMatchObject({
      v: 1,
      name: 'My sweep',
      matchupKeys: ['mk-echo'],
      promptKeys: ['qk-whisky'],
    });

    // 🔴 THE BOUNDARY: nothing reached the public board.
    expect(s.appends).toEqual([]);
  });

  it('POSITIVE CONTROL: Publish appends exactly one `kind: grid` row and keeps the pointer', async () => {
    const s = fakeShared({ seed: [...MATCHUPS, ...PROMPTS] });
    const { appStorage, sets } = fakeAppStorage({
      'unpub:grid:v1:gl-seeded': {
        v: 1,
        localId: 'gl-seeded',
        name: 'Seeded sweep',
        description: 'two rows, one column',
        matchupKeys: ['mk-alpha', 'mk-echo'],
        promptKeys: ['qk-tango'],
        updatedAt: '2026-09-06T00:00:00.000Z',
      },
    });
    renderApp({ shared: s.shared, appStorage });
    await screen.findByTestId('grid-view');

    await userEvent.click(await screen.findByTestId('subtab-my'));
    const unpublished = await screen.findByTestId('unpublished-card');
    expect(within(unpublished).getByTestId('unpublished-meta')).toHaveTextContent('2 × 1');
    await userEvent.click(within(unpublished).getByTestId('unpublished-publish'));

    await waitFor(() => expect(s.appends).toHaveLength(1));
    const appended = s.appends[0] as { title: string; body: string; data: Record<string, unknown> };
    // 🔴 The moderation split: author prose in title/body, STRUCTURE ONLY in data.
    expect(appended.title).toBe('Seeded sweep');
    expect(appended.body).toBe('two rows, one column');
    expect(appended.data).toEqual({
      v: 1,
      kind: 'grid',
      matchupKeys: ['mk-alpha', 'mk-echo'],
      promptKeys: ['qk-tango'],
    });
    expect(Object.keys(appended.data)).not.toContain('name');
    expect(Object.keys(appended.data)).not.toContain('description');

    // The private record is KEPT, rewritten to the pointer at the row it became.
    await waitFor(() => {
      const pointer = sets.find(
        (w) => w.key === 'unpub:grid:v1:gl-seeded' && (w.value as { sharedKey?: string }).sharedKey,
      );
      expect(pointer, 'no pointer written').toBeTruthy();
    });
  });
});

// ===========================================================================
// The anonymous viewer
// ===========================================================================

describe('🔴 an anonymous viewer gets a readable Community and no rejecting write', () => {
  const seed = [
    ...MATCHUPS,
    ...PROMPTS,
    row('gk-public', 30, 'Public grid', gridData(['mk-alpha'], ['qk-tango']), { authorUserId: OTHER_ID }),
  ];

  it('reads Community Grids, and gets a sign-in prompt instead of a My list', async () => {
    const s = sharedWithVotes(seed);
    const { appStorage, setAttempts } = fakeAppStorage();
    renderApp({ shared: s.shared, appStorage }, null);
    await screen.findByTestId('grid-view');

    // The Top Grid AND the published grid are both readable.
    await waitFor(() => expect(screen.getAllByTestId('grid-card')).toHaveLength(2));
    expect(cardKeys()).toEqual(['__system__', 'gk-public']);
    expect(await screen.findByTestId('results-grid')).toBeInTheDocument();

    // No create affordance: `appStorage.set` rejects for an anonymous viewer, so
    // a New-grid button here could only ever produce an unhandled rejection.
    expect(screen.queryByTestId('grid-new')).toBeNull();

    await userEvent.click(screen.getByTestId('subtab-my'));
    expect(await screen.findByTestId('my-signed-out')).toBeInTheDocument();
    expect(screen.queryByTestId('unpublished-panel')).toBeNull();

    // 🔴 NOT ONE WRITE ATTEMPTED, per-viewer or shared, on anything it offered.
    expect(setAttempts).toEqual([]);
    expect(s.appends).toEqual([]);
    expect(s.withdraws).toEqual([]);
    expect(s.updates).toEqual([]);
  });

  it('🔴 the vote control asks them to sign in instead of calling the host', async () => {
    const s = sharedWithVotes(seed);
    const requestSignIn = vi.fn();
    renderApp({ shared: s.shared, appStorage: fakeAppStorage().appStorage, requestSignIn }, null);
    await screen.findByTestId('grid-view');
    await waitFor(() => expect(screen.getAllByTestId('grid-card')).toHaveLength(2));

    const card = screen.getAllByTestId('grid-card').find((el) => el.getAttribute('data-key') === 'gk-public')!;
    const btn = within(card).getByTestId('grid-vote');
    // Present and hydrated as not-voted, so the affordance is READABLE…
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(btn);

    // …but the click is a sign-in nudge, and the host was never asked.
    expect(requestSignIn).toHaveBeenCalledTimes(1);
    expect(s.votes).toEqual([]);
    expect(s.unvotes).toEqual([]);
  });

  it('offers no report affordance either — the host rejects an anonymous report', async () => {
    const s = sharedWithVotes(seed);
    renderApp({ shared: s.shared, appStorage: fakeAppStorage().appStorage }, null);
    await screen.findByTestId('grid-view');
    await waitFor(() => expect(screen.getAllByTestId('grid-card')).toHaveLength(2));

    const card = screen.getAllByTestId('grid-card').find((el) => el.getAttribute('data-key') === 'gk-public')!;
    expect(within(card).queryByTestId('grid-report')).toBeNull();
    expect(s.reports).toEqual([]);
  });
});

// ===========================================================================
// The author's own grids: My / Community, archive, remove
// ===========================================================================

describe('the My / Community partition for grids (§11.1)', () => {
  const MINE = row('gk-mine', 30, 'My grid', gridData(['mk-alpha'], ['qk-tango']), { authorUserId: VIEWER_ID });
  const THEIRS = row('gk-theirs', 11, 'Their grid', gridData(['mk-echo'], ['qk-whisky']), { authorUserId: OTHER_ID });

  it('shows an authored grid under My AND in Community, with Remove only on My own', async () => {
    renderApp({ shared: fakeShared({ seed: [...MATCHUPS, ...PROMPTS, MINE, THEIRS] }).shared, appStorage: fakeAppStorage().appStorage });
    await screen.findByTestId('grid-view');
    await waitFor(() => expect(screen.getAllByTestId('grid-card')).toHaveLength(3));

    // Community keeps the viewer's own row, ranked the way everyone sees it.
    expect(cardKeys()).toEqual(['__system__', 'gk-mine', 'gk-theirs']);
    const mineInCommunity = screen.getAllByTestId('grid-card').find((el) => el.getAttribute('data-key') === 'gk-mine')!;
    const theirsInCommunity = screen.getAllByTestId('grid-card').find((el) => el.getAttribute('data-key') === 'gk-theirs')!;
    expect(within(mineInCommunity).getByTestId('grid-withdraw')).toBeInTheDocument();
    expect(within(mineInCommunity).queryByTestId('grid-report')).toBeNull();
    expect(within(theirsInCommunity).queryByTestId('grid-withdraw')).toBeNull();
    expect(within(theirsInCommunity).getByTestId('grid-report')).toBeInTheDocument();

    // My holds the authored row ONLY.
    await userEvent.click(screen.getByTestId('subtab-my'));
    await waitFor(() => expect(cardKeys()).toEqual(['gk-mine']));
  });

  it('archives an own grid out of My while it stays in Community, and says so', async () => {
    const { appStorage, sets } = fakeAppStorage();
    renderApp({ shared: fakeShared({ seed: [...MATCHUPS, ...PROMPTS, MINE, THEIRS] }).shared, appStorage });
    await screen.findByTestId('grid-view');
    await userEvent.click(await screen.findByTestId('subtab-my'));
    await waitFor(() => expect(cardKeys()).toEqual(['gk-mine']));

    await userEvent.click(screen.getByTestId('archive-action'));
    await waitFor(() => expect(screen.queryByTestId('grid-card')).toBeNull());
    // The honest wording is not there to be found once the list is empty, but
    // the archived row is still on the board and still in Community.
    await waitFor(() => expect(sets.some((w) => w.key === 'archive:v1')).toBe(true));
    expect(sets.find((w) => w.key === 'archive:v1')!.value).toEqual(['gk-mine']);

    await userEvent.click(screen.getByTestId('subtab-community'));
    await waitFor(() => expect(cardKeys()).toEqual(['__system__', 'gk-mine', 'gk-theirs']));
  });

  it('withdraws an own grid on confirm, and touches NO member row', async () => {
    const s = fakeShared({ seed: [...MATCHUPS, ...PROMPTS, MINE, THEIRS] });
    renderApp({ shared: s.shared, appStorage: fakeAppStorage().appStorage });
    await screen.findByTestId('grid-view');
    await waitFor(() => expect(screen.getAllByTestId('grid-card')).toHaveLength(3));

    const mine = screen.getAllByTestId('grid-card').find((el) => el.getAttribute('data-key') === 'gk-mine')!;
    await userEvent.click(within(mine).getByTestId('grid-withdraw'));
    // Confirm-before-firing: arming alone tells the store nothing.
    expect(s.withdraws).toEqual([]);
    await userEvent.click(within(mine).getByTestId('withdraw-confirm'));

    // 🔴 EXACTLY the grid's key. A grid's members belong to other authors and
    // `withdraw` is author-scoped; removing a grid must never reach them.
    await waitFor(() => expect(s.withdraws).toEqual(['gk-mine']));
    await waitFor(() => expect(cardKeys()).toEqual(['__system__', 'gk-theirs']));
    // The member rows are all still on the board.
    await openView('Matchups');
    await waitFor(() => expect(screen.getAllByTestId('matchup-card')).toHaveLength(MATCHUPS.length));
  });
});
