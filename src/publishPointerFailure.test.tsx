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
// string via the exported `publishPointerFailedNotice`, so a reword has to move
// the copy and the test together rather than walking past a keyword.
//
// ⚠ Session-scoped is the honest ceiling and this file does not claim more: a
// full reload re-reads the store, and the store is exactly what could not be
// written. The guard is "never offered again IN THIS SESSION".

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

const LOCAL_ID = 'l-halfpub';

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
    /** Mount with the record seeded and every `set` under its OWN prefix refused. */
    async function arrange() {
      const s = fakeShared({ seed: [] });
      const kv = fakeAppStorage(
        { [storageKey]: record },
        {},
        // More refusals than the case can possibly consume, on purpose: with
        // `failSetTimes: 1` a SECOND publish attempt would find the store healthy
        // and succeed, which would make the duplicate look like a recovery.
        { failSetTimes: 9, failSetPrefix: prefix, failSetError: HOST_ERROR },
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
      // 🔴 THE WHOLE STRING, from the exported builder. A keyword guard ("could
      // not") would be walkable by a reword that quietly implied the publish
      // failed — which is the reading that gets a viewer to click again.
      expect(notice).toHaveTextContent(publishPointerFailedNotice(noun, HOST_ERROR));
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
  });
});
