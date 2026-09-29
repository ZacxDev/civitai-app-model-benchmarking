// The MATCHUP DETAIL MODAL's resource titles, driven through the real App.
//
// ⚠ THIS FILE WAS `matchupModalLinks.test.tsx` AND ASSERTED THE OPPOSITE. It
// pinned a checkpoint link, a LoRA link, and two `NAVIGATE` payloads carrying
// `target: 'current'`. Renamed and inverted rather than deleted, because the
// SUBJECT did not change — "what does this modal do when a viewer presses a
// resource name" — only the answer did. The links were removed before release:
// all three routes out of a block's sandboxed iframe are shut, and the one that is
// permitted would land the viewer on civitai.com LOGGED OUT. `lib/resourceLink.ts`
// carries the measurement, including the live `sandbox="allow-scripts allow-forms"`
// reading that settled it.
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

  it('🔴 pressing every resource name sends NO host navigation', async () => {
    // The behavioural half. A `<span onClick>` carries no role and no tag a
    // structural check would catch, so the only thing that settles it is pressing
    // each one and watching the outbound stream.
    const { seen } = mount([comboRow('mk1', 'Mixed Combo', [WITHOUT_MODEL_ID, WITH_MODEL_ID])]);
    const modal = await openMatchupDetail();

    const titles = within(modal).getAllByTestId('resource-name');
    expect(titles.length, 'no resource titles rendered — the sweep below is vacuous').toBe(3);
    for (const el of titles) await userEvent.click(el);

    // 🔴 POSITIVE CONTROL ON THE OBSERVER. A zero from a `NAVIGATE` filter is
    // indistinguishable from an observer wired to nothing, so prove it saw traffic
    // first — the mock host reports the handshake and RESIZE regardless.
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
