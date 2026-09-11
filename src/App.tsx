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
  Stack,
} from '@civitai/blocks-react/ui';

import { AI_WRITE_BUDGETED, hasGenerateScope } from './scopes.js';
import { COMPACT_ATTR, compactTapTargetCss } from './compact.js';
import { useIsMobile } from './useMediaQuery.js';
import { palette, pageStyle, contentStyle, token, radius, mutedText, metaText } from './theme.js';
import { paintTheme } from './bootTheme.js';
import type {
  CellRun,
  CombinationRow,
  DraftRecord,
  DraftUnsubmitted,
  InflightRun,
  PromptRow,
  UnpublishedGrid,
  UnpublishedGridRecord,
  UnpublishedPrompt,
  UnpublishedPromptRecord,
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
} from './lib/drafts.js';
import {
  buildUnpubPrompt,
  isPublishedPrompt,
  newUnpubPromptLocalId,
  parseUnpubPrompt,
  sortUnpubPrompts,
  UNPUB_PROMPT_PREFIX,
  unpubPromptKey,
  unpubPromptToInput,
} from './lib/unpubPrompts.js';
import { buildGridPayload, newGridLocalId, unpubGridKey, type GridInput } from './lib/grids.js';
import {
  buildUnpubGrid,
  isPublishedGrid,
  parseUnpubGrid,
  sortUnpubGrids,
  UNPUB_GRID_PREFIX,
  unpubGridToInput,
} from './lib/unpubGrids.js';
import {
  parsePointer,
  publishedPointer,
  publishPointerFailedNotice,
  unpublishedKey,
} from './lib/unpublished.js';
import { ARCHIVE_KEY, parseArchive, withArchived, withoutArchived } from './lib/archive.js';
import { forEachStoredKey } from './lib/kv.js';
import { pollToTerminal, mapSnapshotStatus, isTerminalSnapshot } from './lib/workflow.js';
import { MatchupsView } from './components/MatchupsView.js';
import { PromptsView } from './components/PromptsView.js';
import { GridsView } from './components/GridsView.js';
import { ResultsGrid } from './components/ResultsGrid.js';
import { MatchupForm } from './components/MatchupForm.js';
import { PromptForm } from './components/PromptForm.js';
import { GridForm } from './components/GridForm.js';
import type { GridPickerItem } from './components/GridPicker.js';
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
  /** Per-(viewer, block) KV store — holds this viewer's drafts, in-flight run
   * claims and the dismissed-explainer flag.
   *
   * 🔴 It does NOT hold vote state. It used to, because the shared list once
   * carried only the aggregate `count`; the list now reports `viewerVoted` per
   * row, which is host-derived and therefore correct across devices. */
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
 * The outcome of a PHASE-1 in-flight claim write. 🔴 Deliberately a THREE-way
 * result rather than a boolean or `void`: "did not write" (no viewer) is not
 * "wrote", and collapsing the two is how a guard comes to pass while the hazard
 * it guards is live. Only `{ ok: true }` licenses a spend.
 */
type ClaimOutcome =
  | { ok: true }
  | { ok: false; reason: 'rejected' | 'no-viewer' };

/**
 * The submit modal: closed, a combo/prompt form in CREATE or EDIT mode, or one of
 * the two UNPUBLISHED forms — the same combination/prompt form saving to the
 * PER-VIEWER store instead of the public board. Each private kind is distinct
 * rather than a flag on its public sibling because the two write to different
 * stores, and a single branch deciding which store a save lands in is exactly the
 * branch that gets got wrong later.
 */
type ModalState =
  | { kind: 'none' }
  | { kind: 'combo'; edit?: CombinationRow }
  | { kind: 'prompt'; edit?: PromptRow }
  | { kind: 'draft'; localId: string; initial?: CombinationInput; existing: boolean }
  | { kind: 'unpub-prompt'; localId: string; initial?: PromptInput; existing: boolean }
  // 🔴 A grid has only the PRIVATE form. Matchups and prompts each have a public
  // one too (submit straight to the board); a grid does not, because a grid is
  // assembled from other people's rows and there is no reason to make that
  // assembly public before the author has looked at it. One form, one store.
  | { kind: 'unpub-grid'; localId: string; initial?: GridInput; existing: boolean };

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
  "Couldn't price this run — the server declined to estimate it. Try a different matchup, or try again later.";
export const ESTIMATE_NO_COST_MESSAGE =
  "Couldn't price this run — no price came back. Please try again.";

/**
 * Viewer-facing copy for a PHASE-1 CLAIM that could not be written, i.e. the run
 * that was refused BEFORE any Buzz was spent (see {@link InflightRun}).
 *
 * Two constants because the two refusals are genuinely different situations with
 * different next steps for the viewer — one is "come back later", the other is
 * "sign in". A single catch-all string would make the branch untestable and the
 * advice wrong half the time.
 *
 * 🔴 BOTH SAY, IN WORDS, THAT NOTHING WAS SPENT. That is the whole point of
 * moving the failure before the money: a viewer who reads this must not go
 * hunting through their generations, and must not feel they need to re-run to
 * "make sure". Contrast the `'unknown'` copy below, which says the opposite
 * because the opposite is true there.
 *
 * 🔴 The host's own error string is deliberately NOT shown. `useAppStorage.set`
 * rejects with the host's `error` — server-authored, unsanitised, and a storage
 * engine's vocabulary ("PAYLOAD_TOO_LARGE", "QUOTA_EXCEEDED") is not viewer copy.
 * It goes to the developer console instead, the same split the estimate errors
 * above use.
 */
export const CLAIM_FAILED_MESSAGE =
  "Couldn't start this run: the app's storage is full or unavailable, so the run couldn't be tracked. Nothing was generated and no Buzz was spent. Please try again later.";
export const CLAIM_NO_VIEWER_MESSAGE =
  "Couldn't start this run: you're signed out, so the run couldn't be tracked. Nothing was generated and no Buzz was spent. Sign in and try again.";

const LIST_PAGE = 50;
const MAX_PAGES = 40; // safety cap when paging the whole shared list
// 🔴 `voted:v1` (a per-viewer KV array of shared keys) IS DELIBERATELY GONE. It
// mirrored the viewer's up-votes back when `list()` returned only the aggregate
// `count`; the host now reports `viewerVoted` per row, so the mirror was a
// second, weaker copy of a fact the row already carries. Do not reintroduce it:
// the stored copy is written only by the client that cast the vote, so it is
// blind to every other tab, session and device, and nothing can reconcile it.
// Rows written under the old key are simply ignored and cost nothing.
/** Per-viewer KV flag: set once the viewer dismisses the "How this works" panel,
 * so the one-time explainer stays dismissed across reloads. */
const HOWTO_STORAGE_KEY = 'howto-dismissed:v1';
/** Per-viewer KV key PREFIX under which each in-flight cell run is persisted
 * (one row per cell: `inflight:v1:<cellKey>`). Read on load to rehydrate still-
 * running cells so a reload never re-charges them (see {@link InflightRun}). */
const INFLIGHT_PREFIX = 'inflight:v1:';
const inflightKey = (ck: string): string => `${INFLIGHT_PREFIX}${ck}`;

const nonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/**
 * Is this stored blob a usable in-flight record? 🔴 The CELL COORDS are what make
 * it usable — they are what `cellKey` needs to place it — and `workflowId` is
 * deliberately NOT among them: a PHASE-1 claim has none, and rejecting it here is
 * the same double-charge hole one layer down (see {@link InflightRun}).
 */
function validInflight(entry: unknown): entry is InflightRun {
  const e = entry as InflightRun | null;
  return (
    !!e && nonEmptyString(e.comboKey) && nonEmptyString(e.configId) && nonEmptyString(e.promptKey)
  );
}

/**
 * Turn a persisted in-flight record into the cell-run state it rehydrates as.
 * 🔴 ONE function, used by BOTH readers of the store (the mount-time rehydrate
 * scan and `confirmRun`'s pre-spend read), because the two disagreeing is a
 * money bug: they were open-coded separately and BOTH gated on `workflowId`, so
 * one fix would have left the other spending.
 *
 *  - workflowId present → `stalled`: a live generation to resume-poll.
 *  - workflowId absent  → `unknown`: a claim we cannot resolve automatically.
 * Neither is empty+runnable, which is the only outcome that costs money twice.
 */
function inflightToRun(entry: InflightRun): CellRun {
  const wf = nonEmptyString(entry.workflowId) ? entry.workflowId : undefined;
  return {
    comboKey: entry.comboKey,
    configId: entry.configId,
    promptKey: entry.promptKey,
    ecosystem: entry.ecosystem,
    ...(wf ? { status: 'stalled' as const, workflowId: wf } : { status: 'unknown' as const }),
  };
}

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

  // 🔴 THERE IS NO RENDER-TIME `canGenerate` GATE ANY MORE. Consent is decided at
  // PRESS time, inside `beginRun` (`hasGenerateScope(token.scopes)` → `requestConsent`).
  // Holding it here as well is what made this app ask for consent TWICE — once in a
  // persistent banner, once in the host's own "missing permissions" bar, which is now
  // canonical — while simultaneously DISABLING the run affordance, so the press-time
  // branch could never execute. Same shape for the signed-out case (`requestSignIn`).
  // The app's own convention for an unauthorized press is the vote control's: keep the
  // affordance PRESENT and readable, and route the press. See `beginRun`.

  // ---- view + modal state ----
  // 🔴 GRIDS IS THE DEFAULT VIEW (spec §11.5, acceptance criterion 9). The app's
  // primary object is the grid — the matchup and prompt lists exist to feed it —
  // so opening on a submission list put the thing the block is FOR two clicks
  // away. It also means the Top Grid is on screen before anything is submitted.
  const [view, setView] = useState<View>('grid');
  const [modal, setModal] = useState<ModalState>({ kind: 'none' });
  const closeModal = useCallback(() => setModal({ kind: 'none' }), []);
  // 🔴 THE PER-VIEWER "Show top N" `Slider` IS GONE (§11.5, criterion 9), and so
  // is the `topN` state behind it. It was the only consumer of matchup and prompt
  // votes, and it let two viewers of ONE shared board be told different absolute
  // facts about what "the grid" contained. Those votes are discovery ranking now:
  // they order the Community lists and they decide the TOP GRID's members, at the
  // fixed `DEFAULT_TOP_N`. A viewer who wants a different set builds a grid — the
  // object that makes such a choice shareable instead of private and unstated.
  // Do not reintroduce it: a per-viewer slider over a shared object is what made
  // "Included" mean two different things to two readers of the same board.
  // One-time "How this works" explainer. `null` = still hydrating the dismissed
  // flag (render nothing yet — no flash-then-hide); `false` = show; `true` = hide.
  const [howtoDismissed, setHowtoDismissed] = useState<boolean | null>(null);

  // ---- data ----
  const [items, setItems] = useState<RawSharedItem[]>([]);
  /** The board scan hit its page cap, so every ranking below is over a PREFIX of
   * the board rather than all of it. Surfaced in the UI — see the disclosure by
   * the view switch. */
  const [boardTruncated, setBoardTruncated] = useState(false);
  // 🔴 DERIVED, never stored. The host reports `viewerVoted` on every row of
  // every `list()`, so the row IS the vote state — there is nothing to hold in
  // parallel and nothing to persist. This used to be `useState` hydrated from a
  // per-viewer KV array the app wrote itself, which could not see a vote cast in
  // another tab/session/device and had no way to be corrected when it disagreed
  // with the host. Keeping one source is what makes that whole class impossible
  // rather than merely fixed.
  const votedKeys = useMemo(
    () => new Set(items.filter((it) => it.viewerVoted).map((it) => it.key)),
    [items],
  );
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
        const { items: merged, pending } = reconcileOptimistic(all.items, pendingRef.current);
        pendingRef.current = pending;
        setItems(merged);
        setBoardTruncated(all.truncated);
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

  // (No vote-state hydration effect: `viewerVoted` arrives on each row of the
  // list() above, so the highlight is already correct on first paint — including
  // for votes this device never cast. See `votedKeys` where it is derived.)

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
            // 🔴 THIS USED TO SKIP EVERY ENTRY WITHOUT A `workflowId`, which is
            // exactly the record the PHASE-1 CLAIM writes. A claim-only entry was
            // therefore silently ignored and its cell rendered empty and
            // RUNNABLE — reintroducing the double charge the claim exists to
            // prevent, at the one moment we know least about what happened. The
            // coords are what identify the cell; the workflowId only decides
            // WHICH in-flight state it rehydrates into.
            if (!validInflight(entry)) return;
            const ck = cellKey(entry.comboKey, entry.configId, entry.promptKey);
            setRun(ck, inflightToRun(entry));
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

  // ---- the PRIVATE half of the create → publish boundary ----
  //
  // 🔴 Everything in this block reads and writes `appStorage` ONLY. An
  // unpublished record is private because it lives in the per-viewer store, not
  // because of any field on it — a `visibility` flag inside a shared row's `data`
  // would be cosmetic (the row is world-readable the instant it is appended, and
  // `data` is not moderated). Publish — and only publish — copies it onto the
  // public board.
  //
  // THREE PREFIXES, ONE RULE: unpublished matchups keep the historical
  // `draft:v1:` prefix (live viewers hold records under it — §11.1), unpublished
  // prompts use `unpub:prompt:v1:`, and unpublished grids `unpub:grid:v1:`. All
  // three are DISJOINT, so `list({prefix})` still narrows to exactly one object
  // kind and a withdraw of one kind can never reach another kind's pointer. The
  // shared logic lives in `lib/unpublished.ts`; each object contributes only its
  // own record parser.
  const [drafts, setDrafts] = useState<DraftRecord[]>([]);
  const [unpubPrompts, setUnpubPrompts] = useState<UnpublishedPromptRecord[]>([]);
  const [unpubGrids, setUnpubGrids] = useState<UnpublishedGridRecord[]>([]);
  /** Shared keys this viewer archived — an AUTHOR-SIDE HIDE of their own My list
   * and nothing more (§11.3). Never sent to the shared board. */
  const [archived, setArchived] = useState<string[]>([]);
  const [quota, setQuota] = useState<AppStorageQuota | null>(null);
  const [draftsVersion, setDraftsVersion] = useState(0);
  const refreshDrafts = useCallback(() => setDraftsVersion((v) => v + 1), []);

  useEffect(() => {
    if (!ready) return;
    if (!viewer) {
      // Anonymous: the host rejects every per-viewer write and reads back null,
      // so there is nothing to show and nothing to guess at.
      setDrafts([]);
      setUnpubPrompts([]);
      setUnpubGrids([]);
      setArchived([]);
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
        const foundPrompts: UnpublishedPromptRecord[] = [];
        await forEachStoredKey(
          store,
          UNPUB_PROMPT_PREFIX,
          async (key) => {
            if (cancelled) return 'stop';
            const parsed = parseUnpubPrompt(await store.get(key));
            if (cancelled) return 'stop';
            if (parsed) foundPrompts.push(parsed);
          },
          { shouldStop: () => cancelled },
        );
        if (!cancelled) setUnpubPrompts(sortUnpubPrompts(foundPrompts));
      } catch {
        /* best-effort — same reasoning as the matchup scan above */
      }
      try {
        const foundGrids: UnpublishedGridRecord[] = [];
        await forEachStoredKey(
          store,
          UNPUB_GRID_PREFIX,
          async (key) => {
            if (cancelled) return 'stop';
            const parsed = parseUnpubGrid(await store.get(key));
            if (cancelled) return 'stop';
            if (parsed) foundGrids.push(parsed);
          },
          { shouldStop: () => cancelled },
        );
        if (!cancelled) setUnpubGrids(sortUnpubGrids(foundGrids));
      } catch {
        /* best-effort — same reasoning as the two scans above */
      }
      try {
        // 🔴 ONE key, not a prefix scan: the archive is a single `string[]`
        // (§11.3), so a failed read degrades to "nothing archived" — which shows
        // MORE of the viewer's own rows, never fewer.
        const raw = await store.get<unknown>(ARCHIVE_KEY);
        if (!cancelled) setArchived(parseArchive(raw));
      } catch {
        if (!cancelled) setArchived([]);
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

  // 🔴 ALL FOUR BUCKETS. `grids` used to be destructured away and discarded: the
  // parser classified a grid row correctly and the App then dropped it on the
  // floor, so a published grid was invisible no matter what was on the board.
  const { combinations, prompts, results, grids } = useMemo(() => splitRows(items), [items]);
  // The top-voted sets, at the FIXED `DEFAULT_TOP_N` now that the per-viewer
  // slider is gone. These are the "Included" badges on the Matchups and Prompts
  // lists AND the members of the system-owned Top Grid — one computation, so the
  // badge and the grid can never disagree about who is in.
  const includedCombos = useMemo(() => topByVotes(combinations, DEFAULT_TOP_N), [combinations]);
  const includedPrompts = useMemo(() => topByVotes(prompts, DEFAULT_TOP_N), [prompts]);
  const includedComboKeys = useMemo(() => new Set(includedCombos.map((r) => r.key)), [includedCombos]);
  const includedPromptKeys = useMemo(() => new Set(includedPrompts.map((r) => r.key)), [includedPrompts]);

  /** Every matchup and prompt currently on the board, as `GridPicker` rows. */
  const matchupPickerItems = useMemo<GridPickerItem[]>(
    () =>
      combinations.map((c) => ({
        key: c.key,
        name: c.name || `#${c.key}`,
        description: c.description,
        meta: `${c.data.configs.length} config${c.data.configs.length === 1 ? '' : 's'}`,
      })),
    [combinations],
  );
  const promptPickerItems = useMemo<GridPickerItem[]>(
    () =>
      prompts.map((p) => ({
        key: p.key,
        name: p.name || `#${p.key}`,
        description: p.description,
      })),
    [prompts],
  );

  // ---- vote wiring ----
  // Apply the host's post-mutation answer to the row: the returned aggregate
  // `count` AND this viewer's own flag, together, because they are two halves of
  // one host fact. Writing only the count is what used to force a second,
  // separately-stored copy of the vote state.
  const applyVote = useCallback((key: string, count: number, voted: boolean) => {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, count, viewerVoted: voted } : it)));
  }, []);

  const onVote = useCallback(
    async (key: string) => {
      const count = await depsRef.current.shared.vote(key);
      applyVote(key, count, true);
      depsRef.current.track('vote');
      return count;
    },
    [applyVote],
  );

  const onUnvote = useCallback(
    async (key: string) => {
      const count = await depsRef.current.shared.unvote(key);
      applyVote(key, count, false);
      depsRef.current.track('vote_removed');
      return count;
    },
    [applyVote],
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
        prev.some((it) => it.key === key)
          ? prev
          : [{ key, count: 0, authorUserId: viewer.id, value, viewerVoted: false }, ...prev],
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
   * Drop the per-viewer POINTER at a shared row that no longer exists, under the
   * given object's storage prefix.
   *
   * 🔴 A published record is rewritten to `{localId, sharedKey, submittedAt}` and
   * its editable body is DROPPED (see `publishedPointer`). So once the row it
   * points at is withdrawn there is nothing left to restore and nothing left to
   * act on — the pointer is a per-viewer row asserting a board entry that does
   * not exist, and it still consumes a quota row. So the pointer goes.
   *
   * Scope, deliberately narrow, and narrow in TWO independent ways:
   *
   *   1. Only the withdrawn row's OWN prefix is scanned. ⚠️ This used to be
   *      hard-wired to `DRAFT_PREFIX` with a comment explaining that prompts
   *      could never have a pointer — TRUE until 527 gave prompts an unpublished
   *      form of their own. It is now a parameter, and the prompt surface passes
   *      `UNPUB_PROMPT_PREFIX` rather than skipping the scan: skipping it would
   *      orphan exactly the pointers the new prompt publish path writes.
   *   2. Even within one prefix the ONLY pointer touched is one whose
   *      `sharedKey` equals the withdrawn key — another of the viewer's own rows
   *      keeps its pointer, which is a separate guard.
   *
   * 🔴 THE LOOKUP GOES TO THE STORE, NOT TO RENDER STATE, and that is not a
   * style choice. Reading the `drafts` state (or a ref mirroring it) makes the
   * fix silently inert whenever that list is EMPTY FOR A REASON THAT HAS
   * NOTHING TO DO WITH THE POINTER — and there are three such reasons, all
   * reachable: the KV list effect has not resolved yet (withdraw first and the
   * list is still `[]`), `list()` threw and was swallowed so the board could
   * stay up, or the viewer has more records than `KV_MAX_PAGES` pages. In
   * every one of those the pointer is real, the scan against render state
   * misses it, and nothing ever re-checks — the exact orphan this function
   * exists to remove, persisting with no error anywhere. Measured before the
   * fix: withdrawing before the list resolved left `deletes: []` and the
   * buttonless card on screen.
   */
  const clearPointerFor = useCallback(
    async (prefix: string, sharedKey: string) => {
      const store = depsRef.current.appStorage;
      try {
        await forEachStoredKey(store, prefix, async (key) => {
          const parsed = parsePointer(await store.get(key));
          if (!parsed || parsed.sharedKey !== sharedKey) return;
          // Idempotent per the SDK: deleting a key that isn't set resolves
          // `{deleted: false}` rather than throwing.
          await store.delete(unpublishedKey(prefix, parsed.localId));
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
     * @param pointerPrefix the per-viewer storage prefix to sweep for a pointer
     *   at this key afterwards. Each surface passes ITS OWN prefix; the two are
     *   disjoint, so a matchup withdraw can never reach a prompt's pointer.
     */
    async (key: string, pointerPrefix: string) => {
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
      await clearPointerFor(pointerPrefix, key);
      depsRef.current.track('withdraw');
      reload();
    },
    [optimisticDelete, reload, clearPointerFor],
  );

  /** Withdraw a COMBINATION — sweeping the matchup prefix for its pointer. */
  const withdrawCombination = useCallback(
    (key: string) => withdrawRow(key, DRAFT_PREFIX),
    [withdrawRow],
  );

  /**
   * Withdraw a PROMPT — sweeping the PROMPT prefix for its pointer.
   *
   * 🔴 THIS USED TO SWEEP NOTHING, and the reasoning was sound at the time:
   * prompts had no unpublished form, so a prompt's host-minted key could not
   * match any pointer and the walk was guaranteed fruitless. 527 gave prompts
   * their own unpublished store (`unpub:prompt:v1:`), which retired that premise
   * — a published-then-withdrawn prompt now leaves exactly the orphan the matchup
   * sweep exists to remove. The prefixes are disjoint, so this scans only prompt
   * pointers and the matchup sweep only matchup pointers.
   */
  const withdrawPrompt = useCallback(
    (key: string) => withdrawRow(key, UNPUB_PROMPT_PREFIX),
    [withdrawRow],
  );

  /**
   * Withdraw a GRID — sweeping the GRID prefix for its pointer.
   *
   * 🔴 IT REMOVES THE GRID ROW AND NOTHING ELSE. A grid's members are other
   * authors' rows; `withdraw` is author-scoped, so this app could not touch them
   * even if it wanted to, and it must not appear to: every matchup and prompt the
   * grid named stays on the board, keeps its votes, and keeps serving every OTHER
   * grid that names it. What the grid's readers lose is the grid.
   */
  const withdrawGrid = useCallback(
    (key: string) => withdrawRow(key, UNPUB_GRID_PREFIX),
    [withdrawRow],
  );

  /**
   * Report ANOTHER viewer's row for platform moderator review — the board's only
   * abuse seam, and the one power that is not author-scoped.
   *
   * 🔴 IT DOES NOT HIDE THE ROW, and nothing here should suggest otherwise. The
   * host files the report and a moderator decides; `items` is deliberately NOT
   * touched, so the row stays exactly where it is. There is no owner-side hide
   * to fall back on either — `update`/`withdraw` both reject for anyone but the
   * row's author, so escalation is the whole of what this app can offer.
   *
   * Rejections propagate to `ReportButton`, which stays armed for a retry: a
   * failed report that closed quietly would read as a filed one.
   */
  const reportRow = useCallback(async (key: string) => {
    await depsRef.current.shared.report(key);
    depsRef.current.track('report');
  }, []);

  // ---- private write paths (see the per-viewer block above) ----

  /**
   * Save an unpublished MATCHUP. 🔴 PRIVATE PATH — `appStorage.set` and nothing
   * else. This is the path acceptance criterion 7 pins: it must never reach
   * `shared.append`, because that call is the moment the record becomes public
   * and there is no other boundary in the platform that makes it not so.
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

  /** Discard an unpublished matchup. 🔴 PRIVATE PATH — per-viewer delete only. */
  const deleteDraft = useCallback(
    async (localId: string) => {
      await depsRef.current.appStorage.delete(draftKey(localId));
      refreshDrafts();
    },
    [refreshDrafts],
  );

  /** Save an unpublished PROMPT. 🔴 PRIVATE PATH — the exact mirror of
   * `saveDraft`, against the disjoint `unpub:prompt:v1:` prefix. */
  const saveUnpubPrompt = useCallback(
    async (localId: string, input: PromptInput) => {
      await depsRef.current.appStorage.set(unpubPromptKey(localId), buildUnpubPrompt(localId, input));
      depsRef.current.track('save_unpublished_prompt');
      closeModal();
      refreshDrafts();
    },
    [closeModal, refreshDrafts],
  );

  /** Discard an unpublished prompt. 🔴 PRIVATE PATH — per-viewer delete only. */
  const deleteUnpubPrompt = useCallback(
    async (localId: string) => {
      await depsRef.current.appStorage.delete(unpubPromptKey(localId));
      refreshDrafts();
    },
    [refreshDrafts],
  );

  /** Save an unpublished GRID. 🔴 PRIVATE PATH — the third mirror of `saveDraft`,
   * against the disjoint `unpub:grid:v1:` prefix. A grid names other people's
   * rows, but naming them is not publishing anything: nothing here reaches
   * `shared.append`. */
  const saveUnpubGrid = useCallback(
    async (localId: string, input: GridInput) => {
      await depsRef.current.appStorage.set(unpubGridKey(localId), buildUnpubGrid(localId, input));
      depsRef.current.track('save_unpublished_grid');
      closeModal();
      refreshDrafts();
    },
    [closeModal, refreshDrafts],
  );

  /** Discard an unpublished grid. 🔴 PRIVATE PATH — per-viewer delete only. */
  const deleteUnpubGrid = useCallback(
    async (localId: string) => {
      await depsRef.current.appStorage.delete(unpubGridKey(localId));
      refreshDrafts();
    },
    [refreshDrafts],
  );

  // ---- archive (an AUTHOR-SIDE HIDE, and NOT a suppression — §11.3) ----
  //
  // 🔴 IT WRITES ONE PER-VIEWER KEY AND TOUCHES THE SHARED BOARD NOWHERE. The row
  // stays appended, keeps its votes, and stays in Community for every viewer
  // including this one — the app HAS no power to do otherwise (`update`/`withdraw`
  // are author-scoped, `report()` does not hide), which is exactly why the UI says
  // so in words next to the control (`ARCHIVE_NOTE`).
  const writeArchive = useCallback(
    async (next: string[]) => {
      if (!viewer) return;
      setArchived(next);
      try {
        await depsRef.current.appStorage.set(ARCHIVE_KEY, next);
      } catch (e) {
        // The host's own error string — developer-facing, never viewer copy.
        console.debug('[model-benchmarking] archive write rejected:', e);
        // Re-read on the next refresh rather than leaving the optimistic value
        // as the only record of a write that did not land.
        refreshDrafts();
      }
    },
    [viewer, refreshDrafts],
  );

  const archiveRow = useCallback(
    (key: string) => writeArchive(withArchived(archived, key)),
    [archived, writeArchive],
  );
  const unarchiveRow = useCallback(
    (key: string) => writeArchive(withoutArchived(archived, key)),
    [archived, writeArchive],
  );

  // Synchronous claim set, mirroring the runner's: a second submit for the same
  // draft returns here, so a double-tap can never mint two public rows (and
  // `append` has no idempotency key — a duplicate is permanent and unmergeable).
  const submittingRef = useRef<Set<string>>(new Set());

  /**
   * Local ids whose `shared.append` HAS ALREADY RESOLVED in this session.
   *
   * 🔴 THIS IS THE SECOND HALF OF THE ANTI-DUPLICATE GUARD, and it exists because
   * `submittingRef` alone only covers the window while a call is IN FLIGHT. The
   * uncovered window is the one that costs: `append` succeeds, the pointer write
   * that would have retired the record REJECTS (per-app quota, >64KB, anon), the
   * record therefore keeps its editable body, the card keeps saying **Publish**,
   * and a second click appends a SECOND permanent public row. `append` has no
   * idempotency key and `update`/`withdraw` are addressed by the key that only
   * ever reached the failed write — so the duplicate is unmergeable and, from
   * this app, unremovable.
   *
   * It is STATE rather than a ref on purpose: retiring the id has to re-render
   * the three unpublished lists, which is what actually takes the button away.
   *
   * ⚠ THE SCOPE, STATED SO NOBODY READS MORE INTO IT. It is SESSION-scoped —
   * neither durable nor viewer-scoped:
   *   - a RELOAD re-reads the store, and THIS SET is not in it. What survives a
   *     reload is `publishRecord`'s step 4: on a failed pointer write it DELETES
   *     the private record, so the reload has nothing to re-list. That delete is
   *     best-effort — the same store refused the write a moment earlier and can
   *     refuse this too — and when it is refused the record does come back still
   *     offering Publish. The viewer copy branches on exactly that outcome
   *     (`publishPointerFailedNotice`); this set never claims to cover it.
   *   - it is deliberately NOT cleared on a viewer switch. The clear would have
   *     to live in an effect, and the drafts effect below re-runs on
   *     `draftsVersion` — i.e. after every publish — so putting it there would
   *     undo this guard immediately. The residual cost is that a SECOND viewer in
   *     the same session whose stored record happened to carry an identical
   *     `localId` would have it hidden; local ids are `newId()`-minted (timestamp
   *     plus a process-local counter) and the two viewers' records were written by
   *     different processes, so that is a collision, not a normal case.
   */
  const [publishedLocalIds, setPublishedLocalIds] = useState<string[]>([]);
  const publishedThisSession = useMemo(() => new Set(publishedLocalIds), [publishedLocalIds]);

  /**
   * 🔴 THE ONE PATH FROM A PER-VIEWER RECORD TO THE PUBLIC BOARD, for all three
   * publishable objects. It was open-coded three times (matchup, prompt, grid)
   * and was wrong at all three in the same direction — the pointer write had no
   * `catch`, so the failure above was silent on every surface. Each object now
   * contributes only what genuinely differs: its own local id, its own KV key,
   * its own payload (built by its own builder, so the wire shape and the
   * moderation split stay that builder's business) and its own analytics event.
   *
   * THE ORDER BELOW, AND WHAT IS ACTUALLY LOAD-BEARING IN IT:
   *
   *  1. `append` FIRST and alone. Everything after it is reasoning about a row
   *     that is already public and already permanent.
   *  2. RETIRE THE LOCAL ID before the pointer write. What makes "the UI never
   *     offers Publish for this record again IN THIS SESSION" true is that the
   *     retirement runs on BOTH outcomes of the pointer write — which the inner
   *     `try`/`catch` at step 3 already guarantees on its own.
   *     ⚠ SO THE ORDERING IS DEFENCE-IN-DEPTH, NOT A MEASURED INVARIANT. An
   *     earlier draft of this comment said "nothing between the `append` and
   *     this line may await", read as a measured rule. It is not one: moving the
   *     retirement to after the inner `try/catch` was measured behaviourally
   *     identical (re-measured 2026-09-08 at this branch's HEAD: 526/526 green
   *     across 42 files, both vitest projects — the earlier "524/524" here was
   *     a mid-edit tree's count, never this branch's). It is kept ahead of the
   *     write because the
   *     catch is what the invariant actually rests on, and a future edit that
   *     removes or narrows that catch would silently take the retirement with
   *     it — before the write, a rejection cannot reach it at all.
   *  3. The pointer write is ATTEMPTED AND CAUGHT — this catch IS the guard. It
   *     is a real loss when the write fails (the pointer is the only per-viewer
   *     handle on a host-minted key — see `publishedPointer`), but it is a loss
   *     on top of a success, not a reason to pretend the publish did not happen.
   *  4. On that failure the private record is DELETED, best-effort. Its only
   *     remaining purpose was to become the pointer, and the row is reachable
   *     without it ("Published by you" filters on `isOwnRow`, i.e. on
   *     `authorUserId`, never on pointer presence). This is what makes the
   *     retirement survive a RELOAD instead of only a re-render: `publishedLocalIds`
   *     is React state, so without the delete the next load re-reads the store —
   *     the very store that could not be written — and offers Publish again.
   *     The delete can itself be refused, so its outcome is OBSERVED and handed
   *     to the copy rather than assumed.
   *  5. The failure is RE-THROWN as viewer copy, never swallowed. `UnpublishedList`
   *     catches it and renders it; a quiet `finally` here is what made this
   *     invisible in the first place. The copy BRANCHES on step 4's outcome —
   *     see `publishPointerFailedNotice`, which is true either way.
   */
  const publishRecord = useCallback(
    async (spec: {
      /** Per-viewer local id: the claim identity AND the pointer's own id. */
      localId: string;
      /** Viewer-facing noun, for the honest failure copy. */
      noun: 'matchup' | 'prompt' | 'grid';
      /** The per-viewer KV key holding this record. */
      storageKey: string;
      /** The board payload, from this object's own payload builder. */
      payload: SharedAppendValue;
      /** Analytics event name and props for this object kind. */
      event: string;
      props: Record<string, unknown>;
    }) => {
      if (submittingRef.current.has(spec.localId)) return;
      // ⚠ BELT-AND-BRACES, not a live gate: every caller resolves `spec.localId`
      // out of a list this session's retirement has already filtered, so this
      // line is unreachable in production and deleting it leaves the suite green
      // (re-measured 2026-09-08 at this branch's HEAD: 526/526, 42 files, both
      // vitest projects). It is kept because it is
      // the cheap half of the pair — `submittingRef` covers only the in-flight
      // window — and a future caller that hands a raw stored id straight in
      // would otherwise reach `append`.
      // Do not read it as coverage: the retirement at step 2 is what holds.
      if (publishedThisSession.has(spec.localId)) return;
      submittingRef.current.add(spec.localId);
      try {
        const { key } = await depsRef.current.shared.append(spec.payload);
        // STEP 2 — see the comment above. Ahead of the pointer write as
        // defence-in-depth against a future edit to step 3's catch, NOT because
        // an await in between was measured to break anything.
        setPublishedLocalIds((prev) => (prev.includes(spec.localId) ? prev : [...prev, spec.localId]));
        let pointerError: string | null = null;
        // Only read when `pointerError` is set; `false` is the honest default
        // there, because "we did not remove it" is the claim that invites the
        // viewer to check rather than the one that invites a second click.
        let privateCopyRemoved = false;
        try {
          await depsRef.current.appStorage.set(
            spec.storageKey,
            publishedPointer(spec.localId, key),
          );
        } catch (e) {
          pointerError = errMsg(e);
          // 🔴 STEP 4. Without this the retirement is session-only and a reload
          // re-offers Publish for a row that is already public. RESOLUTION is
          // the test, not `deleted`: `{ ok: true, deleted: false }` means the key
          // was already absent, which is the same end state the copy claims.
          try {
            await depsRef.current.appStorage.delete(spec.storageKey);
            privateCopyRemoved = true;
          } catch {
            // The host refused this too. Nothing left to try — the copy below
            // says so instead of claiming a removal that did not happen.
            privateCopyRemoved = false;
          }
        }
        optimisticInsert(key, spec.payload);
        depsRef.current.track(spec.event, spec.props);
        refreshDrafts();
        reload();
        if (pointerError !== null) {
          throw new Error(
            publishPointerFailedNotice(spec.noun, pointerError, privateCopyRemoved),
          );
        }
      } finally {
        submittingRef.current.delete(spec.localId);
      }
    },
    [optimisticInsert, publishedThisSession, refreshDrafts, reload],
  );

  /**
   * PUBLISH a MATCHUP — the one place an unpublished matchup crosses into the
   * public board, and the only moment the record becomes visible to anyone else.
   * `buildCombinationPayload` is reused verbatim so a submitted draft is
   * byte-identical to a row submitted directly, including `data.kind:
   * 'combination'` (a persisted wire value that discriminates every row already
   * on the board — never renamed) and including the moderation split: every
   * user-authored string is in `title`/`body`, and `data` carries structure only.
   *
   * The draft is then KEPT, rewritten to `{localId, sharedKey, submittedAt}`: it
   * is the only per-viewer handle on the row, since shared keys are host-minted
   * and the shared list has no "mine" index. `publishRecord` owns everything
   * about WHEN that write happens and what a refusal means.
   */
  const submitDraft = useCallback(
    async (draft: DraftUnsubmitted) => {
      const input = draftToInput(draft);
      await publishRecord({
        localId: draft.localId,
        noun: 'matchup',
        storageKey: draftKey(draft.localId),
        payload: buildCombinationPayload(input) as SharedAppendValue,
        event: 'submit_combo',
        props: {
          configCount: input.configs.filter((cfg) => cfg?.checkpoint).length,
          fromDraft: true,
        },
      });
    },
    [publishRecord],
  );

  /**
   * PUBLISH a PROMPT — the exact mirror of `submitDraft`: `buildPromptPayload` is
   * reused verbatim so a published record is byte-identical to a prompt submitted
   * directly (including `data.kind: 'prompt'` and the moderation split).
   */
  const publishUnpubPrompt = useCallback(
    async (rec: UnpublishedPrompt) => {
      const input = unpubPromptToInput(rec);
      await publishRecord({
        localId: rec.localId,
        noun: 'prompt',
        storageKey: unpubPromptKey(rec.localId),
        payload: buildPromptPayload(input) as SharedAppendValue,
        event: 'submit_prompt',
        props: {
          overrideCount: Object.keys(input.overrides ?? {}).length,
          fromUnpublished: true,
        },
      });
    },
    [publishRecord],
  );

  /**
   * PUBLISH a GRID — the third caller, and the ONLY moment a grid becomes visible
   * to anyone else.
   *
   * `buildGridPayload` is reused verbatim, so the row carries `data.kind: 'grid'`
   * at `v: 1` and §11.2's moderation split: the author's name and description go
   * to the moderated `title`/`body` and `data` carries the member keys ONLY. That
   * split is the whole reason the payload builder is not open-coded here — a grid
   * whose name rode in `data` would route author prose around the content belt,
   * and the wire shape is effectively permanent from the first published grid.
   */
  const publishUnpubGrid = useCallback(
    async (rec: UnpublishedGrid) => {
      const input = unpubGridToInput(rec);
      await publishRecord({
        localId: rec.localId,
        noun: 'grid',
        storageKey: unpubGridKey(rec.localId),
        payload: buildGridPayload(input) as SharedAppendValue,
        event: 'submit_grid',
        props: {
          matchupCount: input.matchupKeys.length,
          promptCount: input.promptKeys.length,
        },
      });
    },
    [publishRecord],
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

  // ---- the two-phase in-flight claim (see {@link InflightRun}) ----
  //
  // 🔴 THE HAZARD THIS REPLACES, because the shape it had was the bug. Persisting
  // the run used to be ONE fire-and-forget write with a SWALLOWED rejection,
  // issued AFTER `submit` — i.e. after the money. `useAppStorage.set` rejects
  // when the value exceeds 64 KB, when the per-app quota would be crossed, or for
  // an anonymous viewer; on a rejection NOTHING was written, so neither the
  // rehydrate scan nor the pre-spend read could find anything, and the next load
  // rendered the cell empty and runnable → a second real charge with no signal
  // anywhere. Not an edge case either: the quota is per-APP while the data is
  // per-(block instance, viewer), so ONE viewer at the ceiling makes the write
  // reject for EVERY viewer at once.
  //
  // No amount of error handling on the old write fixes it — it is downstream of
  // the money BY CONSTRUCTION (you cannot record a workflowId before you have
  // one), and retrying does nothing about quota or size. So the write is split:
  // an AWAITED claim before the spend, and a best-effort upgrade after it.

  /**
   * PHASE 1 — write the claim and REPORT WHAT HAPPENED. 🔴 Three outcomes, not
   * two: the no-viewer branch RETURNS WITHOUT WRITING, and if that were folded
   * into "ok" (as an early `return;` from a `void` function would be) the caller
   * would read a successful claim and spend with nothing persisted — the very
   * bug being fixed, re-entered through its own guard. `beginRun` does gate on
   * `viewer`, but a viewer can change mid-flow without a remount (there is a
   * suite pinning exactly that route), so this is a real branch and not a
   * defensive one.
   */
  const claimInflight = useCallback(
    async (ck: string, entry: InflightRun): Promise<ClaimOutcome> => {
      if (!viewer) return { ok: false, reason: 'no-viewer' };
      try {
        await depsRef.current.appStorage.set(inflightKey(ck), entry);
        return { ok: true };
      } catch (e) {
        // The host's own error string — developer-facing, never viewer copy.
        console.debug('[model-benchmarking] in-flight claim write rejected:', e);
        return { ok: false, reason: 'rejected' };
      }
    },
    [viewer],
  );

  /**
   * PHASE 2 — upgrade an EXISTING claim with the workflowId. Fire-and-forget is
   * safe here, and only here: this key already holds the phase-1 claim, so a lost
   * write degrades the cell to `unknown` (safe — never auto-runnable) rather than
   * to absent (the double charge). One row per cell, so concurrent runs cannot
   * read-modify-write-clobber each other.
   */
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
          // 🔴 THIS USED TO GATE ON `persisted?.workflowId`, so a CLAIM-ONLY
          // entry — the record written before a spend whose outcome we never
          // learned — fell straight through and SPENT AGAIN, on the one cell we
          // have positive evidence may already have been charged. It adopts the
          // record's own state now (`stalled` with a workflowId, `unknown`
          // without), which is the same mapping the rehydrate scan uses.
          if (validInflight(persisted)) {
            setRun(ck, inflightToRun(persisted));
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
      const matched = resolveCell(row.config, prompt);
      const coords = {
        comboKey: row.comboKey,
        configId: row.config.id,
        promptKey: prompt.key,
        ecosystem: matched.ecosystem,
      };

      // 🔴 PHASE 1 — CLAIM BEFORE SPEND, AND AWAIT IT. Everything above this line
      // is a guard that only works if a claim was actually WRITTEN, and the write
      // used to happen after `submit`: a rejection meant nothing was recorded, so
      // the next load offered the cell as runnable and the viewer paid twice with
      // nothing anywhere to say so. Writing first inverts that — the failure now
      // lands BEFORE the money, where it is a refused run instead of a silent
      // second charge. It also closes the crash window (submit succeeds, browser
      // closes before the record is written), which the old order could not.
      //
      // The claim carries the cell coords and NO workflowId, because there is no
      // workflow yet. That record means "we were about to spend and we do not
      // know whether we did" — see {@link InflightRun}.
      const claim = await claimInflight(ck, coords);
      if (!claim.ok) {
        setRun(ck, {
          ...coords,
          status: 'failed',
          error: claim.reason === 'no-viewer' ? CLAIM_NO_VIEWER_MESSAGE : CLAIM_FAILED_MESSAGE,
        });
        inFlightRef.current.delete(ck);
        return;
      }

      let first: BlockWorkflowSnapshot;
      try {
        const body = buildCellWorkflowBody(row.config, row.comboKey, prompt);
        first = await depsRef.current.submit(body);
      } catch (e) {
        // 🔴 THE SPEND'S OWN OUTCOME IS UNKNOWN — not failed. The request may
        // have reached the host and succeeded with only the response lost, so
        // this must NOT render as "failed" (which invites a re-run) and the
        // claim must NOT be cleared. It stays, and the cell says so.
        console.debug('[model-benchmarking] submit did not return a result:', e);
        setRun(ck, { ...coords, status: 'unknown' });
        inFlightRef.current.delete(ck);
        return;
      }

      try {
        if (first.status === 'failed') {
          // A DEFINITE answer from the host, unlike the throw above: the workflow
          // exists and failed, so there is nothing to resolve later — drop the
          // claim rather than leave a cell that rehydrates as unknown forever.
          clearInflight(ck);
          setRun(ck, { status: 'failed', error: first.error ?? 'Generation failed.' });
          return;
        }
        setRun(ck, { status: 'processing', workflowId: first.workflowId });
        // 🔴 PHASE 2 — upgrade the SAME key with the workflowId now that one
        // exists, turning the unresolved claim into a resumable run. Best-effort
        // by design: if this write is lost the claim survives and the cell
        // rehydrates as `unknown`, which is safe. It is never empty+runnable.
        persistInflight(ck, { workflowId: first.workflowId, ...coords });
        await driveToResult(ck, row, prompt, first);
      } catch (e) {
        setRun(ck, { status: 'failed', error: errMsg(e) });
      } finally {
        inFlightRef.current.delete(ck);
      }
    },
    [setRun, claimInflight, persistInflight, clearInflight, driveToResult],
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

  // ---- My-tab render wiring (the PRIVATE half, now inside each object's view) ----
  //
  // 🔴 POINTERS ARE NOT RENDERED, and that is the §11.1 partition rather than an
  // omission. A published row reaches the My tab through `isOwnRow` over the board
  // scan — the client-side "mine" index the spec settles on — so rendering the
  // pointer too would show the same row twice, once as a card with Edit/Remove and
  // once as a stub that can do neither. The pointer keeps its STORAGE role: it is
  // the per-viewer handle a withdraw sweeps (`clearPointerFor`) and the reason a
  // published record is not left behind as an editable private copy.
  //
  // 🔴 `publishedThisSession` IS THE SECOND FILTER ON ALL THREE, and it is what
  // makes "a successful `append` retires the record from this list" true even
  // when the pointer write that would normally have retired it was REFUSED.
  //
  // ⚠ NARROWED BY `publishRecord`'s STEP 4, and this comment says so rather than
  // over-claiming the way it used to. On a refused pointer write the app now
  // DELETES the private record, so on the primary path the record is gone from
  // the store and `refreshDrafts()` alone would drop it from these lists. This
  // filter is what covers the sub-case where that delete is refused TOO: the
  // record then keeps its editable body, `isSubmitted` / `isPublishedPrompt` /
  // `isPublishedGrid` all still say "unpublished", and without this filter the
  // card comes back saying **Publish**, one click from a second permanent public
  // row. It also covers the window before `refreshDrafts()` resolves. See
  // `publishRecord`, and `publishPointerFailedNotice` for the copy that branches
  // on the same outcome.
  const unpublishedMatchups = useMemo(
    () =>
      drafts.filter(
        (d): d is DraftUnsubmitted => !isSubmitted(d) && !publishedThisSession.has(d.localId),
      ),
    [drafts, publishedThisSession],
  );
  const unpublishedPrompts = useMemo(
    () =>
      unpubPrompts.filter(
        (p): p is UnpublishedPrompt =>
          !isPublishedPrompt(p) && !publishedThisSession.has(p.localId),
      ),
    [unpubPrompts, publishedThisSession],
  );
  const unpublishedGrids = useMemo(
    () =>
      unpubGrids.filter(
        (g): g is UnpublishedGrid => !isPublishedGrid(g) && !publishedThisSession.has(g.localId),
      ),
    [unpubGrids, publishedThisSession],
  );
  const archivedKeys = useMemo(() => new Set(archived), [archived]);
  const quotaLine = formatQuota(quota);

  const publishMatchupById = useCallback(
    async (localId: string) => {
      const rec = unpublishedMatchups.find((d) => d.localId === localId);
      if (rec) await submitDraft(rec);
    },
    [unpublishedMatchups, submitDraft],
  );
  const publishPromptById = useCallback(
    async (localId: string) => {
      const rec = unpublishedPrompts.find((p) => p.localId === localId);
      if (rec) await publishUnpubPrompt(rec);
    },
    [unpublishedPrompts, publishUnpubPrompt],
  );
  const publishGridById = useCallback(
    async (localId: string) => {
      const rec = unpublishedGrids.find((g) => g.localId === localId);
      if (rec) await publishUnpubGrid(rec);
    },
    [unpublishedGrids, publishUnpubGrid],
  );
  const editGridById = useCallback(
    (localId: string) => {
      const rec = unpublishedGrids.find((g) => g.localId === localId);
      if (rec)
        setModal({
          kind: 'unpub-grid',
          localId: rec.localId,
          initial: unpubGridToInput(rec),
          existing: true,
        });
    },
    [unpublishedGrids],
  );
  const editMatchupById = useCallback(
    (localId: string) => {
      const rec = unpublishedMatchups.find((d) => d.localId === localId);
      if (rec)
        setModal({ kind: 'draft', localId: rec.localId, initial: draftToInput(rec), existing: true });
    },
    [unpublishedMatchups],
  );
  const editPromptById = useCallback(
    (localId: string) => {
      const rec = unpublishedPrompts.find((p) => p.localId === localId);
      if (rec)
        setModal({
          kind: 'unpub-prompt',
          localId: rec.localId,
          initial: unpubPromptToInput(rec),
          existing: true,
        });
    },
    [unpublishedPrompts],
  );

  // ---- render ----
  // 🔴 `data-theme` goes through `paintTheme`, never bare `theme`: before `ready`
  // the SDK's snapshot hardcodes `'light'`, so stamping it here would repaint the
  // dark boot skeleton light and then dark again at BLOCK_INIT. See src/bootTheme.ts.
  if (!ready) {
    return (
      <div ref={rootRef} data-theme={paintTheme(ready, theme)} style={pageStyle(c)}>
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
      data-theme={paintTheme(ready, theme)}
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
                <strong>Submit</strong> checkpoint + LoRA matchups and prompts.
              </li>
              <li>
                <strong>Vote</strong> — the top-voted matchups and prompts become the grid's rows and
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
                <span data-testid="view-switch-matchups">Matchups ({combinations.length})</span>
              ),
            },
            {
              value: 'prompts',
              label: <span data-testid="view-switch-prompts">Prompts ({prompts.length})</span>,
            },
            { value: 'grid', label: <span data-testid="view-switch-grid">Grids</span> },
          ]}
        />

        {/*
          🔴 THE BOARD IS BIGGER THAN WHAT IS RANKED. `list()` is newest-first with
          no server-side sort, so "most-voted" is computed client-side over the
          rows the scan actually read — and the scan stops at a page cap. When it
          stops early, the counts in the tabs above, the top-N that becomes the
          grid, and every "Included" badge describe a PREFIX of the board.

          Saying so is the whole point: an honest partial beats a confident wrong
          order, and the alternative is a ranking that silently omits row 2001
          while looking complete. Rendered next to the switch so it is visible in
          all three views, since all three read the same truncated ranking.

          ⚠ 527 gave it a THIRD reader without changing a line here, and that is
          why it is placed next to the switch rather than inside a view: the Grids
          view ranks Community Grids by the same client-side count over the same
          truncated scan, and the TOP GRID's members come straight out of the
          matchup and prompt rankings this notice is about. It is now the DEFAULT
          view, so this disclosure is the first thing a viewer of an over-cap
          board sees.
        */}
        {boardTruncated && (
          <Alert color="warning" data-testid="board-truncated-notice">
            This board has more entries than the app can rank at once. Vote order — and
            the rows and columns of the grid — cover only the entries loaded so far.
          </Alert>
        )}

        {view === 'combos' && (
          <MatchupsView
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
            onReport={reportRow}
            unpublished={unpublishedMatchups}
            quotaLine={quotaLine}
            archivedKeys={archivedKeys}
            onNewUnpublished={() =>
              setModal({ kind: 'draft', localId: newDraftLocalId(), existing: false })
            }
            onEditUnpublished={editMatchupById}
            onDiscardUnpublished={deleteDraft}
            onPublishUnpublished={publishMatchupById}
            onArchive={archiveRow}
            onUnarchive={unarchiveRow}
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
            onReport={reportRow}
            unpublished={unpublishedPrompts}
            quotaLine={quotaLine}
            archivedKeys={archivedKeys}
            onNewUnpublished={() =>
              setModal({ kind: 'unpub-prompt', localId: newUnpubPromptLocalId(), existing: false })
            }
            onEditUnpublished={editPromptById}
            onDiscardUnpublished={deleteUnpubPrompt}
            onPublishUnpublished={publishPromptById}
            onArchive={archiveRow}
            onUnarchive={unarchiveRow}
          />
        )}

        {view === 'grid' && (
          // `minWidth: 0` for the same reason `contentStyle` carries it: this
          // Stack is a grid item holding the wide results matrix, and its
          // default content-based minimum would re-introduce the blowout one
          // level below the containment in `contentStyle`.
          <Stack gap={14} data-testid="grid-view" style={{ minWidth: 0 }}>
            <GridsView
              grids={grids}
              combinations={combinations}
              prompts={prompts}
              votedKeys={votedKeys}
              viewerId={viewer?.id ?? null}
              loading={loading}
              error={error}
              /* 🔴 The SAME flag the `board-truncated-notice` above is rendered
                 from. A grid's members are resolved against the rows this scan
                 READ, so when it stopped early a "missing" member may simply be
                 unread — and the notice must not tell the viewer its author
                 removed it. */
              boardTruncated={boardTruncated}
              onVote={onVote}
              onUnvote={onUnvote}
              onRequireAuth={requireAuth}
              onWithdraw={withdrawGrid}
              onReport={reportRow}
              unpublished={unpublishedGrids}
              quotaLine={quotaLine}
              archivedKeys={archivedKeys}
              onNewUnpublished={() =>
                setModal({ kind: 'unpub-grid', localId: newGridLocalId(), existing: false })
              }
              onEditUnpublished={editGridById}
              onDiscardUnpublished={deleteUnpubGrid}
              onPublishUnpublished={publishGridById}
              onArchive={archiveRow}
              onUnarchive={unarchiveRow}
              /* 🔴 The matrix is rendered HERE, not inside GridsView, because
                 every prop below it is money-shaped (the estimate → confirm →
                 submit → poll path and the Buzz gate). A browse surface has no
                 business holding those. `matchups`/`prompts` arrive already
                 RESOLVED against the live board, so a withdrawn member simply
                 is not among them — and the count of what is gone is disclosed
                 by the view that resolved them. */
              renderMatrix={(matchups, gridPrompts) => (
                <ResultsGrid
                  configs={flattenConfigs(matchups)}
                  prompts={gridPrompts}
                  results={results}
                  runs={runs}
                  c={c}
                  buzzTotal={buzzTotal}
                  GatedCell={deps.GatedCell}
                  onRunCell={beginRun}
                  onConfirmRun={confirmRun}
                  onResumeRun={resumeRun}
                  onCancelRun={cancelRun}
                  onAddCombination={() => setView('combos')}
                  onAddPrompt={() => setView('prompts')}
                />
              )}
            />
          </Stack>
        )}

        <Modal
          opened={modal.kind === 'combo'}
          onClose={closeModal}
          title={modal.kind === 'combo' && modal.edit ? 'Edit matchup' : 'Submit a matchup'}
          size="lg"
        >
          {modal.kind === 'combo' && (
            <MatchupForm
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
        {/* The PRIVATE matchup form — the same combination form, saving to the
            PER-VIEWER store. Its submit button says "Save privately" precisely
            because saving is not publishing: nothing here reaches the public
            board. (The word "draft" left the rendered vocabulary in 527; the
            STORAGE prefix keeps it forever — see lib/drafts.ts.) */}
        <Modal
          opened={modal.kind === 'draft'}
          onClose={closeModal}
          title={
            modal.kind === 'draft' && modal.existing
              ? 'Edit your unpublished matchup'
              : 'New matchup (not published yet)'
          }
          size="lg"
        >
          {modal.kind === 'draft' && (
            <MatchupForm
              key={modal.localId}
              pickResource={deps.pickResource}
              initial={modal.initial}
              submitLabel="Save privately"
              onSubmit={(input) => saveDraft(modal.localId, input)}
              onCancel={closeModal}
            />
          )}
        </Modal>
        {/* The PRIVATE prompt form — the mirror of the matchup one, against the
            `unpub:prompt:v1:` prefix. Same rule: saving is not publishing. */}
        <Modal
          opened={modal.kind === 'unpub-prompt'}
          onClose={closeModal}
          title={
            modal.kind === 'unpub-prompt' && modal.existing
              ? 'Edit your unpublished prompt'
              : 'New prompt (not published yet)'
          }
          size="lg"
        >
          {modal.kind === 'unpub-prompt' && (
            <PromptForm
              key={modal.localId}
              initial={modal.initial}
              submitLabel="Save privately"
              onSubmit={(input) => saveUnpubPrompt(modal.localId, input)}
              onCancel={closeModal}
            />
          )}
        </Modal>
        {/* The PRIVATE grid form. 🔴 There is no public sibling: a grid has ONE
            create path and it lands in the per-viewer store. Publishing it is a
            separate, explicit button on the record (see `publishUnpubGrid`). */}
        <Modal
          opened={modal.kind === 'unpub-grid'}
          onClose={closeModal}
          title={
            modal.kind === 'unpub-grid' && modal.existing
              ? 'Edit your unpublished grid'
              : 'New grid (not published yet)'
          }
          size="lg"
        >
          {modal.kind === 'unpub-grid' && (
            <GridForm
              key={modal.localId}
              matchupItems={matchupPickerItems}
              promptItems={promptPickerItems}
              initial={modal.initial}
              submitLabel="Save privately"
              onSubmit={(input) => saveUnpubGrid(modal.localId, input)}
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
async function listAll(
  shared: UseSharedStorage,
): Promise<{ items: RawSharedItem[]; truncated: boolean }> {
  const out: RawSharedItem[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const res = await shared.list({ limit: LIST_PAGE, cursor });
    for (const it of res.items) {
      out.push({
        key: it.key,
        count: it.count,
        authorUserId: it.authorUserId,
        value: it.value,
        viewerVoted: it.viewerVoted,
      });
    }
    if (!res.nextCursor) return { items: out, truncated: false };
    cursor = res.nextCursor;
  }
  // 🔴 Fell out of the loop with a cursor still in hand: there are MORE rows on
  // the board than this scan read. Everything downstream — the vote ranking, the
  // "top N" that becomes the grid, the included counts — is therefore computed
  // over a PREFIX of the board, and there is no server-side sort to fall back on
  // (`list` is newest-first only). Reporting it is what lets the UI say so
  // instead of presenting a partial order as the whole one.
  //
  // The same distinction is already drawn carefully for the per-viewer KV scan
  // (`inflightScanTruncatedRef`); this is the public half, which used to return
  // a silent prefix.
  return { items: out, truncated: true };
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
