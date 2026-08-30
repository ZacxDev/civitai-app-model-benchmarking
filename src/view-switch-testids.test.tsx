// Card 449 — every view-switch tab is addressable BY NAME, not by position.
//
// Why this file exists: the app-capture recipe in `talos-infra` used to select
// these tabs as `[data-testid='view-switch'] > button:nth-of-type(1|2|3)`. A
// positional selector re-points at the WRONG panel the moment a tab is reordered
// (matchups card D makes Grid the default) or added (card B adds "watched") — and
// a capture of the wrong view still exits 0, so nothing downstream notices.
//
// 🔴 WHAT THIS FILE PINS, AND WHY EACH PART IS HERE:
//
//   1. Each tab carries its own testid — the bare existence claim.
//   2. A LEDGER: the set of per-tab testids inside the strip is EXACTLY these
//      three, and there is one per tab. This is the half that survives the two
//      cards above: adding a fourth tab without giving it a testid FAILS here
//      rather than silently reintroducing the positional coupling, and so does
//      deleting one.
//   3. The NAME→VIEW mapping, asserted behaviourally by clicking the testid and
//      reading which panel mounts. A structural check alone is walkable by
//      putting the right names on the wrong tabs — which is precisely the defect
//      class ("the capture succeeds, of the wrong view") this card removes.
//
// The mapping is asserted against LITERAL expected values, never derived from the
// component's own `data` array, so the test cannot agree with a wrong
// implementation.
//
// ⚠ The strip's controls expose `role="tab"`, NOT `role="button"`.
// `getAllByRole('button')` fails here in a way that reads exactly like the app
// not rendering.

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Harness } from '@civitai/blocks-react/testing';

import { App } from './App.js';
import { CKPT_SDXL, fakeAppStorage, fakeShared, immediateSleep } from './test-helpers.js';

/**
 * The three tabs, as `[testid, the panel that must mount when it is clicked]`.
 * Literals on both sides — this table IS the contract the capture recipe buys.
 */
const TABS: ReadonlyArray<readonly [string, string]> = [
  ['view-switch-combos', 'combos-view'],
  ['view-switch-prompts', 'prompts-view'],
  ['view-switch-grid', 'grid-view'],
];

function renderApp() {
  const { shared } = fakeShared({ seed: [] });
  render(
    <Harness
      viewer={{ id: 99, username: 'me' }}
      theme="dark"
      consentGranted
      buzzBudget={1000}
      cannedPicks={{ Checkpoint: CKPT_SDXL }}
      shared={{ seed: [] }}
      showLog={false}
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
}

describe('449 criterion 1 — each view-switch tab has its own data-testid', () => {
  it('resolves all three testids, each inside a DISTINCT role="tab" of the strip', async () => {
    renderApp();
    const strip = await screen.findByTestId('view-switch');

    const owners = TABS.map(([testid]) => {
      const node = within(strip).getByTestId(testid);
      const tab = node.closest('[role="tab"]');
      expect(tab, `${testid} is not inside a role="tab"`).not.toBeNull();
      return tab as Element;
    });

    // Distinct owners: three names all stamped on the same tab would satisfy a
    // plain existence check and leave the coupling exactly where it was.
    expect(new Set(owners).size).toBe(3);
  });

  it('LEDGER: the strip carries exactly these testids, one per tab', async () => {
    renderApp();
    const strip = await screen.findByTestId('view-switch');

    // Fails when a tab is ADDED without a testid (card B) as well as when one is
    // removed or renamed — the set and the tab count are checked together.
    const found = Array.from(strip.querySelectorAll('[role="tab"] [data-testid]')).map((el) =>
      el.getAttribute('data-testid'),
    );
    expect(found.slice().sort()).toEqual(TABS.map(([t]) => t).slice().sort());
    expect(within(strip).getAllByRole('tab')).toHaveLength(TABS.length);
  });
});

describe('449 — the testid names the VIEW, not the position', () => {
  // Clicking each testid must open ITS panel. Order-independent by construction:
  // nothing here indexes the tab list.
  for (const [testid, panel] of TABS) {
    it(`clicking [data-testid='${testid}'] opens ${panel}`, async () => {
      renderApp();
      const strip = await screen.findByTestId('view-switch');

      await userEvent.click(within(strip).getByTestId(testid));

      expect(await screen.findByTestId(panel)).toBeInTheDocument();
      // …and only that one: a mapping that opens the right panel while leaving a
      // sibling mounted would still hand the capture two views in one frame.
      for (const [, other] of TABS) {
        if (other !== panel) expect(screen.queryByTestId(other)).toBeNull();
      }
      // The clicked tab is the selected one, so the testid also names the tab a
      // human sees highlighted — not merely the panel that happens to mount.
      const selected = within(strip)
        .getAllByRole('tab')
        .filter((t) => t.getAttribute('aria-selected') === 'true');
      expect(selected).toHaveLength(1);
      expect(within(selected[0]!).getByTestId(testid)).toBeInTheDocument();
    });
  }
});
