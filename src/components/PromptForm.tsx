// Submit a PROMPT. A prompt is a DEFAULT prompt + params that runs on EVERY
// ecosystem, plus OPTIONAL sparse per-ecosystem overrides (replace the prompt
// and/or patch the params for a specific base-model family). On submit the
// default prompt AND every override prompt (+ negatives) are pushed into the
// moderated title/body and the structured copy rides `data` (see
// buildPromptPayload). The default seeds SDXL-family generator params; an
// override pre-fills its prompt from the default and its params with that
// ecosystem's conventional defaults.

import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  NumberInput,
  Select,
  Stack,
  TextInput,
  Textarea,
} from '@civitai/blocks-react/ui';

import type { PromptDefault, PromptOverride, PromptParams } from '../types.js';
import { validatePrompt, type PromptInput } from '../lib/benchmark.js';
import { ECOSYSTEMS, ecosystemMeta } from '../lib/ecosystem.js';
import { defaultParamsForEcosystem } from '../lib/gen-defaults.js';

export interface PromptFormProps {
  onSubmit: (input: PromptInput) => Promise<void>;
  onCancel: () => void;
  /** Prefill (edit-in-place): the stored prompt as a builder input. */
  initial?: PromptInput;
  /** Submit button label (defaults to "Submit prompt"; "Save changes" in edit mode). */
  submitLabel?: string;
}

/** The default section always exists; seed its params with the SDXL-family
 * generator defaults (a reasonable general baseline that applies to all
 * ecosystems unless the author adds a narrower override). */
function seedDefault(): PromptDefault {
  return { prompt: '', params: defaultParamsForEcosystem('SDXL') };
}

/** Insertion-ordered override entries from a prefill input (preserving map order). */
function overridesFromInitial(initial?: PromptInput): Array<{ eco: string; value: PromptOverride }> {
  if (!initial) return [];
  return Object.entries(initial.overrides).map(([eco, value]) => ({ eco, value }));
}

/** The generation-param fields (shared by the default section + every override).
 * `prefix` scopes the test-ids so the default and each override are addressable. */
function ParamFields({
  prefix,
  params,
  onPatch,
}: {
  prefix: string;
  params: PromptParams;
  onPatch: (patch: Partial<PromptParams>) => void;
}): React.JSX.Element {
  return (
    <>
      <Textarea
        label="Negative prompt"
        value={params.negativePrompt ?? ''}
        onChange={(e) => onPatch({ negativePrompt: e.currentTarget.value })}
        data-testid={`${prefix}-negative`}
        minRows={1}
      />
      <Group gap={10} wrap>
        <div style={{ width: 110 }}>
          <NumberInput
            label="CFG"
            min={1}
            max={30}
            step={0.5}
            value={params.cfgScale ?? null}
            onChange={(v) => onPatch({ cfgScale: v ?? undefined })}
            data-testid={`${prefix}-cfg`}
          />
        </div>
        <div style={{ width: 110 }}>
          <NumberInput
            label="Steps"
            min={1}
            max={50}
            value={params.steps ?? null}
            onChange={(v) => onPatch({ steps: v ?? undefined })}
            data-testid={`${prefix}-steps`}
          />
        </div>
        <div style={{ width: 140 }}>
          <TextInput
            label="Sampler"
            value={params.sampler ?? ''}
            onChange={(e) => onPatch({ sampler: e.currentTarget.value || undefined })}
            placeholder="Euler"
            data-testid={`${prefix}-sampler`}
          />
        </div>
        <div style={{ width: 140 }}>
          <NumberInput
            label="Seed"
            value={params.seed ?? null}
            onChange={(v) => onPatch({ seed: v })}
            data-testid={`${prefix}-seed`}
          />
        </div>
        <div style={{ width: 110 }}>
          <NumberInput
            label="Width"
            min={64}
            max={2048}
            step={64}
            value={params.width ?? null}
            onChange={(v) => onPatch({ width: v ?? undefined })}
            data-testid={`${prefix}-width`}
          />
        </div>
        <div style={{ width: 110 }}>
          <NumberInput
            label="Height"
            min={64}
            max={2048}
            step={64}
            value={params.height ?? null}
            onChange={(v) => onPatch({ height: v ?? undefined })}
            data-testid={`${prefix}-height`}
          />
        </div>
        <div style={{ width: 110 }}>
          <NumberInput
            label="Clip skip"
            min={1}
            max={12}
            value={params.clipSkip ?? null}
            onChange={(v) => onPatch({ clipSkip: v ?? undefined })}
            data-testid={`${prefix}-clip-skip`}
          />
        </div>
      </Group>
    </>
  );
}

export function PromptForm({ onSubmit, onCancel, initial, submitLabel }: PromptFormProps): React.JSX.Element {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [def, setDef] = useState<PromptDefault>(() => initial?.default ?? seedDefault());
  // Insertion-ordered per-ecosystem overrides (sparse, optional).
  const [overrides, setOverrides] = useState<Array<{ eco: string; value: PromptOverride }>>(() =>
    overridesFromInitial(initial),
  );
  const [addEco, setAddEco] = useState<string>(ECOSYSTEMS[0].key);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const usedEcos = new Set(overrides.map((o) => o.eco));
  const available = ECOSYSTEMS.filter((e) => !usedEcos.has(e.key));

  const patchDefault = (patch: Partial<PromptDefault>) => setDef((prev) => ({ ...prev, ...patch }));
  const patchDefaultParams = (patch: Partial<PromptParams>) =>
    setDef((prev) => ({ ...prev, params: { ...prev.params, ...patch } }));

  const addOverride = () => {
    if (usedEcos.has(addEco)) return;
    // Pre-fill the override prompt from the current default, params from THIS
    // ecosystem's conventional defaults.
    const value: PromptOverride = { prompt: def.prompt, params: defaultParamsForEcosystem(addEco) };
    setOverrides((prev) => [...prev, { eco: addEco, value }]);
    const next = ECOSYSTEMS.find((e) => e.key !== addEco && !usedEcos.has(e.key));
    if (next) setAddEco(next.key);
  };

  const patchOverride = (eco: string, patch: Partial<PromptOverride>) =>
    setOverrides((prev) => prev.map((o) => (o.eco === eco ? { ...o, value: { ...o.value, ...patch } } : o)));

  const patchOverrideParams = (eco: string, patch: Partial<PromptParams>) =>
    setOverrides((prev) =>
      prev.map((o) =>
        o.eco === eco ? { ...o, value: { ...o.value, params: { ...(o.value.params ?? {}), ...patch } } } : o,
      ),
    );

  const removeOverride = (eco: string) => setOverrides((prev) => prev.filter((o) => o.eco !== eco));

  const submit = async () => {
    const overrideMap: Record<string, PromptOverride> = {};
    for (const o of overrides) overrideMap[o.eco] = o.value;
    const input: PromptInput = { name, description, default: def, overrides: overrideMap };
    const errs = validatePrompt(input);
    if (errs.length) {
      setErrors(errs);
      return;
    }
    setErrors([]);
    setBusy(true);
    try {
      await onSubmit(input);
    } catch (err) {
      setErrors([err instanceof Error ? err.message : 'Failed to submit.']);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack gap={14} data-testid="prompt-form">
      <TextInput
        label="Prompt name"
        required
        value={name}
        onChange={(e) => setName(e.currentTarget.value)}
        placeholder="e.g. Cyberpunk portrait"
        data-testid="prompt-name"
      />
      <Textarea
        label="Description"
        value={description}
        onChange={(e) => setDescription(e.currentTarget.value)}
        placeholder="What is this prompt testing?"
        data-testid="prompt-description"
        minRows={2}
      />

      {/* DEFAULT section — always present; applies to every ecosystem. */}
      <Card withBorder padding="md" data-testid="prompt-default">
        <Stack gap={10}>
          <Group justify="space-between">
            <Badge>Default (all ecosystems)</Badge>
          </Group>
          <Textarea
            label="Default prompt"
            required
            value={def.prompt}
            onChange={(e) => patchDefault({ prompt: e.currentTarget.value })}
            placeholder="Prompt used for every ecosystem unless an override narrows it"
            data-testid="prompt-default-text"
            minRows={2}
          />
          <ParamFields prefix="prompt-default" params={def.params} onPatch={patchDefaultParams} />
        </Stack>
      </Card>

      {/* OPTIONAL per-ecosystem overrides. */}
      <Card withBorder padding="md">
        <Group gap={8} align="flex-end">
          <div style={{ flex: 1 }}>
            <Select
              label="Add a per-ecosystem override"
              value={addEco}
              onChange={setAddEco}
              options={available.map((e) => ({ value: e.key, label: e.label }))}
              disabled={available.length === 0}
              data-testid="prompt-add-override-select"
            />
          </div>
          <Button onClick={addOverride} disabled={available.length === 0} data-testid="prompt-add-override">
            Add override
          </Button>
        </Group>
        <span style={{ opacity: 0.6, fontSize: 12, display: 'block', marginTop: 6 }} data-testid="prompt-overrides-hint">
          Optional. A config runs the DEFAULT prompt unless you add an override for its checkpoint's ecosystem
          (SDXL, Pony, Flux, …).
        </span>
      </Card>

      {overrides.map(({ eco, value }) => (
        <Card key={eco} withBorder padding="md" data-testid="prompt-override-entry" data-eco={eco}>
          <Stack gap={10}>
            <Group justify="space-between">
              <Badge variant="light">Override · {ecosystemMeta(eco).label}</Badge>
              <Button
                size="sm"
                variant="subtle"
                color="error"
                onClick={() => removeOverride(eco)}
                data-testid="prompt-override-remove"
              >
                Remove
              </Button>
            </Group>
            <Textarea
              label="Prompt override"
              value={value.prompt ?? ''}
              onChange={(e) => patchOverride(eco, { prompt: e.currentTarget.value })}
              placeholder="Prompt for this ecosystem (falls back to the default if blank)"
              data-testid="prompt-override-text"
              minRows={2}
            />
            <ParamFields
              prefix="prompt-override"
              params={value.params ?? {}}
              onPatch={(patch) => patchOverrideParams(eco, patch)}
            />
          </Stack>
        </Card>
      ))}

      {errors.length > 0 && (
        <Alert color="error" data-testid="prompt-errors">
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Alert>
      )}

      <Group justify="flex-end" gap={8}>
        <Button variant="subtle" onClick={onCancel} data-testid="prompt-cancel">
          Cancel
        </Button>
        <Button onClick={submit} loading={busy} data-testid="prompt-submit">
          {submitLabel ?? 'Submit prompt'}
        </Button>
      </Group>
    </Stack>
  );
}
