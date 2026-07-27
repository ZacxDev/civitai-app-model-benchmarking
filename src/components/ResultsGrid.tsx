// The results matrix: included CONFIGS (rows, grouped under their combination) ×
// included PROMPTS (columns). Each row is one benchmarkable config (a checkpoint
// + its LoRA stack); rows sharing a combination are visually grouped (a heavier
// separator + the combo name on the first row of the group). Each cell shows
// that config's published outputs on that prompt so models compare side-by-side
// on identical prompts. The matrix layout itself is HAND-ROLLED (a CSS grid with
// sticky headers) — too bespoke for the /ui pack (per rule #112) — but every atom
// (Button/Badge/Card/Loader) and the gated cell come from the pack, styled off
// the pack's `--ci-*` vars + the app palette so it reads as one system.

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
import type { GatedCellComponent } from './GatedCell.js';

export interface ResultsGridProps {
  /** Flattened, benchmarkable config rows (grouped under their combination). */
  configs: BenchConfig[];
  prompts: PromptRow[];
  results: ResultRow[];
  runs: Record<string, CellRun>;
  c: Palette;
  canRun: boolean;
  GatedCell: GatedCellComponent;
  onRunCell: (config: BenchConfig, prompt: PromptRow) => void;
  onConfirmRun: (config: BenchConfig, prompt: PromptRow) => void;
  onCancelRun: (config: BenchConfig, prompt: PromptRow) => void;
}

const CELL_W = 200;
const ROW_H_HEADER = 56;

export function ResultsGrid({
  configs,
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

  if (configs.length === 0 || prompts.length === 0) {
    return (
      <div
        data-testid="grid-empty"
        style={{
          ...metaText,
          padding: '32px 24px',
          textAlign: 'center',
          borderRadius: radius.md,
          border: `1px dashed ${c.border}`,
          background: c.card,
        }}
      >
        The benchmark grid appears once there is at least one included combination (with a model config)
        AND one included prompt. Submit and vote to fill the top slots.
      </div>
    );
  }

  const gridTemplateColumns = `minmax(180px, 220px) repeat(${prompts.length}, ${CELL_W}px)`;

  return (
    <div
      data-testid="results-grid"
      role="group"
      aria-label="Benchmark results: configurations by prompts"
      style={{ overflowX: 'auto', border: `1px solid ${c.border}`, borderRadius: radius.md }}
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
  GatedCell: GatedCellComponent;
  onRunCell: (config: BenchConfig, prompt: PromptRow) => void;
  onConfirmRun: (config: BenchConfig, prompt: PromptRow) => void;
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
  GatedCell,
  onRunCell,
  onConfirmRun,
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
  row: BenchConfig;
  prompt: PromptRow;
  result: ResultRow | null;
  run: CellRun | undefined;
  topBorder: string;
  c: Palette;
  canRun: boolean;
  GatedCell: GatedCellComponent;
  onRunCell: (config: BenchConfig, prompt: PromptRow) => void;
  onConfirmRun: (config: BenchConfig, prompt: PromptRow) => void;
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
  GatedCell,
  onRunCell,
  onConfirmRun,
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
        <CellRunState run={run} onConfirm={() => onConfirmRun(row, prompt)} onCancel={() => onCancelRun(row, prompt)} />
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
  onConfirm,
  onCancel,
}: {
  run: CellRun;
  onConfirm: () => void;
  onCancel: () => void;
}): React.JSX.Element {
  if (run.status === 'confirming') {
    return (
      <div style={{ display: 'grid', gap: 8, fontSize: 12 }} data-testid="cell-confirm">
        <span style={{ color: token.text }}>
          Cost: <strong>{run.estimatedCost ?? '…'}</strong> Buzz
        </span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Button size="sm" data-testid="cell-confirm-run" onClick={onConfirm}>
            Confirm
          </Button>
          <Button size="sm" variant="subtle" data-testid="cell-cancel-run" onClick={onCancel}>
            Cancel
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
    stalled: 'Still generating…',
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
