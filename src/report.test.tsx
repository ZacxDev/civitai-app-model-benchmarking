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

import { Harness } from '@civitai/blocks-react/testing';
import type { SharedListItem } from '@civitai/blocks-react';

import { App, type AppDeps } from './App.js';
import { fakeAppStorage, fakeShared, immediateSleep } from './test-helpers.js';
import type { CombinationData } from './types.js';

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

function combo(key: string, authorUserId: number, title: string): SharedListItem {
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

function renderApp(deps: Partial<AppDeps>, viewer: { id: number; username: string } | null) {
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

describe('report — the board’s abuse seam', () => {
  it('is offered on ANOTHER viewer’s row and not on the viewer’s own', async () => {
    const { shared } = fakeShared({
      seed: [combo('theirs', OTHER_ID, 'Someone else’s combo'), combo('mine', VIEWER_ID, 'My combo')],
    });
    renderApp({ shared, appStorage: fakeAppStorage().appStorage, track: vi.fn() }, { id: VIEWER_ID, username: 'me' });

    const cards = await screen.findAllByTestId('combo-card');
    expect(cards).toHaveLength(2);

    const theirs = cards.find((c) => c.textContent?.includes('Someone else’s combo'))!;
    const mine = cards.find((c) => c.textContent?.includes('My combo'))!;

    // Their row: report offered, remove NOT (it is not the viewer's to withdraw).
    expect(within(theirs).getByTestId('combo-report')).toBeInTheDocument();
    expect(within(theirs).queryByTestId('combo-withdraw')).toBeNull();
    // Own row: remove offered, report NOT.
    expect(within(mine).getByTestId('combo-withdraw')).toBeInTheDocument();
    expect(within(mine).queryByTestId('combo-report')).toBeNull();
  });

  it('🔴 offers NO report affordance to a signed-out viewer (the host rejects those)', async () => {
    const { shared } = fakeShared({ seed: [combo('theirs', OTHER_ID, 'Someone else’s combo')] });
    renderApp({ shared, appStorage: fakeAppStorage().appStorage, track: vi.fn() }, null);

    const card = await screen.findByTestId('combo-card');
    expect(within(card).queryByTestId('combo-report')).toBeNull();

    // 🔴 POSITIVE CONTROL, in-band. A missing testid is indistinguishable from a
    // row that never rendered its action group at all, and that is exactly how
    // this case would pass with the affordance accidentally deleted for
    // EVERYONE. So assert the group IS there by pinning a sibling control that
    // is deliberately still rendered signed-out: the vote button, which shows
    // disabled and routes to the sign-in prompt.
    //
    // (The signed-IN half of the control is the sibling case above, which finds
    // `combo-report` on this same row. It cannot be re-mounted inside this test:
    // `Harness` installs a process-global mock host from a `useEffect(…, [])`,
    // so a second mount keeps talking to the anonymous host — verified, it fails
    // with the source correct.)
    //
    // Note it is NOT html-`disabled`: the vote control stays clickable signed-out
    // on purpose, so the click can raise the sign-in prompt instead of doing
    // nothing. Presence is the control here; the enabled-ness is not the claim.
    expect(within(card).getByTestId('combo-vote')).toBeInTheDocument();
  });

  it('files the report against the row’s key, and LEAVES THE ROW on the board', async () => {
    const { shared, reports } = fakeShared({ seed: [combo('theirs', OTHER_ID, 'Someone else’s combo')] });
    const track = vi.fn();
    renderApp({ shared, appStorage: fakeAppStorage().appStorage, track }, { id: VIEWER_ID, username: 'me' });

    const card = await screen.findByTestId('combo-card');
    await userEvent.click(within(card).getByTestId('combo-report'));
    await userEvent.click(screen.getByTestId('report-confirm'));

    await waitFor(() => expect(screen.getByTestId('report-done')).toBeInTheDocument());
    expect(reports).toEqual([{ key: 'theirs', reason: undefined }]);
    expect(track).toHaveBeenCalledWith('report');

    // 🔴 THE HONESTY ASSERTION. A report is escalation, not deletion — the row is
    // still on the public board. An app that optimistically removed it would
    // feel tidier and would be lying: the row is visible to everyone else, and
    // to this viewer again on the next load.
    expect(screen.getByTestId('combo-card')).toBeInTheDocument();
    expect(screen.getByTestId('combo-card')).toHaveTextContent('Someone else’s combo');
  });

  it('🔴 a host rejection surfaces instead of settling as filed', async () => {
    const { shared, reports } = fakeShared({
      seed: [combo('theirs', OTHER_ID, 'Someone else’s combo')],
      reportRejects: true,
    });
    const track = vi.fn();
    renderApp({ shared, appStorage: fakeAppStorage().appStorage, track }, { id: VIEWER_ID, username: 'me' });

    const card = await screen.findByTestId('combo-card');
    await userEvent.click(within(card).getByTestId('combo-report'));
    await userEvent.click(screen.getByTestId('report-confirm'));

    await waitFor(() =>
      expect(screen.getByTestId('report-confirm-prompt')).toHaveTextContent(/could not send/i),
    );
    expect(screen.queryByTestId('report-done')).toBeNull();
    // The app TRIED — this is what separates a refused report from one never
    // sent, and it is why the fake records attempts rather than successes.
    expect(reports).toHaveLength(1);
    // …and nothing was tracked as a filed report.
    expect(track).not.toHaveBeenCalledWith('report');
  });
});
