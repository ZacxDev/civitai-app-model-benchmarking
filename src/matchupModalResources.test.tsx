// The MATCHUP DETAIL MODAL's resource titles, driven through the real App.
//
// ⚠ THIS FILE WAS `matchupModalLinks.test.tsx` AND ASSERTED THE OPPOSITE. It
// pinned a checkpoint link, a LoRA link, and two `NAVIGATE` payloads carrying
// `target: 'current'`. Renamed and inverted rather than deleted, because the
// SUBJECT did not change — "what does this modal do when a viewer presses a
// resource name" — only the answer did. The links were removed before release:
// all three routes out of a block's sandboxed iframe are shut, and the one that is
// permitted would land the viewer on civitai.com LOGGED OUT.
// `components/ResourceName.tsx`'s header carries the measurement, including the live
// `sandbox="allow-scripts allow-forms"` reading that settled it. (It used to say
// `lib/resourceLink.ts`; that module is deleted and the record moved rather than went.)
//
// 🔴 WHAT THIS FILE COVERS THAT `components/ResourceName.test.tsx` CANNOT: the
// SEAM. `ResourceName` is trivially correct in isolation — it is one `<span>` —
// and its own tests are structurally blind to a MODAL that renders a title some
// other way, or that keeps a stray handler on an ancestor. The cases below open the
// real modal, enumerate every title in it, press each one, and watch the outbound
// message stream. "Verified in isolation" is exactly how a dead affordance would
// survive here.
//
// 🔴 THE TWO FIXTURES STILL DIFFER ON `modelId`, and that is deliberate even though
// nothing renders it now: a LoRA WITH the field and a LoRA WITHOUT it must be
// INDISTINGUISHABLE in the DOM. A modal that still branched on it — the state this
// change removed — shows up as a difference between them.

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

/** A LoRA written AFTER `LoraRef.modelId` existed. Still not rendered as a link. */
const WITH_MODEL_ID = {
  versionId: 2002,
  modelId: 900,
  weight: 0.8,
  modelName: 'Detail Tweaker',
  minStrength: 0,
  maxStrength: 1.5,
};

/** A LoRA written BEFORE the field existed — permanently without it. */
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

// ---------------------------------------------------------------------------
// NAVIGATION INTERCEPTION — every channel this jsdom lets a test observe.
//
// 🔴 WHY THIS EXISTS, AND IT IS A GAP THAT WAS FOUND BY MUTATION, NOT BY REVIEW.
// The first version of the behavioural case below asserted only that no `NAVIGATE`
// message was emitted. That pins a MECHANISM, not a STATE — and two isolated
// mutants walked straight past it. Each added ONLY an `onClick` to `ResourceName`,
// keeping the `<span>`, keeping `textDecoration: 'none'`, touching nothing else:
//
//     onClick={() => window.open('https://civitai.com/models/1', '_blank')}
//     onClick={() => { window.location.href = 'https://civitai.com/models/1' }}
//
// Both SURVIVED a full green suite (781 passed, rc 0): tag is `SPAN`, no `role`, no
// `<a>` in the subtree, and neither emits a host message — while the element is
// fully interactive and does exactly the broken thing the component exists to
// prevent.
//
// 🔴 THE SECOND MUTANT IS THE SERIOUS ONE. Same-frame navigation needs NO sandbox
// token at all — `allow-top-navigation` governs the TOP context, not the frame's
// own — so `window.location.href = …` genuinely executes in production and replaces
// the running block with civitai.com INSIDE the app frame, at an opaque origin,
// logged out. A live, visible, broken state.
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
//     throw, `href` unchanged). The subtree sweep in the case above catches an
//     anchor that is RENDERED; one created in a handler is invisible.
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

describe('the matchup detail modal renders its resources as plain text', () => {
  it('🔴 shows every resource name, and NONE of them is interactive', async () => {
    mount([comboRow('mk1', 'Mixed Combo', [WITHOUT_MODEL_ID, WITH_MODEL_ID])]);
    const modal = await openMatchupDetail();

    // The names are all THERE — this is the positive control for every null
    // below. A modal that rendered no resources at all would otherwise satisfy
    // "nothing is a link" perfectly.
    const names = within(modal)
      .getAllByTestId('resource-name')
      .map((el) => el.textContent);
    expect(names).toContain('JuggernautXL');
    expect(names).toContain('Detail Tweaker');
    expect(names).toContain('Old Tweaker');

    // …and NOT ONE of them is a control, on three independent readings.
    for (const el of within(modal).getAllByTestId('resource-name')) {
      expect(el.tagName).toBe('SPAN');
      expect(el).toHaveStyle({ textDecoration: 'none' });
      expect(el).not.toHaveAttribute('role');
    }
    // 🔴 AND THE MODAL HOLDS NO LINK AT ALL — a whole-subtree sweep, not a
    // per-name check, because the affordance could be reintroduced on a WRAPPER
    // rather than on the name itself and every assertion above would stay green.
    expect(modal.querySelectorAll('a')).toHaveLength(0);
    expect(within(modal).queryAllByRole('link')).toHaveLength(0);
  });

  it('🔴 pressing every resource name navigates NOWHERE, by ANY channel', async () => {
    // The behavioural half, and the one that has to pin a STATE rather than a
    // mechanism: a `<span onClick>` carries no role and no tag a structural check
    // can see, so the only thing that settles it is pressing each title and
    // watching every channel a handler could reach for. See the header above for
    // which channels those are, which two mutants proved the earlier
    // NAVIGATE-only version blind to, and what is still not covered.
    const { seen } = mount([comboRow('mk1', 'Mixed Combo', [WITHOUT_MODEL_ID, WITH_MODEL_ID])]);
    const modal = await openMatchupDetail();

    const titles = within(modal).getAllByTestId('resource-name');
    expect(titles.length, 'no resource titles rendered — the sweep below is vacuous').toBe(3);

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
        { open: rec.open.length, href: rec.href.length, assign: rec.assign.length, replace: rec.replace.length },
        'a navigation channel could not be observed — the zeros below would be meaningless',
      ).toEqual({ open: 1, href: 2, assign: 1, replace: 1 });

      // Instrument proven; zero it and run the real sweep.
      rec.open.length = 0;
      rec.href.length = 0;
      rec.assign.length = 0;
      rec.replace.length = 0;

      for (const el of titles) await userEvent.click(el);

      // 🔴 THE WHOLE RECORDER, IN ONE ASSERTION. Compared as an object rather than
      // four separate `toHaveLength(0)` calls so a failure REPORTS THE URL a
      // handler reached for — "expected { href: ['https://civitai.com/models/1'] }
      // to equal {}" names the mutant; "expected 1 to be 0" does not.
      expect(rec, 'a resource title navigated — nothing may advertise an action it cannot perform').toEqual(
        { open: [], href: [], assign: [], replace: [] },
      );
    } finally {
      // Restore BEFORE any assertion can throw past it — a leaked `window.location`
      // stand-in would corrupt every later case in this file.
      restore();
    }

    // …and the host message channel, which is a separate claim from the three
    // above: `useCivitaiNavigate` does not touch `window.location` at all, it posts
    // a message. 🔴 POSITIVE CONTROL ON THIS OBSERVER TOO — the mock host reports
    // the handshake and RESIZE regardless, so a zero from the filter alone could
    // equally mean an observer wired to nothing.
    expect(seen.length, 'the outbound observer saw nothing at all').toBeGreaterThan(0);
    expect(seen.filter((m) => m.type === 'NAVIGATE')).toHaveLength(0);
  });

  it('🔴 a LoRA WITH a modelId and one WITHOUT render identically', async () => {
    // The state this change removed. `modelId` is still stored and round-tripped —
    // `renameWireCompat.test.ts` covers both directions — so the field is present
    // on one of these two and absent on the other, and the DOM must not care.
    mount([comboRow('mk1', 'Mixed Combo', [WITHOUT_MODEL_ID, WITH_MODEL_ID])]);
    const modal = await openMatchupDetail();

    const byName = (t: string) =>
      within(modal)
        .getAllByTestId('resource-name')
        .find((el) => el.textContent === t)!;
    const linked = byName('Detail Tweaker');
    const legacy = byName('Old Tweaker');

    expect(linked.tagName).toBe(legacy.tagName);
    expect(linked.getAttribute('style')).toBe(legacy.getAttribute('style'));
    expect(linked.outerHTML.replace('Detail Tweaker', 'X')).toBe(
      legacy.outerHTML.replace('Old Tweaker', 'X'),
    );
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
