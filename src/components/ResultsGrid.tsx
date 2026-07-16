// The results matrix: included COMBINATIONS (rows) × included PROMPTS (columns).
// Each cell shows that combo's published outputs on that prompt so models
// compare side-by-side on identical prompts. The matrix layout itself is
// HAND-ROLLED (a CSS grid with sticky headers) — it's too bespoke for the /ui
// pack (per rule #112) — but every atom (Button/Badge/Card/Loader) and the
// gated cell come from the pack, and it's styled off the pack's `--ci-*` vars +
// the app palette so it reads as one system.

import type { Palette } from '../theme.js';
import type { CellRun, CombinationRow, PromptRow, ResultRow } from '../types.js';
import { cellKey, indexResultsByCell, resolveCell } from '../lib/benchmark.js';
import { ecosystemForBaseModel, ecosystemMeta } from '../lib/ecosystem.js';
import type { GatedCellComponent } from '../lib/generation-bridge.js';

export interface ResultsGridProps {
  combinations: CombinationRow[];
  prompts: PromptRow[];
  results: ResultRow[];
  runs: Record<string, CellRun>;
  c: Palette;
  canRun: boolean;
  GatedCell: GatedCellComponent;
  onRunCell: (combo: CombinationRow, prompt: PromptRow) => void;
  onConfirmRun: (combo: CombinationRow, prompt: PromptRow) => void;
  onCancelRun: (combo: CombinationRow, prompt: PromptRow) => void;
}

const CELL_W = 200;
const ROW_H_HEADER = 56;

export function ResultsGrid({
  combinations,
  prompts,
  results,
  runs,
  c,
  canRun,
  GatedCell,
  onRunCell,
  onConfirmRun,
  onCancelRun,
}: ResultsGridProps): React.JSX.Element {
  const byCell = indexResultsByCell(results);

  if (combinations.length === 0 || prompts.length === 0) {
    return (
      <div data-testid="grid-empty" style={{ opacity: 0.7, padding: 24, textAlign: 'center' }}>
        The benchmark grid appears once there is at least one included combination AND one included
        prompt. Submit and vote to fill the top slots.
      </div>
    );
  }

  const gridTemplateColumns = `minmax(160px, 200px) repeat(${prompts.length}, ${CELL_W}px)`;

  return (
    <div data-testid="results-grid" style={{ overflowX: 'auto', border: `1px solid ${c.border}`, borderRadius: 10 }}>
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
            <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name || `#${p.key}`}</div>
            <div style={{ fontSize: 11, opacity: 0.6 }}>▲ {p.count}</div>
          </div>
        ))}

        {/* Body: one row per combination */}
        {combinations.map((combo) => (
          <RowFragment
            key={combo.key}
            combo={combo}
            prompts={prompts}
            byCell={byCell}
            runs={runs}
            c={c}
            canRun={canRun}
            GatedCell={GatedCell}
            onRunCell={onRunCell}
            onConfirmRun={onConfirmRun}
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
        opacity: 0.75,
        boxSizing: 'border-box',
      }}
    >
      combos × prompts
    </div>
  );
}

interface RowProps {
  combo: CombinationRow;
  prompts: PromptRow[];
  byCell: Map<string, ResultRow>;
  runs: Record<string, CellRun>;
  c: Palette;
  canRun: boolean;
  GatedCell: GatedCellComponent;
  onRunCell: (combo: CombinationRow, prompt: PromptRow) => void;
  onConfirmRun: (combo: CombinationRow, prompt: PromptRow) => void;
  onCancelRun: (combo: CombinationRow, prompt: PromptRow) => void;
}

function RowFragment({
  combo,
  prompts,
  byCell,
  runs,
  c,
  canRun,
  GatedCell,
  onRunCell,
  onConfirmRun,
  onCancelRun,
}: RowProps): React.JSX.Element {
  const eco = ecosystemForBaseModel(combo.data.checkpoint.baseModel);
  return (
    <>
      {/* Sticky row header (the combination) */}
      <div
        data-testid="grid-row-header"
        style={{
          position: 'sticky',
          left: 0,
          zIndex: 1,
          background: c.headerBg,
          borderTop: `1px solid ${c.border}`,
          padding: '8px 10px',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 13 }}>{combo.name || `#${combo.key}`}</div>
        <div style={{ fontSize: 11, opacity: 0.65 }}>{ecosystemMeta(eco).label} · ▲ {combo.count}</div>
        {combo.data.loras.length > 0 && (
          <div style={{ fontSize: 11, opacity: 0.5 }}>+{combo.data.loras.length} LoRA</div>
        )}
      </div>

      {prompts.map((prompt) => (
        <Cell
          key={prompt.key}
          combo={combo}
          prompt={prompt}
          result={byCell.get(cellKey(combo.key, prompt.key)) ?? null}
          run={runs[cellKey(combo.key, prompt.key)]}
          c={c}
          canRun={canRun}
          GatedCell={GatedCell}
          onRunCell={onRunCell}
          onConfirmRun={onConfirmRun}
          onCancelRun={onCancelRun}
        />
      ))}
    </>
  );
}

interface CellProps {
  combo: CombinationRow;
  prompt: PromptRow;
  result: ResultRow | null;
  run: CellRun | undefined;
  c: Palette;
  canRun: boolean;
  GatedCell: GatedCellComponent;
  onRunCell: (combo: CombinationRow, prompt: PromptRow) => void;
  onConfirmRun: (combo: CombinationRow, prompt: PromptRow) => void;
  onCancelRun: (combo: CombinationRow, prompt: PromptRow) => void;
}

function Cell({
  combo,
  prompt,
  result,
  run,
  c,
  canRun,
  GatedCell,
  onRunCell,
  onConfirmRun,
  onCancelRun,
}: CellProps): React.JSX.Element {
  const runnable = resolveCell(combo, prompt) !== null;
  const eco = ecosystemForBaseModel(combo.data.checkpoint.baseModel);

  const base: React.CSSProperties = {
    borderTop: `1px solid ${c.border}`,
    borderLeft: `1px solid ${c.border}`,
    padding: 8,
    minHeight: 110,
    boxSizing: 'border-box',
  };

  // 1. Not runnable — the prompt has no entry for this combo's ecosystem.
  if (!runnable) {
    return (
      <div data-testid="grid-cell" data-state="na" style={{ ...base, background: c.cellEmpty, opacity: 0.6 }}>
        <span style={{ fontSize: 11 }}>No {ecosystemMeta(eco).label} prompt</span>
      </div>
    );
  }

  // 2. Already generated — render the gated outputs (generate-once).
  if (result) {
    return (
      <div data-testid="grid-cell" data-state="result" style={base}>
        <GatedCell imageIds={result.data.imageIds} label={`${combo.name} × ${prompt.name}`} />
      </div>
    );
  }

  // 3. A run is in flight / awaiting confirm for this cell.
  if (run && run.status !== 'idle') {
    return (
      <div data-testid="grid-cell" data-state="running" style={base}>
        <CellRunState run={run} onConfirm={() => onConfirmRun(combo, prompt)} onCancel={() => onCancelRun(combo, prompt)} />
      </div>
    );
  }

  // 4. Empty — offer to contribute a run.
  return (
    <div data-testid="grid-cell" data-state="empty" style={{ ...base, background: c.cellEmpty }}>
      <div style={{ display: 'grid', gap: 6, placeItems: 'center', height: '100%' }}>
        <span style={{ fontSize: 11, opacity: 0.6 }}>not generated yet</span>
        <button
          type="button"
          data-testid="run-cell"
          disabled={!canRun}
          onClick={() => onRunCell(combo, prompt)}
          style={{
            fontSize: 12,
            padding: '4px 10px',
            borderRadius: 6,
            border: `1px solid ${c.border}`,
            background: 'transparent',
            color: c.fg,
            cursor: canRun ? 'pointer' : 'not-allowed',
            opacity: canRun ? 1 : 0.5,
          }}
        >
          Run this cell
        </button>
      </div>
    </div>
  );
}

function CellRunState({
  run,
  onConfirm,
  onCancel,
}: {
  run: CellRun;
  onConfirm: () => void;
  onCancel: () => void;
}): React.JSX.Element {
  if (run.status === 'confirming') {
    return (
      <div style={{ display: 'grid', gap: 6, fontSize: 12 }} data-testid="cell-confirm">
        <span>Cost: {run.estimatedCost ?? '…'} Buzz</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" data-testid="cell-confirm-run" onClick={onConfirm}>
            Confirm
          </button>
          <button type="button" data-testid="cell-cancel-run" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    );
  }
  if (run.status === 'failed') {
    return (
      <div style={{ fontSize: 11, color: 'var(--ci-color-error, #e03131)' }} data-testid="cell-failed">
        Failed: {run.error ?? 'unknown error'}
        <div>
          <button type="button" data-testid="cell-retry" onClick={onCancel}>
            Dismiss
          </button>
        </div>
      </div>
    );
  }
  const labels: Record<string, string> = {
    estimating: 'Estimating…',
    submitting: 'Submitting…',
    processing: 'Generating…',
    stalled: 'Still generating…',
    publishing: 'Publishing…',
    succeeded: 'Done',
    canceled: 'Canceled',
  };
  return (
    <div style={{ fontSize: 12, opacity: 0.8 }} data-testid="cell-progress" data-status={run.status}>
      {labels[run.status] ?? run.status}
    </div>
  );
}
