// The TWO-STEP scaffolding shared by all three "New X" create forms: step 1 is
// the CONTENT (the models, the prompt text, the grid's two axes), step 2 is the
// TITLE AND DESCRIPTION.
//
// 🔴 CREATE ONLY. An EDIT form stays a SINGLE PAGE, and that is an operator
// decision rather than an accident of implementation: an editor arrives knowing
// what the record is and usually wants one field, so paging them through content
// they are not changing in order to reach a name is pure friction. The forms
// therefore take an explicit `multiStep` prop which `App.tsx` sets from the modal
// kind — NOT an inference from `initial` being undefined, which is wrong for the
// private paths (a new private matchup has no `initial` either, and a resumed one
// does, but both are decided by `modal.existing`).
//
// 🔴 IN SINGLE-PAGE MODE NO STEP WRAPPER IS EMITTED AT ALL — `<>{children}</>`,
// not a wrapper with a hidden attribute. That is what makes the paired assertion
// in the tests non-vacuous: `form-step-content` / `form-step-meta` / `form-next`
// are ABSENT from an edit form, so a test can read the absence off the DOM rather
// than off a prop nobody renders. A wrapper that always rendered and merely
// changed an attribute would be satisfied by an implementation that ignored
// `multiStep` entirely.
//
// 🔴 THE TESTIDS ARE NOUN-NEUTRAL (`form-step-content`, not
// `matchup-form-step-content`) AND THAT IS DELIBERATE, FOR TWO REASONS. One: the
// step mechanism is one rule, so it gets one set of names — three noun-spelled
// triples would be three things to keep in step. Two: `renameWireCompat.test.ts`
// keeps a literal ledger of every `matchup`-spelled production testid and asserts
// its exact length, so a noun-spelled id here would be ledger churn for a control
// that has nothing to do with the matchup/combination rename. Only ONE modal is
// open at a time, so the ids stay unambiguous in the document.
//
// 🔴 AND THEY ARE LITERALS IN THE MARKUP rather than values threaded through a
// prop or chosen by a ternary. That scan reads the testid ATTRIBUTE out of RAW
// SOURCE, matching only a double-quoted literal spelled inline; an id that arrives
// via a variable or an expression is invisible to it, which is the blind spot that
// whole file is built against. One wrapper picking between the two ids with a
// conditional would have been exactly that — two production ids the ledger cannot
// see — so there are two components instead, each spelling its own.
//
// ⚠️ AND FOR THE SAME REASON NOTHING BELOW WRITES THE ATTRIBUTE IN PROSE. The scan
// does not skip comments, so an attribute-shaped example in a docblock is read as a
// RENDERED id: a quoted one invents a testid that exists nowhere, and a braced one
// counts as an indirect site against a ledger that pins their exact number. Both
// shapes were written here first and both turned that file red.

import { Button } from '@civitai/blocks-react/ui';

/** Which page of a two-step create form is showing. */
export type FormStep = 'content' | 'meta';

export interface FormStepProps {
  /** False for an EDIT form: both sections render on one page, unwrapped. */
  multiStep: boolean;
  /** The step currently showing. Ignored when `multiStep` is false. */
  step: FormStep;
  children: React.ReactNode;
}

/**
 * Step 1 — the content the record is ABOUT (models / prompt text / grid axes).
 *
 * Renders its children bare in single-page mode, inside the step-1 wrapper on
 * step 1, and nothing at all on step 2.
 */
export function ContentStep({ multiStep, step, children }: FormStepProps): React.JSX.Element | null {
  if (!multiStep) return <>{children}</>;
  if (step !== 'content') return null;
  return <div data-testid="form-step-content">{children}</div>;
}

/**
 * Step 2 — the TITLE and DESCRIPTION. Always shown for a new record (operator
 * decision: it is never conditional on what step 1 collected), never a step of
 * its own for an edit.
 */
export function MetaStep({ multiStep, step, children }: FormStepProps): React.JSX.Element | null {
  if (!multiStep) return <>{children}</>;
  if (step !== 'meta') return null;
  return <div data-testid="form-step-meta">{children}</div>;
}

export interface StepNavProps {
  /** The step currently showing. */
  step: FormStep;
  /** Advance to step 2. */
  onNext: () => void;
  /** Return to step 1. */
  onBack: () => void;
}

/**
 * The one step-navigation control, in the form's footer next to Cancel.
 *
 * 🔴 ONE BUTTON AT A TIME, BY STEP — "Next" on step 1 and "Back" on step 2. The
 * submit button is the form's own and is rendered only on step 2, so step 1 can
 * never submit a record with no name; that split lives at the call site because
 * each form owns its own submit label and testid.
 */
export function StepNav({ step, onNext, onBack }: StepNavProps): React.JSX.Element {
  return step === 'content' ? (
    <Button variant="light" onClick={onNext} data-testid="form-next">
      Next
    </Button>
  ) : (
    <Button variant="subtle" onClick={onBack} data-testid="form-back">
      Back
    </Button>
  );
}
