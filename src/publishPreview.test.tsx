// 🔴 PRE-PUBLISH PREVIEW — the viewer must SEE what the publish prompt is asking
// about.
//
// THE DEFECT, as reported: "the publish to shared grid prompt should show the
// image". `publish()` opens the HOST's confirm dialog — literally titled
// "Publish to the shared grid?" (civitai `PageBlockHost.tsx`, the
// `PUBLISH_GENERATION_OUTPUTS` handler) — and does not resolve until the viewer
// answers it. That dialog is host chrome and text-only, and the block behind it
// rendered nothing but a "Publishing…" spinner, so the viewer was agreeing to
// publish images they had never seen.
//
// 🔴 WHAT THIS REPO CAN AND CANNOT FIX. The dialog itself belongs to the host,
// and it deliberately refuses to render block-supplied thumbnails — the host's
// own comment on the sibling CREATE_POST_FROM_APP gate says a dialog rendering
// "the BLOCK'S strings and the BLOCK'S thumbnails would let a sandboxed iframe
// show one post and publish another", which is why THAT dialog resolves its
// images through a server-side preview. Putting an image inside the publish
// dialog is therefore a HOST change (a `previewPublishOutputs`-shaped call), not
// one this repo can make. What the block owns is the cell underneath it, and the
// succeeded snapshot it already holds carries the viewer's own output urls. So
// the images are rendered there, for the whole window the prompt is open.
//
// WHAT EACH CASE PINS:
//   1. 🔴 RED PRE-CHANGE — driven end to end: while the host's confirm is open,
//      the cell shows the generated image, at the host-provided url.
//   2. the copy names the host's dialog, pinned as a WHOLE STRING — a reworded
//      host makes this line wrong, and a keyword match would not notice.
//   3. NO urls (a succeeded workflow without them, or a resumed run from an
//      older session) degrades to exactly the old progress state — the prompt is
//      never broken by a missing preview.
//   4. a url the browser cannot load leaves the rest of the cell intact (the
//      design-system <Image> fallback, not a blank frame).
//   5. the strip is capped, and says so when it is a subset — `publish()` sends
//      no `imageIndexes`, so EVERY output is published whether or not it is
//      shown, and a silent subset would understate what is being agreed to.

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Harness } from '@civitai/blocks-react/testing';
import type { BlockWorkflowSnapshot } from '@civitai/app-sdk/blocks';
import type { SharedListItem } from '@civitai/blocks-react';

import { App } from './App.js';
import {
  PUBLISH_CONFIRM_MESSAGE,
  PUBLISH_PREVIEW_MAX,
  ResultsGrid,
} from './components/ResultsGrid.js';
import { palette } from './theme.js';
import { cellKey, flattenConfigs } from './lib/benchmark.js';
import type { CellRun, CombinationData, CombinationRow, PromptData, PromptRow } from './types.js';
import { fakeAppStorage, fakeShared, fakeGatedCell, immediateSleep } from './test-helpers.js';

const c = palette();

const comboData: CombinationData = {
  v: 2,
  kind: 'combination',
  configs: [
    {
      id: 'cfgSeed',
      checkpoint: { versionId: 1001, modelId: 500, baseModel: 'SDXL 1.0', modelName: 'JuggernautXL' },
      loras: [],
    },
  ],
};
const promptData: PromptData = {
  v: 3,
  kind: 'prompt',
  default: { prompt: 'cyberpunk portrait', params: { cfgScale: 5, steps: 30 } },
};

function seedRows(): SharedListItem[] {
  return [
    {
      key: 'c1',
      authorUserId: 7,
      count: 3,
      viewerVoted: false,
      value: { title: 'Grid Combo', body: '', data: comboData },
      createdAt: new Date(0),
      updatedAt: new Date(0),
    },
    {
      key: 'p1',
      authorUserId: 8,
      count: 3,
      viewerVoted: false,
      value: { title: 'Grid Prompt', body: '', data: promptData },
      createdAt: new Date(0),
      updatedAt: new Date(0),
    },
  ];
}

const GEN_URL = 'https://image.civitai.com/generated-42.jpeg';
const estimateSnap: BlockWorkflowSnapshot = { workflowId: '', status: 'pending', cost: { total: 12 } };
const processingSnap: BlockWorkflowSnapshot = { workflowId: 'wf1', status: 'processing' };

// ---- component-level: the `publishing` cell in isolation ---------------------

const publishingRun = (previewUrls?: string[]): CellRun => ({
  comboKey: 'c1',
  configId: 'cfgA',
  promptKey: 'p1',
  ecosystem: 'SDXL',
  status: 'publishing',
  ...(previewUrls ? { previewUrls } : {}),
});

const comboOne: CombinationRow = {
  key: 'c1',
  count: 5,
  authorUserId: 1,
  name: 'SDXL Combo',
  description: '',
  data: {
    v: 2,
    kind: 'combination',
    configs: [
      {
        id: 'cfgA',
        label: 'base',
        checkpoint: { versionId: 1001, modelId: 500, baseModel: 'SDXL 1.0', modelName: 'JuggernautXL' },
        loras: [],
      },
    ],
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

function renderPublishingCell(run: CellRun) {
  render(
    <ResultsGrid
      configs={flattenConfigs([comboOne])}
      prompts={[p1]}
      results={[]}
      runs={{ [cellKey('c1', 'cfgA', 'p1')]: run }}
      c={c}
      buzzTotal={5000}
      GatedCell={fakeGatedCell()}
      onRunCell={vi.fn()}
      onConfirmRun={vi.fn()}
      onResumeRun={vi.fn()}
      onCancelRun={vi.fn()}
    />,
  );
}

describe('the publishing cell shows what is about to be published', () => {
  it('2. renders the outputs AND names the host dialog, as a whole string', () => {
    renderPublishingCell(publishingRun([GEN_URL]));

    const preview = screen.getByTestId('cell-publish-preview');
    const img = within(preview).getByTestId('cell-publish-image');
    expect(img).toHaveAttribute('src', GEN_URL);
    // The alt text has to say what the image IS to a screen reader, not just
    // "image" — this is a consent surface.
    expect(img).toHaveAttribute('alt', expect.stringContaining('published to the shared grid'));

    // 🔴 THE WHOLE NORMALISED STRING, not a keyword. This line quotes the host's
    // dialog title; if the host rewords it the app is telling the viewer to look
    // for a prompt that no longer exists, and a `/publish/i` match would pass
    // straight through that.
    expect(screen.getByTestId('cell-publish-notice').textContent).toBe(PUBLISH_CONFIRM_MESSAGE);

    // The status region the a11y suite relies on is unchanged.
    const status = screen.getByTestId('cell-progress');
    expect(status).toHaveAttribute('role', 'status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveAttribute('data-status', 'publishing');
    expect(status).toHaveTextContent('Publishing…');
  });

  it('3. NO urls: the prompt still renders, as the plain progress state', () => {
    renderPublishingCell(publishingRun());

    expect(screen.queryByTestId('cell-publish-preview')).toBeNull();
    expect(screen.queryByTestId('cell-publish-image')).toBeNull();
    // Not broken, not blank: exactly what it rendered before this feature.
    const status = screen.getByTestId('cell-progress');
    expect(status).toHaveAttribute('data-status', 'publishing');
    expect(status).toHaveTextContent('Publishing…');
    expect(screen.getByTestId('cell-publish-notice').textContent).toBe(PUBLISH_CONFIRM_MESSAGE);
  });

  it('3b. an EMPTY url list is the same as none', () => {
    renderPublishingCell(publishingRun([]));
    expect(screen.queryByTestId('cell-publish-preview')).toBeNull();
    expect(screen.getByTestId('cell-progress')).toHaveAttribute('data-status', 'publishing');
  });

  it('4. an unloadable url leaves the prompt intact (the pack fallback, not a blank frame)', async () => {
    renderPublishingCell(publishingRun(['https://image.civitai.com/does-not-load.jpeg']));
    const img = screen.getByTestId('cell-publish-image');
    // Drive the browser's failure directly — jsdom loads nothing on its own.
    img.dispatchEvent(new Event('error'));

    // The slot degrades to the pack's fallback rather than to nothing — which is
    // what makes this a positive control and not just three survivors: without a
    // `fallback` this assertion is the one that goes red.
    expect(await screen.findByText('preview unavailable')).toBeInTheDocument();
    // The cell is still a working prompt: the copy, the status region and the
    // image's own slot all survive the load failure.
    expect(screen.getByTestId('cell-publish-notice').textContent).toBe(PUBLISH_CONFIRM_MESSAGE);
    expect(screen.getByTestId('cell-progress')).toHaveAttribute('data-status', 'publishing');
    expect(screen.getByTestId('cell-publish-preview')).toBeInTheDocument();
  });

  it('5. caps the strip and SAYS so — every output is published, shown or not', () => {
    const urls = Array.from({ length: PUBLISH_PREVIEW_MAX + 2 }, (_, i) => `${GEN_URL}?i=${i}`);
    renderPublishingCell(publishingRun(urls));

    expect(screen.getAllByTestId('cell-publish-image')).toHaveLength(PUBLISH_PREVIEW_MAX);
    expect(screen.getByTestId('cell-publish-more')).toHaveTextContent(
      '+2 more outputs will be published too.',
    );
  });

  it('5b. no "+N more" line when the strip shows everything', () => {
    renderPublishingCell(publishingRun([GEN_URL]));
    expect(screen.getAllByTestId('cell-publish-image')).toHaveLength(1);
    expect(screen.queryByTestId('cell-publish-more')).toBeNull();
  });
});

// ---- driven through the whole run path --------------------------------------

describe('🔴 driven end to end: the image is on screen while the host prompt is open', () => {
  it('1. a real run reaches publishing with the generated output rendered', async () => {
    // `publish` is held OPEN — which is exactly the live shape: it resolves only
    // when the viewer answers the host's confirm dialog. Everything asserted
    // below is asserted DURING that window.
    let releasePublish: ((ids: number[]) => void) | undefined;
    const publish = vi.fn(
      () =>
        new Promise<number[]>((resolve) => {
          releasePublish = resolve;
        }),
    );
    const { shared } = fakeShared({ seed: seedRows() });
    const { appStorage } = fakeAppStorage();

    render(
      <Harness
        viewer={{ id: 99, username: 'me' }}
        theme="dark"
        consentGranted
        buzzBudget={1000}
        buzz={{ balance: 5000 }}
        buzzBalance={{ blue: 0, green: 0, yellow: 5000 }}
        shared={{ seed: [] }}
        showLog={false}
      >
        <App
          deps={{
            resolveResources: async () => [],
            pollIntervalMs: 0,
            sleep: immediateSleep,
            GatedCell: fakeGatedCell({ visibleIds: [9001] }),
            shared,
            appStorage,
            estimate: async () => estimateSnap,
            submit: async () => processingSnap,
            // The host reports the finished workflow WITH the viewer's output
            // urls — `BlockWorkflowSnapshot.imageUrls`, flattened by the host
            // from `steps[].output.images[].url`.
            poll: async () =>
              ({ workflowId: 'wf1', status: 'succeeded', imageUrls: [GEN_URL] }) as BlockWorkflowSnapshot,
            publish,
          }}
        />
      </Harness>,
    );

    await userEvent.click(await screen.findByRole('tab', { name: /^Grids$/ }));
    const grid = await screen.findByTestId('results-grid');
    await userEvent.click(within(grid).getByTestId('run-cell'));
    await userEvent.click(await screen.findByTestId('cell-confirm-run'));

    // 🔴 THE REGRESSION. Pre-change the cell held a bare spinner here and this
    // element did not exist, so the viewer answered the host's "Publish to the
    // shared grid?" prompt without ever seeing the image.
    const img = await screen.findByTestId('cell-publish-image');
    expect(img).toHaveAttribute('src', GEN_URL);
    expect(publish, 'the preview must be up while the confirm is still open').toHaveBeenCalledTimes(1);

    // PREMISE CHECK: the prompt really is still open — the assertion above is
    // about the window before the viewer answers, not after it.
    expect(releasePublish, 'publish resolved before the assertions').toBeDefined();
    releasePublish?.([9001]);

    // …and once they answer, the preview gives way to the published, gated row.
    await waitFor(() => expect(screen.queryByTestId('cell-publish-image')).toBeNull());
  });
});
