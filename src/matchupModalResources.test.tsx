// The MATCHUP DETAIL MODAL's resource titles, driven through the real App.
//
// ⚠ THIS FILE HAS NOW ASSERTED BOTH ANSWERS, AND THE HISTORY IS THE POINT. It began
// as `matchupModalLinks.test.tsx` pinning a checkpoint link, a LoRA link and two
// `NAVIGATE` payloads. It was renamed and INVERTED when the links were removed before
// release — every route out of a block's sandboxed iframe was shut. It is inverted
// BACK now, because `civitai/civitai` **#5250** shipped `scope: 'site'` on `NAVIGATE`
// and opened one of those routes. The SUBJECT never changed — "what does this modal do
// when a viewer presses a resource name" — only the answer, twice. Renaming rather
// than deleting is what makes that legible.
//
// 🔴 WHAT SURVIVED THE INVERSION, AND MUST KEEP SURVIVING IT. The old file's zeros on
// `window.open` / `location.href` / `location.assign` / `location.replace` are NOT
// relics of the no-navigation posture — they pin a hazard that is unchanged. An
// `<a href>` or a `location.href =` inside this iframe navigates THE IFRAME, replacing
// the running block with an opaque-origin, logged-out civitai.com inside the app
// frame, and same-frame navigation needs no sandbox token at all. The ONE channel that
// is legitimate is the host message. So this file now asserts a POSITIVE on that
// channel and keeps every negative on the others.
//
// 🔴 WHAT THIS FILE COVERS THAT `components/ResourceName.test.tsx` CANNOT: the SEAM.
// `ResourceName` can be perfect in isolation while the MODAL renders a title some
// other way, forgets to pass `modelId`, or passes the WRONG one. The cases below open
// the real modal, enumerate every title in it, press each one, and read the outbound
// message stream — so a modal that wired the checkpoint's id onto the LoRA fails here
// and nowhere else. "Verified in isolation" is exactly how that would survive.
//
// 🔴 THE TWO LoRA FIXTURES DIFFER ON `modelId`, AND NOW THEY MUST RENDER DIFFERENTLY.
// That is the reverse of what this file asserted a moment ago (they had to be
// INDISTINGUISHABLE), and it is the same fixture pair doing the work: a LoRA published
// before the field existed can never be backfilled, so it has no page to go to and
// must stay plain text while its neighbour becomes a control.
//
// 🔴 EVERY ID IN THE FIXTURES IS PAIRWISE DISTINCT — checkpoint model 500 / version
// 1001, LoRA model 900 / version 2002. Fixtures whose values could coincide cannot see
// a mutant that reads the checkpoint's model id for the LoRA, or the model id where the
// version id belongs.

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { SharedItem } from '@civitai/sdk';

import { App } from './App.js';
import { Harness } from './test-harness.js';
import { fakeAppStorage, fakeShared, immediateSleep } from './test-helpers.js';

const VIEWER_ID = 99;

/** A shared `combination` row, written out as the bytes the board holds. */
function comboRow(key: string, title: string, loras: unknown[]): SharedItem {
  return {
    key,
    count: 5,
    authorUserId: 7,
    value: {
      title,
      body: '',
      data: {
        v: 2,
        kind: 'combination', // 🔴 wire value, never renamed
        configs: [
          {
            id: `${key}-cfg`,
            checkpoint: {
              versionId: 1001,
              modelId: 500,
              baseModel: 'SDXL 1.0',
              modelName: 'JuggernautXL',
            },
            loras,
          },
        ],
      },
    },
    viewerVoted: false,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  } as unknown as SharedItem;
}

/** A LoRA written AFTER `LoraRef.modelId` existed — the LINKABLE one. */
const WITH_MODEL_ID = {
  versionId: 2002,
  modelId: 900,
  weight: 0.8,
  modelName: 'Detail Tweaker',
  minStrength: 0,
  maxStrength: 1.5,
};

/** A LoRA written BEFORE the field existed — permanently without it, so permanently plain. */
const WITHOUT_MODEL_ID = {
  versionId: 4004,
  weight: 0.6,
  modelName: 'Old Tweaker',
  minStrength: 0,
  maxStrength: 1,
};

/**
 * One prompt, so the Top Grid has a COLUMN.
 *
 * 🔴 NOT OPTIONAL SCENERY. The grid's matchup group band (`grid-group-matchup`) is
 * the only route into the detail modal, and the matrix renders no rows at all with
 * zero columns — so a seed of combinations alone makes every case here fail at
 * "unable to find grid-group-matchup", which reads like a broken band rather than a
 * missing fixture. Measured the hard way.
 */
const PROMPT_ROW: SharedItem = {
  key: 'pk1',
  count: 9,
  authorUserId: 7,
  value: {
    title: 'Portrait',
    body: '',
    data: { v: 3, kind: 'prompt', default: { prompt: 'a portrait', params: {} } },
  },
  viewerVoted: false,
  createdAt: new Date(0),
  updatedAt: new Date(0),
} as unknown as SharedItem;

function mount(seed: SharedItem[]) {
  const { shared } = fakeShared({ seed: [...seed, PROMPT_ROW] });
  const seen: { type: string; payload?: unknown }[] = [];
  render(
    <Harness
      viewer={{ id: VIEWER_ID, username: 'me' }}
      theme="dark"
      consentGranted
      buzzBudget={1000}
      buzzBalance={{ blue: 0, green: 0, yellow: 5000 }}
      shared={{ seed: [] }}
      showLog={false}
      onOutbound={(m) => seen.push(m)}
    >
      <App
        deps={{
          resolveResources: async () => [],
          pollIntervalMs: 0,
          sleep: immediateSleep,
          shared,
          appStorage: fakeAppStorage().appStorage,
        }}
      />
    </Harness>,
  );
  return { seen };
}

/** Open the matchup detail modal from the grid's group band, and return it. */
async function openMatchupDetail(): Promise<HTMLElement> {
  await userEvent.click((await screen.findAllByTestId('grid-group-matchup'))[0]!);
  return screen.findByTestId('matchup-detail');
}

/** Every `NAVIGATE` payload the block has asked the host for, in order. */
function navigates(seen: { type: string; payload?: unknown }[]): unknown[] {
  return seen.filter((m) => m.type === 'NAVIGATE').map((m) => m.payload);
}

// ---------------------------------------------------------------------------
// NAVIGATION INTERCEPTION — every channel this jsdom lets a test observe.
//
// 🔴 WHY THIS EXISTS, AND IT IS A GAP THAT WAS FOUND BY MUTATION, NOT BY REVIEW.
// An earlier version of the behavioural case asserted only that no `NAVIGATE`
// message was emitted. That pins a MECHANISM, not a STATE — and two isolated
// mutants walked straight past it. Each added ONLY an `onClick` to `ResourceName`,
// keeping the `<span>`, keeping `textDecoration: 'none'`, touching nothing else:
//
//     onClick={() => window.open('https://civitai.com/models/1', '_blank')}
//     onClick={() => { window.location.href = 'https://civitai.com/models/1' }}
//
// Both SURVIVED a full green suite (781 passed, rc 0): tag was `SPAN`, no `role`, no
// `<a>` in the subtree, and neither emits a host message.
//
// 🔴 AND THAT IS WHY THE RECORDER SURVIVES #5250 UNCHANGED. The component is a control
// now, so "is it interactive" no longer separates right from wrong — WHICH CHANNEL it
// reaches for is the whole question. The second mutant above is still the serious one:
// same-frame navigation needs NO sandbox token at all (`allow-top-navigation` governs
// the TOP context, not the frame's own), so `window.location.href = …` genuinely
// executes in production and replaces the running block with civitai.com INSIDE the
// app frame, at an opaque origin, logged out. A live, visible, broken state — and one
// that would look, to a viewer, almost exactly like the feature working.
//
// ── 🔴 WHAT IS COVERED, AND WHAT IS NOT — MEASURED, NOT ASSUMED ──────────────
//
// Probed against this repo's jsdom (25.0.1) rather than reasoned about:
//
//   ✅ `window.open(...)`                     — plain assignment; stubbable.
//   ✅ `window.location.href = …`             — see below.
//   ✅ `window.location.assign/replace/reload`
//   ✅ a BARE `location.href = …`             — resolves through `globalThis`, which
//      IS `window` here, so it hits the same swapped property. Pinned by a positive
//      control below rather than argued.
//   ✅ `window.top.location` / `window.self.location` — `window.top === window` and
//      `window.self === window` in jsdom, so both route to the swapped property.
//      (In a real browser `top.location` is a different object, and writing it is
//      gated by `allow-top-navigation`, which this block is not granted — so that
//      channel is blocked in production regardless of this test.)
//
// 🔴 HOW, and why it is this shape: `window.location`'s OWN `href` descriptor is
// `configurable: false` and so are `assign`/`replace`, so neither
// `Object.defineProperty(window.location, 'href', …)` nor
// `vi.spyOn(window.location, 'assign')` is possible — both throw `Cannot redefine
// property`. But `window`'s own `location` descriptor IS `configurable: true`, so
// the whole Location can be swapped for a recorder that DELEGATES every read to the
// real one (the SDK transport reads `origin` during these presses) and records the
// writes. Restored in a `finally`.
//
// ⚠️ AND A BEFORE/AFTER COMPARISON OF `location.href` WOULD HAVE BEEN VACUOUS — the
// trap this probe avoided. Measured: a raw `window.location.href = 'https://…'` in
// jsdom neither throws nor changes `href`. A guard reading the URL either side of
// the click is green whatever the component does.
//
// 🔴 RESIDUAL GAPS, STATED BECAUSE A GUARD WHOSE DESCRIPTION OUTRUNS ITS
// IMPLEMENTATION IS WORSE THAN NONE. Two channels are NOT covered, both measured:
//
//   ✗ `document.location.href = …`. `document`'s own `location` descriptor is
//     `configurable: false` (redefining throws `Cannot redefine property:
//     location`), and it is a SEPARATE object from `window.location` — verified:
//     after swapping `window.location`, `document.location === window.location` is
//     `false` and a write through `document.location` is NOT recorded. Narrow in
//     practice: a bare `location.href` IS caught (see above), so only the explicit
//     `document.` spelling escapes.
//   ✗ a programmatically created-and-clicked `<a href>`. jsdom performs no
//     navigation for it and reports nothing this recorder can see (measured: no
//     throw, `href` unchanged). The subtree sweep below catches an anchor that is
//     RENDERED; one created in a handler is invisible.
//
// Neither is a shape anyone writes by accident while trying to make a title
// clickable, which is the threat model here. They are real, and they are named.
// ---------------------------------------------------------------------------

interface NavRecorder {
  open: string[];
  href: string[];
  assign: string[];
  replace: string[];
}

function interceptNavigation(): { rec: NavRecorder; restore: () => void } {
  const rec: NavRecorder = { open: [], href: [], assign: [], replace: [] };
  const realOpen = window.open;
  const realLoc = window.location;

  window.open = ((url?: string | URL) => {
    rec.open.push(String(url ?? ''));
    return null;
  }) as typeof window.open;

  // Reads DELEGATE to the real Location — the SDK transport reads `origin` while
  // these presses happen, and a stand-in that lied about it would break the App in
  // a way that looks nothing like the thing under test.
  const stand = {
    get href() {
      return realLoc.href;
    },
    set href(v: string) {
      rec.href.push(v);
    },
    get origin() {
      return realLoc.origin;
    },
    get protocol() {
      return realLoc.protocol;
    },
    get host() {
      return realLoc.host;
    },
    get hostname() {
      return realLoc.hostname;
    },
    get port() {
      return realLoc.port;
    },
    get pathname() {
      return realLoc.pathname;
    },
    get search() {
      return realLoc.search;
    },
    get hash() {
      return realLoc.hash;
    },
    assign: (v: string) => rec.assign.push(v),
    replace: (v: string) => rec.replace.push(v),
    reload: () => rec.assign.push('reload()'),
    toString: () => realLoc.href,
  };
  Object.defineProperty(window, 'location', { configurable: true, value: stand });

  return {
    rec,
    restore: () => {
      window.open = realOpen;
      Object.defineProperty(window, 'location', { configurable: true, value: realLoc });
    },
  };
}

describe('the matchup detail modal links its resources to civitai.com', () => {
  it('🔴 shows every resource name; the linkable ones are controls and the un-linkable one is not', async () => {
    mount([comboRow('mk1', 'Mixed Combo', [WITHOUT_MODEL_ID, WITH_MODEL_ID])]);
    const modal = await openMatchupDetail();

    // The names are all THERE — the positive control for every assertion below. A
    // modal that rendered no resources at all would satisfy half of them perfectly.
    const byName = (t: string) =>
      within(modal)
        .getAllByTestId('resource-name')
        .find((el) => el.textContent === t)!;
    const names = within(modal)
      .getAllByTestId('resource-name')
      .map((el) => el.textContent);
    expect(names).toContain('JuggernautXL');
    expect(names).toContain('Detail Tweaker');
    expect(names).toContain('Old Tweaker');

    // 🔴 THE LINKABLE PAIR — a control, and one that SAYS WHERE IT GOES. The
    // accessible name is asserted because the visible text is only the model name:
    // a viewer about to leave the app has to be told, and `aria-label` is the only
    // thing that tells them.
    for (const t of ['JuggernautXL', 'Detail Tweaker']) {
      const el = byName(t);
      expect(el.tagName, `${t} is not a control`).toBe('BUTTON');
      expect(el).toHaveAttribute('type', 'button');
      expect(el).toHaveAccessibleName(`Open ${t} on Civitai`);
      // Not `'none'` — the affordance a touch viewer can actually see, where a
      // pointer cursor never appears at all.
      expect(el).not.toHaveStyle({ textDecoration: 'none' });
      expect(el).toHaveStyle({ textDecoration: 'underline' });
    }

    // 🔴 AND THE UN-LINKABLE ONE IS UNCHANGED — not a disabled button, not a styled
    // control: the same inert `<span>` it has always been. `LoraRef.modelId` is
    // optional forever, so this is a permanent case and not a migration state.
    const legacy = byName('Old Tweaker');
    expect(legacy.tagName).toBe('SPAN');
    expect(legacy).toHaveStyle({ textDecoration: 'none' });
    expect(legacy).not.toHaveAttribute('role');

    // 🔴 AND THE MODAL STILL HOLDS NO ANCHOR AT ALL — a whole-subtree sweep, and the
    // guard that did NOT invert with the rest of this file. An `<a href>` here would
    // navigate THIS iframe to an opaque-origin, logged-out civitai.com; that hazard is
    // untouched by #5250. Also `role="link"`: a button must not announce itself as one,
    // because middle-click, copy-link-address and a status-bar URL do not exist here.
    expect(modal.querySelectorAll('a')).toHaveLength(0);
    expect(within(modal).queryAllByRole('link')).toHaveLength(0);
  });

  it('🔴 pressing a resource name asks the host to leave for civitai.com, by THAT channel only', async () => {
    const { seen } = mount([comboRow('mk1', 'Mixed Combo', [WITHOUT_MODEL_ID, WITH_MODEL_ID])]);
    const modal = await openMatchupDetail();

    const byName = (t: string) =>
      within(modal)
        .getAllByTestId('resource-name')
        .find((el) => el.textContent === t)!;
    expect(
      within(modal).getAllByTestId('resource-name').length,
      'no resource titles rendered — every assertion below is vacuous',
    ).toBe(3);
    expect(navigates(seen), 'a NAVIGATE was sent before anything was pressed').toEqual([]);

    const { rec, restore } = interceptNavigation();
    try {
      // 🔴 POSITIVE CONTROL PER CHANNEL, BEFORE THE SWEEP. A zero from a spy is
      // indistinguishable from a spy that was never installed, so each channel is
      // fired once deliberately and its counter watched to move. The bare
      // `location.href` line is doing double duty: it is the control for that
      // channel AND the proof that an unqualified `location` resolves through the
      // swapped property, which the header claims.
      window.open('control://open', '_blank');
      window.location.href = 'control://href';
      location.href = 'control://bare-href';
      window.location.assign('control://assign');
      window.location.replace('control://replace');
      expect(
        {
          open: rec.open.length,
          href: rec.href.length,
          assign: rec.assign.length,
          replace: rec.replace.length,
        },
        'a navigation channel could not be observed — the zeros below would be meaningless',
      ).toEqual({ open: 1, href: 2, assign: 1, replace: 1 });

      // Instrument proven; zero it and run the real sweep.
      rec.open.length = 0;
      rec.href.length = 0;
      rec.assign.length = 0;
      rec.replace.length = 0;

      // ---- THE CHECKPOINT TITLE ----
      //
      // 🔴 THE WHOLE PAYLOAD, BY VALUE, IN ONE ASSERTION — not `toContain`, not a
      // `path` check with `scope` left unread. Three mutants live in these three
      // fields and each would pass a looser test:
      //
      //   - drop `{ scope: 'site' }` → the field is OMITTED (the SDK sends it only
      //     when set) and the host resolves the path under THIS APP's own route,
      //     shallowly. Nothing errors, no message is missing, and the viewer stays
      //     in the app looking at a URL the route does not serve. That is the
      //     pre-#5250 behaviour returning silently, and an exact-object compare is
      //     the only thing that sees it.
      //   - drop the `?modelVersionId=` suffix → the link lands on the model's
      //     DEFAULT version, which is the wrong one for a benchmark citing an exact
      //     checkpoint build.
      //   - read the wrong id → caught because 500 / 1001 / 900 / 2002 are pairwise
      //     distinct.
      //
      // `target: 'current'` is asserted because it is the operator's decision, not a
      // default we are indifferent to: `'new_tab'` needs a sandbox token the host
      // strips from every block, and the host's own note records it as unmeasured
      // outside Chromium. A silent switch to it would be a dead control.
      await userEvent.click(byName('JuggernautXL'));
      expect(navigates(seen)).toEqual([
        { path: 'models/500?modelVersionId=1001', scope: 'site', target: 'current' },
      ]);

      // ---- THE LINKABLE LoRA ----
      // Its OWN ids, which is the seam assertion: the modal must pass `l.modelId`
      // and `l.versionId`, not the enclosing config's checkpoint.
      await userEvent.click(byName('Detail Tweaker'));
      expect(navigates(seen)).toEqual([
        { path: 'models/500?modelVersionId=1001', scope: 'site', target: 'current' },
        { path: 'models/900?modelVersionId=2002', scope: 'site', target: 'current' },
      ]);

      // ---- THE UN-LINKABLE LoRA ----
      // 🔴 PRESSED ANYWAY. "It is a span" is a structural claim; this is the
      // behavioural one, and it is the half that catches a `<span onClick>` — the
      // exact shape of the two mutants in the header above.
      await userEvent.click(byName('Old Tweaker'));
      expect(
        navigates(seen),
        'a resource with no modelId asked the host to navigate — to where?',
      ).toHaveLength(2);

      // 🔴 AND NOT ONE OF THE THREE PRESSES TOUCHED A SAME-FRAME CHANNEL. Compared as
      // a whole object rather than four `toHaveLength(0)` calls so a failure REPORTS
      // THE URL a handler reached for — "expected { href: ['https://civitai.com/…'] }
      // to equal {}" names the mutant; "expected 1 to be 0" does not.
      expect(
        rec,
        'a resource title navigated the IFRAME — the host message is the only legitimate channel',
      ).toEqual({ open: [], href: [], assign: [], replace: [] });
    } finally {
      // Restore BEFORE any assertion can throw past it — a leaked `window.location`
      // stand-in would corrupt every later case in this file.
      restore();
    }

    // 🔴 POSITIVE CONTROL ON THE MESSAGE OBSERVER TOO. The two `toEqual` assertions
    // above are positives and so cannot be satisfied by an observer wired to nothing
    // — but the `toHaveLength(2)` one is a bounded negative, so say out loud that this
    // stream carries traffic of its own (the handshake and RESIZE) and is being read.
    expect(seen.length, 'the outbound observer saw nothing at all').toBeGreaterThan(0);
  });

  it('🔴 a LoRA WITH a modelId and one WITHOUT render as DIFFERENT elements', async () => {
    // ⚠️ THIS CASE USED TO ASSERT THE EXACT OPPOSITE — "render identically", down to an
    // `outerHTML` comparison with the names substituted out. It is inverted rather than
    // deleted because it is the same question (does the DOM reveal `modelId`?) and the
    // answer moved: before #5250 a difference was the defect, now sameness is. The old
    // form would pass if `ResourceName` ignored `modelId` altogether, which is the
    // regression this now catches.
    mount([comboRow('mk1', 'Mixed Combo', [WITHOUT_MODEL_ID, WITH_MODEL_ID])]);
    const modal = await openMatchupDetail();

    const byName = (t: string) =>
      within(modal)
        .getAllByTestId('resource-name')
        .find((el) => el.textContent === t)!;
    const linked = byName('Detail Tweaker');
    const legacy = byName('Old Tweaker');

    expect(linked.tagName).toBe('BUTTON');
    expect(legacy.tagName).toBe('SPAN');
    // 🔴 THE SHARED TESTID IS DELIBERATE AND IS ASSERTED. Several suites enumerate
    // resource titles by it; a split into `resource-link`/`resource-name` would make
    // every one of those counts silently partial.
    expect(linked).toHaveAttribute('data-testid', 'resource-name');
    expect(legacy).toHaveAttribute('data-testid', 'resource-name');
  });

  it('shows no badges in the modal — the third IA pass removed every one', async () => {
    // ABSENCE FROM THE DOM, with the modal's own config list as the positive control
    // so an empty modal cannot satisfy the nulls.
    mount([comboRow('mk1', 'SDXL Combo', [WITH_MODEL_ID])]);
    const modal = await openMatchupDetail();

    expect(within(modal).getByTestId('matchup-detail-configs')).toBeInTheDocument();
    expect(within(modal).queryByTestId('matchup-included')).toBeNull();
    expect(within(modal).queryByTestId('matchup-config-count')).toBeNull();

    // 🔴 THE ECOSYSTEM PILLS CARRIED NO TESTID, so they are pinned STRUCTURALLY — by
    // the pack's own badge marker, which reaches EVERY badge in the modal whatever it
    // is named or spelled. A copy check would have been walkable and, worse, wrong:
    // "SDXL" is still rendered, in the per-config meta line, which is the point —
    // the information survived, the pill row did not.
    expect(modal.querySelectorAll("[data-civitai-ui='badge']")).toHaveLength(0);
    // …and the information IS still there, so the line above is about pills and not
    // about a modal that dropped the ecosystem entirely.
    expect(modal).toHaveTextContent('SDXL');
  });
});
