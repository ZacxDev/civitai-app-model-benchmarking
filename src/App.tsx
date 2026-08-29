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
  WorkflowEstimateError,
} from '@civitai/blocks-react';
import type { SharedAppendValue, UseAppStorage, UseSharedStorage } from '@civitai/blocks-react';
import {
  Alert,
  Button,
  Group,
  Loader,
  Modal,
  SegmentedControl,
  Slider,
  Stack,
} from '@civitai/blocks-react/ui';

import { AI_WRITE_BUDGETED, hasGenerateScope } from './scopes.js';
import { COMPACT_ATTR, compactTapTargetCss } from './compact.js';
import { useIsMobile } from './useMediaQuery.js';
import { palette, pageStyle, contentStyle, token, radius, mutedText, metaText } from './theme.js';
import type { CellRun, CombinationRow, InflightRun, PromptRow } from './types.js';
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

/**
 * Viewer-facing copy for a `WorkflowEstimateError` (`@civitai/blocks-react`
 * 0.43.0, civitai/civitai#4159). Two constants rather than one because the two
 * `code`s are genuinely different situations for the viewer, and because the
 * server's own explanation (`err.snapshot.error`) is deliberately NOT shown:
 * it is server-authored and unsanitised — raw upstream text, database
 * constraint names among it — so it goes to the developer console instead.
 * `err.message` is not shown either; it is the library's developer string and
 * names a JS property.
 */
export const ESTIMATE_FAILED_MESSAGE =
  "Couldn't price this run — the server declined to estimate it. Try a different combination, or try again later.";
export const ESTIMATE_NO_COST_MESSAGE =
  "Couldn't price this run — no price came back. Please try again.";

const LIST_PAGE = 50;
const MAX_PAGES = 40; // safety cap when paging the whole shared list
/** Per-viewer KV key holding this viewer's voted-set (array of shared keys), so
 * the up-vote highlight survives a reload. Versioned for a future shape change. */
const VOTED_STORAGE_KEY = 'voted:v1';
/** Per-viewer KV flag: set once the viewer dismisses the "How this works" panel,
 * so the one-time explainer stays dismissed across reloads. */
const HOWTO_STORAGE_KEY = 'howto-dismissed:v1';
/** Per-viewer KV key PREFIX under which each in-flight cell run is persisted
 * (one row per cell: `inflight:v1:<cellKey>`). Read on load to rehydrate still-
 * running cells so a reload never re-charges them (see {@link InflightRun}). */
const INFLIGHT_PREFIX = 'inflight:v1:';
const inflightKey = (ck: string): string => `${INFLIGHT_PREFIX}${ck}`;

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

  // Narrow-viewport layout switch. This is the ONLY consumer of `useIsMobile()`
  // — it stamps `data-mb-compact` on the root and mounts the compact
  // stylesheet, so the hook is load-bearing rather than the dead seam it was.
  const isMobile = useIsMobile();

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
  // One-time "How this works" explainer. `null` = still hydrating the dismissed
  // flag (render nothing yet — no flash-then-hide); `false` = show; `true` = hide.
  const [howtoDismissed, setHowtoDismissed] = useState<boolean | null>(null);

  // ---- data ----
  const [items, setItems] = useState<RawSharedItem[]>([]);
  const [votedKeys, setVotedKeys] = useState<Set<string>>(new Set());
  // Mirror of votedKeys for computing the next set outside a state updater
  // (so persistence gets the fresh set without a side-effect in the reducer).
  const votedKeysRef = useRef(votedKeys);
  votedKeysRef.current = votedKeys;
  const [runs, setRuns] = useState<Record<string, CellRun>>({});
  // Mirror of `runs` for reading the live workflowId outside a state updater
  // (resume-poll reads it without re-subscribing the callback to `runs`).
  const runsRef = useRef(runs);
  runsRef.current = runs;
  // 🔴 MONEY SAFETY: synchronous in-flight claim set — a second `confirmRun`/
  // `resumeRun` for a cell already mid-submit returns immediately, so a double-
  // fire (ghost tap, batched re-render before the confirm button unmounts) can
  // NEVER spend Buzz twice. Deterministic, not render-timing-dependent.
  const inFlightRef = useRef<Set<string>>(new Set());
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

  // Hydrate the one-time "How this works" dismissed flag from per-viewer KV.
  // Best-effort: a miss / anon viewer / host error just shows the explainer.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    depsRef.current.appStorage
      .get<boolean>(HOWTO_STORAGE_KEY)
      .then((v) => {
        if (!cancelled) setHowtoDismissed(v === true);
      })
      .catch(() => {
        if (!cancelled) setHowtoDismissed(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const dismissHowto = useCallback(() => {
    setHowtoDismissed(true);
    depsRef.current.appStorage.set(HOWTO_STORAGE_KEY, true).catch(() => {});
  }, []);

  // 🔴 MONEY SAFETY: rehydrate IN-FLIGHT cell runs from per-viewer KV on load, so
  // a generation still running from a prior session/reload renders as in-flight
  // (its workflowId + a resume-poll) rather than an empty runnable cell — which
  // would let a re-run double-charge and orphan the first generation's outputs.
  // Best-effort: an anon viewer / KV miss / host error just leaves `runs` empty.
  useEffect(() => {
    if (!ready || !viewer) return;
    let cancelled = false;
    (async () => {
      try {
        const { keys } = await depsRef.current.appStorage.list({ prefix: INFLIGHT_PREFIX });
        for (const { key } of keys) {
          if (cancelled) return;
          // Defensive: only trust keys under our prefix (a fake/host may over-return).
          if (!key.startsWith(INFLIGHT_PREFIX)) continue;
          const entry = await depsRef.current.appStorage.get<InflightRun>(key);
          if (cancelled) return;
          if (!entry || typeof entry.workflowId !== 'string' || !entry.workflowId) continue;
          const ck = cellKey(entry.comboKey, entry.configId, entry.promptKey);
          setRun(ck, {
            comboKey: entry.comboKey,
            configId: entry.configId,
            promptKey: entry.promptKey,
            ecosystem: entry.ecosystem,
            status: 'stalled',
            workflowId: entry.workflowId,
          });
        }
      } catch {
        /* best-effort — leave `runs` empty */
      }
    })();
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

  // Record an optimistic DELETE so a just-withdrawn row disappears immediately
  // and does NOT come back on the next (read-after-write-lagged) list().
  const optimisticDelete = useCallback(
    (key: string) => {
      if (!viewer) return;
      pendingRef.current.set(key, { authorUserId: viewer.id, kind: 'delete' });
      setItems((prev) => prev.filter((it) => it.key !== key));
    },
    [viewer],
  );

  // Withdraw one of the viewer's OWN rows from the shared grid (issue #10). The
  // affordance is author-scoped in the views (isOwnRow) and the host re-derives
  // the same author check, so this only carries the confirmed intent through.
  // Mirrors the submit path: host mutation → optimistic reconcile → track →
  // reload.
  const withdrawRow = useCallback(
    async (key: string) => {
      await depsRef.current.shared.withdraw(key);
      optimisticDelete(key);
      depsRef.current.track('withdraw');
      reload();
    },
    [optimisticDelete, reload],
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

  // Persist / clear ONE in-flight cell run in per-viewer KV (best-effort, fire-
  // and-forget — a KV failure must never block or fail a real generation; the
  // double-charge guard just degrades gracefully). One row per cell so concurrent
  // runs can't read-modify-write-clobber a shared map.
  const persistInflight = useCallback(
    (ck: string, entry: InflightRun) => {
      if (!viewer) return;
      depsRef.current.appStorage.set(inflightKey(ck), entry).catch(() => {});
    },
    [viewer],
  );
  const clearInflight = useCallback(
    (ck: string) => {
      if (!viewer) return;
      depsRef.current.appStorage.delete(inflightKey(ck)).catch(() => {});
    },
    [viewer],
  );

  // Shared tail of the money path: poll a submitted workflow to terminal, then —
  // on success — publish its scanned outputs and append the result row. Used by
  // BOTH the initial confirm AND the stalled-cell resume-poll. Clears the
  // persisted in-flight row on any terminal outcome (success OR failure); a
  // NON-terminal poll cap keeps it (still running → resumable).
  const driveToResult = useCallback(
    async (ck: string, row: BenchConfig, prompt: PromptRow, first: BlockWorkflowSnapshot) => {
      const terminal = await pollToTerminal(depsRef.current.poll, first, {
        sleep: depsRef.current.sleep,
        delayMs: depsRef.current.pollIntervalMs,
        maxDelayMs: depsRef.current.pollIntervalMs,
      });
      if (!isTerminalSnapshot(terminal.status)) {
        // Poll window elapsed while still generating — keep the workflowId (and
        // its persisted row) so the cell offers a resume-poll, never a re-charge.
        setRun(ck, { status: 'stalled', workflowId: terminal.workflowId });
        return;
      }
      clearInflight(ck); // terminal → no longer in-flight
      if (terminal.status !== 'succeeded') {
        setRun(ck, { status: mapSnapshotStatus(terminal.status), error: terminal.error });
        return;
      }
      // Already published by a prior session/racer? Don't re-publish — just clear.
      if (cellHasResult(results, row.comboKey, row.config.id, prompt.key)) {
        setRun(ck, null);
        reload();
        return;
      }
      setRun(ck, { status: 'publishing' });
      const imageIds = await depsRef.current.publish({ workflowId: terminal.workflowId });
      depsRef.current.track('publish', { imageCount: imageIds.length });
      const matched = resolveCell(row.config, prompt);
      if (!cellHasResult(results, row.comboKey, row.config.id, prompt.key) && imageIds.length > 0) {
        const payload = buildResultPayload({
          comboKey: row.comboKey,
          configId: row.config.id,
          promptKey: prompt.key,
          ecosystem: matched.ecosystem,
          imageIds,
          ...(prompt.authorUserId ? { promptAuthorUserId: prompt.authorUserId } : {}),
        }) as SharedAppendValue;
        const { key } = await depsRef.current.shared.append(payload);
        optimisticInsert(key, payload);
      }
      setRun(ck, null);
      reload();
    },
    [results, reload, setRun, optimisticInsert, clearInflight],
  );

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
        setRun(ck, { status: 'failed', error: estimateErrMsg(e) });
      }
    },
    [results, viewer, token.scopes, setRun],
  );

  const confirmRun = useCallback(
    async (row: BenchConfig, prompt: PromptRow) => {
      const ck = cellKey(row.comboKey, row.config.id, prompt.key);
      // 🔴 MONEY SAFETY: synchronous claim BEFORE any spend. A second confirm for
      // this cell (double-tap / batched re-render) returns here → submit once.
      if (inFlightRef.current.has(ck)) return;
      inFlightRef.current.add(ck);
      setRun(ck, { status: 'submitting' });
      try {
        const body = buildCellWorkflowBody(row.config, row.comboKey, prompt);
        const first = await depsRef.current.submit(body);
        if (first.status === 'failed') {
          setRun(ck, { status: 'failed', error: first.error ?? 'Generation failed.' });
          return;
        }
        setRun(ck, { status: 'processing', workflowId: first.workflowId });
        // Persist the in-flight workflow the instant it exists, so a reload before
        // it terminates rehydrates the cell as in-flight (never empty+runnable).
        const matched = resolveCell(row.config, prompt);
        persistInflight(ck, {
          workflowId: first.workflowId,
          comboKey: row.comboKey,
          configId: row.config.id,
          promptKey: prompt.key,
          ecosystem: matched.ecosystem,
        });
        await driveToResult(ck, row, prompt, first);
      } catch (e) {
        setRun(ck, { status: 'failed', error: errMsg(e) });
      } finally {
        inFlightRef.current.delete(ck);
      }
    },
    [setRun, persistInflight, driveToResult],
  );

  // Resume-poll a STALLED cell (poll-cap elapsed, or rehydrated in-flight from a
  // prior session). Re-polls the existing workflowId to terminal — NO re-submit,
  // so it never spends Buzz again — and publishes/appends on success.
  const resumeRun = useCallback(
    async (row: BenchConfig, prompt: PromptRow) => {
      const ck = cellKey(row.comboKey, row.config.id, prompt.key);
      if (inFlightRef.current.has(ck)) return;
      const wfId = runsRef.current[ck]?.workflowId;
      if (!wfId) {
        // Nothing to resume (no known workflow) — clear the stale in-flight state.
        clearInflight(ck);
        setRun(ck, null);
        return;
      }
      inFlightRef.current.add(ck);
      setRun(ck, { status: 'processing', workflowId: wfId });
      try {
        const first = await depsRef.current.poll(wfId);
        await driveToResult(ck, row, prompt, first);
      } catch (e) {
        setRun(ck, { status: 'failed', error: errMsg(e) });
      } finally {
        inFlightRef.current.delete(ck);
      }
    },
    [setRun, clearInflight, driveToResult],
  );

  const cancelRun = useCallback(
    (row: BenchConfig, prompt: PromptRow) => {
      const ck = cellKey(row.comboKey, row.config.id, prompt.key);
      // Explicit user abandon — drop the persisted in-flight row too so it doesn't
      // rehydrate as stalled on the next load.
      clearInflight(ck);
      setRun(ck, null);
    },
    [setRun, clearInflight],
  );

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
    <div
      ref={rootRef}
      data-theme={theme}
      {...{ [COMPACT_ATTR]: isMobile ? 'true' : undefined }}
      style={pageStyle(c)}
    >
      {/* Compact-layout stylesheet — mounted only on a narrow viewport, so the
          desktop rendering is byte-for-byte what it was. Scoped to this root by
          the COMPACT_ATTR selector, so it can never leak into the host page. */}
      {isMobile && <style data-testid="compact-styles">{compactTapTargetCss()}</style>}
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
          {/* The viewer's Buzz balance is deliberately NOT displayed here (task
              419). `buzzTotal` is still read from `useBuzzBalance()` and passed
              to ResultsGrid, where it gates a run against the cost
              (`cell-insufficient`) — removing the hook along with this badge
              would disarm that gate, which `chrome-and-width.test.tsx` pins. */}
        </Group>

        {howtoDismissed === false && (
          <div
            data-testid="how-this-works"
            style={{
              border: `1px solid ${c.border}`,
              background: c.card,
              borderRadius: radius.md,
              padding: '12px 14px',
              display: 'grid',
              gap: 6,
            }}
          >
            <Group justify="space-between" align="center" gap={10}>
              <strong style={{ fontSize: 14 }}>How this works</strong>
              <Button size="sm" variant="subtle" onClick={dismissHowto} data-testid="howto-dismiss">
                Got it
              </Button>
            </Group>
            <ol style={{ ...mutedText, margin: 0, paddingLeft: 18, display: 'grid', gap: 3, fontSize: 13 }}>
              <li>
                <strong>Submit</strong> checkpoint + LoRA combinations and prompts.
              </li>
              <li>
                <strong>Vote</strong> — the top-voted combinations and prompts become the grid's rows and
                columns.
              </li>
              <li>
                <strong>Run</strong> a cell to generate its images (spends Buzz). Outputs are added to the
                shared <strong>public</strong> grid.
              </li>
              <li>
                <strong>Compare</strong> models side-by-side on identical prompts.
              </li>
            </ol>
          </div>
        )}

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
            onWithdraw={withdrawRow}
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
            onWithdraw={withdrawRow}
          />
        )}

        {view === 'grid' && (
          // `minWidth: 0` for the same reason `contentStyle` carries it: this
          // Stack is a grid item holding the wide results matrix, and its
          // default content-based minimum would re-introduce the blowout one
          // level below the containment in `contentStyle`.
          <Stack gap={14} data-testid="grid-view" style={{ minWidth: 0 }}>
            <Group justify="space-between" align="flex-end" gap={12}>
              <span style={{ ...mutedText, flex: '1 1 260px', minWidth: 0 }}>
                Included combinations × prompts. Run an empty cell to contribute its outputs to the shared grid.
              </span>
              <div style={{ width: 240 }}>
                <Slider
                  label="Show top N (your view)"
                  description="Only changes how many rows/columns YOU see — it doesn't change the shared grid or anyone else's view."
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
              buzzTotal={buzzTotal}
              GatedCell={deps.GatedCell}
              onRunCell={beginRun}
              onConfirmRun={confirmRun}
              onResumeRun={resumeRun}
              onCancelRun={cancelRun}
              onAddCombination={() => setView('combos')}
              onAddPrompt={() => setView('prompts')}
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

/**
 * Viewer-facing text for a failure out of `estimate()`.
 *
 * 🔴 `@civitai/blocks-react` 0.43.0 made `estimate()` REJECT where it used to
 * resolve a price-less snapshot (civitai/civitai#4159). Three things follow, and
 * this function is where all three are handled:
 *
 *  - Branch on `err.code`, never on `err.message` — `code` is the stable target;
 *    `message` is a generic constant the library may reword.
 *  - `err.snapshot.error` carries the server's own explanation and is documented
 *    as server-authored and UNSANITISED (raw upstream text, database constraint
 *    names among it). It is the diagnostic worth keeping, so it goes to the
 *    developer console — never into viewer copy.
 *  - Moderator-review preview answers EVERY workflow request with
 *    'not available in review preview', so a reviewer's first click lands here.
 *    That is the `'failed'` arm, and it is why this path must never throw.
 */
function estimateErrMsg(e: unknown): string {
  if (!(e instanceof WorkflowEstimateError)) return errMsg(e);
  // Developer-only surface. Kept off the rendered cell on purpose (see above).
  console.debug('[model-benchmarking] estimate rejected:', e.code, e.snapshot.error ?? '(no server reason)');
  return e.code === 'no-cost' ? ESTIMATE_NO_COST_MESSAGE : ESTIMATE_FAILED_MESSAGE;
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
