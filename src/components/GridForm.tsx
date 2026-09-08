// Build a GRID: a name, a description, and the two member axes picked with
// `GridPicker` (spec §11.2).
//
// 🔴 THIS FORM WRITES NOTHING. It raises `onSubmit(GridInput)` and the caller
// decides which store that lands in — which, for a grid, is always the PER-VIEWER
// one first: a grid is built privately under `unpub:grid:v1:` and Publish is the
// separate, explicit step that copies it onto the public board. There is no
// direct-to-board create path, so this form cannot be the thing that makes a grid
// public.
//
// 🔴 VALIDATION IS `validateGrid`, IMPORTED. The cap and the "needs a row / needs
// a column" rules are §11.2's, and they live in `lib/grids.ts`; re-deriving them
// here would be a second copy that stops tracking the first.

import { useState } from 'react';
import { Alert, Button, Group, Stack, TextInput, Textarea } from '@civitai/blocks-react/ui';

import { metaText, mutedText } from '../theme.js';
import { validateGrid, type GridInput } from '../lib/grids.js';
import { GridPicker, type GridPickerItem } from './GridPicker.js';

export interface GridFormProps {
  /** Every matchup on the board, as pickable rows. */
  matchupItems: readonly GridPickerItem[];
  /** Every prompt on the board, as pickable rows. */
  promptItems: readonly GridPickerItem[];
  /** Prefill (edit-in-place): the stored grid as a builder input. */
  initial?: GridInput;
  /** Submit button label (defaults to "Save privately"). */
  submitLabel?: string;
  onSubmit: (input: GridInput) => Promise<void> | void;
  onCancel: () => void;
}

/** Which picker is open, if any. */
type PickerState = 'none' | 'matchups' | 'prompts';

export function GridForm({
  matchupItems,
  promptItems,
  initial,
  submitLabel = 'Save privately',
  onSubmit,
  onCancel,
}: GridFormProps): React.JSX.Element {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [matchupKeys, setMatchupKeys] = useState<string[]>(initial?.matchupKeys ?? []);
  const [promptKeys, setPromptKeys] = useState<string[]>(initial?.promptKeys ?? []);
  const [picker, setPicker] = useState<PickerState>('none');
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const input: GridInput = { name, description, matchupKeys, promptKeys };

  const handleSubmit = async () => {
    const errs = validateGrid(input);
    setErrors(errs);
    if (errs.length > 0) return;
    setBusy(true);
    try {
      await onSubmit(input);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack gap={12} data-testid="grid-form">
      <TextInput
        label="Grid name"
        value={name}
        onChange={(e) => setName(e.currentTarget.value)}
        data-testid="grid-form-name"
      />
      <Textarea
        label="Description"
        value={description}
        onChange={(e) => setDescription(e.currentTarget.value)}
        data-testid="grid-form-description"
      />

      {/* The two axes. Counts are rendered from the CHOSEN key arrays, so what
          the summary says and what a publish would store are the same list. */}
      <Group justify="space-between" align="center" gap={10}>
        <Stack gap={2} style={{ minWidth: 0 }}>
          <strong style={{ fontSize: 14 }}>Rows (matchups)</strong>
          <span style={metaText} data-testid="grid-form-rows-count">
            {matchupKeys.length} selected
          </span>
        </Stack>
        <Button
          size="sm"
          variant="light"
          onClick={() => setPicker('matchups')}
          data-testid="grid-form-pick-rows"
        >
          Choose rows
        </Button>
      </Group>

      <Group justify="space-between" align="center" gap={10}>
        <Stack gap={2} style={{ minWidth: 0 }}>
          <strong style={{ fontSize: 14 }}>Columns (prompts)</strong>
          <span style={metaText} data-testid="grid-form-cols-count">
            {promptKeys.length} selected
          </span>
        </Stack>
        <Button
          size="sm"
          variant="light"
          onClick={() => setPicker('prompts')}
          data-testid="grid-form-pick-cols"
        >
          Choose columns
        </Button>
      </Group>

      <span style={mutedText}>
        A grid points at rows other people own. If one of them is removed from the board later, this
        grid keeps working — it renders what is left and says how much is gone.
      </span>

      {errors.length > 0 && (
        <Alert color="error" data-testid="grid-form-errors">
          <Stack gap={2}>
            {errors.map((e) => (
              <span key={e}>{e}</span>
            ))}
          </Stack>
        </Alert>
      )}

      <Group justify="flex-end" gap={8}>
        <Button size="sm" variant="subtle" onClick={onCancel} data-testid="grid-form-cancel">
          Cancel
        </Button>
        <Button size="sm" loading={busy} onClick={handleSubmit} data-testid="grid-form-submit">
          {submitLabel}
        </Button>
      </Group>

      <GridPicker
        opened={picker === 'matchups'}
        axis="matchups"
        items={matchupItems}
        selected={matchupKeys}
        onConfirm={(keys) => {
          setMatchupKeys(keys);
          setPicker('none');
        }}
        onCancel={() => setPicker('none')}
        data-testid="grid-pick-rows"
      />
      <GridPicker
        opened={picker === 'prompts'}
        axis="prompts"
        items={promptItems}
        selected={promptKeys}
        onConfirm={(keys) => {
          setPromptKeys(keys);
          setPicker('none');
        }}
        onCancel={() => setPicker('none')}
        data-testid="grid-pick-cols"
      />
    </Stack>
  );
}
