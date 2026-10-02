// The results matrix: included CONFIGS (rows, grouped under their combination) ×
// included PROMPTS (columns). Each row is one benchmarkable config (a checkpoint
// + its LoRA stack); rows sharing a combination are visually grouped (a heavier
// separator + the combo name on the first row of the group). Each cell shows
// that config's published outputs on that prompt so models compare side-by-side
// on identical prompts. The matrix layout itself is HAND-ROLLED (a CSS grid with
// sticky headers) — too bespoke for the /ui pack (per rule 112) — but every atom
// (Button/Badge/Card/Loader) and the gated cell come from the pack, styled off
// the pack's `--civitai-*` theme tokens + the app palette so it reads as one system.
//
// 🔴 THE ROWS ARE WINDOWED. `MAX_CONFIGS` is 100 and a grid holds up to 20
// matchups × 20 prompts, so the worst-case matrix is 2,000 rows / 40,000 cells —
// and every cell is a potential Buzz spend whose filled form issues a gated image
// read. Only the rows near the viewport are mounted; two full-width spacers stand
// in for the rest so the scroll extent does not change. The windowing DECISION is
// the pure `rowWindow()` in `lib/virtualRows.ts` (unit-tested with literal values
// in the `node` project); this file only measures and renders. See `useRowWindow`.

import { useEffect, useState } from 'react';

import { Button, Loader } from '@civitai/blocks-react/ui';
import { Image } from '@civitai/components-react';

import type { Palette } from '../theme.js';
import { token, radius, metaText, elevate } from '../theme.js';
import type { CellRun, PromptRow, ResultRow } from '../types.js';
import {
  cellKey,
  configLabel,
  indexResultsByCell,
  type BenchConfig,
} from '../lib/benchmark.js';
import { ecosystemForBaseModel, ecosystemMeta } from '../lib/ecosystem.js';
import {
  DEFAULT_OVERSCAN,
  ROW_H_ESTIMATE,
  rowWindow,
  sameWindow,
  type RowWindow,
} from '../lib/virtualRows.js';
import { EmptyState } from './EmptyState.js';
import type { GatedCellComponent } from './GatedCell.js';

export interface ResultsGridProps {
  /** Flattened, benchmarkable config rows (grouped under their combination). */
  configs: BenchConfig[];
  prompts: PromptRow[];
  results: ResultRow[];
  runs: Record<string, CellRun>;
  c: Palette;
  /** The viewer's total spendable Buzz (blue+green+yellow), or `null` when the
   * balance is unknown. Confirm is disabled unless the estimated cost fits. */
  buzzTotal: number | null;
  /**
   * `true` while a balance read is in flight. Splits the `null` above into "not
   * back yet" and "came back with nothing", which are different sentences — and
   * it is what keeps the retry affordance from appearing before there is
   * anything to retry.
   */
  buzzBalanceLoading?: boolean;
  /**
   * Re-request the viewer's balance (`useBuzzBalance().refetch`). The balance
   * hook fetches ONCE on mount, so without this a single failed or raced read is
   * permanent until a full page reload — the operator's actual cure. Optional so
   * the component still renders in tests/fixtures that do not wire it; the
   * affordance simply does not appear.
   */
  onRetryBalance?: () => void;
  /**
   * `true` when the grid these cells belong to is one of the viewer's OWN PRIVATE
   * grids (per-viewer KV, no shared row) rather than a published or the system one.
   *
   * 🔴 IT GATES NO MONEY BEHAVIOUR: the run, the claim, the spend, the publish and the
   * result row's key are byte-identical either way, because a result row is not
   * grid-scoped. Anything here that branched on it in the run path would be a second
   * money path, and there is deliberately only one.
   *
   * 🔴 WHAT IT DOES GATE IS TWO PIECES OF COPY, AND THE DOCBLOCK USED TO SAY "only ever
   * adds a sentence", which was one short. It selects {@link PRIVATE_GRID_RUN_NOTICE} on
   * the confirm path, and it selects the EMPTY STATE: a grid assembled out of the
   * viewer's own drafts resolves to no rows and no columns, and the system-grid empty
   * state ("Submit and vote to fill the top slots", plus a button opening the public
   * matchup form) told that viewer to go and make a NEW matchup when what they owe is a
   * publish. See {@link PRIVATE_GRID_EMPTY_BODY}.
   *
   * 🔴 REQUIRED, NOT OPTIONAL-DEFAULTING-TO-FALSE, for the reason `GridsView.results`
   * records about its own prop: the forgetful case degrades SILENTLY and in the unsafe
   * direction — a viewer on a private grid who is never told the outputs go public.
   * A fixture that omits it fails to compile instead.
   */
  privateGrid: boolean;
  GatedCell: GatedCellComponent;
  onRunCell: (config: BenchConfig, prompt: PromptRow) => void;
  onConfirmRun: (config: BenchConfig, prompt: PromptRow) => void;
  /** Resume-poll a stalled cell's existing workflow (no re-submit, no re-charge). */
  onResumeRun: (config: BenchConfig, prompt: PromptRow) => void;
  onCancelRun: (config: BenchConfig, prompt: PromptRow) => void;
  /**
   * Open the matchup submit form — the next step when the grid has no rows.
   *
   * 🔴 IT USED TO JUMP TO A TAB. The app had a top-level tab strip and this
   * called `setView('combos')`, which landed the viewer on a list and left them to
   * find the Submit button. The strip is gone (one page now), and the tab jump was
   * only ever a way of reaching the submit modal — so it opens the modal.
   */
  onAddCombination?: () => void;
  /** Open the prompt submit form — the next step when the grid has no columns. */
  onAddPrompt?: () => void;
  /**
   * Open the MATCHUP DETAIL for a group — fired by the group band, and by nothing
   * else.
   *
   * 🔴 THE BAND, NOT THE ROW HEADER. A config row (`grid-row-header` /
   * `grid-config-label`) is deliberately INERT: a row is one checkpoint+LoRA setup
   * inside the matchup, not the matchup, and wiring the whole header would make
   * every row a link to its parent — which is not what was asked for and reads as
   * a misfire to anyone aiming at the config label. There is a negative-control
   * test asserting a config-label click fires NOTHING.
   *
   * 🔴 REQUIRED — see `onOpenPrompt` for why both of these stopped being optional.
   */
  onOpenMatchup: (comboKey: string) => void;
  /**
   * Open the PROMPT DETAIL for a column — fired by the column header.
   *
   * 🔴 REQUIRED, AND SO IS `onOpenMatchup`, WHICH DELETED ~40 LINES OF PRODUCTION
   * BRANCH. `ColumnHeader` and `GroupBand` each used to render a plain `<div>` when
   * no handler was wired, "so a dead control is never rendered". Production never
   * reached either branch: `App.tsx` is the single call site and has always passed
   * both. The branch existed for fixtures that declined to pass a prop, and one test
   * asserted the inert shape. Making the props required makes "never a dead control"
   * true BY CONSTRUCTION rather than by a branch nothing exercises — and a fixture
   * that forgets a handler now fails to compile instead of quietly rendering a
   * different element than production does.
   */
  onOpenPrompt: (promptKey: string) => void;
}

/**
 * The FLOOR on a prompt column, in px — a `minmax()` lower bound, not a width.
 *
 * 🔴 IT USED TO BE THE WIDTH (`CELL_W = 200`, fed to `repeat(n, 200px)`), and the
 * change from a fixed track to `minmax(CELL_MIN_W, 1fr)` is the whole of operator
 * feedback #3: on a wide screen a fixed 200px cell left the matrix as a narrow
 * ribbon against acres of empty page, and the images inside it — the thing the app
 * exists to compare — rendered at 200px whatever the viewport.
 *
 * 🔴 WHY 200 IS THE FLOOR, AND NOT A ROUNDER OR SMALLER NUMBER. It is the width the
 * matrix has always shipped at, so at and below the point where the floor binds
 * (i.e. every narrow viewport) the layout is UNCHANGED — the responsive change can
 * only ever make a cell wider, never narrower, which is what keeps the ≤720px
 * scroll story below exactly as it was measured. It is also the width every cell's
 * contents were laid out against: the publish preview strip is
 * `repeat(min(urls, 2), 1fr)`, so 200 is two ~98px thumbnails plus the gap, and the
 * confirm gate's warning copy (`BALANCE_UNKNOWN_MESSAGE` and friends) wraps to a
 * readable measure at that width and not much less. Lowering it would let a busy
 * board squeeze cells below both of those; raising it would widen the narrow-
 * viewport scroll distance for no gain, since `1fr` already takes the slack.
 *
 * ⚠️ NOTHING IN THIS REPO CAN SEE THE RESULT. jsdom resolves no grid, so the tests
 * pin the emitted `grid-template-columns` STRING and nothing about how wide a cell
 * comes out. A live reading is owed — and note that a responsive matrix is exactly
 * what invalidates a fixed-viewport capture recipe: the store-listing crop for this
 * app assumes a stable cell width and must be re-measured.
 */
const CELL_MIN_W = 200;

/**
 * The CEILING on a prompt column, in px. The other half of the `minmax()`.
 *
 * 🔴 IT EXISTS BECAUSE `1fr` HAS NO UPPER BOUND AND A SPARSE GRID IS PUBLISHABLE.
 * `validateGrid` requires only ONE prompt, so a published 1-prompt grid is legal;
 * with `1fr` its single column took the entire remaining width, and the
 * publish-preview strip inside it blew two thumbnails to ~1150px each on a 2560px
 * monitor. That is the opposite extreme from the 200px ribbon the responsive change
 * was made to fix, and a round-1 audit found it — no test could, because jsdom
 * resolves no grid.
 *
 * 🔴 A CEILING IS NOT A RETURN TO A FIXED TRACK. The cell still grows 200 -> 420,
 * so the operator's ask ("make the grid images larger") is delivered at every
 * viewport that has the room; what it stops is the UNBOUNDED case. Past the
 * ceiling the matrix left-aligns and the page keeps its margin, rather than one
 * column stretching to fill a monitor.
 *
 * ⚠️ 420 IS A JUDGEMENT, NOT A MEASUREMENT, and nothing here can measure it — jsdom
 * performs no layout. It is ~2.1x the old fixed width, which is a visible increase
 * without being a poster. The live reading owed for this change should look at the
 * case that bites: FEW PROMPTS on a WIDE viewport, not a wide viewport generally.
 */
const CELL_MAX_W = 420;
const ROW_H_HEADER = 56;

/**
 * The matrix's corner cell — the label that names what the two axes ARE.
 *
 * 🔴 PINNED AS A WHOLE NORMALISED STRING BY A TEST, including the multiplication
 * sign. It read `configs × prompts` until the IA refactor, which is the app's
 * INTERNAL word: a viewer submits and votes on *matchups*, every other surface
 * says matchup, and the corner of the primary object said something else. A
 * keyword guard on the word would be walkable by a reword (this repo has been
 * bitten by exactly that — see `manifest.test.ts`'s description guard), so the
 * test pins the whole string and asserts the U+00D7 MULTIPLICATION SIGN
 * explicitly: a plain ASCII `x` must fail.
 */
export const GRID_CORNER_LABEL = 'matchups × prompts';

/**
 * Viewer-facing copy for the `'unknown'` cell state — a persisted in-flight claim
 * that carries no workflowId (see `InflightRun`).
 *
 * 🔴 IT MUST NOT SAY "nothing was spent", which is the opposite of what the
 * claim-refused copy says and deliberately so. A claim that failed to write means
 * the run never started; a claim that WROTE and then went quiet means the submit
 * may well have succeeded with only the response lost. Telling a viewer that
 * definitely failed is precisely what sends them back to Run and into a real
 * second charge. So this names the one action that actually resolves it.
 *
 * Lives here rather than in `App.tsx` only to keep the import acyclic — App
 * imports this component.
 */
export const RUN_UNKNOWN_MESSAGE =
  'Unknown — this run may already have started. Check your generations before re-running.';

/**
 * Viewer-facing copy for the `'publishing'` cell state — shown next to the
 * outputs while the HOST's own confirm dialog is open.
 *
 * 🔴 IT NAMES THE HOST'S DIALOG IN THE HOST'S OWN WORDS. The confirm is titled
 * "Publish to the shared grid?" (civitai `PageBlockHost.tsx`, the
 * `PUBLISH_GENERATION_OUTPUTS` handler) and is rendered OUTSIDE this iframe, so
 * the only way the block can connect the images it is showing to the question
 * being asked over them is to quote the title. Reword the host and this line is
 * wrong — which is why the guard pins the whole string rather than a keyword.
 */
export const PUBLISH_CONFIRM_MESSAGE =
  'These are your outputs. Confirm the “Publish to the shared grid?” prompt to add them.';

/**
 * How many outputs the pre-publish preview renders. A grid CELL is small and the
 * point is recognition, not review — and `publish()` sends no `imageIndexes`, so
 * every output is published whether or not it is one of the ones shown. The
 * count is capped rather than the strip being scrollable because a horizontal
 * scroller inside a grid cell is a worse answer than "the first few".
 *
 * 🔴 THE CAP IS NOT REACHED TODAY — KEPT ON PURPOSE, DON'T "CLEAN IT UP". Traced
 * statically (see the header of `src/publishPreview.test.tsx` for the full
 * chain): a cell run yields at most ONE url, so `hidden` below is always 0 and
 * the `cell-publish-more` line never renders in production. TWO independent host
 * caps put it there — the block workflow translator rejects anything that is not
 * exactly one step, and `quantity` is absent from `buildCellWorkflowBody` so the
 * host's schema defaults it to 1 (ceiling 4 even if it were passed, which would
 * still leave `hidden` at 0). Reaching this branch needs a change in
 * `civitai/civitai`, not here.
 *
 * It stays because the ONE link in that chain that is not closed by a static
 * guard is the orchestrator itself — an external service in neither repo — and
 * the host's flattening of `steps[].output.images[]` is uncapped. If it ever
 * over-delivers, this branch is exactly the disclosure that keeps the viewer
 * from under-counting what they are agreeing to publish; deleting it would make
 * that case silent. Unreachable-and-harmless beats a deletion resting on an
 * external contract nobody in this repo can assert.
 */
export const PUBLISH_PREVIEW_MAX = 4;

/**
 * Viewer-facing copy for a balance the app COULD NOT READ, as distinct from one
 * it read and found too small.
 *
 * 🔴 THIS COPY EXISTS BECAUSE THE APP USED TO ASSERT THE OTHER ONE. The confirm
 * cell's warning was a two-way ternary on `costKnown`, so an unknown BALANCE
 * against a known cost rendered "Insufficient Buzz balance" — a statement about
 * a number the app did not have. That is the operator's report ("on re-submit it
 * said 'insufficient buzz', after full page reload it worked"): the reload was
 * not topping anything up, it was re-running the balance hook's one mount fetch.
 * A claim the app cannot support is worse than no claim, because it sends the
 * viewer to a top-up page to fix a problem they do not have.
 *
 * It names the ACTION, not the failure, because the failure is not the viewer's
 * to interpret — and the retry beside it is what makes the sentence true.
 */
export const BALANCE_UNKNOWN_MESSAGE = 'Your Buzz balance could not be read, so this run is held.';

/** Viewer-facing copy while a balance read is still in flight — not a failure yet. */
export const BALANCE_LOADING_MESSAGE = 'Checking your Buzz balance…';

/**
 * Viewer-facing copy on the confirm path for a cell reached from a grid that is still
 * PRIVATE — i.e. one of the viewer's own unpublished grids, opened so it can be
 * generated into before it is published.
 *
 * 🔴 IT EXISTS BECAUSE THE GRID'S "Private" BADGE IS TRUE AND WOULD OTHERWISE BE READ
 * AS COVERING THE OUTPUTS. It does not.
 *
 * ━━━ 🔴 THIS IS THE THIRD RATIONALE FOR THIS SENTENCE. TWO WERE REFUTED. ━━━
 *
 * Read both before editing either the string or this docblock. A fourth writer reaching
 * for a better-sounding reason is exactly how the first two were produced.
 *
 *   ⚠️ REFUTED #1 — "irreversible, because `update`/`withdraw` are author-scoped and
 *   there is no merge". BACKWARDS. `lib/sdk-runtime.ts` documents `withdraw` as "Delete
 *   a row the viewer authored", and the viewer authors their own result rows — so
 *   author-scoping is precisely what would PERMIT removal, not forbid it. (No control in
 *   this app withdraws a result row today, which is a fact about the UI and NOT the
 *   data-model claim the sentence was making.)
 *
 *   ⚠️ REFUTED #2 — "right away and permanently, because the run's publish step is an
 *   unconditional `publish({ workflowId })`". The CALL SITE is unconditional; the PUBLISH
 *   is not. Three reachable branches in `App.tsx`'s `driveToResult` end with no images on
 *   the board: a workflow that goes terminal non-`succeeded` (the Buzz is spent and
 *   nothing is published), the `publish()` call itself — which is HOST-CONSENT-GATED, so
 *   a refusal or a consent timeout rejects into the `catch` and the cell lands `failed` —
 *   and the `imageIds.length > 0` guard before the `shared.append`. So "right away" is
 *   false even on the happy path: there is a SECOND human confirm after generation.
 *
 * 🔴 SO BOTH CLAUSES ARE DELETED RATHER THAN RE-ARGUED. "Permanently" could not be
 * established and is gone; "right away" was false and is replaced by the confirm it
 * concealed. No replacement reason was sought for either — "I could not establish this"
 * is the finding, and a reason found under pressure to supply one is a hypothesis.
 *
 * 🔴 WHAT EACH SURVIVING CLAUSE RESTS ON, and nothing is in the string that is not here:
 *
 *   - "that does not cover its cells’ images" — the grid record lives in per-viewer KV
 *     and says nothing about any result row;
 *   - "stored against the matchup and the prompt — not against this grid" — a result
 *     row's key is `result:${comboKey}·${configId}×${promptKey}` (`buildResultPayload`
 *     in `lib/benchmark.ts`), which names no grid;
 *   - "every grid that contains the cell shows them to every viewer" — the row is on the
 *     shared board, so every viewer's scan reads it, and every grid whose members make
 *     that cell renders it;
 *   - "If the run succeeds you will be asked to confirm publishing them there" — the
 *     `publish()` host dialog above, reached only from the `terminal.status ===
 *     'succeeded'` branch. Independently confirmed against
 *     `@civitai/blocks-react/dist/hooks/usePublishGenerationOutputs.d.ts`, which calls
 *     it "CONSENT-GATED, SO IT WAITS ON A PERSON" and documents a rejection on the
 *     consent timeout.
 *
 * ⚠️ ONE BOUND ON THAT LAST CLAUSE, STATED RATHER THAN HIDDEN: `driveToResult` returns
 * BEFORE the dialog when `cellHasResult` finds the cell already published — a racer or a
 * prior session got there first. The viewer is then not asked, and nothing of theirs is
 * published. The sentence errs toward warning in that window, which is the safe direction
 * for a privacy notice, and it is a race a confirm panel on an EMPTY cell reaches rarely.
 *
 * 🔴 PINNED AS A WHOLE STRING by `src/gridOpenPrivate.test.tsx`. A keyword guard on
 * "public" is walkable by a reword that quietly puts a refuted clause back.
 */
export const PRIVATE_GRID_RUN_NOTICE =
  'This grid is private, but that does not cover its cells’ images. A cell’s outputs ' +
  'are stored against the matchup and the prompt — not against this grid — so once they ' +
  'reach the shared board, every grid that contains the cell shows them to every ' +
  'viewer, whether or not you ever publish this one. If the run succeeds you will be ' +
  'asked to confirm publishing them there.';

/**
 * The empty-state copy for an open grid that is still PRIVATE and resolves to no cells.
 *
 * 🔴 IT EXISTS BECAUSE THE SYSTEM-GRID EMPTY STATE WAS A DEAD END WITH THE WRONG WORDS,
 * in the state this feature is MOST LIKELY TO BE FIRST SEEN IN. A viewer assembles a grid
 * from the matchups and prompts they are still drafting; none of those has a row on the
 * board, so `resolveOpenGrid` yields 0 × 0 and the matrix is empty. What rendered there
 * was "No benchmark grid yet / …Submit and vote to fill the top slots" plus a **Submit a
 * matchup** button opening the PUBLIC submit form — i.e. the viewer who had just built a
 * grid was told it was empty and sent to author a new matchup, when the next step is to
 * publish the members they already have.
 *
 * 🔴 AND IT CARRIES NO BUTTON, DELIBERATELY. The next step is on another surface (My
 * Benchmarks ▸ Matchups / Prompts) and `ResultsGrid` has no callback that reaches it —
 * the two it has open the public submit modals, which is the wrong action. A wrong button
 * is worse than none; the step is named in words instead. Wiring a real one means a new
 * prop threaded from `App`, which is a separate change.
 *
 * ⚠️ IT NAMES NO AXIS, WHICH THE PUBLIC COPY DOES. The public branch distinguishes "no
 * rows" from "no columns" because the two have different submit forms; here the remedy is
 * the same for both, and `grid-open-members` above already states the resolved shape
 * ("0 matchups × 0 prompts"). That is the trade, not an omission.
 *
 * ⚠️ AND THE RULE CLAUSE IS ABOUT ROWS THE APP HAS *READ*, not about rows that exist. On a
 * board over `listAll`'s page cap a member's row may be unread rather than absent — the
 * same correction `privateGridShortfall` carries, for the same reason. The sentence stays
 * true on a truncated scan.
 *
 * 🔴 ⚠️ THE FIRST DRAFT OF THIS BODY WAS FALSE AND IS RETRACTED HERE RATHER THAN QUIETLY
 * REPLACED — written in the same round that corrected two other people's rationales, which
 * is the point of recording it. It ended "Publish your own private matchups and prompts
 * from My Benchmarks, and they will appear in this grid." They do NOT. A private grid
 * stores its members as BARE LOCAL IDS (`App`'s `matchupPickerItems` uses
 * `key: d.localId`), `resolveMemberRows` matches those against board rows BY KEY, and
 * publishing a member on its own mints a NEW host-minted key while the grid still names
 * the old local id. Nothing on the open-grid path rewrites it: the local-id → shared-key
 * rewrite lives in `lib/gridCascade.ts` and runs only on the GRID publish. Measured by
 * `lib/gridEntries.test.ts`'s "a member-only publish does not rescue the reference" case,
 * which is the guard this retraction left behind.
 *
 * 🔴 SO THE TWO REMEDIES NAMED ARE THE TWO THAT WORK, and both are traceable: publishing
 * the GRID cascades through `planGridCascade` (publish the private members first, then
 * `rewriteGridMembers` through the `resolved` map), and editing the grid to name board
 * members needs no rewrite at all. "Publish the member" is deliberately NOT offered.
 */
export const PRIVATE_GRID_EMPTY_TITLE = 'This grid has no cells yet';
export const PRIVATE_GRID_EMPTY_BODY =
  'A matchup or a prompt becomes a row or a column here only once the app has read its ' +
  'row off the shared board. Publishing the grid is what publishes its private members ' +
  'and repoints it at them — or edit the grid to name matchups and prompts that are ' +
  'already on the board.';

/**
 * The confirm gate, as ONE three-valued decision instead of a boolean plus a
 * ternary that disagreed with it.
 *
 * 🔴 THE DEFECT THIS REPLACES WAS THE DISAGREEMENT, not either half. `affordable`
 * correctly required BOTH a known cost and a known balance (fail-closed); the
 * copy beside it branched on the cost alone, so the two states the boolean
 * distinguishes were collapsed into one sentence — and the sentence chosen was
 * the one the app had no evidence for. Deriving the copy AND the disabled state
 * from a single discriminant makes that disagreement unrepresentable.
 *
 * ORDER IS LOAD-BEARING: an unknown cost outranks an unknown balance, because
 * with no price the balance cannot settle anything. Both-unknown therefore reads
 * "Cost unavailable" — which is also what shipped before, so this is not a
 * behaviour change for that case.
 */
export type ConfirmGate = 'ok' | 'cost-unknown' | 'balance-unknown' | 'insufficient';

export function confirmGate(cost: number | undefined, buzzTotal: number | null): ConfirmGate {
  if (typeof cost !== 'number') return 'cost-unknown';
  if (buzzTotal == null) return 'balance-unknown';
  return cost <= buzzTotal ? 'ok' : 'insufficient';
}

/**
 * ROW WINDOWING — which config rows are mounted, as a function of where the
 * document is scrolled. Returns `[window, setHost]`, where `setHost` is a
 * CALLBACK REF to put on the grid container whose top the offset is measured from.
 *
 * 🔴 ALL THE ARITHMETIC IS IN `lib/virtualRows.ts`, AND DELIBERATELY SO. This hook
 * only MEASURES (`getBoundingClientRect().top`, `window.innerHeight`) and
 * re-renders; the decision is a pure function with a `node`-project unit test
 * carrying literal expected values. jsdom resolves no layout, so a decision that
 * lived in here would be unobservable except through its effects — and this repo
 * has already shipped a dead placeholder behind exactly that blind spot (see the
 * header of `virtualRows.ts`, and `useNearViewport` in `GridPreview.tsx`).
 *
 * 🔴 THE HOST ELEMENT IS HELD IN STATE, NOT A `useRef` — the same fix as
 * `useNearViewport`. A ref object never changes identity, so an effect keyed on it
 * runs once and can never see the element ARRIVE on a later render. The grid
 * container is behind the empty-state early return, so "arrives later" is the
 * ordinary case here: an empty board that gains its first matchup mounts this
 * container on a render where the hook has already run.
 *
 * ⚠️ THE OFFSET IS MEASURED FROM THE CONTAINER TOP, WHICH INCLUDES THE HEADER ROW,
 * so `ROW_H_HEADER` is subtracted to get the offset into the row band. Both that
 * and `ROW_H_ESTIMATE` are estimates; `DEFAULT_OVERSCAN` rows each side absorb the
 * error. There is no vertical scroll container — the matrix scrolls with the
 * DOCUMENT (the outer box scrolls only horizontally) — so the listener is on
 * `window`, and `scroll` is bound with `passive: true` because the handler never
 * calls `preventDefault`.
 *
 * ⚠️ NOTHING IN THIS REPO VERIFIES THE RESULTING SCROLL BEHAVIOUR. jsdom fires no
 * scroll, lays nothing out, and returns 0 from every rect — so in tests this hook
 * yields the fallback window and stays there. What the tests CAN see is that the
 * window is BOUNDED (far fewer cells mount than the matrix has); whether it tracks
 * a real scroll needs a human in a real browser.
 */
function useRowWindow(rowCount: number): [RowWindow, (el: HTMLElement | null) => void] {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [win, setWin] = useState<RowWindow>(() =>
    rowWindow({
      rowCount,
      rowHeight: ROW_H_ESTIMATE,
      viewportHeight: typeof window === 'undefined' ? 0 : window.innerHeight,
      scrollTop: 0,
      overscan: DEFAULT_OVERSCAN,
    }),
  );

  useEffect(() => {
    const measure = (): void => {
      const top = host ? host.getBoundingClientRect().top : 0;
      const next = rowWindow({
        rowCount,
        rowHeight: ROW_H_ESTIMATE,
        viewportHeight: window.innerHeight,
        // `-top` is how far the container's top edge is ABOVE the viewport's; the
        // row band starts one header row further down. A negative result (the grid
        // still below the fold) is clamped to 0 by `rowWindow`.
        scrollTop: -top - ROW_H_HEADER,
        overscan: DEFAULT_OVERSCAN,
      });
      // Only re-render when the window actually MOVED. A `scroll` listener that
      // setState'd on every event would re-render the whole matrix at scroll
      // frequency, which is the cost this change exists to remove.
      setWin((prev) => (sameWindow(prev, next) ? prev : next));
    };
    measure();
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [host, rowCount]);

  return [win, setHost];
}

/**
 * Style for the two inert, full-width grid items that stand in for the rows
 * outside the window.
 *
 * 🔴 THE STYLE IS SHARED, THE `data-testid` IS NOT — the two spacers are written
 * out inline with LITERAL testids rather than through one `<RowSpacer testid={…}>`
 * component. An indirect testid (a prop threaded into `data-testid`) is invisible
 * to `sourceScan`'s testid walk, and `renameWireCompat.test.ts` keeps an explicit
 * ledger of every such site for exactly that reason. Two literals cost two lines
 * and keep the scan complete.
 */
function spacerStyle(height: number): React.CSSProperties {
  return { gridColumn: '1 / -1', height };
}

export function ResultsGrid({
  configs,
  prompts,
  results,
  runs,
  c,
  buzzTotal,
  buzzBalanceLoading,
  onRetryBalance,
  privateGrid,
  GatedCell,
  onRunCell,
  onConfirmRun,
  onResumeRun,
  onCancelRun,
  onAddCombination,
  onAddPrompt,
  onOpenMatchup,
  onOpenPrompt,
}: ResultsGridProps): React.JSX.Element {
  const byCell = indexResultsByCell(results);
  // 🔴 CALLED BEFORE THE EMPTY-STATE EARLY RETURN BELOW, unconditionally — a hook
  // after a conditional return is a hook-order violation on the very next render.
  const [win, setGridHost] = useRowWindow(configs.length);

  // The grid is the app's PRIMARY state, so its empty case gets the same
  // treatment as every other list: the shared EmptyState template, which the
  // house rule says must always carry a next step rather than a lonely
  // "nothing here" string. It also names WHICH side is missing — rows and
  // columns are two different objects with two different submit forms, and the
  // old single sentence made the reader work out which one to go and fix.
  if (configs.length === 0 || prompts.length === 0) {
    // 🔴 THE PRIVATE ARM COMES FIRST AND TAKES NO ACTION. The copy below is about the
    // TOP GRID — "Submit and vote to fill the top slots" is how the system grid's members
    // are chosen — and it is flatly wrong about a grid the viewer authored out of their
    // own drafts, where the matrix is empty because the members are not published yet.
    // See {@link PRIVATE_GRID_EMPTY_BODY} for the dead end this closes and for why there
    // is no button.
    if (privateGrid) {
      return (
        <EmptyState
          data-testid="grid-empty"
          title={PRIVATE_GRID_EMPTY_TITLE}
          body={PRIVATE_GRID_EMPTY_BODY}
        />
      );
    }
    const needsCombination = configs.length === 0;
    const needsPrompt = prompts.length === 0;
    const body = needsCombination && needsPrompt
      ? 'The grid needs at least one included matchup (with a model config) and one included prompt. Submit and vote to fill the top slots.'
      : needsCombination
        ? 'The grid has columns but no rows yet: it needs at least one included matchup with a model config.'
        : 'The grid has rows but no columns yet: it needs at least one included prompt.';
    const action = needsCombination && onAddCombination ? (
      // 🔴 THE LABELS FOLLOW THE ACTION. These said "Go to Matchups"/"Go to
      // Prompts" while they switched a top-level tab; they now open the submit
      // form directly (there are no tabs), so a label promising navigation would
      // describe something that no longer happens.
      <Button size="sm" onClick={onAddCombination} data-testid="grid-empty-add-matchup">
        Submit a matchup
      </Button>
    ) : !needsCombination && needsPrompt && onAddPrompt ? (
      <Button size="sm" onClick={onAddPrompt} data-testid="grid-empty-add-prompt">
        Submit a prompt
      </Button>
    ) : undefined;
    return (
      <EmptyState data-testid="grid-empty" title="No benchmark grid yet" body={body} action={action} />
    );
  }

  // 🔴 `minmax(FLOOR, 1fr)`, NOT A FIXED TRACK. `1fr` is what makes a cell grow
  // into a wide viewport; the floor is what stops it shrinking below the width
  // every cell's contents were built for (see {@link CELL_MIN_W}). The two halves
  // are a pair: `1fr` alone would let a busy board crush the columns to
  // unreadable, and the floor alone is the fixed ribbon this replaces.
  const gridTemplateColumns = `minmax(180px, 220px) repeat(${prompts.length}, minmax(${CELL_MIN_W}px, ${CELL_MAX_W}px))`;

  // 🔴 The <div> below is the app's horizontal-scroll BOUNDARY, and the responsive
  // track above did NOT retire it. A grid track cannot shrink below its `minmax()`
  // minimum, so the matrix is still wider than a phone by construction (a 200px
  // FLOOR per prompt plus a 180–220px row header) and still degrades by SCROLLING
  // there — no column is dropped and no cell changes identity. What changed is only
  // the other end: where there IS slack, `1fr` takes it instead of leaving it as
  // dead page. ⚠️ The sentence here used to reason from "a 200px cell", i.e. from a
  // constant that no longer exists; the arithmetic survives because 200 is now the
  // minimum rather than the width, which is the ONLY reason the narrow-viewport
  // measurements below still describe this tree. `overflowX:
  // 'auto'` alone was NOT enough: the box still SIZED itself to its content,
  // because its ancestors' min-width defaulted to min-content (see
  // `contentStyle`), so the document widened anyway. `minWidth: 0` +
  // `maxWidth: '100%'` cap this box at the space its parent actually offers,
  // which is what turns the overflow into a scroll instead of a page-wide
  // blowout.
  return (
    <div
      data-testid="results-grid"
      role="group"
      aria-label="Benchmark results: configurations by prompts"
      style={{
        overflowX: 'auto',
        minWidth: 0,
        maxWidth: '100%',
        border: `1px solid ${c.border}`,
        borderRadius: radius.md,
      }}
    >
      <div
        ref={setGridHost}
        data-testid="grid-body"
        data-row-count={configs.length}
        data-window-start={win.start}
        data-window-end={win.end}
        style={{ display: 'grid', gridTemplateColumns, minWidth: 'min-content' }}
      >
        {/* Header row: corner + one column header per prompt */}
        <HeaderCorner c={c} />
        {prompts.map((p) => (
          <ColumnHeader
            key={p.key}
            prompt={p}
            c={c}
            onOpen={() => onOpenPrompt(p.key)}
          />
        ))}

        {/* 🔴 THE SPACERS ARE WHAT KEEP THE SCROLL EXTENT HONEST. Without them the
            document would shrink to the mounted window and the scrollbar would
            jump on every scroll; `rowWindow` guarantees
            `padTop + mounted*rowHeight + padBottom === rowCount*rowHeight`. They
            span every track (`1 / -1`) for the same reason `GroupBand` does — a
            grid item occupies one cell otherwise. */}
        {win.padTop > 0 && (
          <div
            data-testid="grid-pad-top"
            data-height={win.padTop}
            aria-hidden="true"
            style={spacerStyle(win.padTop)}
          />
        )}

        {/* Body: one row per CONFIG (grouped under its combination), WINDOWED.
            🔴 `groupStart` IS COMPUTED FROM THE GLOBAL INDEX `i`, NEVER THE SLICE
            INDEX `j`. Which rows get a matchup band is a property of the full
            config list, so windowing must not change it: a window opening in the
            MIDDLE of a group must not promote its first visible row to a band, and
            a group whose first config is windowed out must not lose it when it
            comes back. Reading `configs[i - 1]` (the full array, not the slice) is
            what makes the band decision identical to the unwindowed render. */}
        {configs.slice(win.start, win.end).map((row, j) => {
          const i = win.start + j;
          return (
          <RowFragment
            key={`${row.comboKey}:${row.config.id}`}
            row={row}
            groupStart={i === 0 || configs[i - 1].comboKey !== row.comboKey}
            prompts={prompts}
            byCell={byCell}
            runs={runs}
            c={c}
            buzzTotal={buzzTotal}
            buzzBalanceLoading={buzzBalanceLoading}
            onRetryBalance={onRetryBalance}
            privateGrid={privateGrid}
            GatedCell={GatedCell}
            onRunCell={onRunCell}
            onConfirmRun={onConfirmRun}
            onResumeRun={onResumeRun}
            onCancelRun={onCancelRun}
            onOpenMatchup={onOpenMatchup}
          />
          );
        })}

        {win.padBottom > 0 && (
          <div
            data-testid="grid-pad-bottom"
            data-height={win.padBottom}
            aria-hidden="true"
            style={spacerStyle(win.padBottom)}
          />
        )}
      </div>
    </div>
  );
}

/**
 * One prompt COLUMN header — always a real `<button>`, so Enter/Space work and the
 * accessible name says what the press does.
 *
 * 🔴 THERE IS NO INERT `<div>` VARIANT ANY MORE. It existed for a caller that
 * passed no handler, which production never was, and `onOpen` is required so that
 * cannot recur. "Never a dead control" is now a property of the type rather than of
 * a branch no production render reaches.
 */
function ColumnHeader({
  prompt,
  c,
  onOpen,
}: {
  prompt: PromptRow;
  c: Palette;
  onOpen: () => void;
}): React.JSX.Element {
  const name = prompt.name || `#${prompt.key}`;
  const style: React.CSSProperties = {
    position: 'sticky',
    top: 0,
    zIndex: 2,
    background: c.headerBg,
    borderBottom: `1px solid ${c.border}`,
    borderLeft: `1px solid ${c.border}`,
    padding: '8px 10px',
    minHeight: ROW_H_HEADER,
    boxSizing: 'border-box',
  };
  const inner = (
    <>
      {/* 🔴 UNDERLINED, AND THAT IS THE WHOLE AFFORDANCE. This header opens the
          prompt detail modal, and until now the only thing saying so was
          `cursor: pointer` — invisible until the pointer is already on it, and
          absent entirely on a touch device. The underline is on the NAME only:
          underlining the vote count below would read as a second link. */}
      <div
        data-testid="grid-col-header-name"
        style={{
          fontWeight: 600,
          fontSize: 13,
          color: token.text,
          textDecoration: 'underline',
          textUnderlineOffset: '2px',
        }}
      >
        {name}
      </div>
      <div style={{ fontSize: 11, color: token.dimmed, marginTop: 2 }}>▲ {prompt.count}</div>
    </>
  );
  return (
    <button
      type="button"
      data-testid="grid-col-header"
      data-prompt-key={prompt.key}
      onClick={onOpen}
      aria-label={`Open prompt: ${name}`}
      style={{
        ...style,
        appearance: 'none',
        textAlign: 'left',
        font: 'inherit',
        width: '100%',
        cursor: 'pointer',
        border: 'none',
        borderBottom: `1px solid ${c.border}`,
        borderLeft: `1px solid ${c.border}`,
      }}
    >
      {inner}
    </button>
  );
}

/**
 * The matchup GROUP BAND — a real table section header spanning the whole row,
 * and the ONLY drill-in control on a config row.
 *
 * 🔴 IT IS A `<button>`, NOT A `<div onClick>`. It carries an accessible name that
 * NAMES THE MATCHUP, so a keyboard viewer and a screen reader both get the same
 * affordance a mouse viewer does — and an a11y assertion pins that. Note for
 * anyone porting a query from the old tab strip: those controls exposed
 * `role="tab"`; this one is a `button`.
 *
 * 🔴 `gridColumn: '1 / -1'` IS WHAT MAKES IT A BAND. It used to be a small dimmed
 * line INSIDE the first column's sticky row header, which read as a label on one
 * config rather than a heading over the whole group — the operator's "so it's
 * intuitive" ask. Spanning every track is the structural half of that; the
 * background, the disclosure glyph and the hover/focus states are the visual half.
 *
 * 🔴 AND IT IS ALWAYS A BUTTON. There used to be an inert `<div>` variant for a
 * caller that passed no `onOpen`; `onOpen` is required now, so the only shape this
 * renders is the wired one — the same shape production has always rendered.
 *
 * ⚠️ jsdom performs no layout, so no test in this repo can assert that this
 * actually READS as a band. The span, the element type, the name and the states
 * are asserted; the appearance is not.
 */
function GroupBand({
  row,
  c,
  onOpen,
}: {
  row: BenchConfig;
  c: Palette;
  onOpen: (comboKey: string) => void;
}): React.JSX.Element {
  const name = row.comboName || `#${row.comboKey}`;
  const base: React.CSSProperties = {
    gridColumn: '1 / -1',
    position: 'sticky',
    left: 0,
    zIndex: 2,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    boxSizing: 'border-box',
    padding: '6px 10px',
    borderTop: `2px solid ${c.border}`,
    background: elevate(7),
    color: token.text,
    font: 'inherit',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.02em',
    textAlign: 'left',
  };
  const content = (
    <>
      <span aria-hidden="true" style={{ color: token.dimmed, fontSize: 10 }}>
        ▸
      </span>
      {/* Underlined for the same reason as the column header: the band is the ONLY
          drill-in on a config row, and `cursor: pointer` is not an affordance a
          touch viewer can see. The name only — not the glyph, not the count. */}
      <span
        data-testid="grid-group-matchup-name"
        style={{ textDecoration: 'underline', textUnderlineOffset: '2px' }}
      >
        {name}
      </span>
      <span style={{ color: token.dimmed, fontWeight: 600 }}>▲ {row.comboCount}</span>
    </>
  );
  return (
    <button
      type="button"
      data-testid="grid-group-matchup"
      data-combo-key={row.comboKey}
      onClick={() => onOpen(row.comboKey)}
      aria-label={`Open matchup: ${name}`}
      style={{ ...base, border: 'none', borderTop: `2px solid ${c.border}`, cursor: 'pointer' }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = elevate(12);
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = elevate(7);
      }}
    >
      {content}
    </button>
  );
}

function HeaderCorner({ c }: { c: Palette }): React.JSX.Element {
  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        left: 0,
        zIndex: 3,
        background: c.headerBg,
        borderBottom: `1px solid ${c.border}`,
        padding: '8px 10px',
        minHeight: ROW_H_HEADER,
        fontWeight: 600,
        fontSize: 12,
        color: token.dimmed,
        boxSizing: 'border-box',
      }}
      data-testid="grid-corner"
    >
      {GRID_CORNER_LABEL}
    </div>
  );
}

interface RowProps {
  row: BenchConfig;
  /** True when this is the first config of its combination group (heavier separator + combo name). */
  groupStart: boolean;
  prompts: PromptRow[];
  byCell: Map<string, ResultRow>;
  runs: Record<string, CellRun>;
  c: Palette;
  buzzTotal: number | null;
  buzzBalanceLoading?: boolean;
  onRetryBalance?: () => void;
  privateGrid: boolean;
  GatedCell: GatedCellComponent;
  onRunCell: (config: BenchConfig, prompt: PromptRow) => void;
  onConfirmRun: (config: BenchConfig, prompt: PromptRow) => void;
  onResumeRun: (config: BenchConfig, prompt: PromptRow) => void;
  onCancelRun: (config: BenchConfig, prompt: PromptRow) => void;
  onOpenMatchup: (comboKey: string) => void;
}

function RowFragment({
  row,
  groupStart,
  prompts,
  byCell,
  runs,
  c,
  buzzTotal,
  buzzBalanceLoading,
  onRetryBalance,
  privateGrid,
  GatedCell,
  onRunCell,
  onConfirmRun,
  onResumeRun,
  onCancelRun,
  onOpenMatchup,
}: RowProps): React.JSX.Element {
  const eco = ecosystemForBaseModel(row.config.checkpoint.baseModel);
  // A light separator between the configs of one group; the group's own band
  // supplies the heavier rule that opens it (see GroupBand).
  const topBorder = `1px solid ${c.border}`;
  return (
    <>
      {/* 🔴 THE GROUP BAND IS ITS OWN FULL-WIDTH GRID ITEM, emitted BEFORE the
          row header rather than nested inside it. That is what lets it span every
          column (`1 / -1`) and read as a table section header instead of a label
          on the first config. It is also the only clickable landmark on a config
          row — the header below stays inert. */}
      {groupStart && <GroupBand row={row} c={c} onOpen={onOpenMatchup} />}
      {/* Sticky row header (the config, labeled under its combination). INERT by
          design: see `ResultsGridProps.onOpenMatchup`. */}
      <div
        data-testid="grid-row-header"
        data-combo-key={row.comboKey}
        data-config-id={row.config.id}
        style={{
          position: 'sticky',
          left: 0,
          zIndex: 1,
          background: c.headerBg,
          borderTop: topBorder,
          padding: '8px 10px',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 13, color: token.text }} data-testid="grid-config-label">
          {configLabel(row)}
        </div>
        <div style={{ fontSize: 11, color: token.dimmed, marginTop: 2 }}>
          {ecosystemMeta(eco).label}
          {row.config.loras.length > 0 && ` · +${row.config.loras.length} LoRA`}
        </div>
      </div>

      {prompts.map((prompt) => (
        <Cell
          key={prompt.key}
          row={row}
          prompt={prompt}
          result={byCell.get(cellKey(row.comboKey, row.config.id, prompt.key)) ?? null}
          run={runs[cellKey(row.comboKey, row.config.id, prompt.key)]}
          topBorder={topBorder}
          c={c}
          buzzTotal={buzzTotal}
          buzzBalanceLoading={buzzBalanceLoading}
          onRetryBalance={onRetryBalance}
          privateGrid={privateGrid}
          GatedCell={GatedCell}
          onRunCell={onRunCell}
          onConfirmRun={onConfirmRun}
          onResumeRun={onResumeRun}
          onCancelRun={onCancelRun}
        />
      ))}
    </>
  );
}

interface CellProps {
  row: BenchConfig;
  prompt: PromptRow;
  result: ResultRow | null;
  run: CellRun | undefined;
  topBorder: string;
  c: Palette;
  buzzTotal: number | null;
  buzzBalanceLoading?: boolean;
  onRetryBalance?: () => void;
  privateGrid: boolean;
  GatedCell: GatedCellComponent;
  onRunCell: (config: BenchConfig, prompt: PromptRow) => void;
  onConfirmRun: (config: BenchConfig, prompt: PromptRow) => void;
  onResumeRun: (config: BenchConfig, prompt: PromptRow) => void;
  onCancelRun: (config: BenchConfig, prompt: PromptRow) => void;
}

function Cell({
  row,
  prompt,
  result,
  run,
  topBorder,
  c,
  buzzTotal,
  buzzBalanceLoading,
  onRetryBalance,
  privateGrid,
  GatedCell,
  onRunCell,
  onConfirmRun,
  onResumeRun,
  onCancelRun,
}: CellProps): React.JSX.Element {
  const label = `${configLabel(row)} × ${prompt.name}`;

  const base: React.CSSProperties = {
    borderTop: topBorder,
    borderLeft: `1px solid ${c.border}`,
    padding: 8,
    minHeight: 110,
    boxSizing: 'border-box',
  };

  // 1. Already generated — render the gated outputs (generate-once). Every cell
  //    is runnable now (there is always a default prompt), so no N/A state.
  if (result) {
    return (
      <div data-testid="grid-cell" data-state="result" style={base}>
        <GatedCell imageIds={result.data.imageIds} label={label} />
      </div>
    );
  }

  // 2. A run is in flight / awaiting confirm for this cell.
  if (run && run.status !== 'idle') {
    return (
      <div data-testid="grid-cell" data-state="running" style={base}>
        <CellRunState
          run={run}
          buzzTotal={buzzTotal}
          buzzBalanceLoading={buzzBalanceLoading}
          onRetryBalance={onRetryBalance}
          privateGrid={privateGrid}
          onConfirm={() => onConfirmRun(row, prompt)}
          onResume={() => onResumeRun(row, prompt)}
          onCancel={() => onCancelRun(row, prompt)}
        />
      </div>
    );
  }

  // 3. Empty — offer to contribute a run.
  return (
    <div data-testid="grid-cell" data-state="empty" style={{ ...base, background: c.cellEmpty }}>
      <div style={{ display: 'grid', gap: 8, placeItems: 'center', height: '100%' }}>
        <span style={{ ...metaText, fontSize: 11 }}>not generated yet</span>
        <Button
          size="sm"
          variant="light"
          data-testid="run-cell"
          // 🔴 DELIBERATELY NOT DISABLED on missing auth/consent. This button is the
          // ONLY entry to `onRunCell` → `beginRun`, whose first two branches request
          // sign-in and request consent. Disabling it for exactly those two states made
          // both branches unreachable — the app then needed a separate always-visible
          // consent banner to do the asking, duplicating the host's own permissions bar.
          // An unauthorized press is ROUTED, not blocked: same contract as the vote
          // control. What legitimately removes this button is the cell's own state —
          // a result exists (state 1) or a run is in flight (state 2) — not a prop.
          onClick={() => onRunCell(row, prompt)}
          aria-label={`Run ${label}`}
          leftSection={<span aria-hidden="true">▶</span>}
        >
          Run this cell
        </Button>
      </div>
    </div>
  );
}

function CellRunState({
  run,
  buzzTotal,
  buzzBalanceLoading,
  onRetryBalance,
  privateGrid,
  onConfirm,
  onResume,
  onCancel,
}: {
  run: CellRun;
  buzzTotal: number | null;
  buzzBalanceLoading?: boolean;
  onRetryBalance?: () => void;
  privateGrid: boolean;
  onConfirm: () => void;
  onResume: () => void;
  onCancel: () => void;
}): React.JSX.Element {
  if (run.status === 'confirming') {
    const cost = run.estimatedCost;
    // Money honesty: only allow Confirm when the estimate is known AND fits the
    // viewer's balance. Unknown cost or unknown balance → disabled (fail-closed).
    //
    // 🔴 THE DISABLED STATE AND THE COPY NOW COME FROM THE SAME DECISION. They
    // used to be computed separately — `affordable` on three conditions, the
    // warning on a ternary over ONE of them — and the pair disagreed exactly
    // where it mattered: a known cost against an unreadable balance was DISABLED
    // (right) and labelled "Insufficient Buzz balance" (a claim about a number
    // the app never received). See {@link confirmGate}.
    const gate = confirmGate(cost, buzzTotal);
    const affordable = gate === 'ok';
    // `loading` is only meaningful while the balance is genuinely unresolved; a
    // retry is offered only once there is a failed read to retry, so a read still
    // in flight gets the waiting sentence and no button.
    const balanceReadFailed = gate === 'balance-unknown' && !buzzBalanceLoading;
    return (
      <div style={{ display: 'grid', gap: 8, fontSize: 12 }} data-testid="cell-confirm">
        <span style={{ color: token.text }}>
          Cost: <strong>{cost ?? '…'}</strong> Buzz
        </span>
        <span style={{ color: token.dimmed, fontSize: 11 }} data-testid="cell-public-notice">
          This generates images that will be added to the <strong>public</strong> benchmark grid, visible to
          all viewers.
        </span>
        {/* 🔴 THE EXTRA SENTENCE A PRIVATE GRID NEEDS, AND IT IS ADDITIVE RATHER THAN
            A REPLACEMENT. `cell-public-notice` above is true on every grid and stays;
            what the private case needs on top of it is that the grid's OWN privacy —
            which the panel badges a few hundred pixels up — does not extend to these
            outputs. Rendered right next to Confirm, because that is the press that
            makes it irreversible. See {@link PRIVATE_GRID_RUN_NOTICE} for the three
            code facts the sentence is built from. */}
        {privateGrid && (
          <span
            style={{ color: token.error, fontSize: 11 }}
            data-testid="cell-private-grid-notice"
          >
            {PRIVATE_GRID_RUN_NOTICE}
          </span>
        )}
        {(gate === 'insufficient' || gate === 'cost-unknown') && (
          <span style={{ color: token.error, fontSize: 11 }} data-testid="cell-insufficient">
            {gate === 'insufficient' ? 'Insufficient Buzz balance' : 'Cost unavailable'}
          </span>
        )}
        {gate === 'balance-unknown' && (
          <div
            data-testid="cell-balance-unknown"
            style={{ display: 'grid', gap: 4, color: token.dimmed, fontSize: 11 }}
          >
            <span>{balanceReadFailed ? BALANCE_UNKNOWN_MESSAGE : BALANCE_LOADING_MESSAGE}</span>
            {/* 🔴 THE WAY OUT. Without it this is a disabled button under a
                sentence that explains nothing the viewer can act on — which is
                what sent the operator to a full page reload, the only other
                thing that re-runs the balance hook's single mount fetch. One
                press, one read: no automatic retry, bounded by the viewer. */}
            {balanceReadFailed && onRetryBalance && (
              <div>
                <Button size="sm" variant="subtle" data-testid="cell-balance-retry" onClick={onRetryBalance}>
                  Retry balance check
                </Button>
              </div>
            )}
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Button size="sm" data-testid="cell-confirm-run" disabled={!affordable} onClick={onConfirm}>
            Confirm
          </Button>
          <Button size="sm" variant="subtle" data-testid="cell-cancel-run" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }
  // A generation that outran the poll window (or was rehydrated in-flight after a
  // reload): keep the workflow, offer a resume-poll — NEVER drop to empty+runnable
  // (that would re-charge). "Check status" re-polls the SAME workflow; "Dismiss"
  // is an explicit user abandon.
  if (run.status === 'stalled') {
    return (
      <div style={{ display: 'grid', gap: 8, fontSize: 12 }} data-testid="cell-stalled">
        <span style={metaText}>Still generating…</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Button size="sm" data-testid="cell-resume-run" onClick={onResume}>
            Check status
          </Button>
          <Button size="sm" variant="subtle" data-testid="cell-cancel-run" onClick={onCancel}>
            Dismiss
          </Button>
        </div>
      </div>
    );
  }
  // 🔴 THE UNRESOLVED CLAIM. The app wrote "about to spend" and never got to
  // write the workflowId, so whether the generation started is genuinely unknown.
  // There is nothing to resume-poll (no workflowId), and the one thing this must
  // never do is fall through to an empty, runnable cell — that is the double
  // charge. So it renders as its own state, and the ONLY way out is the explicit
  // control below: a deliberate act, never a default, but always available so a
  // stuck claim cannot permanently brick the cell.
  if (run.status === 'unknown') {
    return (
      <div style={{ display: 'grid', gap: 8, fontSize: 12 }} data-testid="cell-unknown">
        <span style={{ color: token.text }} data-testid="cell-unknown-message">
          {RUN_UNKNOWN_MESSAGE}
        </span>
        <div>
          <Button size="sm" variant="subtle" data-testid="cell-unknown-dismiss" onClick={onCancel}>
            Dismiss and allow a re-run
          </Button>
        </div>
      </div>
    );
  }
  if (run.status === 'failed') {
    return (
      <div style={{ display: 'grid', gap: 6, fontSize: 11 }} data-testid="cell-failed">
        <span style={{ color: token.error }}>Failed: {run.error ?? 'unknown error'}</span>
        <div>
          <Button size="sm" variant="subtle" color="error" data-testid="cell-retry" onClick={onCancel}>
            Dismiss
          </Button>
        </div>
      </div>
    );
  }
  // 🔴 PUBLISHING — the one state where the viewer is being ASKED something by a
  // dialog this app does not own. `publish()` resolves only when the viewer
  // answers the host's "Publish to the shared grid?" confirm, which is text-only
  // host chrome; before this branch the cell behind it showed nothing but a
  // spinner, so the answer was being given blind. The generated outputs are in
  // the snapshot the app already holds — render them here, where they are the
  // subject of the question. Everything else about this state is unchanged: the
  // same `cell-progress` status region, the same copy.
  if (run.status === 'publishing') {
    const all = run.previewUrls ?? [];
    const urls = all.slice(0, PUBLISH_PREVIEW_MAX);
    // 🔴 SAY SO WHEN THE STRIP IS A SUBSET. `publish()` sends no `imageIndexes`,
    // so the host publishes EVERY output — a preview that silently showed four
    // of six would understate what the viewer is agreeing to. Always 0 on every
    // path this block can currently take (one url per run — see the note on
    // `PUBLISH_PREVIEW_MAX`); kept as the fail-safe for a host that returns more.
    const hidden = all.length - urls.length;
    return (
      <div style={{ display: 'grid', gap: 6, fontSize: 11 }} data-testid="cell-publishing">
        {/* Absent urls are ORDINARY, not an error: the host may report a succeeded
            workflow without them, and a resumed run from a previous session
            often has none. The state degrades to exactly what it rendered
            before — progress + copy — rather than to an empty frame. */}
        {urls.length > 0 && (
          <div
            data-testid="cell-publish-preview"
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${Math.min(urls.length, 2)}, 1fr)`,
              gap: 4,
            }}
          >
            {urls.map((url, i) => (
              <Image
                key={url}
                data-testid="cell-publish-image"
                src={url}
                alt={`Generated output ${i + 1}, about to be published to the shared grid`}
                fit="cover"
                // A url the browser cannot load must not blank the prompt it is
                // attached to — the pack's own fallback keeps the tile, and the
                // copy + controls below are untouched either way.
                fallback={<span style={{ fontSize: 10, color: token.dimmed }}>preview unavailable</span>}
                wrapperStyle={{
                  width: '100%',
                  aspectRatio: '1 / 1',
                  borderRadius: radius.sm,
                  overflow: 'hidden',
                  border: `1px solid ${token.border}`,
                }}
              />
            ))}
          </div>
        )}
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 8, ...metaText }}
          data-testid="cell-progress"
          data-status="publishing"
          role="status"
          aria-live="polite"
        >
          <Loader size="sm" />
          <span>Publishing…</span>
        </div>
        <span style={{ color: token.dimmed }} data-testid="cell-publish-notice">
          {PUBLISH_CONFIRM_MESSAGE}
          {hidden > 0 && (
            <>
              {' '}
              <span data-testid="cell-publish-more">
                {`+${hidden} more output${hidden === 1 ? '' : 's'} will be published too.`}
              </span>
            </>
          )}
        </span>
      </div>
    );
  }
  const labels: Record<string, string> = {
    estimating: 'Estimating…',
    submitting: 'Submitting…',
    processing: 'Generating…',
    succeeded: 'Done',
    canceled: 'Canceled',
  };
  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 8, ...metaText }}
      data-testid="cell-progress"
      data-status={run.status}
      role="status"
      aria-live="polite"
    >
      <Loader size="sm" />
      <span>{labels[run.status] ?? run.status}</span>
    </div>
  );
}
