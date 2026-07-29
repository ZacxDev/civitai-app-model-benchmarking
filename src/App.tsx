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
  useAppStorage,
  useBlockAnalytics,
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
  usePublishGenerationOutputs,
} from '@civitai/blocks-react';
import type { SharedAppendValue, UseAppStorage, UseSharedStorage } from '@civitai/blocks-react';
import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  SegmentedControl,
  Slider,
  Stack,
} from '@civitai/blocks-react/ui';

import { AI_WRITE_BUDGETED, hasGenerateScope } from './scopes.js';
import { palette, pageStyle, contentStyle, token, radius, mutedText, metaText } from './theme.js';
import type { CellRun, CombinationRow, PromptRow } from './types.js';
import {
  buildCellWorkflowBody,
  buildCombinationPayload,
  buildPromptPayload,
  buildResultPayload,
  cellHasResult,
  cellKey,
  combinationToInput,
  DEFAULT_TOP_N,
  flattenConfigs,
  promptToInput,
  reconcileOptimistic,
  resolveCell,
  splitRows,
  topByVotes,
  type BenchConfig,
  type CombinationInput,
  type PendingOptimistic,
  type PromptInput,
  type RawSharedItem,
} from './lib/benchmark.js';
import { pollToTerminal, mapSnapshotStatus, isTerminalSnapshot } from './lib/workflow.js';
import { CombosView } from './components/CombosView.js';
import { PromptsView } from './components/PromptsView.js';
import { ResultsGrid } from './components/ResultsGrid.js';
import { CombinationForm } from './components/CombinationForm.js';
import { PromptForm } from './components/PromptForm.js';
import { GatedCell as DefaultGatedCell, type GatedCellComponent } from './components/GatedCell.js';

export interface AppDeps {
  pickResource: (opts: {
    resourceType: BlockResourcePickerType;
    baseModelGroup?: string;
  }) => Promise<BlockResourceInfo | null>;
  resolveResources: (ids: number[]) => Promise<BlockResourceInfo[]>;
  estimate: (body: WorkflowBody) => Promise<BlockWorkflowSnapshot>;
  submit: (body: WorkflowBody) => Promise<BlockWorkflowSnapshot>;
  poll: (workflowId: string) => Promise<BlockWorkflowSnapshot>;
  /** Publish a completed generation's own scanned outputs → the created bare
   * `Image` row ids (matches `usePublishGenerationOutputs().publish`). */
  publish: (args: { workflowId: string; imageIndexes?: number[]; title?: string }) => Promise<number[]>;
  shared: UseSharedStorage;
  /** The gated grid-cell renderer (per-viewer moderation boundary). */
  GatedCell: GatedCellComponent;
  requestConsent: (opts: { scopes: string[] }) => void;
  requestSignIn: () => void;
  /** Per-(viewer, block) KV store — durably persists this viewer's voted-set so
   * their up-votes survive a reload (the shared list carries only the aggregate
   * `count`, no per-viewer voted flag). */
  appStorage: UseAppStorage;
  /** Fire-and-forget analytics — the host forwards events to its pipeline. */
  track: (eventName: string, properties?: Record<string, unknown>) => void;
  /** Test seams for the poll loop. */
  pollIntervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export interface AppProps {
  deps?: Partial<AppDeps>;
}

type View = 'combos' | 'prompts' | 'grid';

/** The submit modal: closed, or a combo/prompt form in CREATE or EDIT mode. */
type ModalState =
  | { kind: 'none' }
  | { kind: 'combo'; edit?: CombinationRow }
  | { kind: 'prompt'; edit?: PromptRow };

const LIST_PAGE = 50;
const MAX_PAGES = 40; // safety cap when paging the whole shared list
/** Per-viewer KV key holding this viewer's voted-set (array of shared keys), so
 * the up-vote highlight survives a reload. Versioned for a future shape change. */
const VOTED_STORAGE_KEY = 'voted:v1';

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
  const { publish } = usePublishGenerationOutputs();
  const appStorage = useAppStorage();
  const { track } = useBlockAnalytics();

  const rootRef = useRef<HTMLDivElement>(null);
  useBlockResize(rootRef);

  const c = palette();

  const deps: AppDeps = useMemo(
    () => ({
      pickResource: picker.open,
      resolveResources: genResources.fetch,
      estimate: workflow.estimate,
      submit: workflow.submit,
      poll: workflow.poll,
      publish,
      shared: sharedHook,
      GatedCell: DefaultGatedCell,
      requestConsent,
      requestSignIn,
      appStorage,
      track,
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
  const [modal, setModal] = useState<ModalState>({ kind: 'none' });
  const closeModal = useCallback(() => setModal({ kind: 'none' }), []);
  const [topN, setTopN] = useState<number>(DEFAULT_TOP_N);

  // ---- data ----
  const [items, setItems] = useState<RawSharedItem[]>([]);
  const [votedKeys, setVotedKeys] = useState<Set<string>>(new Set());
  // Mirror of votedKeys for computing the next set outside a state updater
  // (so persistence gets the fresh set without a side-effect in the reducer).
  const votedKeysRef = useRef(votedKeys);
  votedKeysRef.current = votedKeys;
  const [runs, setRuns] = useState<Record<string, CellRun>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  // Locally-applied optimistic append/edit mutations awaiting host confirmation
  // (item 1) — reconciled against every list() re-fetch so a just-added row is
  // never wiped by a read-after-write-lagged list.
  const pendingRef = useRef<Map<string, PendingOptimistic>>(new Map());

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const all = await listAll(depsRef.current.shared);
        if (cancelled) return;
        const { items: merged, pending } = reconcileOptimistic(all, pendingRef.current);
        pendingRef.current = pending;
        setItems(merged);
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

  // Durable vote-state: hydrate this viewer's voted-set from per-viewer KV so
  // their up-vote highlight survives a reload. Best-effort — a KV miss/anon
  // viewer/host error just leaves the in-memory set empty (the aggregate `count`
  // is always host-authoritative regardless).
  useEffect(() => {
    if (!ready || !viewer) return;
    let cancelled = false;
    depsRef.current.appStorage
      .get<string[]>(VOTED_STORAGE_KEY)
      .then((arr) => {
        if (!cancelled && Array.isArray(arr)) setVotedKeys(new Set(arr.filter((k) => typeof k === 'string')));
      })
      .catch(() => {
        /* best-effort — leave the set empty */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, viewer?.id]);

  // Fire a single `block_loaded` analytics event once the host handshake settles.
  const loadedRef = useRef(false);
  useEffect(() => {
    if (ready && !loadedRef.current) {
      loadedRef.current = true;
      depsRef.current.track('block_loaded', { authed: !!viewer });
    }
  }, [ready, viewer]);

  const { combinations, prompts, results } = useMemo(() => splitRows(items), [items]);
  const includedCombos = useMemo(() => topByVotes(combinations, topN), [combinations, topN]);
  const includedPrompts = useMemo(() => topByVotes(prompts, topN), [prompts, topN]);
  // The grid's benchmarkable ROWS are the included combos' configs (flattened,
  // grouped under their combination).
  const includedConfigs = useMemo(() => flattenConfigs(includedCombos), [includedCombos]);
  const includedComboKeys = useMemo(() => new Set(includedCombos.map((r) => r.key)), [includedCombos]);
  const includedPromptKeys = useMemo(() => new Set(includedPrompts.map((r) => r.key)), [includedPrompts]);

  // ---- vote wiring ----
  const applyCount = useCallback((key: string, count: number) => {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, count } : it)));
  }, []);

  // Persist the voted-set to per-viewer KV (best-effort, fire-and-forget). A
  // persistence failure never blocks or fails the vote — the host vote itself is
  // already durable; this only mirrors the per-viewer HIGHLIGHT.
  const persistVoted = useCallback(
    (next: Set<string>) => {
      if (!viewer) return;
      depsRef.current.appStorage.set(VOTED_STORAGE_KEY, [...next]).catch(() => {});
    },
    [viewer],
  );

  const onVote = useCallback(
    async (key: string) => {
      const count = await depsRef.current.shared.vote(key);
      applyCount(key, count);
      const next = new Set(votedKeysRef.current).add(key);
      setVotedKeys(next);
      persistVoted(next);
      depsRef.current.track('vote');
      return count;
    },
    [applyCount, persistVoted],
  );

  const onUnvote = useCallback(
    async (key: string) => {
      const count = await depsRef.current.shared.unvote(key);
      applyCount(key, count);
      const next = new Set(votedKeysRef.current);
      next.delete(key);
      setVotedKeys(next);
      persistVoted(next);
      depsRef.current.track('vote_removed');
      return count;
    },
    [applyCount, persistVoted],
  );

  const requireAuth = useCallback(() => {
    if (!viewer) depsRef.current.requestSignIn();
  }, [viewer]);

  // ---- submit + edit wiring ----
  // Record an optimistic INSERT so a just-appended row shows immediately (item 1)
  // and survives a lagged list() (see reconcileOptimistic).
  const optimisticInsert = useCallback(
    (key: string, value: SharedAppendValue) => {
      if (!viewer) return;
      pendingRef.current.set(key, { value, authorUserId: viewer.id, kind: 'insert' });
      setItems((prev) =>
        prev.some((it) => it.key === key) ? prev : [{ key, count: 0, authorUserId: viewer.id, value }, ...prev],
      );
    },
    [viewer],
  );

  // Record an optimistic UPDATE so an edited row shows its new value immediately
  // and survives a lagged list() until the host reflects it.
  const optimisticUpdate = useCallback(
    (key: string, value: SharedAppendValue) => {
      if (!viewer) return;
      pendingRef.current.set(key, { value, authorUserId: viewer.id, kind: 'update' });
      setItems((prev) => prev.map((it) => (it.key === key ? { ...it, value } : it)));
    },
    [viewer],
  );

  const submitCombination = useCallback(
    async (input: CombinationInput) => {
      const payload = buildCombinationPayload(input) as SharedAppendValue;
      const { key } = await depsRef.current.shared.append(payload);
      optimisticInsert(key, payload);
      depsRef.current.track('submit_combo', {
        configCount: input.configs.filter((cfg) => cfg?.checkpoint).length,
      });
      closeModal();
      reload();
    },
    [reload, closeModal, optimisticInsert],
  );

  const submitPrompt = useCallback(
    async (input: PromptInput) => {
      const payload = buildPromptPayload(input) as SharedAppendValue;
      const { key } = await depsRef.current.shared.append(payload);
      optimisticInsert(key, payload);
      depsRef.current.track('submit_prompt', {
        overrideCount: Object.keys(input.overrides ?? {}).length,
      });
      closeModal();
      reload();
    },
    [reload, closeModal, optimisticInsert],
  );

  const updateCombination = useCallback(
    async (key: string, input: CombinationInput) => {
      const payload = buildCombinationPayload(input) as SharedAppendValue;
      await depsRef.current.shared.update(key, payload);
      optimisticUpdate(key, payload);
      closeModal();
      reload();
    },
    [reload, closeModal, optimisticUpdate],
  );

  const updatePrompt = useCallback(
    async (key: string, input: PromptInput) => {
      const payload = buildPromptPayload(input) as SharedAppendValue;
      await depsRef.current.shared.update(key, payload);
      optimisticUpdate(key, payload);
      closeModal();
      reload();
    },
    [reload, closeModal, optimisticUpdate],
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
    async (row: BenchConfig, prompt: PromptRow) => {
      const ck = cellKey(row.comboKey, row.config.id, prompt.key);
      // Best-effort dedup: a result already in the grid isn't re-run.
      if (cellHasResult(results, row.comboKey, row.config.id, prompt.key)) return;
      // Every cell is runnable now — there is always a default prompt.
      const matched = resolveCell(row.config, prompt);
      if (!viewer) {
        depsRef.current.requestSignIn();
        return;
      }
      if (!hasGenerateScope(token.scopes)) {
        depsRef.current.requestConsent({ scopes: [AI_WRITE_BUDGETED] });
        return;
      }
      setRun(ck, { comboKey: row.comboKey, configId: row.config.id, promptKey: prompt.key, ecosystem: matched.ecosystem, status: 'estimating', error: undefined });
      depsRef.current.track('run_cell', { ecosystem: matched.ecosystem });
      try {
        const body = buildCellWorkflowBody(row.config, row.comboKey, prompt);
        const snap = await depsRef.current.estimate(body);
        setRun(ck, { status: 'confirming', estimatedCost: snap.cost?.total });
      } catch (e) {
        setRun(ck, { status: 'failed', error: errMsg(e) });
      }
    },
    [results, viewer, token.scopes, setRun],
  );

  const confirmRun = useCallback(
    async (row: BenchConfig, prompt: PromptRow) => {
      const ck = cellKey(row.comboKey, row.config.id, prompt.key);
      setRun(ck, { status: 'submitting' });
      try {
        const body = buildCellWorkflowBody(row.config, row.comboKey, prompt);
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
        const imageIds = await depsRef.current.publish({ workflowId: terminal.workflowId });
        depsRef.current.track('publish', { imageCount: imageIds.length });
        const matched = resolveCell(row.config, prompt);
        // Re-check dedup right before append (another viewer may have raced).
        if (!cellHasResult(results, row.comboKey, row.config.id, prompt.key) && imageIds.length > 0) {
          const payload = buildResultPayload({
            comboKey: row.comboKey,
            configId: row.config.id,
            promptKey: prompt.key,
            ecosystem: matched.ecosystem,
            imageIds,
            // App-level attribution of the PROMPT submitter (the column author),
            // alongside the host's single-key spend attribution to the combo
            // (sharedContentKey — see buildCellWorkflowBody). Omitted when the
            // prompt's author is unknown/anonymous (id 0).
            ...(prompt.authorUserId ? { promptAuthorUserId: prompt.authorUserId } : {}),
          }) as SharedAppendValue;
          const { key } = await depsRef.current.shared.append(payload);
          // Show the result in the grid immediately — an optimistic insert (like
          // submitCombination/submitPrompt) so the cell renders the published
          // image right away instead of falling back to "not generated yet"
          // until a lagged list() refetch (appsDb read-after-write) catches up.
          optimisticInsert(key, payload);
        }
        setRun(ck, null);
        reload();
      } catch (e) {
        setRun(ck, { status: 'failed', error: errMsg(e) });
      }
    },
    [results, reload, setRun, optimisticInsert],
  );

  const cancelRun = useCallback((row: BenchConfig, prompt: PromptRow) => {
    setRun(cellKey(row.comboKey, row.config.id, prompt.key), null);
  }, [setRun]);

  const buzzTotal =
    buzz.balance != null ? buzz.balance.blue + buzz.balance.green + buzz.balance.yellow : null;

  // ---- render ----
  if (!ready) {
    return (
      <div ref={rootRef} data-theme={theme} style={pageStyle(c)}>
        <Stack align="center" gap={12} style={{ margin: 'auto' }} data-testid="app-loading">
          <Loader />
          <span style={metaText}>Loading Model Benchmarking…</span>
        </Stack>
      </div>
    );
  }

  return (
    <div ref={rootRef} data-theme={theme} style={pageStyle(c)}>
      <div style={contentStyle}>
        <Group
          justify="space-between"
          align="center"
          gap={12}
          style={{ paddingBottom: 14, borderBottom: `1px solid ${c.border}` }}
        >
          <Group gap={12} align="center" wrap={false}>
            <span aria-hidden="true" style={brandMarkStyle(c)}>
              <ChartBarIcon />
            </span>
            <Stack gap={2}>
              <strong style={{ fontSize: 19, letterSpacing: '-0.01em', lineHeight: 1.2 }}>
                Model Benchmarking
              </strong>
              <span style={metaText}>Crowdsourced model-comparison grid</span>
            </Stack>
          </Group>
          {buzzTotal != null && (
            <Badge variant="light" size="lg" data-testid="buzz-balance">
              {buzzTotal.toLocaleString()} Buzz
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
            onSubmitNew={() => setModal({ kind: 'combo' })}
            onVote={onVote}
            onUnvote={onUnvote}
            onRequireAuth={requireAuth}
            onEdit={(combo) => setModal({ kind: 'combo', edit: combo })}
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
            onSubmitNew={() => setModal({ kind: 'prompt' })}
            onVote={onVote}
            onUnvote={onUnvote}
            onRequireAuth={requireAuth}
            onEdit={(prompt) => setModal({ kind: 'prompt', edit: prompt })}
          />
        )}

        {view === 'grid' && (
          <Stack gap={14} data-testid="grid-view">
            <Group justify="space-between" align="flex-end" gap={12}>
              <span style={{ ...mutedText, flex: '1 1 260px', minWidth: 0 }}>
                Included combinations × prompts. Run an empty cell to contribute its outputs to the shared grid.
              </span>
              <div style={{ width: 200 }}>
                <Slider
                  label="Top-N included"
                  showValue
                  min={1}
                  max={20}
                  value={topN}
                  onChange={(v) => setTopN(v || DEFAULT_TOP_N)}
                  data-testid="top-n"
                />
              </div>
            </Group>
            {!canGenerate && viewer && (
              <Alert color="info" data-testid="grid-consent">
                <Group justify="space-between" align="center" gap={10}>
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
              configs={includedConfigs}
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

        <Modal
          opened={modal.kind === 'combo'}
          onClose={closeModal}
          title={modal.kind === 'combo' && modal.edit ? 'Edit combination' : 'Submit a combination'}
          size="lg"
        >
          {modal.kind === 'combo' && (
            <CombinationForm
              key={modal.edit?.key ?? 'new'}
              pickResource={deps.pickResource}
              initial={modal.edit ? combinationToInput(modal.edit) : undefined}
              submitLabel={modal.edit ? 'Save changes' : undefined}
              onSubmit={
                modal.edit
                  ? (input) => updateCombination(modal.edit!.key, input)
                  : submitCombination
              }
              onCancel={closeModal}
            />
          )}
        </Modal>
        <Modal
          opened={modal.kind === 'prompt'}
          onClose={closeModal}
          title={modal.kind === 'prompt' && modal.edit ? 'Edit prompt' : 'Submit a prompt'}
          size="lg"
        >
          {modal.kind === 'prompt' && (
            <PromptForm
              key={modal.edit?.key ?? 'new'}
              initial={modal.edit ? promptToInput(modal.edit) : undefined}
              submitLabel={modal.edit ? 'Save changes' : undefined}
              onSubmit={
                modal.edit ? (input) => updatePrompt(modal.edit!.key, input) : submitPrompt
              }
              onCancel={closeModal}
            />
          )}
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

/** A tinted rounded tile that holds the brand mark (matches the manifest's
 * `chart-bar` page icon), styled entirely off `--civitai-*` tokens. */
function brandMarkStyle(c: Pick<ReturnType<typeof palette>, 'border'>): React.CSSProperties {
  return {
    display: 'grid',
    placeItems: 'center',
    width: 38,
    height: 38,
    flexShrink: 0,
    borderRadius: radius.md,
    color: token.primary,
    background: token.primaryLight,
    border: `1px solid ${c.border}`,
  };
}

/** Inline `chart-bar` glyph (currentColor), no external icon dependency. */
function ChartBarIcon(): React.JSX.Element {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 20h16M7 20V10M12 20V4M17 20v-7"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
