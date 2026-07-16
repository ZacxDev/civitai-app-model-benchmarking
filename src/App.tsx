// Model Benchmarking — top-level full-page app.
//
// Owns every SDK hook (block context/token, resource picker, generation-resource
// rehydrate, the Buzz workflow money path + balance, shared storage, consent,
// and the 0.30 publish/gated bridges) and routes between three tabs — Combos,
// Prompts, Grid — via a SegmentedControl. Submit flows are modals. The hooks are
// collapsed into an injectable `deps` bag so component + e2e tests drive the
// exact same App with canned picks/workflows/publish/gated, OR against the real
// SDK mock host.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  BlockResourceInfo,
  BlockResourcePickerType,
  BlockWorkflowSnapshot,
  WorkflowBody,
} from '@civitai/app-sdk/blocks';

import {
  useBlockContext,
  useBlockResize,
  useBlockToken,
  useBuzzBalance,
  useBuzzWorkflow,
  useGenerationResources,
  useRequestConsent,
  useRequestSignIn,
  useResourcePicker,
  useSharedStorage,
} from '@civitai/blocks-react';
import type { SharedAppendValue, UseSharedStorage } from '@civitai/blocks-react';
import { Alert, Badge, Button, Group, Modal, NumberInput, Stack } from '@civitai/blocks-react/ui';

import { AI_WRITE_BUDGETED, hasGenerateScope } from './scopes.js';
import { palette, pageStyle, contentStyle } from './theme.js';
import type { CellRun, CombinationRow, PromptRow } from './types.js';
import {
  buildCellWorkflowBody,
  buildCombinationPayload,
  buildPromptPayload,
  buildResultPayload,
  cellHasResult,
  cellKey,
  DEFAULT_TOP_N,
  resolveCell,
  splitRows,
  topByVotes,
  type CombinationInput,
  type PromptInput,
  type RawSharedItem,
} from './lib/benchmark.js';
import { pollToTerminal, mapSnapshotStatus, isTerminalSnapshot } from './lib/workflow.js';
import { usePublishOutputs, type GatedCellComponent, type PublishOutputs } from './lib/generation-bridge.js';
import { SegmentedControl } from './components/SegmentedControl.js';
import { CombosView } from './components/CombosView.js';
import { PromptsView } from './components/PromptsView.js';
import { ResultsGrid } from './components/ResultsGrid.js';
import { CombinationForm } from './components/CombinationForm.js';
import { PromptForm } from './components/PromptForm.js';
import { GatedCell as DefaultGatedCell } from './components/GatedCell.js';

export interface AppDeps {
  pickResource: (opts: {
    resourceType: BlockResourcePickerType;
    baseModelGroup?: string;
  }) => Promise<BlockResourceInfo | null>;
  resolveResources: (ids: number[]) => Promise<BlockResourceInfo[]>;
  estimate: (body: WorkflowBody) => Promise<BlockWorkflowSnapshot>;
  submit: (body: WorkflowBody) => Promise<BlockWorkflowSnapshot>;
  poll: (workflowId: string) => Promise<BlockWorkflowSnapshot>;
  /** Publish a completed generation's own scanned outputs → { imageIds }. */
  publishOutputs: PublishOutputs;
  shared: UseSharedStorage;
  /** The gated grid-cell renderer (per-viewer moderation boundary). */
  GatedCell: GatedCellComponent;
  requestConsent: (opts: { scopes: string[] }) => void;
  requestSignIn: () => void;
  /** Test seams for the poll loop. */
  pollIntervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export interface AppProps {
  deps?: Partial<AppDeps>;
}

type View = 'combos' | 'prompts' | 'grid';
type ModalKind = 'none' | 'combo' | 'prompt';

const LIST_PAGE = 50;
const MAX_PAGES = 40; // safety cap when paging the whole shared list

export function App({ deps: depsOverride }: AppProps = {}) {
  const { ready, viewer, theme } = useBlockContext();
  const token = useBlockToken();
  const picker = useResourcePicker();
  const genResources = useGenerationResources();
  const workflow = useBuzzWorkflow();
  const sharedHook = useSharedStorage();
  const buzz = useBuzzBalance();
  const { requestConsent } = useRequestConsent();
  const { requestSignIn } = useRequestSignIn();
  const publish = usePublishOutputs();

  const rootRef = useRef<HTMLDivElement>(null);
  useBlockResize(rootRef);

  const c = palette(theme !== 'light');

  const deps: AppDeps = useMemo(
    () => ({
      pickResource: picker.open,
      resolveResources: genResources.fetch,
      estimate: workflow.estimate,
      submit: workflow.submit,
      poll: workflow.poll,
      publishOutputs: publish,
      shared: sharedHook,
      GatedCell: DefaultGatedCell,
      requestConsent,
      requestSignIn,
      ...depsOverride,
    }),
    // Hook objects are stable across renders (SDK contract); depsOverride is
    // fixed per test.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [depsOverride],
  );
  const depsRef = useRef(deps);
  depsRef.current = deps;

  const canGenerate = hasGenerateScope(token.scopes);

  // ---- view + modal state ----
  const [view, setView] = useState<View>('combos');
  const [modal, setModal] = useState<ModalKind>('none');
  const [topN, setTopN] = useState<number>(DEFAULT_TOP_N);

  // ---- data ----
  const [items, setItems] = useState<RawSharedItem[]>([]);
  const [votedKeys, setVotedKeys] = useState<Set<string>>(new Set());
  const [runs, setRuns] = useState<Record<string, CellRun>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const all = await listAll(depsRef.current.shared);
        if (!cancelled) setItems(all);
      } catch (e) {
        if (!cancelled) setError(errMsg(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, reloadKey]);

  const { combinations, prompts, results } = useMemo(() => splitRows(items), [items]);
  const includedCombos = useMemo(() => topByVotes(combinations, topN), [combinations, topN]);
  const includedPrompts = useMemo(() => topByVotes(prompts, topN), [prompts, topN]);
  const includedComboKeys = useMemo(() => new Set(includedCombos.map((r) => r.key)), [includedCombos]);
  const includedPromptKeys = useMemo(() => new Set(includedPrompts.map((r) => r.key)), [includedPrompts]);

  // ---- vote wiring ----
  const applyCount = useCallback((key: string, count: number) => {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, count } : it)));
  }, []);

  const onVote = useCallback(
    async (key: string) => {
      const count = await depsRef.current.shared.vote(key);
      applyCount(key, count);
      setVotedKeys((prev) => new Set(prev).add(key));
      return count;
    },
    [applyCount],
  );

  const onUnvote = useCallback(
    async (key: string) => {
      const count = await depsRef.current.shared.unvote(key);
      applyCount(key, count);
      setVotedKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      return count;
    },
    [applyCount],
  );

  const requireAuth = useCallback(() => {
    if (!viewer) depsRef.current.requestSignIn();
  }, [viewer]);

  // ---- submit wiring ----
  const submitCombination = useCallback(
    async (input: CombinationInput) => {
      const payload = buildCombinationPayload(input) as SharedAppendValue;
      await depsRef.current.shared.append(payload);
      setModal('none');
      reload();
    },
    [reload],
  );

  const submitPrompt = useCallback(
    async (input: PromptInput) => {
      const payload = buildPromptPayload(input) as SharedAppendValue;
      await depsRef.current.shared.append(payload);
      setModal('none');
      reload();
    },
    [reload],
  );

  // ---- runner: estimate → confirm → submit → poll → publish → append ----
  const setRun = useCallback((ck: string, patch: Partial<CellRun> | null) => {
    setRuns((prev) => {
      if (patch === null) {
        const next = { ...prev };
        delete next[ck];
        return next;
      }
      const base = prev[ck] ?? ({ status: 'idle' } as CellRun);
      return { ...prev, [ck]: { ...base, ...patch } };
    });
  }, []);

  const beginRun = useCallback(
    async (combo: CombinationRow, prompt: PromptRow) => {
      const ck = cellKey(combo.key, prompt.key);
      // Best-effort dedup: a result already in the grid isn't re-run.
      if (cellHasResult(results, combo.key, prompt.key)) return;
      if (!resolveCell(combo, prompt)) return; // not runnable (no ecosystem prompt)
      if (!viewer) {
        depsRef.current.requestSignIn();
        return;
      }
      if (!hasGenerateScope(token.scopes)) {
        depsRef.current.requestConsent({ scopes: [AI_WRITE_BUDGETED] });
        return;
      }
      setRun(ck, { comboKey: combo.key, promptKey: prompt.key, ecosystem: resolveCell(combo, prompt)!.ecosystem, status: 'estimating', error: undefined });
      try {
        const body = buildCellWorkflowBody(combo, prompt);
        const snap = await depsRef.current.estimate(body);
        setRun(ck, { status: 'confirming', estimatedCost: snap.cost?.total });
      } catch (e) {
        setRun(ck, { status: 'failed', error: errMsg(e) });
      }
    },
    [results, viewer, token.scopes, setRun],
  );

  const confirmRun = useCallback(
    async (combo: CombinationRow, prompt: PromptRow) => {
      const ck = cellKey(combo.key, prompt.key);
      setRun(ck, { status: 'submitting' });
      try {
        const body = buildCellWorkflowBody(combo, prompt);
        const first = await depsRef.current.submit(body);
        if (first.status === 'failed') {
          setRun(ck, { status: 'failed', error: first.error ?? 'Generation failed.' });
          return;
        }
        setRun(ck, { status: 'processing', workflowId: first.workflowId });
        const terminal = await pollToTerminal(depsRef.current.poll, first, {
          sleep: depsRef.current.sleep,
          delayMs: depsRef.current.pollIntervalMs,
          maxDelayMs: depsRef.current.pollIntervalMs,
        });
        if (!isTerminalSnapshot(terminal.status)) {
          setRun(ck, { status: 'stalled', workflowId: terminal.workflowId });
          return;
        }
        if (terminal.status !== 'succeeded') {
          setRun(ck, { status: mapSnapshotStatus(terminal.status), error: terminal.error });
          return;
        }
        // Publish the generation's own scanned outputs, then append the result row.
        setRun(ck, { status: 'publishing' });
        const { imageIds } = await depsRef.current.publishOutputs({ workflowId: terminal.workflowId });
        const matched = resolveCell(combo, prompt);
        // Re-check dedup right before append (another viewer may have raced).
        if (!cellHasResult(results, combo.key, prompt.key) && imageIds.length > 0) {
          const payload = buildResultPayload({
            comboKey: combo.key,
            promptKey: prompt.key,
            ecosystem: matched?.ecosystem ?? '',
            imageIds,
          }) as SharedAppendValue;
          await depsRef.current.shared.append(payload);
        }
        setRun(ck, null);
        reload();
      } catch (e) {
        setRun(ck, { status: 'failed', error: errMsg(e) });
      }
    },
    [results, reload, setRun],
  );

  const cancelRun = useCallback((combo: CombinationRow, prompt: PromptRow) => {
    setRun(cellKey(combo.key, prompt.key), null);
  }, [setRun]);

  const buzzTotal =
    buzz.balance != null ? buzz.balance.blue + buzz.balance.green + buzz.balance.yellow : null;

  // ---- render ----
  if (!ready) {
    return (
      <div ref={rootRef} data-theme={theme} style={pageStyle(c)}>
        <div style={{ margin: 'auto', opacity: 0.7 }} data-testid="app-loading">
          Loading Model Benchmarking…
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef} data-theme={theme} style={pageStyle(c)}>
      <div style={contentStyle}>
        <Group justify="space-between" align="center">
          <Stack gap={2}>
            <strong style={{ fontSize: 18 }}>Model Benchmarking</strong>
            <span style={{ opacity: 0.6, fontSize: 12 }}>Crowdsourced model-comparison grid</span>
          </Stack>
          {buzzTotal != null && (
            <Badge variant="light" data-testid="buzz-balance">
              {buzzTotal} Buzz
            </Badge>
          )}
        </Group>

        <SegmentedControl
          fullWidth
          value={view}
          onChange={(v) => setView(v as View)}
          data-testid="view-switch"
          data={[
            { value: 'combos', label: `Combinations (${combinations.length})` },
            { value: 'prompts', label: `Prompts (${prompts.length})` },
            { value: 'grid', label: 'Grid' },
          ]}
        />

        {view === 'combos' && (
          <CombosView
            combinations={combinations}
            includedKeys={includedComboKeys}
            votedKeys={votedKeys}
            viewerId={viewer?.id ?? null}
            loading={loading}
            error={error}
            onSubmitNew={() => setModal('combo')}
            onVote={onVote}
            onUnvote={onUnvote}
            onRequireAuth={requireAuth}
          />
        )}

        {view === 'prompts' && (
          <PromptsView
            prompts={prompts}
            includedKeys={includedPromptKeys}
            votedKeys={votedKeys}
            viewerId={viewer?.id ?? null}
            loading={loading}
            error={error}
            onSubmitNew={() => setModal('prompt')}
            onVote={onVote}
            onUnvote={onUnvote}
            onRequireAuth={requireAuth}
          />
        )}

        {view === 'grid' && (
          <Stack gap={12} data-testid="grid-view">
            <Group justify="space-between" align="flex-end">
              <span style={{ opacity: 0.7, fontSize: 13 }}>
                Included combinations × prompts. Run an empty cell to contribute its outputs to the shared grid.
              </span>
              <div style={{ width: 130 }}>
                <NumberInput
                  label="Top-N included"
                  min={1}
                  max={20}
                  value={topN}
                  onChange={(v) => setTopN(v ?? DEFAULT_TOP_N)}
                  data-testid="top-n"
                />
              </div>
            </Group>
            {!canGenerate && viewer && (
              <Alert color="info" data-testid="grid-consent">
                <Group justify="space-between" align="center">
                  <span>Grant generation access to run cells and contribute outputs.</span>
                  <Button
                    size="sm"
                    onClick={() => deps.requestConsent({ scopes: [AI_WRITE_BUDGETED] })}
                    data-testid="grid-grant"
                  >
                    Enable generation
                  </Button>
                </Group>
              </Alert>
            )}
            <ResultsGrid
              combinations={includedCombos}
              prompts={includedPrompts}
              results={results}
              runs={runs}
              c={c}
              canRun={canGenerate && !!viewer}
              GatedCell={deps.GatedCell}
              onRunCell={beginRun}
              onConfirmRun={confirmRun}
              onCancelRun={cancelRun}
            />
          </Stack>
        )}

        <Modal opened={modal === 'combo'} onClose={() => setModal('none')} title="Submit a combination" size="lg">
          <CombinationForm pickResource={deps.pickResource} onSubmit={submitCombination} onCancel={() => setModal('none')} />
        </Modal>
        <Modal opened={modal === 'prompt'} onClose={() => setModal('none')} title="Submit a prompt" size="lg">
          <PromptForm onSubmit={submitPrompt} onCancel={() => setModal('none')} />
        </Modal>
      </div>
    </div>
  );
}

/** Page the WHOLE shared list (newest-first) into a flat RawSharedItem[]. */
async function listAll(shared: UseSharedStorage): Promise<RawSharedItem[]> {
  const out: RawSharedItem[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const res = await shared.list({ limit: LIST_PAGE, cursor });
    for (const it of res.items) {
      out.push({ key: it.key, count: it.count, authorUserId: it.authorUserId, value: it.value });
    }
    if (!res.nextCursor) break;
    cursor = res.nextCursor;
  }
  return out;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong.';
}
