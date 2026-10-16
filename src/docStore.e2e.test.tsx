// The document-store port's NEW behaviour, driven through the real App, the real
// `@civitai/sdk` document-store client and the SDK's own contract fake
// (`src/dev-rest.ts` → `createFakeStorage` over this repo's manifest). Nothing here
// injects a storage double at the `deps` seam: every read and write below crosses
// `fetch` and is answered by the store's rules.
//
// What it pins, each the thing the port could get wrong without any other test
// noticing:
//   1. a vote is the `vote` MARK — the wire is `PUT …/marks/vote` — and the app no
//      longer writes any per-viewer vote bookkeeping (`voted:v1`);
//   2. "did I vote" is the store's `viewer.marks`, on FIRST paint, for a vote this
//      session never cast;
//   3. ownership is the store's `author.isViewer` — the author-only Remove is offered
//      on the viewer's own row and on nobody else's;
//   4. a publish refused `consent_required` asks the host for `apps:storage:publish`
//      and tells the viewer, in viewer copy, to try again — nothing published.

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { App, type AppDeps } from './App.js';
import type { RestSharedSeed } from './dev-rest.js';
import { PUBLISH_CONSENT_MESSAGE } from './lib/records-store.js';
import { Harness, type TestHarnessProps } from './test-harness.js';
import { CKPT_SDXL, LORA_SDXL, immediateSleep, openRowMenu, openView } from './test-helpers.js';
import type { CombinationData } from './types.js';

const VIEWER_ID = 99;
const OTHER_ID = 7;

const comboSeed: CombinationData = {
  v: 2,
  kind: 'combination',
  configs: [
    {
      id: 'cfgSeed',
      checkpoint: { versionId: 1001, modelId: 500, baseModel: 'SDXL 1.0', modelName: 'JuggernautXL' },
      loras: [],
    },
  ],
};

type Call = { path: string; method: string; body: Record<string, unknown> };

function renderApp(opts: { seed?: RestSharedSeed[]; harness?: Partial<TestHarnessProps> } = {}) {
  const calls: Call[] = [];
  const outbound: Array<{ type: string; payload?: unknown }> = [];
  const deps: Partial<AppDeps> = { resolveResources: async () => [], pollIntervalMs: 0, sleep: immediateSleep };
  render(
    <Harness
      viewer={{ id: VIEWER_ID, username: 'me' }}
      theme="dark"
      consentGranted
      buzzBudget={1000}
      buzz={{ balance: 5000 }}
      buzzBalance={{ blue: 0, green: 0, yellow: 5000 }}
      cannedPicks={{ Checkpoint: CKPT_SDXL, LORA: LORA_SDXL }}
      shared={{ seed: opts.seed ?? [] }}
      onRequest={(c) => calls.push(c)}
      onOutbound={(m) => outbound.push(m)}
      showLog={false}
      {...opts.harness}
    >
      <App deps={deps} />
    </Harness>,
  );
  return { calls, outbound };
}

const combo = (title: string, authorUserId: number, voters: number[], key: string): RestSharedSeed => ({
  key,
  value: { title, body: '', data: comboSeed },
  authorUserId,
  voters,
});

describe('votes are the document store’s `vote` mark', () => {
  it('a vote PUTs the `vote` mark, reads the store’s tally back, and writes NO per-viewer vote record', async () => {
    const { calls } = renderApp({ seed: [combo('Votable', OTHER_ID, [3], '01JVOTE000000000000000000A')] });
    await openView('Matchups');
    const card = await screen.findByTestId('matchup-card');
    const vote = within(card).getByTestId('matchup-vote');
    // The seeded tally is the mark count: one OTHER viewer (3) holds a vote.
    expect(within(vote).getByTestId('vote-count')).toHaveTextContent('1');
    expect(vote).toHaveAttribute('data-voted', 'false');

    await userEvent.click(vote);
    await waitFor(() => expect(within(vote).getByTestId('vote-count')).toHaveTextContent('2'));
    expect(vote).toHaveAttribute('data-voted', 'true');

    const markPuts = calls.filter(
      (c) => c.method === 'PUT' && c.path === 'blocks/storage/records/01JVOTE000000000000000000A/marks/vote',
    );
    expect(markPuts).toHaveLength(1);
    // 🔴 THE VOTE BOOKKEEPING IS GONE: no write to the private collection at all
    // during a vote, and in particular nothing at the legacy `voted:v1` key. A
    // positive control on the observation seam: the mark PUT above WAS seen.
    const kvWrites = calls.filter((c) => c.path.startsWith('blocks/storage/kv') && c.method !== 'GET');
    expect(kvWrites.filter((c) => decodeURIComponent(c.path).includes('voted'))).toEqual([]);
  });

  it('“did I vote” is the store’s `viewer.marks` — pressed on FIRST paint for a vote cast elsewhere', async () => {
    // The viewer (99) voted in another tab/device: the seed holds their mark, and this
    // session has cast nothing. Only the store's per-viewer answer can know.
    renderApp({ seed: [combo('Voted elsewhere', OTHER_ID, [VIEWER_ID, 5], '01JVOTE000000000000000000B')] });
    await openView('Matchups');
    const card = await screen.findByTestId('matchup-card');
    const vote = within(card).getByTestId('matchup-vote');
    expect(vote).toHaveAttribute('data-voted', 'true');
    expect(within(vote).getByTestId('vote-count')).toHaveTextContent('2');
  });

  it('unvote DELETEs the viewer’s own mark and the tally drops', async () => {
    const { calls } = renderApp({ seed: [combo('Unvote me', OTHER_ID, [VIEWER_ID], '01JVOTE000000000000000000C')] });
    await openView('Matchups');
    const vote = within(await screen.findByTestId('matchup-card')).getByTestId('matchup-vote');
    expect(vote).toHaveAttribute('data-voted', 'true');
    await userEvent.click(vote);
    await waitFor(() => expect(within(vote).getByTestId('vote-count')).toHaveTextContent('0'));
    expect(
      calls.filter((c) => c.method === 'DELETE' && c.path.endsWith('/marks/vote')),
    ).toHaveLength(1);
  });
});

describe('ownership is the store’s `author.isViewer`', () => {
  it('offers Remove on the viewer’s OWN row and on no one else’s', async () => {
    renderApp({
      seed: [
        combo('Mine', VIEWER_ID, [], '01JOWN0000000000000000000A'),
        combo('Theirs', OTHER_ID, [], '01JOWN0000000000000000000B'),
      ],
    });
    await openView('Matchups');
    const cards = await screen.findAllByTestId('matchup-card');
    const mine = cards.find((c) => c.getAttribute('data-key') === '01JOWN0000000000000000000A')!;
    const theirs = cards.find((c) => c.getAttribute('data-key') === '01JOWN0000000000000000000B')!;
    expect(mine, 'positive control: the own row rendered').toBeDefined();
    expect(theirs, 'positive control: the foreign row rendered').toBeDefined();

    const myMenu = await openRowMenu('matchup', mine);
    expect(within(myMenu).getByTestId('matchup-withdraw')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');

    const theirMenu = await openRowMenu('matchup', theirs);
    expect(within(theirMenu).queryByTestId('matchup-withdraw')).toBeNull();
  });
});

describe('publishing needs the consent-gated `apps:storage:publish`', () => {
  it('a refused create asks the host for the scope and says so in viewer copy — nothing published', async () => {
    const { calls, outbound } = renderApp({
      // Both halves agree the viewer has NOT consented: the token lacks the scope (so
      // the SDK's `requestGrants` actually asks — it sends nothing for a scope the
      // token already carries) and the store refuses the create `consent_required`.
      harness: { consentGranted: false, docStore: { consent: { revoked: ['apps:storage:publish'] } } },
    });
    await openView('Matchups');
    await userEvent.click(await screen.findByTestId('submit-matchup'));
    const form = await screen.findByTestId('matchup-form');
    await userEvent.click(within(form).getByTestId('pick-checkpoint'));
    await waitFor(() => expect(within(form).getByTestId('checkpoint-card')).toHaveTextContent('JuggernautXL'));
    await userEvent.click(within(form).getByTestId('form-next'));
    await userEvent.type(within(form).getByTestId('matchup-name'), 'Needs consent');
    await userEvent.click(within(form).getByTestId('matchup-submit'));

    const errors = await within(form).findByTestId('matchup-errors');
    expect(errors).toHaveTextContent(PUBLISH_CONSENT_MESSAGE);
    // The store refused the create (positive control on the seam: it WAS attempted)…
    expect(calls.filter((c) => c.method === 'POST' && c.path === 'blocks/storage/records')).toHaveLength(1);
    // …and the host was asked for exactly the scope it lacks.
    await waitFor(() =>
      expect(
        outbound.some(
          (m) =>
            m.type === 'REQUEST_CONSENT' &&
            ((m.payload as { scopes?: string[] } | undefined)?.scopes ?? []).includes('apps:storage:publish'),
        ),
      ).toBe(true),
    );
    // Nothing reached the board.
    expect(screen.queryByText('Needs consent')).toBeNull();
  });
});
