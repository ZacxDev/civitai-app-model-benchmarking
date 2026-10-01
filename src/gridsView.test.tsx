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

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Harness } from './test-harness.js';
import type { SharedItem } from '@civitai/sdk';
import type { SharedStore } from './lib/sdk-runtime.js';

import { App, type AppDeps } from './App.js';
import { DEFAULT_TOP_N } from './lib/benchmark.js';
import { UNPUB_GRID_PREFIX } from './lib/grids.js';
import { TOP_GRID_NAME } from './lib/gridEntries.js';
import {
  contribute,
  fakeAppStorage,
  fakeShared,
  immediateSleep,
  openMyList,
  openView,
} from './test-helpers.js';
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
): SharedItem {
  return {
    key,
    count,
    authorUserId: opts.authorUserId ?? OTHER_ID,
    viewerVoted: opts.viewerVoted ?? false,
    value: { title, body: opts.body ?? '', data },
    createdAt: new Date(0),
    updatedAt: new Date(0),
  } as unknown as SharedItem;
}

/** SEVEN matchups and SIX prompts — both strictly more than `DEFAULT_TOP_N`, so
 * the Top Grid's cut is observable rather than vacuous. */
const MATCHUPS: SharedItem[] = [
  row('mk-hotel', 14, 'Hotel', comboData('cfg-hotel')),
  row('mk-alpha', 91, 'Alpha', comboData('cfg-alpha')),
  row('mk-golf', 3, 'Golf', comboData('cfg-golf')),
  row('mk-delta', 47, 'Delta', comboData('cfg-delta')),
  row('mk-echo', 68, 'Echo', comboData('cfg-echo')),
  row('mk-bravo', 22, 'Bravo', comboData('cfg-bravo')),
  row('mk-foxtrot', 55, 'Foxtrot', comboData('cfg-foxtrot')),
];
const PROMPTS: SharedItem[] = [
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

function sharedWithVotes(seed: SharedItem[]) {
  const base = fakeShared({ seed });
  const votes: string[] = [];
  const unvotes: string[] = [];
  const shared: SharedStore = {
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

/**
 * The grid cards in the order the all-grids list renders them.
 *
 * 🔴 THE OPEN GRID IS NOT AMONG THEM. It renders in full in `grid-open-panel`
 * above the list, so listing it too was a card whose only content was "Shown in
 * full above". The DEFAULT open grid is the Top Grid, so `'__system__'` is absent
 * from this array on a default load and PRESENT the moment another grid is opened
 * — which is what the swap cases below read.
 */
const cardKeys = (): (string | null)[] =>
  screen.getAllByTestId('grid-card').map((el) => el.getAttribute('data-key'));

/** Open the listed grid with this key, so the previously-open one joins the list. */
async function openListed(key: string): Promise<void> {
  const target = screen.getAllByTestId('grid-card').find((el) => el.getAttribute('data-key') === key);
  if (!target) throw new Error(`no listed grid card for ${key}`);
  await userEvent.click(within(target).getByTestId('grid-open'));
}

// ===========================================================================
// Criterion 9 — Grids is the default view, and the slider is gone
// ===========================================================================

describe('🔴 criterion 9: the grid is FIRST on the page, and the top-N slider is gone', () => {
  // ⚠ WHAT THIS CASE USED TO ASSERT. It read "Grids is the DEFAULT view": the
  // grids panel mounted, the matchup and prompt panels did NOT, and the strip's
  // selected tab agreed. All three halves rested on there BEING a top-level tab
  // strip with exactly one live view — which the IA refactor deleted. The
  // criterion behind it (§11.5: the thing the block is FOR must not be behind a
  // click) survives and is now satisfied more strongly, so what is asserted is
  // the stronger fact: every section is mounted, and the grid is the FIRST of
  // them. The two absence assertions are deliberately inverted rather than
  // dropped — their subject is now presence.
  it('renders the grid and its matrix on FIRST PAINT, with no navigation at all', async () => {
    renderApp({ shared: fakeShared({ seed: [...MATCHUPS, ...PROMPTS] }).shared, appStorage: fakeAppStorage().appStorage });

    // 🔴 THE CRITERION ITSELF, and it is the part that survived every IA generation:
    // the thing the block is FOR must not be behind a click. The grid and its runnable
    // matrix are on screen with nothing pressed.
    expect(await screen.findByTestId('grid-view')).toBeInTheDocument();
    expect(await screen.findByTestId('results-grid')).toBeInTheDocument();

    // …and it is FIRST. Asserted by DOM order over the section markers, not by a
    // testid that a reorder would leave untouched. The default Home surface is the
    // open grid followed by the GRIDS board.
    const order = Array.from(
      screen.getByTestId('app-content').querySelectorAll('[data-mb-section]'),
    ).map((el) => el.getAttribute('data-mb-section'));
    expect(order).toEqual(['open-grid', 'grids']);

    // ⚠️ AND THIS IS WHERE THE CLAIM WEAKENED, DELIBERATELY. The previous generation
    // asserted `['grids','matchups','prompts']` — all three community boards mounted
    // at once, nothing behind a click at all. One board is mounted now, so the other
    // two are ABSENT from the DOM rather than below the fold. That is the trade the
    // board subnav buys (the three-section page came to 2166 CSS px and the host
    // iframe clipped two of them out of every screenshot); it is a real reduction in
    // what one frame shows, and it is asserted as an absence rather than glossed.
    expect(screen.queryByTestId('section-matchups')).toBeNull();
    expect(screen.queryByTestId('section-prompts')).toBeNull();
    // Both are ONE press away, and the press is a named landmark rather than a tab
    // whose position matters.
    expect(screen.getByTestId('board-nav-matchups')).toBeInTheDocument();
    expect(screen.getByTestId('board-nav-prompts')).toBeInTheDocument();

    // 🔴 AND THE OLD TOP-LEVEL STRIP IS STILL GONE — not merely unused. A shim tab
    // left in the DOM would satisfy every assertion above.
    expect(screen.queryByTestId('view-switch')).toBeNull();
    expect(screen.queryAllByTestId('view-switch-grid')).toEqual([]);
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
    //
    // ⚠️ IT USED TO COUNT `grid-card`s, and this seed has NONE: the board carries no
    // published grid, and the Top Grid — which used to be entry 0 of the list — is
    // the OPEN grid now and therefore unlisted. A zero there is the correct DOM, so
    // the control moves to landmarks that are unconditional on this surface.
    expect(html.length).toBeGreaterThan(2000);
    expect(screen.getByTestId('grid-open-title')).toHaveTextContent(TOP_GRID_NAME);
    expect(screen.getByTestId('grids-list')).toBeInTheDocument();
    expect(screen.getAllByTestId('grid-group-matchup').length).toBeGreaterThan(0);

    // The other two sections carry no such control either — and they are already
    // mounted, so this is one frame rather than two navigations.
    expect(within(await openView('Matchups')).queryByTestId('top-n')).toBeNull();
    expect(within(await openView('Prompts')).queryByTestId('top-n')).toBeNull();
    expect(document.body.innerHTML).not.toContain('Show top N');
  });
});

// ===========================================================================
// Criterion 10 — the Top Grid
// ===========================================================================

describe('🔴 criterion 10: the system-owned Top Grid', () => {
  /** One published grid, so the Top Grid can be pushed into the list by opening it. */
  const OTHER = row('gk-yank', 2, 'Yankee grid', gridData(['mk-alpha'], ['qk-tango']));

  it(`is DEFAULT_TOP_N top-voted matchups × DEFAULT_TOP_N top-voted prompts`, async () => {
    renderApp({ shared: fakeShared({ seed: [...MATCHUPS, ...PROMPTS, OTHER] }).shared, appStorage: fakeAppStorage().appStorage });
    await screen.findByTestId('grid-view');

    // PREMISE: the board holds MORE than the Top Grid can, so the cut is real.
    expect(MATCHUPS.length).toBeGreaterThan(DEFAULT_TOP_N);
    expect(PROMPTS.length).toBeGreaterThan(DEFAULT_TOP_N);

    // 🔴 THE TOP GRID IS THE OPEN PANEL, NOT A CARD — it used to be read as
    // `getAllByTestId('grid-card')[0]`, which is exactly the coupling the change
    // under test breaks: the open grid is no longer listed.
    expect(await screen.findByTestId('grid-open-title')).toHaveTextContent(TOP_GRID_NAME);
    expect(screen.getByTestId('grid-open-system-note')).toBeInTheDocument();

    // The OPEN matrix renders exactly those rows — the top five by votes
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

    // 🔴 …AND THE MEMBER SUMMARY, ON THE OPEN PANEL, WHERE IT NOW LIVES. This is the
    // DEFAULT surface: no click, nothing else published needed. It had to be added —
    // excluding the open grid from the list removed the only place its count rendered,
    // so on a default load the Top Grid's size was stated NOWHERE on the page. The
    // count is read from the imported constant, never spelled as 5.
    expect(screen.getByTestId('grid-open-members')).toHaveTextContent(
      `${DEFAULT_TOP_N} matchups × ${DEFAULT_TOP_N} prompts`,
    );

    // …and the CARD still carries it once the Top Grid is listed, which is a second
    // surface and not a duplicate assertion: open the published grid so the Top Grid
    // takes its place in the list. Kept rather than replaced — the panel assertion
    // above cannot see a card that stopped rendering the badge.
    await waitFor(() => expect(cardKeys()).toEqual(['gk-yank']));
    await openListed('gk-yank');
    const top = await waitFor(() =>
      screen.getAllByTestId('grid-card').find((el) => el.getAttribute('data-key') === '__system__')!,
    );
    expect(within(top).getByTestId('grid-card-members')).toHaveTextContent(
      `${DEFAULT_TOP_N} matchups × ${DEFAULT_TOP_N} prompts`,
    );
    // 🔴 AND THE PANEL NOW SHOWS THE *OTHER* GRID'S COUNT, not a frozen Top Grid one.
    // `gk-yank` is 1 × 1, so a `members` prop wired to a constant — or to the Top Grid
    // regardless of what is open — fails here. Without this the assertion above is
    // satisfiable by a hardcoded string.
    expect(screen.getByTestId('grid-open-members')).toHaveTextContent('1 matchup × 1 prompt');
  });

  it('🔴 SEAM: the App feeds the boards the SAME included count the Top Grid is built from', async () => {
    // 🔴 THIS CASE EXISTS BECAUSE A MUTANT SURVIVED. `App` derives `includedCombos` /
    // `includedPrompts` once and uses them for BOTH the Top Grid's members and the
    // boards' "The top N by votes are showing as the grid's rows/columns" copy — the
    // whole point of one computation being that the badge and the grid cannot disagree.
    // Nothing asserted the second half through the App: MEASURED, replacing BOTH
    // `includedCount={includedCombos.length}` call sites with `includedCount={0}` left
    // the FULL suite green (58 files / 776 tests). `IncludedSummary.test.tsx` renders
    // the views directly and passes its own number, so it is structurally blind to the
    // App's wiring; this is the seam neither side owned.
    //
    // It is a RELATIONSHIP, not a component property: the number in the board copy must
    // be the same `DEFAULT_TOP_N` the matrix above was built from, on BOTH axes.
    renderApp({ shared: fakeShared({ seed: [...MATCHUPS, ...PROMPTS, OTHER] }).shared, appStorage: fakeAppStorage().appStorage });
    await screen.findByTestId('grid-view');

    // PREMISE: the board holds MORE than the cut admits, so `DEFAULT_TOP_N` is a real
    // cut and not just "all of them" — otherwise a count wired to `combinations.length`
    // would pass too.
    expect(MATCHUPS.length).toBeGreaterThan(DEFAULT_TOP_N);
    expect(PROMPTS.length).toBeGreaterThan(DEFAULT_TOP_N);

    const matchups = await openView('Matchups');
    expect(within(matchups).getByTestId('matchups-included-summary')).toHaveTextContent(
      `The top ${DEFAULT_TOP_N} by votes are showing as the grid's rows in your view.`,
    );

    const prompts = await openView('Prompts');
    expect(within(prompts).getByTestId('prompts-included-summary')).toHaveTextContent(
      `The top ${DEFAULT_TOP_N} by votes are showing as the grid's columns in your view.`,
    );

    // …and back on Home the matrix really is that many rows, which is what makes the two
    // numbers a RELATIONSHIP rather than two independent readings of the same constant.
    await openView('Grids');
    const matrix = await screen.findByTestId('results-grid');
    expect(within(matrix).getAllByTestId('grid-group-matchup')).toHaveLength(DEFAULT_TOP_N);
    expect(within(matrix).getAllByTestId('grid-col-header')).toHaveLength(DEFAULT_TOP_N);
  });

  // 🔴 THE CASE ABOVE IS NARROWER THAN ITS OWN HEADER, AND THIS CLOSES THE GAP. It says
  // "the App feeds THE BOARDS", and there are FOUR `includedCount` call sites in
  // `App.tsx`: `surface="community"` ×2 (the two it drives) and `surface="my"` ×2, which
  // it cannot see. MEASURED: mutating only a `my` site to `includedCount={0}` leaves the
  // full suite green.
  //
  // 🔴 AND NO BEHAVIOURAL CASE CAN SEE THOSE TWO, WHICH IS WHY THIS GUARD IS STRUCTURAL.
  // `includedCount` is read in exactly one place in each view — the community branch's
  // `matchups-included-summary` / `prompts-included-summary` copy. The `my` branch
  // returns before reaching it, so on that surface the prop renders NOTHING and the
  // mutant is not a behaviour change at all. There is no DOM, no call and no string that
  // differs; the only observable is the WIRING, so the wiring is what is asserted.
  //
  // ⚠️ DELETING THE TWO INERT SITES WAS CONSIDERED FIRST AND NOT TAKEN. Dead wiring is
  // better removed than guarded — but `includedCount` is REQUIRED, and dropping it from
  // the `my` call sites means making it optional, which reintroduces exactly the
  // silent-degradation hazard `GridsView`'s `results` / `GatedCell` docblocks were
  // written against: a community call site that forgets it would render "The top 0 by
  // votes…" with no error and no failing test. Keeping it required and pinning the
  // ledger is the cheaper side of that trade. If the `my` surface ever grows the copy,
  // this ledger is already the thing that keeps the two derivations in step.
  //
  // 🔴 IT IS A LEDGER, NOT A COUNT — it fails when the set GROWS (a fifth site, wired to
  // something else) and when it SHRINKS, and it pairs each site's `surface` with its
  // expression so a community site wired to `includedPrompts.length` cannot pass by
  // having the right number of rows.
  it('🔴 SEAM, structurally: ALL FOUR board call sites read the same derivation', () => {
    /** Every `<MatchupsView …/>` / `<PromptsView …/>` element in `App.tsx`. */
    const sites = (): { component: string; surface: string; includedCount: string }[] => {
      const src = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');
      const out: { component: string; surface: string; includedCount: string }[] = [];
      for (const component of ['MatchupsView', 'PromptsView']) {
        let i = src.indexOf(`<${component}`);
        while (i !== -1) {
          // Both are self-closing with no nested JSX, so `/>` ends the element. `=>`
          // inside an arrow-function prop does not match it.
          const end = src.indexOf('/>', i);
          const el = src.slice(i, end);
          out.push({
            component,
            surface: el.match(/surface="([^"]*)"/)?.[1] ?? '(none)',
            includedCount: el.match(/includedCount=\{([^}]*)\}/)?.[1] ?? '(none)',
          });
          i = src.indexOf(`<${component}`, end);
        }
      }
      return out;
    };

    const found = sites();

    // 🔴 VALIDATE THE INSTRUMENT BEFORE READING ITS VERDICT. A regex that matched
    // nothing would produce an empty array, and `toEqual([])` against an empty ledger
    // is the "a zero reads as a clean sweep" failure. So: the scan found sites at all,
    // and every one of them yielded BOTH fields rather than the `(none)` sentinel.
    expect(found.length, 'the App.tsx scan found no board call sites').toBeGreaterThan(0);
    for (const s of found) {
      expect(s.surface, `${s.component}: no surface= matched`).not.toBe('(none)');
      expect(s.includedCount, `${s.component}: no includedCount= matched`).not.toBe('(none)');
    }

    expect(
      found,
      'a board call site changed — if you added one, wire it to the SAME derivation and ledger it here',
    ).toEqual([
      { component: 'MatchupsView', surface: 'community', includedCount: 'includedCombos.length' },
      { component: 'MatchupsView', surface: 'my', includedCount: 'includedCombos.length' },
      { component: 'PromptsView', surface: 'community', includedCount: 'includedPrompts.length' },
      { component: 'PromptsView', surface: 'my', includedCount: 'includedPrompts.length' },
    ]);
  });

  it('🔴 is PINNED FIRST once listed, and carries NO vote control, because it has no shared row', async () => {
    // Two published grids, one loud and one quiet: once the loud one is opened and
    // the Top Grid joins the list, a system entry folded into the ordering with an
    // invented count of 0 would land BELOW the 2-vote grid, which is the fake
    // position the criterion forbids.
    const seed = [
      ...MATCHUPS,
      ...PROMPTS,
      row('gk-zulu', 40, 'Loud grid', gridData(['mk-alpha'], ['qk-tango'])),
      OTHER,
    ];
    renderApp({ shared: fakeShared({ seed }).shared, appStorage: fakeAppStorage().appStorage });
    await screen.findByTestId('grid-view');

    // Default load: the Top Grid is OPEN, so it is not listed at all.
    await waitFor(() => expect(cardKeys()).toEqual(['gk-zulu', 'gk-yank']));
    await openListed('gk-zulu');

    // 🔴 THE EXCLUSION SWAP, which is the claim the list makes: the newly-opened
    // grid LEFT the list and the previously-open one JOINED it, first.
    await waitFor(() => expect(cardKeys()).toEqual(['__system__', 'gk-yank']));
    const [first, second] = screen.getAllByTestId('grid-card');

    expect(within(first).getByTestId('grid-system-note')).toBeInTheDocument();
    expect(within(first).getByTestId('grid-card-name')).toHaveTextContent(TOP_GRID_NAME);
    expect(second.getAttribute('data-key')).toBe('gk-yank');

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

  // 🔴 OPERATOR FEEDBACK #2 — the "System grid" BADGE is gone from both surfaces.
  //
  // It restated the first two words of the note that sits directly beneath it, in a
  // pill, and pushed the member summary along the row to do it. The NOTE stays: it is
  // the sentence that explains why the entry has no vote control, which is the part a
  // reader actually needs.
  //
  // 🔴 THE GUARD IS AN ENUMERATED SET OF BADGES, NOT A `queryByTestId(…)).toBeNull()`.
  // An absence keyed on the old testid is walkable by re-adding the same pill under
  // any other name, which — on a surface whose whole complaint was "too many pills" —
  // is the likely shape of the regression. Enumerating what the pack actually rendered
  // (`[data-civitai-ui='badge']`, the attribute `Badge` stamps on its own host) fails
  // when a badge is ADDED as loudly as when one is removed.
  it('🔴 LEDGER: the system entry renders ONE badge on the card and ONE in the panel', async () => {
    renderApp({ shared: fakeShared({ seed: [...MATCHUPS, ...PROMPTS, OTHER] }).shared, appStorage: fakeAppStorage().appStorage });
    await screen.findByTestId('grid-view');

    const badgeTexts = (root: HTMLElement): string[] =>
      Array.from(root.querySelectorAll("[data-civitai-ui='badge']")).map((b) =>
        (b.textContent ?? '').trim(),
      );

    // POSITIVE CONTROL for the selector itself: a PUBLISHED card, which has always
    // carried a member badge, so a zero below is a measured zero rather than a
    // mis-spelled attribute. (This also proves the reader can see badges at all.)
    await waitFor(() => expect(cardKeys()).toEqual(['gk-yank']));
    const published = screen.getAllByTestId('grid-card')[0]!;
    expect(badgeTexts(published).length, 'the badge selector matched nothing').toBeGreaterThan(0);

    // THE OPEN SYSTEM PANEL: exactly one badge, and it is the member summary — no
    // "System grid" pill, and no second pill of any other spelling.
    const panel = screen.getByTestId('grid-open-panel');
    expect(badgeTexts(panel)).toEqual([
      within(panel).getByTestId('grid-open-members').textContent?.trim(),
    ]);
    expect(within(panel).getByTestId('grid-open-system-note')).toBeInTheDocument();

    // THE SYSTEM CARD: same ledger, on the other surface. Open a published grid so
    // the Top Grid is pushed back into the list as a card.
    await openListed('gk-yank');
    await waitFor(() => expect(cardKeys()).toEqual(['__system__']));
    const card = screen.getAllByTestId('grid-card')[0]!;
    expect(badgeTexts(card)).toEqual([
      within(card).getByTestId('grid-card-members').textContent?.trim(),
    ]);
    expect(within(card).getByTestId('grid-system-note')).toBeInTheDocument();
  });

  it('offers no author affordances on the Top Grid — there is no author', async () => {
    renderApp({ shared: fakeShared({ seed: [...MATCHUPS, ...PROMPTS, OTHER] }).shared, appStorage: fakeAppStorage().appStorage });
    await screen.findByTestId('grid-view');
    await waitFor(() => expect(cardKeys()).toEqual(['gk-yank']));
    await openListed('gk-yank');

    const first = await waitFor(() =>
      screen.getAllByTestId('grid-card').find((el) => el.getAttribute('data-key') === '__system__')!,
    );
    expect(within(first).queryByTestId('grid-withdraw')).toBeNull();
    expect(within(first).queryByTestId('grid-report')).toBeNull();
  });
});

// ===========================================================================
// The all-grids list EXCLUDES the open grid
// ===========================================================================

describe('🔴 the all-grids list never lists the grid that is already open', () => {
  // 🔴 WATCHED FAILING AT `origin/main` (938e3d9): there the list carries the open
  // grid too, so the default load renders `['__system__', 'gk-one', 'gk-two']` and
  // every assertion below about `'__system__'` being absent goes RED.
  const ONE = row('gk-one', 9, 'One', gridData(['mk-alpha'], ['qk-tango']));
  const TWO = row('gk-two', 4, 'Two', gridData(['mk-echo'], ['qk-whisky']));

  it('omits the DEFAULT open grid (the Top Grid) and lists it again once another is opened', async () => {
    renderApp({ shared: fakeShared({ seed: [...MATCHUPS, ...PROMPTS, ONE, TWO] }).shared, appStorage: fakeAppStorage().appStorage });
    await screen.findByTestId('grid-view');

    // POSITIVE CONTROL first: the list is populated, so the absence below is an
    // absence of ONE entry rather than of the whole list.
    await waitFor(() => expect(cardKeys()).toEqual(['gk-one', 'gk-two']));
    // The open grid's panel is where it renders instead.
    expect(screen.getByTestId('grid-open-title')).toHaveTextContent(TOP_GRID_NAME);
    // …and the card it used to have is GONE FROM THE DOM, not merely hidden.
    expect(
      screen.queryAllByTestId('grid-card').filter((el) => el.getAttribute('data-key') === '__system__'),
    ).toEqual([]);

    await openListed('gk-one');

    // The two swap: gk-one is now the panel, the Top Grid is back in the list.
    await waitFor(() => expect(cardKeys()).toEqual(['__system__', 'gk-two']));
    expect(screen.getByTestId('grid-open-title')).toHaveTextContent('One');
    expect(screen.queryByTestId('grid-open-system-note')).toBeNull();
  });

  it('🔴 exactly ONE entry is missing from the list, whichever grid is open', async () => {
    // A relationship over the whole set rather than a named card: `communityEntries`
    // is the system entry plus every published grid, and the list must be that set
    // minus exactly the open one. Asserted at two different open grids, so a filter
    // that dropped the wrong entry — or two — fails on the count as well as the set.
    renderApp({ shared: fakeShared({ seed: [...MATCHUPS, ...PROMPTS, ONE, TWO] }).shared, appStorage: fakeAppStorage().appStorage });
    await screen.findByTestId('grid-view');

    const ALL = ['__system__', 'gk-one', 'gk-two'];
    await waitFor(() => expect(cardKeys()).toHaveLength(ALL.length - 1));
    expect(cardKeys()).toEqual(ALL.filter((k) => k !== '__system__'));

    await openListed('gk-two');
    await waitFor(() => expect(cardKeys()).toEqual(ALL.filter((k) => k !== 'gk-two')));
    expect(cardKeys()).toHaveLength(ALL.length - 1);
  });

  it('the empty state no longer promises "the Top Grid above is always here"', async () => {
    // 🔴 PINNED AS THE WHOLE NORMALISED STRING, typed out here rather than imported:
    // the old copy was TRUE only because the Top Grid was simultaneously entry 0 of
    // this list and the default open grid. It is now only ever one of the two, and a
    // keyword guard on "Top Grid" would be walked by a reword that quietly re-made
    // the promise.
    renderApp({ shared: fakeShared({ seed: [...MATCHUPS, ...PROMPTS] }).shared, appStorage: fakeAppStorage().appStorage });
    await screen.findByTestId('grid-view');

    const empty = await screen.findByTestId('grids-empty');
    expect((empty.textContent ?? '').replace(/\s+/g, ' ').trim()).toBe(
      'No published grids yet' +
        'The grid open above is all there is for now. Build your own from any matchups and ' +
        'prompts on the board, then publish it for the community to vote on.',
    );
    // 🔴 AND IT OFFERS NO SECOND CREATE ROUTE. `grid-new` was removed from this
    // surface; an empty-state copy of it would put the removed button back under a
    // different parent.
    expect(within(empty).queryByRole('button')).toBeNull();
    expect(screen.queryByTestId('grid-new')).toBeNull();
  });

  // 🔴 THE FILTER'S ONLY STATED REASON, NOW EXERCISED. `GridsView.openKey`'s docblock
  // and `App`'s `openEntry` comment both argue that the resolution has to happen ONCE,
  // in `App`, because a grid the viewer had open can be WITHDRAWN while they look at it:
  // the panel falls back to the Top Grid, and a list applying its own
  // `key !== openGridKey` test would find no match, keep the Top Grid listed, and show
  // the same grid TWICE — once in the panel, once as a card. That duplication is exactly
  // what `gridPreviewSeam.test.tsx` exists to keep off the page (a second gated read of
  // the same ids), and nothing exercised the route that produces it.
  //
  // 🔴 IT IS REACHABLE WITHOUT A SECOND AUTHOR, and this round is what made it reachable
  // in ONE tab: `GridOpenPanel` now carries Remove, so an author can withdraw the grid
  // they are reading. The same state arrives from two other routes nothing here can
  // drive — another tab's withdraw, and a `listAll` page cap dropping a row between
  // polls — so this case is the cheap one of three, not the only one.
  //
  // 🔴 MUTATION-ISOLATED: replacing `openKey={openKeyResolved}` with
  // `openKey={openGridKey}` in `App.tsx` — the raw key, i.e. the defect both comments
  // describe — takes THIS case red on the card ledger and leaves the rest of the file
  // green. Measured.
  it('🔴 WITHDRAWING the open grid falls back to the Top Grid WITHOUT also listing it', async () => {
    const MINE = row('gk-mine', 6, 'My grid', gridData(['mk-alpha'], ['qk-tango']), {
      authorUserId: VIEWER_ID,
    });
    renderApp({
      shared: fakeShared({ seed: [...MATCHUPS, ...PROMPTS, MINE, TWO] }).shared,
      appStorage: fakeAppStorage().appStorage,
    });
    await screen.findByTestId('grid-view');

    // `gk-mine` (6) outranks `gk-two` (4), so this order is the vote order and not the
    // seed order.
    await waitFor(() => expect(cardKeys()).toEqual(['gk-mine', 'gk-two']));
    await openListed('gk-mine');
    // PREMISE: the viewer's own grid really is the open one, and the Top Grid has taken
    // its place in the list. Without this the fallback below would have nothing to do.
    await waitFor(() => expect(cardKeys()).toEqual(['__system__', 'gk-two']));
    expect(screen.getByTestId('grid-open-title')).toHaveTextContent('My grid');

    // Remove it from the panel — the route this round added.
    const panel = screen.getByTestId('grid-open-panel');
    await userEvent.click(within(panel).getByTestId('grid-open-withdraw'));
    await userEvent.click(
      within(screen.getByTestId('grid-open-panel')).getByTestId('withdraw-confirm'),
    );

    // The panel falls back to the Top Grid…
    await waitFor(() => expect(screen.getByTestId('grid-open-title')).toHaveTextContent(TOP_GRID_NAME));
    // 🔴 …AND THE LIST DROPS IT AGAIN. This is the assertion the raw-key defect fails:
    // with `openKey` carrying `'gk-mine'`, nothing in `communityEntries` matches it, so
    // the Top Grid stays listed AND renders in the panel.
    await waitFor(() => expect(cardKeys()).toEqual(['gk-two']));
    // Stated as the relationship too: EXACTLY ONE rendering of the Top Grid on the page.
    expect(
      screen.queryAllByTestId('grid-card').filter((el) => el.getAttribute('data-key') === '__system__'),
      'the Top Grid rendered in the panel AND as a card',
    ).toEqual([]);
    // …and the withdrawn grid is gone from both surfaces, not merely unlisted.
    expect(cardKeys()).not.toContain('gk-mine');
  });
});

// ===========================================================================
// The OPEN grid's own controls
// ===========================================================================
//
// 🔴 THE DEFECT THESE EXIST FOR, AND IT WAS SHIPPED BY THE EXCLUSION ABOVE.
// `GridsView`'s `entryCard` was the ONLY place that rendered `VoteButton`,
// `WithdrawButton`, `ReportButton`, the ownership badge and the row's description —
// so the moment the open grid stopped being listed, the grid a viewer is actually
// READING became the one grid nobody could upvote, its author could not withdraw,
// and nobody could report. The recovery was to open a DIFFERENT grid so the first
// returned to the list and got its buttons back. A grid's votes feed
// `orderGridsByVotes` — this board's whole ordering — so the missing control was a
// ranking mechanic. ⚠️ NOT `buildTopGrid`, which a draft of this paragraph named: that
// one reads MATCHUP and PROMPT votes to pick the Top Grid's members and never sees a
// grid row's count. See `GridOpenPanel.tsx`'s header, where the same slip is recorded.
//
// 🔴 WATCHED FAILING, MEASURED: with every production source swapped to `7410ca7`
// (this stack's tip before this round) and these tests left in place, all FOUR cases
// below go red. Each dies on its own missing control — `grid-open-description`,
// `grid-open-own-badge`, `grid-open-system-note`, `grid-open-vote` — not on a shared
// helper or a type error.
//
// ⚠️ THE "…AND THE OTHER **28** IN THIS FILE STAY GREEN" HALF OF THAT SENTENCE IS
// RETRACTED, AND THE NUMBER WAS NEVER EVEN MEASURING THAT. Two independent audits of this
// round converged on it. `28` is the count of `it()`s in `gridsView.test.tsx` AT BASE
// (`git show 7410ca7:src/gridsView.test.tsx | grep -c '^\s*it('`) — i.e. the OLD file's
// total, not "how many of the current cases stay green". The current file has 34.
//
// 🔴 AND THE REAL FIGURE IS FIVE, NOT FOUR. Re-measured mechanically by an auditor with
// every production source this round touches swapped back to `7410ca7` and the CURRENT
// test file kept: five cases go red — the four in this describe, PLUS the
// withdraw-fallback case below, which clicks `grid-open-withdraw`, a control this round
// INTRODUCED and which therefore cannot exist at base.
//
// Do not re-derive a number here. The measured claim is about the four cases in THIS
// describe; whether any other case is red at base is that case's own business, and a
// tally of the whole file rots on the next case anyone adds — as this one did, twice.
//
// ⚠️ ONE HALF OF THE SYSTEM CASE IS AN INVARIANT GUARD AND IS LABELLED AS ONE. Its
// `queryByTestId(...).toBeNull()` assertions — FOUR before this note was written and
// FIVE in the case as it stands — pass at base VACUOUSLY: at base no panel renders any
// of those controls for any entry, so "absent on the Top Grid" is not yet a claim about
// the Top Grid. (A draft said "three"; counted rather than remembered now.) What makes
// them non-vacuous on THIS tree is the pair of cases above, which show the same panel
// DOES render them for a published grid — the absence is a property of the ENTRY, and
// the two halves only mean something together. The system case's own red-at-base half is
// `grid-open-system-note`.
//
// 🔴 AND THE SYSTEM GATE IS DERIVED, NOT SPELLED. The last case publishes a grid
// literally NAMED "Top Grid" and requires it to carry all three controls: a gate
// written as a name comparison passes every other case here and fails that one.
describe('🔴 the OPEN grid carries the controls its card used to', () => {
  const MEMBERS = gridData(['mk-alpha'], ['qk-tango']);

  it('ANOTHER author’s open grid: vote + report, no Remove, and the vote names ITS key', async () => {
    const seed = [
      ...MATCHUPS,
      ...PROMPTS,
      row('gk-zulu', 40, 'Loud grid', MEMBERS, { authorUserId: OTHER_ID, body: 'Zulu blurb' }),
    ];
    const { shared, votes } = sharedWithVotes(seed);
    renderApp({ shared, appStorage: fakeAppStorage().appStorage });
    await screen.findByTestId('grid-view');
    await waitFor(() => expect(cardKeys()).toEqual(['gk-zulu']));
    await openListed('gk-zulu');

    const panel = await screen.findByTestId('grid-open-panel');
    expect(within(panel).getByTestId('grid-open-title')).toHaveTextContent('Loud grid');
    // The row's own words, which also only ever rendered on a card.
    expect(within(panel).getByTestId('grid-open-description')).toHaveTextContent('Zulu blurb');

    // 🔴 THE THREE GATES, ALL THREE ASSERTED — two presences and one absence, so a
    // panel that rendered every control unconditionally fails here too.
    expect(within(panel).getByTestId('grid-open-vote')).toBeInTheDocument();
    expect(within(panel).getByTestId('grid-open-report')).toBeInTheDocument();
    expect(within(panel).queryByTestId('grid-open-withdraw')).toBeNull();
    expect(within(panel).queryByTestId('grid-open-own-badge')).toBeNull();

    // 🔴 THE VOTE IS WIRED TO THE OPEN GRID'S KEY, not merely rendered. `40` is the
    // seeded count and `VOTE_ANSWER` (123) is unlike every fixture count, so the
    // number after the press can only have come from the host's answer.
    expect(within(panel).getByTestId('vote-count')).toHaveTextContent('40');
    await userEvent.click(within(panel).getByTestId('grid-open-vote'));
    await waitFor(() => expect(votes).toEqual(['gk-zulu']));
    await waitFor(() =>
      expect(within(screen.getByTestId('grid-open-panel')).getByTestId('vote-count')).toHaveTextContent(
        String(VOTE_ANSWER),
      ),
    );
  });

  it('the VIEWER’s OWN open grid: Remove + the Yours badge, and no Report', async () => {
    const seed = [
      ...MATCHUPS,
      ...PROMPTS,
      row('gk-mine', 5, 'My grid', MEMBERS, { authorUserId: VIEWER_ID }),
    ];
    const { shared, withdraws } = fakeShared({ seed });
    renderApp({ shared, appStorage: fakeAppStorage().appStorage });
    await screen.findByTestId('grid-view');
    await waitFor(() => expect(cardKeys()).toEqual(['gk-mine']));
    await openListed('gk-mine');

    const panel = await screen.findByTestId('grid-open-panel');
    expect(within(panel).getByTestId('grid-open-own-badge')).toHaveTextContent('Yours');
    expect(within(panel).getByTestId('grid-open-withdraw')).toBeInTheDocument();
    // An author has a real Remove, so Report is not offered — the mirror of the rule
    // the cards apply, from the same `isOwnRow` predicate.
    expect(within(panel).queryByTestId('grid-open-report')).toBeNull();
    // A vote control IS still offered on your own row: the community ranking includes
    // it, which is the same decision the cards make.
    expect(within(panel).getByTestId('grid-open-vote')).toBeInTheDocument();

    // 🔴 AND REMOVE REACHES `withdraw` WITH THIS GRID'S KEY, through the confirm step.
    // Without this the Remove button could be inert or aimed at another row.
    // ⚠ `withdraw-confirm` is a FIXED testid inside `WithdrawButton`, not derived from
    // the trigger's — scoped to the panel so it cannot resolve against a card's.
    await userEvent.click(within(panel).getByTestId('grid-open-withdraw'));
    await userEvent.click(
      within(screen.getByTestId('grid-open-panel')).getByTestId('withdraw-confirm'),
    );
    await waitFor(() => expect(withdraws).toContain('gk-mine'));
  });

  it('🔴 the SYSTEM entry offers NONE of the three, and says why in words', async () => {
    renderApp({ shared: fakeShared({ seed: [...MATCHUPS, ...PROMPTS] }).shared, appStorage: fakeAppStorage().appStorage });
    const panel = await screen.findByTestId('grid-open-panel');

    // POSITIVE CONTROL: this really is the Top Grid's panel and it really rendered, so
    // the FIVE nulls below are not five ways of saying "nothing is on screen". (A draft
    // said "three"; there are four controls plus the description.)
    //
    // ⚠️ IT USED TO BE THE "System grid" BADGE, which is gone — removed on operator
    // feedback, the note beside it having always said the same thing in a sentence.
    // The TITLE carries the control now, and deliberately not the note: the note is
    // one of the things this case is testing, and a control has to be independent of
    // the claim it licenses.
    expect(within(panel).getByTestId('grid-open-title')).toHaveTextContent(TOP_GRID_NAME);

    expect(within(panel).queryByTestId('grid-open-vote')).toBeNull();
    expect(within(panel).queryByTestId('grid-open-withdraw')).toBeNull();
    expect(within(panel).queryByTestId('grid-open-report')).toBeNull();
    expect(within(panel).queryByTestId('grid-open-own-badge')).toBeNull();

    // …and it says so where the reader is, rather than leaving the absence unexplained.
    expect(within(panel).getByTestId('grid-open-system-note')).toHaveTextContent(
      /cannot be voted on and it is not part of the vote order/i,
    );
    // A system entry has no description of its own, so that slot is the note and
    // nothing else — an either/or, not both.
    expect(within(panel).queryByTestId('grid-open-description')).toBeNull();
  });

  it('🔴 the gate is the ENTRY, not the NAME: a published grid called "Top Grid" keeps its controls', async () => {
    // 🔴 THE ANTI-SPELLING CONTROL. `TOP_GRID_NAME` is imported, never typed, so this
    // case cannot drift out of alignment with the constant it collides with. A gate
    // written as `name === TOP_GRID_NAME` (or `/top grid/i`) passes every other case
    // in this describe and fails exactly here.
    const seed = [
      ...MATCHUPS,
      ...PROMPTS,
      row('gk-impostor', 3, TOP_GRID_NAME, MEMBERS, { authorUserId: OTHER_ID }),
    ];
    renderApp({ shared: fakeShared({ seed }).shared, appStorage: fakeAppStorage().appStorage });
    await screen.findByTestId('grid-view');
    await waitFor(() => expect(cardKeys()).toEqual(['gk-impostor']));
    await openListed('gk-impostor');

    const panel = await screen.findByTestId('grid-open-panel');
    expect(within(panel).getByTestId('grid-open-title')).toHaveTextContent(TOP_GRID_NAME);
    // It is NOT the system entry, so: no note, and all the controls a published grid
    // by another author gets.
    expect(within(panel).queryByTestId('grid-open-system-note')).toBeNull();
    expect(within(panel).getByTestId('grid-open-vote')).toBeInTheDocument();
    expect(within(panel).getByTestId('grid-open-report')).toBeInTheDocument();
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
    // FOUR cards, not five: the system entry is the OPEN grid on a default load and
    // the open grid is not listed. The vote order below is therefore the whole list.
    await waitFor(() => expect(screen.getAllByTestId('grid-card')).toHaveLength(4));

    expect(cardKeys()).toEqual(['gk-zulu', 'gk-alpha', 'gk-bravo', 'gk-mike']);

    // CONTROLS: the rendered order is neither the seed order nor key order, so
    // a no-op and a key-sort are both distinguishable from the real ordering.
    expect(cardKeys()).not.toEqual(GRID_ROWS.map((r) => r.key));
    expect(cardKeys()).not.toEqual([...GRID_ROWS.map((r) => r.key)].sort());

    // …and the ordering still PINS the system entry first once it is listed, which
    // is the half a default load can no longer observe.
    await openListed('gk-zulu');
    await waitFor(() =>
      expect(cardKeys()).toEqual(['__system__', 'gk-alpha', 'gk-bravo', 'gk-mike']),
    );
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
    // TWO, not three: the system entry is open and therefore unlisted.
    await waitFor(() => expect(screen.getAllByTestId('grid-card')).toHaveLength(2));

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
    await waitFor(() => expect(screen.getAllByTestId('grid-card')).toHaveLength(2));

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
    await waitFor(() => expect(screen.getAllByTestId('grid-card')).toHaveLength(1));

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
    // 🔴 THE SAME COUNT ON THE OPEN PANEL, from the same helper over the same resolved
    // rows. This is the PLURAL/PLURAL arm of the open panel's summary: the card and the
    // panel are two surfaces, and only pinning both catches one of them drifting to the
    // AUTHORED lengths (4 × 8 here) instead of the resolved ones.
    expect(await screen.findByTestId('grid-open-members')).toHaveTextContent('3 matchups × 2 prompts');
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
    // 🔴 THE PLURAL/SINGULAR ARM on the open panel — `1 prompt`, not `1 prompts`. The
    // 0.2.3 live defect this repo already paid for was a number/verb disagreement, and
    // a summary pinned only in the plural cannot see it.
    expect(screen.getByTestId('grid-open-members')).toHaveTextContent('2 matchups × 1 prompt');
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
    // 🔴 THE ZERO ARM on the open panel: `0 matchups × 0 prompts` RENDERS, rather than
    // the badge vanishing. An absent summary on an empty grid is indistinguishable from
    // a summary that failed to render, which is the state this whole addition exists to
    // remove.
    expect(screen.getByTestId('grid-open-members')).toHaveTextContent('0 matchups × 0 prompts');
  });
});

// ===========================================================================
// The grid builder's ROW PICKER summarises a matchup by MODELS, not "configs"
// ===========================================================================

describe("🔴 the row picker's structural summary says \"models\"", () => {
  // 🔴 WHY HERE AND NOT ONLY IN A UNIT TEST. The string comes from
  // `modelCountSummary` (`lib/benchmark.ts`), which `lib/benchmark.test.ts` pins as
  // literals — but the helper has TWO call sites and a unit test is blind to a call
  // site that still open-codes the old `${n} config${…}` ternary. Both of them did,
  // identically, which is the shape that comes out wrong at N−1 sites. This case reads
  // the RENDERED option on `App`'s side (`matchupPickerItems` → `GridForm` →
  // `GridPicker`); `myBenchmarks.test.tsx` reads `MatchupsView`'s side.
  it('reads "N models" on a picker option, at both the singular and the plural', async () => {
    // RED AT `7c20155`: the options read "1 config" / "2 configs".
    //
    // 🔴 A TWO-CONFIG MATCHUP IS SEEDED ALONGSIDE THE SHARED FIXTURE RATHER THAN
    // CHANGING IT. Every `MATCHUPS` row carries exactly ONE config, so the shared
    // fixture can only ever exercise the SINGULAR branch — and a fixture pinned to the
    // singular cannot tell `${n} model` from `${n} model${n === 1 ? '' : 's'}`, nor
    // either from a hardcoded "1 model". Widening `MATCHUPS` in place would move the
    // cell counts (configs × prompts) that a dozen cases in this file assert, so the
    // extra row is additive: it is not in any `MATCHUPS`-derived expectation.
    const twoConfig = row('mk-pair', 2, 'Pair', {
      v: 2,
      kind: 'combination',
      configs: [
        {
          id: 'cfg-pair-a',
          checkpoint: { versionId: 1001, modelId: 500, baseModel: 'SDXL 1.0', modelName: 'JuggernautXL' },
          loras: [],
        },
        {
          id: 'cfg-pair-b',
          checkpoint: { versionId: 1001, modelId: 500, baseModel: 'SDXL 1.0', modelName: 'JuggernautXL' },
          loras: [],
        },
      ],
    });
    const s = fakeShared({ seed: [...MATCHUPS, twoConfig, ...PROMPTS] });
    renderApp({ shared: s.shared, appStorage: fakeAppStorage().appStorage });
    await screen.findByTestId('grid-view');

    await contribute('grid');
    const form = await screen.findByTestId('grid-form');
    await userEvent.click(within(form).getByTestId('grid-form-pick-rows'));
    const picker = await screen.findByTestId('grid-pick-rows');
    const optionFor = (key: string): HTMLElement =>
      within(picker)
        .getAllByTestId('grid-pick-rows-option')
        .find((el) => el.getAttribute('data-key') === key)!;

    // 🔴 LITERALS, typed out here rather than built from `modelCountSummary` — an
    // expectation read out of the implementation agrees with a wrong implementation.
    // `toContain` on the option, because the option also carries the matchup's name.
    expect(optionFor('mk-echo').textContent ?? '').toContain('1 model');
    expect(optionFor('mk-pair').textContent ?? '').toContain('2 models');
    // …and the internal noun reaches neither. `/config/i` over the OPTION, not the
    // whole page: `grid-form`'s own copy is not what this case is about.
    for (const key of ['mk-echo', 'mk-pair']) {
      expect(
        optionFor(key).textContent ?? '',
        `${key}'s option leaked the internal noun "config"`,
      ).not.toMatch(/config/i);
    }
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

    // 🔴 THE ROUTE MOVED, NOT THE CAPABILITY. `grid-new` was removed from this
    // surface (superseded by `Contribute ▸ Grid`), so this walk goes through the
    // menu — the same `App.openNewGrid` callback either way. Retargeted rather than
    // deleted on purpose: this case is coverage of the grid-builder flow, and the
    // button it happened to start from was never the claim.
    await contribute('grid');
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

  it('🔴 ESCAPE IN THE PICKER CLOSES ONLY THE PICKER — the grid form survives', async () => {
    // 🔴 THE DATA LOSS THIS PINS. The picker is a `Modal` rendered INSIDE the
    // grid form's `Modal`. The pack attaches its Escape handler to `document`
    // and deliberately does NOT `stopPropagation` — it says so in its own source
    // ("v0 assumes a single modal") — so ONE Escape ran BOTH `onClose`s: the
    // picker closed AND `closeModal()` unmounted `GridForm`, destroying the
    // name, the description and BOTH key selections. All four are local
    // `useState` in `GridForm`; nothing had been persisted, so there was no
    // recovery and no message. The picker now owns Escape itself, in the CAPTURE
    // phase, so the outer modal's bubble-phase handler never runs.
    const s = fakeShared({ seed: [...MATCHUPS, ...PROMPTS] });
    const { appStorage, sets } = fakeAppStorage();
    renderApp({ shared: s.shared, appStorage });
    await screen.findByTestId('grid-view');

    await contribute('grid');
    const form = await screen.findByTestId('grid-form');
    await userEvent.type(within(form).getByTestId('grid-form-name'), 'Escape survivor');
    await userEvent.type(within(form).getByTestId('grid-form-description'), 'both axes chosen');

    // Both axes picked FIRST, so the state Escape could destroy is real state and
    // not an empty form that would look identical either way.
    await userEvent.click(within(form).getByTestId('grid-form-pick-rows'));
    const rowPicker = await screen.findByTestId('grid-pick-rows');
    await userEvent.click(
      within(rowPicker)
        .getAllByTestId('grid-pick-rows-option')
        .find((el) => el.getAttribute('data-key') === 'mk-echo')!,
    );
    await userEvent.click(within(rowPicker).getByTestId('grid-pick-rows-confirm'));

    await userEvent.click(within(form).getByTestId('grid-form-pick-cols'));
    const colPicker = await screen.findByTestId('grid-pick-cols');
    await userEvent.click(
      within(colPicker)
        .getAllByTestId('grid-pick-cols-option')
        .find((el) => el.getAttribute('data-key') === 'qk-whisky')!,
    );
    await userEvent.click(within(colPicker).getByTestId('grid-pick-cols-confirm'));

    expect(within(form).getByTestId('grid-form-rows-count')).toHaveTextContent('1 selected');
    expect(within(form).getByTestId('grid-form-cols-count')).toHaveTextContent('1 selected');

    // Re-open the row picker and press Escape.
    await userEvent.click(within(form).getByTestId('grid-form-pick-rows'));
    await screen.findByTestId('grid-pick-rows');

    // 🔴 POSITIVE CONTROL: TWO modals really are mounted. Without it, an Escape
    // that "left the form alone" could just mean the picker never opened, and
    // the case would pass against a picker that does not render at all.
    expect(screen.getAllByRole('dialog'), 'the picker did not open on top of the form').toHaveLength(
      2,
    );

    await userEvent.keyboard('{Escape}');

    // The picker closed…
    await waitFor(() => expect(screen.queryByTestId('grid-pick-rows')).toBeNull());
    // …and the form did NOT. Every piece of unsaved state is still there.
    const after = screen.getByTestId('grid-form');
    expect(within(after).getByTestId('grid-form-name')).toHaveValue('Escape survivor');
    expect(within(after).getByTestId('grid-form-description')).toHaveValue('both axes chosen');
    expect(within(after).getByTestId('grid-form-rows-count')).toHaveTextContent('1 selected');
    expect(within(after).getByTestId('grid-form-cols-count')).toHaveTextContent('1 selected');
    expect(screen.getAllByRole('dialog')).toHaveLength(1);

    // And the form still WORKS afterwards — Escape left no half-torn-down state.
    await userEvent.click(within(after).getByTestId('grid-form-submit'));
    await waitFor(() => expect(sets.some((w) => w.key.startsWith(UNPUB_GRID_PREFIX))).toBe(true));
    expect(sets.find((w) => w.key.startsWith(UNPUB_GRID_PREFIX))!.value).toMatchObject({
      name: 'Escape survivor',
      matchupKeys: ['mk-echo'],
      promptKeys: ['qk-whisky'],
    });
  });

  it('🔴 REPORTS a refused private save instead of silently unspinning the button', async () => {
    // `saveUnpubGrid` is `appStorage.set`, which rejects on the per-APP 50MB
    // quota, on a >64KB value, and for an anonymous viewer. `GridForm` shipped
    // with `try/finally` and no `catch`, so all three failed in total silence —
    // unlike `MatchupForm` and `PromptForm`, which have caught since they
    // shipped. The viewer's next move against a silent refusal is to press Save
    // again, forever.
    const s = fakeShared({ seed: [...MATCHUPS, ...PROMPTS] });
    const { appStorage, setAttempts, sets } = fakeAppStorage(
      {},
      {},
      { failSetTimes: 9, failSetPrefix: UNPUB_GRID_PREFIX, failSetError: 'QUOTA_EXCEEDED' },
    );
    renderApp({ shared: s.shared, appStorage });
    await screen.findByTestId('grid-view');

    await contribute('grid');
    const form = await screen.findByTestId('grid-form');
    await userEvent.type(within(form).getByTestId('grid-form-name'), 'Refused');
    await userEvent.click(within(form).getByTestId('grid-form-pick-rows'));
    const rowPicker = await screen.findByTestId('grid-pick-rows');
    await userEvent.click(
      within(rowPicker)
        .getAllByTestId('grid-pick-rows-option')
        .find((el) => el.getAttribute('data-key') === 'mk-echo')!,
    );
    await userEvent.click(within(rowPicker).getByTestId('grid-pick-rows-confirm'));
    await userEvent.click(within(form).getByTestId('grid-form-pick-cols'));
    const colPicker = await screen.findByTestId('grid-pick-cols');
    await userEvent.click(
      within(colPicker)
        .getAllByTestId('grid-pick-cols-option')
        .find((el) => el.getAttribute('data-key') === 'qk-whisky')!,
    );
    await userEvent.click(within(colPicker).getByTestId('grid-pick-cols-confirm'));

    await userEvent.click(within(form).getByTestId('grid-form-submit'));

    // POSITIVE CONTROL on the premise: the write was ATTEMPTED and REFUSED —
    // `setAttempts` records a rejected `set`, `sets` records only what stored.
    await waitFor(() =>
      expect(setAttempts.some((w) => w.key.startsWith(UNPUB_GRID_PREFIX))).toBe(true),
    );
    expect(sets.some((w) => w.key.startsWith(UNPUB_GRID_PREFIX))).toBe(false);

    const errs = await screen.findByTestId('grid-form-errors');
    expect(errs).toHaveTextContent('QUOTA_EXCEEDED');
    // The form stayed open with the viewer's work intact — a closed form here
    // would read as a save that succeeded.
    expect(screen.getByTestId('grid-form-name')).toHaveValue('Refused');
    // 🔴 And nothing reached the public board on the failing private path.
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

    // 🔴 THE VIEWER'S OWN GRIDS ARE A SIDEBAR DESTINATION NOW. The grids section
    // dropped its My/Community strip in the IA refactor and rendered the unpublished
    // list inline, behind a latch, only once there was something in it; that panel is
    // `My Benchmarks ▸ Grids` and it renders unconditionally for a signed-in viewer.
    await openMyList('grid');
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

    // The Top Grid is READABLE — as the open panel, since the open grid is no longer
    // listed — and the published grid is the one card.
    await waitFor(() => expect(cardKeys()).toEqual(['gk-public']));
    expect(screen.getByTestId('grid-open-title')).toHaveTextContent(TOP_GRID_NAME);
    expect(await screen.findByTestId('results-grid')).toBeInTheDocument();

    // 🔴 THERE IS NO GRID CREATE AFFORDANCE ON THIS BOARD AT ALL, for any viewer.
    // Its history in three steps, because each step retired the last one's reasoning:
    // `grid-new` was HIDDEN for an anonymous viewer on the ground that
    // "`appStorage.set` rejects for an anonymous viewer, so a New-grid button could
    // only ever produce an unhandled rejection" — true of THAT button and false of the
    // page's `Contribute` item, which was never gated and opened the same form; then
    // both went through App's one `openNewGrid` and both nudged sign-in; now both are
    // deleted and creating a grid lives on My Benchmarks ▸ Grids, which is the same
    // place the viewer's own grids are. Asserted as absences, not as a shrug.
    expect(screen.queryAllByTestId('grid-new')).toEqual([]);
    expect(screen.queryAllByTestId('contribute-trigger')).toEqual([]);

    // 🔴 `subtab-my-grid` IS STILL AN INVARIANT GUARD and `my-signed-out-grid` IS NOT
    // ANY MORE — the two used to be relabelled together and they have come apart:
    //   - `subtab-my-grid`: no component in this repo emits it. The `SubTabs` strip is
    //     DELETED outright (not merely noun-narrowed), so this query is vacuous BY
    //     CONSTRUCTION and is kept only as a tripwire against a per-board My/Community
    //     toggle coming back. It is NOT evidence about an anonymous viewer.
    //   - `my-signed-out-grid`: REAL. `My Benchmarks ▸ Grids` renders it for an
    //     anonymous viewer, so its absence HERE is a genuine claim — the sign-in panel
    //     belongs to the viewer's own surface and must not leak onto the board.
    expect(screen.queryByTestId('subtab-my-grid')).toBeNull();
    expect(screen.queryByTestId('my-signed-out-grid')).toBeNull();
    // Also real, and also absent from the community board: the private panel.
    expect(screen.queryByTestId('my-list-panel')).toBeNull();
    expect(screen.queryByTestId('new-unpublished')).toBeNull();

    // 🔴 NOT ONE WRITE ATTEMPTED, per-viewer or shared, on anything it offered.
    expect(setAttempts).toEqual([]);
    expect(s.appends).toEqual([]);
    expect(s.withdraws).toEqual([]);
    expect(s.updates).toEqual([]);
  });

  /**
   * 🔴 THE WALK THE OLD ZERO-WRITE LEDGERS COULD NOT SEE.
   *
   * The anon cases in this file and in `myCommunity.test.tsx` assert "no write
   * affordance / no attempted write" WITHOUT EVER OPENING THE CONTRIBUTE MENU, so
   * their zero-write ledgers held vacuously: the one ungated route to a private-store
   * write was behind a closed popover nothing clicked. Measured before the fix — an
   * anonymous viewer reached `grid-form` this way, filled it in, and had the save
   * rejected at `appStorage.set`.
   */
  it('🔴 My Benchmarks ▸ Grids asks an anonymous viewer to sign in, and writes nothing', async () => {
    // 🔴 THE WALK THE OLD ZERO-WRITE LEDGERS COULD NOT SEE, at its third address.
    // The anon cases in this file and in `myCommunity.test.tsx` assert "no write
    // affordance / no attempted write" — and for a long time they did so WITHOUT EVER
    // REACHING the one ungated route to a private-store write, so the ledgers held
    // vacuously. (Measured then: an anonymous viewer reached `grid-form` through
    // `Contribute ▸ Build a grid`, filled it in, and had the save refused at
    // `appStorage.set`.) That route is deleted; the grid create control now lives
    // behind the viewer's own surface, so this case walks THERE.
    const s = sharedWithVotes(seed);
    const requestSignIn = vi.fn();
    const { appStorage, setAttempts } = fakeAppStorage();
    renderApp({ shared: s.shared, appStorage, requestSignIn }, null);
    await screen.findByTestId('grid-view');

    await openMyList('grid');

    // 🔴 THE SIGN-IN PANEL, AND NO CREATE CONTROL AT ALL — which is a stronger end
    // state than the nudge it replaced: there is no button whose press has to be
    // routed, because there is no button.
    expect(await screen.findByTestId('my-signed-out-grid')).toBeInTheDocument();
    expect(screen.queryByTestId('new-unpublished')).toBeNull();
    expect(screen.queryByTestId('grid-form')).toBeNull();

    // The one control on that surface is the host's own sign-in request.
    await userEvent.click(screen.getByTestId('my-sign-in-grid'));
    expect(requestSignIn).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('grid-form')).toBeNull();

    // 🔴 NOT ONE WRITE, from anything this viewer can reach.
    expect(setAttempts).toEqual([]);
    expect(s.appends).toEqual([]);
  });

  it('🔴 POSITIVE CONTROL: the same destination DOES offer the form to a signed-in viewer', async () => {
    // Without this, the case above is satisfied by a destination wired to nothing, by
    // a `new-unpublished` control that never renders for anyone, or by a `grid-form`
    // testid that no longer exists.
    const s = sharedWithVotes(seed);
    const requestSignIn = vi.fn();
    renderApp({ shared: s.shared, appStorage: fakeAppStorage().appStorage, requestSignIn });
    await screen.findByTestId('grid-view');

    await openMyList('grid');
    // 🔴 AND THE PANEL IS HERE WITH NO RECORDS AT ALL, which the latch it replaced
    // would not have rendered. That is what makes this the create route rather than a
    // surface you can only reach once you already have a grid.
    expect(screen.queryByTestId('my-signed-out-grid')).toBeNull();
    await userEvent.click(await screen.findByTestId('new-unpublished'));

    expect(await screen.findByTestId('grid-form')).toBeInTheDocument();
    expect(requestSignIn).toHaveBeenCalledTimes(0);
  });

  it('🔴 the vote control asks them to sign in instead of calling the host', async () => {
    const s = sharedWithVotes(seed);
    const requestSignIn = vi.fn();
    renderApp({ shared: s.shared, appStorage: fakeAppStorage().appStorage, requestSignIn }, null);
    await screen.findByTestId('grid-view');
    await waitFor(() => expect(screen.getAllByTestId('grid-card')).toHaveLength(1));

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
    await waitFor(() => expect(screen.getAllByTestId('grid-card')).toHaveLength(1));

    const card = screen.getAllByTestId('grid-card').find((el) => el.getAttribute('data-key') === 'gk-public')!;
    expect(within(card).queryByTestId('grid-report')).toBeNull();
    expect(s.reports).toEqual([]);
  });
});

// ===========================================================================
// The author's own grids: ownership badge, remove
// ===========================================================================

describe('the My / Community partition for grids (§11.1)', () => {
  const MINE = row('gk-mine', 30, 'My grid', gridData(['mk-alpha'], ['qk-tango']), { authorUserId: VIEWER_ID });
  const THEIRS = row('gk-theirs', 11, 'Their grid', gridData(['mk-echo'], ['qk-whisky']), { authorUserId: OTHER_ID });

  it('shows an authored grid under My AND in Community, with Remove only on My own', async () => {
    renderApp({ shared: fakeShared({ seed: [...MATCHUPS, ...PROMPTS, MINE, THEIRS] }).shared, appStorage: fakeAppStorage().appStorage });
    await screen.findByTestId('grid-view');
    // TWO cards: the system entry is the open grid and is not listed.
    await waitFor(() => expect(screen.getAllByTestId('grid-card')).toHaveLength(2));

    // Community keeps the viewer's own row, ranked the way everyone sees it.
    expect(cardKeys()).toEqual(['gk-mine', 'gk-theirs']);
    const mineInCommunity = screen.getAllByTestId('grid-card').find((el) => el.getAttribute('data-key') === 'gk-mine')!;
    const theirsInCommunity = screen.getAllByTestId('grid-card').find((el) => el.getAttribute('data-key') === 'gk-theirs')!;
    expect(within(mineInCommunity).getByTestId('grid-withdraw')).toBeInTheDocument();
    expect(within(mineInCommunity).queryByTestId('grid-report')).toBeNull();
    expect(within(theirsInCommunity).queryByTestId('grid-withdraw')).toBeNull();
    expect(within(theirsInCommunity).getByTestId('grid-report')).toBeInTheDocument();

    // 🔴 OWNERSHIP IS A BADGE ON THE ONE LIST NOW, not a second filtered list. The
    // My sub-tab is gone (IA refactor); what it communicated — which rows are the
    // viewer's — is asserted here on the same cards, and it is derived from the
    // same `isOwnRow` predicate that decides Remove-vs-Report above, so the label
    // and the affordances cannot disagree.
    expect(screen.queryByTestId('subtab-my-grid')).toBeNull();
    expect(within(mineInCommunity).getByTestId('grid-own-badge')).toBeInTheDocument();
    expect(within(theirsInCommunity).queryByTestId('grid-own-badge')).toBeNull();
    // The system entry is nobody's — open another grid so it is listed and can be
    // read as a card at all.
    await openListed('gk-theirs');
    const system = await waitFor(() =>
      screen.getAllByTestId('grid-card').find((el) => el.getAttribute('data-key') === '__system__')!,
    );
    expect(within(system).queryByTestId('grid-own-badge')).toBeNull();
  });

  // ⚠️ "archives an own grid out of My while it stays in Community" LIVED HERE AND
  // IS GONE FROM THIS FILE, deliberately and with its subject intact. Archive is an
  // author-side hide of the viewer's own row from THEIR OWN list (§11.3); this
  // surface is the community board, where an archived row must stay visible to
  // everyone INCLUDING the archiver. While the grids section had no My/Community
  // split, "your own list" had nowhere else to mean and the flag was pointed at
  // this list — that reading is retired, and `GridsView` no longer takes
  // `archivedKeys`/`onArchive`/`onUnarchive` at all.
  //
  // 🔴 THE INVARIANTS THEMSELVES ARE NOT DROPPED. `myCommunity.test.tsx`'s
  // criterion 12 still pins them for the matchup and prompt surfaces — archived row
  // leaves My, the shared board is untouched, the row keeps its votes, the honest
  // wording renders — against the same `lib/archive.ts`, `ARCHIVE_KEY` and
  // `ARCHIVE_NOTE`, all unchanged. Between this change and the one that gives grids
  // their own viewer surface, a grid cannot be archived from the UI at all. That is
  // a stated gap, not a silent deletion.
  it('withdraws an own grid on confirm, and touches NO member row', async () => {
    const s = fakeShared({ seed: [...MATCHUPS, ...PROMPTS, MINE, THEIRS] });
    renderApp({ shared: s.shared, appStorage: fakeAppStorage().appStorage });
    await screen.findByTestId('grid-view');
    await waitFor(() => expect(screen.getAllByTestId('grid-card')).toHaveLength(2));

    const mine = screen.getAllByTestId('grid-card').find((el) => el.getAttribute('data-key') === 'gk-mine')!;
    await userEvent.click(within(mine).getByTestId('grid-withdraw'));
    // Confirm-before-firing: arming alone tells the store nothing.
    expect(s.withdraws).toEqual([]);
    await userEvent.click(within(mine).getByTestId('withdraw-confirm'));

    // 🔴 EXACTLY the grid's key. A grid's members belong to other authors and
    // `withdraw` is author-scoped; removing a grid must never reach them.
    await waitFor(() => expect(s.withdraws).toEqual(['gk-mine']));
    await waitFor(() => expect(cardKeys()).toEqual(['gk-theirs']));
    // The member rows are all still on the board.
    await openView('Matchups');
    await waitFor(() => expect(screen.getAllByTestId('matchup-card')).toHaveLength(MATCHUPS.length));
  });
});

// ===========================================================================
// ⚠️ THE "GridsView DIRECTLY" BLOCK MOVED — it is `src/myBenchmarks.test.tsx` now.
//
// It rendered `GridsView` itself (rather than the whole App) for the two per-viewer
// invariants a Harness fixture cannot drive: the SDK `Harness` snapshots its `viewer`
// option on first render, so the PROP cannot express a viewer swap. Both invariants
// are about the viewer's PRIVATE panel — the unpublished list and its publish error —
// and that panel is not on this surface any more: `GridsView` is the community board,
// and the private panel is `MyGridsView` (My Benchmarks ▸ Grids).
//
// The cases went with the component, not away. One of them also changed shape rather
// than address, and that is recorded there: the LATCH they were written against no
// longer exists, because a dedicated surface can simply render the panel
// unconditionally.
//
// ⚠️ AN EARLIER VERSION OF THIS PARAGRAPH ADDED "which is strictly stronger than a
// latch and cannot unmount mid-report at all". That is FALSE and the claim is retracted:
// navigating to Home unmounts `MyGridsView` and takes `MyList`'s local publish
// `error` with it. The unconditional panel closes the LIST-EMPTYING path only. See
// `MyGridsView`'s own header for the full record, and
// `src/publishPointerFailure.test.tsx` for the case that pins the real behaviour.
// ===========================================================================
