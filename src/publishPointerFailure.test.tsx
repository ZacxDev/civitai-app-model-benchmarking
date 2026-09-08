// 🔴 THE HALF-PUBLISHED RECORD: `shared.append` SUCCEEDS and the pointer write
// that retires the private record REJECTS. Driven through the REAL App, on ALL
// THREE publishable objects, because all three now travel one path
// (`publishRecord` in App.tsx) and the defect was present at all three.
//
// WHAT WENT WRONG, AND WHY THE SUITE COULD NOT SEE IT. Each publish path did
// `await shared.append(payload)` then `await appStorage.set(<prefix>, pointer)`
// with NO `catch`. The two calls fail for completely different reasons and are
// not correlated: `append` is a shared-board write, while `set` REJECTS on the
// per-APP 50MB quota (so ONE viewer at the ceiling breaks it for EVERY viewer),
// on a value over 64KB, and for an anonymous viewer. When the second one
// rejected:
//
//   - the row was already public, and PERMANENT — `update`/`withdraw` are
//     addressed by the host-minted key that only ever reached the write that
//     just failed, `report()` does not hide, and there is no merge;
//   - the private record kept its editable body, so `isSubmitted` /
//     `isPublishedPrompt` / `isPublishedGrid` all still said "unpublished" and
//     the card came back reading **Publish**;
//   - the rejection was swallowed by a bare `finally`, so nothing was said;
//   - and a second click appended a SECOND permanent public row. `append` has no
//     idempotency key, so the duplicate is unmergeable and, from this app,
//     unremovable.
//
// Every case below therefore asserts the same three things per object: exactly
// ONE append, the record RETIRED from the list (so the button is not offered
// again), and the honest sentence RENDERED — pinned as the whole normalised
// string against a LITERAL typed into this file (`NOTICE_PRIVATE_COPY_REMOVED` /
// `NOTICE_PRIVATE_COPY_SURVIVED` below), so a reword of the copy fails here by
// name. The call to the exported `publishPointerFailedNotice` is kept ALONGSIDE
// each literal as a separate, much weaker claim — and the description here used
// to over-state what that claim is. It is NOT a wiring check.
// `toHaveTextContent` compares a VALUE, so it cannot see WHICH code assembled
// the sentence. Measured on this tree: making `App.tsx` assemble the identical
// sentence inline and never call the builder at all left the suite 526/526
// GREEN. What these calls actually pin is that THE RENDERED COPY AND THE
// BUILDER'S COPY AGREE — which is violated only when the App hardcodes AND the
// builder is reworded. Both mutations together turn exactly the two
// `toHaveTextContent` lines red (6 failures, one per noun per branch) while the
// literal `toBe` above stays green; everywhere else the literal fails first and
// these are redundant with it.
//
// 🔴 THE ROUND-2 FINDING, AND WHY THERE ARE NOW TWO POINTER-FAILURE OUTCOMES.
// The copy used to end "…cannot be published again", which was FALSE: the only
// thing retiring the record was `publishedLocalIds`, i.e. React state, so a
// RELOAD re-read the store — the very store that could not be written — and the
// card offered **Publish** again. The app now DELETES the private record on that
// path (its only remaining purpose was to become the pointer), which closes it
// for real when the delete lands. But `delete` is a per-viewer KV write like
// `set` and can be refused by the same host, so there are two states and the
// copy branches on them. BOTH are driven here, and both are pinned as the whole
// normalised string against their own literal:
//
//   - delete RESOLVES  → the store no longer holds the key, so a reload cannot
//     re-list it. Asserted on the STORE, not on the rendered list — the list is
//     already empty from the session retirement and would pass either way.
//   - delete IS REFUSED → the record survives with its editable body, and the
//     copy says so and tells the viewer not to click Publish again.
//
// ⚠ What is still NOT covered anywhere: a real page reload. jsdom does not
// reload, so "the reload cannot re-list it" is asserted through the store's
// contents, which is the state the reload would read — not by reloading.

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Harness } from '@civitai/blocks-react/testing';

import { App, type AppDeps } from './App.js';
import { publishPointerFailedNotice } from './lib/unpublished.js';
import { DRAFT_PREFIX, buildDraft, draftKey } from './lib/drafts.js';
import { UNPUB_PROMPT_PREFIX, buildUnpubPrompt, unpubPromptKey } from './lib/unpubPrompts.js';
import { UNPUB_GRID_PREFIX, buildUnpubGrid } from './lib/unpubGrids.js';
import { unpubGridKey } from './lib/grids.js';
import { CKPT_SDXL, fakeAppStorage, fakeShared, immediateSleep, openView } from './test-helpers.js';

const VIEWER_ID = 99;

/** The host's own error string for a refused `set`. Deliberately NOT viewer
 * copy — the notice quotes it, and a case below proves the notice is the app's
 * sentence and not a bare host string. */
const HOST_ERROR = 'QUOTA_EXCEEDED';

/**
 * The host's error for a refused `delete`. Deliberately DIFFERENT from
 * `HOST_ERROR`: the notice quotes the SET failure, and a fixture that spelled
 * both the same could not see a builder that quoted the wrong one.
 */
const DELETE_ERROR = 'STORAGE_UNAVAILABLE';

const LOCAL_ID = 'l-halfpub';

/**
 * 🔴 THE COPY ITSELF, TYPED OUT — NOT obtained from the builder.
 *
 * WHAT WENT WRONG BEFORE THIS EXISTED. Every assertion on the notice called
 * `publishPointerFailedNotice(...)` for its expectation, i.e. it derived the
 * expected value from the implementation under test, so BOTH SIDES MOVED
 * TOGETHER on any reword and the regression this whole change exists to prevent
 * was reintroducible with a fully green suite. Measured, on the tree before
 * these two constants landed:
 *
 *   - reverting the removed branch to the sentence this change proved FALSE —
 *     "so it is no longer listed here and cannot be published again" — left the
 *     suite green;
 *   - rewording the REFUSED branch to claim removal anyway — "so the private
 *     copy has been discarded and will not be offered again" — also left it
 *     green. The `not.toBe(...)` below cannot see that one: the two strings
 *     still differ, they are just both wrong.
 *
 * So the expectation is a LITERAL here. Only `noun` (this file's fixture) and
 * `HOST_ERROR` (this file's constant) are interpolated; nothing is read from
 * `src/lib/unpublished.ts`. A reword of either branch fails here by name, which
 * is the point: the copy is the guard, so the copy is what is pinned.
 *
 * ⚠ These are prose, and a cosmetic reword WILL fail them. That cost is
 * deliberate — pay it and update the literal, having re-read whether the new
 * sentence still says the true thing about the store.
 */
const NOTICE_PRIVATE_COPY_REMOVED = (noun: string): string =>
  `Your ${noun} WAS published to the shared board — but your private copy could not be ` +
  `updated with its key (${HOST_ERROR}), so the private copy has been discarded and this ` +
  `list will not offer to publish it again. Find it under Published by you to edit or ` +
  `remove it.`;

const NOTICE_PRIVATE_COPY_SURVIVED = (noun: string): string =>
  `Your ${noun} WAS published to the shared board — but your private copy could not be ` +
  `updated with its key (${HOST_ERROR}), and discarding that private copy was refused too — ` +
  `so after a reload it can reappear here still offering Publish. Do NOT publish it again: ` +
  `that would put a SECOND, unmergeable copy on the board. Find it under Published by you ` +
  `to edit or remove it.`;

/**
 * The rendered notice as ONE normalised string. JSX and the `Alert` wrapper both
 * introduce whitespace the copy does not have, so the comparison is against the
 * collapsed text — the same normalisation `toHaveTextContent` applies, done here
 * so the assertion can be an EQUALITY rather than a substring match. A substring
 * match would pass a notice that also said something else.
 */
function noticeText(el: HTMLElement): string {
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function mountApp(deps: Partial<AppDeps>) {
  return render(
    <Harness
      viewer={{ id: VIEWER_ID, username: 'me' }}
      theme="dark"
      consentGranted
      buzzBudget={1000}
      buzz={{ balance: 5000 }}
      buzzBalance={{ blue: 0, green: 0, yellow: 5000 }}
      cannedPicks={{ Checkpoint: CKPT_SDXL }}
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
 * One publishable object, as this file needs to drive it: where its record
 * lives, what a seeded record looks like, and which view carries its My tab.
 *
 * 🔴 THE PREFIXES ARE THE THREE REAL ONES, IMPORTED. `failSetPrefix` is aimed at
 * exactly one of them per case, so the refusal reaches the POINTER WRITE and
 * nothing else the app does on that screen — a blanket `failSetTimes` would also
 * eat the archive and how-to writes and stop meaning anything.
 */
const OBJECTS = [
  {
    noun: 'matchup' as const,
    view: 'Matchups' as const,
    prefix: DRAFT_PREFIX,
    storageKey: draftKey(LOCAL_ID),
    record: buildDraft(LOCAL_ID, {
      name: 'Half-published matchup',
      description: 'went public, stayed local',
      configs: [
        {
          id: 'cfgA',
          checkpoint: {
            versionId: 1001,
            modelId: 500,
            baseModel: 'SDXL 1.0',
            modelName: 'JuggernautXL',
          },
          loras: [],
        },
      ],
    }),
  },
  {
    noun: 'prompt' as const,
    view: 'Prompts' as const,
    prefix: UNPUB_PROMPT_PREFIX,
    storageKey: unpubPromptKey(LOCAL_ID),
    record: buildUnpubPrompt(LOCAL_ID, {
      name: 'Half-published prompt',
      description: 'went public, stayed local',
      default: { prompt: 'a lighthouse at dusk', params: { steps: 30 } },
      overrides: {},
    }),
  },
  {
    noun: 'grid' as const,
    view: 'Grids' as const,
    prefix: UNPUB_GRID_PREFIX,
    storageKey: unpubGridKey(LOCAL_ID),
    record: buildUnpubGrid(LOCAL_ID, {
      name: 'Half-published grid',
      description: 'went public, stayed local',
      matchupKeys: ['mk-alpha'],
      promptKeys: ['qk-tango'],
    }),
  },
];

describe.each(OBJECTS)(
  '🔴 a $noun whose pointer write is REFUSED after a successful append',
  ({ noun, view, prefix, storageKey, record }) => {
    /**
     * Mount with the record seeded and every `set` under its OWN prefix refused.
     * `alsoRefuseDelete` additionally refuses the fallback `delete` on the same
     * prefix — the second of the two outcomes the copy branches on.
     */
    async function arrange(alsoRefuseDelete = false) {
      const s = fakeShared({ seed: [] });
      const kv = fakeAppStorage(
        { [storageKey]: record },
        {},
        {
          // More refusals than the case can possibly consume, on purpose: with
          // `failSetTimes: 1` a SECOND publish attempt would find the store
          // healthy and succeed, which would make the duplicate look like a
          // recovery.
          failSetTimes: 9,
          failSetPrefix: prefix,
          failSetError: HOST_ERROR,
          ...(alsoRefuseDelete
            ? { failDeleteTimes: 9, failDeletePrefix: prefix, failDeleteError: DELETE_ERROR }
            : {}),
        },
      );
      mountApp({ shared: s.shared, appStorage: kv.appStorage });
      await openView(view);
      await userEvent.click(await screen.findByTestId('subtab-my'));
      const card = await screen.findByTestId('unpublished-card');
      await userEvent.click(within(card).getByTestId('unpublished-publish'));
      await waitFor(() => expect(s.appends).toHaveLength(1));
      return { ...s, ...kv };
    }

    it('appends EXACTLY ONCE, even when the publish button is clicked again', async () => {
      const { appends, setAttempts, sets } = await arrange();

      // POSITIVE CONTROL on the premise: the app really did TRY the pointer
      // write, and the host really did refuse it. `setAttempts` records a
      // rejected `set`; `sets` records only what was stored. Without this pair
      // the whole case is satisfiable by a publish that never wrote a pointer at
      // all — which is a different bug with the same symptom.
      expect(
        setAttempts.map((w) => w.key),
        'the app never attempted the pointer write',
      ).toContain(storageKey);
      expect(
        sets.map((w) => w.key),
        'the pointer write was not actually refused',
      ).not.toContain(storageKey);

      // 🔴 THE FIX: the record is retired from the list the moment the append
      // resolves, so the UI has no Publish left to offer for it.
      await waitFor(() => expect(screen.queryByTestId('unpublished-card')).toBeNull());

      // …and the second click, for real. When the guard is broken the card is
      // still here and this loop clicks it; when it holds, the loop is empty and
      // the assertion below is about a board that was never asked to move again.
      for (const b of screen.queryAllByTestId('unpublished-publish')) {
        await userEvent.click(b);
      }
      await new Promise((r) => setTimeout(r, 0));
      expect(appends, 'a second permanent public row was appended').toHaveLength(1);
    });

    it('SAYS SO — the row is public, the local copy is not, and both halves are named', async () => {
      await arrange();
      const notice = await screen.findByTestId('unpublished-error');

      // 🔴 THE GUARD: the whole normalised sentence, against a LITERAL typed into
      // this file. A keyword guard ("could not") would be walkable by a reword
      // that quietly implied the publish failed — which is the reading that gets
      // a viewer to click again — and an expectation built by CALLING the builder
      // is walkable by ANY reword, because both sides move together.
      expect(noticeText(notice)).toBe(NOTICE_PRIVATE_COPY_REMOVED(noun));

      // …and a much weaker, secondary claim: the rendered copy and the BUILDER'S
      // copy AGREE. This is not a wiring check and never was —
      // `toHaveTextContent` compares a value, so an App that assembled this
      // exact sentence inline and never called the builder passes it (measured:
      // 526/526 green). It can only fail when the App hardcodes AND the builder
      // is reworded; in every other case the literal above fails first.
      expect(notice).toHaveTextContent(publishPointerFailedNotice(noun, HOST_ERROR, true));
    });

    // 🔴 THE ROUND-2 FIX ITSELF. The session retirement empties the LIST either
    // way, so the list cannot see this — the claim "a reload will not re-offer
    // Publish" is a claim about the STORE, and that is where it is asserted.
    it('DELETES the private record, so the store a reload would read no longer holds it', async () => {
      const { deleteAttempts, deletes, store } = await arrange();

      // POSITIVE CONTROL on the premise: the fallback really ran, on THIS key.
      await waitFor(() =>
        expect(deleteAttempts, 'the app never attempted the fallback delete').toContain(storageKey),
      );
      expect(deletes, 'the delete was attempted but not honoured').toContain(storageKey);
      expect(
        store.has(storageKey),
        'the private record survived, so a reload re-offers Publish',
      ).toBe(false);
    });

    // 🔴 THE OTHER OUTCOME, and the reason the copy is a branch rather than a
    // second absolute claim: the fallback is a write to the store that just
    // refused a write.
    it('when the fallback DELETE is refused too, it says so instead of claiming removal', async () => {
      const { deleteAttempts, deletes, store, appends } = await arrange(true);

      // PREMISE, both directions: attempted, and genuinely refused.
      await waitFor(() =>
        expect(deleteAttempts, 'the app never attempted the fallback delete').toContain(storageKey),
      );
      expect(deletes, 'the fallback delete was not actually refused').not.toContain(storageKey);
      expect(store.has(storageKey), 'the record was removed despite the refusal').toBe(true);

      const notice = await screen.findByTestId('unpublished-error');

      // 🔴 THE GUARD, same shape as the other branch and for the same reason: a
      // LITERAL, so a reword that claims removal ANYWAY — the exact reword that
      // gets a viewer to click Publish and mint the second unmergeable public
      // row — fails here. `not.toBe(...)` below cannot see that one: two wrong
      // sentences still differ from each other.
      expect(noticeText(notice)).toBe(NOTICE_PRIVATE_COPY_SURVIVED(noun));

      // The same secondary claim as the other branch, with the same limit: the
      // rendered copy and the builder's copy AGREE. It says nothing about which
      // code assembled the rendered sentence.
      expect(notice).toHaveTextContent(publishPointerFailedNotice(noun, HOST_ERROR, false));

      // …and the two branches are DIFFERENT sentences. Without this, a builder
      // that ignored its third argument would satisfy both cases at once.
      expect(publishPointerFailedNotice(noun, HOST_ERROR, false)).not.toBe(
        publishPointerFailedNotice(noun, HOST_ERROR, true),
      );

      // Still exactly one public row: the refused fallback changes what is SAID,
      // never how many times `append` ran.
      expect(appends).toHaveLength(1);
    });
  },
);

describe('the NEGATIVE CONTROL: a publish whose pointer write succeeds', () => {
  it.each(OBJECTS)('$noun — no error is shown and the pointer is stored', async ({
    view,
    storageKey,
    record,
  }) => {
    // 🔴 WITHOUT THIS the cases above are satisfiable by an app that shows the
    // failure notice on EVERY publish. Same fixture, same route, `failSetTimes`
    // omitted — the only difference is whether the host refuses.
    const s = fakeShared({ seed: [] });
    const kv = fakeAppStorage({ [storageKey]: record });
    mountApp({ shared: s.shared, appStorage: kv.appStorage });
    await openView(view);
    await userEvent.click(await screen.findByTestId('subtab-my'));
    const card = await screen.findByTestId('unpublished-card');
    await userEvent.click(within(card).getByTestId('unpublished-publish'));

    await waitFor(() => expect(s.appends).toHaveLength(1));
    await waitFor(() =>
      expect(kv.sets.map((w) => w.key), 'no pointer was stored').toContain(storageKey),
    );
    expect(screen.queryByTestId('unpublished-error')).toBeNull();
    // The record is retired here too — by the pointer, the way it always was.
    await waitFor(() => expect(screen.queryByTestId('unpublished-card')).toBeNull());
    // 🔴 AND THE FALLBACK DELETE IS SCOPED TO THE FAILURE. On the happy path the
    // record is KEPT and rewritten to the pointer — the only per-viewer handle on
    // a host-minted key (`publishedPointer`). A delete here would destroy it, and
    // the cases above alone cannot see that: they only ever assert a delete DID
    // happen.
    expect(kv.deleteAttempts, 'the happy path deleted the pointer it just wrote').not.toContain(
      storageKey,
    );
  });
});
