// Submit a MATCHUP — a named GROUP of one-or-more MODELS to benchmark together
// (v2 data model). Each model = one checkpoint + its own weighted LoRA stack (the
// atomic benchmarkable unit). Per model: the checkpoint is picked first (any base
// model); the LoRA picker is then family-scoped to THAT checkpoint's baseModel
// (via `baseModelGroup`) so a pick stays in the model's ecosystem. At least one
// model with a checkpoint is required. On submit the payload is built with the
// moderation split (names/labels in title/body, ids/weights in opaque data).
// Reused in an EDIT mode (prefill via `initial`).
//
// 🔴 "MODEL" IS THE VIEWER-FACING WORD; `config` IS THE WIRE WORD AND IS FOREVER.
// `ModelConfig`, `CombinationData.configs` and every stored row spell `config`, and
// `renameWireCompat.test.ts` pins that. What changed is only what a viewer READS —
// the heading is "Models", the add button is "Add model", the per-row heading is the
// model's own derived name. Do not "finish" the rename into the types or the wire.
//
// 🔴 THERE IS NO LABEL INPUT ANY MORE, AND `ModelConfig.label` IS STILL READ.
// A viewer no longer types a per-model label — it is DERIVED from the checkpoint and
// the LoRAs by `modelConfigLabel`. But the field stays in the type and keeps being
// displayed, because published rows ALREADY carry author-written labels and this app
// can never rewrite another author's row. So: the input is gone; the stored value is
// not. `modelConfigLabel`'s docblock carries the rule and `MatchupForm.test.tsx`
// pins both halves in one case (an authored label still shows, an absent one
// generates) — a one-sided version of that test passes against an implementation
// that ignores stored labels, which is the exact regression at stake.

import { useState } from 'react';
import type { BlockResourceInfo, BlockResourcePickerType } from '@civitai/app-sdk/blocks';
import {
  Alert,
  Button,
  Card,
  Group,
  ResourceCard,
  resourceDisplayName,
  Slider,
  Stack,
  TextInput,
  Textarea,
} from '@civitai/blocks-react/ui';

import type { CheckpointRef, LoraRef, ModelConfig } from '../types.js';
import { metaText } from '../theme.js';
import { MIN_TAP_TARGET_PX } from '../compact.js';
import {
  checkpointFromPick,
  loraFromPick,
  MAX_CONFIGS,
  MAX_LORAS,
  modelConfigLabel,
  newConfig,
  validateCombination,
  type CombinationInput,
} from '../lib/benchmark.js';
import { ecosystemForBaseModel, ecosystemMeta } from '../lib/ecosystem.js';
import { ContentStep, MetaStep, StepNav, type FormStep } from './FormSteps.js';

export interface MatchupFormProps {
  pickResource: (opts: {
    resourceType: BlockResourcePickerType;
    baseModelGroup?: string;
  }) => Promise<BlockResourceInfo | null>;
  onSubmit: (input: CombinationInput) => Promise<void>;
  onCancel: () => void;
  /** Prefill (edit-in-place): the stored matchup as a builder input. */
  initial?: CombinationInput;
  /** Submit button label (defaults to "Submit matchup"; "Save changes" in edit mode). */
  submitLabel?: string;
  /**
   * Two-step CREATE flow: models first, then name + description. FALSE (the
   * default) is the single-page EDIT shape. Set by `App.tsx` from the modal kind,
   * never inferred from `initial` — see `FormSteps.tsx`.
   */
  multiStep?: boolean;
}

/**
 * `CheckpointRef` → the `BlockResourceInfo` `ResourceCard` requires.
 *
 * 🔴 WHY AN ADAPTER AND NOT A LOCAL CARD. `ResourceCard` was built FROM this app's
 * rows (it says so in its own docblock) and it FREEZES the things three apps must
 * not disagree about: the name fallback, the Checkpoint/LoRA type label, and the
 * accessible-name composition. A hand-rolled card here would be this app telling a
 * viewer something different about the same resource from what the picker does.
 *
 * 🔴 `modelName ?? ''` IS DELIBERATE, NOT LAZY. Upstream's frozen
 * `resourceDisplayName` turns an empty — or whitespace-only — name into
 * `#<versionId>`, which is byte-identical to the `#${versionId}` this form used to
 * write by hand, and additionally catches `'   '`, which the old `??` did not.
 * Pushing the fallback up here would re-split a rule upstream owns.
 */
function checkpointInfo(ref: CheckpointRef): BlockResourceInfo {
  return {
    versionId: ref.versionId,
    modelId: ref.modelId,
    modelName: ref.modelName ?? '',
    versionName: ref.versionName ?? '',
    baseModel: ref.baseModel,
    // Structural knowledge the form already has: this slot is picked with
    // `resourceType: 'Checkpoint'`, so the type is not a guess.
    modelType: 'Checkpoint',
  };
}

/**
 * `LoraRef` → `BlockResourceInfo`.
 *
 * 🔴 `modelId ?? 0` IS SAFE BECAUSE NOTHING READS IT — measured: `ResourceCard`
 * references `modelId` ZERO times (it is not a link, on purpose). `LoraRef.modelId`
 * is optional FOREVER by design (see `types.ts`: rows published before the field
 * existed can never be backfilled), so there is no value to pass through on an old
 * row and no consumer to mislead.
 *
 * 🔴 AN EMPTY `baseModel` IS HONEST AND COSTS NOTHING ON SCREEN. `LoraRef` stores
 * no base model — the LoRA was picked family-scoped to the checkpoint's, so the
 * ecosystem is the checkpoint's property, not the LoRA's — and upstream FILTERS an
 * empty `baseModel` out of the meta line rather than rendering an empty badge
 * (measured in the installed `ResourceCard`: `baseModel !== '' ? … : null`).
 */
function loraInfo(ref: LoraRef): BlockResourceInfo {
  return {
    versionId: ref.versionId,
    modelId: ref.modelId ?? 0,
    modelName: ref.modelName ?? '',
    versionName: ref.versionName ?? '',
    baseModel: '',
    modelType: 'LORA',
  };
}

/**
 * The remove-a-model control: an icon button.
 *
 * 🔴 IT CARRIES AN ACCESSIBLE NAME, AND THAT IS NOT OPTIONAL HERE. The glyph is an
 * `aria-hidden` SVG, so without the `aria-label` this control announces as an
 * unnamed button — and the label NAMES THE MODEL rather than saying "Remove",
 * because a matchup can hold up to `MAX_CONFIGS` (100) of these and a hundred
 * identically-named buttons is a list a screen-reader user cannot navigate.
 *
 * 🔴 THE 44px FLOOR IS INLINE, which means `compact.ts` can never shrink it — an
 * inline declaration outranks every non-`!important` author rule. That is the
 * intent for a FLOOR (it may never go below the WCAG 2.5.5 figure), and it is why
 * the constant is imported rather than written as a literal: there is one 44 in
 * this repo and `mobile-responsive.test.tsx` pins its value.
 */
function RemoveModelButton({ label, onClick }: { label: string; onClick: () => void }): React.JSX.Element {
  return (
    <Button
      size="sm"
      variant="subtle"
      color="error"
      onClick={onClick}
      data-testid="remove-config"
      aria-label={`Remove ${label}`}
      style={{
        minWidth: MIN_TAP_TARGET_PX,
        minHeight: MIN_TAP_TARGET_PX,
        paddingInline: 0,
      }}
    >
      {/* Decorative: the button's own `aria-label` is the accessible name, so an
          un-hidden glyph here would be read in addition to it. */}
      <svg
        aria-hidden="true"
        focusable="false"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 6h18" />
        <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
        <path d="M10 11v6" />
        <path d="M14 11v6" />
      </svg>
    </Button>
  );
}

export function MatchupForm({
  pickResource,
  onSubmit,
  onCancel,
  initial,
  submitLabel,
  multiStep = false,
}: MatchupFormProps): React.JSX.Element {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [configs, setConfigs] = useState<ModelConfig[]>(() =>
    initial && initial.configs.length > 0 ? initial.configs.map((c) => ({ ...c })) : [newConfig()],
  );
  const [step, setStep] = useState<FormStep>('content');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const patchConfig = (id: string, patch: Partial<ModelConfig>) =>
    setConfigs((prev) => prev.map((cfg) => (cfg.id === id ? { ...cfg, ...patch } : cfg)));

  const addConfig = () =>
    setConfigs((prev) => (prev.length >= MAX_CONFIGS ? prev : [...prev, newConfig()]));

  const removeConfig = (id: string) =>
    setConfigs((prev) => (prev.length <= 1 ? prev : prev.filter((cfg) => cfg.id !== id)));

  const pickCheckpoint = async (id: string) => {
    const pick = await pickResource({ resourceType: 'Checkpoint' });
    if (pick) {
      // A checkpoint change can invalidate the model's LoRA family — clear its stack.
      patchConfig(id, { checkpoint: checkpointFromPick(pick), loras: [] });
    }
  };

  const addLora = async (cfg: ModelConfig) => {
    if (!cfg.checkpoint || cfg.loras.length >= MAX_LORAS) return;
    const pick = await pickResource({
      resourceType: 'LORA',
      baseModelGroup: ecosystemMeta(ecosystemForBaseModel(cfg.checkpoint.baseModel)).baseModelGroup,
    });
    if (pick) patchConfig(cfg.id, { loras: [...cfg.loras, loraFromPick(pick)] });
  };

  const setLoraWeight = (id: string, versionId: number, weight: number) =>
    setConfigs((prev) =>
      prev.map((cfg) =>
        cfg.id === id
          ? { ...cfg, loras: cfg.loras.map((l) => (l.versionId === versionId ? { ...l, weight } : l)) }
          : cfg,
      ),
    );

  const removeLora = (id: string, versionId: number) =>
    setConfigs((prev) =>
      prev.map((cfg) =>
        cfg.id === id ? { ...cfg, loras: cfg.loras.filter((l) => l.versionId !== versionId) } : cfg,
      ),
    );

  const submit = async () => {
    const input: CombinationInput = { name, description, configs };
    const errs = validateCombination(input);
    if (errs.length) {
      setErrors(errs);
      return;
    }
    setErrors([]);
    setBusy(true);
    try {
      await onSubmit(input);
    } catch (e) {
      setErrors([e instanceof Error ? e.message : 'Failed to submit.']);
    } finally {
      setBusy(false);
    }
  };

  /**
   * 🔴 "ADD MODEL" IS GATED ON THE FIRST MODEL'S CHECKPOINT, NOT ON THE LIST BEING
   * NON-EMPTY. The list ALWAYS holds at least one row (`newConfig()` seeds a blank
   * one), so a `configs.length > 0` gate would be permanently true and the control
   * permanently visible — the gate has to read the first row's CONTENT. Offering a
   * second model before the first one has a checkpoint is how a matchup ends up with
   * a column of empty rows that `validateCombination` then silently drops.
   *
   * ⚠️ IT READS THE FIRST ROW, SO REMOVING THE FIRST ROW CAN HIDE THE BUTTON WHILE A
   * LATER ROW IS COMPLETE — named rather than fixed, because the recovery is the same
   * action the gate is asking for. Reachable: pick a checkpoint on model 1, Add model,
   * leave model 2 empty, trash model 1. The survivor has no checkpoint, so "Add model"
   * goes away (and so does its own trash, on the `length > 1` gate) until the viewer
   * picks one — which is exactly what the gate wants next anyway. A version reading
   * `configs.some(c => c.checkpoint)` would instead let a viewer stack empty rows
   * behind one complete one, which is the state this gate exists to prevent.
   */
  const canAddModel = !!configs[0]?.checkpoint;

  return (
    <Stack gap={14} data-testid="matchup-form">
      {/* 🔴 `MetaStep` IS FIRST IN THE MARKUP, AND THAT IS ABOUT THE *EDIT* FORM.
          In two-step mode exactly one of these two ever renders, so JSX order is
          not screen order and this is invisible. In SINGLE-PAGE mode both render
          bare, and then this IS the field order — name and description at the TOP,
          which is where they have been since the form shipped.

          Putting `ContentStep` first cost nothing on the create path and silently
          moved the name input to the BOTTOM of all six edit surfaces: an author
          opening "Edit prompt" to fix a typo got the default-prompt card, its
          generation params and every override card first. Nothing in the suite
          pinned field order, so the gate could not see it — `MatchupForm.test.tsx`'s
          "puts the NAME above the model list" case is what closes that. The operator
          asked only that an edit stay single-page, not that its fields move. */}
      <MetaStep multiStep={multiStep} step={step}>
        <Stack gap={14}>
          <TextInput
            label="Matchup name"
            required
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            placeholder="e.g. Realism showdown"
            data-testid="matchup-name"
          />
          <Textarea
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.currentTarget.value)}
            placeholder="What are these model setups being compared on?"
            data-testid="matchup-description"
            minRows={2}
          />
        </Stack>
      </MetaStep>

      <ContentStep multiStep={multiStep} step={step}>
        <Stack gap={14}>
          <strong>
            Models ({configs.length}/{MAX_CONFIGS})
          </strong>
          <span style={metaText}>
            Each model (one checkpoint + its LoRAs) is a benchmarkable row in the grid, grouped
            under this matchup.
          </span>

          {configs.map((cfg, i) => {
            const eco = cfg.checkpoint ? ecosystemForBaseModel(cfg.checkpoint.baseModel) : undefined;
            const label = modelConfigLabel(cfg, i);
            return (
              <Card
                key={cfg.id}
                withBorder
                padding="md"
                data-testid="config-card"
                data-config-id={cfg.id}
              >
                <Stack gap={10}>
                  <Group justify="space-between" align="center">
                    {/* The DERIVED name, or the author's own if the stored row carries
                        one. There is no input behind it — see the file header. */}
                    <strong style={{ fontSize: 13 }} data-testid="config-heading">
                      {label}
                    </strong>
                    {configs.length > 1 && (
                      <RemoveModelButton label={label} onClick={() => removeConfig(cfg.id)} />
                    )}
                  </Group>

                  <Group justify="space-between" align="center">
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Checkpoint</span>
                    <Button
                      size="sm"
                      variant="light"
                      onClick={() => pickCheckpoint(cfg.id)}
                      data-testid="pick-checkpoint"
                    >
                      {cfg.checkpoint ? 'Change' : 'Pick checkpoint'}
                    </Button>
                  </Group>
                  {cfg.checkpoint ? (
                    <Stack gap={4}>
                      <ResourceCard
                        variant="row"
                        resource={checkpointInfo(cfg.checkpoint)}
                        data-testid="checkpoint-card"
                      />
                      {/* 🔴 THE ECOSYSTEM ARROW HAS NO SLOT IN THE FROZEN META LINE, so it
                          stays a sibling. It is this app's own derivation (base model →
                          which prompt entry a run uses), not a property of the resource,
                          which is exactly why upstream does not render it. */}
                      <span style={metaText} data-testid="checkpoint-ecosystem">
                        {cfg.checkpoint.baseModel} → {ecosystemMeta(eco!).label}
                      </span>
                    </Stack>
                  ) : (
                    <span style={metaText}>No checkpoint picked.</span>
                  )}

                  <Group justify="space-between" align="center">
                    <span style={{ fontSize: 13, fontWeight: 600 }}>
                      LoRAs ({cfg.loras.length}/{MAX_LORAS})
                    </span>
                    <Button
                      size="sm"
                      variant="light"
                      onClick={() => addLora(cfg)}
                      disabled={!cfg.checkpoint || cfg.loras.length >= MAX_LORAS}
                      data-testid="add-lora"
                    >
                      Add LoRA
                    </Button>
                  </Group>
                  {!cfg.checkpoint && <span style={metaText}>Pick a checkpoint first.</span>}
                  {cfg.loras.map((l) => (
                    <ResourceCard
                      key={l.versionId}
                      variant="row"
                      resource={loraInfo(l)}
                      data-testid="lora-row"
                      /* 🔴 THE CONTROLS GO IN `actions`, NOT AROUND THE CARD. Upstream
                         renders this slot as a SIBLING of the hit area precisely so a
                         `<button>` (or a slider's thumb) is never nested inside the card's
                         own control — which would be invalid HTML the parser reparents,
                         leaving the inner control unreachable by keyboard. */
                      actions={
                        <Group gap={8} align="center">
                          <div style={{ width: 140 }}>
                            <Slider
                              aria-label={`Weight for ${resourceDisplayName(loraInfo(l))}`}
                              min={l.minStrength ?? -1}
                              max={l.maxStrength ?? 2}
                              step={0.05}
                              value={l.weight}
                              onChange={(v: number) => setLoraWeight(cfg.id, l.versionId, v)}
                            />
                          </div>
                          <span style={{ width: 44, textAlign: 'right' }} data-testid="lora-weight">
                            {l.weight.toFixed(2)}
                          </span>
                          <Button
                            size="sm"
                            variant="subtle"
                            color="error"
                            onClick={() => removeLora(cfg.id, l.versionId)}
                            /* 🔴 THE SAME NAME THE CARD SHOWS, THROUGH THE SAME
                               FUNCTION. These two controls kept a hand-rolled
                               `modelName ?? '#'+versionId` while `loraInfo` above
                               had already moved to upstream's frozen
                               `resourceDisplayName` — which ALSO treats a
                               whitespace-only name as absent. So a LoRA named '  '
                               rendered as `#2002` on the card while announcing
                               "Remove   " here, and `getByRole('button', {name})`
                               stopped matching what is on screen. One rule, one
                               place — and the place is upstream's. */
                            aria-label={`Remove ${resourceDisplayName(loraInfo(l))}`}
                          >
                            Remove
                          </Button>
                        </Group>
                      }
                    />
                  ))}
                </Stack>
              </Card>
            );
          })}

          {/* 🔴 BELOW THE LIST, AND ONLY ONCE THE FIRST MODEL HAS A CHECKPOINT. See
              `canAddModel`. `disabled` at the cap rather than hidden: a viewer who has
              built 100 models is owed the reason, not a vanished button. */}
          {canAddModel && (
            <Group justify="flex-start">
              <Button
                size="sm"
                variant="light"
                onClick={addConfig}
                disabled={configs.length >= MAX_CONFIGS}
                data-testid="add-config"
              >
                Add model
              </Button>
            </Group>
          )}
        </Stack>
      </ContentStep>

      {/* 🔴 OUTSIDE BOTH STEPS. Submit runs `validateCombination` over the WHOLE
          input, so an error raised on step 2 can be about step 1's content ("Add at
          least one model…") — rendering the alert inside a step would hide exactly
          the message that tells the viewer to press Back. */}
      {errors.length > 0 && (
        <Alert color="error" data-testid="matchup-errors">
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Alert>
      )}

      <Group justify="flex-end" gap={8}>
        <Button variant="subtle" onClick={onCancel} data-testid="matchup-cancel">
          Cancel
        </Button>
        {multiStep && (
          <StepNav step={step} onNext={() => setStep('meta')} onBack={() => setStep('content')} />
        )}
        {(!multiStep || step === 'meta') && (
          <Button onClick={submit} loading={busy} data-testid="matchup-submit">
            {submitLabel ?? 'Submit matchup'}
          </Button>
        )}
      </Group>
    </Stack>
  );
}
