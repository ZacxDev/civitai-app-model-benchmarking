// Submit a COMBINATION — a named GROUP of one-or-more model configs to benchmark
// together (v2 data model). Each config = one checkpoint + its own weighted LoRA
// stack (the atomic benchmarkable unit). Per config: the checkpoint is picked
// first (any base model); the LoRA picker is then family-scoped to THAT
// checkpoint's baseModel (via `baseModelGroup`) so a pick stays in the config's
// ecosystem. At least one config with a checkpoint is required. On submit the
// payload is built with the moderation split (names/labels in title/body,
// ids/weights in opaque data). Reused in an EDIT mode (prefill via `initial`).

import { useState } from 'react';
import type { BlockResourceInfo, BlockResourcePickerType } from '@civitai/app-sdk/blocks';
import { Alert, Button, Card, Group, Slider, Stack, TextInput, Textarea } from '@civitai/blocks-react/ui';

import type { ModelConfig } from '../types.js';
import {
  checkpointFromPick,
  loraFromPick,
  MAX_CONFIGS,
  MAX_LORAS,
  newConfig,
  validateCombination,
  type CombinationInput,
} from '../lib/benchmark.js';
import { ecosystemForBaseModel, ecosystemMeta } from '../lib/ecosystem.js';

export interface CombinationFormProps {
  pickResource: (opts: {
    resourceType: BlockResourcePickerType;
    baseModelGroup?: string;
  }) => Promise<BlockResourceInfo | null>;
  onSubmit: (input: CombinationInput) => Promise<void>;
  onCancel: () => void;
  /** Prefill (edit-in-place): the stored combination as a builder input. */
  initial?: CombinationInput;
  /** Submit button label (defaults to "Submit combination"; "Save changes" in edit mode). */
  submitLabel?: string;
}

export function CombinationForm({
  pickResource,
  onSubmit,
  onCancel,
  initial,
  submitLabel,
}: CombinationFormProps): React.JSX.Element {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [configs, setConfigs] = useState<ModelConfig[]>(() =>
    initial && initial.configs.length > 0 ? initial.configs.map((c) => ({ ...c })) : [newConfig()],
  );
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
      // A checkpoint change can invalidate the config's LoRA family — clear its stack.
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

  return (
    <Stack gap={14} data-testid="combination-form">
      <TextInput
        label="Combination name"
        required
        value={name}
        onChange={(e) => setName(e.currentTarget.value)}
        placeholder="e.g. Realism showdown"
        data-testid="combo-name"
      />
      <Textarea
        label="Description"
        value={description}
        onChange={(e) => setDescription(e.currentTarget.value)}
        placeholder="What are these model setups being compared on?"
        data-testid="combo-description"
        minRows={2}
      />

      <Group justify="space-between" align="center">
        <strong>Model configs ({configs.length}/{MAX_CONFIGS})</strong>
        <Button
          size="sm"
          variant="light"
          onClick={addConfig}
          disabled={configs.length >= MAX_CONFIGS}
          data-testid="add-config"
        >
          Add model config
        </Button>
      </Group>
      <span style={{ opacity: 0.6, fontSize: 12 }}>
        Each config (one checkpoint + its LoRAs) is a benchmarkable row in the grid, grouped under this
        combination.
      </span>

      {configs.map((cfg, i) => {
        const eco = cfg.checkpoint ? ecosystemForBaseModel(cfg.checkpoint.baseModel) : undefined;
        return (
          <Card key={cfg.id} withBorder padding="md" data-testid="config-card" data-config-id={cfg.id}>
            <Stack gap={10}>
              <Group justify="space-between" align="center">
                <strong style={{ fontSize: 13 }}>Config {i + 1}</strong>
                {configs.length > 1 && (
                  <Button
                    size="sm"
                    variant="subtle"
                    color="error"
                    onClick={() => removeConfig(cfg.id)}
                    data-testid="remove-config"
                  >
                    Remove config
                  </Button>
                )}
              </Group>

              <TextInput
                label="Config label (optional)"
                value={cfg.label ?? ''}
                onChange={(e) => patchConfig(cfg.id, { label: e.currentTarget.value || undefined })}
                placeholder="e.g. base, or + detail LoRA"
                data-testid="config-label"
              />

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
                <Group gap={8} data-testid="checkpoint-name">
                  <span>{cfg.checkpoint.modelName ?? `#${cfg.checkpoint.versionId}`}</span>
                  <span style={{ opacity: 0.6 }}>
                    {cfg.checkpoint.baseModel} → {ecosystemMeta(eco!).label}
                  </span>
                </Group>
              ) : (
                <span style={{ opacity: 0.6 }}>No checkpoint picked.</span>
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
              {!cfg.checkpoint && <span style={{ opacity: 0.6 }}>Pick a checkpoint first.</span>}
              {cfg.loras.map((l) => (
                <Group
                  key={l.versionId}
                  justify="space-between"
                  data-testid="lora-row"
                  data-version-id={l.versionId}
                >
                  <span>{l.modelName ?? `#${l.versionId}`}</span>
                  <Group gap={8} align="center">
                    <div style={{ width: 140 }}>
                      <Slider
                        aria-label={`Weight for ${l.modelName ?? l.versionId}`}
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
                    >
                      Remove
                    </Button>
                  </Group>
                </Group>
              ))}
            </Stack>
          </Card>
        );
      })}

      {errors.length > 0 && (
        <Alert color="error" data-testid="combo-errors">
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Alert>
      )}

      <Group justify="flex-end" gap={8}>
        <Button variant="subtle" onClick={onCancel} data-testid="combo-cancel">
          Cancel
        </Button>
        <Button onClick={submit} loading={busy} data-testid="combo-submit">
          {submitLabel ?? 'Submit combination'}
        </Button>
      </Group>
    </Stack>
  );
}
