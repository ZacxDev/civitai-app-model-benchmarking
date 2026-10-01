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
import { Alert, Button, Card, Group, Stack, TextInput, Textarea } from '@civitai/blocks-react/ui';

import { metaText, mutedText } from '../theme.js';
import { validateGrid, type GridInput } from '../lib/grids.js';
import { GridPicker, type GridPickerItem } from './GridPicker.js';
import { ContentStep, MetaStep, StepNav, type FormStep } from './FormSteps.js';

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
  /**
   * Two-step CREATE flow: the two axes first, then name + description. FALSE (the
   * default) is the single-page EDIT shape. Set by `App.tsx` from the modal kind,
   * never inferred from `initial` — see `FormSteps.tsx`.
   */
  multiStep?: boolean;
}

/** Which picker is open, if any. */
type PickerState = 'none' | 'matchups' | 'prompts';

/**
 * The CHOSEN rows of one axis, as cards.
 *
 * 🔴 THIS REPLACED "`N` selected", AND THE COUNT IS STILL THE ONE THING IT CANNOT
 * LOSE. A bare count told a viewer nothing they could act on — a grid points at
 * rows OTHER PEOPLE own, so "4 selected" is four decisions you have to reopen the
 * picker to see. The cards name them. The count is kept alongside, because it is
 * what the cap is about (`MAX_GRID_MATCHUPS` / `MAX_GRID_PROMPTS`, both 20) and a
 * list of 20 names is not something you count by eye.
 *
 * 🔴 A SELECTED KEY WITH NO ROW IN `items` IS NORMAL AND IS NAMED, NOT DROPPED.
 * §11.2 calls dangling references normal (the row was withdrawn after the grid was
 * built), and `GridPicker` carries such a key through Save rather than silently
 * truncating. Rendering nothing for it here would contradict that at the one place
 * a viewer could still fix it — so it gets a card that says what happened.
 *
 * ⚠️ THE CARD LIST IS BOUNDED BY THE SAME CAP as the picker, so this is at most 20
 * cards; it needs no windowing (unlike the results matrix, see `lib/virtualRows.ts`).
 */
function MemberBody({ item }: { item?: GridPickerItem }): React.JSX.Element {
  return (
    <Stack gap={2} style={{ minWidth: 0 }}>
      <strong style={{ fontSize: 13 }}>{item?.name ?? 'No longer on the board'}</strong>
      {item?.meta ? <span style={metaText}>{item.meta}</span> : null}
      {item?.description ? <span style={mutedText}>{item.description}</span> : null}
    </Stack>
  );
}

/**
 * 🔴 THE TWO TESTIDS ARE SPELLED OUT AS LITERALS ON THE `Card`, AND THE BRANCH THAT
 * COSTS IS DELIBERATE. The obvious shape — one `Card` with `data-testid={testId}`
 * from a prop — was written first and `renameWireCompat.test.ts` rejected it,
 * correctly: that file's INDIRECT-site ledger exists because a testid arriving
 * through a variable is invisible to its `data-testid="literal"` scan, and the
 * `testId` pass-throughs it DOES allow are only harmless because their literal sits
 * at the call site under `data-testid=`. Mine would have sat under `testId=`, i.e. a
 * genuine new blind spot of the kind that ledger says "must never be" added. So the
 * `Card` shell is written twice and the BODY is shared — the duplication is one
 * attribute, and it buys two production ids the ledger can see.
 */
function AxisCards({
  keys,
  items,
  axis,
}: {
  keys: readonly string[];
  items: readonly GridPickerItem[];
  axis: 'rows' | 'cols';
}): React.JSX.Element | null {
  if (keys.length === 0) return null;
  const byKey = new Map(items.map((i) => [i.key, i]));
  return (
    <Stack gap={6}>
      {keys.map((key) =>
        axis === 'rows' ? (
          <Card key={key} withBorder padding="sm" data-testid="grid-form-row-card">
            <MemberBody item={byKey.get(key)} />
          </Card>
        ) : (
          <Card key={key} withBorder padding="sm" data-testid="grid-form-col-card">
            <MemberBody item={byKey.get(key)} />
          </Card>
        ),
      )}
    </Stack>
  );
}

export function GridForm({
  matchupItems,
  promptItems,
  initial,
  submitLabel = 'Save privately',
  onSubmit,
  onCancel,
  multiStep = false,
}: GridFormProps): React.JSX.Element {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [matchupKeys, setMatchupKeys] = useState<string[]>(initial?.matchupKeys ?? []);
  const [promptKeys, setPromptKeys] = useState<string[]>(initial?.promptKeys ?? []);
  const [picker, setPicker] = useState<PickerState>('none');
  const [step, setStep] = useState<FormStep>('content');
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const input: GridInput = { name, description, matchupKeys, promptKeys };

  /**
   * 🔴 THE `catch` IS THE SAME ONE `MatchupForm` AND `PromptForm` HAVE HAD SINCE
   * THEY SHIPPED, and this form went out without it. `onSubmit` is
   * `saveUnpubGrid`, i.e. `appStorage.set` — which REJECTS on the per-APP 50MB
   * quota (so one viewer at the ceiling breaks it for every viewer), on a >64KB
   * value, and for an anonymous viewer. With only a `finally`, every one of those
   * unspun the button and left the form open with no message, so the viewer's
   * next move is to press Save again against the same refusal. Failures on the
   * private path are reported in the same place validation failures are.
   */
  const handleSubmit = async () => {
    const errs = validateGrid(input);
    setErrors(errs);
    if (errs.length > 0) return;
    setBusy(true);
    try {
      await onSubmit(input);
    } catch (e) {
      setErrors([e instanceof Error ? e.message : 'Failed to save.']);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack gap={12} data-testid="grid-form">
      <ContentStep multiStep={multiStep} step={step}>
        <Stack gap={12}>
          {/* The two axes. Counts are rendered from the CHOSEN key arrays, so what
              the summary says and what a publish would store are the same list. */}
          <Group justify="space-between" align="center" gap={10}>
            <Stack gap={2} style={{ minWidth: 0 }}>
              <strong style={{ fontSize: 14 }}>Matchups</strong>
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
          <AxisCards keys={matchupKeys} items={matchupItems} axis="rows" />

          <Group justify="space-between" align="center" gap={10}>
            <Stack gap={2} style={{ minWidth: 0 }}>
              <strong style={{ fontSize: 14 }}>Prompts</strong>
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
          <AxisCards keys={promptKeys} items={promptItems} axis="cols" />

          {/* Trimmed: the first sentence restated what the two pickers above already
              show. What survives is the claim a viewer cannot derive — what happens when
              somebody else withdraws a member. */}
          <span style={mutedText}>
            If a member is removed from the board later, this grid renders what is left and says how
            much is gone.
          </span>
        </Stack>
      </ContentStep>

      <MetaStep multiStep={multiStep} step={step}>
        <Stack gap={12}>
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
        </Stack>
      </MetaStep>

      {/* 🔴 OUTSIDE BOTH STEPS — `validateGrid` runs over the whole input, so an error
          raised on step 2 can be about step 1's axes ("Pick at least one matchup"). */}
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
        {multiStep && (
          <StepNav step={step} onNext={() => setStep('meta')} onBack={() => setStep('content')} />
        )}
        {(!multiStep || step === 'meta') && (
          <Button size="sm" loading={busy} onClick={handleSubmit} data-testid="grid-form-submit">
            {submitLabel}
          </Button>
        )}
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
