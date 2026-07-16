// Grid render matrix: a RESULT cell (with a gated visible + a gated HIDDEN
// image), an EMPTY cell (offering a run), and a NOT-RUNNABLE (N/A) cell where the
// prompt has no entry for the combo's ecosystem. Renders ResultsGrid directly
// with hand-built rows so the matrix + gated-cell paths are exercised
// deterministically (no key-minting from the mock host).

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ResultsGrid } from './ResultsGrid.js';
import { palette } from '../theme.js';
import { fakeGatedCell } from '../test-helpers.js';
import type { CombinationRow, PromptRow, ResultRow } from '../types.js';

const c = palette(true);

const comboSdxl: CombinationRow = {
  key: 'c1',
  count: 5,
  authorUserId: 1,
  name: 'SDXL Combo',
  description: '',
  data: { v: 1, kind: 'combination', checkpoint: { versionId: 1001, modelId: 500, baseModel: 'SDXL 1.0', modelName: 'JuggernautXL' }, loras: [] },
};
const comboFlux: CombinationRow = {
  key: 'c2',
  count: 4,
  authorUserId: 1,
  name: 'Flux Combo',
  description: '',
  data: { v: 1, kind: 'combination', checkpoint: { versionId: 3003, modelId: 700, baseModel: 'Flux.1 D', modelName: 'FluxBase' }, loras: [] },
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
// A result exists ONLY for the c1 × p1 cell.
const result: ResultRow = {
  key: 'r1',
  authorUserId: 1,
  data: { v: 1, kind: 'result', comboKey: 'c1', promptKey: 'p1', ecosystem: 'SDXL', imageIds: [501, 777] },
};

function renderGrid(canRun = true) {
  const onRunCell = vi.fn();
  render(
    <ResultsGrid
      combinations={[comboSdxl, comboFlux]}
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
  return { onRunCell };
}

describe('ResultsGrid render', () => {
  it('renders a 2×2 matrix with the right per-cell states', () => {
    renderGrid();
    // 4 body cells
    expect(screen.getAllByTestId('grid-cell')).toHaveLength(4);
    // sticky headers: 2 columns + 2 rows
    expect(screen.getAllByTestId('grid-col-header')).toHaveLength(2);
    expect(screen.getAllByTestId('grid-row-header')).toHaveLength(2);
  });

  it('renders the RESULT cell with the gated visible image AND the gated HIDDEN placeholder', () => {
    renderGrid();
    const cells = screen.getAllByTestId('grid-cell');
    const resultCell = cells.find((el) => el.getAttribute('data-state') === 'result')!;
    expect(resultCell).toBeInTheDocument();
    // 501 is visible, 777 is gated-hidden — BOTH paths render
    expect(within(resultCell).getByTestId('result-image')).toBeInTheDocument();
    expect(within(resultCell).getByTestId('result-hidden')).toBeInTheDocument();
  });

  it('renders an EMPTY cell offering a run (c1 × p2)', () => {
    const { onRunCell } = renderGrid();
    const cells = screen.getAllByTestId('grid-cell');
    const empty = cells.filter((el) => el.getAttribute('data-state') === 'empty');
    expect(empty).toHaveLength(1);
    within(empty[0]).getByTestId('run-cell').click();
    expect(onRunCell).toHaveBeenCalledWith(comboSdxl, p2);
  });

  it('renders N/A cells where the prompt has no entry for the combo ecosystem (Flux × SDXL-only)', () => {
    renderGrid();
    const na = screen.getAllByTestId('grid-cell').filter((el) => el.getAttribute('data-state') === 'na');
    expect(na).toHaveLength(2); // comboFlux × p1 and × p2
    // the N/A note names the COMBO's ecosystem (Flux) that the prompt lacks
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
        combinations={[]}
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
