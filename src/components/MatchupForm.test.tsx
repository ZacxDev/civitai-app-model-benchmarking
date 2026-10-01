// MatchupForm: a matchup holds an ARRAY of MODELS (each a checkpoint + its LoRA
// stack). Add/remove model rows, per-model checkpoint + family-scoped LoRA picking,
// >=1-model validation, edit-mode prefill — and the modal rework: the derived model
// name, the gated "Add model", the trash icon, the adopted `ResourceCard`, and the
// two-step CREATE flow.
//
// 🔴 NOTE ON `multiStep`. It DEFAULTS TO FALSE, so every case that does not pass it
// is exercising the SINGLE-PAGE (edit) shape and can read the name input directly.
// The two-step shape is covered by its own paired case at the bottom. That default
// is not a convenience for the tests — `App.tsx` sets the prop explicitly from the
// modal kind, and an edit really is single-page.

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { BlockResourceInfo, BlockResourcePickerType } from '@civitai/app-sdk/blocks';

import { MatchupForm } from './MatchupForm.js';
import type { CombinationInput } from '../lib/benchmark.js';
import { MIN_TAP_TARGET_PX } from '../compact.js';
import { CKPT_SDXL, LORA_SDXL } from '../test-helpers.js';

/** A picker that returns a Checkpoint / LORA by requested type, recording family scope. */
function fakePicker() {
  const calls: Array<{ resourceType: BlockResourcePickerType; baseModelGroup?: string }> = [];
  const pickResource = async (opts: { resourceType: BlockResourcePickerType; baseModelGroup?: string }) => {
    calls.push(opts);
    const map: Partial<Record<BlockResourcePickerType, BlockResourceInfo>> = {
      Checkpoint: CKPT_SDXL,
      LORA: LORA_SDXL,
    };
    return map[opts.resourceType] ?? null;
  };
  return { pickResource, calls };
}

describe('MatchupForm multi-model builder', () => {
  it('starts with one model and adds/removes model rows', async () => {
    const { pickResource } = fakePicker();
    render(<MatchupForm pickResource={pickResource} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getAllByTestId('config-card')).toHaveLength(1);
    // A single model shows no remove affordance.
    expect(screen.queryByTestId('remove-config')).toBeNull();

    // "Add model" is gated on the first model having a checkpoint — see its own
    // paired case below — so this one has to pick one before it can add.
    await userEvent.click(screen.getByTestId('pick-checkpoint'));
    await waitFor(() => expect(screen.getByTestId('add-config')).toBeInTheDocument());

    await userEvent.click(screen.getByTestId('add-config'));
    expect(screen.getAllByTestId('config-card')).toHaveLength(2);
    // Now each model can be removed.
    await userEvent.click(screen.getAllByTestId('remove-config')[0]!);
    expect(screen.getAllByTestId('config-card')).toHaveLength(1);
  });

  it('scopes the LoRA picker to the model checkpoint family', async () => {
    const { pickResource, calls } = fakePicker();
    render(<MatchupForm pickResource={pickResource} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    const card = screen.getByTestId('config-card');
    await userEvent.click(within(card).getByTestId('pick-checkpoint'));
    await waitFor(() => expect(within(card).getByTestId('checkpoint-card')).toHaveTextContent('JuggernautXL'));
    await userEvent.click(within(card).getByTestId('add-lora'));
    await waitFor(() => expect(within(card).getByTestId('lora-row')).toBeInTheDocument());
    // The LORA pick carried the checkpoint's family group (SDXL).
    const loraCall = calls.find((c) => c.resourceType === 'LORA');
    expect(loraCall?.baseModelGroup).toBe('SDXL');
  });

  it('requires a name and at least one model with a checkpoint', async () => {
    const onSubmit = vi.fn<(input: CombinationInput) => Promise<void>>();
    const { pickResource } = fakePicker();
    render(<MatchupForm pickResource={pickResource} onSubmit={onSubmit} onCancel={vi.fn()} />);
    await userEvent.click(screen.getByTestId('matchup-submit'));
    expect(onSubmit).not.toHaveBeenCalled();
    const errs = screen.getByTestId('matchup-errors');
    expect(errs).toHaveTextContent('Give the matchup a name.');
    expect(errs).toHaveTextContent('Add at least one model (pick a checkpoint).');
    // 🔴 AND THE ALERT A VIEWER READS SAYS NO WIRE WORD. This assertion is the whole
    // reason the copy moved: the heading, add button, remove label and per-row name
    // all said "model" while the error said "model config", and the earlier version
    // of this very line PINNED the wire word in place.
    expect(errs.textContent, 'the error Alert leaked the internal noun').not.toMatch(/config/i);
  });

  it('submits a TWO-model matchup', async () => {
    const onSubmit = vi.fn<(input: CombinationInput) => Promise<void>>();
    const { pickResource } = fakePicker();
    render(<MatchupForm pickResource={pickResource} onSubmit={onSubmit} onCancel={vi.fn()} />);
    await userEvent.type(screen.getByTestId('matchup-name'), 'Realism showdown');
    // model 1 checkpoint
    await userEvent.click(screen.getAllByTestId('pick-checkpoint')[0]!);
    await waitFor(() => expect(screen.getAllByTestId('checkpoint-card')).toHaveLength(1));
    // add a second model + pick its checkpoint
    await userEvent.click(screen.getByTestId('add-config'));
    await userEvent.click(screen.getAllByTestId('pick-checkpoint')[1]!);
    await waitFor(() => expect(screen.getAllByTestId('checkpoint-card')).toHaveLength(2));
    await userEvent.click(screen.getByTestId('matchup-submit'));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const input = onSubmit.mock.calls[0]![0] as CombinationInput;
    expect(input.name).toBe('Realism showdown');
    expect(input.configs).toHaveLength(2);
    expect(input.configs.every((cfg) => cfg.checkpoint?.versionId === 1001)).toBe(true);
    // 🔴 NO LABEL IS WRITTEN ANY MORE. There is no input to type one into, so a new
    // model's `label` is undefined and the name is derived at render time. This is
    // the half that keeps `modelConfigLabel`'s author-label branch meaningful: if a
    // create started stamping a generated label INTO the payload, the stored row
    // would become indistinguishable from an author-written one and the "show the
    // author's label" rule would have nothing left to protect.
    expect(input.configs.every((cfg) => cfg.label === undefined)).toBe(true);
  });
});

describe('MatchupForm edit mode', () => {
  it('prefills from an initial input (multiple models) and uses the given submit label', () => {
    const initial: CombinationInput = {
      name: 'Existing combo',
      description: 'd',
      configs: [
        { id: 'a', label: 'base', checkpoint: { versionId: 1001, modelId: 500, baseModel: 'SDXL 1.0', modelName: 'JuggernautXL' }, loras: [] },
        { id: 'b', label: 'pony', checkpoint: { versionId: 1101, modelId: 600, baseModel: 'Pony', modelName: 'AutismMix' }, loras: [] },
      ],
    };
    render(<MatchupForm pickResource={vi.fn()} onSubmit={vi.fn()} onCancel={vi.fn()} initial={initial} submitLabel="Save changes" />);
    expect((screen.getByTestId('matchup-name') as HTMLInputElement).value).toBe('Existing combo');
    expect(screen.getAllByTestId('config-card')).toHaveLength(2);
    expect(screen.getByTestId('matchup-submit')).toHaveTextContent('Save changes');
  });

  it('🔴 puts the NAME above the model list, as it always has', () => {
    // 🔴 THIS WAS AN UNDISCLOSED REGRESSION FOR ONE ROUND, AND NOTHING SAW IT.
    // Introducing the step wrappers put `ContentStep` first in the markup, which is
    // invisible on the paged CREATE path (only one step renders) and silently moved
    // the name input to the BOTTOM of all six single-page EDIT surfaces — an author
    // opening "Edit matchup" to fix a typo got the whole model list first. No
    // assertion in the repo pinned field order, so the gate could not see it. The
    // operator asked only that an edit stay single-page, not that its fields move.
    //
    // DOCUMENT ORDER, not geometry: jsdom performs no layout, so this pins the only
    // thing that is verifiable here — and it is what the visual order follows in an
    // unpositioned column.
    const initial: CombinationInput = {
      name: 'Existing combo',
      description: 'd',
      configs: [
        {
          id: 'a',
          checkpoint: { versionId: 1001, modelId: 500, baseModel: 'SDXL 1.0', modelName: 'JuggernautXL' },
          loras: [],
        },
      ],
    };
    render(<MatchupForm pickResource={vi.fn()} onSubmit={vi.fn()} onCancel={vi.fn()} initial={initial} />);

    const nameInput = screen.getByTestId('matchup-name');
    const card = screen.getByTestId('config-card');
    expect(
      nameInput.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING,
      'the name input is BELOW the model list on the single-page edit form',
    ).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 🔴 THE PER-MODEL NAME — AND THE ONE REGRESSION THE OPERATOR NAMED BY HAND.
//
// The label INPUT is gone; the name is derived. `ModelConfig.label` is nevertheless
// still stored, on rows published before the input went away AND on other authors'
// rows this app can never rewrite — so a derivation that ran UNCONDITIONALLY would
// silently stop displaying text people wrote.
//
// 🔴 BOTH DIRECTIONS IN ONE CASE, DELIBERATELY. "An absent label generates" alone
// passes against an implementation that ignores stored labels — the exact
// regression. "An authored label shows" alone passes against the OLD code, which
// derived nothing. The fixture's two models are built so neither string is a
// substring of the other, so neither assertion can be satisfied for the other's
// reason.
// ---------------------------------------------------------------------------

describe("🔴 the per-model heading: the author's label, else derived", () => {
  const CKPT = { versionId: 1001, modelId: 500, baseModel: 'SDXL 1.0', modelName: 'JuggernautXL' };
  const LORA = { versionId: 2002, weight: 0.8, modelName: 'Detail Tweaker' };

  it('🔴 shows a stored author label AND derives one when there is none', () => {
    const initial: CombinationInput = {
      name: 'Existing',
      description: '',
      configs: [
        { id: 'a', label: 'the author wrote this', checkpoint: CKPT, loras: [LORA] },
        { id: 'b', checkpoint: CKPT, loras: [LORA] },
      ],
    };
    render(
      <MatchupForm pickResource={vi.fn()} onSubmit={vi.fn()} onCancel={vi.fn()} initial={initial} />,
    );

    const headings = screen.getAllByTestId('config-heading');
    // POSITIVE CONTROL: both models rendered, so neither claim below is about an
    // element that is simply missing.
    expect(headings).toHaveLength(2);
    expect(headings[0]!.textContent).toBe('the author wrote this');
    expect(headings[1]!.textContent).toBe('JuggernautXL + Detail Tweaker');
  });

  it('🔴 offers NO input for the label on any model, authored or not', () => {
    const initial: CombinationInput = {
      name: 'Existing',
      description: '',
      configs: [{ id: 'a', label: 'the author wrote this', checkpoint: CKPT, loras: [] }],
    };
    render(
      <MatchupForm pickResource={vi.fn()} onSubmit={vi.fn()} onCancel={vi.fn()} initial={initial} />,
    );

    // POSITIVE CONTROL on the surface: the form's OTHER text inputs are still there,
    // so this is an absent label field rather than an unmounted form.
    expect(screen.getByTestId('matchup-name')).toBeInTheDocument();
    expect(screen.queryByTestId('config-label')).toBeNull();
    // 🔴 AND STRUCTURALLY, not just by testid — the field could be reintroduced
    // under a different id. The authored label is rendered as TEXT, so no input in
    // the form may hold it as a value.
    const values = screen
      .getAllByRole('textbox')
      .map((el) => (el as HTMLInputElement | HTMLTextAreaElement).value);
    expect(values).not.toContain('the author wrote this');
    expect(screen.getByTestId('config-heading').textContent).toBe('the author wrote this');
  });
});

// ---------------------------------------------------------------------------
// 🔴 "ADD MODEL": BELOW THE LIST, AND GATED ON THE FIRST MODEL'S CHECKPOINT.
//
// Paired in ONE case because a one-sided version is vacuous in either direction: a
// lone "it is hidden" passes against a button that was deleted, and a lone "it is
// shown" passes against the old always-visible one.
// ---------------------------------------------------------------------------

describe('🔴 the "Add model" control', () => {
  it('🔴 is HIDDEN until the first model has a checkpoint, and SHOWN once it does', async () => {
    const { pickResource } = fakePicker();
    render(<MatchupForm pickResource={pickResource} onSubmit={vi.fn()} onCancel={vi.fn()} />);

    // POSITIVE CONTROL: the model list IS mounted, so the null below is a gated
    // button and not an unrendered form.
    expect(screen.getAllByTestId('config-card')).toHaveLength(1);
    expect(screen.queryByTestId('add-config'), 'offered before any checkpoint was picked').toBeNull();

    await userEvent.click(screen.getByTestId('pick-checkpoint'));

    const add = await screen.findByTestId('add-config');
    expect(add).toHaveTextContent('Add model');
  });

  it('🔴 sits AFTER the model list in document order', async () => {
    // jsdom performs no layout, so "below" cannot be read as a coordinate. DOCUMENT
    // ORDER is the part that is actually verifiable here, and it is what the visual
    // order follows for an unpositioned column. The rendered position is NOT
    // verified by this suite.
    const { pickResource } = fakePicker();
    render(<MatchupForm pickResource={pickResource} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    await userEvent.click(screen.getByTestId('pick-checkpoint'));
    const add = await screen.findByTestId('add-config');
    const card = screen.getByTestId('config-card');

    // Node.DOCUMENT_POSITION_FOLLOWING === 4
    //
    // 🔴 THE MESSAGE IS NOT DECORATION. A bitmask assertion fails as "expected +0 to
    // be truthy", which names neither the control nor the claim — measured, from the
    // mutant that moves the button back above the list.
    expect(
      card.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING,
      'the "Add model" button is not AFTER the model list in document order',
    ).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 🔴 THE REMOVE CONTROL IS AN ICON, AND AN ICON-ONLY CONTROL WITH NO ACCESSIBLE
// NAME IS A REGRESSION THIS REPO HAS PAID FOR BEFORE.
// ---------------------------------------------------------------------------

describe('🔴 the remove-model control', () => {
  const CKPT = { versionId: 1001, modelId: 500, baseModel: 'SDXL 1.0', modelName: 'JuggernautXL' };

  function renderTwo() {
    const initial: CombinationInput = {
      name: 'Existing',
      description: '',
      configs: [
        { id: 'a', label: 'first model', checkpoint: CKPT, loras: [] },
        { id: 'b', label: 'second model', checkpoint: CKPT, loras: [] },
      ],
    };
    render(
      <MatchupForm pickResource={vi.fn()} onSubmit={vi.fn()} onCancel={vi.fn()} initial={initial} />,
    );
  }

  it('🔴 carries NO visible text, and an accessible name that NAMES THE MODEL', () => {
    renderTwo();
    const buttons = screen.getAllByTestId('remove-config');
    expect(buttons).toHaveLength(2);

    for (const b of buttons) {
      // Icon-only: the glyph is an aria-hidden <svg>, so there is no text content.
      expect(b.textContent).toBe('');
      expect(b.querySelector('svg')).not.toBeNull();
      expect(b.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    }

    // 🔴 THE NAME IS PER-MODEL, NOT A SHARED "Remove". A matchup may hold up to 100
    // of these; a hundred identically-named buttons is a list nobody can navigate.
    // Asserted as the WHOLE string, so a reword to a generic label fails here.
    expect(buttons[0]!.getAttribute('aria-label')).toBe('Remove first model');
    expect(buttons[1]!.getAttribute('aria-label')).toBe('Remove second model');

    // …and the accessible name is reachable by role+name, which is what actually
    // proves the attribute is doing its job rather than merely being present.
    expect(screen.getByRole('button', { name: 'Remove second model' })).toBe(buttons[1]);
  });

  it('declares the 44px tap-target floor', () => {
    // 🔴 DECLARED VALUES ONLY. jsdom performs no layout, so the RENDERED size is not
    // verified anywhere in this repo — this pins that the floor is stated, and that
    // it is the repo's one 44 rather than a second literal.
    renderTwo();
    const b = screen.getAllByTestId('remove-config')[0]!;
    expect(b.style.minWidth).toBe(`${MIN_TAP_TARGET_PX}px`);
    expect(b.style.minHeight).toBe(`${MIN_TAP_TARGET_PX}px`);
  });

  it('still removes the model it names', async () => {
    renderTwo();
    await userEvent.click(screen.getByRole('button', { name: 'Remove first model' }));
    const headings = screen.getAllByTestId('config-heading');
    expect(headings).toHaveLength(1);
    expect(headings[0]!.textContent).toBe('second model');
  });
});

// ---------------------------------------------------------------------------
// 🔴 THE ADOPTED UPSTREAM `ResourceCard`.
//
// What matters here is NOT that a card renders — it is that the STATIC arm was
// taken. Passing `interactive` would reintroduce a focus stop and a control that
// advertises a navigation this block cannot perform, which is the whole argument
// `components/ResourceName.tsx` records (filed as `civitai/civitai` #5209). A
// structural check is what catches that, because `interactive` is a prop nobody
// looks at and the visual result is nearly identical.
// ---------------------------------------------------------------------------

describe('🔴 selected resources render through the upstream ResourceCard', () => {
  async function renderWithLora() {
    const { pickResource } = fakePicker();
    render(<MatchupForm pickResource={pickResource} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    await userEvent.click(screen.getByTestId('pick-checkpoint'));
    await waitFor(() => expect(screen.getByTestId('checkpoint-card')).toBeInTheDocument());
    await userEvent.click(screen.getByTestId('add-lora'));
    await waitFor(() => expect(screen.getByTestId('lora-row')).toBeInTheDocument());
  }

  it("🔴 uses upstream's card, naming both resources, and keeps the ecosystem line", async () => {
    await renderWithLora();

    // The pack's own root marker — this is what proves the UPSTREAM component is
    // mounted rather than a local look-alike that happens to carry the same testid.
    const ckpt = screen.getByTestId('checkpoint-card');
    const lora = screen.getByTestId('lora-row');
    expect(ckpt).toHaveAttribute('data-civitai-ui', 'resource-card');
    expect(lora).toHaveAttribute('data-civitai-ui', 'resource-card');
    // `variant="row"`, never `card` — `BlockResourceInfo` carries no image field, so
    // the `card` shape would render "No preview" on every tile.
    expect(ckpt).toHaveAttribute('data-variant', 'row');
    expect(lora).toHaveAttribute('data-variant', 'row');

    // The names come through upstream's frozen `resourceDisplayName`.
    expect(ckpt).toHaveTextContent('JuggernautXL');
    expect(lora).toHaveTextContent(LORA_SDXL.modelName);
    // The type pill distinguishes them, which is the thing upstream froze.
    expect(screen.getByTestId('checkpoint-card-type')).toHaveTextContent('Checkpoint');
    expect(screen.getByTestId('lora-row-type')).toHaveTextContent('LoRA');

    // 🔴 THE ECOSYSTEM ARROW SURVIVED THE ADOPTION. It has no slot in the frozen
    // meta line, so it is a sibling — and it is this app's own derivation, which is
    // exactly the information a viewer cannot get from the resource itself.
    expect(screen.getByTestId('checkpoint-ecosystem')).toHaveTextContent('SDXL 1.0');
    expect(screen.getByTestId('checkpoint-ecosystem')).toHaveTextContent('SDXL');
  });

  it('🔴 takes the STATIC arm: the cards are not controls and not tab stops', async () => {
    await renderWithLora();

    for (const id of ['checkpoint-card', 'lora-row']) {
      const hit = screen.getByTestId(`${id}-hit`);
      // The static arm renders a plain <div>; the interactive arm renders a <button>.
      expect(hit.tagName, `${id} became a control`).toBe('DIV');
      expect(hit).not.toHaveAttribute('role');
      expect(hit).not.toHaveAttribute('tabindex');
      expect(hit).not.toHaveAttribute('aria-pressed');
      expect(screen.getByTestId(id)).not.toHaveAttribute('data-interactive');
    }

    // 🔴 AND NO NAVIGATION AFFORDANCE ANYWHERE IN EITHER CARD — a whole-subtree
    // sweep, because the hazard could be reintroduced on a wrapper. This is the
    // no-navigation posture `ResourceName.tsx` records.
    for (const id of ['checkpoint-card', 'lora-row']) {
      const card = screen.getByTestId(id);
      expect(card.querySelectorAll('a')).toHaveLength(0);
      expect(within(card).queryAllByRole('link')).toHaveLength(0);
    }
  });

  it('🔴 names a WHITESPACE-named LoRA by its id — on the card AND in both accessible names', async () => {
    // 🔴 THIS GUARD WAS MISSING, AND THE AUDIT MEASURED THE COST. Reverting EITHER
    // aria-label to its hand-rolled `modelName ?? …` form left the suite fully green
    // — 64 files / 920 tests, rc 0 — so the fix that routed both through upstream's
    // `resourceDisplayName` shipped with nothing watching it.
    //
    // 🔴 A WHITESPACE-ONLY NAME IS THE CASE THAT SEPARATES THE TWO, which is why the
    // fixture is `'   '` and not `undefined`. `modelName ?? x` only fires on
    // null/undefined, so it KEEPS the blank string: the card would read `#2002`
    // (upstream trims, then falls back) while the button announced "Remove" and the
    // slider "Weight for" — an accessible name that does not match what is on
    // screen, which is WCAG 2.5.3's whole subject.
    //
    // ⚠️ AND THE REASON GIVEN HERE FOR *NOT* USING `undefined` WAS WRONG. It said an
    // `undefined` fixture "would pass against BOTH implementations and prove nothing".
    // Measured: it passes against the Remove revert but FAILS against the slider
    // revert, because the slider's old fallback had no `#` (see the production
    // comment) — so `undefined` yields `2002` there against the card's `#2002`. The
    // FIXTURE CHOICE still stands and is the stronger one: `'   '` kills BOTH reverts,
    // whereas `undefined` only kills one and only by accident of that missing `#`,
    // which a future edit could add back. Pin the case that does not depend on it.
    const blank: BlockResourceInfo = { ...LORA_SDXL, modelName: '   ' };
    const pickResource = async (opts: { resourceType: BlockResourcePickerType }) =>
      opts.resourceType === 'Checkpoint' ? CKPT_SDXL : blank;
    render(<MatchupForm pickResource={pickResource} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    await userEvent.click(screen.getByTestId('pick-checkpoint'));
    await waitFor(() => expect(screen.getByTestId('checkpoint-card')).toBeInTheDocument());
    await userEvent.click(screen.getByTestId('add-lora'));
    await waitFor(() => expect(screen.getByTestId('lora-row')).toBeInTheDocument());

    const expected = `#${blank.versionId}`;
    // The CARD, via upstream's frozen fallback. `queryByTestId` + a named null check
    // first, so a vanished name span reports THAT rather than throwing inside
    // `expect(...)` during argument evaluation and skipping the two claims below.
    const nameEl = screen.queryByTestId('lora-row-name');
    expect(nameEl, 'the card rendered no name element at all').not.toBeNull();
    expect(nameEl!.textContent).toBe(expected);
    // …and BOTH accessible names AGREE WITH IT. Read by role+name, so the assertion
    // fails if the label drifts from the visible text in either direction.
    expect(
      screen.queryByRole('button', { name: `Remove ${expected}` }),
      'the Remove button no longer announces the name the card shows',
    ).not.toBeNull();
    expect(
      screen.queryByRole('slider', { name: `Weight for ${expected}` }),
      'the weight slider no longer announces the name the card shows',
    ).not.toBeNull();
  });

  it("🔴 keeps the weight slider and Remove reachable, in the card's actions slot", async () => {
    await renderWithLora();
    const lora = screen.getByTestId('lora-row');

    // 🔴 THE CONTROLS ARE IN `actions`, WHICH UPSTREAM RENDERS AS A SIBLING OF THE
    // HIT AREA — never inside it. A <button> nested in a <button> is reparented by
    // the parser, which is how a Remove control becomes keyboard-unreachable while
    // still looking right. Asserting the slot is what pins that.
    const actions = screen.getByTestId('lora-row-actions');
    expect(actions).not.toBeNull();
    const hit = screen.getByTestId('lora-row-hit');
    expect(hit.contains(actions), 'the controls were nested inside the card hit area').toBe(false);

    const remove = within(actions).getByRole('button', { name: `Remove ${LORA_SDXL.modelName}` });
    expect(actions).toContainElement(screen.getByTestId('lora-weight'));
    expect(within(actions).getByRole('slider')).toBeInTheDocument();

    // …and it still works.
    await userEvent.click(remove);
    expect(screen.queryByTestId('lora-row')).toBeNull();
    // POSITIVE CONTROL: the checkpoint card is untouched, so the null above is one
    // LoRA removed rather than the form unmounting.
    expect(screen.getByTestId('checkpoint-card')).toBeInTheDocument();
    void lora;
  });
});

// ---------------------------------------------------------------------------
// 🔴 THE TWO-STEP CREATE FLOW. Paired: step 2 exists for a NEW matchup and does
// NOT exist for an EDIT. A one-sided version would pass against a form that paged
// everything, or against one that paged nothing.
// ---------------------------------------------------------------------------

describe('🔴 the two-step CREATE flow', () => {
  it('🔴 pages a NEW matchup (models, then name) and pages an EDIT not at all', async () => {
    const { pickResource } = fakePicker();

    // ---- NEW: two steps ----
    const { unmount } = render(
      <MatchupForm pickResource={pickResource} onSubmit={vi.fn()} onCancel={vi.fn()} multiStep />,
    );
    // 🔴 THE NAMED MESSAGES ARE LOAD-BEARING HERE. A bare `.not.toBeNull()` fails as
    // "expected null not to be null", and this case makes ~20 such reads across two
    // shapes — measured against the mutant that ignores `multiStep` entirely, whose
    // report named nothing at all.
    expect(
      screen.queryByTestId('form-step-content'),
      'a NEW matchup did not open on step 1 — `multiStep` is not being honoured',
    ).not.toBeNull();
    expect(screen.queryByTestId('form-step-meta'), 'step 2 is mounted while on step 1').toBeNull();
    // Step 1 holds the models and NOT the name, and cannot submit — a matchup with
    // no name is exactly what `validateCombination` refuses, so offering Submit here
    // would offer a guaranteed failure.
    expect(screen.queryByTestId('config-card'), 'step 1 holds no model list').not.toBeNull();
    expect(screen.queryByTestId('matchup-name'), 'the name input leaked onto step 1').toBeNull();
    expect(
      screen.queryByTestId('matchup-submit'),
      'step 1 offers Submit — it would submit a nameless matchup',
    ).toBeNull();
    expect(screen.queryByTestId('form-next'), 'step 1 offers no way forward').not.toBeNull();
    expect(screen.queryByTestId('form-back'), 'step 1 offers Back to nowhere').toBeNull();

    await userEvent.click(screen.getByTestId('form-next'));

    // Step 2 holds the name + description and NOT the models.
    expect(screen.queryByTestId('form-step-meta'), 'Next did not reach step 2').not.toBeNull();
    expect(screen.queryByTestId('form-step-content'), 'step 1 is still mounted on step 2').toBeNull();
    expect(screen.queryByTestId('matchup-name'), 'step 2 holds no name input').not.toBeNull();
    expect(
      screen.queryByTestId('matchup-description'),
      'step 2 holds no description input',
    ).not.toBeNull();
    expect(screen.queryByTestId('config-card'), 'the model list leaked onto step 2').toBeNull();
    expect(screen.queryByTestId('matchup-submit'), 'step 2 offers no Submit').not.toBeNull();
    expect(screen.queryByTestId('form-back'), 'step 2 offers no way back').not.toBeNull();
    expect(screen.queryByTestId('form-next'), 'step 2 still offers Next').toBeNull();

    // Back returns to the models with what step 1 collected still there.
    await userEvent.click(screen.getByTestId('form-back'));
    expect(screen.queryByTestId('form-step-content'), 'Back did not return to step 1').not.toBeNull();
    unmount();

    // ---- EDIT: one page, and NO step machinery at all ----
    const initial: CombinationInput = {
      name: 'Existing',
      description: '',
      configs: [
        {
          id: 'a',
          checkpoint: { versionId: 1001, modelId: 500, baseModel: 'SDXL 1.0', modelName: 'JuggernautXL' },
          loras: [],
        },
      ],
    };
    render(
      <MatchupForm
        pickResource={pickResource}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        initial={initial}
        submitLabel="Save changes"
      />,
    );
    expect(screen.queryByTestId('form-step-content'), 'an EDIT was wrapped in step 1').toBeNull();
    expect(screen.queryByTestId('form-step-meta'), 'an EDIT was wrapped in step 2').toBeNull();
    expect(screen.queryByTestId('form-next'), 'an EDIT offers Next — it was paged').toBeNull();
    expect(screen.queryByTestId('form-back'), 'an EDIT offers Back — it was paged').toBeNull();
    // 🔴 BOTH SECTIONS ON ONE PAGE — the load-bearing half. Without this, "no step
    // wrappers" would be satisfied by a form that rendered neither section.
    expect(screen.queryByTestId('config-card'), 'the EDIT page holds no model list').not.toBeNull();
    expect(screen.queryByTestId('matchup-name'), 'the EDIT page holds no name input').not.toBeNull();
    expect(screen.queryByTestId('matchup-submit'), 'the EDIT page holds no Submit').not.toBeNull();
  });

  it('🔴 submits what BOTH steps collected', async () => {
    const onSubmit = vi.fn<(input: CombinationInput) => Promise<void>>();
    const { pickResource } = fakePicker();
    render(
      <MatchupForm pickResource={pickResource} onSubmit={onSubmit} onCancel={vi.fn()} multiStep />,
    );

    await userEvent.click(screen.getByTestId('pick-checkpoint'));
    await waitFor(() => expect(screen.getByTestId('checkpoint-card')).toBeInTheDocument());
    await userEvent.click(screen.getByTestId('form-next'));
    await userEvent.type(screen.getByTestId('matchup-name'), 'Paged showdown');
    await userEvent.click(screen.getByTestId('matchup-submit'));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const input = onSubmit.mock.calls[0]![0] as CombinationInput;
    // Step 2's field AND step 1's content, in one payload — the thing a two-step
    // form can get wrong by unmounting state along with the page.
    expect(input.name).toBe('Paged showdown');
    expect(input.configs[0]!.checkpoint?.versionId).toBe(1001);
  });

  it('🔴 shows a step-1 validation failure on step 2, where the Submit is', async () => {
    // The error alert sits OUTSIDE both steps on purpose: submit validates the whole
    // input, so a failure raised on step 2 can be about step 1's content. Rendering
    // it inside a step would hide exactly the message that says to press Back.
    const onSubmit = vi.fn<(input: CombinationInput) => Promise<void>>();
    const { pickResource } = fakePicker();
    render(
      <MatchupForm pickResource={pickResource} onSubmit={onSubmit} onCancel={vi.fn()} multiStep />,
    );

    // Advance WITHOUT picking a checkpoint, name it, submit.
    await userEvent.click(screen.getByTestId('form-next'));
    await userEvent.type(screen.getByTestId('matchup-name'), 'Nameless models');
    await userEvent.click(screen.getByTestId('matchup-submit'));

    expect(onSubmit).not.toHaveBeenCalled();
    const errs = screen.queryByTestId('matchup-errors');
    expect(errs, 'the step-1 failure was not reported on step 2').not.toBeNull();
    expect(errs).toHaveTextContent('Add at least one model');
    // …and it is readable from step 2, not stranded on the page the viewer left.
    expect(screen.queryByTestId('form-step-meta')).not.toBeNull();

    // 🔴 AND THE ALERT IS OUTSIDE THE STEP, NOT MERELY VISIBLE ON IT. This half was
    // MISSING for a round, and an audit mutant proved the gap: moving the `Alert`
    // INSIDE `MetaStep` — the exact arrangement the production comment says must not
    // happen — left this file 18/18 GREEN, because "readable on step 2" is equally
    // true of an alert nested in step 2. The description claimed a STRUCTURAL
    // property and the implementation checked one side of it.
    expect(
      screen.getByTestId('form-step-meta').contains(errs),
      'the error Alert is nested INSIDE a step — pressing Back now discards the one message that says to press Back',
    ).toBe(false);

    // …and the behavioural half of the same claim: it SURVIVES the trip back.
    await userEvent.click(screen.getByTestId('form-back'));
    expect(screen.queryByTestId('form-step-content')).not.toBeNull();
    expect(
      screen.queryByTestId('matchup-errors'),
      'the error vanished on Back, so the viewer is on step 1 with no idea what to fix',
    ).not.toBeNull();
  });
});
