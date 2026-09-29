// The REPORT seam, driven through the real App against the SDK mock host.
//
// 🔴 Three claims, and the third is the one that matters most. (a) The
// affordance is offered only where the platform will actually accept it — not
// on the viewer's own rows (they have Remove), and not signed out (the host
// rejects an anonymous report). (b) Confirming calls `shared.report` with the
// row's key. (c) Reporting does NOT remove the row from the board — the host
// files it for a moderator and leaves it in place, and the app must not fake a
// removal to make the interaction feel finished.
//
// 🔴 On (a): this asserts a UI claim, not a transport one. `createMockHost` does
// not check a viewer on any SHARED_* handler, so an anonymous mutation SUCCEEDS
// against the mock while it rejects against the real host. What is testable here
// is that no report affordance is OFFERED signed out; the rejection itself is
// only observable in production. The two are not interchangeable.

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

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
import type { CombinationData, GridData, PromptData } from './types.js';

const VIEWER_ID = 99;
const OTHER_ID = 7;

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

function combo(key: string, authorUserId: number, title: string): SharedItem {
  return {
    key,
    authorUserId,
    count: 1,
    viewerVoted: false,
    value: { title, body: '', data: comboData },
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

function mountApp(deps: Partial<AppDeps>, viewer: { id: number; username: string } | null) {
  render(
    <Harness
      // 🔴 `null` is passed THROUGH, never coerced to `undefined`: the mock host
      // documents `viewer` as defaulting to a `dev-viewer`, so `undefined` gives
      // you a SIGNED-IN viewer and the anon case silently stops being the anon
      // case. Caught by this file's positive control.
      viewer={viewer}
      theme="dark"
      consentGranted
      buzzBudget={1000}
      buzz={{ balance: 5000 }}
      buzzBalance={{ blue: 0, green: 0, yellow: 5000 }}
      shared={{ seed: [] }}
      showLog={false}
    >
      <App deps={{ resolveResources: async () => [], pollIntervalMs: 0, sleep: immediateSleep, ...deps }} />
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

describe('report — the board’s abuse seam', () => {
  it('is offered on ANOTHER viewer’s row and not on the viewer’s own', async () => {
    const { shared } = fakeShared({
      seed: [combo('theirs', OTHER_ID, 'Someone else’s combo'), combo('mine', VIEWER_ID, 'My combo')],
    });
    await renderApp({ shared, appStorage: fakeAppStorage().appStorage, track: vi.fn() }, { id: VIEWER_ID, username: 'me' });

    const cards = await screen.findAllByTestId('matchup-card');
    expect(cards).toHaveLength(2);

    const theirs = cards.find((c) => c.textContent?.includes('Someone else’s combo'))!;
    const mine = cards.find((c) => c.textContent?.includes('My combo'))!;

    // 🔴 BOTH CONTROLS NOW LIVE IN THE ROW'S ⋮ MENU (the third IA pass), so each
    // half of this claim needs its own row's menu opened. The ownership rule is
    // unchanged; only where the controls are rendered moved.
    const theirMenu = await openRowMenu('matchup', theirs);
    // Their row: report offered, remove NOT (it is not the viewer's to withdraw).
    expect(within(theirMenu).getByTestId('matchup-report')).toBeInTheDocument();
    expect(within(theirMenu).queryByTestId('matchup-withdraw')).toBeNull();

    // Own row: remove offered, report NOT. Opening this menu closes the other
    // (an outside press), which is why the two are asserted in sequence.
    const myMenu = await openRowMenu('matchup', mine);
    expect(within(myMenu).getByTestId('matchup-withdraw')).toBeInTheDocument();
    expect(within(myMenu).queryByTestId('matchup-report')).toBeNull();
  });

  it('🔴 offers NO report affordance to a signed-out viewer (the host rejects those)', async () => {
    const { shared } = fakeShared({ seed: [combo('theirs', OTHER_ID, 'Someone else’s combo')] });
    await renderApp({ shared, appStorage: fakeAppStorage().appStorage, track: vi.fn() }, null);

    const card = await screen.findByTestId('matchup-card');
    expect(within(card).queryByTestId('matchup-report')).toBeNull();
    // 🔴 AND NO MENU AT ALL, which is STRONGER than the line above and is the
    // claim the ⋮ menu made possible: with no Edit, no Remove and no Report to
    // offer, an anonymous viewer on someone else's row gets no overflow trigger
    // rather than an empty one. An empty menu would be a control that promises
    // actions and has none.
    expect(within(card).queryByTestId('matchup-menu')).toBeNull();

    // 🔴 POSITIVE CONTROL, in-band. A missing testid is indistinguishable from a
    // row that never rendered its action group at all, and that is exactly how
    // this case would pass with the affordance accidentally deleted for
    // EVERYONE. So assert the group IS there by pinning a sibling control that
    // is deliberately still rendered signed-out: the vote button, which shows
    // disabled and routes to the sign-in prompt.
    //
    // (The signed-IN half of the control is the sibling case above, which finds
    // `matchup-report` on this same row. It cannot be re-mounted inside this test:
    // `Harness` installs a process-global mock host from a `useEffect(…, [])`,
    // so a second mount keeps talking to the anonymous host — verified, it fails
    // with the source correct.)
    //
    // Note it is NOT html-`disabled`: the vote control stays clickable signed-out
    // on purpose, so the click can raise the sign-in prompt instead of doing
    // nothing. Presence is the control here; the enabled-ness is not the claim.
    expect(within(card).getByTestId('matchup-vote')).toBeInTheDocument();
  });

  it('files the report against the row’s key, and LEAVES THE ROW on the board', async () => {
    const { shared, reports } = fakeShared({ seed: [combo('theirs', OTHER_ID, 'Someone else’s combo')] });
    const track = vi.fn();
    await renderApp({ shared, appStorage: fakeAppStorage().appStorage, track }, { id: VIEWER_ID, username: 'me' });

    const card = await screen.findByTestId('matchup-card');
    const menu = await openRowMenu('matchup', card);
    // 🔴 THE WHOLE HANDSHAKE HAPPENS INSIDE THE OPEN PANEL. Every press is an
    // INSIDE press, so the menu's outside-press close never fires and the confirm
    // step is reachable — the reason `ReportButton` is hosted in the panel as
    // itself rather than flattened into a single `role="menuitem"`.
    await userEvent.click(within(menu).getByTestId('matchup-report'));
    await userEvent.click(within(menu).getByTestId('matchup-report-confirm'));

    await waitFor(() => expect(screen.getByTestId('matchup-report-done')).toBeInTheDocument());
    expect(reports).toEqual([{ key: 'theirs', reason: undefined }]);
    expect(track).toHaveBeenCalledWith('report');

    // 🔴 THE HONESTY ASSERTION. A report is escalation, not deletion — the row is
    // still on the public board. An app that optimistically removed it would
    // feel tidier and would be lying: the row is visible to everyone else, and
    // to this viewer again on the next load.
    expect(screen.getByTestId('matchup-card')).toBeInTheDocument();
    expect(screen.getByTestId('matchup-card')).toHaveTextContent('Someone else’s combo');
  });

  it('🔴 a host rejection surfaces instead of settling as filed', async () => {
    const { shared, reports } = fakeShared({
      seed: [combo('theirs', OTHER_ID, 'Someone else’s combo')],
      reportRejects: true,
    });
    const track = vi.fn();
    await renderApp({ shared, appStorage: fakeAppStorage().appStorage, track }, { id: VIEWER_ID, username: 'me' });

    const card = await screen.findByTestId('matchup-card');
    const menu = await openRowMenu('matchup', card);
    await userEvent.click(within(menu).getByTestId('matchup-report'));
    await userEvent.click(within(menu).getByTestId('matchup-report-confirm'));

    await waitFor(() =>
      expect(screen.getByTestId('matchup-report-prompt')).toHaveTextContent(/could not send/i),
    );
    expect(screen.queryByTestId('matchup-report-done')).toBeNull();
    // The app TRIED — this is what separates a refused report from one never
    // sent, and it is why the fake records attempts rather than successes.
    expect(reports).toHaveLength(1);
    // …and nothing was tracked as a filed report.
    expect(track).not.toHaveBeenCalledWith('report');
  });
});

// ---------------------------------------------------------------------------
// 🔴 THE SETTLED STATE AND THE ⋮ MENU'S UNCONDITIONAL CLOSE
// ---------------------------------------------------------------------------
//
// 🔴 WHAT THIS FILE COULD NOT SEE, AND THE DEFECT THAT HID IN IT. Every case above
// asserts INSIDE the still-open panel, so all of them passed while the outcome of a
// report was being destroyed by the viewer's next click. `components/Menu.tsx` closes
// on any outside `mousedown` and on Escape, both UNCONDITIONALLY, and closing unmounts
// the panel — so `ReportButton`'s local `done` went with it and re-opening the menu
// offered Report again as if nothing had happened. `report()` is not documented
// idempotent the way `vote` is (`ReportButtonProps.reported` says so), so that is a
// second filing of the same row rather than a no-op. Before the ⋮ menu existed the
// control sat inline on the card and survived.
//
// The fix is `App.reportedKeys` plus `reported={…}` per row — the hoist
// `ReportButtonProps.reported`'s own JSDoc advises.
//
// 🔴 WATCHED FAILING, MEASURED: with the production sources at `7410ca7` and these two
// cases in place, both go red — the first on
// `getByTestId('matchup-report-done')` after the re-open, the second on
// `grid-open-report-done` after the board switch.
//
// ⚠️ WHAT IS STILL NOT COVERED, AND IS NOT CLAIMED: a page RELOAD. `reportedKeys` is
// session state in `App`, not a per-viewer `appStorage` record, so a reload re-offers
// Report on a row this viewer already reported. Nor is the FAILURE line durable — it is
// `ReportButton`'s own local state with no prop, so a refused report's "Could not send"
// still dies on the next click. Both are stated in `App.reportRow`'s docblock.
describe('report — the settled outcome outlives the menu', () => {
  it('🔴 survives an outside-press close, an Escape close, a re-open and a view switch', async () => {
    const { shared, reports } = fakeShared({
      seed: [
        combo('theirs', OTHER_ID, 'Someone else’s combo'),
        combo('other', OTHER_ID, 'A second combo nobody reported'),
      ],
    });
    await renderApp({ shared, appStorage: fakeAppStorage().appStorage, track: vi.fn() }, { id: VIEWER_ID, username: 'me' });

    const cardFor = (text: string) =>
      screen.getAllByTestId('matchup-card').find((c) => c.textContent?.includes(text))!;

    await waitFor(() => expect(screen.getAllByTestId('matchup-card')).toHaveLength(2));
    let menu = await openRowMenu('matchup', cardFor('Someone else’s combo'));
    await userEvent.click(within(menu).getByTestId('matchup-report'));
    await userEvent.click(within(menu).getByTestId('matchup-report-confirm'));
    await waitFor(() => expect(screen.getByTestId('matchup-report-done')).toBeInTheDocument());

    // ---- 1. AN OUTSIDE PRESS. This is the path that destroyed it: `Menu`'s
    //         `mousedown` listener closes with no condition on what the panel holds.
    await userEvent.click(screen.getByTestId('app-content'));
    await waitFor(() => expect(screen.queryByTestId('matchup-menu-items')).toBeNull());
    // PREMISE, not decoration: the panel really is unmounted, so the re-open below is a
    // fresh mount rather than a query against markup that never went away.
    expect(screen.queryByTestId('matchup-report-done')).toBeNull();

    // ---- 2. RE-OPEN: still settled, and Report is NOT offered a second time.
    menu = await openRowMenu('matchup', cardFor('Someone else’s combo'));
    expect(within(menu).getByTestId('matchup-report-done')).toHaveTextContent(/reported for review/i);
    expect(within(menu).queryByTestId('matchup-report')).toBeNull();

    // 🔴 …AND IT IS KEYED BY THE ROW, not global. The second combo — never reported —
    // still offers its own Report. Without this, "settled" could be a single boolean
    // and every row on the board would show as reported after one report.
    const otherMenu = await openRowMenu('matchup', cardFor('A second combo nobody reported'));
    expect(within(otherMenu).getByTestId('matchup-report')).toBeInTheDocument();
    expect(within(otherMenu).queryByTestId('matchup-report-done')).toBeNull();

    // ---- 3. ESCAPE, the other unconditional close, then re-open again.
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByTestId('matchup-menu-items')).toBeNull());
    menu = await openRowMenu('matchup', cardFor('Someone else’s combo'));
    expect(within(menu).getByTestId('matchup-report-done')).toBeInTheDocument();

    // ---- 4. A VIEW SWITCH, which unmounts the whole board. `reportedKeys` lives in
    //         `App`, above the switch, which is what makes this pass.
    await openMyList('matchup');
    await openView('Matchups');
    menu = await openRowMenu('matchup', await waitFor(() => cardFor('Someone else’s combo')));
    expect(within(menu).getByTestId('matchup-report-done')).toBeInTheDocument();
    expect(within(menu).queryByTestId('matchup-report')).toBeNull();

    // 🔴 THE POINT OF ALL FOUR: exactly ONE report reached the host. The fake records
    // ATTEMPTS, so a second filing would show up here even if it had succeeded.
    expect(reports).toEqual([{ key: 'theirs', reason: undefined }]);
  });

  it('🔴 the OPEN GRID’s report settles and survives a board switch', async () => {
    // The grid surface has no ⋮ menu — its controls are inline in `GridOpenPanel` — so
    // the hazard here is the plainer one: the panel re-renders on every board switch and
    // every `list()` refresh, and a settled control that resets invites a second filing.
    // ⚠ `parseGrid` returns null unless BOTH member lists are non-empty, so the seed
    // carries a real prompt row as well — a grid with no columns is simply not listed.
    const promptData: PromptData = { v: 3, kind: 'prompt', default: { prompt: 'a portrait', params: {} } };
    const gridData: GridData = { v: 1, kind: 'grid', matchupKeys: ['theirs'], promptKeys: ['qk-one'] };
    const { shared, reports } = fakeShared({
      seed: [
        combo('theirs', OTHER_ID, 'Someone else’s combo'),
        {
          key: 'qk-one',
          authorUserId: OTHER_ID,
          count: 1,
          viewerVoted: false,
          value: { title: 'A prompt', body: '', data: promptData },
          createdAt: new Date(0),
          updatedAt: new Date(0),
        } as unknown as SharedItem,
        {
          key: 'gk-theirs',
          authorUserId: OTHER_ID,
          count: 4,
          viewerVoted: false,
          value: { title: 'Their grid', body: '', data: gridData },
          createdAt: new Date(0),
          updatedAt: new Date(0),
        } as unknown as SharedItem,
      ],
    });
    mountApp({ shared, appStorage: fakeAppStorage().appStorage, track: vi.fn() }, { id: VIEWER_ID, username: 'me' });

    // Open the published grid, so the panel is showing a row that CAN be reported (the
    // default open entry is the system Top Grid, which offers no Report at all).
    const openGrid = await waitFor(() =>
      screen.getAllByTestId('grid-card').find((el) => el.getAttribute('data-key') === 'gk-theirs')!,
    );
    await userEvent.click(within(openGrid).getByTestId('grid-open'));

    const panel = await screen.findByTestId('grid-open-panel');
    await userEvent.click(within(panel).getByTestId('grid-open-report'));
    await userEvent.click(within(panel).getByTestId('grid-open-report-confirm'));
    await waitFor(() => expect(screen.getByTestId('grid-open-report-done')).toBeInTheDocument());

    // A board switch and back — the panel stays on Home but re-renders throughout.
    await openView('Matchups');
    await openView('Grids');
    const back = await screen.findByTestId('grid-open-panel');
    expect(within(back).getByTestId('grid-open-report-done')).toBeInTheDocument();
    expect(within(back).queryByTestId('grid-open-report')).toBeNull();
    expect(reports).toEqual([{ key: 'gk-theirs', reason: undefined }]);
  });
});
