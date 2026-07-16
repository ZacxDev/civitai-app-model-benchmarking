// Submit a multi-ecosystem PROMPT. The editor lets the author add one entry per
// ecosystem (baseModel family): a raw prompt string + generation params. On
// submit EVERY prompt string is pushed into the moderated title/body and the
// structured copy rides `data.byEcosystem` (see buildPromptPayload).

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

import type { EcosystemPrompt, PromptParams } from '../types.js';
import { validatePrompt, type PromptInput } from '../lib/benchmark.js';
import { ECOSYSTEMS, ecosystemMeta } from '../lib/ecosystem.js';

export interface PromptFormProps {
  onSubmit: (input: PromptInput) => Promise<void>;
  onCancel: () => void;
}

function emptyEntry(): EcosystemPrompt {
  return { prompt: '', params: { negativePrompt: '', cfgScale: undefined, steps: undefined, seed: null } };
}

export function PromptForm({ onSubmit, onCancel }: PromptFormProps): React.JSX.Element {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  // Insertion-ordered ecosystem entries.
  const [entries, setEntries] = useState<Array<{ eco: string; value: EcosystemPrompt }>>([]);
  const [addEco, setAddEco] = useState<string>(ECOSYSTEMS[0].key);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const usedEcos = new Set(entries.map((e) => e.eco));
  const available = ECOSYSTEMS.filter((e) => !usedEcos.has(e.key));

  const addEntry = () => {
    if (usedEcos.has(addEco)) return;
    setEntries((prev) => [...prev, { eco: addEco, value: emptyEntry() }]);
    const next = ECOSYSTEMS.find((e) => e.key !== addEco && !usedEcos.has(e.key));
    if (next) setAddEco(next.key);
  };

  const patchEntry = (eco: string, patch: Partial<EcosystemPrompt>) =>
    setEntries((prev) => prev.map((e) => (e.eco === eco ? { ...e, value: { ...e.value, ...patch } } : e)));

  const patchParams = (eco: string, patch: Partial<PromptParams>) =>
    setEntries((prev) =>
      prev.map((e) => (e.eco === eco ? { ...e, value: { ...e.value, params: { ...e.value.params, ...patch } } } : e)),
    );

  const removeEntry = (eco: string) => setEntries((prev) => prev.filter((e) => e.eco !== eco));

  const submit = async () => {
    const byEcosystem: Record<string, EcosystemPrompt> = {};
    for (const e of entries) byEcosystem[e.eco] = e.value;
    const input: PromptInput = { name, description, byEcosystem };
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

      <Card withBorder padding="md">
        <Group gap={8} align="flex-end">
          <div style={{ flex: 1 }}>
            <Select
              label="Add an ecosystem"
              value={addEco}
              onChange={setAddEco}
              options={available.map((e) => ({ value: e.key, label: e.label }))}
              disabled={available.length === 0}
              data-testid="prompt-add-eco-select"
            />
          </div>
          <Button
            onClick={addEntry}
            disabled={available.length === 0}
            data-testid="prompt-add-eco"
          >
            Add
          </Button>
        </Group>
      </Card>

      {entries.length === 0 && (
        <span style={{ opacity: 0.6 }} data-testid="prompt-no-entries">
          Add a prompt for at least one ecosystem (SDXL, Pony, Flux, …). A combination is benchmarked on
          the entry matching its checkpoint's ecosystem.
        </span>
      )}

      {entries.map(({ eco, value }) => (
        <Card key={eco} withBorder padding="md" data-testid="prompt-eco-entry" data-eco={eco}>
          <Stack gap={10}>
            <Group justify="space-between">
              <Badge>{ecosystemMeta(eco).label}</Badge>
              <Button size="sm" variant="subtle" color="error" onClick={() => removeEntry(eco)} data-testid="prompt-remove-eco">
                Remove
              </Button>
            </Group>
            <Textarea
              label="Prompt"
              required
              value={value.prompt}
              onChange={(e) => patchEntry(eco, { prompt: e.currentTarget.value })}
              placeholder="Positive prompt for this ecosystem"
              data-testid="prompt-text"
              minRows={2}
            />
            <Textarea
              label="Negative prompt"
              value={value.params.negativePrompt ?? ''}
              onChange={(e) => patchParams(eco, { negativePrompt: e.currentTarget.value })}
              data-testid="prompt-negative"
              minRows={1}
            />
            <Group gap={10} wrap>
              <div style={{ width: 110 }}>
                <NumberInput
                  label="CFG"
                  min={1}
                  max={30}
                  step={0.5}
                  value={value.params.cfgScale ?? null}
                  onChange={(v) => patchParams(eco, { cfgScale: v ?? undefined })}
                />
              </div>
              <div style={{ width: 110 }}>
                <NumberInput
                  label="Steps"
                  min={1}
                  max={50}
                  value={value.params.steps ?? null}
                  onChange={(v) => patchParams(eco, { steps: v ?? undefined })}
                />
              </div>
              <div style={{ width: 140 }}>
                <TextInput
                  label="Sampler"
                  value={value.params.sampler ?? ''}
                  onChange={(e) => patchParams(eco, { sampler: e.currentTarget.value || undefined })}
                  placeholder="Euler"
                />
              </div>
              <div style={{ width: 140 }}>
                <NumberInput
                  label="Seed"
                  value={value.params.seed ?? null}
                  onChange={(v) => patchParams(eco, { seed: v })}
                />
              </div>
            </Group>
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
          Submit prompt
        </Button>
      </Group>
    </Stack>
  );
}
