// Grid render matrix: rows are CONFIGS (flattened + grouped under their
// combination). A RESULT cell (gated visible + gated HIDDEN image), an EMPTY cell
// (offering a run), and a NOT-RUNNABLE (N/A) cell where the prompt has no entry
// for the config's ecosystem. Renders ResultsGrid directly with hand-built config
// rows so the matrix + gated-cell + config-grouping paths are exercised
// deterministically (no key-minting from the mock host).

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ResultsGrid } from './ResultsGrid.js';
import { palette } from '../theme.js';
import { fakeGatedCell } from '../test-helpers.js';
import { flattenConfigs } from '../lib/benchmark.js';
import type { CombinationRow, PromptRow, ResultRow } from '../types.js';

const c = palette(true);

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
  data: { v: 1, kind: 'prompt', byEcosystem: { SDXL: { prompt: 'x', params: {} } } },
};
const p2: PromptRow = {
  key: 'p2',
  count: 8,
  authorUserId: 1,
  name: 'Landscape',
  description: '',
  data: { v: 1, kind: 'prompt', byEcosystem: { SDXL: { prompt: 'y', params: {} } } },
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
    // cfgA×p2, cfgB×p1, cfgB×p2 = 3 empty SDXL cells
    expect(empties).toHaveLength(3);
    within(empties[0]).getByTestId('run-cell').click();
    // first empty is cfgA × p2
    expect(onRunCell).toHaveBeenCalledWith(configs[0], p2);
  });

  it('renders N/A cells where the prompt has no entry for the config ecosystem (Flux × SDXL-only)', () => {
    renderGrid();
    const na = screen.getAllByTestId('grid-cell').filter((el) => el.getAttribute('data-state') === 'na');
    expect(na).toHaveLength(2); // Flux config × p1 and × p2
    expect(na[0]).toHaveTextContent(/No Flux prompt/);
  });

  it('disables the run affordance when the viewer cannot generate', () => {
    renderGrid(false);
    const empty = screen.getAllByTestId('grid-cell').find((el) => el.getAttribute('data-state') === 'empty')!;
    expect(within(empty).getByTestId('run-cell')).toBeDisabled();
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
