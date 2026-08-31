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
import type {
  AppStorageQuota,
  SharedAppendValue,
  UseAppStorage,
  UseSharedStorage,
} from '@civitai/blocks-react';
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
import type {
  CellRun,
  CombinationRow,
  DraftRecord,
  DraftUnsubmitted,
  InflightRun,
  PromptRow,
} from './types.js';
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
import {
  buildDraft,
  draftKey,
  draftToInput,
  DRAFT_PREFIX,
  formatQuota,
  isSubmitted,
  newDraftLocalId,
  parseDraft,
  sortDrafts,
  submittedPointer,
} from './lib/drafts.js';
import { forEachStoredKey } from './lib/kv.js';
import { pollToTerminal, mapSnapshotStatus, isTerminalSnapshot } from './lib/workflow.js';
import { CombosView } from './components/CombosView.js';
import { DraftsPanel } from './components/DraftsPanel.js';
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

/**
 * The submit modal: closed, or a combo/prompt form in CREATE or EDIT mode, or
 * the DRAFT form — the same combination form saving to the PER-VIEWER store
 * instead of the public board. `draft` is a distinct kind rather than a flag on
 * `combo` because the two write to different stores, and a single branch deciding
 * which store a save lands in is exactly the branch that gets got wrong later.
 */
type ModalState =
  | { kind: 'none' }
  | { kind: 'combo'; edit?: CombinationRow }
  | { kind: 'prompt'; edit?: PromptRow }
  | { kind: 'draft'; localId: string; initial?: CombinationInput; existing: boolean };

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
  // 🔴 MONEY SAFETY: true whenever the in-flight rehydrate's view of the
  // per-viewer store is not known to be COMPLETE — it hit its page bound, the
  // listing threw, or it simply has not finished yet. The rehydrate is the only
  // thing that turns a persisted run back into a stalled cell, so while this is
  // true a cell can be empty and runnable with its generation still live.
  // `confirmRun` reads it and pays for a direct key lookup before spending.
  //
  // 🔴 IT INITIALISES `true`, AND THAT IS THE WHOLE GUARD — "assume incomplete
  // until a finished scan proves otherwise". It initialised `false` for one
  // review round and the backstop was UNREACHABLE IN PRODUCTION: the flag was
  // only written when the scan FINISHED, so a Confirm landing during the scan
  // read `false` and spent. The truncated case is the slowest one — up to
  // KV_MAX_PAGES serial `list` calls plus a `get` per key — and every one of
  // those is a macrotask over the real host's cross-origin `postMessage` bridge,
  // so that window is wide. It passed every test because the jsdom fake resolves
  // in microtasks; `latencyMs` in `fakeAppStorage` is what makes it visible, and
  // there is a permanent LATENCY ARM case pinning it.
  const inflightScanTruncatedRef = useRef(true);
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
    // 🔴 RE-ARM AT THE START OF EVERY SCAN, not just at mount. This effect
    // re-runs on `ready` and on `viewer?.id`, so a completed scan for viewer A
    // must not leave the flag `false` while a fresh scan for viewer B is still
    // walking — the same "Confirm lands mid-scan" hole, reached by a different
    // route. The success arm below is the ONLY writer that clears it, and it
    // clears it strictly after a scan that finished.
    //
    // ⚠️ THIS LINE AND THE `useRef(true)` ABOVE OVERLAP, but they are not
    // interchangeable and only ONE of them is redundant. This line has its own
    // regression coverage: delete it and viewer A's completed scan leaves the
    // backstop down while viewer B's scan is still walking, so a Confirm during
    // it SPENDS on a cell whose run is persisted (the effect re-runs on `ready`
    // and on `viewer?.id`). Measured: removing this line alone kills a case.
    //
    // The `useRef(true)` init is the genuinely redundant one — removing IT alone
    // still leaves the suite green, because this line re-arms before any scan
    // can stand the flag down. It is kept anyway: it covers the sliver between
    // first render and the effect body running, which no test can click inside.
    // Do not read its survival as "dead code".
    //
    // 🔴 THIS COMMENT PREVIOUSLY SAID THAT ROUTE "could not be pinned". The
    // premise was right and the conclusion was wrong, which is the worse of the
    // two failures — it told the next reader not to bother. The SDK `Harness`
    // does freeze its options in a ref and install the mock host in a
    // `useEffect(…, [])`, so the `viewer` PROP cannot express a change; but the
    // viewer here comes from `useBlockContext()` (line 184), and a file-scoped
    // partial mock of that hook reaches it in ~40 lines. It is pinned now, in
    // `src/viewer-change.test.tsx`, along with the `!cancelled` guard below.
    inflightScanTruncatedRef.current = true;
    (async () => {
      const store = depsRef.current.appStorage;
      try {
        // 🔴 THIS LISTING USED TO READ ONLY THE FIRST PAGE. It called
        // `list({prefix})` with no cursor and no loop, while both draft listings
        // paged correctly — so a viewer whose `inflight:v1:` keys crossed a host
        // page boundary had the runs beyond that page silently NOT rehydrated,
        // and their cells rendered empty and runnable. That is the re-run
        // double-charge the comment above says must never happen, and there is
        // no backstop below it: `inFlightRef` is in-memory and empty after a
        // reload, and `confirmRun` did not consult the store before spending.
        const scan = await forEachStoredKey(
          store,
          INFLIGHT_PREFIX,
          async (key) => {
            if (cancelled) return 'stop';
            const entry = await store.get<InflightRun>(key);
            if (cancelled) return 'stop';
            if (!entry || typeof entry.workflowId !== 'string' || !entry.workflowId) return;
            const ck = cellKey(entry.comboKey, entry.configId, entry.promptKey);
            setRun(ck, {
              comboKey: entry.comboKey,
              configId: entry.configId,
              promptKey: entry.promptKey,
              ecosystem: entry.ecosystem,
              status: 'stalled',
              workflowId: entry.workflowId,
            });
          },
          { shouldStop: () => cancelled },
        );
        // 🔴 THE ONLY PLACE THE BACKSTOP IS EVER STOOD DOWN, and only after a
        // scan that ran to completion. A truncated one leaves it armed: paging
        // makes truncation far less likely but cannot make it impossible,
        // because the page bound is what stops a misbehaving host spinning this
        // loop forever. What makes the truncated case SAFE is the pre-spend
        // check in `confirmRun` — see there.
        //
        // `!cancelled` matters: a superseded scan must not stand down a backstop
        // that the scan replacing it just re-armed.
        if (!cancelled) inflightScanTruncatedRef.current = scan.truncated;
      } catch {
        /* best-effort — leave `runs` empty, and leave the backstop ARMED: a
           listing that threw saw even less than a truncated one. */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, viewer?.id]);

  // ---- drafts (the PRIVATE half of the create → submit boundary) ----
  //
  // 🔴 Everything in this block reads and writes `appStorage` ONLY. A draft is
  // private because it lives in the per-viewer store, not because of any field
  // on it — a `visibility` flag inside a shared row's `data` would be cosmetic
  // (the row is world-readable the instant it is appended, and `data` is not
  // moderated). Submit — and only submit — copies a draft onto the public board.
  const [drafts, setDrafts] = useState<DraftRecord[]>([]);
  const [quota, setQuota] = useState<AppStorageQuota | null>(null);
  const [draftsVersion, setDraftsVersion] = useState(0);
  const refreshDrafts = useCallback(() => setDraftsVersion((v) => v + 1), []);

  useEffect(() => {
    if (!ready) return;
    if (!viewer) {
      // Anonymous: the host rejects every per-viewer write and reads back null,
      // so there is nothing to show and nothing to guess at.
      setDrafts([]);
      setQuota(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const store = depsRef.current.appStorage;
      try {
        const found: DraftRecord[] = [];
        await forEachStoredKey(
          store,
          DRAFT_PREFIX,
          async (key) => {
            if (cancelled) return 'stop';
            const parsed = parseDraft(await store.get(key));
            if (cancelled) return 'stop';
            if (parsed) found.push(parsed);
          },
          // Restores the per-PAGE check the open-coded loop had right after its
          // `await store.list(...)` — without it a cancelled effect kept paging.
          { shouldStop: () => cancelled },
        );
        // Guarded explicitly rather than relying on the early returns above to
        // prevent it — same shape as the `setQuota` call below, and it is what
        // lets the scan's single `'stop'` channel carry the cancellation.
        if (!cancelled) setDrafts(sortDrafts(found));
      } catch {
        /* best-effort — a KV failure must not take the public board down with it */
      }
      try {
        // 🔴 The storage ceilings are HOST-reported. Read them; never hard-code
        // "50 MB" (acceptance criterion 6) — that is the host's number to move.
        const q = await store.getQuota();
        if (!cancelled) setQuota(q);
      } catch {
        if (!cancelled) setQuota(null);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, viewer?.id, draftsVersion]);

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
  /**
   * Drop the per-viewer draft POINTER at a shared row that no longer exists.
   *
   * 🔴 A submitted draft is rewritten to `{localId, sharedKey, submittedAt}` and
   * its `configs` are DROPPED (see `submittedPointer`). So once the row it
   * points at is withdrawn there is nothing left to restore and nothing left to
   * act on: the drafts panel rendered a card claiming "Live on the board" for a
   * row that is gone, with NO buttons at all (its only action, "Edit the live
   * one", is gated on the row being loaded), and it still consumed a quota row.
   * An unremovable card asserting a live board entry that does not exist is
   * worse than no card, so the pointer goes.
   *
   * Scope, deliberately narrow, and narrow in TWO independent ways:
   *
   *   1. Only the COMBINATIONS surface reaches this function at all. ⚠️ This
   *      paragraph used to say prompts reached it and harmlessly found nothing;
   *      that stopped being true when `withdrawPrompt` was split out below, and
   *      the sentence survived because it sits outside that diff. A reader who
   *      believes the old text concludes the prompt path still scans — which is
   *      exactly what the "NEVER EVEN STARTS the pointer scan" case asserts
   *      against. Prompts are never created from a draft, so the scan there
   *      could only ever run to completion and find nothing; it is skipped.
   *   2. Even on the combinations surface the ONLY pointer touched is one whose
   *      `sharedKey` equals the withdrawn key — another of the viewer's own
   *      combinations keeps its pointer, which is a separate guard.
   *
   * 🔴 THE LOOKUP GOES TO THE STORE, NOT TO RENDER STATE, and that is not a
   * style choice. Reading the `drafts` state (or a ref mirroring it) makes the
   * fix silently inert whenever that list is EMPTY FOR A REASON THAT HAS
   * NOTHING TO DO WITH THE POINTER — and there are three such reasons, all
   * reachable: the KV list effect has not resolved yet (withdraw first and the
   * list is still `[]`), `list()` threw and was swallowed so the board could
   * stay up, or the viewer has more drafts than `KV_MAX_PAGES` pages. In
   * every one of those the pointer is real, the scan against render state
   * misses it, and nothing ever re-checks — the exact orphan this function
   * exists to remove, persisting with no error anywhere. Measured before the
   * fix: withdrawing before the list resolved left `deletes: []` and the
   * buttonless card on screen.
   */
  const clearDraftPointerFor = useCallback(
    async (sharedKey: string) => {
      const store = depsRef.current.appStorage;
      try {
        await forEachStoredKey(store, DRAFT_PREFIX, async (key) => {
          const parsed = parseDraft(await store.get(key));
          if (!parsed || !isSubmitted(parsed) || parsed.sharedKey !== sharedKey) return;
          // Idempotent per the SDK: deleting a key that isn't set resolves
          // `{deleted: false}` rather than throwing.
          await store.delete(draftKey(parsed.localId));
          refreshDrafts();
          return 'stop';
        });
      } catch {
        /* best-effort — a KV failure must not report the (successful) withdraw as failed */
      }
    },
    [refreshDrafts],
  );

  const withdrawRow = useCallback(
    /**
     * @param clearPointer whether to look for (and drop) a draft pointer at this
     *   key afterwards. TRUE only on the combinations surface — see the call
     *   sites and `clearDraftPointerFor`'s cost note.
     */
    async (key: string, clearPointer: boolean) => {
      // 🔴 THE GUARD IS THE ORDER, PLUS AN `ok` BRANCH THAT DEFENDS THE DECLARED
      // TYPE RATHER THAN AN OBSERVED FAILURE. Be precise about which is which:
      //
      //   - THE ORDER is the live guard. `withdraw` REJECTS on failure at the
      //     pinned @civitai/blocks-react 0.43.0, so a throw here is the real
      //     path and it skips every line below.
      //   - THE `ok` BRANCH is defensive. `withdraw` is the only SDK write typed
      //     `ok: boolean` rather than the literal `ok: true` (`appStorage.set`
      //     and `.delete` are both `ok: true`), so the CONTRACT permits a
      //     refusal that resolves. ⚠️ The 0.43.0 RUNTIME does not use it:
      //     `useSharedStorage.js:115-121` does `if (!result.ok || result.error)
      //     throw` and returns a hardcoded `{ok: true}`, and both hosts only
      //     emit `ok:false` alongside an `error`. So this branch is UNREACHABLE
      //     IN PRODUCTION TODAY. It is kept because the declared type is what a
      //     future SDK could start honouring, and the cost of being wrong the
      //     other way is unrecoverable (below). Do not describe it as an
      //     observed channel — an earlier version of this comment did, and it
      //     was false.
      //
      // Either way the viewer keeps the only per-viewer handle on a row that is
      // still live. Shared keys are host-minted and the shared list has no
      // "mine" index (docs/matchups.md §4), so deleting that pointer against a
      // surviving row is UNRECOVERABLE. Dropping the `ok` check, or clearing the
      // pointer before this line, each turn this fix into a data-loss bug.
      const res = await depsRef.current.shared.withdraw(key);
      if (!res.ok) return;
      optimisticDelete(key);
      if (clearPointer) await clearDraftPointerFor(key);
      depsRef.current.track('withdraw');
      reload();
    },
    [optimisticDelete, reload, clearDraftPointerFor],
  );

  /**
   * Withdraw a COMBINATION. This is the only surface where a draft pointer can
   * exist, so it is the only one that pays for the lookup.
   */
  const withdrawCombination = useCallback(
    (key: string) => withdrawRow(key, true),
    [withdrawRow],
  );

  /**
   * Withdraw a PROMPT. 🔴 No pointer scan: prompts are never created from a
   * draft, so a prompt's host-minted key CANNOT match a pointer — the scan could
   * only ever run to completion and find nothing. Skipping it is not an
   * optimisation of a rare path, it is declining a guaranteed-fruitless one:
   * `clearDraftPointerFor` is a paged KV walk (one `list` per page plus one
   * `get` per key, serially over the postMessage bridge) with the withdraw
   * button held in `loading` for its whole duration.
   */
  const withdrawPrompt = useCallback((key: string) => withdrawRow(key, false), [withdrawRow]);

  // ---- draft write paths (the PRIVATE half; see the drafts block above) ----

  /**
   * Save a draft. 🔴 PRIVATE PATH — `appStorage.set` and nothing else. This is
   * the path acceptance criterion 7 pins: it must never reach `shared.append`,
   * because that call is the moment the record becomes public and there is no
   * other boundary in the platform that makes it not so.
   */
  const saveDraft = useCallback(
    async (localId: string, input: CombinationInput) => {
      await depsRef.current.appStorage.set(draftKey(localId), buildDraft(localId, input));
      depsRef.current.track('save_draft');
      closeModal();
      refreshDrafts();
    },
    [closeModal, refreshDrafts],
  );

  /** Discard a draft. 🔴 PRIVATE PATH — per-viewer delete only. */
  const deleteDraft = useCallback(
    async (localId: string) => {
      await depsRef.current.appStorage.delete(draftKey(localId));
      refreshDrafts();
    },
    [refreshDrafts],
  );

  // Synchronous claim set, mirroring the runner's: a second submit for the same
  // draft returns here, so a double-tap can never mint two public rows (and
  // `append` has no idempotency key — a duplicate is permanent and unmergeable).
  const submittingRef = useRef<Set<string>>(new Set());

  /**
   * SUBMIT — the one place a draft crosses into the public board, and the only
   * moment the record becomes visible to anyone else. `buildCombinationPayload`
   * is reused verbatim so a submitted draft is byte-identical to a row submitted
   * directly, including `data.kind: 'combination'` (a persisted wire value that
   * discriminates every row already on the board — never renamed) and including
   * the moderation split: every user-authored string is in `title`/`body`, and
   * `data` carries structure only.
   *
   * The draft is then KEPT, rewritten to `{localId, sharedKey, submittedAt}`: it
   * is the only per-viewer handle on the row, since shared keys are host-minted
   * and the shared list has no "mine" index.
   */
  const submitDraft = useCallback(
    async (draft: DraftUnsubmitted) => {
      if (submittingRef.current.has(draft.localId)) return;
      submittingRef.current.add(draft.localId);
      try {
        const input = draftToInput(draft);
        const payload = buildCombinationPayload(input) as SharedAppendValue;
        const { key } = await depsRef.current.shared.append(payload);
        await depsRef.current.appStorage.set(
          draftKey(draft.localId),
          submittedPointer(draft.localId, key),
        );
        optimisticInsert(key, payload);
        depsRef.current.track('submit_combo', {
          configCount: input.configs.filter((cfg) => cfg?.checkpoint).length,
          fromDraft: true,
        });
        refreshDrafts();
        reload();
      } finally {
        submittingRef.current.delete(draft.localId);
      }
    },
    [optimisticInsert, refreshDrafts, reload],
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
  //
  // 🔴 KNOWN, UNFIXED, AND THE PRECONDITION EVERYTHING ABOVE RESTS ON — read this
  // before trusting the double-charge guards. `set` is fire-and-forget with a
  // SWALLOWED rejection. `useAppStorage.set` rejects when the value exceeds
  // 64 KB, when the per-app quota would be crossed, or for an anonymous viewer.
  // If it rejects, NOTHING IS WRITTEN — and then neither the rehydrate scan nor
  // `confirmRun`'s pre-spend read can find anything, because there is nothing to
  // find. Reload, re-run, DOUBLE CHARGE, with no signal anywhere: no toast, no
  // console line, no metric.
  //
  // Deliberately not fixed here. The fix is a PRODUCT decision, not a code one —
  // block the spend when the persist fails (safe, but wedges generation on a KV
  // blip) or surface it to the viewer (visible, but says nothing actionable) —
  // and it is pre-existing rather than introduced by the paging work. Raised
  // separately. Every guard above narrows the window; none of them closes this.
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
      // 🔴 MONEY SAFETY, SECOND LAYER: what makes a TRUNCATED rehydrate fail
      // safe. `inFlightRef` is in-memory and empty after a reload, so before
      // this the rehydrate listing was the ONLY thing between a reload and a
      // double-charge — and a listing that truncated or threw silently left the
      // cell empty and runnable. The inflight key is DETERMINISTIC
      // (`inflightKey(cellKey(...))`), so when the scan is known-incomplete this
      // costs one O(1) read to ask the store directly rather than trusting a
      // view we know is partial. A persisted entry means the generation is
      // already live: adopt it as stalled (resume-poll, no re-submit) and spend
      // NOTHING.
      //
      // Deliberately gated on the flag rather than run unconditionally: once a
      // scan has FINISHED completely, such a cell never renders a confirm button
      // at all, so an unconditional read would add a round-trip to every spend
      // to re-answer a question already answered. The flag is armed by default
      // and stood down only by a completed scan, so the gate costs a read only
      // while the answer is genuinely unknown. (Pinned both ways: a complete
      // scan must report `truncated: false`, and the non-truncated path must
      // perform NO store read.)
      if (inflightScanTruncatedRef.current) {
        try {
          const persisted = await depsRef.current.appStorage.get<InflightRun>(inflightKey(ck));
          if (persisted?.workflowId) {
            setRun(ck, {
              comboKey: persisted.comboKey,
              configId: persisted.configId,
              promptKey: persisted.promptKey,
              ecosystem: persisted.ecosystem,
              status: 'stalled',
              workflowId: persisted.workflowId,
            });
            // 🔴 RELEASE THE SYNCHRONOUS CLAIM taken above. This function
            // returns early, so the usual `finally` never runs — and
            // `inFlightRef` is what `resumeRun` checks first. Leave the claim
            // set and the cell just adopted is permanently UN-RESUMABLE for the
            // life of the page: charged once, shown nothing. A mutant deleting
            // this line survived the whole suite until the "adopted cell can
            // still be RESUMED" case existed.
            inFlightRef.current.delete(ck);
            return;
          }
        } catch {
          /* the store is unreadable; fall through and spend — refusing to run at
             all on a KV error would wedge the feature on a host blip, and this
             is a backstop, not the primary guard */
        }
      }
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

  // ---- drafts render wiring ----
  // The shared keys currently loaded, so a submitted POINTER only offers "Edit
  // the live one" when its row is actually in hand to edit.
  const loadedSharedKeys = useMemo(() => new Set(combinations.map((r) => r.key)), [combinations]);

  /**
   * Edit the PUBLIC row a submitted draft points at. 🔴 This routes into the
   * existing `shared.update` path — which is author-scoped and preserves BOTH
   * the host-minted key and the row's vote total. It is the only post-submit
   * mutation the app offers: there is deliberately no un-submit (spec §9 Q2,
   * decided 2026-08-30), because `withdraw` destroys the vote total and orphans
   * every `result` row other viewers spent Buzz on, and nobody can clean those up.
   */
  const editSubmittedDraft = useCallback(
    (sharedKey: string) => {
      const row = combinations.find((r) => r.key === sharedKey);
      if (row) setModal({ kind: 'combo', edit: row });
    },
    [combinations],
  );

  const draftsSlot = (
    <DraftsPanel
      drafts={drafts}
      quotaLine={formatQuota(quota)}
      loadedSharedKeys={loadedSharedKeys}
      canDraft={!!viewer}
      onNewDraft={() => setModal({ kind: 'draft', localId: newDraftLocalId(), existing: false })}
      onEditDraft={(draft) =>
        setModal({
          kind: 'draft',
          localId: draft.localId,
          initial: draftToInput(draft),
          existing: true,
        })
      }
      onSubmitDraft={submitDraft}
      onDeleteDraft={deleteDraft}
      onEditSubmitted={editSubmittedDraft}
    />
  );

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

        {/*
          🔴 EACH TAB CARRIES ITS OWN `data-testid`, NAMED FOR ITS VIEW — NEVER FOR
          ITS POSITION. Downstream consumers (the app-capture recipe in
          `talos-infra`) used to select these tabs as
          `[data-testid='view-switch'] > button:nth-of-type(N)`, which silently
          re-points at the wrong panel the moment a tab is reordered or added — and
          a capture of the wrong view still succeeds. The name is the view key, so
          it survives both.

          🔴 WHY THE ATTRIBUTE IS ON THE LABEL AND NOT ON THE BUTTON: it cannot be
          on the button. `SegmentedControl` renders each `role="tab"` button
          itself, from a fixed attribute set, and `SegmentedControlItem` is
          `{ value, label, disabled }` — extra item properties are NOT spread onto
          the button (checked in @civitai/blocks-react 0.43.0, the pinned version,
          and 0.44.2, the newest published; `dist/ui/SegmentedControl.js` is
          byte-identical between them). So the only attribute hook the pack gives
          an app author is inside `label`. A CSS selector resolves the span, and a
          click at the span's centre lands inside its parent button, which is what
          both the capture bridge (centre-coordinate CDP click) and
          `userEvent.click` do.
        */}
        <SegmentedControl
          fullWidth
          value={view}
          onChange={(v) => setView(v as View)}
          data-testid="view-switch"
          data={[
            {
              value: 'combos',
              label: (
                <span data-testid="view-switch-combos">Combinations ({combinations.length})</span>
              ),
            },
            {
              value: 'prompts',
              label: <span data-testid="view-switch-prompts">Prompts ({prompts.length})</span>,
            },
            { value: 'grid', label: <span data-testid="view-switch-grid">Grid</span> },
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
            onWithdraw={withdrawCombination}
            draftsSlot={draftsSlot}
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
            onWithdraw={withdrawPrompt}
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
        {/* The DRAFT form — the same combination form, saving to the PER-VIEWER
            store. Its submit button says "Save draft" precisely because saving
            is not submitting: nothing here reaches the public board. */}
        <Modal
          opened={modal.kind === 'draft'}
          onClose={closeModal}
          title={modal.kind === 'draft' && modal.existing ? 'Edit draft' : 'New draft'}
          size="lg"
        >
          {modal.kind === 'draft' && (
            <CombinationForm
              key={modal.localId}
              pickResource={deps.pickResource}
              initial={modal.initial}
              submitLabel="Save draft"
              onSubmit={(input) => saveDraft(modal.localId, input)}
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
