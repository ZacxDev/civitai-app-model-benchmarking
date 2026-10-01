// 527 Phase 1 — the My / Community partition, the prompt half of the publish
// boundary, and Archive. Driven through the REAL App against the SDK mock host.
//
// Acceptance criteria pinned here:
//   5  — a row the viewer authored appears under MY *and* in COMMUNITY
//   6  — an unpublished item of each kind is absent from the shared list until
//        Publish, and readable by a SECOND viewer afterwards
//   12 — Archive removes the row from MY, the shared row is demonstrably still on
//        the board (with its votes), and the honest wording is RENDERED
//   plus: an anonymous viewer gets a read-only Community and a sign-in prompt,
//        and no affordance that could produce an unhandled host rejection.
//
// 🔴 EVERY PARTITION CASE USES TWO DISTINCT `authorUserId`s. With one author the
// partition passes by accident — "everything" and "mine" are the same set, and a
// `isOwnRow` that always returned true would be green.

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Harness } from './test-harness.js';
import type { SharedItem } from '@civitai/sdk';

import { App, type AppDeps } from './App.js';
import {
  fakeAppStorage,
  fakeShared,
  immediateSleep,
  openMyList,
  openRowMenu,
  openView,
} from './test-helpers.js';
import { ARCHIVE_KEY } from './lib/archive.js';
import { draftKey } from './lib/drafts.js';
import { unpubGridKey } from './lib/grids.js';
import { UNPUB_PROMPT_PREFIX, unpubPromptKey } from './lib/unpubPrompts.js';
import type { CombinationData, PromptData } from './types.js';

const VIEWER_ID = 99;
const OTHER_ID = 7; // 🔴 distinct from VIEWER_ID — see the header note

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
  default: { prompt: 'cyberpunk portrait', params: { cfgScale: 5, steps: 30 } },
};

function row(
  key: string,
  title: string,
  authorUserId: number,
  data: CombinationData | PromptData,
  count = 1,
): SharedItem {
  return {
    key,
    authorUserId,
    count,
    viewerVoted: false,
    value: { title, body: '', data },
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

function mountApp(deps: Partial<AppDeps>, viewer: { id: number; username: string } | null) {
  return render(
    <Harness
      // 🔴 `null` is passed THROUGH, never coerced to `undefined`: the mock host
      // documents `viewer` as defaulting to a `dev-viewer`, so `undefined` gives
      // a SIGNED-IN viewer and the anon case silently stops being the anon case.
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
 * Mount the app and OPEN THE MATCHUPS VIEW.
 *
 * 🔴 The extra step exists because 527 made GRIDS the default view (spec §11.5,
 * acceptance criterion 9). Every case below is about the matchup or prompt
 * surfaces, so each has to navigate there now; doing it here rather than at each
 * call site keeps the default's name at ONE site — it has moved once already.
 */
async function renderApp(...args: Parameters<typeof mountApp>) {
  const r = mountApp(...args);
  await openView('Matchups');
  return r;
}

const signedIn = { id: VIEWER_ID, username: 'me' };

/**
 * 🔴 THE THREE HELPERS ARE NAVIGATION AGAIN, AND THEY POINT SOMEWHERE ELSE. Their
 * history, because each generation broke the last one's premise:
 *   1. a top-level tab strip → `openPromptsView` clicked a tab, `openMy` clicked a
 *      neutral `subtab-my`;
 *   2. the one-page IA → all sections mounted at once, so `openPromptsView` stopped
 *      clicking and the sub-tab testids had to become object-scoped
 *      (`subtab-my-prompt`) or every neutral query resolved twice;
 *   3. now → the SIDEBAR owns "my work" and a BOARD SUBNAV owns which community board
 *      is mounted. `subtabs-*`, `subtab-my-*` and `subtab-community-*` DO NOT EXIST:
 *      there is no per-board My/Community toggle at all, because that toggle was a
 *      second spelling of a choice the sidebar already makes.
 *
 * So MY is `My Benchmarks ▸ <noun>` and COMMUNITY is `Home ▸ <board>`, and both are
 * real navigations that unmount what they leave.
 */
type Surface = 'matchup' | 'prompt';
const openPromptsView = () => openView('Prompts');
const openMy = (noun: Surface | 'grid' = 'matchup') => openMyList(noun);
const openCommunity = (noun: Surface = 'matchup') =>
  openView(noun === 'matchup' ? 'Matchups' : 'Prompts');

/** The `data-key`s of every rendered card of the given testid, in DOM order. */
const keysOf = (testid: string): string[] =>
  screen.queryAllByTestId(testid).map((el) => el.getAttribute('data-key') ?? '');

// ---------------------------------------------------------------------------
// Criterion 5 — the partition. MY is a subset; COMMUNITY is everything.
// ---------------------------------------------------------------------------

describe('🔴 criterion 5: an authored row appears under My AND in Community', () => {
  it('partitions MATCHUPS by author, and Community keeps the viewer’s own row', async () => {
    const { shared } = fakeShared({
      seed: [
        row('mine', 'My matchup', VIEWER_ID, comboData),
        row('theirs', 'Their matchup', OTHER_ID, comboData),
      ],
    });
    await renderApp({ shared, appStorage: fakeAppStorage().appStorage }, signedIn);

    // COMMUNITY (the default sub-tab) = every published row, both authors.
    await screen.findByTestId('matchups-view');
    await waitFor(() => expect(keysOf('matchup-card')).toHaveLength(2));
    expect(keysOf('matchup-card').sort()).toEqual(['mine', 'theirs']);

    // MY = only the viewer's own. Two authors is what makes this a real claim.
    await openMy();
    await waitFor(() => expect(keysOf('matchup-card')).toEqual(['mine']));
    expect(screen.queryByText('Their matchup')).toBeNull();

    // …and back in Community the viewer's own row is STILL there (§11.1: an
    // author sees their row ranked the way everyone else sees it).
    await openCommunity();
    await waitFor(() => expect(keysOf('matchup-card').sort()).toEqual(['mine', 'theirs']));
    expect(screen.getByText('My matchup')).toBeInTheDocument();
  });

  it('partitions PROMPTS by author, and Community keeps the viewer’s own row', async () => {
    const { shared } = fakeShared({
      seed: [
        row('p-mine', 'My prompt', VIEWER_ID, promptData),
        row('p-theirs', 'Their prompt', OTHER_ID, promptData),
      ],
    });
    await renderApp({ shared, appStorage: fakeAppStorage().appStorage }, signedIn);

    await screen.findByTestId('matchups-view');
    await openPromptsView();
    await waitFor(() => expect(keysOf('prompt-card')).toHaveLength(2));

    await openMy('prompt');
    await waitFor(() => expect(keysOf('prompt-card')).toEqual(['p-mine']));
    expect(screen.queryByText('Their prompt')).toBeNull();

    await openCommunity('prompt');
    await waitFor(() => expect(keysOf('prompt-card').sort()).toEqual(['p-mine', 'p-theirs']));
  });

  // ⚠️ "counts the two sub-tabs from the same partition" LIVED HERE AND HAS NO
  // SUBJECT ANY MORE. It asserted that the strip's `My (1)` / `Community (2)` labels
  // agreed with the lists behind them, on the reasoning that the labels are the only
  // thing a viewer sees before clicking. There is no strip and there are no counts:
  // "my work" is a sidebar destination whose label cannot disagree with a list because
  // it names no number.
  //
  // 🔴 THE UNDERLYING CLAIM — that the partition itself is right — is what the two
  // cases above assert, by reading the LISTS. That was always the stronger half; the
  // count case was a guard on a label derived from them.
});

// ---------------------------------------------------------------------------
// 🔴 VOTING IS OFFERED ON OTHER PEOPLE'S MATCHUPS AND NOT ON YOUR OWN.
//
// An operator decision, and the third affordance on the Report side of the
// ownership mirror (`MatchupBody`'s `canVote`, through the app's ONE `isOwnRow`
// predicate). A matchup's vote total decides whether it becomes one of the grid's
// rows, so an author upvoting their own submission is ranking it with the same
// instrument everyone else ranks it with.
//
// 🔴 THE SCORE IS *NOT* PART OF THE AFFORDANCE, AND SEPARATING THEM IS HALF OF WHAT
// THIS CASE PINS. For one revision the count lived INSIDE the button
// (`VoteButton`'s child `vote-count`), so hiding the control hid the number and an
// author could not see their own matchup's score at all. The operator's decision was
// to KEEP the count: `VoteCount` is its own component now and `VoteTally` renders it
// with no control around it. So the claim is a 2×2, not a pair:
//
//              │ vote-count │ matchup-vote
//     ─────────┼────────────┼──────────────
//     own      │  PRESENT   │   ABSENT
//     foreign  │  PRESENT   │   PRESENT
//
// 🔴 ALL FOUR CELLS IN ONE CASE, OVER ONE RENDER, WITH TWO DISTINCT `authorUserId`s.
// Every one-sided subset is worthless, in a different direction each time: "control
// absent on mine" alone is satisfied by a control deleted for EVERYONE; "control
// present on theirs" alone by one shown to everyone; "count present on mine" alone by
// a count nobody gated. And the diagonal is the one a careless implementation gets
// wrong — rendering NEITHER on an own row, which is exactly the defect this change
// fixes and which a pair-without-the-count would have called green. This file's header
// states the two-author rule, and the `includedCount={0}`-at-two-of-four-call-sites
// incident is why it is stated at all.
//
// 🔴 EACH CELL CARRIES ITS OWN FAILURE MESSAGE, so a mutation that breaks one cannot
// be mistaken for one that breaks another. That is load-bearing: a mutant removing the
// count AND the button together would red this case either way and prove nothing about
// which, so the messages are what make the mutation evidence readable.
//
// ⚠️ WHAT IT IS NOT: enforcement. `shared.vote` is a HOST call and the host does not
// refuse a self-vote, so this is an affordance and nothing stops a viewer with the
// network tab open. Nothing in this app can claim otherwise.
// ---------------------------------------------------------------------------

describe('🔴 the vote control is offered on OTHER viewers’ matchups only', () => {
  it('own row: score WITHOUT the control; foreign row: both — same board, one render', async () => {
    // 🔴 THE TWO COUNTS ARE DISTINCT FROM EACH OTHER AND FROM EVERY OTHER NUMBER ON
    // THE PAGE (5 and 9, against the fake's own 0/1 vote answers), so a tally that
    // read the wrong row's total, or a hardcoded literal, cannot pass.
    const MINE_VOTES = 5;
    const THEIRS_VOTES = 9;
    const { shared } = fakeShared({
      seed: [
        row('mine', 'My matchup', VIEWER_ID, comboData, MINE_VOTES),
        row('theirs', 'Their matchup', OTHER_ID, comboData, THEIRS_VOTES),
      ],
    });
    await renderApp({ shared, appStorage: fakeAppStorage().appStorage }, signedIn);

    await screen.findByTestId('matchups-view');
    await waitFor(() => expect(keysOf('matchup-card')).toHaveLength(2));
    const cardFor = (key: string): HTMLElement =>
      screen.queryAllByTestId('matchup-card').find((el) => el.getAttribute('data-key') === key)!;

    // 🔴 EVERY CELL IS READ WITH `queryByTestId` + AN EXPLICIT MESSAGE, NEVER WITH
    // `getByTestId`. That is not style: `getByTestId` throws its OWN
    // `TestingLibraryElementError` before vitest can attach the message, so a mutant
    // that breaks ONE cell produces a failure indistinguishable from a mutant that
    // breaks another, and the whole point of the 2×2 is being able to tell them apart.
    // MEASURED: with the tally removed, this case failed with the library's "Unable to
    // find [data-testid=vote-count]" and only the LINE NUMBER said which cell.
    const cellCount = (card: HTMLElement, label: string): HTMLElement => {
      const el = within(card).queryByTestId('vote-count');
      expect(el, label).not.toBeNull();
      return el!;
    };

    // ---- FOREIGN ROW: both cells PRESENT ----
    const theirs = cardFor('theirs');
    expect(
      within(theirs).queryByTestId('matchup-vote'),
      'the vote control is missing on a FOREIGN matchup',
    ).not.toBeNull();
    const theirsCount = cellCount(theirs, 'the foreign row lost its score');
    expect(theirsCount).toHaveTextContent(String(THEIRS_VOTES));
    // …and there the count really is INSIDE the control, which is what makes the own
    // row's arrangement a different arrangement rather than the same one twice.
    expect(
      theirsCount.closest('button'),
      'the foreign row’s score escaped its vote control',
    ).not.toBeNull();

    // ---- OWN ROW: score PRESENT, control ABSENT ----
    const mine = cardFor('mine');
    expect(
      within(mine).queryByTestId('matchup-vote'),
      'the viewer was offered a vote on their own matchup',
    ).toBeNull();
    const mineCount = cellCount(mine, 'the author cannot see their own matchup’s score');
    expect(mineCount).toHaveTextContent(String(MINE_VOTES));
    // 🔴 AND THE SCORE IS NOT A CONTROL IN DISGUISE. A disabled Button, or a `<span>`
    // with an `onClick`, would satisfy the two assertions above while still offering
    // the press — so the arrangement is read structurally: nothing focusable anywhere
    // around the number. `closest('button')` covers the pack's Button (which is where
    // the count sits on a foreign row), and the role/tabindex sweep covers a
    // hand-rolled one.
    const tally = within(mine).queryByTestId('vote-tally');
    expect(tally, 'the author’s score is not rendered as a read-only tally').not.toBeNull();
    expect(
      mineCount.closest('button'),
      'the author’s score is still wrapped in a button',
    ).toBeNull();
    expect(tally!.tagName).toBe('SPAN');
    expect(tally).not.toHaveAttribute('role');
    expect(tally).not.toHaveAttribute('tabindex');
    expect(
      tally!.querySelectorAll('button, a[href], [tabindex], [role="button"]'),
      'the read-only score contains something pressable',
    ).toHaveLength(0);
    // 🔴 AND IT IS NAMED. A bare number beside a matchup title says nothing about what
    // it counts; the plural is spelled because "5" alone is not a sentence a screen
    // reader can place. A LITERAL, not built from `MINE_VOTES`, so a reword lands here.
    expect(tally).toHaveAttribute('aria-label', '5 votes');

    // 🔴 THE TALLY IS THE OWN-ROW ARRANGEMENT AND NOTHING ELSE. If it appeared on the
    // foreign row too, the "count is inside the control" reading above would be
    // satisfied by a second, loose copy of the number sitting beside it.
    expect(within(theirs).queryByTestId('vote-tally')).toBeNull();

    // 🔴 AND THE CARD IS A REAL, FULLY RENDERED CARD. Without this the null above is
    // satisfied by a row that failed to render at all — the in-band positive control
    // that makes the absence a claim about ownership rather than about mounting. Two
    // readings that do not depend on the vote feature at all: the author's own `⋮`
    // (which only an owner is given) and the ownership-independent config summary.
    expect(within(mine).getByTestId('matchup-menu')).toBeInTheDocument();
    expect(within(mine).getByTestId('matchup-config-summary')).toBeInTheDocument();

    // 🔴 AND IT IS THE *SAME* RULE ON THE VIEWER'S OWN SURFACE, where every row is
    // theirs by construction — so an implementation that gated on the SURFACE rather
    // than on `isOwnRow` would pass the community half above and fail here. Both cells
    // again: no control, and the score still readable.
    const mySection = await openMy();
    await waitFor(() => expect(keysOf('matchup-card')).toEqual(['mine']));
    expect(
      within(mySection).queryByTestId('matchup-vote'),
      'My Benchmarks offered a vote on the viewer’s own matchup',
    ).toBeNull();
    expect(
      cellCount(mySection, 'My Benchmarks hides the author’s own score'),
      'My Benchmarks shows the wrong score',
    ).toHaveTextContent(String(MINE_VOTES));
  });

  it('🔴 keeps the control for an ANONYMOUS viewer, who owns nothing', async () => {
    // 🔴 THE EDGE `isOwnRow` DECIDES AND A HAND-ROLLED `viewerId === authorUserId`
    // WOULD GET WRONG. A signed-out viewer has `viewerId: null`, which is not equal to
    // any author id, so NO row is theirs and every row keeps its (disabled) vote
    // button routing to the sign-in nudge. `report.test.tsx`'s signed-out case uses
    // exactly that control as its in-band positive control, so a gate that hid it from
    // anonymous viewers would break an unrelated guard for an unrelated reason.
    const { shared } = fakeShared({
      seed: [
        row('mine', 'A matchup', VIEWER_ID, comboData, 5),
        row('theirs', 'Another matchup', OTHER_ID, comboData, 9),
      ],
    });
    await renderApp({ shared, appStorage: fakeAppStorage().appStorage }, null);

    await waitFor(() => expect(keysOf('matchup-card')).toHaveLength(2));
    expect(screen.queryAllByTestId('matchup-vote')).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Criterion 6 — the prompt half of the publish boundary (the matchup half lives
// in drafts.test.tsx, which drives the same boundary through the same App).
// ---------------------------------------------------------------------------

/** Fill and save the PRIVATE prompt form opened from the My tab. */
async function fillAndSavePromptPrivately(name: string, text: string) {
  await userEvent.click(await screen.findByTestId('new-unpublished'));
  const form = await screen.findByTestId('prompt-form');
  fireEvent.change(within(form).getByTestId('prompt-name'), { target: { value: name } });
  fireEvent.change(within(form).getByTestId('prompt-default-text'), { target: { value: text } });
  await userEvent.click(within(form).getByTestId('prompt-submit'));
  await waitFor(() => expect(screen.queryByTestId('prompt-form')).toBeNull());
}

describe('🔴 criterion 6: an unpublished PROMPT reaches the board only on Publish', () => {
  it('stays out of shared storage until Publish, then a SECOND viewer reads it', async () => {
    const board = fakeShared();
    const authorStore = fakeAppStorage();
    const otherStore = fakeAppStorage();

    const authorView = await renderApp(
      { shared: board.shared, appStorage: authorStore.appStorage },
      signedIn,
    );
    await screen.findByTestId('matchups-view');
    await openPromptsView();
    await openMy('prompt');
    await fillAndSavePromptPrivately('Private prompt', 'a quiet street at dawn');

    // 🔴 IT IS IN THE PER-VIEWER STORE AND NOWHERE ELSE. Asserted BEFORE the card
    // is looked up, on purpose: a save wired to the public path publishes and then
    // renders no unpublished card at all, so a card lookup first would kill this
    // case on a missing element rather than on the boundary claim it is about.
    expect(board.appends, 'saving privately reached the public board').toEqual([]);
    await screen.findByTestId('unpublished-card');
    expect(
      [...authorStore.store.keys()].filter((k) => k.startsWith(UNPUB_PROMPT_PREFIX)),
      'the private prompt was not written under its own prefix',
    ).toHaveLength(1);
    authorView.unmount();

    // A SECOND viewer, same board, their own store: nothing on either sub-tab.
    const otherView = await renderApp(
      { shared: board.shared, appStorage: otherStore.appStorage },
      { id: OTHER_ID, username: 'them' },
    );
    await screen.findByTestId('matchups-view');
    await openPromptsView();
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId('prompt-card')).toBeNull();
    await openMy('prompt');
    expect(screen.queryByTestId('unpublished-card')).toBeNull();
    expect(screen.queryByText('Private prompt')).toBeNull();
    otherView.unmount();

    // PUBLISH — the one action that crosses the boundary.
    const authorAgain = await renderApp(
      { shared: board.shared, appStorage: authorStore.appStorage },
      signedIn,
    );
    await screen.findByTestId('matchups-view');
    await openPromptsView();
    await openMy('prompt');
    await userEvent.click(await screen.findByTestId('unpublished-publish'));
    await waitFor(() => expect(board.appends).toHaveLength(1));
    expect(board.appends[0].title).toBe('Private prompt');
    // 🔴 The wire discriminant the board's other rows already carry.
    expect((board.appends[0].data as PromptData).kind).toBe('prompt');
    expect((board.appends[0].data as PromptData).default.prompt).toBe('a quiet street at dawn');

    // 🔴 THE PRIVATE RECORD BECAME A POINTER, not a second editable copy. This
    // was found by a SURVIVING mutant: deleting the pointer write left the whole
    // suite green while the record kept its body — so the row stayed in "Not
    // published yet" and a second Publish would mint a DUPLICATE shared row that
    // nobody can merge (`append` has no idempotency key). Both halves are pinned:
    // the stored shape, and the card being gone from the screen.
    await waitFor(() => expect(screen.queryByTestId('unpublished-card')).toBeNull());
    const storedPrivate = [...authorStore.store.entries()].filter(([k]) =>
      k.startsWith(UNPUB_PROMPT_PREFIX),
    );
    expect(storedPrivate).toHaveLength(1);
    expect(storedPrivate[0][1]).toMatchObject({ v: 1, sharedKey: 'fk_1' });
    expect(storedPrivate[0][1], 'the editable body survived publish').not.toHaveProperty('default');
    authorAgain.unmount();

    // POSITIVE CONTROL: the SAME second-viewer render now surfaces it.
    await renderApp(
      { shared: board.shared, appStorage: otherStore.appStorage },
      { id: OTHER_ID, username: 'them' },
    );
    await screen.findByTestId('matchups-view');
    await openPromptsView();
    const card = await screen.findByTestId('prompt-card');
    expect(card).toHaveTextContent('Private prompt');
  });
});

// ---------------------------------------------------------------------------
// Criterion 12 — Archive is an author-side HIDE, and the UI says so.
// ---------------------------------------------------------------------------

describe('🔴 criterion 12: Archive hides from My only, and says so in words', () => {
  it('drops the row from My while it stays on the board, in Community, with its votes', async () => {
    const VOTES = 7; // distinct from 0 and 1, so a reset would show
    const { shared, withdraws, updates, appends } = fakeShared({
      seed: [
        row('mine', 'My matchup', VIEWER_ID, comboData, VOTES),
        row('theirs', 'Their matchup', OTHER_ID, comboData, 3),
      ],
    });
    const { appStorage, store } = fakeAppStorage();
    await renderApp({ shared, appStorage }, signedIn);

    await openMy();
    await waitFor(() => expect(keysOf('matchup-card')).toEqual(['mine']));

    // Archive is behind the row's ⋮ now — unmounted, not hidden, until it opens.
    await userEvent.click(within(await openRowMenu('matchup')).getByTestId('archive-action'));

    // 🔴 HALF ONE — gone from MY.
    await waitFor(() => expect(keysOf('matchup-card')).toEqual([]));
    expect(screen.getByTestId('my-list-empty')).toBeInTheDocument();
    // …recorded in the ONE per-viewer key §11.3 specifies, and nowhere else.
    await waitFor(() => expect(store.get(ARCHIVE_KEY)).toEqual(['mine']));

    // 🔴 HALF TWO — THE ROW IS STILL ON THE SHARED BOARD. Three independent
    // readings, because "still there" is exactly the claim an archive-as-delete
    // implementation would fail quietly:
    //   (a) the app told the shared store NOTHING,
    const listed = await shared.list({});
    expect(withdraws, 'Archive withdrew the row — that is a delete, not a hide').toEqual([]);
    expect(updates, 'Archive rewrote the shared row').toEqual([]);
    expect(appends).toEqual([]);
    //   (b) the row is still what `list()` returns, with its vote total intact,
    expect(listed.items.map((i) => i.key).sort()).toEqual(['mine', 'theirs']);
    expect(listed.items.find((i) => i.key === 'mine')!.count).toBe(VOTES);
    //   (c) and the archiver still sees it in Community, votes and all.
    await openCommunity();
    await waitFor(() => expect(keysOf('matchup-card').sort()).toEqual(['mine', 'theirs']));
    const stillThere = screen.queryAllByTestId('matchup-card').find(
      (el) => el.getAttribute('data-key') === 'mine',
    )!;
    expect(stillThere).toHaveTextContent('My matchup');
    expect(within(stillThere).getByTestId('vote-count')).toHaveTextContent(String(VOTES));
    //
    // ⚠️ THIS ASSERTION WENT AWAY AND HAS COME BACK, and the round trip is worth one
    // sentence because the reason it left was a real defect. When the vote control was
    // first hidden on an author's own row the count went with it (it was a child of the
    // button), so this read had to move to the foreign row and the votes-intact claim
    // leaned entirely on (b)'s `shared.list()` read. The count is `VoteCount`/
    // `VoteTally` now — independent of the affordance — so the ORIGINAL, most direct
    // reading is available again: the archiver's own row, on screen, with its votes.
    // (b) is kept beside it deliberately: the two fail for different reasons, one if
    // the render drops the number and one if the store does.
    //
    // 🔴 WHAT IS *NOT* ASSERTED HERE ANY MORE: the ownership vote gate. It was added to
    // this case only as the positive control the retarget needed, and it belongs to the
    // dedicated 2×2 case above, which drives it with its own fixtures and its own
    // per-cell messages. A criterion-12 failure should mean "archive is broken", not
    // "the vote gate moved".
  });

  it('renders the honest wording next to the control, as the whole sentence', async () => {
    // 🔴 PINNED AS THE WHOLE NORMALISED STRING, typed out here rather than
    // imported from `lib/archive.ts`: an expectation read out of the
    // implementation passes whatever the implementation says, which is precisely
    // the failure mode for a copy guarantee. A reword must come here too.
    const { shared } = fakeShared({ seed: [row('mine', 'My matchup', VIEWER_ID, comboData)] });
    await renderApp({ shared, appStorage: fakeAppStorage().appStorage }, signedIn);

    await openMy();
    const note = await screen.findByTestId('archive-note');
    expect((note.textContent ?? '').replace(/\s+/g, ' ').trim()).toBe(
      'Archiving only hides a row from your My list. It stays on the shared board, ' +
        'stays in Community for everyone including you, and keeps its votes. ' +
        'Remove is the only action that takes it off the board for everyone.',
    );

    // …and it sits with the controls it describes, not on some other screen.
    //
    // ⚠️ THIS USED TO SAY "ARCHIVE STAYS OUTSIDE THE ⋮ MENU, deliberately — it is a
    // caller-supplied slot the GRID cards fill too, and moving it in only on
    // matchup/prompt rows would put the same control in two different places on two
    // surfaces." RETRACTED: the grid card's actions come from the SAME `MyList` slot
    // now, so all three nouns moved together and the premise of that argument is gone.
    // Archive and Remove are both in the row's ⋮; Edit is the one control on the row.
    //
    // 🔴 THE NOTE ITSELF IS OUTSIDE THE MENU AND MUST STAY THERE. It discharges the
    // "suppression named as suppression" rubric item, and a promise a viewer has to
    // open an overflow menu to read is not next to the control in any useful sense.
    const menu = await openRowMenu('matchup');
    expect(within(menu).getByTestId('archive-action')).toBeInTheDocument();
    // The true delete is still offered, and still separate (§11.3).
    expect(within(menu).getByTestId('matchup-withdraw')).toBeInTheDocument();
  });

  it('🔴 SURVIVES A RELOAD: a stored archive is read back on mount', async () => {
    // Without this the feature works only for the session that performed it —
    // the write lands, nothing reads it, and the row silently returns to My on
    // the next load. `archive:v1` is seeded here rather than clicked, so the read
    // path is what is under test and the write path cannot cover for it.
    const { shared } = fakeShared({
      seed: [
        row('mine', 'My matchup', VIEWER_ID, comboData),
        row('theirs', 'Their matchup', OTHER_ID, comboData),
      ],
    });
    const { appStorage } = fakeAppStorage({ [ARCHIVE_KEY]: ['mine'] });
    await renderApp({ shared, appStorage }, signedIn);

    await openMy();
    // The archived row is out of My…
    await waitFor(() => expect(screen.getByTestId('archived-toggle')).toBeInTheDocument());
    expect(keysOf('matchup-card')).toEqual([]);
    // …and still in Community, for the archiver too.
    await openCommunity();
    await waitFor(() => expect(keysOf('matchup-card').sort()).toEqual(['mine', 'theirs']));
  });

  it('is reversible: an archived row can be brought back to My', async () => {
    const { shared } = fakeShared({
      seed: [
        row('mine', 'My matchup', VIEWER_ID, comboData),
        row('theirs', 'Their matchup', OTHER_ID, comboData),
      ],
    });
    const { appStorage, store } = fakeAppStorage();
    await renderApp({ shared, appStorage }, signedIn);

    await openMy();
    await userEvent.click(within(await openRowMenu('matchup')).getByTestId('archive-action'));
    await waitFor(() => expect(store.get(ARCHIVE_KEY)).toEqual(['mine']));

    await userEvent.click(await screen.findByTestId('archived-toggle'));
    await userEvent.click(await screen.findByTestId('unarchive-action'));

    await waitFor(() => expect(store.get(ARCHIVE_KEY)).toEqual([]));
    await waitFor(() => expect(keysOf('matchup-card')).toEqual(['mine']));
  });

  it('archives a PROMPT the same way, and only that prompt', async () => {
    const { shared, withdraws } = fakeShared({
      seed: [
        row('p-mine', 'My prompt', VIEWER_ID, promptData),
        row('p-mine2', 'My other prompt', VIEWER_ID, promptData),
        row('p-theirs', 'Their prompt', OTHER_ID, promptData),
      ],
    });
    const { appStorage, store } = fakeAppStorage();
    await renderApp({ shared, appStorage }, signedIn);

    await screen.findByTestId('matchups-view');
    await openPromptsView();
    await openMy('prompt');
    await waitFor(() => expect(keysOf('prompt-card').sort()).toEqual(['p-mine', 'p-mine2']));

    const target = screen
      .queryAllByTestId('prompt-card')
      .find((el) => el.getAttribute('data-key') === 'p-mine')!;
    await userEvent.click(
      within(await openRowMenu('prompt', target)).getByTestId('archive-action'),
    );

    // Only the archived one leaves My; the viewer's OTHER prompt stays.
    await waitFor(() => expect(keysOf('prompt-card')).toEqual(['p-mine2']));
    expect(store.get(ARCHIVE_KEY)).toEqual(['p-mine']);
    expect(withdraws).toEqual([]);

    // …and Community still holds all three, the archived one included.
    await openCommunity('prompt');
    await waitFor(() =>
      expect(keysOf('prompt-card').sort()).toEqual(['p-mine', 'p-mine2', 'p-theirs']),
    );
  });
});

// ---------------------------------------------------------------------------
// Anonymous viewers — read-only Community, a sign-in prompt on My, and NO
// affordance whose host call would reject.
// ---------------------------------------------------------------------------

describe('🔴 an anonymous viewer gets a readable Community and no rejecting write', () => {
  it('reads Community, and gets a sign-in prompt instead of a My list', async () => {
    const { shared } = fakeShared({
      seed: [
        row('mine', 'A matchup', VIEWER_ID, comboData),
        row('theirs', 'Another matchup', OTHER_ID, comboData),
      ],
    });
    await renderApp({ shared, appStorage: fakeAppStorage().appStorage }, null);

    // Community is READABLE signed out — both rows, no ownership at all.
    await waitFor(() => expect(keysOf('matchup-card')).toHaveLength(2));
    expect(screen.queryByTestId('matchup-edit')).toBeNull();
    expect(screen.queryByTestId('matchup-withdraw')).toBeNull();
    // 🔴 AND NO ⋮ MENU ON EITHER ROW, which is the stronger claim the menu makes
    // possible: an anonymous viewer is offered no Edit, no Remove AND no Report, so
    // there is nothing for an overflow trigger to hold. Two nulls above could also
    // be satisfied by two controls hidden inside a closed menu; this cannot.
    expect(screen.queryAllByTestId('matchup-menu')).toHaveLength(0);

    // My is a sign-in prompt, and carries NO write affordance.
    await openMy();
    await screen.findByTestId('my-signed-out-matchup');
    expect(screen.queryByTestId('new-unpublished')).toBeNull();
    expect(screen.queryByTestId('unpublished-publish')).toBeNull();
    expect(screen.queryByTestId('archive-action')).toBeNull();
    expect(screen.queryByTestId('matchup-card')).toBeNull();
  });

  it('🔴 makes NO per-viewer or shared write on any affordance it does offer', async () => {
    // 🔴 THE HAZARD: `appStorage.set` rejects for an anonymous viewer and
    // `shared.append` rejects too, so any control that fired one here would
    // surface as an unhandled rejection out of a click handler. The guard is that
    // the anonymous surface offers none — and this walks the ones it DOES offer.
    //
    // 🔴 THE WALK IS THE CLAIM, AND IT USED TO BE NARROWER THAN THE SENTENCE
    // DESCRIBING IT. The docstring said "both sub-tabs, both views" while the app
    // has THREE views, Grids is the DEFAULT one (§11.5), and the walk never
    // entered it. It also never touched `submit-matchup` or `submit-prompt`,
    // which render UNGATED for an anonymous viewer — those paths turn out to be
    // handled (both forms catch), but a guard that reads as coverage while
    // providing none is worse than no guard, because it stops anyone looking.
    // The walk is now as wide as the sentence: all THREE views, both sub-tabs on
    // each, both ungated submit buttons opened AND dismissed, and the sign-in
    // buttons clicked. Widening it — not narrowing the sentence — is the fix.
    const rejections: unknown[] = [];
    const onRejection = (e: unknown) => rejections.push(e);
    process.on('unhandledRejection', onRejection);
    try {
      const { shared, appends, updates, withdraws } = fakeShared({
        seed: [row('theirs', 'Another matchup', OTHER_ID, comboData)],
      });
      const { appStorage, setAttempts, deletes } = fakeAppStorage();
      let signInRequests = 0;
      // Mounted WITHOUT `renderApp`'s navigate-to-Matchups step: the DEFAULT view
      // is where an anonymous viewer actually lands, and it is the one the old
      // walk never visited.
      mountApp({ shared, appStorage, requestSignIn: () => (signInRequests += 1) }, null);

      // ---- HOME ▸ GRIDS: the default surface ----
      await screen.findByTestId('grid-view');
      // 🔴 THE GRID CREATE ROUTE IS NOT ON THE COMMUNITY BOARD AT ALL ANY MORE, and
      // that is the third position this walk has had to record. Generation 1:
      // `grid-new` was HIDDEN for an anonymous viewer, so the walk asserted its
      // absence and pressed nothing, while `Contribute ▸ Build a grid` was rendered,
      // completely UNGATED, and never opened by this walk — so the zero-write ledger
      // below held VACUOUSLY over the one route that could reach a private-store
      // write. (Measured pre-fix: an anonymous viewer reached `grid-form` that way and
      // had the save refused at `appStorage.set`.) Generation 2: both routes went
      // through App's one `openNewGrid` and both nudged sign-in. Generation 3, here:
      // `grid-new` is deleted, the Contribute dropdown is deleted, and creating a grid
      // lives on My Benchmarks ▸ Grids — which for an anonymous viewer is the sign-in
      // panel. Asserted as absences so a route REAPPEARING is a decision someone takes.
      expect(screen.queryAllByTestId('grid-new')).toEqual([]);
      expect(screen.queryAllByTestId('contribute-trigger')).toEqual([]);

      // ---- MY BENCHMARKS ▸ GRIDS: the sign-in panel, and its one control ----
      //
      // 🔴 `my-sign-in-grid` IS REAL COVERAGE NOW. It was relabelled an INVARIANT
      // GUARD — vacuous by construction — when the IA refactor removed the grids
      // sub-tabs and the noun union lost its `'grid'` variant, so nothing in the repo
      // could emit it. My Benchmarks ▸ Grids renders `MyTabSignedOut noun="grid"`, so
      // the name is emittable again and this press exercises it.
      await openMy('grid');
      await screen.findByTestId('my-signed-out-grid');
      await userEvent.click(await screen.findByTestId('my-sign-in-grid'));
      // …and NOTHING on that surface offers a write.
      expect(screen.queryByTestId('new-unpublished')).toBeNull();
      expect(screen.queryByTestId('unpublished-publish')).toBeNull();
      expect(screen.queryByTestId('archive-action')).toBeNull();

      // ---- MATCHUPS ----
      await openView('Matchups');
      await screen.findByTestId('matchups-view');
      // 🔴 UNGATED FOR ANON: `submit-matchup` renders for everyone, and since the
      // Contribute dropdown was deleted it is the PRIMARY matchup create route rather
      // than a secondary one. Open the form it raises and dismiss it.
      await userEvent.click(await screen.findByTestId('submit-matchup'));
      await screen.findByTestId('matchup-form');
      await userEvent.click(screen.getByTestId('matchup-cancel'));
      await openMy('matchup');
      await userEvent.click(await screen.findByTestId('my-sign-in-matchup'));

      // ---- PROMPTS ----
      await openPromptsView();
      // 🔴 Also ungated for anon, and also the primary route now.
      await userEvent.click(await screen.findByTestId('submit-prompt'));
      await screen.findByTestId('prompt-form');
      await userEvent.click(screen.getByTestId('prompt-cancel'));
      await openMy('prompt');
      await userEvent.click(await screen.findByTestId('my-sign-in-prompt'));

      // POSITIVE CONTROL on the walk: every unauthorised press really did reach the
      // host's sign-in request, so the empty write ledgers below are about surfaces
      // that were exercised rather than surfaces nobody touched. A literal, not a
      // `>=`: this is the walk's ledger, so a route appearing or disappearing should
      // be a decision someone takes.
      //
      // THREE, and each one named: `my-sign-in-grid`, `my-sign-in-matchup` and
      // `my-sign-in-prompt`. The history of this number IS the history of the grid
      // create route: 3 while the grids view had sub-tabs of its own, 2 when the IA
      // refactor removed them and `grid-new` was hidden from anonymous viewers, 4 when
      // both grid routes rendered and nudged, 3 when `grid-new` went, and 3 again here
      // — with a DIFFERENT third member. The grid CREATE routes are gone from every
      // anonymous surface; My Benchmarks ▸ Grids contributes a sign-in press instead.
      expect(signInRequests, 'an unauthorised press did not reach sign-in').toBe(3);

      // 🔴 NOT ONE write was attempted, on either store. `setAttempts` records
      // even a REJECTED `set`, which `sets` would not — so this cannot be
      // satisfied by a write that was made and refused.
      expect(setAttempts, 'an anonymous viewer attempted a per-viewer write').toEqual([]);
      expect(deletes).toEqual([]);
      expect(appends).toEqual([]);
      expect(updates).toEqual([]);
      expect(withdraws).toEqual([]);
      expect(rejections, 'an anonymous affordance produced an unhandled rejection').toEqual([]);
    } finally {
      process.off('unhandledRejection', onRejection);
    }
  });
});

// ---------------------------------------------------------------------------
// "draft" is a STORAGE word and NOTHING ELSE — it renders in ZERO viewer-facing
// places, while the storage prefix keeps it forever.
//
// 🔴 THIS GUARD HAS MOVED TWICE, IN OPPOSITE DIRECTIONS, AND IT IS BACK AT ITS
// STRONGEST FORM. §11.1 wrote it as "the word renders NOWHERE AT ALL". The My
// Benchmarks consolidation merged the unpublished list and the published list into
// ONE list and broke §11.1's premise — the word had been unnecessary because the
// STATE was carried by the ADDRESS (a record under the "Not published yet" heading
// was unpublished by virtue of being there), and one list has no address to read the
// state off. So the state went ON the row as a one-word badge, and this guard was
// NARROWED to exclude that one enumerated node.
//
// 🔴 THE RENAME INVERTS THE NARROWING AWAY AGAIN. The badge reads **"Private"** now
// (operator decision, and the honest word: the one thing the state means is that no
// other viewer can see the record — see the badge's docblock in `MyList.tsx`). So the
// badge is no longer an exception to anything, and the whole exclusion machinery is
// RETIRED rather than retargeted:
//
//   - GONE: `textOutsideBadge()`, which cloned `<body>` and removed every
//     `[data-testid="draft-badge"]` before reading the text. Nothing needs removing.
//   - GONE: its NEGATIVE control, `expect(bodyText()).toMatch(/draft/i)`. That
//     assertion existed to prove the exclusion was subtracting something REAL rather
//     than passing because the word was never there — and it now asserts the exact
//     opposite of the invariant. Keeping it would make the file self-contradictory;
//     keeping it inverted (`.not.toMatch`) would be a second spelling of the scan
//     below, over the same string.
//   - KEPT, AND IT IS THE PART THAT MATTERS: the POSITIVE controls. A scan reading an
//     empty or unmounted DOM reports "no draft" and proves nothing, so every surface
//     is checked to contain its OWN copy before the absence is read off it.
//
// 🔴 THE SCAN IS STILL `document.body.textContent`, I.E. GENUINELY THE WHOLE PAGE —
// which includes `compact.ts`, whose stylesheet is injected as a `<style>` element so
// every COMMENT inside that template literal lands in the body text. (That has cost a
// gate round: a stray "draft" in CSS commentary fails this case with a stack trace
// pointing at a test file.) Note the two `draft` mentions in `compact.ts` are JSDoc
// OUTSIDE the template and are compiled away, which is why they do not trip it.
//
// 🔴 WHAT DID NOT CHANGE: the forms, the headings, the empty lines and both community
// boards still may not say it. The old surface said "Draft"/"Drafts" in its
// explanatory sub-line as well; that line is deleted (see `MyList`).
// ---------------------------------------------------------------------------

describe('🔴 "draft" is a storage word and renders NOWHERE a viewer can read it', () => {
  it('renders on no surface at all, badge included, on every surface that used to say it', async () => {
    // 🔴 THE SCAN IS OVER RENDERED TEXT, NOT SOURCE. The prefix, the types and the
    // analytics event all still spell "draft" on purpose — a source grep would
    // therefore have to allowlist them and would stop meaning anything. What §11.1
    // decided is about what a viewer READS, so that is what is measured, across
    // every surface the old drafts panel touched: both community boards, all THREE
    // My Benchmarks destinations, and both private forms.
    //
    // 🔴 THE WALK INCLUDES **GRIDS** NOW, AND IT DID NOT BEFORE. That was a real gap
    // rather than a tidy-up: `MyList` renders the same badge for all three nouns, so a
    // reword applied to two of them would have left the third saying the old word with
    // nothing in the repo reading it. The walk is as wide as the sentence describing
    // it — which is the rule this file's anon-walk case records the hard way.
    const unpublishedGrid = {
      v: 1,
      localId: 'ug1',
      name: 'An unpublished grid',
      description: '',
      matchupKeys: ['mine'],
      promptKeys: ['p-mine'],
      updatedAt: '2026-09-07T00:00:00.000Z',
    };
    const unpublishedMatchup = {
      v: 1,
      localId: 'l1',
      name: 'An unpublished matchup',
      description: '',
      configs: comboData.configs,
      updatedAt: '2026-09-07T00:00:00.000Z',
    };
    const unpublishedPrompt = {
      v: 1,
      localId: 'up1',
      name: 'An unpublished prompt',
      description: '',
      default: { prompt: 'a quiet street at dawn', params: {} },
      updatedAt: '2026-09-07T00:00:00.000Z',
    };
    const { shared } = fakeShared({
      seed: [
        row('mine', 'My matchup', VIEWER_ID, comboData),
        row('p-mine', 'My prompt', VIEWER_ID, promptData),
      ],
    });
    const { appStorage } = fakeAppStorage({
      [draftKey('l1')]: unpublishedMatchup,
      [unpubPromptKey('up1')]: unpublishedPrompt,
      [unpubGridKey('ug1')]: unpublishedGrid,
    });
    await renderApp({ shared, appStorage }, signedIn);

    /**
     * The WHOLE rendered page, with nothing subtracted.
     *
     * `compact.ts` injects its sheet as a `<style>`, whose comment text lands in
     * `document.body.textContent`, so this really is everything — markup and
     * stylesheet commentary alike.
     */
    const bodyText = () => (document.body.textContent ?? '').replace(/\s+/g, ' ');
    const noDraft = (where: string) =>
      expect(bodyText(), `the word "draft" is rendered on ${where}`).not.toMatch(/draft/i);

    await screen.findByTestId('matchups-view');
    noDraft('Matchups / Community');
    // …and the badge is not on the community board at all: nothing there is a draft.
    expect(screen.queryAllByTestId('draft-badge')).toEqual([]);

    // 🔴 SCOPED TO THE SURFACE THAT IS MOUNTED, and the surface changed name. `openMy`
    // navigates to My Benchmarks ▸ Matchups, whose section is `section-my-matchup`;
    // `section-matchups` is the COMMUNITY board and is unmounted while we are here.
    const mySection = await openMy();
    await waitFor(() => expect(within(mySection).getByTestId('unpublished-card')).toBeInTheDocument());
    // 🔴 POSITIVE CONTROL ON THE SCAN: it can see this surface's own copy. Without
    // it, a scan reading an empty or unmounted DOM would report "no draft" and
    // prove nothing.
    expect(bodyText()).toContain('Your matchups');
    expect(bodyText()).toContain('An unpublished matchup');
    // 🔴 SECOND POSITIVE CONTROL, AND IT IS WHY THE BADGE IS STILL READ HERE AT ALL.
    // The state marker has not been DELETED — it has been RE-WORDED. A guard that only
    // said "nothing says draft" would be satisfied by a badge that stopped rendering,
    // i.e. by losing the one thing on the row that tells a viewer the record is not
    // public. So its whole text is pinned, as `toBe` on `textContent` rather than
    // `toHaveTextContent` (a SUBSTRING match, which would stay green on "Private
    // draft" — precisely the half-done rename this is for), and its position on the
    // unpublished row is pinned too.
    const badges = within(mySection).getAllByTestId('draft-badge');
    expect(badges).toHaveLength(1);
    expect(badges[0]!.textContent).toBe('Private');
    expect(within(mySection).getByTestId('unpublished-card')).toContainElement(badges[0]!);
    noDraft('Matchups / My');

    // The private matchup form (the old "New draft" / "Save draft" modal).
    // ⚠️ THE SCOPING IS NO LONGER FORCED. It was, while both private panels could be
    // mounted at once on one page, so an unscoped `unpublished-edit` resolved twice.
    // My Benchmarks mounts one noun at a time; the scope is kept because it reads
    // better and because it fails loudly if the surface is ever not the one expected.
    await userEvent.click(within(mySection).getByTestId('unpublished-edit'));
    await screen.findByTestId('matchup-form');
    noDraft('the private matchup form');
    await userEvent.click(screen.getByTestId('matchup-cancel'));

    await openPromptsView();
    noDraft('Prompts / Community');
    const promptsSection = await openMy('prompt');
    await waitFor(() =>
      expect(within(promptsSection).getByTestId('unpublished-card')).toBeInTheDocument(),
    );
    expect(bodyText()).toContain('An unpublished prompt');
    noDraft('Prompts / My');

    await userEvent.click(within(promptsSection).getByTestId('unpublished-edit'));
    await screen.findByTestId('prompt-form');
    noDraft('the private prompt form');
    await userEvent.click(screen.getByTestId('prompt-cancel'));

    // 🔴 THE THIRD NOUN, which this walk never visited. `MyList` renders the SAME
    // badge for grids, so a reword that reached matchups and prompts and missed grids
    // would have been invisible here.
    const gridsSection = await openMyList('grid');
    await waitFor(() =>
      expect(within(gridsSection).getByTestId('unpublished-card')).toBeInTheDocument(),
    );
    expect(bodyText()).toContain('An unpublished grid');
    const gridBadges = within(gridsSection).getAllByTestId('draft-badge');
    expect(gridBadges).toHaveLength(1);
    expect(gridBadges[0]!.textContent).toBe('Private');
    noDraft('Grids / My');

    await userEvent.click(within(gridsSection).getByTestId('unpublished-edit'));
    await screen.findByTestId('grid-form');
    noDraft('the private grid form');
  });
});
