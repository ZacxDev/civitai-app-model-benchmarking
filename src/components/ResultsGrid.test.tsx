// Grid render matrix: rows are CONFIGS (flattened + grouped under their
// combination). A RESULT cell (gated visible + gated HIDDEN image) and EMPTY
// cells (offering a run). Every config×prompt cell is runnable now (a prompt
// always has a default), so there are NO N/A cells — a Flux config renders an
// empty runnable cell against an SDXL-authored prompt. Renders ResultsGrid
// directly with hand-built config rows so the matrix + gated-cell +
// config-grouping paths are exercised deterministically.

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ResultsGrid } from './ResultsGrid.js';
import { palette } from '../theme.js';
import { fakeGatedCell } from '../test-helpers.js';
import { flattenConfigs, cellKey } from '../lib/benchmark.js';
import type { CombinationRow, PromptRow, ResultRow } from '../types.js';

const c = palette();

// A single combination with TWO configs (SDXL base + SDXL with LoRA) + one Flux
// combination — so grouping, sibling-config cells, and N/A cells all appear.
const comboSdxl: CombinationRow = {
  key: 'c1',
  count: 5,
  authorUserId: 1,
  name: 'SDXL Combo',
  description: '',
  data: {
    v: 2,
    kind: 'combination',
    configs: [
      { id: 'cfgA', label: 'base', checkpoint: { versionId: 1001, modelId: 500, baseModel: 'SDXL 1.0', modelName: 'JuggernautXL' }, loras: [] },
      { id: 'cfgB', label: 'detail', checkpoint: { versionId: 1001, modelId: 500, baseModel: 'SDXL 1.0', modelName: 'JuggernautXL' }, loras: [{ versionId: 2002, weight: 0.8 }] },
    ],
  },
};
const comboFlux: CombinationRow = {
  key: 'c2',
  count: 4,
  authorUserId: 1,
  name: 'Flux Combo',
  description: '',
  data: {
    v: 2,
    kind: 'combination',
    configs: [{ id: 'cfgC', checkpoint: { versionId: 3003, modelId: 700, baseModel: 'Flux.1 D', modelName: 'FluxBase' }, loras: [] }],
  },
};
const p1: PromptRow = {
  key: 'p1',
  count: 9,
  authorUserId: 1,
  name: 'Portrait',
  description: '',
  data: { v: 3, kind: 'prompt', default: { prompt: 'x', params: {} } },
};
const p2: PromptRow = {
  key: 'p2',
  count: 8,
  authorUserId: 1,
  name: 'Landscape',
  description: '',
  data: { v: 3, kind: 'prompt', default: { prompt: 'y', params: {} } },
};
// A result exists ONLY for the c1/cfgA × p1 cell.
const result: ResultRow = {
  key: 'r1',
  authorUserId: 1,
  data: { v: 2, kind: 'result', comboKey: 'c1', configId: 'cfgA', promptKey: 'p1', ecosystem: 'SDXL', imageIds: [501, 777] },
};

function renderGrid(canRun = true) {
  const onRunCell = vi.fn();
  const configs = flattenConfigs([comboSdxl, comboFlux]); // 3 config rows
  render(
    <ResultsGrid
      configs={configs}
      prompts={[p1, p2]}
      results={[result]}
      runs={{}}
      c={c}
      canRun={canRun}
      GatedCell={fakeGatedCell({ visibleIds: [501], hiddenIds: [777] })}
      onRunCell={onRunCell}
      onConfirmRun={vi.fn()}
      onCancelRun={vi.fn()}
    />,
  );
  return { onRunCell, configs };
}

describe('ResultsGrid render (config rows)', () => {
  it('renders a 3-row × 2-col matrix (2 SDXL configs + 1 Flux config)', () => {
    renderGrid();
    // 3 config rows × 2 prompt cols = 6 body cells
    expect(screen.getAllByTestId('grid-cell')).toHaveLength(6);
    expect(screen.getAllByTestId('grid-col-header')).toHaveLength(2);
    expect(screen.getAllByTestId('grid-row-header')).toHaveLength(3);
    // config labels render as row headers
    expect(screen.getAllByTestId('grid-config-label').map((e) => e.textContent)).toEqual([
      'base',
      'detail',
      'FluxBase',
    ]);
  });

  it('groups configs under their combination (combo name shown once per group)', () => {
    renderGrid();
    const groupHeaders = screen.getAllByTestId('grid-group-combo').map((e) => e.textContent);
    // Two groups → two combo headers (SDXL Combo appears once for its 2 configs).
    expect(groupHeaders).toHaveLength(2);
    expect(groupHeaders[0]).toContain('SDXL Combo');
    expect(groupHeaders[1]).toContain('Flux Combo');
  });

  it('renders the RESULT cell (c1/cfgA × p1) with the gated visible image AND the gated HIDDEN placeholder', () => {
    renderGrid();
    const cells = screen.getAllByTestId('grid-cell');
    const resultCells = cells.filter((el) => el.getAttribute('data-state') === 'result');
    expect(resultCells).toHaveLength(1); // ONLY cfgA×p1, NOT the sibling cfgB×p1
    expect(within(resultCells[0]).getByTestId('result-image')).toBeInTheDocument();
    expect(within(resultCells[0]).getByTestId('result-hidden')).toBeInTheDocument();
  });

  it('the sibling config (cfgB × p1) is a distinct EMPTY cell — not deduped by the cfgA result', () => {
    const { onRunCell, configs } = renderGrid();
    const empties = screen.getAllByTestId('grid-cell').filter((el) => el.getAttribute('data-state') === 'empty');
    // Every non-result cell is now runnable (default prompt): cfgA×p2, cfgB×p1,
    // cfgB×p2, cfgC(Flux)×p1, cfgC(Flux)×p2 = 5 empty cells.
    expect(empties).toHaveLength(5);
    within(empties[0]).getByTestId('run-cell').click();
    // first empty is cfgA × p2
    expect(onRunCell).toHaveBeenCalledWith(configs[0], p2);
  });

  it('🔴 renders NO N/A cells — a Flux config against an SDXL-authored prompt is a runnable EMPTY cell', () => {
    const { configs } = renderGrid();
    // No cell is in the (removed) "na" state.
    expect(screen.getAllByTestId('grid-cell').filter((el) => el.getAttribute('data-state') === 'na')).toHaveLength(0);
    // The Flux config (cfgC) rows are empty + runnable, not N/A.
    const fluxConfig = configs.find((c) => c.config.id === 'cfgC')!;
    expect(fluxConfig.config.checkpoint.baseModel).toBe('Flux.1 D');
    const empties = screen.getAllByTestId('grid-cell').filter((el) => el.getAttribute('data-state') === 'empty');
    // The last two empty cells are the Flux config's — their run buttons are enabled.
    expect(within(empties[empties.length - 1]).getByTestId('run-cell')).not.toBeDisabled();
  });

  it('disables the run affordance when the viewer cannot generate', () => {
    renderGrid(false);
    const empty = screen.getAllByTestId('grid-cell').find((el) => el.getAttribute('data-state') === 'empty')!;
    expect(within(empty).getByTestId('run-cell')).toBeDisabled();
  });

  it('a11y: the matrix has an accessible name and each run affordance is labelled', () => {
    renderGrid();
    // The grid region names itself for assistive tech.
    expect(screen.getByLabelText('Benchmark results: configurations by prompts')).toBeInTheDocument();
    // Every empty-cell run button carries a descriptive aria-label (config × prompt),
    // not just the visible "Run this cell".
    const runButtons = screen.getAllByTestId('run-cell');
    expect(runButtons.length).toBeGreaterThan(0);
    for (const btn of runButtons) {
      expect(btn.getAttribute('aria-label')).toMatch(/^Run .+ × .+$/);
    }
  });

  it('a11y: an in-flight cell exposes a role="status" aria-live region', () => {
    const configs = flattenConfigs([comboSdxl, comboFlux]);
    render(
      <ResultsGrid
        configs={configs}
        prompts={[p1, p2]}
        results={[]}
        // cfgB × p1 is an empty cell with a run in flight.
        runs={{
          [cellKey('c1', 'cfgB', 'p1')]: {
            comboKey: 'c1',
            configId: 'cfgB',
            promptKey: 'p1',
            ecosystem: 'SDXL',
            status: 'processing',
          },
        }}
        c={c}
        canRun
        GatedCell={fakeGatedCell()}
        onRunCell={vi.fn()}
        onConfirmRun={vi.fn()}
        onCancelRun={vi.fn()}
      />,
    );
    // (the pack Loader also carries role="status", so target the progress region by testid)
    const status = screen.getByTestId('cell-progress');
    expect(status).toHaveAttribute('role', 'status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveAttribute('data-status', 'processing');
    expect(status).toHaveTextContent('Generating…');
  });

  it('shows the empty-state message when there are no included rows/columns', () => {
    render(
      <ResultsGrid
        configs={[]}
        prompts={[p1]}
        results={[]}
        runs={{}}
        c={c}
        canRun
        GatedCell={fakeGatedCell()}
        onRunCell={vi.fn()}
        onConfirmRun={vi.fn()}
        onCancelRun={vi.fn()}
      />,
    );
    expect(screen.getByTestId('grid-empty')).toBeInTheDocument();
  });
});
