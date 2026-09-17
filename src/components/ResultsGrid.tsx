// The results matrix: included CONFIGS (rows, grouped under their combination) ×
// included PROMPTS (columns). Each row is one benchmarkable config (a checkpoint
// + its LoRA stack); rows sharing a combination are visually grouped (a heavier
// separator + the combo name on the first row of the group). Each cell shows
// that config's published outputs on that prompt so models compare side-by-side
// on identical prompts. The matrix layout itself is HAND-ROLLED (a CSS grid with
// sticky headers) — too bespoke for the /ui pack (per rule 112) — but every atom
// (Button/Badge/Card/Loader) and the gated cell come from the pack, styled off
// the pack's `--civitai-*` theme tokens + the app palette so it reads as one system.

import { Button, Loader } from '@civitai/blocks-react/ui';
import { Image } from '@civitai/components-react';

import type { Palette } from '../theme.js';
import { token, radius, metaText } from '../theme.js';
import type { CellRun, PromptRow, ResultRow } from '../types.js';
import {
  cellKey,
  configLabel,
  indexResultsByCell,
  type BenchConfig,
} from '../lib/benchmark.js';
import { ecosystemForBaseModel, ecosystemMeta } from '../lib/ecosystem.js';
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
  GatedCell: GatedCellComponent;
  onRunCell: (config: BenchConfig, prompt: PromptRow) => void;
  onConfirmRun: (config: BenchConfig, prompt: PromptRow) => void;
  /** Resume-poll a stalled cell's existing workflow (no re-submit, no re-charge). */
  onResumeRun: (config: BenchConfig, prompt: PromptRow) => void;
  onCancelRun: (config: BenchConfig, prompt: PromptRow) => void;
  /** Jump to the Matchups tab — the next step when the grid has no rows. */
  onAddCombination?: () => void;
  /** Jump to the Prompts tab — the next step when the grid has no columns. */
  onAddPrompt?: () => void;
}

const CELL_W = 200;
const ROW_H_HEADER = 56;

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

export function ResultsGrid({
  configs,
  prompts,
  results,
  runs,
  c,
  buzzTotal,
  buzzBalanceLoading,
  onRetryBalance,
  GatedCell,
  onRunCell,
  onConfirmRun,
  onResumeRun,
  onCancelRun,
  onAddCombination,
  onAddPrompt,
}: ResultsGridProps): React.JSX.Element {
  const byCell = indexResultsByCell(results);

  // The grid is the app's PRIMARY state, so its empty case gets the same
  // treatment as every other list: the shared EmptyState template, which the
  // house rule says must always carry a next step rather than a lonely
  // "nothing here" string. It also names WHICH side is missing — rows and
  // columns come from two different tabs, and the old single sentence made the
  // reader work out which one to go and fix.
  if (configs.length === 0 || prompts.length === 0) {
    const needsCombination = configs.length === 0;
    const needsPrompt = prompts.length === 0;
    const body = needsCombination && needsPrompt
      ? 'The grid needs at least one included matchup (with a model config) and one included prompt. Submit and vote to fill the top slots.'
      : needsCombination
        ? 'The grid has columns but no rows yet: it needs at least one included matchup with a model config.'
        : 'The grid has rows but no columns yet: it needs at least one included prompt.';
    const action = needsCombination && onAddCombination ? (
      <Button size="sm" onClick={onAddCombination} data-testid="grid-empty-add-matchup">
        Go to Matchups
      </Button>
    ) : !needsCombination && needsPrompt && onAddPrompt ? (
      <Button size="sm" onClick={onAddPrompt} data-testid="grid-empty-add-prompt">
        Go to Prompts
      </Button>
    ) : undefined;
    return (
      <EmptyState data-testid="grid-empty" title="No benchmark grid yet" body={body} action={action} />
    );
  }

  const gridTemplateColumns = `minmax(180px, 220px) repeat(${prompts.length}, ${CELL_W}px)`;

  // 🔴 The <div> below is the app's horizontal-scroll BOUNDARY: the matrix is
  // wider than a phone by construction (a 200px cell per prompt plus a
  // 180–220px row header), so on a narrow viewport it degrades by SCROLLING
  // there — no column is dropped and no cell changes identity. `overflowX:
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
      <div style={{ display: 'grid', gridTemplateColumns, minWidth: 'min-content' }}>
        {/* Header row: corner + one column header per prompt */}
        <HeaderCorner c={c} />
        {prompts.map((p) => (
          <div
            key={p.key}
            data-testid="grid-col-header"
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 2,
              background: c.headerBg,
              borderBottom: `1px solid ${c.border}`,
              borderLeft: `1px solid ${c.border}`,
              padding: '8px 10px',
              minHeight: ROW_H_HEADER,
              boxSizing: 'border-box',
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 13, color: token.text }}>{p.name || `#${p.key}`}</div>
            <div style={{ fontSize: 11, color: token.dimmed, marginTop: 2 }}>▲ {p.count}</div>
          </div>
        ))}

        {/* Body: one row per CONFIG (grouped under its combination) */}
        {configs.map((row, i) => (
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
            GatedCell={GatedCell}
            onRunCell={onRunCell}
            onConfirmRun={onConfirmRun}
            onResumeRun={onResumeRun}
            onCancelRun={onCancelRun}
          />
        ))}
      </div>
    </div>
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
    >
      configs × prompts
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
  GatedCell: GatedCellComponent;
  onRunCell: (config: BenchConfig, prompt: PromptRow) => void;
  onConfirmRun: (config: BenchConfig, prompt: PromptRow) => void;
  onResumeRun: (config: BenchConfig, prompt: PromptRow) => void;
  onCancelRun: (config: BenchConfig, prompt: PromptRow) => void;
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
  GatedCell,
  onRunCell,
  onConfirmRun,
  onResumeRun,
  onCancelRun,
}: RowProps): React.JSX.Element {
  const eco = ecosystemForBaseModel(row.config.checkpoint.baseModel);
  // A heavier top border opens each combination group; a light one between its configs.
  const topBorder = groupStart ? `2px solid ${c.border}` : `1px solid ${c.border}`;
  return (
    <>
      {/* Sticky row header (the config, labeled under its combination) */}
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
        {groupStart && (
          <div
            style={{ fontSize: 11, color: token.dimmed, fontWeight: 600, marginBottom: 2 }}
            data-testid="grid-group-matchup"
          >
            {row.comboName || `#${row.comboKey}`} · ▲ {row.comboCount}
          </div>
        )}
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
  onConfirm,
  onResume,
  onCancel,
}: {
  run: CellRun;
  buzzTotal: number | null;
  buzzBalanceLoading?: boolean;
  onRetryBalance?: () => void;
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
