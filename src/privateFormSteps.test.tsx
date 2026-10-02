// 🔴 THE STEP SHAPE OF THE THREE *PRIVATE* CREATE/RESUME PATHS, driven through the
// REAL App — i.e. the `multiStep` WIRING in `App.tsx`, not the forms' own behaviour.
//
// ── WHY THIS FILE EXISTS: FOUR MUTANTS SURVIVED A FULLY GREEN 914-TEST SUITE ──
//
// The operator's decision is a 🔴: a NEW item ALWAYS shows step 2; an EDIT stays a
// single page. The three forms each pin that for themselves (`MatchupForm.test.tsx`,
// `PromptForm.test.tsx`, `GridForm.test.tsx`) by passing `multiStep` directly — which
// is exactly what makes them blind to the thing that actually decides it in
// production: FIVE `multiStep={…}` expressions in `App.tsx` (`:3010`, `:3041`,
// `:3064`, `:3091`, `:3125`), plus ONE form instance that passes no prop at all —
// the published-grid edit modal (`modal.kind === 'grid'`, `:3103`), which relies on
// `GridForm`'s `multiStep = false` default. That defaulting path is NOT an uncovered
// gap: flipping the default to `true` kills 6 tests, 4 of them in
// `myBenchmarks.test.tsx`.
//
// The two PUBLIC create expressions were covered incidentally; the three PRIVATE ones
// were not, and an audit measured the cost — each of these mutants left 63 files /
// 914 tests GREEN:
//
//   `draft`        `multiStep={!modal.existing}` -> `multiStep`        (a RESUMED private matchup gets paged)
//   `draft`                                      -> `multiStep={false}` (a NEW private matchup loses step 2)
//   `unpub-prompt`                               -> `multiStep={false}` (a NEW private prompt loses step 2)
//   `unpub-grid`                                 -> `multiStep`        (a RESUMED private grid gets paged)
//
// 🔴 THE ROOT CAUSE WAS A TEST HELPER BEING *HELPFUL*. `drafts.test.tsx` and
// `myCommunity.test.tsx` press `form-next` ONLY IF IT EXISTS, so that one helper can
// drive both openers. That is the right call for a case about the publish boundary —
// and it is precisely what makes every such case walk either shape and notice no
// regression. A shape-agnostic walk cannot be a shape guard. So the guard lives here
// instead, stated once per path, with no `if`.
//
// 🔴 EVERY CASE BELOW IS PAIRED, CREATE *AND* RESUME, FOR THE SAME NOUN. A lone
// "a new one is paged" passes against `multiStep` hardcoded true, which breaks all
// three edits; a lone "a resumed one is not" passes against `multiStep={false}`,
// which breaks all three creates. Both mutants are in the list above, which is why
// neither half is optional.

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Harness } from './test-harness.js';

import { App, type AppDeps } from './App.js';
import { CKPT_SDXL, fakeAppStorage, fakeShared, immediateSleep, openMyList } from './test-helpers.js';
import { draftKey } from './lib/drafts.js';
import { unpubGridKey } from './lib/grids.js';
import { unpubPromptKey } from './lib/unpubPrompts.js';

const VIEWER_ID = 99;

const STAMP = '2026-09-07T00:00:00.000Z';

/** A stored private matchup, so the RESUME opener has something to open. */
const STORED_MATCHUP = {
  v: 1,
  localId: 'l1',
  name: 'A stored private matchup',
  description: '',
  configs: [
    {
      id: 'cfg1',
      checkpoint: { versionId: 1001, modelId: 500, baseModel: 'SDXL 1.0', modelName: 'JuggernautXL' },
      loras: [],
    },
  ],
  updatedAt: STAMP,
};

const STORED_PROMPT = {
  v: 1,
  localId: 'up1',
  name: 'A stored private prompt',
  description: '',
  default: { prompt: 'a quiet street at dawn', params: {} },
  updatedAt: STAMP,
};

/**
 * A stored private grid.
 *
 * ⚠️ AT LEAST ONE AXIS KEY IS NOT DECORATION — `parseUnpubGrid` returns `null` only
 * when BOTH axes are empty (`unpubGrids.ts:88` is `&&`), so a grid seeded with two
 * empty arrays never reaches the list and the resume opener below has nothing to
 * click. ONE key would therefore suffice; both are given because a grid with one axis
 * is not a shape the builder can produce, and this fixture should not be the only
 * place such a shape exists.
 * The keys point at no real board row on purpose: this case is about the form's step
 * shape, and `GridForm` renders a dangling key as a named card, so a withdrawn
 * member cannot change the shape under test.
 */
const STORED_GRID = {
  v: 1,
  localId: 'ug1',
  name: 'A stored private grid',
  description: '',
  matchupKeys: ['mk-stored'],
  promptKeys: ['qk-stored'],
  updatedAt: STAMP,
};

function mountApp(deps: Partial<AppDeps>) {
  return render(
    <Harness
      viewer={{ id: VIEWER_ID, username: 'me' }}
      theme="dark"
      consentGranted
      buzzBudget={1000}
      buzzBalance={{ blue: 0, green: 0, yellow: 5000 }}
      cannedPicks={{ Checkpoint: CKPT_SDXL }}
      shared={{ seed: [] }}
      showLog={false}
    >
      <App
        deps={{
          resolveResources: async () => [],
          pollIntervalMs: 0,
          sleep: immediateSleep,
          ...deps,
        }}
      />
    </Harness>,
  );
}

/**
 * Assert a form is in the TWO-STEP (create) shape, then that Next reaches step 2.
 *
 * 🔴 NO `if`. The point of this file is that the shape is asserted, never sniffed —
 * the helpers that sniffed it are what let four mutants through.
 */
async function expectPagedCreate(form: HTMLElement, nameTestId: string) {
  expect(
    within(form).queryByTestId('form-step-content'),
    'a NEW private record did not open on step 1 — `multiStep` is wired false for this path',
  ).not.toBeNull();
  expect(
    within(form).queryByTestId('form-next'),
    'a NEW private record offers no way to reach step 2',
  ).not.toBeNull();
  // The name lives on step 2, so it must NOT be reachable yet.
  expect(
    within(form).queryByTestId(nameTestId),
    'the name input is on step 1 — this path is not paged',
  ).toBeNull();

  await userEvent.click(within(form).getByTestId('form-next'));

  expect(
    within(form).queryByTestId('form-step-meta'),
    'Next did not reach step 2 on a NEW private record',
  ).not.toBeNull();
  expect(
    within(form).queryByTestId(nameTestId),
    'step 2 of a NEW private record holds no name input',
  ).not.toBeNull();
}

/** Assert a form is in the SINGLE-PAGE (edit) shape, with both sections mounted. */
function expectSinglePageEdit(form: HTMLElement, nameTestId: string, contentTestId: string) {
  expect(
    within(form).queryByTestId('form-step-content'),
    'a RESUMED private record was wrapped in step 1 — `multiStep` is wired true for this path',
  ).toBeNull();
  expect(
    within(form).queryByTestId('form-step-meta'),
    'a RESUMED private record was wrapped in step 2 — it was paged',
  ).toBeNull();
  expect(
    within(form).queryByTestId('form-next'),
    'a RESUMED private record offers Next — it was paged',
  ).toBeNull();
  // 🔴 AND BOTH SECTIONS ARE ON THE ONE PAGE. Without this, "no step wrappers" is
  // satisfied by a form that rendered neither section.
  expect(
    within(form).queryByTestId(nameTestId),
    'the single EDIT page holds no name input',
  ).not.toBeNull();
  expect(
    within(form).queryByTestId(contentTestId),
    'the single EDIT page holds no content section',
  ).not.toBeNull();
}

describe('🔴 the PRIVATE matchup path (`draft`) — step shape, both directions', () => {
  it('🔴 pages a NEW private matchup and pages a RESUMED one not at all', async () => {
    // ---- NEW ----
    const fresh = fakeAppStorage();
    const { unmount } = mountApp({ shared: fakeShared({ seed: [] }).shared, appStorage: fresh.appStorage });
    await openMyList('matchup');
    await userEvent.click(await screen.findByTestId('new-unpublished'));
    await expectPagedCreate(await screen.findByTestId('matchup-form'), 'matchup-name');
    unmount();

    // ---- RESUMED ----
    const stored = fakeAppStorage({ [draftKey('l1')]: STORED_MATCHUP });
    mountApp({ shared: fakeShared({ seed: [] }).shared, appStorage: stored.appStorage });
    const section = await openMyList('matchup');
    // POSITIVE CONTROL: the stored record really is listed, so the resume opener
    // below is opening something rather than failing to render.
    await waitFor(() => expect(within(section).getByTestId('unpublished-card')).toBeInTheDocument());
    await userEvent.click(within(section).getByTestId('unpublished-edit'));
    const form = await screen.findByTestId('matchup-form');
    // 🔴 SHAPE FIRST, VALUE SECOND, AND THE ORDER IS LOAD-BEARING. The value read
    // below is a `getByTestId` inside `expect(...)`, which THROWS during argument
    // evaluation when the form is wrongly paged — pre-empting the named diagnostics
    // in `expectSinglePageEdit` with a bare "Unable to find an element". Measured:
    // with the value check first, the mutant that pages a resumed private matchup
    // reported the element, not the claim.
    expectSinglePageEdit(form, 'matchup-name', 'config-card');
    expect((within(form).getByTestId('matchup-name') as HTMLInputElement).value).toBe(
      'A stored private matchup',
    );
  });
});

describe('🔴 the PRIVATE prompt path (`unpub-prompt`) — step shape, both directions', () => {
  it('🔴 pages a NEW private prompt and pages a RESUMED one not at all', async () => {
    const fresh = fakeAppStorage();
    const { unmount } = mountApp({ shared: fakeShared({ seed: [] }).shared, appStorage: fresh.appStorage });
    await openMyList('prompt');
    await userEvent.click(await screen.findByTestId('new-unpublished'));
    await expectPagedCreate(await screen.findByTestId('prompt-form'), 'prompt-name');
    unmount();

    const stored = fakeAppStorage({ [unpubPromptKey('up1')]: STORED_PROMPT });
    mountApp({ shared: fakeShared({ seed: [] }).shared, appStorage: stored.appStorage });
    const section = await openMyList('prompt');
    await waitFor(() => expect(within(section).getByTestId('unpublished-card')).toBeInTheDocument());
    await userEvent.click(within(section).getByTestId('unpublished-edit'));
    const form = await screen.findByTestId('prompt-form');
    // Shape first — see the matchup case for why the order matters.
    expectSinglePageEdit(form, 'prompt-name', 'prompt-default');
    expect((within(form).getByTestId('prompt-name') as HTMLInputElement).value).toBe(
      'A stored private prompt',
    );
  });
});

describe('🔴 the PRIVATE grid path (`unpub-grid`) — step shape, both directions', () => {
  it('🔴 pages a NEW private grid and pages a RESUMED one not at all', async () => {
    const fresh = fakeAppStorage();
    const { unmount } = mountApp({ shared: fakeShared({ seed: [] }).shared, appStorage: fresh.appStorage });
    await openMyList('grid');
    await userEvent.click(await screen.findByTestId('new-unpublished'));
    await expectPagedCreate(await screen.findByTestId('grid-form'), 'grid-form-name');
    unmount();

    const stored = fakeAppStorage({ [unpubGridKey('ug1')]: STORED_GRID });
    mountApp({ shared: fakeShared({ seed: [] }).shared, appStorage: stored.appStorage });
    const section = await openMyList('grid');
    await waitFor(() => expect(within(section).getByTestId('unpublished-card')).toBeInTheDocument());
    await userEvent.click(within(section).getByTestId('unpublished-edit'));
    const form = await screen.findByTestId('grid-form');
    // Shape first — see the matchup case. The grid's step-1 content is the two
    // axis pickers.
    expectSinglePageEdit(form, 'grid-form-name', 'grid-form-pick-rows');
    expect((within(form).getByTestId('grid-form-name') as HTMLInputElement).value).toBe(
      'A stored private grid',
    );
  });
});
