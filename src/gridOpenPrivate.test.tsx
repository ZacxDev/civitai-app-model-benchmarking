// 🔴 OPENING A GRID THAT IS STILL PRIVATE, AND GENERATING INTO IT — end to end
// through the real `App`.
//
// ── WHAT WAS ASKED FOR, AND WHAT IT COSTS ───────────────────────────────────
//
// A grid has no public create path: it is assembled on My Benchmarks ▸ Grids and
// lives in per-viewer KV until its author publishes it. Until this change the only
// way to RUN a cell of one was to publish the grid first — and `shared.append` is
// irreversible, so the viewer had to make the public commitment before they could
// see whether the matrix was worth making. Open closes that order.
//
// 🔴 THE PRICE IS PAID BY THE DATA MODEL, AND THE COPY HAS TO SAY SO. A result row's
// key is `result:${comboKey}·${configId}×${promptKey}` (`buildResultPayload`) — it names
// NO grid, so a cell is shared by every grid that contains it. The GRID stays private;
// its outputs are not grid-scoped and, once on the board, are there for everyone.
//
// ⚠️ THIS PARAGRAPH USED TO SAY THE OUTPUTS "go public immediately and permanently",
// justified by "the run's publish step is an unconditional `publish({ workflowId })`".
// BOTH HALVES ARE REFUTED and the sentence is corrected rather than softened. The CALL
// SITE is unconditional; the PUBLISH is not — `publish()` opens the HOST's "Publish to
// the shared grid?" confirm and rejects on refusal or consent timeout, and `App`'s
// `driveToResult` also has a terminal-non-`succeeded` arm and an `imageIds.length > 0`
// guard, each of which ends with nothing on the board. So "immediately" is false even on
// the happy path (there is a SECOND human confirm after generation), and "permanently"
// was never established — `withdraw` is documented as "Delete a row the viewer
// authored", which is what would PERMIT removal. `ResultsGrid`'s
// `PRIVATE_GRID_RUN_NOTICE` docblock carries the full account of both refutations; it is
// the THIRD rationale for that sentence and this file pins the sentence WHOLE, as a
// TYPED LITERAL (see the literals' header below for why the earlier
// compare-against-the-constant form pinned nothing).
//
// ── 🔴 THE INVARIANT THIS FEATURE MUST NOT BREAK ────────────────────────────
//
// A private grid may name the viewer's own PRIVATE matchups and prompts, which carry
// only a per-viewer LOCAL id. `cascadeRefusal` (`lib/gridCascade.ts`) exists to stop
// such an id reaching `shared.append`, where it would be a permanent public reference
// nobody can resolve. Opening a private grid must create NO new route to that.
//
// It does not, and the mechanism is a reuse rather than a check: `resolveOpenGrid`
// delegates to the same `resolveMemberRows` every other grid uses, which resolves each
// authored key against the BOARD. A private member therefore has no row, contributes no
// row and no column, and cannot be part of any cell — and a cell's identity is what
// every result row is written under. The last case below asserts that against the fake
// `shared.append` CALL LOG rather than against the screen, because the screen can be
// right while the wire is wrong and it is the wire that is permanent.
//
// ── WHAT THIS FILE DOES NOT CLAIM ───────────────────────────────────────────
//
// ⚠️ NOTHING HERE IS EVIDENCE ABOUT THE REAL BUZZ SPEND. The run case drives the mock
// host's generation path, which prices and "charges" nothing real. What it proves is
// which KEYS the result row carries and which sentences the confirm path renders. The
// money invariants live in `src/money-path.test.tsx`.
//
// ⚠️ AND NOTHING HERE IS EVIDENCE ABOUT LAYOUT OR COLOUR. jsdom performs no layout, so
// "the notice is beside Confirm" is a claim about the DOM, never about what a human
// sees — including whether the error-coloured notice is legible.
//
// ── 🔴 COVERAGE STATUS, MEASURED PER CASE ───────────────────────────────────
//
// ⚠️ THE CENSUS THIS REPLACES WAS WRONG ON BOTH NUMBERS — it said "8 of these 11 cases
// RED" with "THREE that stayed GREEN", over seven production sources. 🔴 THE CORRECTED
// FIGURES IN THIS SENTENCE ARE RETROSPECTIVE: they describe `d549e50`, THE TREE THAT
// CENSUS WAS WRITTEN OVER, and NOT this HEAD — TWELVE cases, ELEVEN production sources,
// FOUR green. Re-counted: `git show d549e50:src/gridOpenPrivate.test.tsx` has twelve
// `it(` cases and `git diff --name-only bb63087..d549e50 -- src` names eleven non-test
// sources; the green figure is that round's measurement, carried forward un-re-run.
// ⚠️ A SWEEP ONCE RENUMBERED THIS SENTENCE TO "FOURTEEN" TOGETHER WITH THE HEAD FIGURE IN
// THE NEXT PARAGRAPH, which made it describe a tree it was never measured on. The two
// counts are about DIFFERENT trees and must move independently. Recorded because a census
// is a claim like any other, and a hand-counted one rots on the next case anyone adds.
//
// RE-MEASURED, mechanically: all FOURTEEN production sources `git diff bb63087..HEAD`
// names were rolled back in place to `bb63087` and this file run with
// `vitest --project dom --reporter=verbose`. Of its THIRTEEN cases, TEN were RED and
// THREE GREEN. The three, with why each is green:
//
//   - "a PUBLISHED grid gets NO Open on My Benchmarks — live row or archived" — green
//     because at `bb63087` NO row had an Open at all, so it passes VACUOUSLY there. It
//     is an INVARIANT GUARD over a deliberate CUT, not regression coverage: what it
//     buys is forward, against the control being re-added to the published half.
//   - "Open is offered on GRIDS ONLY — a matchup and a prompt row carry none" — green
//     for exactly the same reason, and likewise an invariant guard. The cheap mistake
//     it defends against is wiring an optional callback for all three nouns.
//   - "THE NEGATIVE CONTROL: a PUBLISHED grid gets the ordinary notice and NOT this
//     one" — green at base is CORRECT and is the point: the private-grid notice did
//     not exist there, so its absence is the base state. A negative control that went
//     red at base would be asserting the wrong thing.
//
// 🔴 AND ONE RED CASE IS NOT REGRESSION COVERAGE OVER `main` EITHER — see "a PRIVATE
// grid being open leaves the community list COMPLETE", whose own comment says so: it is
// red at `bb63087` only because the feature does not exist there, and the bug it caught
// lived in an intermediate state of this PR.

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { SharedStorageValue } from '@civitai/app-sdk/blocks';
import type { SharedItem } from '@civitai/sdk';

import { Harness } from './test-harness.js';
import { App } from './App.js';
import {
  PRIVATE_GRID_EMPTY_BODY,
  PRIVATE_GRID_EMPTY_TITLE,
  PRIVATE_GRID_RUN_NOTICE,
} from './components/ResultsGrid.js';
import { TOP_GRID_NAME } from './lib/gridEntries.js';
import type { SharedStore } from './lib/sdk-runtime.js';
import { ARCHIVE_KEY } from './lib/archive.js';
import { draftKey } from './lib/drafts.js';
import { unpubGridKey } from './lib/grids.js';
import { unpubPromptKey } from './lib/unpubPrompts.js';
import { fakeAppStorage, fakeShared, immediateSleep, openMyList } from './test-helpers.js';
import type {
  CombinationData,
  DraftUnsubmitted,
  GridData,
  PromptData,
  UnpublishedGrid,
  UnpublishedPrompt,
} from './types.js';

// ---------------------------------------------------------------------------
// 🔴 THE THREE VIEWER-FACING SENTENCES, TYPED OUT AS LITERALS.
//
// 🔴 WHY A LITERAL AND NOT THE IMPORTED CONSTANT — THIS FILE GOT THAT WRONG ONCE AND
// SAID OTHERWISE IN A COMMENT. The cases below used to normalise the rendered text and
// compare it to `PRIVATE_GRID_RUN_NOTICE` / `PRIVATE_GRID_EMPTY_*` themselves, under a
// comment claiming that pinned the sentence against "a keyword check a reword can walk
// past". It did not pin it at all: a reword of the constant changes BOTH sides of that
// equality at once, so the guard stays green through any rewrite — including one that
// puts a REFUTED clause back.
//
// MEASURED, one mutation at a time, `pnpm test` read from a file:
//
//   - OLD guard, BOTH refuted clauses reinstated at once — `PRIVATE_GRID_RUN_NOTICE`
//     ending "They go public right away and permanently." and `PRIVATE_GRID_EMPTY_BODY`
//     back to the "Publish your own private matchups and prompts … and they will appear
//     in this grid" sentence its own docblock retracts as FALSE → 69 files / 1027 tests
//     GREEN. Nothing in the tree objected.
//   - NEW literal guard, the RUN-NOTICE clause alone → 1 failed / 1026, in this file's
//     "renders PRIVATE_GRID_RUN_NOTICE verbatim" case, printing the reinstated clause
//     against the expected text.
//   - NEW literal guard, the EMPTY-BODY revert alone → 1 failed / 1026, in this file's
//     "the empty state is the PRIVATE one" case, likewise printing both strings.
//
// The literal is the only form that costs a second edit — which is the form
// `privateGridShortfall`'s sentence already had in `lib/gridEntries.test.ts`. THE
// CONTRAST, measured the same way: changing ONE WORD of that sentence ("left out" →
// "omitted") takes `lib/gridEntries.test.ts` to 2 failed / 38 passed of 40. Same class
// of mutation, opposite outcome, and the only difference is where the expected text
// lives.
//
// So: the text lives HERE as well as in the source, and a reword must be made in both
// places. That is the price, and it is the point — a cosmetic reword fails this file,
// which is what makes the sentence a machine-readable claim.
//
// ⚠️ WHAT THEY PIN IS THE STRING, NOT ITS TRUTH. Each constant's docblock in
// `components/ResultsGrid.tsx` carries the code facts its clauses rest on and the
// refutations of two earlier rationales; nothing here re-establishes any of that.
// ---------------------------------------------------------------------------

/** @see PRIVATE_GRID_RUN_NOTICE — pinned verbatim, normalised to single spaces. */
const EXPECTED_RUN_NOTICE =
  'This grid is private, but that does not cover its cells’ images. A cell’s outputs ' +
  'are stored against the matchup and the prompt — not against this grid — so once they ' +
  'reach the shared board, every grid that contains the cell shows them to every ' +
  'viewer, whether or not you ever publish this one. If the run succeeds you will be ' +
  'asked to confirm publishing them there.';

/** @see PRIVATE_GRID_EMPTY_TITLE — pinned verbatim. */
const EXPECTED_EMPTY_TITLE = 'This grid has no cells yet';

/** @see PRIVATE_GRID_EMPTY_BODY — pinned verbatim, normalised to single spaces. */
const EXPECTED_EMPTY_BODY =
  'A matchup or a prompt becomes a row or a column here only once the app has read its ' +
  'row off the shared board. Publishing the grid is what publishes its private members ' +
  'and repoints it at them — or edit the grid to name matchups and prompts that are ' +
  'already on the board.';

/** One spelling of the normalisation both sides of every comparison below go through. */
const norm = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();

const VIEWER_ID = 99;
/** The board rows' author — distinct, so ownership is never vacuous. */
const OTHER_ID = 7;

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
  default: { prompt: 'a cyberpunk portrait', params: {} },
};
const gridData = (matchupKeys: string[], promptKeys: string[]): GridData => ({
  v: 1,
  kind: 'grid',
  matchupKeys,
  promptKeys,
});

const row = (key: string, count: number, title: string, data: unknown, author = OTHER_ID): SharedItem => ({
  key,
  count,
  authorUserId: author,
  viewerVoted: false,
  value: { title, body: '', data },
  createdAt: new Date(0),
  updatedAt: new Date(0),
});

/**
 * The board: ONE matchup, ONE prompt, ONE published grid naming both.
 *
 * 🔴 ONE OF EACH ON PURPOSE. The Top Grid is `topByVotes` over the same rows, so with
 * a single matchup and a single prompt every grid on this board — Top, published and
 * private — resolves to the SAME 1×1 matrix. That makes `grid-cell` unambiguous in
 * every case and means a cell click can never be about the grid the case did not open.
 */
const BOARD: SharedItem[] = [
  row('mk-a', 9, 'Board Matchup A', comboData('cfg-a')),
  row('qk-1', 7, 'Board Prompt One', promptData),
  row('gk-pub', 4, 'Board Grid', gridData(['mk-a'], ['qk-1'])),
];

// ---------------------------------------------------------------------------
// The viewer's PRIVATE records.
//
// 🔴 EVERY LOCAL ID IS PAIRWISE DISTINCT AND DISTINCT FROM EVERY KEY THE FAKE HOST
// MINTS (`fk_1`, `fk_2`, …) AND FROM EVERY BOARD KEY. A fixture whose local id could
// coincide with a shared key cannot tell "the private member was excluded" from "it
// happened to resolve", which is the one claim that matters in the last case.
// ---------------------------------------------------------------------------

const DRAFT_LOCAL_ID = 'dm-1';
const PROMPT_LOCAL_ID = 'dp-1';
const GRID_LOCAL_ID = 'ug-1';
const PRIVATE_GRID_NAME = 'Mixed Grid';

const privateMatchup: DraftUnsubmitted = {
  v: 1,
  localId: DRAFT_LOCAL_ID,
  name: 'Private Matchup P',
  description: 'kept in my own storage',
  configs: [
    {
      id: 'cfg-p',
      checkpoint: { versionId: 1001, modelId: 500, baseModel: 'SDXL 1.0', modelName: 'JuggernautXL' },
      loras: [],
    },
  ],
  updatedAt: '2026-09-30T00:00:00.000Z',
};
const privatePrompt: UnpublishedPrompt = {
  v: 1,
  localId: PROMPT_LOCAL_ID,
  name: 'Private Prompt Q',
  description: 'also private',
  default: { prompt: 'a private portrait', params: {} },
  updatedAt: '2026-09-30T00:00:00.000Z',
};

/**
 * A private grid naming ONE BOARD MEMBER AND ONE PRIVATE MEMBER PER AXIS.
 *
 * 🔴 THE MIX IS THE WHOLE POINT, not a convenience. An all-board private grid cannot
 * see a local id escaping (there is none to escape) and an all-private one has no cell
 * to run. Four authored members, two of which resolve, is the smallest fixture that
 * exercises BOTH the exclusion and the run in one render.
 */
const mixedPrivateGrid: UnpublishedGrid = {
  v: 1,
  localId: GRID_LOCAL_ID,
  name: PRIVATE_GRID_NAME,
  description: 'one board member and one private member per axis',
  matchupKeys: ['mk-a', DRAFT_LOCAL_ID],
  promptKeys: ['qk-1', PROMPT_LOCAL_ID],
  updatedAt: '2026-09-30T00:00:00.000Z',
};

/**
 * A private grid whose members are ALL the viewer's own private records.
 *
 * 🔴 THIS IS THE FEATURE'S MOST LIKELY FIRST STATE AND IT WAS THE ONE NOT COVERED. A
 * viewer assembles a grid out of the matchups and prompts they are still drafting, and
 * nothing in it resolves against the board — so the matrix is empty, which is a
 * different screen from the mixed fixture above and was the one that read wrong. The
 * mix is the right fixture for the exclusion and the run; it is the WORST fixture for
 * the empty case, because it is the case that works.
 */
const allPrivateGrid: UnpublishedGrid = {
  v: 1,
  localId: GRID_LOCAL_ID,
  name: 'All Private Grid',
  description: 'every member is still in my own storage',
  matchupKeys: [DRAFT_LOCAL_ID],
  promptKeys: [PROMPT_LOCAL_ID],
  updatedAt: '2026-09-30T00:00:00.000Z',
};

function seedStore(grid: UnpublishedGrid = mixedPrivateGrid): Record<string, unknown> {
  return {
    [draftKey(DRAFT_LOCAL_ID)]: privateMatchup,
    [unpubPromptKey(PROMPT_LOCAL_ID)]: privatePrompt,
    [unpubGridKey(GRID_LOCAL_ID)]: grid,
  };
}

/**
 * Mount the real `App` with the shared store and the per-viewer KV both injected.
 *
 * 🔴 `shared` IS INJECTED SO `appends` IS OBSERVABLE — that array is the evidence for
 * the wire claims below. Generation, publish and the gated reads still come from the
 * REAL mock host, so the run case is a real round trip rather than a fake one.
 */
function mountApp(opts: { shared: SharedStore; store?: Record<string, unknown> }) {
  return render(
    <Harness
      viewer={{ id: VIEWER_ID, username: 'me' }}
      theme="dark"
      consentGranted
      buzzBudget={1000}
      buzz={{ balance: 5000 }}
      buzzBalance={{ blue: 0, green: 0, yellow: 5000 }}
      generation={{ costPerGen: 12, images: ['https://image.civitai.com/open-private.jpeg'] }}
      shared={{ seed: [] }}
      showLog={false}
    >
      <App
        deps={{
          resolveResources: async () => [],
          pollIntervalMs: 0,
          sleep: immediateSleep,
          shared: opts.shared,
          appStorage: fakeAppStorage(opts.store ?? seedStore()).appStorage,
        }}
      />
    </Harness>,
  );
}

const kindOf = (v: SharedStorageValue): string =>
  String((v.data as { kind?: unknown } | undefined)?.kind ?? '?');

/** The viewer's own PRIVATE grid row on My Benchmarks ▸ Grids. */
async function privateGridCard(): Promise<HTMLElement> {
  await openMyList('grid');
  return waitFor(() => {
    const card = screen
      .getAllByTestId('unpublished-card')
      .find((el) => el.getAttribute('data-local-id') === GRID_LOCAL_ID);
    if (!card) throw new Error('the private grid row is not listed');
    return card;
  });
}

/** Press Open on the private grid row, which also returns the viewer to Home. */
async function openPrivateGrid(): Promise<HTMLElement> {
  const card = await privateGridCard();
  await userEvent.click(within(card).getByTestId('unpublished-open'));
  return screen.findByTestId('grid-open-panel');
}

// ===========================================================================
// 1 — OPEN RENDERS THE PRIVATE GRID'S MATRIX
// ===========================================================================

describe('🔴 Open on an unpublished grid shows its matrix', () => {
  it('🔴 names the private grid, badges it Private, and renders the cells its BOARD members make', async () => {
    const { shared } = fakeShared({ seed: BOARD });
    mountApp({ shared });
    // The premise: the app opens on the Top Grid, so the assertions below are about a
    // panel that CHANGED rather than one that happened to already say this.
    expect((await screen.findByTestId('grid-open-title')).textContent).toBe(TOP_GRID_NAME);

    const panel = await openPrivateGrid();

    expect(within(panel).getByTestId('grid-open-title').textContent).toBe(PRIVATE_GRID_NAME);
    expect(within(panel).getByTestId('grid-open-private-badge').textContent).toBe('Private');
    // 🔴 NOT THE SYSTEM NOTE. "Nobody owns it, so it cannot be voted on" is flatly
    // wrong about a grid the viewer owns, and the branch used to key off "there is no
    // shared row" — which the private grid also satisfies.
    expect(within(panel).queryByTestId('grid-open-system-note')).toBeNull();
    // Its own description renders, like a published grid's.
    expect(within(panel).getByTestId('grid-open-description').textContent).toBe(
      mixedPrivateGrid.description,
    );

    // 🔴 THE MEMBER COUNT IS THE RESOLVED ONE, NOT THE AUTHORED ONE. Four members were
    // authored; two have a row on the board. A count of "2 matchups × 2 prompts" here
    // would be the authored lengths and would promise cells that cannot exist.
    expect(within(panel).getByTestId('grid-open-members').textContent).toBe(
      '1 matchup × 1 prompt',
    );

    const matrix = await screen.findByTestId('results-grid');
    const cells = within(matrix).getAllByTestId('grid-cell');
    expect(cells).toHaveLength(1);
    // The row and column are the BOARD members, by name.
    expect(within(matrix).getByTestId('grid-group-matchup').textContent).toContain(
      'Board Matchup A',
    );
    expect(within(matrix).getByTestId('grid-col-header').textContent).toContain('Board Prompt One');
    // 🔴 AND THE PRIVATE MEMBERS ARE ABSENT FROM THE MATRIX ENTIRELY — the DOM half of
    // the wire claim in the last case. A private member has no board row, so it
    // contributes no row and no column and therefore no cell identity.
    expect(matrix.textContent ?? '').not.toContain('Private Matchup P');
    expect(matrix.textContent ?? '').not.toContain('Private Prompt Q');
  });

  it('🔴 the shortfall sentence attributes NO cause — not "their authors removed them"', async () => {
    const { shared } = fakeShared({ seed: BOARD });
    mountApp({ shared });
    const panel = await openPrivateGrid();

    const notice = within(panel).getByTestId('grid-missing-notice');
    // 🔴 THE WHOLE NORMALISED STRING, typed out as a literal. The artifact under test
    // IS prose, so a keyword guard ("private", "published") is walkable by a reword
    // that quietly puts the false attribution back.
    expect((notice.textContent ?? '').replace(/\s+/g, ' ').trim()).toBe(
      "2 of this grid's 4 members are not in the matrix below. The matrix is built from " +
        'the rows the app has read off the shared board, so a member with no such row is ' +
        'left out — your own private matchups and prompts until you publish them, and a ' +
        'member another author withdrew. ' +
        'Everything else below still renders; nothing was quietly dropped.',
    );
    // 🔴 THE PHRASE THAT MUST NOT APPEAR. `missingMembersNotice`'s complete-scan arm
    // says it, and about the viewer's OWN still-private member it is simply false.
    expect(notice.textContent ?? '').not.toContain('their authors removed them');
    expect(notice.textContent ?? '').not.toContain('no longer on the board');
  });

  it('🔴 Open RENDERS what resolves rather than refusing — even with members missing', async () => {
    // 🔴 THE DECISION, ASSERTED. A grid row can report missing members, and this is the
    // recorded answer to "what does Open do then": it opens, renders the surviving
    // members, and discloses the shortfall. Refusing would hide a working matrix
    // because one member of it is private — the normal state of a grid still being
    // assembled. `lib/gridEntries.ts`'s `privateGridShortfall` states it in-file.
    const { shared } = fakeShared({ seed: BOARD });
    mountApp({ shared });
    const panel = await openPrivateGrid();

    // Both at once: the shortfall is disclosed AND the matrix is runnable.
    expect(within(panel).getByTestId('grid-missing-notice')).toBeInTheDocument();
    const cell = within(await screen.findByTestId('results-grid')).getByTestId('grid-cell');
    expect(cell).toHaveAttribute('data-state', 'empty');
    expect(within(cell).getByTestId('run-cell')).toBeInTheDocument();
  });
});

// ===========================================================================
// 1b — THE ALL-PRIVATE GRID: AN EMPTY MATRIX, WITH THE RIGHT NEXT STEP
// ===========================================================================

describe('🔴 an ALL-PRIVATE grid opens to an honest empty state, not the system one', () => {
  /** Open the all-private grid. Same route; only the seeded record differs. */
  async function openAllPrivate(): Promise<HTMLElement> {
    const { shared } = fakeShared({ seed: BOARD });
    mountApp({ shared, store: seedStore(allPrivateGrid) });
    return openPrivateGrid();
  }

  it('🔴 the empty state is the PRIVATE one — no "Submit a matchup", no system copy', async () => {
    const panel = await openAllPrivate();

    // THE PREMISE: nothing resolved, so the matrix is empty and this is the screen the
    // viewer lands on. `grid-open-members` is the resolved count, not the authored one.
    expect(within(panel).getByTestId('grid-open-members').textContent).toBe(
      '0 matchups × 0 prompts',
    );
    const empty = await screen.findByTestId('grid-empty');

    // 🔴 THE WHOLE NORMALISED STRINGS, AGAINST THE TYPED LITERALS ABOVE — never against
    // the imported constants, which would move with any reword. The artifact under test
    // IS prose, so a keyword guard is walkable by a reword; so is an equality whose
    // expected side is the thing being reworded. See the literals' own header.
    expect(norm(empty.textContent)).toContain(EXPECTED_EMPTY_TITLE);
    expect(norm(empty.textContent)).toContain(EXPECTED_EMPTY_BODY);

    // 🔴 AND THE EXPORTED CONSTANTS ARE THE SAME TEXT. Two separate claims: the screen
    // shows this, and the module-level string every other consumer reads IS this. The
    // second is what a surface that renders the constant without a test of its own
    // inherits.
    expect(norm(PRIVATE_GRID_EMPTY_TITLE)).toBe(EXPECTED_EMPTY_TITLE);
    expect(norm(PRIVATE_GRID_EMPTY_BODY)).toBe(EXPECTED_EMPTY_BODY);

    // 🔴 THE SYSTEM-GRID COPY IS GONE, not merely supplemented. "Submit and vote to fill
    // the top slots" is about the TOP GRID, whose members are the board's top-voted rows;
    // it says nothing true about a grid the viewer authored out of their own drafts.
    expect(empty.textContent ?? '').not.toContain('No benchmark grid yet');
    expect(empty.textContent ?? '').not.toContain('Submit and vote to fill the top slots');

    // 🔴 AND THE WRONG ACTION IS ABSENT. The button opened the PUBLIC matchup submit
    // form — a new matchup, when the viewer already has the members and owes only the
    // publish. An absence plus a POSITIVE CONTROL in the same frame: the empty state
    // itself rendered, so this is a missing button and not a missing panel.
    expect(within(empty).queryByTestId('grid-empty-add-matchup')).toBeNull();
    expect(within(empty).queryByTestId('grid-empty-add-prompt')).toBeNull();
    expect(within(empty).queryByRole('button')).toBeNull();
  });

  it('🔴 the shortfall sentence drops its "everything else below" clause when nothing is below', async () => {
    const panel = await openAllPrivate();
    const notice = within(panel).getByTestId('grid-missing-notice');

    // 🔴 THE WHOLE NORMALISED STRING, typed out. The reassurance clause is FALSE here —
    // there is no "everything else below" — and a sentence that renders it over an empty
    // matrix is the same class of lie the clause exists to deny.
    expect((notice.textContent ?? '').replace(/\s+/g, ' ').trim()).toBe(
      "2 of this grid's 2 members are not in the matrix below. The matrix is built from " +
        'the rows the app has read off the shared board, so a member with no such row is ' +
        'left out — your own private matchups and prompts until you publish them, and a ' +
        'member another author withdrew.',
    );
    expect(notice.textContent ?? '').not.toContain('Everything else below still renders');
  });
});

// ===========================================================================
// 2 — THE PUBLISHED PATH AND THE TOP-GRID DEFAULT STILL WORK
// ===========================================================================

// ⚠️ TWO CASES WERE DELETED FROM THIS BLOCK AND IT IS WORTH SAYING WHICH, so nobody
// re-adds them as "missing coverage". They were "the DEFAULT is still the Top Grid …" and
// "the COMMUNITY board Open still opens a published grid …", both labelled INVARIANT
// GUARDS and both GREEN at `bb63087`. Everything they asserted was already held more
// strongly elsewhere — the Top-Grid default and its system note by
// `boardTruncation.test.tsx`, the published arm's panel and the fact that its vote
// reaches the HOST by `gridsView.test.tsx`'s own cases — except for one line each: the
// ABSENCE of `grid-open-private-badge`. That line moved into `gridsView.test.tsx`'s badge
// LEDGER, which enumerates what the pack actually rendered and therefore fails when the
// pill returns under any spelling, not only its own testid.
describe('🔴 the private open path leaves the community board intact', () => {
  it('🔴 a PRIVATE grid being open leaves the community list COMPLETE', async () => {
    // 🔴 THIS CASE CAUGHT A REAL DEFECT IN THIS BRANCH'S FIRST IMPLEMENTATION, and the
    // defect is worth naming because it is invisible by inspection. `GridsView`'s
    // open-filter compared `entryOpenKey(entry) !== openKey`, and `entryOpenKey`
    // returns `null` for the SYSTEM entry — so passing `null` to mean "a private grid
    // is open and nothing in this list is" excluded the Top Grid from the board. Not
    // open, not listed, gone. `openKey` is an `entryDomKey` now (total on listable
    // entries, which frees `null` for "none of them"); see `GridsView.openKey`.
    //
    // ⚠️ SO ITS BASE STATUS IS NEITHER OF THE TWO USUAL LABELS: it is RED at
    // `bb63087` only because Open-a-private-grid does not exist there, and it was RED
    // mid-branch against a real bug. It is regression coverage over an intermediate
    // state of this PR, not over `main`.
    const { shared } = fakeShared({ seed: BOARD });
    mountApp({ shared });
    await screen.findByTestId('grid-view');
    await openPrivateGrid();

    const keys = await waitFor(() => {
      const found = screen.getAllByTestId('grid-card').map((c) => c.getAttribute('data-key'));
      if (!found.includes('gk-pub')) throw new Error(`the board grid is missing: ${found}`);
      return found;
    });
    // The Top Grid is listed too, because it is not the open one either.
    expect(keys).toContain('__system__');
  });

  it('🔴 "No published grids yet" and a LISTED CARD are never on screen together', async () => {
    // 🔴 THE EMPTY STATE WAS GATED ON `grids.length === 0`, WHICH USED TO IMPLY THE
    // RENDERED LIST WAS EMPTY. It no longer does: with a PRIVATE grid open, `openKey` is
    // `null` ("nothing in this list is open"), so the Top Grid stays in the list — and
    // the banner saying there are none rendered directly above the card that is one.
    // The gate is the RENDERED LIST now, which is the thing the sentence is about.
    const { shared } = fakeShared({ seed: [row('mk-a', 9, 'Board Matchup A', comboData('cfg-a')), row('qk-1', 7, 'Board Prompt One', promptData)] });
    mountApp({ shared });
    await screen.findByTestId('grid-view');

    // POSITIVE CONTROL FIRST, in the state the banner is FOR: nothing published, the Top
    // Grid open, so the list really is empty and the sentence really is the whole story.
    await waitFor(() => expect(screen.getByTestId('grids-empty')).toBeInTheDocument());
    expect(screen.queryAllByTestId('grid-card')).toHaveLength(0);

    // …then open a private grid, which pushes the Top Grid into the list.
    await openPrivateGrid();

    const keys = await waitFor(() => {
      const found = screen.getAllByTestId('grid-card').map((c) => c.getAttribute('data-key'));
      if (!found.includes('__system__')) throw new Error(`the Top Grid is not listed: ${found}`);
      return found;
    });
    expect(keys).toEqual(['__system__']);
    // 🔴 THE CLAIM: the banner is gone, because the list it describes is not empty.
    expect(screen.queryByTestId('grids-empty')).toBeNull();
  });

  // ⚠️ INVARIANT GUARD — GREEN at `bb63087`, where no row had an Open at all, so it
  // passes VACUOUSLY there. It is not regression coverage; what it buys is forward,
  // against the control being re-added to the published half (or to the archived rows,
  // which share its action group).
  it('🔴 a PUBLISHED grid gets NO Open on My Benchmarks — live row or archived', async () => {
    // 🔴 THE CUT, ASSERTED ON BOTH HALVES OF THE LIST. My Benchmarks ▸ Grids briefly
    // offered Open on the viewer's own PUBLISHED grids, under a `my-open` testid. It was
    // removed: a published grid is listed on the community board and already carries
    // `grid-open` there, so the control was a second door to one destination — for the
    // one kind of grid that was never short of doors.
    //
    // 🔴 AND THE ARCHIVED HALF IS THE REASON THIS CASE EXISTS RATHER THAN A ONE-LINER ON
    // THE LIVE ROW. `MyList` renders both halves through the SAME `publishedActions`, so
    // the control appeared on an ARCHIVED row too — a row the viewer has hidden from
    // their own list, offering to open a matrix. One deletion closed both, and this is
    // what makes "both" a measurement instead of a derivation.
    const { shared } = fakeShared({
      seed: [
        ...BOARD,
        row('gk-mine', 2, 'My Grid', gridData(['mk-a'], ['qk-1']), VIEWER_ID),
        row('gk-arch', 1, 'My Archived Grid', gridData(['mk-a'], ['qk-1']), VIEWER_ID),
      ],
    });
    // The archive flag is per-viewer KV, under the same store this mount injects.
    mountApp({ shared, store: { [ARCHIVE_KEY]: ['gk-arch'] } });

    await openMyList('grid');
    const live = await waitFor(() => {
      const el = screen.getAllByTestId('grid-card').find((c) => c.getAttribute('data-key') === 'gk-mine');
      if (!el) throw new Error('the own published grid is not listed');
      return el;
    });
    expect(within(live).queryByTestId('my-open')).toBeNull();
    // POSITIVE CONTROL in the same frame: the row's OTHER controls are there, so the
    // null above is a missing button and not a missing row.
    expect(within(live).getByTestId('grid-edit')).toBeInTheDocument();

    // …and the ARCHIVED half, behind its toggle.
    await userEvent.click(screen.getByTestId('archived-toggle'));
    const archivedList = await screen.findByTestId('archived-list');
    const archived = within(archivedList).getByTestId('grid-card');
    expect(archived.getAttribute('data-key')).toBe('gk-arch');
    expect(within(archived).queryByTestId('my-open')).toBeNull();
    expect(within(archived).getByTestId('unarchive-action')).toBeInTheDocument();

    // 🔴 AND THE WORD IS GONE FROM THE WHOLE SURFACE, not merely the testid — an Open
    // re-added without its id would satisfy both nulls above. The PRIVATE row's Open is
    // not on screen here: this mount seeds no private grid.
    expect(screen.queryAllByTestId('unpublished-card')).toHaveLength(0);
    expect(screen.getByTestId('my-grids-view').textContent ?? '').not.toContain('Open');
  });

  // ⚠️ INVARIANT GUARD — GREEN at `bb63087`, where NO row had an Open at all, so it
  // passed vacuously there. What it buys is forward: the control is driven by an
  // OPTIONAL callback on a component serving three nouns, and the cheap mistake is
  // wiring it for all of them.
  it('🔴 Open is offered on GRIDS ONLY — a matchup and a prompt row carry none', async () => {
    // 🔴 THE NEGATIVE CONTROL FOR THE OPTIONAL CALLBACKS. `MyList` serves all three
    // nouns; the control is UNMOUNTED (not disabled) where the caller has no
    // destination, and a dead Open on a matchup row would advertise an action that
    // does not exist.
    const { shared } = fakeShared({ seed: BOARD });
    mountApp({
      shared,
      store: { [draftKey(DRAFT_LOCAL_ID)]: privateMatchup, [unpubPromptKey(PROMPT_LOCAL_ID)]: privatePrompt },
    });
    await screen.findByTestId('grid-view');

    for (const noun of ['matchup', 'prompt'] as const) {
      await openMyList(noun);
      const card = within(await screen.findByTestId(`my-list-${noun}`)).getByTestId(
        'unpublished-card',
      );
      expect(
        within(card).queryByTestId('unpublished-open'),
        `the ${noun} row offers an Open it cannot perform`,
      ).toBeNull();
      // POSITIVE CONTROL in the same frame: the row's other controls ARE there, so the
      // null above is a missing button and not a missing row.
      expect(within(card).getByTestId('unpublished-edit')).toBeInTheDocument();
    }
  });

  it('🔴 …and the GRID row DOES offer it — the other half of that control', async () => {
    // 🔴 A SEPARATE MOUNT, NOT A SECOND `mountApp` INSIDE THE CASE ABOVE. Two Apps in
    // one jsdom document makes every `nav-*` testid resolve twice and the failure
    // ("Found multiple elements") reads nothing like the real cause.
    const { shared } = fakeShared({ seed: BOARD });
    mountApp({ shared });
    const gridCard = await privateGridCard();
    expect(within(gridCard).getByTestId('unpublished-open')).toBeInTheDocument();
  });
});

// ===========================================================================
// 3 — THE COPY ON THE CONFIRM PATH
// ===========================================================================

describe('🔴 the confirm path for a PRIVATE grid says the images go public anyway', () => {
  /** Drive the single cell of whatever grid is open to its confirm state. */
  async function confirmCell(): Promise<HTMLElement> {
    const matrix = await screen.findByTestId('results-grid');
    const cell = within(matrix).getByTestId('grid-cell');
    await userEvent.click(within(cell).getByTestId('run-cell'));
    return screen.findByTestId('cell-confirm');
  }

  it('🔴 renders PRIVATE_GRID_RUN_NOTICE verbatim, alongside the ordinary public notice', async () => {
    const { shared } = fakeShared({ seed: BOARD });
    mountApp({ shared });
    await openPrivateGrid();

    const confirm = await confirmCell();
    const notice = within(confirm).getByTestId('cell-private-grid-notice');
    // 🔴 THE WHOLE NORMALISED STRING AGAINST THE TYPED LITERAL ABOVE. Comparing the
    // rendered text to the imported constant — which is what this did — pins nothing: a
    // reword moves both sides together. See the literals' own header for the
    // measurement that showed it.
    expect(norm(notice.textContent)).toBe(EXPECTED_RUN_NOTICE);
    // 🔴 AND THE EXPORTED CONSTANT IS THAT SAME TEXT — the claim about the module, next
    // to the claim about the screen. `MyList` and `MyGridsView` both point a viewer at
    // this constant from their own docblocks without rendering it.
    expect(norm(PRIVATE_GRID_RUN_NOTICE)).toBe(EXPECTED_RUN_NOTICE);
    // 🔴 ADDITIVE, NOT A REPLACEMENT: the sentence every grid carries is still there.
    expect(within(confirm).getByTestId('cell-public-notice')).toBeInTheDocument();
    // And it is on the confirm panel, with Confirm — the press that SPENDS the Buzz.
    // Not the press that makes the images public: `PRIVATE_GRID_RUN_NOTICE`'s docblock
    // records why (a second, host-side confirm after generation, plus three branches
    // that end with nothing on the board). (DOM containment only; jsdom resolves no
    // layout, so this says nothing about what sits beside what on screen.)
    expect(within(confirm).getByTestId('cell-confirm-run')).toBeInTheDocument();
  });

  it('🔴 THE NEGATIVE CONTROL: a PUBLISHED grid gets the ordinary notice and NOT this one', async () => {
    const { shared } = fakeShared({ seed: BOARD });
    mountApp({ shared });
    await screen.findByTestId('grid-view');

    const card = await waitFor(() => {
      const el = screen.getAllByTestId('grid-card').find((c) => c.getAttribute('data-key') === 'gk-pub');
      if (!el) throw new Error('the published grid is not listed');
      return el;
    });
    await userEvent.click(within(card).getByTestId('grid-open'));

    const confirm = await confirmCell();
    expect(within(confirm).getByTestId('cell-public-notice')).toBeInTheDocument();
    expect(
      within(confirm).queryByTestId('cell-private-grid-notice'),
      'the private-grid notice rendered on a PUBLISHED grid',
    ).toBeNull();
    // 🔴 AND THE WORDS ARE GONE, not merely the testid — a notice re-spelled without
    // its id would satisfy the null above.
    expect(confirm.textContent ?? '').not.toContain('This grid is private');
  });
});

// ===========================================================================
// 4 — THE WIRE: NO LOCAL ID CAN REACH A RESULT ROW
// ===========================================================================

describe('🔴 running a cell of a PRIVATE grid writes only SHARED keys', () => {
  it('🔴 the result row names the BOARD keys, and NOTHING on the append log spells a local id', async () => {
    const { shared, appends } = fakeShared({ seed: BOARD });
    mountApp({ shared });
    await openPrivateGrid();

    const matrix = await screen.findByTestId('results-grid');
    // 🔴 THE PREMISE, ASSERTED: exactly one cell, and it is the BOARD × BOARD pair.
    // Had a private member somehow resolved there would be four cells and the click
    // below could be about the wrong one.
    const cells = within(matrix).getAllByTestId('grid-cell');
    expect(cells).toHaveLength(1);

    await userEvent.click(within(cells[0]!).getByTestId('run-cell'));
    await userEvent.click(await screen.findByTestId('cell-confirm-run'));

    const result = await waitFor(
      () => {
        const hit = appends.find((v) => kindOf(v) === 'result');
        if (!hit) throw new Error('no result row was appended');
        return hit;
      },
      { timeout: 5000 },
    );
    const data = result.data as { comboKey: string; configId: string; promptKey: string };
    // 🔴 THE CLAIM: the BOARD keys, never the local ids. This row is both permanent
    // and NOT grid-scoped, so a local id here would be unresolvable for every viewer
    // and every grid containing the cell.
    expect(data.comboKey, 'the result row was keyed on a private matchup’s LOCAL id').toBe('mk-a');
    expect(data.promptKey, 'the result row was keyed on a private prompt’s LOCAL id').toBe('qk-1');
    expect(data.configId).toBe('cfg-a');

    // 🔴 POSITIVE CONTROL ON THE SCAN, in the same case: a result row DID reach the
    // log, so the whole-log absence below is an absence and not an empty array.
    expect(appends.filter((v) => kindOf(v) === 'result')).toHaveLength(1);
    const wire = JSON.stringify(appends);
    expect(wire, 'a private local id reached the public board').not.toContain(DRAFT_LOCAL_ID);
    expect(wire, 'a private local id reached the public board').not.toContain(PROMPT_LOCAL_ID);
    expect(wire, 'the private GRID’s local id reached the public board').not.toContain(
      GRID_LOCAL_ID,
    );
    // 🔴 AND NO GRID ROW WAS APPENDED AT ALL. Opening a private grid must not publish
    // it — that is `publishGridById`'s job, behind its own confirm, and a run that
    // quietly appended the grid would make Open an irreversible action.
    expect(appends.filter((v) => kindOf(v) === 'grid')).toHaveLength(0);
    expect(appends.filter((v) => kindOf(v) === 'combination')).toHaveLength(0);
    expect(appends.filter((v) => kindOf(v) === 'prompt')).toHaveLength(0);
  });
});
