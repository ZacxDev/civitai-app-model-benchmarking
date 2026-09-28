// The MATCHUP DETAIL MODAL's resource links, driven through the real App.
//
// 🔴 A BRAND-NEW FILE, SO NONE OF IT IS RED AT BASE. What it adds that
// `components/ResourceLink.test.tsx` cannot: that the MODAL actually wires the row's
// stored ids into the link. `ResourceLink`'s own tests prove the component behaves
// correctly when handed a `modelId`; they are structurally blind to a caller that
// hands it the WRONG one, or none at all — and "verified in isolation" is exactly how
// a seam nobody owns ships broken. The two fixtures here differ on the one field
// that decides it.
//
// 🔴 THE TWO ROWS ARE SEEDED AS WIRE BYTES, and the LoRA ids are deliberately
// DISTINCT from the checkpoint's. `CKPT` is model 500 / version 1001 and the linked
// LoRA is model 900 / version 2002, so a caller that passed the checkpoint's ids to
// the LoRA link — the likeliest wiring mistake — produces a wrong path this file can
// see. Fixtures sharing a value could not.
//
// ⚠ WHAT THIS CANNOT SETTLE: whether the navigation LANDS. See
// `lib/resourceLink.ts` — the only host that bridges `NAVIGATE` rewrites the path
// into the app's own sub-path space, measured against `civitai/civitai` at
// `f3ebfad2f3`. These cases pin what the app ASKS FOR.

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

/** A LoRA written AFTER `LoraRef.modelId` existed — linkable. */
const LINKED_LORA = {
  versionId: 2002,
  modelId: 900,
  weight: 0.8,
  modelName: 'Detail Tweaker',
  minStrength: 0,
  maxStrength: 1.5,
};

/**
 * A LoRA written BEFORE the field existed — permanently unlinkable.
 *
 * 🔴 NOT A MIGRATION WINDOW. A published row belongs to its author
 * (`shared.update`/`withdraw` are author-scoped), so this shape is on the live board
 * forever and its title will render as plain text for every viewer.
 */
const LEGACY_LORA = {
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

describe('the matchup detail modal links its resources', () => {
  it('links the CHECKPOINT title to its version-pinned model page, in the current frame', async () => {
    const { seen } = mount([comboRow('mk1', 'SDXL Combo', [LINKED_LORA])]);
    const modal = await openMatchupDetail();

    const links = within(modal).getAllByTestId('resource-link');
    const ckpt = links.find((l) => l.textContent === 'JuggernautXL')!;
    expect(ckpt).toHaveAccessibleName('Open JuggernautXL on Civitai');

    await userEvent.click(ckpt);
    // POSITIVE CONTROL on the observer — the mock host reports the handshake too, so
    // a zero here would be an observer wired to nothing rather than a missing message.
    expect(seen.length, 'the outbound observer saw nothing at all').toBeGreaterThan(0);
    const navs = seen.filter((m) => m.type === 'NAVIGATE');
    expect(navs).toHaveLength(1);
    expect(navs[0]!.payload).toEqual({
      path: '/models/500?modelVersionId=1001',
      target: 'current',
    });
  });

  it('links a LoRA that HAS a modelId — to the LoRA’s own model, not the checkpoint’s', async () => {
    const { seen } = mount([comboRow('mk1', 'SDXL Combo', [LINKED_LORA])]);
    const modal = await openMatchupDetail();

    const lora = within(modal)
      .getAllByTestId('resource-link')
      .find((l) => l.textContent === 'Detail Tweaker')!;
    await userEvent.click(lora);

    const navs = seen.filter((m) => m.type === 'NAVIGATE');
    expect(navs).toHaveLength(1);
    // 🔴 THE IDS THAT MATTER. 900/2002 are the LoRA's; 500/1001 are the checkpoint's.
    // The likeliest wiring mistake in the modal is passing the config's checkpoint
    // ids to every link, and it would produce `/models/500?modelVersionId=1001` here.
    expect(navs[0]!.payload).toEqual({
      path: '/models/900?modelVersionId=2002',
      target: 'current',
    });
  });

  it('🔴 renders a LoRA with NO modelId as plain text — no link element, no underline', async () => {
    const { seen } = mount([comboRow('mk1', 'Legacy Combo', [LEGACY_LORA])]);
    const modal = await openMatchupDetail();

    // The LoRA's name is present and readable…
    expect(modal).toHaveTextContent('Old Tweaker');
    const plain = within(modal)
      .getAllByTestId('resource-plain')
      .find((s) => s.textContent === 'Old Tweaker')!;
    expect(plain.tagName).toBe('SPAN');
    expect(plain).toHaveStyle({ textDecoration: 'none' });

    // …and there is NO link for it. 🔴 POSITIVE CONTROL, IN BAND: the CHECKPOINT in
    // the same modal IS a link, so "no link named Old Tweaker" cannot be satisfied by
    // a modal that rendered no links at all — which is the failure this whole claim
    // would otherwise be blind to.
    const links = within(modal).getAllByTestId('resource-link');
    expect(links.map((l) => l.textContent)).toContain('JuggernautXL');
    expect(links.map((l) => l.textContent)).not.toContain('Old Tweaker');

    await userEvent.click(plain);
    expect(seen.filter((m) => m.type === 'NAVIGATE')).toHaveLength(0);
  });

  it('🔴 the mixed case: one linked and one legacy LoRA in the SAME stack', async () => {
    // The shape a real row grows into — a viewer edits an old matchup and adds a new
    // LoRA. Both states are visible side by side, which is precisely why the
    // underline has to distinguish them rather than being uniform.
    mount([comboRow('mk1', 'Mixed Combo', [LEGACY_LORA, LINKED_LORA])]);
    const modal = await openMatchupDetail();

    const linkTexts = within(modal)
      .getAllByTestId('resource-link')
      .map((l) => l.textContent);
    const plainTexts = within(modal)
      .getAllByTestId('resource-plain')
      .map((s) => s.textContent);

    expect(linkTexts).toContain('Detail Tweaker');
    expect(linkTexts).not.toContain('Old Tweaker');
    expect(plainTexts).toContain('Old Tweaker');
    expect(plainTexts).not.toContain('Detail Tweaker');
  });

  it('shows no badges in the modal — the third IA pass removed every one', async () => {
    // ABSENCE FROM THE DOM, with the modal's own config list as the positive control
    // so an empty modal cannot satisfy the nulls.
    mount([comboRow('mk1', 'SDXL Combo', [LINKED_LORA])]);
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
