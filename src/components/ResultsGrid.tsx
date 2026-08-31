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
  canRun: boolean;
  /** The viewer's total spendable Buzz (blue+green+yellow), or `null` when the
   * balance is unknown. Confirm is disabled unless the estimated cost fits. */
  buzzTotal: number | null;
  GatedCell: GatedCellComponent;
  onRunCell: (config: BenchConfig, prompt: PromptRow) => void;
  onConfirmRun: (config: BenchConfig, prompt: PromptRow) => void;
  /** Resume-poll a stalled cell's existing workflow (no re-submit, no re-charge). */
  onResumeRun: (config: BenchConfig, prompt: PromptRow) => void;
  onCancelRun: (config: BenchConfig, prompt: PromptRow) => void;
  /** Jump to the Combinations tab — the next step when the grid has no rows. */
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

export function ResultsGrid({
  configs,
  prompts,
  results,
  runs,
  c,
  canRun,
  buzzTotal,
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
      ? 'The grid needs at least one included combination (with a model config) and one included prompt. Submit and vote to fill the top slots.'
      : needsCombination
        ? 'The grid has columns but no rows yet: it needs at least one included combination with a model config.'
        : 'The grid has rows but no columns yet: it needs at least one included prompt.';
    const action = needsCombination && onAddCombination ? (
      <Button size="sm" onClick={onAddCombination} data-testid="grid-empty-add-combination">
        Go to Combinations
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
            canRun={canRun}
            buzzTotal={buzzTotal}
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
  canRun: boolean;
  buzzTotal: number | null;
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
  canRun,
  buzzTotal,
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
            data-testid="grid-group-combo"
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
          canRun={canRun}
          buzzTotal={buzzTotal}
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
  canRun: boolean;
  buzzTotal: number | null;
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
  canRun,
  buzzTotal,
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
          disabled={!canRun}
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
  onConfirm,
  onResume,
  onCancel,
}: {
  run: CellRun;
  buzzTotal: number | null;
  onConfirm: () => void;
  onResume: () => void;
  onCancel: () => void;
}): React.JSX.Element {
  if (run.status === 'confirming') {
    const cost = run.estimatedCost;
    // Money honesty: only allow Confirm when the estimate is known AND fits the
    // viewer's balance. Unknown cost or unknown balance → disabled (fail-closed).
    const costKnown = typeof cost === 'number';
    const affordable = costKnown && buzzTotal != null && cost <= buzzTotal;
    return (
      <div style={{ display: 'grid', gap: 8, fontSize: 12 }} data-testid="cell-confirm">
        <span style={{ color: token.text }}>
          Cost: <strong>{cost ?? '…'}</strong> Buzz
        </span>
        <span style={{ color: token.dimmed, fontSize: 11 }} data-testid="cell-public-notice">
          This generates images that will be added to the <strong>public</strong> benchmark grid, visible to
          all viewers.
        </span>
        {!affordable && (
          <span style={{ color: token.error, fontSize: 11 }} data-testid="cell-insufficient">
            {costKnown ? 'Insufficient Buzz balance' : 'Cost unavailable'}
          </span>
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
  const labels: Record<string, string> = {
    estimating: 'Estimating…',
    submitting: 'Submitting…',
    processing: 'Generating…',
    publishing: 'Publishing…',
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
