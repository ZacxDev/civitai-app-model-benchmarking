// Submit a checkpoint + weighted-LoRA COMBINATION. The checkpoint is picked
// first (any base model); the LoRA picker is then family-scoped to the
// checkpoint's baseModel (via `baseModelGroup`) so a pick stays in the
// checkpoint's ecosystem. On submit the payload is built with the moderation
// split (names in title/body, ids/weights in opaque data).

import { useState } from 'react';
import type { BlockResourceInfo, BlockResourcePickerType } from '@civitai/app-sdk/blocks';
import { Alert, Button, Card, Group, Slider, Stack, TextInput, Textarea } from '@civitai/blocks-react/ui';

import type { CheckpointRef, LoraRef } from '../types.js';
import {
  checkpointFromPick,
  loraFromPick,
  MAX_LORAS,
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
}

export function CombinationForm({ pickResource, onSubmit, onCancel }: CombinationFormProps): React.JSX.Element {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [checkpoint, setCheckpoint] = useState<CheckpointRef | undefined>();
  const [loras, setLoras] = useState<LoraRef[]>([]);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const ecosystem = checkpoint ? ecosystemForBaseModel(checkpoint.baseModel) : undefined;

  const pickCheckpoint = async () => {
    const pick = await pickResource({ resourceType: 'Checkpoint' });
    if (pick) {
      setCheckpoint(checkpointFromPick(pick));
      // A checkpoint change can invalidate the LoRA family — clear the stack.
      setLoras([]);
    }
  };

  const addLora = async () => {
    if (!checkpoint || loras.length >= MAX_LORAS) return;
    const pick = await pickResource({
      resourceType: 'LORA',
      baseModelGroup: ecosystemMeta(ecosystemForBaseModel(checkpoint.baseModel)).baseModelGroup,
    });
    if (pick) setLoras((prev) => [...prev, loraFromPick(pick)]);
  };

  const setLoraWeight = (versionId: number, weight: number) =>
    setLoras((prev) => prev.map((l) => (l.versionId === versionId ? { ...l, weight } : l)));

  const removeLora = (versionId: number) =>
    setLoras((prev) => prev.filter((l) => l.versionId !== versionId));

  const submit = async () => {
    const input: CombinationInput = { name, description, checkpoint: checkpoint!, loras };
    const errs = checkpoint ? validateCombination(input) : ['Pick a checkpoint.'];
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
        placeholder="e.g. DreamShaper + Neon Glow"
        data-testid="combo-name"
      />
      <Textarea
        label="Description"
        value={description}
        onChange={(e) => setDescription(e.currentTarget.value)}
        placeholder="What makes this stack worth comparing?"
        data-testid="combo-description"
        minRows={2}
      />

      <Card withBorder padding="md" data-testid="combo-checkpoint">
        <Stack gap={8}>
          <Group justify="space-between">
            <strong>Checkpoint</strong>
            <Button size="sm" variant="light" onClick={pickCheckpoint} data-testid="pick-checkpoint">
              {checkpoint ? 'Change' : 'Pick checkpoint'}
            </Button>
          </Group>
          {checkpoint ? (
            <Group gap={8} data-testid="checkpoint-name">
              <span>{checkpoint.modelName ?? `#${checkpoint.versionId}`}</span>
              <span style={{ opacity: 0.6 }}>
                {checkpoint.baseModel} → {ecosystemMeta(ecosystem!).label}
              </span>
            </Group>
          ) : (
            <span style={{ opacity: 0.6 }}>No checkpoint picked.</span>
          )}
        </Stack>
      </Card>

      <Card withBorder padding="md" data-testid="combo-loras">
        <Stack gap={10}>
          <Group justify="space-between">
            <strong>LoRAs ({loras.length}/{MAX_LORAS})</strong>
            <Button
              size="sm"
              variant="light"
              onClick={addLora}
              disabled={!checkpoint || loras.length >= MAX_LORAS}
              data-testid="add-lora"
            >
              Add LoRA
            </Button>
          </Group>
          {!checkpoint && <span style={{ opacity: 0.6 }}>Pick a checkpoint first.</span>}
          {loras.map((l) => (
            <Group key={l.versionId} justify="space-between" data-testid="lora-row" data-version-id={l.versionId}>
              <span>{l.modelName ?? `#${l.versionId}`}</span>
              <Group gap={8} align="center">
                <div style={{ width: 140 }}>
                  <Slider
                    aria-label={`Weight for ${l.modelName ?? l.versionId}`}
                    min={l.minStrength ?? -1}
                    max={l.maxStrength ?? 2}
                    step={0.05}
                    value={l.weight}
                    onChange={(v: number) => setLoraWeight(l.versionId, v)}
                  />
                </div>
                <span style={{ width: 44, textAlign: 'right' }} data-testid="lora-weight">
                  {l.weight.toFixed(2)}
                </span>
                <Button size="sm" variant="subtle" color="error" onClick={() => removeLora(l.versionId)}>
                  Remove
                </Button>
              </Group>
            </Group>
          ))}
        </Stack>
      </Card>

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
          Submit combination
        </Button>
      </Group>
    </Stack>
  );
}
