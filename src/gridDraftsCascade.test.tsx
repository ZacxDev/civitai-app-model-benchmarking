// 🔴 PRIVATE MEMBERS IN A GRID, END TO END THROUGH THE REAL `App` — the three
// operator-asked changes that touch the public board, plus the one they could
// break.
//
// ── WHAT IS AT STAKE ───────────────────────────────────────────────────────
//
// A grid stores member KEYS. Until this change every one of them was a host-minted
// SHARED key; a viewer can now pick their own PRIVATE matchups and prompts, which
// carry only a per-viewer LOCAL id. A published grid row is world-readable, so a row
// naming a local id is a public reference NO OTHER VIEWER can resolve.
//
// ⚠️ THIS USED TO READ "effectively permanent — `shared.update`/`withdraw` are
// author-scoped, there is no merge and no edit history". REFUTED: author-scoping is what
// PERMITS the author to remove the row, and a grid row has a withdraw control in this
// app. See `lib/gridCascade.ts`'s header for the correction and its bound. What is at
// stake is unresolvability by everyone else, which is unaffected.
//
// Worse, a RESULT row is keyed
// `comboKey · configId × promptKey` and is NOT grid-scoped (`buildResultPayload`),
// so a local id reaching a result row would put an unresolvable key on a row that
// every grid containing that cell reads.
//
// So the claims below are deliberately asserted against the fake `shared.append`
// CALL LOG rather than against the screen: the screen can be right while the wire
// is wrong, and it is the wire that is permanent.
//
// ── WHY THE CALL **ORDER** IS AN ASSERTION AND NOT A DETAIL ─────────────────
//
// `append` is irreversible, so the publish ORDER decides what a mid-cascade failure
// leaves behind:
//   - members first, grid last → public members, private grid. Retryable.
//   - grid first, members last → a PUBLIC grid pointing at PRIVATE rows, forever.
// The second cannot be repaired by anything this app can call. `appends` is in call
// order, so the order claim is an equality over that array and not a "contains".
//
// ── WHAT THIS FILE DOES **NOT** CLAIM ──────────────────────────────────────
//
// ⚠️ Nothing here is evidence about the real Buzz spend. The run case drives the mock
// host's generation path, which prices and "charges" nothing real; what it proves is
// which KEYS the result row carries. The money path's own invariants live in
// `src/money-path.test.tsx`.
//
// ⚠️ And nothing here is evidence about layout. jsdom performs no layout, so "the
// confirm lists the items" is a claim about the DOM, never about what a human sees.

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { SharedStorageValue } from '@civitai/app-sdk/blocks';
import type { SharedItem } from '@civitai/sdk';

import { Harness } from './test-harness.js';
import { App, type AppDeps } from './App.js';
import type { SharedStore } from './lib/sdk-runtime.js';
import { draftKey } from './lib/drafts.js';
import { unpubGridKey } from './lib/grids.js';
import { unpubPromptKey } from './lib/unpubPrompts.js';
import {
  fakeAppStorage,
  fakeShared,
  immediateSleep,
  openMyList,
  openRowMenu,
} from './test-helpers.js';
import type {
  CombinationData,
  DraftUnsubmitted,
  PromptData,
  UnpublishedGrid,
  UnpublishedPrompt,
} from './types.js';

const VIEWER_ID = 99;
const OTHER_ID = 7; // the board rows' author — distinct, so ownership is never vacuous

// ---------------------------------------------------------------------------
// The board: ONE published matchup and ONE published prompt. Deliberately small —
// every case here is about the PRIVATE members, and extra board rows would only
// make the Top Grid's own cells compete for the `grid-cell` selectors.
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
  default: { prompt: 'a cyberpunk portrait', params: {} },
};

const row = (key: string, count: number, title: string, data: unknown): SharedItem => ({
  key,
  count,
  authorUserId: OTHER_ID,
  viewerVoted: false,
  value: { title, body: '', data },
  createdAt: new Date(0),
  updatedAt: new Date(0),
});

const BOARD: SharedItem[] = [
  row('mk-a', 9, 'Board Matchup A', comboData('cfg-a')),
  row('qk-1', 7, 'Board Prompt One', promptData),
];

// ---------------------------------------------------------------------------
// The viewer's PRIVATE records.
//
// 🔴 EVERY IDENTIFIER HERE IS PAIRWISE DISTINCT AND DISTINCT FROM EVERY KEY THE FAKE
// HOST MINTS (`fk_1`, `fk_2`, …). A fixture whose local id could coincide with a
// shared key cannot tell "the key was rewritten" from "the key was left alone",
// which is the one mutation that actually matters in this file.
// ---------------------------------------------------------------------------

const DRAFT_LOCAL_ID = 'dm-1';
const PROMPT_LOCAL_ID = 'dp-1';
const GRID_LOCAL_ID = 'ug-1';
const DRAFT_NAME = 'Private Matchup P';
const PROMPT_NAME = 'Private Prompt Q';

const privateMatchup: DraftUnsubmitted = {
  v: 1,
  localId: DRAFT_LOCAL_ID,
  name: DRAFT_NAME,
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
  name: PROMPT_NAME,
  description: 'also private',
  default: { prompt: 'a private portrait', params: {} },
  updatedAt: '2026-09-30T00:00:00.000Z',
};
const privateGrid = (matchupKeys: string[], promptKeys: string[]): UnpublishedGrid => ({
  v: 1,
  localId: GRID_LOCAL_ID,
  name: 'Mixed Grid',
  description: '',
  matchupKeys,
  promptKeys,
  updatedAt: '2026-09-30T00:00:00.000Z',
});

function seedStore(grid?: UnpublishedGrid): Record<string, unknown> {
  return {
    [draftKey(DRAFT_LOCAL_ID)]: privateMatchup,
    [unpubPromptKey(PROMPT_LOCAL_ID)]: privatePrompt,
    ...(grid ? { [unpubGridKey(GRID_LOCAL_ID)]: grid } : {}),
  };
}

/**
 * Mount the real `App` with the shared store and the per-viewer KV both injected.
 *
 * 🔴 `shared` IS INJECTED SO `appends` IS OBSERVABLE — that array is the evidence
 * for every claim in this file. Generation, publish and the gated reads still come
 * from the REAL mock host, which is what makes the run case a real round trip rather
 * than a fake one.
 */
function mountApp(opts: {
  shared: SharedStore;
  store: Record<string, unknown>;
  /** Replaces the default per-viewer KV, for the scan-failure and refusal cases. */
  appStorage?: AppDeps['appStorage'];
  deps?: Partial<AppDeps>;
}) {
  return render(
    <Harness
      viewer={{ id: VIEWER_ID, username: 'me' }}
      theme="dark"
      consentGranted
      buzzBudget={1000}
      buzz={{ balance: 5000 }}
      buzzBalance={{ blue: 0, green: 0, yellow: 5000 }}
      generation={{ costPerGen: 12, images: ['https://image.civitai.com/cascade-out.jpeg'] }}
      shared={{ seed: [] }}
      showLog={false}
    >
      <App
        deps={{
          resolveResources: async () => [],
          pollIntervalMs: 0,
          sleep: immediateSleep,
          shared: opts.shared,
          appStorage: opts.appStorage ?? fakeAppStorage(opts.store).appStorage,
          ...opts.deps,
        }}
      />
    </Harness>,
  );
}

/** The `data.kind` of one appended payload, for an order assertion that reads. */
const kindOf = (v: SharedStorageValue): string =>
  String((v.data as { kind?: unknown } | undefined)?.kind ?? '?');
const titleOf = (v: SharedStorageValue): string => String(v.title ?? '');

/** Everything that reached the public board, as `kind:title`, in CALL ORDER. */
const appendLedger = (appends: SharedStorageValue[]): string[] =>
  appends.map((v) => `${kindOf(v)}:${titleOf(v)}`);

/** The grid payload's stored member keys. */
const gridKeysOf = (v: SharedStorageValue): { matchupKeys: string[]; promptKeys: string[] } => {
  const d = v.data as { matchupKeys?: string[]; promptKeys?: string[] };
  return { matchupKeys: d.matchupKeys ?? [], promptKeys: d.promptKeys ?? [] };
};

/** The viewer's own private grid row on My Benchmarks ▸ Grids. */
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

// ===========================================================================
// ITEM 1 — the three create titles are FLAT
// ===========================================================================

describe('🔴 the three create modals are titled `New <Noun>`', () => {
  /**
   * 🔴 WHOLE STRINGS, AND THE DIALOG'S OWN ACCESSIBLE NAME RATHER THAN A `getByText`.
   * The parenthetical these titles lost ("(not published yet)") was a SUFFIX, so a
   * substring assertion on "New matchup" would have passed before the change as well
   * as after it and certified nothing. The accessible name is also the thing a screen
   * reader announces, which is the half of this change a sighted reviewer cannot see.
   */
  const titleOfOpenDialog = (): string =>
    screen.getByRole('dialog').getAttribute('aria-label') ??
    within(screen.getByRole('dialog')).getByRole('heading').textContent ??
    '';

  it('the PRIVATE matchup create modal says exactly `New Matchup`', async () => {
    mountApp({ shared: fakeShared({ seed: BOARD }).shared, store: {} });
    await openMyList('matchup');
    await userEvent.click(await screen.findByTestId('new-unpublished'));
    await screen.findByTestId('matchup-form');
    expect(titleOfOpenDialog().trim(), 'the private matchup create title is not flat').toBe(
      'New Matchup',
    );
  });

  it('the PRIVATE prompt create modal says exactly `New Prompt`', async () => {
    mountApp({ shared: fakeShared({ seed: BOARD }).shared, store: {} });
    await openMyList('prompt');
    await userEvent.click(await screen.findByTestId('new-unpublished'));
    await screen.findByTestId('prompt-form');
    expect(titleOfOpenDialog().trim(), 'the private prompt create title is not flat').toBe(
      'New Prompt',
    );
  });

  it('the grid create modal says exactly `New Grid` — the one that was already flat', async () => {
    // 🔴 LABELLED AS AN INVARIANT GUARD, NOT REGRESSION COVERAGE: this title did not
    // change, so this case is GREEN AT BASE. It is here because the change the
    // operator asked for is "all three agree", and a guard on two of three cannot
    // see the third drifting back.
    mountApp({ shared: fakeShared({ seed: BOARD }).shared, store: {} });
    await openMyList('grid');
    await userEvent.click(await screen.findByTestId('new-unpublished'));
    await screen.findByTestId('grid-form');
    expect(titleOfOpenDialog().trim()).toBe('New Grid');
  });
});

// ===========================================================================
// ITEM 2 — a private matchup/prompt can be picked into a grid
// ===========================================================================

describe('🔴 private matchups and prompts are pickable into a grid', () => {
  it('🔴 THE CRITICAL PAIR: a grid holding a private member SAVES, and NOTHING reaches the board', async () => {
    const { shared, appends } = fakeShared({ seed: BOARD });
    const store = seedStore();
    const kv = fakeAppStorage(store);
    render(
      <Harness
        viewer={{ id: VIEWER_ID, username: 'me' }}
        theme="dark"
        consentGranted
        buzzBudget={1000}
        shared={{ seed: [] }}
        showLog={false}
      >
        <App
          deps={{
            resolveResources: async () => [],
            pollIntervalMs: 0,
            sleep: immediateSleep,
            shared,
            appStorage: kv.appStorage,
          }}
        />
      </Harness>,
    );

    await openMyList('grid');
    await userEvent.click(await screen.findByTestId('new-unpublished'));
    const form = await screen.findByTestId('grid-form');

    // ---- ROWS: one board matchup and one PRIVATE one ----
    await userEvent.click(within(form).getByTestId('grid-form-pick-rows'));
    const rowList = await screen.findByTestId('grid-pick-rows');
    const rowOptions = within(rowList).getAllByTestId('grid-pick-rows-option');
    const rowKeys = rowOptions.map((el) => el.getAttribute('data-key'));
    // 🔴 THE POSITIVE OBSERVATION, before any click: the private record is OFFERED.
    // Base behaviour listed board rows only, so this is the assertion the change is
    // about — and it is an equality over the whole set, so a picker that offered the
    // private row INSTEAD of the board row fails here too.
    expect(rowKeys, 'the matchup picker does not offer the private record').toEqual([
      'mk-a',
      DRAFT_LOCAL_ID,
    ]);
    // …and it is MARKED, with the word §11.1 allows.
    const privateRowOption = rowOptions.find((el) => el.getAttribute('data-key') === DRAFT_LOCAL_ID)!;
    expect(privateRowOption).toHaveTextContent(DRAFT_NAME);
    expect(privateRowOption, 'the private row is not marked Private').toHaveTextContent('Private');
    await userEvent.click(rowOptions[0]!);
    await userEvent.click(privateRowOption);
    await userEvent.click(within(rowList).getByTestId('grid-pick-rows-confirm'));

    // ---- COLUMNS: the same, for prompts ----
    await userEvent.click(within(form).getByTestId('grid-form-pick-cols'));
    const colList = await screen.findByTestId('grid-pick-cols');
    const colOptions = within(colList).getAllByTestId('grid-pick-cols-option');
    expect(
      colOptions.map((el) => el.getAttribute('data-key')),
      'the prompt picker does not offer the private record',
    ).toEqual(['qk-1', PROMPT_LOCAL_ID]);
    await userEvent.click(colOptions[0]!);
    await userEvent.click(colOptions[1]!);
    await userEvent.click(within(colList).getByTestId('grid-pick-cols-confirm'));

    // ---- name it and SAVE PRIVATELY ----
    await userEvent.click(within(form).getByTestId('form-next'));
    await userEvent.type(within(form).getByTestId('grid-form-name'), 'Mixed Grid');
    await userEvent.click(within(form).getByTestId('grid-form-submit'));

    // The record landed in the PER-VIEWER store, carrying the private member's LOCAL
    // id — which is what the grid is allowed to hold while it is private.
    const written = await waitFor(() => {
      const hit = kv.sets.find((s) => s.key.startsWith('unpub:grid:v1:'));
      if (!hit) throw new Error('no private grid was written');
      return hit.value as UnpublishedGrid;
    });
    expect(written.matchupKeys, 'the private pick was dropped from the saved record').toEqual([
      'mk-a',
      DRAFT_LOCAL_ID,
    ]);
    expect(written.promptKeys).toEqual(['qk-1', PROMPT_LOCAL_ID]);

    // 🔴 AND THE SECOND HALF OF THE PAIR, WHICH IS THE ONE THAT PROTECTS THE BOARD:
    // composing and saving this grid appended NOTHING. Saving is not publishing, and
    // the local id is nowhere public.
    expect(appendLedger(appends), 'saving a private grid reached the shared board').toEqual([]);
  });

  it('🔴 the PUBLISHED-grid edit form offers board rows ONLY — with the private form as control', async () => {
    // 🔴 THE SECOND WRITE SITE. `updateGrid` goes straight to `shared.update` with no
    // cascade, so a private pick there would put a LOCAL ID on the public board in one
    // press, permanently (author-scoped, no merge, no history). The absence below is
    // the claim; the private picker finding the SAME row two interactions later is the
    // positive control that makes the absence meaningful rather than "the record was
    // never loaded".
    const { shared, updates } = fakeShared({
      seed: [...BOARD, row('gk-pub', 3, 'My published grid', {
        v: 1,
        kind: 'grid',
        matchupKeys: ['mk-a'],
        promptKeys: ['qk-1'],
      })].map((r) => (r.key === 'gk-pub' ? { ...r, authorUserId: VIEWER_ID } : r)),
    });
    mountApp({ shared, store: seedStore() });

    await openMyList('grid');
    // The published row's Edit control — `MyList` puts it on the row.
    const pubCard = await waitFor(() => {
      const el = screen
        .getAllByTestId('grid-card')
        .find((c) => c.getAttribute('data-key') === 'gk-pub');
      if (!el) throw new Error('the published grid row is not listed');
      return el;
    });
    await userEvent.click(within(pubCard).getByTestId('grid-edit'));
    const editForm = await screen.findByTestId('grid-form');
    await userEvent.click(within(editForm).getByTestId('grid-form-pick-rows'));
    const editList = await screen.findByTestId('grid-pick-rows');
    expect(
      within(editList)
        .getAllByTestId('grid-pick-rows-option')
        .map((el) => el.getAttribute('data-key')),
      'the PUBLISHED-grid edit form offers a private record — one press from a local id on the board',
    ).toEqual(['mk-a']);
    await userEvent.click(within(editList).getByTestId('grid-pick-rows-cancel'));
    await userEvent.click(within(editForm).getByTestId('grid-form-cancel'));

    // ---- THE POSITIVE CONTROL, same render: the PRIVATE form does offer it ----
    await userEvent.click(await screen.findByTestId('new-unpublished'));
    const newForm = await screen.findByTestId('grid-form');
    await userEvent.click(within(newForm).getByTestId('grid-form-pick-rows'));
    const newList = await screen.findByTestId('grid-pick-rows');
    expect(
      within(newList)
        .getAllByTestId('grid-pick-rows-option')
        .map((el) => el.getAttribute('data-key')),
      'the private grid form does NOT offer the private record — the absence above proves nothing',
    ).toEqual(['mk-a', DRAFT_LOCAL_ID]);

    // Nothing was saved on either path.
    expect(updates).toEqual([]);
  });
});

// ===========================================================================
// ITEM 3 — the publish cascade
// ===========================================================================

describe('🔴 publishing a grid publishes its private members FIRST, by name', () => {
  it('the confirm ENUMERATES each item and states the counts and the order', async () => {
    const { shared, appends } = fakeShared({ seed: BOARD });
    mountApp({ shared, store: seedStore(privateGrid(['mk-a', DRAFT_LOCAL_ID], ['qk-1', PROMPT_LOCAL_ID])) });

    const card = await privateGridCard();
    await userEvent.click(within(card).getByTestId('unpublished-publish'));

    const confirm = await screen.findByTestId('grid-publish-confirm');
    // 🔴 THE WHOLE SENTENCE, normalised. A keyword guard would be satisfied by copy
    // that quietly dropped "cannot be undone" or reversed the publish order.
    expect(
      (within(confirm).getByTestId('grid-publish-summary').textContent ?? '')
        .replace(/\s+/g, ' ')
        .trim(),
    ).toBe(
      'Publishing “Mixed Grid” also publishes 1 matchup and 1 prompt that are still ' +
        'private, because a public grid cannot point at a private row. They publish first ' +
        'and the grid last. Publishing cannot be undone.',
    );
    // 🔴 NAMED, NOT COUNTED. One row per item, each carrying the record's own name and
    // which kind it is — a count alone is not enough for a decision nothing can undo.
    const items = within(confirm).getAllByTestId('grid-publish-item');
    expect(items).toHaveLength(2);
    // ⚠️ NO SPACE BETWEEN THE KIND BADGE AND THE NAME: `textContent` concatenates
    // adjacent element text with nothing in between, and jsdom performs no layout so
    // the visual gap is a `Group`'s flex `gap` that leaves no trace in the string.
    // Asserted as what the DOM actually holds rather than as what it looks like.
    expect(items.map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim())).toEqual([
      `Matchup${DRAFT_NAME}`,
      `Prompt${PROMPT_NAME}`,
    ]);
    // 🔴 AND NOTHING HAS BEEN PUBLISHED YET. A confirm that appended first and asked
    // afterwards would satisfy every assertion above.
    expect(appendLedger(appends), 'the confirm appended before the viewer confirmed').toEqual([]);
  });

  it('🔴 THE ORDER, ON THE APPEND LOG: matchup, prompt, THEN the grid — with the keys REWRITTEN', async () => {
    const { shared, appends } = fakeShared({ seed: BOARD });
    mountApp({ shared, store: seedStore(privateGrid(['mk-a', DRAFT_LOCAL_ID], ['qk-1', PROMPT_LOCAL_ID])) });

    const card = await privateGridCard();
    await userEvent.click(within(card).getByTestId('unpublished-publish'));
    await userEvent.click(await screen.findByTestId('grid-publish-go'));

    // 🔴 THE ANCHOR IS `>= 3`, NOT `=== 3`, AND THAT IS THE MEASUREMENT RATHER THAN
    // SLOPPINESS. A mutant that publishes the grid FIRST appends it twice (the second
    // publish reads a stale `publishedThisSession`), so a `toHaveLength(3)` anchor
    // died on ITS OWN diff — 4 instead of 3 — and the order assertion below never
    // executed. Waiting for "at least the three we expect" lets the equality be the
    // thing that fails, with its own diagnostic.
    await waitFor(() => {
      if (appends.length < 3) throw new Error(`only ${appends.length} of 3 appends have landed`);
    });
    // 🔴 AN EQUALITY OVER THE WHOLE LOG, IN CALL ORDER. This is the claim: the grid is
    // LAST. Reversing it would leave a public grid pointing at private rows, which
    // nothing in this app can repair.
    expect(appendLedger(appends), 'the grid was not published LAST').toEqual([
      `combination:${DRAFT_NAME}`,
      `prompt:${PROMPT_NAME}`,
      'grid:Mixed Grid',
    ]);

    // 🔴 AND THE GRID'S STORED KEYS ARE THE MINTED ONES. `fakeShared` mints `fk_1`,
    // `fk_2`, `fk_3` in append order, so the matchup's new key is `fk_1` and the
    // prompt's is `fk_2` — values no fixture here could produce by accident, which is
    // what lets this distinguish "rewritten" from "left alone".
    const grid = gridKeysOf(appends[2]!);
    expect(grid.matchupKeys, 'the private matchup was published as a LOCAL ID').toEqual([
      'mk-a',
      'fk_1',
    ]);
    expect(grid.promptKeys, 'the private prompt was published as a LOCAL ID').toEqual([
      'qk-1',
      'fk_2',
    ]);

    // 🔴 THE WHOLE-LOG SCAN, as a separate claim from the one above: NO appended
    // payload mentions either local id ANYWHERE — not in `data`, not in `title`, not
    // in `body`.
    const wire = JSON.stringify(appends);
    expect(wire, 'a private local id reached the public board').not.toContain(DRAFT_LOCAL_ID);
    expect(wire).not.toContain(PROMPT_LOCAL_ID);
    // POSITIVE CONTROL FOR THAT SCAN: the ids are strings a `toContain` CAN see — they
    // are in the per-viewer payloads the app wrote on the way here. Without this, a
    // typo'd id constant would make both assertions above pass vacuously.
    expect(JSON.stringify(seedStore(privateGrid([DRAFT_LOCAL_ID], [PROMPT_LOCAL_ID])))).toContain(
      DRAFT_LOCAL_ID,
    );
  });

  it('🔴 A MID-CASCADE FAILURE names exactly what DID publish, and does NOT publish the grid', async () => {
    // The host refuses the SECOND append — the private prompt — so the matchup is
    // already public and permanent and the grid must not go out.
    const base = fakeShared({ seed: BOARD });
    let calls = 0;
    const shared: SharedStore = {
      ...base.shared,
      async append(value) {
        calls += 1;
        if (calls === 2) throw new Error('APPEND_REFUSED');
        return base.shared.append(value);
      },
    };
    mountApp({
      shared,
      store: seedStore(privateGrid(['mk-a', DRAFT_LOCAL_ID], ['qk-1', PROMPT_LOCAL_ID])),
    });

    const card = await privateGridCard();
    await userEvent.click(within(card).getByTestId('unpublished-publish'));
    await userEvent.click(await screen.findByTestId('grid-publish-go'));

    // 🔴 `queryByTestId` + a NAMED not-null, never `getByTestId` inside `expect(...)`:
    // a `get` throwing during argument evaluation kills the case with ITS message
    // instead of this assertion's, which is how a guard's diagnostic gets pre-empted.
    const alert = await waitFor(() => {
      const el = screen.queryByTestId('grid-publish-error');
      if (el === null) throw new Error('no cascade failure notice rendered');
      return el;
    });
    expect(alert, 'the cascade failure notice is missing').not.toBeNull();
    expect((alert.textContent ?? '').replace(/\s+/g, ' ').trim()).toBe(
      `1 item was published and is now public and permanent: ${DRAFT_NAME}. ` +
        `${PROMPT_NAME} could not be published (APPEND_REFUSED), so the grid “Mixed Grid” ` +
        'was not published either — a public grid must not point at a private row. The grid ' +
        'is unchanged and still private.',
    );

    // 🔴 THE LOG IS THE N−1 CLAIM: exactly the matchup landed. Not the prompt (refused),
    // and above all NOT the grid.
    expect(appendLedger(base.appends), 'the cascade continued past a refused dependency').toEqual([
      `combination:${DRAFT_NAME}`,
    ]);

    // 🔴 AND NO ROLLBACK IS CLAIMED. `append` is irreversible; a notice saying the
    // published matchup was taken back would be false about a permanent public row.
    expect(alert.textContent ?? '').not.toMatch(/abort|roll ?back|revert|undone/i);
  });

  it('a grid whose members are ALL on the board publishes with NO confirm at all', async () => {
    // 🔴 THE OTHER SIDE OF THE BRANCH, and it is what stops the confirm becoming
    // friction on the path this app already had. It is also the control for the
    // confirm cases above: without it, "the dialog opened" could be the dialog
    // opening unconditionally.
    //
    // ⚠️ AN INVARIANT GUARD, NOT REGRESSION COVERAGE — labelled, because the
    // distinction matters. It is GREEN AT `2881c47`: at base there is no confirm at
    // all, so "publishes with no confirm" was trivially true. What it pins is that
    // the NEW branch did not make the old path worse. Measured: red-at-base is 8 of
    // the 10 cases in this file; this one and the `New Grid` title are the two that
    // were already green.
    const { shared, appends } = fakeShared({ seed: BOARD });
    mountApp({ shared, store: seedStore(privateGrid(['mk-a'], ['qk-1'])) });

    const card = await privateGridCard();
    await userEvent.click(within(card).getByTestId('unpublished-publish'));

    // 🔴 THE NAMED CLAIM FIRST. `userEvent.click` is awaited, so React has flushed and
    // a dialog that was going to open is already in the DOM. Asserting the append
    // ledger first would instead time out with a diff and this assertion's own
    // diagnostic would never run.
    expect(
      screen.queryByTestId('grid-publish-confirm'),
      'a no-dependency grid still asked',
    ).toBeNull();
    await waitFor(() => expect(appendLedger(appends)).toEqual(['grid:Mixed Grid']));
    // The keys went out untouched — nothing to rewrite.
    expect(gridKeysOf(appends[0]!)).toEqual({ matchupKeys: ['mk-a'], promptKeys: ['qk-1'] });
  });
});

// ===========================================================================
// 🔴 THE PUBLISH BOUNDARY — the three paths that put a LOCAL ID on the board
// ===========================================================================
//
// All three share two properties that are why they shipped unnoticed: the grid has
// ZERO dependencies (so the confirm dialog never opened and the publish went on the
// FIRST click with nothing shown), and the wire carried a per-viewer local id with NO
// ERROR anywhere. The refusal is asserted on the APPEND LOG, because a dialog is not
// what protects the board.
describe('🔴 an unaccountable member REFUSES the publish, on every path to it', () => {
  /** The grid-publish notice, wherever on the surface it renders. */
  function refusalNode(): HTMLElement {
    const el = screen.queryByTestId('grid-publish-error');
    if (el === null) throw new Error('no grid-publish refusal notice rendered');
    return el;
  }

  /**
   * Wait until the Publish press has RESOLVED one way or the other.
   *
   * 🔴 IT WAITS ON "REFUSED **OR** APPENDED", AND THAT IS THE MEASUREMENT. Waiting on
   * the notice alone pre-empts the claim that matters: at the pre-fix base the publish
   * is not refused, so a `waitFor` on the notice dies with ITS message and the
   * APPEND-LOG assertion — the only one that says a local id reached the public board
   * — never executes. Waiting on either outcome lets the ledger be what fails.
   *
   * It is also not a bare settle: an empty ledger asserted before anything happened
   * would pass vacuously on a build that appends a moment later.
   */
  async function settlePublish(appends: SharedStorageValue[]): Promise<void> {
    await waitFor(() => {
      if (screen.queryByTestId('grid-publish-error') === null && appends.length === 0)
        throw new Error('the publish neither refused nor appended — it never resolved');
    });
  }

  it('🔴 PATH A — the viewer DISCARDED the private matchup the grid names', async () => {
    // `deleteDraft` prunes nothing from any grid (and cannot: a grid is a per-viewer
    // record this app does not rewrite on another record's delete), so the grid keeps
    // naming a local id whose record is gone.
    const { shared, appends } = fakeShared({ seed: BOARD });
    mountApp({ shared, store: seedStore(privateGrid(['mk-a', DRAFT_LOCAL_ID], ['qk-1'])) });

    // The grid row must be listed before the member is destroyed, so a later failure
    // cannot be about a grid that never loaded. The handle is not needed again.
    await privateGridCard();
    // Discard the private MATCHUP, from its own surface.
    await openMyList('matchup');
    const matchupCard = await waitFor(() => {
      const el = screen
        .getAllByTestId('unpublished-card')
        .find((c) => c.getAttribute('data-local-id') === DRAFT_LOCAL_ID);
      if (!el) throw new Error('the private matchup is not listed');
      return el;
    });
    const menu = await openRowMenu('unpublished', matchupCard);
    await userEvent.click(within(menu).getByTestId('unpublished-discard'));
    await waitFor(() => {
      if (
        screen
          .queryAllByTestId('unpublished-card')
          .some((c) => c.getAttribute('data-local-id') === DRAFT_LOCAL_ID)
      )
        throw new Error('the private matchup was not discarded — the premise failed');
    });

    // Back to the grid, and press Publish. `privateGridCard` THROWS if the row is
    // gone, so reaching the click is itself the claim that the grid survived its
    // member's discard — which is the state the hazard needs.
    const grid = await privateGridCard();
    await userEvent.click(within(grid).getByTestId('unpublished-publish'));

    // 🔴 THE CLAIM, ON THE WIRE, AND FIRST: nothing was appended at all.
    await settlePublish(appends);
    expect(
      appendLedger(appends),
      'a discarded private member’s LOCAL ID went to the public board',
    ).toEqual([]);
    // 🔴 AND THE ID ITSELF, NAMED. The ledger above says nothing was appended; this
    // says what would have been on the wire if it had been. At the pre-fix base the
    // grid row's `data.matchupKeys` carried this exact string, permanently.
    expect(
      JSON.stringify(appends),
      'the unaccountable LOCAL ID reached the public board',
    ).not.toContain(DRAFT_LOCAL_ID);
    const notice = refusalNode();
    expect((notice.textContent ?? '').replace(/\s+/g, ' ').trim()).toBe(
      '1 member of “Mixed Grid” cannot be accounted for: it is not among your private items, ' +
        'and not on the board as this build can read it — it is either gone, or in a shape ' +
        'this build does not understand. Publishing is refused rather than putting a key on ' +
        'the public board that nobody — including you — could resolve afterwards. ⚠ The ' +
        'picker keeps members it cannot show, so editing the grid cannot remove it: reload ' +
        'the app and try again first, and discard this grid and build it again if that ' +
        'does not help.',
    );
    // 🔴 AND NO DIALOG WAS INVOLVED. This grid has zero dependencies, which is exactly
    // why the previous `deps.length > 0` ordering let it through silently.
    expect(screen.queryByTestId('grid-publish-confirm')).toBeNull();
  });

  it('🔴 PATH C — the private-matchup SCAN THREW, so the member is invisible to the planner', async () => {
    // 🔴 THE INVERSION, AND THE ONE THAT FAILED OPEN. `App` swallows this listing's
    // failure on purpose (a KV failure must not take the public board down), the
    // GRID's own prefix reads fine, so the grid is listed and publishable while its
    // private member cannot be seen. `forEachStoredKey` already RETURNED the report
    // that distinguishes this; all three scans discarded it.
    const { shared, appends } = fakeShared({ seed: BOARD });
    const kv = fakeAppStorage(seedStore(privateGrid(['mk-a', DRAFT_LOCAL_ID], ['qk-1'])), {}, {
      // Aimed at the MATCHUP prefix only — a blanket failure would also eat the grid
      // listing, and then there would be no grid to publish and nothing to assert.
      failListTimes: 9,
      failListPrefix: 'draft:v1:',
    });
    mountApp({ shared, store: {}, appStorage: kv.appStorage });

    await privateGridCard();
    // PREMISE, ASSERTED: the matchup scan really did fail — the private matchup is not
    // listed on its own surface. Without this the refusal below could be about
    // anything.
    await openMyList('matchup');
    expect(
      screen
        .queryAllByTestId('unpublished-card')
        .filter((c) => c.getAttribute('data-local-id') === DRAFT_LOCAL_ID),
      'the matchup scan did not fail — this case is not testing what it claims',
    ).toEqual([]);

    const gridAgain = await privateGridCard();
    await userEvent.click(within(gridAgain).getByTestId('unpublished-publish'));

    await settlePublish(appends);
    expect(appendLedger(appends), 'the FAIL-OPEN path still reaches the board').toEqual([]);
    // 🔴 AND THE ID ITSELF, NAMED. The ledger above says nothing was appended; this
    // says what would have been on the wire if it had been. At the pre-fix base the
    // grid row's `data.matchupKeys` carried this exact string, permanently.
    expect(
      JSON.stringify(appends),
      'the unaccountable LOCAL ID reached the public board',
    ).not.toContain(DRAFT_LOCAL_ID);
    const notice = refusalNode();
    // 🔴 AND THE COPY NAMES THE RIGHT CAUSE. "not among your private items" would be a
    // claim the app has no evidence for here — it could not read them. Asserted as its
    // OWN named claim before the whole string, because a mutant that discards the scan
    // report leaves the refusal firing with the WRONG cause and the `.toBe` below
    // carries no message of its own.
    const refusalText = (notice.textContent ?? '').replace(/\s+/g, ' ').trim();
    expect(
      refusalText,
      'the refusal names the wrong cause — the private scan FAILED, so the member cannot be said to be absent from it',
    ).not.toMatch(/not among your private items/);
    expect(refusalText).toBe(
      '1 member of “Mixed Grid” cannot be accounted for, because this app could not read ' +
        'all of your private items. It therefore cannot tell whether it is yours and ' +
        'unpublished, or simply gone. Publishing is refused rather than putting a key on the ' +
        'public board that nobody — including you — could resolve afterwards. Reload and try ' +
        'again.',
    );
  });

  it('🔴 PATH C′ — the private-matchup scan TRUNCATED, which is the other half of the report', async () => {
    // 🔴 FOUND BY A SURVIVING MUTANT, NOT BY READING THE DIFF. Path C drives the scan
    // THROWING, and on that path `matchupsComplete` never gets assigned at all — so a
    // mutant replacing `!cancelled && !scan.truncated` with `true` was UNREACHABLE
    // there and survived a green suite. `forEachStoredKey` reports TWO kinds of
    // incomplete view and only one of them was exercised.
    //
    // This case drives the other: `KV_MAX_PAGES` is 20, so 21 private matchups at one
    // key per page leave the 21st UNREAD with the scan reporting `truncated: true`.
    // The grid names that 21st one.
    const { shared, appends } = fakeShared({ seed: BOARD });
    const many: Record<string, unknown> = {};
    for (let i = 1; i <= 21; i += 1) {
      const localId = `dm-page-${i}`;
      many[draftKey(localId)] = { ...privateMatchup, localId, name: `Paged matchup ${i}` };
    }
    const UNREAD = 'dm-page-21';
    const kv = fakeAppStorage(
      { ...many, [unpubGridKey(GRID_LOCAL_ID)]: privateGrid(['mk-a', UNREAD], ['qk-1']) },
      {},
      // One key per page, so 21 draft keys need 21 pages and the walk stops at 20.
      { pageSize: 1 },
    );
    mountApp({ shared, store: {}, appStorage: kv.appStorage });

    // The grid row has to be listed before anything else is asserted, or a failure
    // below could be about a grid that never loaded. The handle is not needed again.
    await privateGridCard();
    // PREMISE, ASSERTED: the scan really did stop short — the 21st record is not
    // listed on its own surface, while an early one IS. Without both halves this case
    // cannot tell "truncated" from "the fixture wrote nothing".
    await openMyList('matchup');
    await waitFor(() => {
      const ids = screen
        .queryAllByTestId('unpublished-card')
        .map((c) => c.getAttribute('data-local-id'));
      if (!ids.includes('dm-page-1')) throw new Error('no paged matchups were read at all');
      if (ids.includes(UNREAD)) throw new Error('the scan was NOT truncated — premise failed');
    });

    const gridAgain = await privateGridCard();
    await userEvent.click(within(gridAgain).getByTestId('unpublished-publish'));

    await settlePublish(appends);
    expect(
      appendLedger(appends),
      'a member past the scan’s page cap was published as an unresolvable key',
    ).toEqual([]);
    const text = (refusalNode().textContent ?? '').replace(/\s+/g, ' ').trim();
    expect(
      text,
      'a TRUNCATED private scan is reported as if the member were simply absent',
    ).not.toMatch(/not among your private items/);
    expect(text).toContain('could not read all of your private items');
  });

  it('🔴 CANCEL IS DISABLED WHILE THE CASCADE RUNS — it cannot undo what it looks like it undoes', async () => {
    // 🔴 WHAT IT USED TO DO: change modal state, and nothing else. The promise kept
    // appending, so a live Cancel sat beside copy that says "Publishing cannot be
    // undone" offering exactly the undo that does not exist.
    //
    // The first `append` is GATED so the press is observable mid-flight — without a
    // pending call there is no "while it runs" to assert anything about.
    const base = fakeShared({ seed: BOARD });
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const shared: SharedStore = {
      ...base.shared,
      async append(value) {
        await gate;
        return base.shared.append(value);
      },
    };
    mountApp({ shared, store: seedStore(privateGrid(['mk-a', DRAFT_LOCAL_ID], ['qk-1'])) });

    const grid = await privateGridCard();
    await userEvent.click(within(grid).getByTestId('unpublished-publish'));

    // 🔴 THE NEGATIVE CONTROL COMES FIRST, AND IT IS THE **SAME BUTTON**. An earlier
    // draft asserted on `grid-form-cancel` — the CREATE form's cancel, a different
    // component with no `disabled` prop and no relation to `gridPublishBusy` — so it
    // excluded nothing: a permanently dead Cancel (`disabled={true}`) SURVIVED the
    // whole dom tier, 45 files green. Reading `grid-publish-cancel` in BOTH states is
    // what makes the pair discriminating.
    const cancelIdle = await screen.findByTestId('grid-publish-cancel');
    expect(
      cancelIdle,
      'Cancel is dead before the cascade even starts — a permanently disabled button',
    ).not.toBeDisabled();

    await userEvent.click(await screen.findByTestId('grid-publish-go'));

    // PREMISE: the cascade really is mid-flight — nothing has landed yet.
    expect(base.appends, 'the gate did not hold the first append').toHaveLength(0);
    await waitFor(() => {
      const cancel = screen.queryByTestId('grid-publish-cancel');
      if (cancel === null) throw new Error('the dialog closed before Cancel could be read');
      if (!cancel.hasAttribute('disabled'))
        throw new Error('Cancel is live while the cascade is appending');
    });

    // Release and let the cascade finish, so the case leaves no pending promise.
    release();
    await waitFor(() => {
      if (base.appends.length < 2)
        throw new Error(`only ${base.appends.length} of 2 appends have landed`);
    });
  });

  it('🔴 `CASCADE_NO_KEY` IS REACHABLE, and this is the case that drives it', async () => {
    // 🔴 AN EARLIER ROUND PROPOSED DELETING THIS GUARD AS DEAD CODE. It is not: the
    // viewer publishes the private MATCHUP directly, and while that append is still in
    // flight publishes the GRID that names it. `publishRecord`'s `submittingRef` early
    // return fires for the dependency, `key` is `undefined`, and the cascade refuses
    // rather than publishing a grid whose member key it could not rewrite — which is
    // the whole hazard, reached from inside.
    const base = fakeShared({ seed: BOARD });
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let gateFirst = true;
    const shared: SharedStore = {
      ...base.shared,
      async append(value) {
        if (gateFirst) {
          gateFirst = false;
          await gate;
        }
        return base.shared.append(value);
      },
    };
    mountApp({ shared, store: seedStore(privateGrid(['mk-a', DRAFT_LOCAL_ID], ['qk-1'])) });

    // Publish the private matchup on its own surface; its append hangs on the gate.
    await openMyList('matchup');
    const matchupCard = await waitFor(() => {
      const el = screen
        .getAllByTestId('unpublished-card')
        .find((c) => c.getAttribute('data-local-id') === DRAFT_LOCAL_ID);
      if (!el) throw new Error('the private matchup is not listed');
      return el;
    });
    await userEvent.click(within(matchupCard).getByTestId('unpublished-publish'));
    // PREMISE: that append really is in flight, so `submittingRef` holds the id.
    expect(base.appends, 'the gate did not hold the matchup append').toHaveLength(0);

    // Now publish the grid that names it.
    const grid = await privateGridCard();
    await userEvent.click(within(grid).getByTestId('unpublished-publish'));
    await userEvent.click(await screen.findByTestId('grid-publish-go'));

    // 🔴 THE WIRE CLAIM FIRST, AND THE SETTLE WAITS ON EITHER OUTCOME. Waiting on the
    // notice alone pre-empts it: a mutant that SKIPS the no-key throw publishes the
    // grid happily, so the notice never appears and the only assertion about the local
    // id going public never executes. Measured — that mutant died on the notice's wait.
    await waitFor(() => {
      const published = appendLedger(base.appends).some((e) => e.startsWith('grid:'));
      if (screen.queryByTestId('grid-publish-error') === null && !published)
        throw new Error('the grid publish neither refused nor appended — it never resolved');
    });
    expect(
      appendLedger(base.appends).filter((e) => e.startsWith('grid:')),
      'the grid published with a member key it could not rewrite',
    ).toEqual([]);

    // …and the refusal names its own cause, which is what `CASCADE_NO_KEY` is for.
    const text = (screen.getByTestId('grid-publish-error').textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim();
    expect(
      text,
      'the no-key refusal does not name its own cause — `CASCADE_NO_KEY` never reached the viewer',
    ).toContain('this app refused a second publish of the same record');

    // Release the gate so the case leaves no pending promise behind.
    release();
    await waitFor(() => {
      if (base.appends.length < 1) throw new Error('the gated matchup append never landed');
    });
  });

  it('🔴 THE NEGATIVE CONTROL: the SAME grid publishes when its member IS accountable', async () => {
    // Without this, every refusal above is satisfiable by a boundary that refuses
    // unconditionally — which would break publishing outright and pass all of them.
    const { shared, appends } = fakeShared({ seed: BOARD });
    mountApp({ shared, store: seedStore(privateGrid(['mk-a', DRAFT_LOCAL_ID], ['qk-1'])) });

    const grid = await privateGridCard();
    await userEvent.click(within(grid).getByTestId('unpublished-publish'));
    // One dependency, so the dialog opens; confirm it.
    await userEvent.click(await screen.findByTestId('grid-publish-go'));

    await waitFor(() => {
      if (appends.length < 2) throw new Error(`only ${appends.length} of 2 appends have landed`);
    });
    expect(appendLedger(appends), 'the accountable grid did not publish').toEqual([
      `combination:${DRAFT_NAME}`,
      'grid:Mixed Grid',
    ]);
    expect(screen.queryByTestId('grid-publish-error')).toBeNull();
  });
});

// ===========================================================================
// 🔴 THE BOARD READ'S OUTCOME — refusing is right, blaming the member is not
// ===========================================================================
//
// 🔴 THE REGRESSION THESE PIN, AND IT WAS INTRODUCED BY THE REFUSAL ITSELF. The
// boundary first shipped reading a `boardTruncated` boolean that `App` wrote only on
// the board read's SUCCESS arm. A read that THREW — and the window before the first
// read resolves — therefore looked identical to "read the whole board, found nothing":
// every ordinary published member fell through to `unresolved`, and the refusal told
// the viewer the member was not on the board and to EDIT THE GRID AND REMOVE IT.
//
// 🔴 FOLLOWING THAT ADVICE DESTROYS GOOD MEMBERS over a publish that would have
// worked a second later. The refusal is right; its cause and its remedy were wrong.
describe('🔴 a grid of ORDINARY published members, on a board this app could not read', () => {
  /** The grid under test names two real board rows and nothing private. */
  const boardOnlyGrid = () => privateGrid(['mk-a'], ['qk-1']);

  it('🔴 P1 — the board read THREW: refused, but never "remove them"', async () => {
    const { shared: good, appends } = fakeShared({ seed: BOARD });
    const shared: SharedStore = {
      ...good,
      async list() {
        throw new Error('BOARD_UNAVAILABLE');
      },
    };
    mountApp({ shared, store: seedStore(boardOnlyGrid()) });

    const grid = await privateGridCard();
    await userEvent.click(within(grid).getByTestId('unpublished-publish'));

    await waitFor(() => {
      if (screen.queryByTestId('grid-publish-error') === null && appends.length === 0)
        throw new Error('the publish neither refused nor appended — it never resolved');
    });
    const text = (screen.getByTestId('grid-publish-error').textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim();
    // 🔴 THE CLAIM THAT MATTERS MOST, FIRST: no destructive remedy.
    expect(
      text,
      'the viewer is told to REMOVE members the app never read — following this destroys the grid',
    ).not.toMatch(/remove/i);
    expect(
      text,
      'the notice asserts the members are not on a board the app could not read',
    ).not.toMatch(/not on the board/);
    expect(text).toContain('has not been able to read the board');
    // The refusal itself is correct — nothing unaccountable may go out.
    expect(appendLedger(appends)).toEqual([]);
  });

  it('🔴 P2 — THE POSITIVE CONTROL: the SAME grid publishes against a working read', async () => {
    // Without this, P1 and P3 are satisfiable by a boundary that refuses every grid.
    // Same grid, same code, the only difference is whether the board read works.
    const { shared, appends } = fakeShared({ seed: BOARD });
    mountApp({ shared, store: seedStore(boardOnlyGrid()) });

    const grid = await privateGridCard();
    await userEvent.click(within(grid).getByTestId('unpublished-publish'));

    await waitFor(() => {
      if (appends.length < 1) throw new Error('the board-only grid did not publish');
    });
    expect(appendLedger(appends)).toEqual(['grid:Mixed Grid']);
    expect(
      screen.queryByTestId('grid-publish-error'),
      'a grid of ordinary published members was refused against a WORKING board read',
    ).toBeNull();
  });

  it('🔴 P1′ — a RE-READ threw after a good one: the stale snapshot must not license deletion', async () => {
    // 🔴 FOUND BY A MUTANT THAT WOULD OTHERWISE SURVIVE. `'unread'` is the initial
    // value, so deleting `setBoardRead('error')` from the read's catch arm changes
    // NOTHING on P1 or P3 — both are first-read failures and stay `'unread'`, which is
    // already the non-destructive branch. The state the assignment actually buys is
    // this one: a read SUCCEEDS, `items` fills, a later read THROWS, and without the
    // assignment `boardRead` stays `'complete'` over a snapshot the app no longer
    // trusts — so the refusal goes back to "discard this grid" on a stale board.
    //
    // The second read is triggered by the app itself: `publishRecord` calls `reload()`.
    const good = fakeShared({ seed: BOARD });
    let reads = 0;
    const shared: SharedStore = {
      ...good.shared,
      async list(opts) {
        reads += 1;
        if (reads === 1) return good.shared.list(opts);
        throw new Error('BOARD_UNAVAILABLE');
      },
    };
    mountApp({
      shared,
      store: {
        [unpubGridKey('ug-clean')]: {
          ...privateGrid(['mk-a'], ['qk-1']),
          localId: 'ug-clean',
          name: 'Clean Grid',
        },
        [unpubGridKey('ug-bad')]: {
          ...privateGrid(['mk-a', 'dm-nowhere'], ['qk-1']),
          localId: 'ug-bad',
          name: 'Bad Grid',
        },
      },
    });

    const cardFor = async (localId: string): Promise<HTMLElement> => {
      await openMyList('grid');
      return waitFor(() => {
        const el = screen
          .getAllByTestId('unpublished-card')
          .find((c) => c.getAttribute('data-local-id') === localId);
        if (!el) throw new Error(`the private grid ${localId} is not listed`);
        return el;
      });
    };

    // PREMISE 1: the FIRST read succeeded, so the clean grid publishes — which is also
    // what fires the re-read that then throws.
    await userEvent.click(within(await cardFor('ug-clean')).getByTestId('unpublished-publish'));
    await waitFor(() => {
      if (good.appends.length < 1) throw new Error('the clean grid did not publish');
    });
    // PREMISE 2: a second read really was attempted and really did fail.
    await waitFor(() => {
      if (reads < 2) throw new Error('no re-read was issued — the premise failed');
    });

    // Now the unaccountable grid. The board snapshot in hand is stale.
    await userEvent.click(within(await cardFor('ug-bad')).getByTestId('unpublished-publish'));
    const text = await waitFor(() => {
      const el = screen.queryByTestId('grid-publish-error');
      if (el === null) throw new Error('the stale-board publish was not refused');
      return (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    });
    expect(
      text,
      'a FAILED re-read still licenses "discard this grid" over a snapshot the app does not trust',
    ).not.toMatch(/discard/i);
    expect(text).toContain('has not been able to read the board');
    expect(appendLedger(good.appends)).toEqual(['grid:Clean Grid']);
  });

  it('🔴 P3 — the board read is still IN FLIGHT: same refusal, same non-destructive copy', async () => {
    // The first read has not resolved, so no board row is known yet. This is the state
    // a viewer reaches by pressing Publish immediately on load.
    const { shared: good, appends } = fakeShared({ seed: BOARD });
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const shared: SharedStore = {
      ...good,
      async list(opts) {
        await gate;
        return good.list(opts);
      },
    };
    mountApp({ shared, store: seedStore(boardOnlyGrid()) });

    const grid = await privateGridCard();
    // PREMISE: the board genuinely has not loaded — its own loading state is up.
    expect(appends, 'the gate did not hold the board read').toHaveLength(0);
    await userEvent.click(within(grid).getByTestId('unpublished-publish'));

    await waitFor(() => {
      if (screen.queryByTestId('grid-publish-error') === null && appends.length === 0)
        throw new Error('the publish neither refused nor appended — it never resolved');
    });
    const text = (screen.getByTestId('grid-publish-error').textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim();
    expect(
      text,
      'an unread board tells the viewer to remove members that are perfectly fine',
    ).not.toMatch(/remove/i);
    expect(text).toContain('has not been able to read the board');
    expect(appendLedger(appends)).toEqual([]);
    release();
  });
});

// ===========================================================================
// 🔴 THE NOTICE'S RENDER SITE — it must outlive the record it is about
// ===========================================================================

describe('🔴 a cascade failure is REPORTED even when the grid’s record is retired', () => {
  it('🔴 PATH D — the GRID’s own pointer write is refused after two irreversible appends', async () => {
    // 🔴 THE REGRESSION THIS CLOSES. The notice used to render INSIDE the confirm
    // dialog, nested under `gridPublishRec` — which resolves out of a list filtered by
    // `publishedThisSession`. So at the exact moment the grid's pointer write is
    // refused, `publishRecord` retires the local id, the record leaves the list, and
    // the notice became unrenderable: two rows public and permanent, nothing on screen.
    const { shared, appends } = fakeShared({ seed: BOARD });
    const kv = fakeAppStorage(
      seedStore(privateGrid(['mk-a', DRAFT_LOCAL_ID], ['qk-1'])),
      {},
      {
        // Aimed at the GRID's prefix only, so the DEPENDENCY's publish succeeds in full
        // and the failure is the grid's own pointer write — the state the notice is for.
        failSetTimes: 9,
        failSetPrefix: 'unpub:grid:v1:',
        failSetError: 'QUOTA_EXCEEDED',
      },
    );
    mountApp({ shared, store: {}, appStorage: kv.appStorage });

    const grid = await privateGridCard();
    await userEvent.click(within(grid).getByTestId('unpublished-publish'));
    await userEvent.click(await screen.findByTestId('grid-publish-go'));

    // PREMISE: both rows really are public and permanent.
    await waitFor(() => {
      if (appends.length < 2) throw new Error(`only ${appends.length} of 2 appends have landed`);
    });
    expect(appendLedger(appends)).toEqual([`combination:${DRAFT_NAME}`, 'grid:Mixed Grid']);
    // PREMISE: the grid's record really was retired, which is what used to take the
    // notice down with it.
    await waitFor(() => {
      if (
        screen
          .queryAllByTestId('unpublished-card')
          .some((c) => c.getAttribute('data-local-id') === GRID_LOCAL_ID)
      )
        throw new Error('the grid record was not retired — the premise failed');
    });

    // 🔴 THE CLAIM: the notice is on screen anyway.
    const notice = await waitFor(() => {
      const el = screen.queryByTestId('grid-publish-error');
      if (el === null)
        throw new Error('the cascade failure notice is unrenderable once the record retires');
      return el;
    });
    const text = (notice.textContent ?? '').replace(/\s+/g, ' ').trim();
    // It names what the DEPENDENCY did, and then the grid's own already-pinned
    // half-published sentence — which says the grid IS public, because it is.
    expect(text).toContain(
      `1 item was published and is now public and permanent: ${DRAFT_NAME}.`,
    );
    expect(text, 'the grid is public but the notice says it is still private').not.toMatch(
      /still private/,
    );
    expect(text).toContain('Your grid WAS published to the shared board');
  });

  it('🔴 a DEPENDENCY whose POINTER write fails is reported as PUBLISHED, not as nothing', async () => {
    // 🔴 THE SELF-CONTRADICTION THIS CLOSES. `publishRecord` throws only AFTER its
    // `append` resolved, so this dependency's row IS public — and routing it through
    // the ordinary failure arm produced "Nothing was published." in the same sentence
    // as a host error about that very row.
    const { shared, appends } = fakeShared({ seed: BOARD });
    const kv = fakeAppStorage(
      seedStore(privateGrid(['mk-a', DRAFT_LOCAL_ID], ['qk-1'])),
      {},
      { failSetTimes: 9, failSetPrefix: 'draft:v1:', failSetError: 'QUOTA_EXCEEDED' },
    );
    mountApp({ shared, store: {}, appStorage: kv.appStorage });

    const grid = await privateGridCard();
    await userEvent.click(within(grid).getByTestId('unpublished-publish'));
    await userEvent.click(await screen.findByTestId('grid-publish-go'));

    const notice = await waitFor(() => {
      const el = screen.queryByTestId('grid-publish-error');
      if (el === null) throw new Error('no cascade failure notice rendered');
      return el;
    });
    const text = (notice.textContent ?? '').replace(/\s+/g, ' ').trim();
    // The named claim first — the one the old arm got wrong.
    expect(
      text,
      'a dependency whose row is PUBLIC was reported as "Nothing was published"',
    ).not.toMatch(/Nothing was published/);
    expect(text).toBe(
      `1 item was published and is now public and permanent: ${DRAFT_NAME}. But ` +
        `${DRAFT_NAME}'s own private copy could not be updated with its key ` +
        '(QUOTA_EXCEEDED), so you have no stored handle on that row. The grid “Mixed Grid” ' +
        'was not published — a public grid must not point at a member this app can no longer ' +
        'account for. The grid is unchanged and still private.',
    );
    // 🔴 AND THE WIRE AGREES WITH THE SENTENCE: the matchup landed, the grid did not.
    expect(appendLedger(appends)).toEqual([`combination:${DRAFT_NAME}`]);
  });
});

// ===========================================================================
// 🔴 THE NOTICE'S LIFETIME — it must outlive a nav, and NOT outlive its own fix
// ===========================================================================

describe('🔴 the grid-publish notice clears when the viewer does what it asked', () => {
  it('🔴 refused, then a SUCCESSFUL publish clears the alert — in one mount', async () => {
    // 🔴 THE DEFECT THIS CLOSES, MEASURED ACROSS THREE STEPS IN ONE MOUNT: the direct
    // publish path never cleared `gridPublishError`, so a viewer who got a refusal and
    // then published successfully was left looking at a red alert saying the publish
    // had been refused. A refusal whose point is to be actionable must not outlive the
    // action that answers it.
    const { shared, appends } = fakeShared({ seed: BOARD });
    mountApp({
      shared,
      store: {
        // One grid naming a key nothing can account for → refused.
        [unpubGridKey('ug-bad')]: {
          ...privateGrid(['mk-a', 'dm-nowhere'], ['qk-1']),
          localId: 'ug-bad',
          name: 'Bad Grid',
        },
        // …and one of ordinary published members → publishes.
        [unpubGridKey('ug-good')]: {
          ...privateGrid(['mk-a'], ['qk-1']),
          localId: 'ug-good',
          name: 'Good Grid',
        },
      },
    });

    const cardFor = async (localId: string): Promise<HTMLElement> => {
      await openMyList('grid');
      return waitFor(() => {
        const el = screen
          .getAllByTestId('unpublished-card')
          .find((c) => c.getAttribute('data-local-id') === localId);
        if (!el) throw new Error(`the private grid ${localId} is not listed`);
        return el;
      });
    };

    // ---- STEP 1: the refusal renders ----
    await userEvent.click(within(await cardFor('ug-bad')).getByTestId('unpublished-publish'));
    await waitFor(() => {
      if (screen.queryByTestId('grid-publish-error') === null)
        throw new Error('step 1 did not refuse — the premise failed');
    });
    // ⚠️ THE PREMISE IS DELIBERATELY COPY-AGNOSTIC. Pinning the refusal's wording here
    // would make this case fail at base on step 1's SENTENCE, and step 3's claim —
    // which is the whole point — would never execute. The wording is pinned where it
    // belongs, in `lib/gridCascade.test.ts` and in the refusal cases above.
    expect(appendLedger(appends), 'step 1 published instead of refusing').toEqual([]);

    // ---- STEP 2: a publish that SUCCEEDS ----
    await userEvent.click(within(await cardFor('ug-good')).getByTestId('unpublished-publish'));
    await waitFor(() => {
      if (appends.length < 1) throw new Error('step 2 did not publish — the premise failed');
    });
    expect(appendLedger(appends)).toEqual(['grid:Good Grid']);

    // ---- STEP 3: the alert is gone ----
    expect(
      screen.queryByTestId('grid-publish-error'),
      'the refusal alert survived a publish that succeeded',
    ).toBeNull();
  });

  it('🔴 EDITING cannot remove an unaccountable member — so the remedy sentence names DISCARD', async () => {
    // 🔴 THIS IS WHY THE REFUSAL'S REMEDY CHANGED. An earlier draft said "Edit the grid
    // and remove it", written without checking the route. MEASURED HERE: `GridPicker`
    // renders only keys present in `items`, an unaccountable key is in none of the
    // three sources so it is never rendered, and `order` carries it through
    // `onConfirm([...order])` unchanged — the picker's own invariant 3 ("nothing is
    // ever silently dropped") keeps it ON PURPOSE. Re-saving the grid changes nothing
    // and the publish is refused again.
    const { shared, appends } = fakeShared({ seed: BOARD });
    const kv = fakeAppStorage({
      [unpubGridKey(GRID_LOCAL_ID)]: privateGrid(['mk-a', 'dm-nowhere'], ['qk-1']),
    });
    mountApp({ shared, store: {}, appStorage: kv.appStorage });

    // Edit the grid and re-confirm the matchup axis — the "remove it" route.
    await userEvent.click(within(await privateGridCard()).getByTestId('unpublished-edit'));
    const form = await screen.findByTestId('grid-form');
    await userEvent.click(within(form).getByTestId('grid-form-pick-rows'));
    const rowList = await screen.findByTestId('grid-pick-rows');
    // PREMISE, ASSERTED: the unaccountable key is NOT offered as a row, and the picker
    // says so — so there is nothing to deselect.
    expect(
      within(rowList)
        .getAllByTestId('grid-pick-rows-option')
        .map((el) => el.getAttribute('data-key')),
      'the unaccountable key is listed after all — this case tests nothing',
    ).toEqual(['mk-a']);
    expect(within(rowList).getByTestId('grid-pick-rows-unlisted')).toHaveTextContent(
      'no longer on the board',
    );
    await userEvent.click(within(rowList).getByTestId('grid-pick-rows-confirm'));
    await userEvent.click(within(form).getByTestId('grid-form-submit'));

    // 🔴 THE MEASUREMENT: the saved record STILL names it.
    const written = await waitFor(() => {
      const hit = [...kv.sets].reverse().find((w) => w.key.startsWith('unpub:grid:v1:'));
      if (!hit) throw new Error('the edit was never saved');
      return hit.value as UnpublishedGrid;
    });
    expect(
      written.matchupKeys,
      'the picker DID drop the unlisted key — then the remedy sentence should say "edit", not "discard"',
    ).toEqual(['mk-a', 'dm-nowhere']);

    // …so the publish is refused again, which is what makes DISCARD the honest remedy.
    await userEvent.click(within(await privateGridCard()).getByTestId('unpublished-publish'));
    const notice = await waitFor(() => {
      const el = screen.queryByTestId('grid-publish-error');
      if (el === null) throw new Error('the second publish was not refused');
      return el;
    });
    expect(notice).toHaveTextContent('editing the grid cannot remove it');
    expect(appendLedger(appends)).toEqual([]);
  });

  it('🔴 …but it DOES survive a nav away and back — argued last round, measured now', async () => {
    // 🔴 THIS WAS ON MY OWN "NOT VERIFIED" LIST. It followed from `App` holding the
    // state while `MyGridsView` renders it, and an independent probe confirmed it; it
    // is pinned here so it is measured rather than argued.
    //
    // ⚠️ IT IS THE OPPOSITE OF `MyList`'s OWN CHANNEL, which holds its error in LOCAL
    // state and loses it on the same nav — `publishPointerFailure.test.tsx` pins that
    // as a characterisation. Two channels, two lifetimes, both stated.
    const { shared } = fakeShared({ seed: BOARD });
    mountApp({
      shared,
      store: {
        [unpubGridKey(GRID_LOCAL_ID)]: privateGrid(['mk-a', 'dm-nowhere'], ['qk-1']),
      },
    });

    const grid = await privateGridCard();
    await userEvent.click(within(grid).getByTestId('unpublished-publish'));
    await waitFor(() => {
      if (screen.queryByTestId('grid-publish-error') === null)
        throw new Error('the refusal did not render — the premise failed');
    });

    await userEvent.click(await screen.findByTestId('nav-home'));
    // PREMISE, ASSERTED: the surface really is unmounted, so the return below is a
    // re-render and not a nav that navigated nowhere.
    await screen.findByTestId('grid-open-panel');
    expect(screen.queryByTestId('my-grids-view')).toBeNull();
    expect(screen.queryByTestId('grid-publish-error')).toBeNull();

    await openMyList('grid');
    expect(
      screen.queryByTestId('grid-publish-error'),
      'the grid-publish notice did NOT survive the nav — `App` is not holding it after all',
    ).not.toBeNull();
  });
});

// ===========================================================================
// THE INVARIANT THE WHOLE FEATURE RESTS ON — no result row names a local id
// ===========================================================================

describe('🔴 a RESULT row can never carry a private member’s local id', () => {
  it('a cell of a formerly-private member publishes its result under the MINTED key', async () => {
    // 🔴 THE GRID IS PRIVATE-ONLY, 1×1, SO THE MATRIX HAS EXACTLY ONE CELL and it is
    // unambiguously the formerly-private pair. With a board member in the grid the
    // first cell would be the board one, and running it would prove nothing about the
    // private path.
    const { shared, appends } = fakeShared({ seed: BOARD });
    mountApp({ shared, store: seedStore(privateGrid([DRAFT_LOCAL_ID], [PROMPT_LOCAL_ID])) });

    const card = await privateGridCard();
    await userEvent.click(within(card).getByTestId('unpublished-publish'));
    await userEvent.click(await screen.findByTestId('grid-publish-go'));
    await waitFor(() => expect(appends).toHaveLength(3));
    // `fk_1` = the matchup, `fk_2` = the prompt, `fk_3` = the grid.
    expect(gridKeysOf(appends[2]!)).toEqual({ matchupKeys: ['fk_1'], promptKeys: ['fk_2'] });

    // ---- open the now-published grid and run its one cell ----
    await userEvent.click(await screen.findByTestId('nav-home'));
    const openCard = await waitFor(() => {
      const el = screen
        .getAllByTestId('grid-card')
        .find((c) => c.getAttribute('data-key') === 'fk_3');
      if (!el) throw new Error('the published grid is not listed');
      return el;
    });
    await userEvent.click(within(openCard).getByTestId('grid-open'));

    const matrix = await screen.findByTestId('results-grid');
    // 🔴 THE PREMISE, ASSERTED: one row, one column, one cell. If the formerly-private
    // member had NOT resolved (i.e. the rewrite had not happened) there would be no
    // row at all and the run below would silently have nothing to click.
    const cells = await waitFor(() => {
      const found = within(matrix).getAllByTestId('grid-cell');
      if (found.length !== 1) throw new Error(`expected 1 cell, found ${found.length}`);
      return found;
    });
    expect(cells[0]).toHaveAttribute('data-state', 'empty');

    await userEvent.click(within(cells[0]!).getByTestId('run-cell'));
    await userEvent.click(await screen.findByTestId('cell-confirm-run'));

    // ---- the RESULT row, read off the wire ----
    const result = await waitFor(
      () => {
        const hit = appends.find((v) => kindOf(v) === 'result');
        if (!hit) throw new Error('no result row was appended');
        return hit;
      },
      { timeout: 5000 },
    );
    const data = result.data as { comboKey: string; configId: string; promptKey: string };
    // 🔴 THE CLAIM: the MINTED keys, never the local ids. This is the row that is both
    // permanent and NOT grid-scoped, so a local id here would be unresolvable for every
    // viewer and every grid that contains the cell.
    expect(data.comboKey, 'the result row was keyed on the private matchup’s LOCAL id').toBe(
      'fk_1',
    );
    expect(data.promptKey, 'the result row was keyed on the private prompt’s LOCAL id').toBe(
      'fk_2',
    );
    expect(data.configId).toBe('cfg-p');
    // 🔴 POSITIVE CONTROL ON THE SCAN, in the same case: a result row DID reach the
    // log, so the whole-log absence below is an absence and not an empty array.
    expect(appends.filter((v) => kindOf(v) === 'result')).toHaveLength(1);
    const wire = JSON.stringify(appends);
    expect(wire, 'a private local id reached the public board').not.toContain(DRAFT_LOCAL_ID);
    expect(wire).not.toContain(PROMPT_LOCAL_ID);
  });
});
