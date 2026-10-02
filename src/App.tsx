// Model Benchmarking — top-level full-page app.
//
// Owns every SDK hook (block context/token, resource picker, generation-resource
// rehydrate, the Buzz workflow money path + balance, shared storage, consent,
// and the 0.30 publish/gated bridges).
//
// 🔴 A SIDEBAR AND ONE SURFACE AT A TIME. Three generations of IA have passed through
// this file and each retired the last one's premise, so all three are named:
//   1. a top-level `SegmentedControl` routing between three views (Combos / Prompts /
//      Grid), with a `view` state behind it — deleted, because it put the thing the
//      block is FOR behind a click (§11.5, criterion 9);
//   2. ONE PAGE, NO TABS: three simultaneous `data-mb-section` sections plus a
//      `ContributeMenu` dropdown where the strip had been. That page rendered 2166 CSS
//      px and the host's iframe — sized to the VIEWPORT inside an `overflow: hidden`
//      parent — clipped two of the three sections out of every store screenshot;
//   3. now: a SIDEBAR (`SideNav`) choosing Home vs My Benchmarks, and on Home a BOARD
//      SUBNAV (`BoardNav`) mounting exactly ONE community board. There is a `view`
//      state again and it is NOT the one that was deleted: Home always renders the grid
//      and its runnable matrix, so nothing the block is for is behind a click.
//
// 🔴 THE UNSELECTED SURFACES ARE UNMOUNTED, NOT HIDDEN, and every absence that creates
// is asserted as an absence (`boardNav.test.tsx`, `sideNav.test.tsx`,
// `myBenchmarks.test.tsx`). `data-mb-section` is still the ledger marker, and
// `capture-landmarks.test.tsx` now pins the SET per destination rather than one list.
//
// 🔴 THE PER-BOARD My/Community SUB-TABS ARE GONE, AND THE MACHINERY BEHIND THEM IS NOT.
// Drafts, archive and quota all moved to My Benchmarks (`MyList`, `MyGridsView`),
// which is also where `ARCHIVE_NOTE`'s promise — "stays in Community for everyone
// including you" — is true again. The community boards still carry the vote lists the
// Top Grid's members come out of; folding THOSE away is what would starve it.
//
// Submit flows are modals; so are the matchup/prompt DETAIL views the grid's
// group band and column headers open. The hooks are
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

// 🔴 THE BRIDGE HALF, AND IT IS THE HALF THAT STAYS — one reason per binding,
// because "each has its own reason" is worth nothing if the reasons are not here.
// The long form, with the platform-source citations and the three traps a porter
// walks into, is the banner in `src/lib/sdk-runtime.ts`.
//
//   • `useBuzzWorkflow` + `WorkflowEstimateError` — the money path. The SDK's
//     `app.orchestration` is the WRONG replacement and "the wrong version
//     compiles": a direct orchestrator call drops civitai's per-call/per-viewer/
//     per-app spend caps, the viewer's browsing-level clamp and per-app
//     attribution. The right one is `POST /api/v1/blocks/workflows/*`, for which
//     the SDK ships NO CLIENT — and whose `submit` REQUIRES an `idempotencyKey`
//     the bridge hook mints for us. Its own change, against its own spec
//     (`src/money-path.test.tsx`), never a line in this one.
//   • `usePublishGenerationOutputs` — the SDK DOES carry this
//     (`app.host.publishGenerationOutputs`), so this one is DEFERRED, not
//     blocked. It is not a pass-through: the host nests the ids
//     (`reply.result.imageIds`) where the SDK destructures `{ imageIds }` at the
//     top level, so a naive swap throws for a publish that SUCCEEDED, after the
//     viewer paid. It also drops a `title` field. It moves with the money path,
//     because they share one conversation.
//   • `useResourcePicker` — also CARRIED (`app.host.openResourcePicker`), also
//     deferred: it resolves `PickedResource | null` where this app's `deps.pickResource`
//     is typed on `BlockResourceInfo`, so moving it is a shape change through
//     `MatchupForm` rather than a transport change. Same conversation again.
//   • `useGenerationResources` — no SDK client. The route exists
//     (`GET /api/v1/blocks/generation-resources`), so this too is deferred rather
//     than blocked; it feeds the same picker flow.
//   • `useGatedImages` (in `components/GatedCell.tsx`) — no SDK client, and the
//     route to port it to is NOT the one the migration guide names. See trap (1)
//     in `sdk-runtime.ts`: `blocks/images?ids=` and `blocks/gated-images?ids=`
//     have COMPLEMENTARY SQL predicates, so the guide's route returns `[]` for
//     every id this app published, silently, forever.
//   • `useBlockAnalytics` — genuinely has no twin and never will:
//     `BREAKING.md` lists `TRACK_EVENT` as "not carried", AND it has no host
//     handler on either real host, so these calls are ALREADY no-ops on `main`.
import {
  useBlockAnalytics,
  useBuzzWorkflow,
  useGenerationResources,
  useResourcePicker,
  usePublishGenerationOutputs,
  WorkflowEstimateError,
} from '@civitai/blocks-react';
// 🔴 THE PORTED HALF. Snapshot (context/token), host UI (resize/sign-in/consent)
// and the three REST families (per-viewer KV, shared storage, Buzz balance) now
// come from `@civitai/sdk` through ONE adapted transport. See
// `src/lib/sdk-runtime.ts` for the three-group split, and `src/lib/sdk-transport.ts`
// for why there is exactly one transport rather than two.
import {
  useAppStorage,
  useBlockContext,
  useBlockResize,
  useBlockToken,
  useBuzzBalance,
  useRequestConsent,
  useRequestSignIn,
  useSharedStorage,
  type SharedStore,
} from './lib/sdk-runtime.js';
import type { SharedStorageValue } from '@civitai/app-sdk/blocks';
import type { Scope, StorageClient, StorageQuota } from '@civitai/sdk';
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Modal,
  Stack,
} from '@civitai/blocks-react/ui';

import { AI_WRITE_BUDGETED, hasGenerateScope } from './scopes.js';
import { COMPACT_ATTR, LAYOUT_ATTR, compactTapTargetCss, layoutCss } from './compact.js';
import { useIsMobile } from './useMediaQuery.js';
import { palette, pageStyle, contentStyle, token, radius, mutedText, metaText } from './theme.js';
import { paintTheme } from './bootTheme.js';
import type {
  CellRun,
  CombinationRow,
  DraftRecord,
  DraftUnsubmitted,
  GridRow,
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
  isOwnRow,
  modelCountSummary,
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
import {
  buildGridPayload,
  gridToInput,
  newGridLocalId,
  unpubGridKey,
  type GridInput,
} from './lib/grids.js';
import {
  buildUnpubGrid,
  isPublishedGrid,
  parseUnpubGrid,
  sortUnpubGrids,
  UNPUB_GRID_PREFIX,
  unpubGridToInput,
} from './lib/unpubGrids.js';
import {
  buildTopGrid,
  gridMemberSummary,
  missingMembersNotice,
  openGridName,
  openSystemGrid,
  privateGridShortfall,
  resolveOpenGrid,
  SYSTEM_GRID_DOM_KEY,
  type OpenGrid,
  type OpenGridRef,
} from './lib/gridEntries.js';
import {
  cascadeConfirmNotice,
  cascadeLandedSentence,
  cascadeRefusal,
  cascadeStoppedNotice,
  planGridCascade,
  remapGridKeys,
  type BoardRead,
  type CascadeDep,
  type GridCascadePlan,
  type MemberSources,
} from './lib/gridCascade.js';
import {
  parsePointer,
  PointerWriteFailure,
  publishedPointer,
  publishPointerFailedNotice,
  unpublishedKey,
} from './lib/unpublished.js';
import { ARCHIVE_KEY, parseArchive, withArchived, withoutArchived } from './lib/archive.js';
import { forEachStoredKey } from './lib/kv.js';
import { pollToTerminal, mapSnapshotStatus, isTerminalSnapshot } from './lib/workflow.js';
import { BoardNav, type Board } from './components/BoardNav.js';
import { GridOpenPanel } from './components/GridOpenPanel.js';
import { MatchupBody } from './components/MatchupBody.js';
import { MyGridsView } from './components/MyGridsView.js';
import { SideNav, type MainView } from './components/SideNav.js';
import { MatchupsView } from './components/MatchupsView.js';
import { PromptBody } from './components/PromptBody.js';
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
  shared: SharedStore;
  /** The gated grid-cell renderer (per-viewer moderation boundary). */
  GatedCell: GatedCellComponent;
  requestConsent: (opts: { scopes: readonly Scope[] }) => void;
  requestSignIn: () => void;
  /** Per-(viewer, block) KV store — holds this viewer's drafts, in-flight run
   * claims and the dismissed-explainer flag.
   *
   * 🔴 It does NOT hold vote state. It used to, because the shared list once
   * carried only the aggregate `count`; the list now reports `viewerVoted` per
   * row, which is host-derived and therefore correct across devices. */
  appStorage: StorageClient;
  /**
   * Fire-and-forget analytics.
   *
   * ⚠️ NOTHING CONSUMES THESE TODAY — do not reason from them. `track()` posts a
   * `TRACK_EVENT` message, and neither real host bridges it: civitai's own
   * `src/components/AppBlocks/hostHandlerParity.ts` records it as *"currently NOT
   * bridged by EITHER host (no host-side analytics sink wired). Unhandled ⇒
   * silently dropped, never a hang."* — and no `onMessage('TRACK_EVENT')` handler
   * exists in `IframeHost.tsx` or `PageBlockHost.tsx`. (The SDK's
   * `useBlockAnalytics` docstring says the host forwards to a pipeline; that
   * docstring is wrong.) The calls are kept so the events exist the day a sink is
   * wired, but NO question about production behaviour can be answered by querying
   * them, because there is nothing to query.
   */
  track: (eventName: string, properties?: Record<string, unknown>) => void;
  /** Test seams for the poll loop. */
  pollIntervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export interface AppProps {
  deps?: Partial<AppDeps>;
}

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
 * The one modal slot: closed, a combo/prompt form in CREATE or EDIT mode, one of
 * the three UNPUBLISHED forms — the same combination/prompt/grid form saving to the
 * PER-VIEWER store instead of the public board — or a read-mostly DETAIL view.
 * Each private kind is distinct rather than a flag on its public sibling because
 * the two write to different stores, and a single branch deciding which store a
 * save lands in is exactly the branch that gets got wrong later.
 *
 * 🔴 THE DETAIL KINDS HOLD A KEY, NOT A ROW. The row is looked up from `items` at
 * render time, so a matchup that is voted on, edited or WITHDRAWN while its detail
 * is open reflects that instead of showing a stale snapshot — and a withdrawn row
 * closes the modal rather than rendering vote controls for something that is gone.
 */
type ModalState =
  | { kind: 'none' }
  | { kind: 'combo'; edit?: CombinationRow }
  | { kind: 'prompt'; edit?: PromptRow }
  | { kind: 'matchup-detail'; comboKey: string }
  | { kind: 'prompt-detail'; promptKey: string }
  | { kind: 'draft'; localId: string; initial?: CombinationInput; existing: boolean }
  | { kind: 'unpub-prompt'; localId: string; initial?: PromptInput; existing: boolean }
  // 🔴 A grid has no public CREATE form. Matchups and prompts each have one (submit
  // straight to the board); a grid does not, because a grid is assembled from other
  // people's rows and there is no reason to make that assembly public before the
  // author has looked at it. One create form, one store.
  | { kind: 'unpub-grid'; localId: string; initial?: GridInput; existing: boolean }
  // 🔴 …but a PUBLISHED grid IS editable, and this is the kind that does it. It is
  // separate from `unpub-grid` for the same reason `combo` is separate from `draft`:
  // the two save to DIFFERENT STORES (`shared.update` vs `appStorage.set`), and a
  // single branch deciding which store a save lands in is exactly the branch that
  // gets got wrong later.
  | { kind: 'grid'; edit: GridRow }
  // 🔴 THE GRID-PUBLISH CASCADE CONFIRM. It holds the local id AND a DISPLAY SNAPSHOT
  // of the dependencies — and the split between the two is deliberate, because an
  // earlier version recomputed the plan at render for both and got the display wrong:
  // every dependency that landed left the private list, so the dialog body rewrote
  // itself mid-cascade and at zero rendered a counts sentence built from nothing.
  //
  // 🔴 THE **DECISION** IS STILL NEVER SNAPSHOTTED. `runGridCascade` re-plans from the
  // live stores and re-checks the refusal boundary, so a dependency that was published
  // or discarded while this dialog sat open cannot be published again or published
  // unaccountably. `deps` is what the viewer was SHOWN; the plan is what runs.
  | { kind: 'grid-publish'; localId: string; deps: CascadeDep[] };

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

/**
 * How a `GridPicker` row marks one of the viewer's OWN PRIVATE records.
 *
 * 🔴 ONE CONSTANT FOR BOTH AXES, so the matchup picker and the prompt picker cannot
 * drift into two spellings of one state — and so a test can pin the word rather than
 * a substring of a longer composed meta line.
 *
 * 🔴 IT IS "Private", NOT "Draft". §11.1 removed the old word from every rendered
 * string (`myCommunity.test.tsx` scans `document.body.textContent` for it), the
 * STORAGE prefixes keep it forever, and "Private" is the fact that actually holds:
 * the record is in this viewer's per-viewer KV and has never reached
 * `shared.append`. Same word as `MyList`'s state badge, on purpose.
 */
const PRIVATE_PICK_LABEL = 'Private';

/**
 * The cascade's stand-in for a host error when `publishRecord` returned NO KEY.
 *
 * 🔴 IT IS NOT A HOST STRING AND IT DOES NOT PRETEND TO BE ONE. `publishRecord`
 * returns `undefined` only when one of its own anti-duplicate guards short-circuits
 * — nothing was appended and no host call failed — so quoting a made-up host message
 * there would be a lie about where the refusal came from. The cascade refuses rather
 * than publishing a grid whose member key it cannot rewrite.
 *
 * 🔴 AND IT IS REACHABLE, MEASURED — an earlier round proposed deleting this constant
 * and its throw as dead code, and that was wrong. The `submittingRef` early return is
 * taken when the viewer publishes a private matchup and, while that append is still in
 * flight, publishes a grid that names it: the cascade's dependency publish short-
 * circuits, `key` is `undefined`, and this string reaches the viewer.
 * `src/gridDraftsCascade.test.tsx` drives exactly that.
 *
 * ⚠️ THE OTHER EARLY RETURN IS A DIFFERENT ROUTE AND IS STILL UNREACHABLE. The
 * `publishedThisSession` guard below has no known caller that can reach it (every
 * caller resolves its id out of an already-filtered list) and no test. Declining to
 * delete the two as a PAIR over-reached: this one is rescued by measurement, that one
 * is not, and it is kept on its own much weaker argument — one line guarding an
 * irreversible append.
 */
const CASCADE_NO_KEY = 'this app refused a second publish of the same record';

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

/**
 * The empty reported-keys set, shared.
 *
 * 🔴 MODULE-LEVEL SO THE IDENTITY IS STABLE. `reportedKeys` below returns this whenever
 * the stored record does not belong to the viewer on screen; a `new Set()` at that site
 * would be a new object every render and would invalidate every `useMemo` and
 * `React.memo` downstream of it, forever, for a value that never changes.
 *
 * ⚠️ IT IS NOT FROZEN, AND A DRAFT WRAPPED IT IN `Object.freeze` WHICH WOULD HAVE BEEN
 * DECORATION. MEASURED: `Object.freeze(new Set()).add('x')` SUCCEEDS and the size becomes
 * 1 — a Set's contents live in internal slots, not in own properties, so `freeze` does
 * not protect them. A shared mutable empty Set is safe here for a different and
 * checkable reason: every consumer of `reportedKeys` reads it with `.has()` only
 * (`GridsView`, `GridOpenPanel`, `MatchupsView`, `PromptsView`, and the two detail
 * modals — enumerated). If anything ever needs to WRITE to it, give that caller its own
 * copy; do not reach for `freeze`, which would look like a guard and be none.
 */
const EMPTY_REPORTED: Set<string> = new Set<string>();

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

  /**
   * Latest `useBuzzBalance()` handle, readable from a callback/effect that must
   * NOT list it as a dependency. Assigned during render like `depsRef`.
   *
   * 🔴 WHY A REF RATHER THAN `buzz.refetch` DIRECTLY. `refetch` is a stable
   * `useCallback([], …)` in the SDK today, so closing over it would work — but
   * the one thing this change must not ship is a refetch that re-fires on an
   * identity change, and depending on an upstream identity staying stable is
   * exactly how that arrives later without anyone touching this file. The ref
   * makes the effect below depend on `hasGenerate` and nothing else, by
   * construction. See the refetch-budget cases in `src/buzzBalance.test.tsx`.
   */
  const buzzRef = useRef(buzz);
  buzzRef.current = buzz;

  // 🔴 THERE IS NO RENDER-TIME `canGenerate` GATE ANY MORE. Consent is decided at
  // PRESS time, inside `beginRun` (`hasGenerateScope(token.scopes)` → `requestConsent`).
  // Holding it here as well is what made this app ask for consent TWICE — once in a
  // persistent banner, once in the host's own "missing permissions" bar, which is now
  // canonical — while simultaneously DISABLING the run affordance, so the press-time
  // branch could never execute. Same shape for the signed-out case (`requestSignIn`).
  // The app's own convention for an unauthorized press is the vote control's: keep the
  // affordance PRESENT and readable, and route the press. See `beginRun`.

  // ---- modal state ----
  // 🔴 THERE IS NO `view` STATE ANY MORE. Grids used to be the DEFAULT of three
  // tabs (spec §11.5, acceptance criterion 9) because the app's primary object is
  // the grid and opening on a submission list put the thing the block is FOR two
  // clicks away. The IA refactor took that to its conclusion: the grid is FIRST on
  // a single page and the lists that feed it are below it, so nothing the block is
  // for is behind a click at all.
  const [modal, setModal] = useState<ModalState>({ kind: 'none' });
  const closeModal = useCallback(() => setModal({ kind: 'none' }), []);

  // ---- navigation ----
  //
  // 🔴 THERE IS A `view` STATE AGAIN, AND IT IS NOT THE ONE THE IA REFACTOR DELETED.
  // The old `view` routed between three TOP-LEVEL TABS (Combos / Prompts / Grid),
  // which put the thing the block is FOR behind a click; §11.5 and criterion 9 are
  // what killed it. This one selects between HOME — which always renders the grid and
  // its runnable matrix — and MY BENCHMARKS, the viewer's own work. The grid is still
  // not behind a click, and the lists that feed it are still on Home.
  //
  // 🔴 NEITHER VALUE IS PERSISTED. No KV write, no URL, no deep-linking (operator
  // decision, YAGNI): a reload opens on Home ▸ Grids.
  const [view, setView] = useState<MainView>({ kind: 'home' });
  const [board, setBoard] = useState<Board>('grids');

  /**
   * Which grid is OPEN, as a three-way REFERENCE rather than a key.
   *
   * 🔴 IT WAS `string | null` — a shared key, with `null` meaning the Top Grid — AND
   * THAT SHAPE CANNOT NAME A PRIVATE GRID. A viewer can now open one of their OWN
   * unpublished grids so they can generate into it before publishing it, and such a
   * record has only a per-viewer LOCAL id. A local id put into the old `string` slot
   * would have been looked up in `grids` (the published board rows), found nothing,
   * and SILENTLY fallen back to the Top Grid — a dead control with no error. A tagged
   * reference makes the two id spaces impossible to confuse, and `OpenGridRef`'s
   * `kind` makes a fourth state a compile error rather than an else-branch.
   *
   * 🔴 IT HOLDS A REFERENCE, NOT THE RECORD. Both arms are resolved against live
   * state on every render (`openTarget` below), because both can go away underneath
   * the panel: a published row can be withdrawn by its author in another tab, and a
   * private record is retired the moment it publishes. Holding the object would pin a
   * stale copy of whichever one moved.
   *
   * 🔴 IT LIVES HERE, ABOVE THE VIEW SWITCH, AND THAT IS A MONEY-PATH DECISION. It
   * was a `useState` inside `GridsView`. Navigating to My Benchmarks unmounts the
   * grid the way a reload does — but WITHOUT the rehydrate — so a `useState` down
   * there would reset to the Top Grid on the way back, and a cell whose generation is
   * still live would be stalled on a grid nobody is looking at: charged, running,
   * invisible. `runs` and the poll loop were already App-owned; this was the one piece
   * of the open-grid identity that was not, and the view-switch cases in
   * `money-path.test.tsx` are what hold it.
   *
   * ⚠️ THE HOIST CLOSES THE VIEW-SWITCH HALF AND NOTHING MORE — say it that way, not
   * as "it closes the charged-running-invisible bug". This value is not persisted (see
   * the `view`/`board` note above), so a RELOAD still opens on the Top Grid and a
   * stalled cell on a community grid is off-screen again. That half is not a
   * regression — it was equally unpersisted inside `GridsView` — but it is also not
   * fixed, and nothing in `money-path.test.tsx` covers the reload path. Persisting it
   * is a separate decision; the rehydrate scan already makes such a cell safe from a
   * second charge, so what is owed is discoverability, not money safety.
   */
  const [openGridRef, setOpenGridRef] = useState<OpenGridRef>({ kind: 'system' });
  /**
   * Open the grid named by a COMMUNITY-BOARD callback, whose contract is still
   * `string | null` (`null` = the Top Grid — see `entryOpenKey`).
   *
   * 🔴 THE ADAPTER IS HERE RATHER THAN IN `GridsView`, so that component keeps
   * knowing only about the two kinds it can LIST. Widening its callback to the
   * three-way reference would hand it a shape with an arm it can never produce.
   */
  const openPublishedKey = useCallback((key: string | null) => {
    setOpenGridRef(key === null ? { kind: 'system' } : { kind: 'published', key });
  }, []);
  /**
   * Open one of the viewer's own grids FROM MY BENCHMARKS, which also means going to
   * Home — the open panel only exists on `view.kind === 'home'`.
   *
   * 🔴 THE NAVIGATION IS PART OF THE ACTION, not a separate step the viewer takes.
   * Setting the reference without switching the view would leave the press looking
   * inert: the panel that renders it is unmounted, so nothing on screen would change.
   */
  const openOwnGrid = useCallback((ref: OpenGridRef) => {
    setOpenGridRef(ref);
    setView({ kind: 'home' });
  }, []);
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
  /**
   * The board read, as TWO FACTS THAT MOVE INDEPENDENTLY, in one state value.
   *
   * 🔴 THEY ARE NOT THE SAME FACT, AND CONFLATING THEM HAS NOW BROKEN TWICE — in
   * opposite directions. The history is kept because the second break was caused by
   * the fix for the first:
   *
   *   BREAK 1 — a bare `boardTruncated` boolean written only on the read's SUCCESS
   *   arm. A read that THREW, and the window before the first read resolves, were
   *   both indistinguishable from "read the whole board, found nothing", so the
   *   grid-publish boundary refused ordinary publishes with copy telling the viewer
   *   to DELETE good members.
   *
   *   BREAK 2 — the fix made `boardTruncated` a DERIVATION of a single
   *   `BoardRead`: `boardRead === 'truncated'`. That removed the disagreement
   *   between two state values and created a new one with `items`. A board over the
   *   page cap loads (`'truncated'`), then ANY routine reload whose `list()` throws
   *   takes the catch arm and writes `'error'` — while `items` is UNTOUCHED and still
   *   holds the truncated PREFIX, because the catch never calls `setItems`. So
   *   `boardTruncated` flipped to false over a prefix: the `board-truncated-notice`
   *   DISAPPEARED (presenting a prefix as the whole board, which is the silent
   *   ordering lie that notice exists to prevent) and `missingMembersNotice` flipped
   *   to the false "their authors removed them".
   *
   * 🔴 SO THE RULE IS ABOUT WHAT EACH FIELD IS A PROPERTY **OF**:
   *   - `outcome` is a property of the LATEST REQUEST. It answers "can I trust that
   *     a key absent from the snapshot is genuinely absent?" — only `'complete'` can.
   *   - `prefix` is a property of `items`. It answers "is the snapshot I am ranking
   *     over the whole board?" and it may therefore change ONLY when `items` does.
   *
   * ⚠️ AND WHAT ENFORCES THAT IS THE TWO WRITERS AND THEIR DISCIPLINE, NOT THE SHAPE
   * OF THE STATE. This paragraph used to read "they live in ONE state value so they
   * are written together … rather than as two `useState`s a future arm could update
   * by halves", which is false: a single object does not stop an arm updating by
   * halves, and a mutant doing exactly that — `{ outcome: 'error', prefix: true }` in
   * the catch arm — SURVIVED all 983 tests. What actually holds the pair is:
   *   - `prefix` has exactly TWO writers, both in the board-read effect: the resolve
   *     arm sets it from `all.truncated` alongside its `setItems`, and the reject arm
   *     carries the previous value through. Nothing else may write it.
   *   - the four other `setItems` call sites (`applyVote`, `optimisticInsert`,
   *     `optimisticUpdate`, `optimisticDelete`) are ROW-LEVEL edits that cannot change
   *     whether the snapshot is a prefix, which is why they correctly leave it alone.
   * Both directions are now pinned by `boardTruncation.test.tsx`: a thrown read must
   * not CLEAR the bit over a prefix, and must not SET it over a complete snapshot.
   *
   * ⚠️ NEITHER IS RESET WHEN A RE-READ STARTS, deliberately. `App` re-reads after
   * every publish and `items` keeps the previous snapshot throughout, so resetting
   * would refuse the next publish for the length of a round trip while a perfectly
   * good snapshot was in hand. Written on RESOLVE and on REJECT only.
   */
  const [boardSnapshot, setBoardSnapshot] = useState<{ outcome: BoardRead; prefix: boolean }>({
    outcome: 'unread',
    prefix: false,
  });
  // ⚠️ NO `boardRead` ALIAS. There was one, and it existed only to be passed to
  // `cascadeRefusal` beside a separately-derived `prefix` — the two-field call shape
  // whose wire-up a surviving mutant walked. The whole `boardSnapshot` goes over now,
  // so the alias had no reader left; `tsc`'s `noUnusedLocals` is what said so.
  /**
   * The snapshot in `items` is a PREFIX of the board, so every ranking over it — the
   * vote order, the top-N that becomes a grid's rows and columns, the "Included"
   * counts — covers part of the board while looking like the whole of it. Surfaced by
   * the `board-truncated-notice` and by `missingMembersNotice`.
   *
   * 🔴 IT TRACKS `items`, NOT THE LATEST REQUEST — see BREAK 2 above.
   */
  const boardTruncated = boardSnapshot.prefix;
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
  /**
   * Shared keys this viewer has REPORTED, this session.
   *
   * 🔴 IT IS HERE BECAUSE `ReportButton`'s LOCAL STATE STOPPED SURVIVING. The third IA
   * pass moved Report into the row's `⋮` menu, and `components/Menu.tsx` unmounts its
   * whole panel on any outside `mousedown` and on Escape — both unconditional. So the
   * armed confirm, the "Could not send — try again?" line and the settled "Reported for
   * review" note were all destroyed by the next click ANYWHERE, and re-opening the menu
   * offered Report again as if nothing had happened. `report()` is not documented
   * idempotent (unlike `vote`), so that is a duplicate report rather than a no-op.
   * `ReportButtonProps.reported`'s own JSDoc advises exactly this hoist.
   *
   * 🔴 THE SET IS THE OPPOSITE OF `votedKeys` IN ONE IMPORTANT WAY, and it is worth
   * saying because the two sit next to each other: a vote is DERIVED from the row
   * (`viewerVoted` arrives on every `list()`), so nothing is held in parallel. A report
   * has no such field, so the only possible source is the app's own record and holding
   * it is not a second copy of anything. VERIFIED on the installed pin rather than taken
   * from upstream's wording: `@civitai/sdk`'s `SharedItem` (re-measured at the
   * installed 0.10.0, after the `scope: 'site'` bump moved it off 0.8.0 — the field
   * set is unchanged and `viewerReported` appears nowhere in the package)
   * (`dist/shared-storage/index.d.ts:28`) declares exactly `key`, `authorUserId`,
   * `value`, `count`, `createdAt`, `updatedAt`, `viewerVoted` — no `viewerReported` and
   * nothing like it. (`ReportButtonProps.reported`'s JSDoc makes the same point about a
   * type it calls `SharedListItem`; that is `@civitai/blocks-react`'s name for the same
   * row, and this app reads the `@civitai/sdk` one.)
   *
   * ⚠️ IT IS SESSION STATE, NOT PERSISTED, AND THAT IS THE HONEST SCOPE OF THE FIX. A
   * reload still offers Report again on a row this viewer already reported; closing
   * that needs a per-viewer `appStorage` record and is a write-path change with its own
   * verification. What this DOES close is every in-session loss: a menu close, a
   * re-open, a board switch, a sidebar navigation and a `list()` refresh.
   */
  const [reportedRecord, setReportedRecord] = useState<{
    ownerId: number | null;
    keys: Set<string>;
  }>(() => ({ ownerId: null, keys: new Set<string>() }));
  /**
   * The set the views read — DERIVED, and empty unless the record belongs to the viewer
   * on screen RIGHT NOW.
   *
   * 🔴 IT WAS AN EFFECT AND THE EFFECT LEAKED ONE PAINTED FRAME. The first version
   * cleared the set from a `useEffect` cleanup keyed on `[viewer?.id]`. Passive effects
   * flush AFTER paint, so viewer B's first frame rendered with viewer A's set — "Reported
   * for review" against rows B has never reported, and no Report trigger — and only the
   * frame after that was correct. No test could see it, because every `findBy*` flushes
   * effects before asserting: the guard in `viewer-change.test.tsx` was green over a
   * wrong frame. Found by an adversarial audit of this round, not by a test.
   *
   * 🔴 SO OWNERSHIP IS PART OF THE VALUE, and the answer is computed in RENDER. There is
   * no window in which the wrong viewer's reports can reach the DOM, because there is no
   * moment at which the stored set is read without its owner. This is the repo's standing
   * preference for a deterministic fix over an effect, and it is the same shape as
   * `votedKeys` above: derived from what is true now rather than mirrored and corrected.
   *
   * `EMPTY_REPORTED` is module-level so the identity is STABLE across renders — a fresh
   * `new Set()` here would churn every `useMemo`/`memo` that takes this as a dependency.
   * See its own docblock for why it is deliberately NOT `Object.freeze`d.
   */
  const reportedKeys =
    reportedRecord.ownerId === (viewer?.id ?? null) ? reportedRecord.keys : EMPTY_REPORTED;
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
  /**
   * The run a viewer pressed for while the token was still missing
   * `ai:write:budgeted` — held so the grant can complete the action they already
   * asked for, instead of making them find the cell and press Run again.
   *
   * 🔴 A REF, NOT STATE, AND AT MOST ONE SLOT. The consume-then-act order in the
   * auto-resume effect below is what makes the replay fire once; a state value
   * would not be readable-and-cleared in the same synchronous step, so a second
   * effect pass (a token refresh, a StrictMode double-invoke, a re-render between
   * the read and the commit) could see the stale value and replay a second time.
   * One slot, because a viewer has one in-flight intent: a later press overwrites
   * it (see `beginRun`).
   */
  const pendingConsentRunRef = useRef<{ row: BenchConfig; prompt: PromptRow } | null>(null);
  /**
   * True once this session has ASKED for consent. Set beside the held action in
   * `beginRun`; read by the balance-refetch effect below.
   *
   * 🔴 IT IS WHAT SEPARATES A GRANT FROM MERE TOKEN HYDRATION. `hasGenerate`
   * goes false→true on an ordinary page load too — the token arrives
   * asynchronously after BLOCK_INIT — so an effect keyed on that transition
   * alone would bill every already-consented viewer an extra balance read for
   * nothing. This flag narrows it to the transition we actually caused.
   */
  const consentAskedRef = useRef(false);
  /**
   * 🔴 THE AT-MOST-ONCE SLOT for the balance re-read, mirroring
   * `pendingConsentRunRef`'s consume-before-acting discipline. Set in one
   * synchronous step BEFORE the refetch, so a second effect pass — a re-render,
   * a StrictMode double-invoke, a scope that flaps off and back on — finds
   * nothing left to do. The token re-mints roughly every two minutes; without
   * this, anything the token can move becomes a request every two minutes for
   * the life of the page.
   */
  const balanceRefetchedOnGrantRef = useRef(false);
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
  // KV_MAX_PAGES serial `list` calls plus a `get` per key.
  //
  // 🔴 AND THE SDK PORT MADE THAT WINDOW WIDER — this comment used to say "a
  // macrotask over the real host's cross-origin `postMessage` bridge", and that
  // transport is gone from this path: these are cross-origin HTTPS requests to
  // civitai.com now, and `withBlockScope` sets its CORS headers with NO
  // `Access-Control-Max-Age`, so each POST can carry its own preflight.
  //
  // ⚠ THE SIZE OF THAT WIDENING WAS OVERSTATED ONCE, AND THE FIGURE IS RETRACTED. An
  // earlier draft of this paragraph said "up to 2N round trips where there were N
  // in-process messages". The bridge's messages were NOT in-process work: the host
  // answered `APP_STORAGE_*` by calling the very same server function the REST route
  // calls (`api/v1/blocks/app-storage/get.ts`: "the SAME function
  // `trpc.apps.storage.get` calls"), so each one was ALREADY a network round trip,
  // made from the host page. The real delta is +1 preflight leg and −2 postMessage
  // hops per call, not 0 → 2.
  //
  // ⚠ One qualification, and it widens rather than narrows the conclusion: the host
  // served those reads through React Query with a 1s `staleTime`
  // (`BLOCK_STORAGE_READ_STALE_TIME_MS`, `AppBlocks/blockStorageCache.ts`), so an
  // IDENTICAL repeat read inside a second was a cache hit and not network at all.
  // Within one rehydrate scan every `list`/`get` has a distinct query key, so those
  // really were N round trips — but a block that re-read the same key in a loop has
  // lost a cache it used to get for free. The conclusion is unchanged — the backstop below is
  // MORE load-bearing after the port — but do not re-derive the discarded
  // multiplier, and the magnitude is still unmeasured: nothing in this repo has run
  // against a live host.
  //
  // It passed every test because the jsdom fake resolves in microtasks; `latencyMs`
  // in `fakeAppStorage` is what makes it visible, and there is a permanent LATENCY
  // ARM case pinning it.
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
        // Both fields, written together with the `items` they describe.
        setBoardSnapshot({
          outcome: all.truncated ? 'truncated' : 'complete',
          prefix: all.truncated,
        });
      } catch (e) {
        if (!cancelled) {
          setError(errMsg(e));
          // 🔴 THE OUTCOME MOVES AND `prefix` IS CARRIED THROUGH UNCHANGED. Two
          // separate bugs meet on this line. Writing nothing here made a THROWN read
          // look complete (BREAK 1); writing a whole new value made it look UNtruncated
          // (BREAK 2) — this arm does not call `setItems`, so the snapshot it describes
          // is the one the previous read left, prefix and all.
          setBoardSnapshot((prev) => ({ outcome: 'error', prefix: prev.prefix }));
        }
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
  const [quota, setQuota] = useState<StorageQuota | null>(null);
  const [draftsVersion, setDraftsVersion] = useState(0);
  const refreshDrafts = useCallback(() => setDraftsVersion((v) => v + 1), []);

  /**
   * 🔴 DID THE TWO PRIVATE-MEMBER SCANS SEE EVERYTHING? Read by the grid-publish
   * boundary (`cascadeRefusal`) and by nothing else.
   *
   * 🔴 WHAT IT ACTUALLY DOES: it decides the refusal's **wording**, not the refusal.
   * An earlier draft of this paragraph claimed it closed the decision; the correction
   * is stated first, before the history, because that is the part a reader needs.
   *
   * ⚠️ A SELF-REFERENTIAL DRAFT COUNT USED TO SIT HERE AND IS DELETED RATHER THAN
   * CORRECTED A FOURTH TIME. It regenerated a defect in three consecutive rounds (two
   * wrong numbers and one wrong claim ABOUT the number), and nothing a reader does
   * depends on it — the construct was the defect, not the arithmetic. Say WHAT a
   * paragraph got wrong, which is done above; do not count the paragraphs. `cascadeRefusal` returns `null` on
   * `unresolved.length === 0` BEFORE it reads this flag, and that function's own
   * docblock says so in terms — two comments in one PR asserted opposite things.
   * Per-key positive accounting is the guard; this flag only chooses between "this
   * member is gone, remove it" and "this app could not read your private items,
   * reload" — which matters a great deal, because following the wrong one destroys
   * good members.
   *
   * What it DOES still buy, measured: `forEachStoredKey` RETURNS `{truncated, pages}`
   * precisely so a caller can act on an incomplete view — `lib/kv.ts` carries a 🔴
   * saying truncation "is not uniformly harmless… for one of them it is a MONEY
   * decision" — and all three of these scans discarded that report. The honest-cause
   * split is what reading it buys. (Two cases pin it: a scan that THROWS, and one
   * that TRUNCATES at the 20-page cap.)
   *
   * ⚠️ AND THE RELATED HAZARD IS CLOSED BY SOMETHING ELSE ENTIRELY, so do not read
   * this flag as closing it: the `draft:v1:` listing throwing, the `catch` below
   * swallowing it on purpose (a KV failure must not take the public board down), and
   * the grid's own prefix reading fine — that fail-open path is closed by the member
   * key landing in `unresolved` and the boundary refusing on it. The flag's absence
   * would change only the sentence the viewer reads.
   *
   * 🔴 FALSE IS THE SAFE DEFAULT. It flips true only when BOTH scans completed without
   * throwing and without truncating, and it is NOT written on a cancelled run: a
   * `shouldStop` exit reports `truncated: false` over a PARTIAL read, so trusting it
   * there would assert completeness about a scan that stopped half-way — the
   * superseding run is what sets it instead.
   *
   * ⚠️ A REF, NOT STATE, DELIBERATELY: every reader is a callback that runs at press
   * time, and a ref cannot hand one a value from an earlier render. Nothing renders
   * off it, so there is nothing for state to re-render.
   */
  const privateScanCompleteRef = useRef(false);

  useEffect(() => {
    if (!ready) return;
    // ⚠️ RE-ARMED BEFORE EITHER SCAN RUNS — AND IT CLOSES NOTHING ABOUT THE PUBLISH
    // DECISION. An earlier draft of this comment said "a publish landing in that
    // window is refused, not permitted", which is FALSE: `cascadeRefusal` returns
    // `null` on an empty `unresolved` before this flag is read, so a grid whose keys
    // are all accountable publishes mid-scan, correctly. What the re-arm buys is that
    // a publish in that window which IS refused says "could not read your private
    // items" rather than inheriting the last run's "the member is gone, remove it".
    // It is a wording guarantee. Nothing more, and it is written here as nothing more.
    privateScanCompleteRef.current = false;
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
      /** Per-scan completeness, folded into the ref at the end. */
      let matchupsComplete = false;
      let promptsComplete = false;
      try {
        const found: DraftRecord[] = [];
        const scan = await forEachStoredKey(
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
        // 🔴 THE REPORT, FINALLY READ. `!truncated` alone is not completeness: a
        // cancelled run also reports `truncated: false` over a partial read, which
        // is why `cancelled` is part of the test rather than only guarding the
        // `setDrafts` above it.
        matchupsComplete = !cancelled && !scan.truncated;
      } catch {
        /* best-effort — a KV failure must not take the public board down with it.
           `matchupsComplete` stays FALSE, which is the whole point: the publish
           boundary now refuses an unaccountable member instead of silently
           publishing its local id. */
      }
      try {
        const foundPrompts: UnpublishedPromptRecord[] = [];
        const scan = await forEachStoredKey(
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
        promptsComplete = !cancelled && !scan.truncated;
      } catch {
        /* best-effort — same reasoning as the matchup scan above, and the same
           consequence: `promptsComplete` stays FALSE and the boundary refuses. */
      }
      // 🔴 BOTH, NOT EITHER. A grid can name private matchups AND private prompts,
      // so a complete view means both prefixes were read in full. Written once,
      // after both, and never on a cancelled run.
      if (!cancelled) privateScanCompleteRef.current = matchupsComplete && promptsComplete;
      try {
        const foundGrids: UnpublishedGridRecord[] = [];
        // ⚠️ THE GRID SCAN'S OWN `ScanResult` IS DELIBERATELY NOT FOLDED IN, and this
        // says so rather than leaving the asymmetry to look like an oversight. An
        // incomplete GRID scan hides grids, which is fail-SAFE: a grid the viewer
        // cannot see is a grid they cannot publish. The two scans above are the ones
        // whose incompleteness makes a VISIBLE grid publishable with an invisible
        // member, which is the hazard.
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
  // 🔴 THE KEY SETS ARE GONE, AND SO ARE THE PROPS THAT CARRIED THEM. There used to be
  // `includedComboKeys` / `includedPromptKeys` — two `useMemo`-built `Set`s handed to
  // `MatchupsView` / `PromptsView` as `includedKeys`. Both views read exactly ONE thing
  // off them, `.size`, because the third IA pass deleted the per-row "Included" badges
  // that needed `has(key)`. Two derived Sets plus two props to carry a number
  // `includedCombos.length` already holds is a second representation with nothing
  // keeping it in step, so the views take the COUNT. Reintroduce a Set only if a
  // per-row membership test comes back — and then derive it here, once, for both.

  // 🔴 THE TWO `GridPicker` ITEM LISTS USED TO BE HERE AND HAVE MOVED DOWN, below
  // `unpublishedMatchups` / `unpublishedPrompts` — they now include the viewer's own
  // PRIVATE records as pickable rows, and those lists are derived from state declared
  // further on (`publishedThisSession`). Search for `matchupPickerItems`.

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

  /**
   * Start a NEW unpublished grid.
   *
   * 🔴 THERE IS EXACTLY **ONE** CALLER, AND THE SIGN-IN BRANCH IS CURRENTLY
   * UNREACHABLE. Say it first, because the argument below used to be presented as
   * live and is not.
   *
   * ⚠️ WHAT THIS DOCBLOCK CLAIMED AND WHY IT IS RETRACTED. It said "there are still
   * two callers: the menu item and `GridsView`'s private panel", and rested a
   * twenty-line 🔴 argument on that premise. Both halves are now false: this stack
   * deleted `ContributeMenu` (so there is no menu item), and `GridsView` no longer
   * renders the private panel at all — it moved to `MyGridsView`. The single caller
   * is `MyGridsView.onNewUnpublished`, i.e. `MyList`'s `new-unpublished`.
   * And that caller cannot press it anonymously: `MyGridsView` returns
   * `MyTabSignedOut` for `viewerId == null` and renders no private panel, which
   * `myBenchmarks.test.tsx` asserts as a positive fact ("an ANONYMOUS viewer gets the
   * sign-in panel and no private panel at all"). So `if (!viewer)` below is dead on
   * this tree and NOTHING IN THE SUITE COVERS IT.
   *
   * 🔵 THE BRANCH STAYS ANYWAY, and this is the explicit decision rather than an
   * omission — DEFENCE IN DEPTH, labelled as such and not counted as coverage:
   *
   *   - the history it comes from is real. The page once reached this action from
   *     `Contribute ▸ Build a grid` (no auth condition at all) AND from the grids
   *     section's own `grid-new` button (gated on `signedIn && onNewUnpublished`), and
   *     the two disagreed: an anonymous viewer could open the grid form through the
   *     menu, fill it in, and have the save rejected at `appStorage.set`, while the
   *     sibling route ten pixels away simply hid itself. Both routes are gone; the way
   *     they came apart is not a hypothetical.
   *   - deleting it makes the next caller's author decide the auth question again, at
   *     their call site, which is precisely the N-copies shape that produced the
   *     disagreement. One predicate in one place costs three lines.
   *
   * 🔴 SO: do not re-add a `signedIn` test at the call site, and do not read the
   * branch as tested. An unauthorised press routes to sign-in, matching the vote
   * control's `onRequireAuth` — the app's existing answer for "this needs an account".
   */
  const openNewGrid = useCallback(() => {
    if (!viewer) {
      depsRef.current.requestSignIn();
      return;
    }
    setModal({ kind: 'unpub-grid', localId: newGridLocalId(), existing: false });
  }, [viewer]);

  // ---- submit + edit wiring ----
  // Record an optimistic INSERT so a just-appended row shows immediately (item 1)
  // and survives a lagged list() (see reconcileOptimistic).
  const optimisticInsert = useCallback(
    (key: string, value: SharedStorageValue) => {
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
    (key: string, value: SharedStorageValue) => {
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
      // 🔴 THE GUARD IS THE ORDER. THE `ok` BRANCH IS AN INVARIANT GUARD, AND THE
      // TRANSPORT IT USED TO CITE IS GONE. Be precise about which is which:
      //
      //   - THE ORDER is the live guard. `withdraw` REJECTS on failure — the SDK
      //     states it as a contract ("every failure rejects; nothing resolves to
      //     mean 'not written'"), so a throw here is the real path and it skips
      //     every line below.
      //   - THE `ok` BRANCH is an INVARIANT GUARD: it pins something no transport
      //     can currently violate. `@civitai/sdk`'s `SharedStorageClient.withdraw`
      //     is declared `{ ok: true; deleted: boolean }` — the LITERAL `true` — and
      //     hardcodes it in the implementation. The only thing that makes `!res.ok`
      //     type-reachable is `SharedStore`'s own widening to `boolean`, which is
      //     THIS APP's (see the note on `withdraw` in `lib/sdk-runtime.ts` for why
      //     the widening was kept rather than narrowed, and the follow-up it is
      //     filed as).
      //
      // ⚠️ THREE CLAIMS THAT USED TO BE HERE ARE RETRACTED, not reworded, because
      // this port falsified them: this branch no longer routes through
      // `@civitai/blocks-react` AT ALL, so "the pinned 0.43.0", "the 0.43.0
      // RUNTIME", and `useSharedStorage.js:115-121` were describing a code path
      // that is not on this line any more — and the pin was `^0.51.0` even before
      // that. The claim that `withdraw` is "the only SDK write typed `ok: boolean`"
      // is also false against the installed SDK, where it is `ok: true` like the
      // others. Do not derive a fresh justification from the new transport either:
      // what is true is stated above and nothing more.
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
   * 🔴 REJECTIONS PROPAGATE — the `await` is not swallowed, so `ReportButton` renders
   * its "Could not send — try again?" line instead of settling: a failed report that
   * closed quietly would read as a filed one. It also means `key` is recorded ONLY on
   * the success path, below.
   *
   * ⚠️ A PREVIOUS VERSION OF THIS DOCBLOCK SAID THE CONTROL "STAYS ARMED FOR A RETRY",
   * AND THE ⋮ MENU PARTIALLY FALSIFIED IT. The rejection does still reach the control
   * and does still render the failure line — that half is unchanged and is pinned by
   * `report.test.tsx`. What is NOT true any more is that the armed state PERSISTS:
   * `components/Menu.tsx` unmounts its panel on any outside `mousedown` and on Escape,
   * so the failure line survives only until the viewer's next click. Nothing here can
   * fix that — `ReportButton`'s in-flight and failed states are its own local state and
   * there is no prop for them, unlike `reported` — so the honest statement is that a
   * REFUSED report is still discoverable while the menu is open and is lost on close,
   * while a SUCCEEDED one is durable for the session through `reportedKeys`. Filing the
   * failure half upstream would need a `failed`-style prop on `ReportButton`.
   */
  const reportRow = useCallback(
    async (key: string) => {
      await depsRef.current.shared.report(key);
      depsRef.current.track('report');
      // 🔴 AFTER the await, so a REFUSED report is not recorded as filed. See
      // `reportedKeys` for why this record exists at all and what it does not survive.
      //
      // 🔴 AND IT STAMPS THE OWNER, which is what makes the read above derivable. A set
      // stored without its owner has to be CLEARED by something when the viewer changes,
      // and the only thing that can do that is an effect — which runs after paint. See
      // `reportedKeys`.
      const ownerId = viewer?.id ?? null;
      setReportedRecord((prev) => {
        const mine = prev.ownerId === ownerId;
        if (mine && prev.keys.has(key)) return prev;
        return { ownerId, keys: new Set(mine ? prev.keys : []).add(key) };
      });
    },
    [viewer?.id],
  );

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
   *     without it (every "this is yours" surface filters on `isOwnRow`, i.e. on
   *     `authorUserId`, never on pointer presence — the "Your <noun>s" list for
   *     all three nouns, the `grid-own-badge` on the flat grids list). This
   *     is what makes the retirement survive a RELOAD instead of only a
   *     re-render: `publishedLocalIds` is React state, so without the delete the
   *     next load re-reads the store — the very store that could not be written
   *     — and offers Publish again.
   *     The delete can itself be refused, so its outcome is OBSERVED and handed
   *     to the copy rather than assumed.
   *  5. The failure is RE-THROWN as viewer copy, never swallowed. `MyList`
   *     catches it and renders it; a quiet `finally` here is what made this
   *     invisible in the first place. The copy BRANCHES on step 4's outcome —
   *     see `publishPointerFailedNotice`, which is true either way.
   *
   * 🔴 IT RETURNS THE HOST-MINTED SHARED KEY, and that is new. A grid can now name a
   * PRIVATE matchup or prompt by its per-viewer LOCAL id, so publishing the grid has
   * to publish those records first and then REWRITE their local ids to the keys the
   * host just minted — and the key is only observable here. Returning it is what let
   * the cascade reuse this one path instead of opening a second one (see
   * `runGridCascade` and `lib/gridCascade.ts`).
   *
   * ⚠️ `undefined` MEANS "NO APPEND HAPPENED ON THIS CALL", i.e. one of the two
   * guards above returned early. It does NOT mean failure: a failure THROWS. The
   * cascade treats `undefined` as an unresolvable dependency and refuses to publish
   * the grid, because a grid whose member key it could not rewrite is exactly the
   * permanent public dangling reference this whole path exists to prevent.
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
      payload: SharedStorageValue;
      /** Analytics event name and props for this object kind. */
      event: string;
      props: Record<string, unknown>;
    }): Promise<string | undefined> => {
      if (submittingRef.current.has(spec.localId)) return undefined;
      // ⚠ BELT-AND-BRACES, not a live gate: every caller resolves `spec.localId`
      // out of a list this session's retirement has already filtered, so this
      // line is unreachable in production and deleting it leaves the suite green
      // (re-measured 2026-09-08 at this branch's HEAD: 526/526, 42 files, both
      // vitest projects). It is kept because it is
      // the cheap half of the pair — `submittingRef` covers only the in-flight
      // window — and a future caller that hands a raw stored id straight in
      // would otherwise reach `append`.
      // Do not read it as coverage: the retirement at step 2 is what holds.
      if (publishedThisSession.has(spec.localId)) return undefined;
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
          // 🔴 A TYPED THROW, AND THE MESSAGE IS UNCHANGED. `PointerWriteFailure` is
          // an `Error` subclass carrying the same sentence, so `MyList` and
          // `publishPointerFailure.test.tsx` see exactly what they saw before. What
          // it adds is the two facts a CASCADE has to reason about rather than
          // render: the row IS public (so it must be reported as published) and the
          // host's raw refusal string (so a composed sentence need not parse one out
          // of a paragraph).
          throw new PointerWriteFailure(
            publishPointerFailedNotice(spec.noun, pointerError, privateCopyRemoved),
            key,
            pointerError,
          );
        }
        return key;
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
    async (draft: DraftUnsubmitted): Promise<string | undefined> => {
      const input = draftToInput(draft);
      return publishRecord({
        localId: draft.localId,
        noun: 'matchup',
        storageKey: draftKey(draft.localId),
        payload: buildCombinationPayload(input) as SharedStorageValue,
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
    async (rec: UnpublishedPrompt): Promise<string | undefined> => {
      const input = unpubPromptToInput(rec);
      return publishRecord({
        localId: rec.localId,
        noun: 'prompt',
        storageKey: unpubPromptKey(rec.localId),
        payload: buildPromptPayload(input) as SharedStorageValue,
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
   *
   * 🔴 `resolved` IS THE LOCAL-ID → SHARED-KEY MAP AND IT IS NOT OPTIONAL SUGAR. A
   * grid may name the viewer's own PRIVATE matchups and prompts, which carry only a
   * per-viewer local id; `remapGridKeys` rewrites those to the shared keys their
   * publish minted, BEFORE `buildGridPayload` runs. Skipping it would append a
   * permanent public row naming ids nobody else can resolve. An empty map is the
   * normal case (a grid of board members only) and remaps nothing.
   */
  const publishUnpubGrid = useCallback(
    async (
      rec: UnpublishedGrid,
      resolved: ReadonlyMap<string, string>,
    ): Promise<string | undefined> => {
      const input = remapGridKeys(unpubGridToInput(rec), resolved);
      return publishRecord({
        localId: rec.localId,
        noun: 'grid',
        storageKey: unpubGridKey(rec.localId),
        payload: buildGridPayload(input) as SharedStorageValue,
        event: 'submit_grid',
        props: {
          matchupCount: input.matchupKeys.length,
          promptCount: input.promptKeys.length,
          // How many member keys were REWRITTEN from a local id — published by this
          // cascade or by an earlier one (a stored pointer resolves without a new
          // append). 0 is the ordinary case: a grid of board members only.
          remappedCount: resolved.size,
        },
      });
    },
    [publishRecord],
  );

  const submitCombination = useCallback(
    async (input: CombinationInput) => {
      const payload = buildCombinationPayload(input) as SharedStorageValue;
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
      const payload = buildPromptPayload(input) as SharedStorageValue;
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
      const payload = buildCombinationPayload(input) as SharedStorageValue;
      await depsRef.current.shared.update(key, payload);
      optimisticUpdate(key, payload);
      closeModal();
      reload();
    },
    [reload, closeModal, optimisticUpdate],
  );

  const updatePrompt = useCallback(
    async (key: string, input: PromptInput) => {
      const payload = buildPromptPayload(input) as SharedStorageValue;
      await depsRef.current.shared.update(key, payload);
      optimisticUpdate(key, payload);
      closeModal();
      reload();
    },
    [reload, closeModal, optimisticUpdate],
  );

  /**
   * Edit a PUBLISHED grid in place — name, description AND members.
   *
   * 🔴 IT DID NOT EXIST, AND ITS ABSENCE WAS THE FEATURE GAP. `updateCombination` and
   * `updatePrompt` have shipped since their objects did; a published grid had no edit
   * route at all, so `lib/unpublished.ts`'s half-published notice told grid authors, in
   * words, that "a published grid cannot be edited". That sentence moved with this
   * function.
   *
   * 🔴 WHY EDITING MEMBERS IS SAFE HERE AND IS NOT A GENERAL LICENCE. A grid stores
   * `matchupKeys[]` / `promptKeys[]` — REFERENCES. A result cell is keyed
   * `comboKey::configId::promptKey` (`lib/benchmark.ts`) and is shared by EVERY grid
   * containing those members, so dropping a member stops DISPLAYING its cells and
   * orphans nothing; re-adding it brings them back. Editing a MATCHUP is the opposite:
   * it can drop a `configId`, and the result rows keyed on that id are then
   * unreachable and unrecoverable.
   *
   * 🔴 AUTHOR SCOPE IS THE HOST'S, AND THE UI REACHES THE SAME **NON-OWNER** OUTCOME BY
   * A DIFFERENT ROUTE THAN THE OTHER TWO. ⚠️ THE OWN-ROW OUTCOME DIFFERS, AND THAT IS
   * THE THIRD DRAFT OF THIS SENTENCE — if you are writing a fourth, say what is
   * MEASURED and qualify the noun rather than reaching for a cleaner phrasing. Draft 1
   * said the narrowing was "the same one the other two use" (false: different
   * mechanism). Draft 2 said "the same outcome" unqualified (false: only the non-owner
   * half). What is true: nobody can edit a row they do not own, by either route — but a
   * matchup or prompt AUTHOR gets Edit on the community board and a grid author does
   * NOT, and must go to My Benchmarks ▸ Grids. Both directions are pinned
   * (`myBenchmarks.test.tsx:892` no grid Edit on the community board;
   * `e2e.test.tsx:145` a matchup author does get it there). Original note follows:
   * would mislead anyone copying it: those two pass `onEdit` on the community card and
   * gate it in the body, while grids pass none at all. See `onEditPublished`. `shared.update` is author-scoped server-side for every row kind alike;
   * the control is only ever rendered from `MyList`, which is handed `ownGrids` —
   * `isOwnRow`-narrowed. The community grids board passes no edit callback at all.
   *
   * `buildGridPayload` runs the same normalisation a publish does (order preserved,
   * de-duplicated, capped), and `GridForm` runs `validateGrid` before calling this on
   * the edit path exactly as on the create path — so an edit cannot store a grid shape
   * a create could not.
   */
  const updateGrid = useCallback(
    async (key: string, input: GridInput) => {
      const payload = buildGridPayload(input) as SharedStorageValue;
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
      // 🔴 CARRY THE OUTPUTS INTO THE PUBLISHING WINDOW. `publish()` opens the
      // HOST's "Publish to the shared grid?" confirm and does not resolve until
      // the viewer answers it — and that dialog is text-only (host chrome:
      // `civitai/civitai` `PageBlockHost.tsx`, the `PUBLISH_GENERATION_OUTPUTS`
      // handler). Until this line the block rendered a bare "Publishing…"
      // spinner behind it, so the viewer was asked to publish images they had
      // never seen. The snapshot already carries their urls, so showing them here
      // is the part of that question THIS repo can answer; putting an image
      // inside the dialog itself is a host change, and deliberately not one a
      // block can make (the host's sibling CREATE_POST_FROM_APP gate spells out
      // why it will not render block-supplied thumbnails). See the field docs on
      // `CellRun.previewUrls` and the header of `src/publishPreview.test.tsx`.
      setRun(ck, { status: 'publishing', previewUrls: terminal.imageUrls });
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
        }) as SharedStorageValue;
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
        // 🔴 HOLD THE ACTION, then ask. `REQUEST_CONSENT` is FIRE-AND-FORGET and
        // carries no `requestId` (SDK `useRequestConsent`, host
        // `PageBlockHost.tsx`), so the host structurally CANNOT reply "the viewer
        // granted, here is the submit you were in the middle of". The grant
        // arrives only as a fresh token on a `TOKEN_REFRESH` push. Retrying is
        // therefore the BLOCK's job, and it needs the `(row, prompt)` this call
        // was given — which this function used to drop on the floor, so a viewer
        // who consented had to find the cell and press Run a second time.
        //
        // The replay is the auto-resume effect below. It is NOT a spend: it
        // re-enters `beginRun`, which only estimates — Confirm is still required
        // before any Buzz moves.
        //
        // 🔴 ONE SLOT, OVERWRITTEN — that is the whole supersede rule, and it
        // needs no second line to enforce it. A viewer who presses cell A, thinks
        // again and presses cell B before answering the dialog has ONE intent, so
        // the grant must complete B and not both. Every path that can reach this
        // line is a press, and a press is exactly what supersedes.
        //
        // An explicit `= null` at the top of this function was written first and
        // then REMOVED as unreachable: the only slot it could have cleared is one
        // set while the scope was absent, and by the time any press can observe
        // the scope PRESENT the effect below has already consumed it. It killed
        // no mutant. Case 4 of `src/consentResume.test.tsx` pins supersede
        // against THIS line instead.
        pendingConsentRunRef.current = { row, prompt };
        // Record that WE asked, so the grant that follows can be told apart from
        // the token merely hydrating — see `consentAskedRef`. Deliberately NOT
        // cleared on supersede: a second press is still a session that asked.
        consentAskedRef.current = true;
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
  // Read by the consent auto-resume effect below so that effect does NOT have to
  // list `beginRun` as a dependency. `beginRun`'s identity changes on every board
  // re-fetch (it closes over `results`), and an effect that re-ran on those would
  // be re-evaluating the replay decision at moments that have nothing to do with
  // consent. Assigned during render, like `depsRef`/`runsRef`, so the effect that
  // runs after the scope-granting render calls the closure from THAT render.
  const beginRunRef = useRef(beginRun);
  beginRunRef.current = beginRun;

  /**
   * 🔴 THE CONSENT AUTO-RESUME. `beginRun` parks the `(row, prompt)` it was
   * pressed with and asks for consent; this RESUMES that exact action the moment
   * the granted scope shows up on the token, so a viewer who says yes does not
   * have to find the cell and press Run again.
   *
   * 🔴 IT DOES NOT COMPLETE THE RUN, AND IS NOT MEANT TO. The replay re-enters
   * `beginRun`, so the cell advances itself to `estimating` → `confirming` and
   * STOPS. The viewer still presses Confirm once; that press is the only thing
   * that spends. Two presses plus re-locating the cell become one press on a
   * cell that has already moved. Keeping the gate is deliberate: the consent
   * grant authorises spending up to a cap, not this particular spend.
   *
   * WHY THE DEPENDENCY IS A BOOLEAN, and not `token.scopes` — ⚠️ RENDER HYGIENE,
   * NOT A PINNED CORRECTNESS PROPERTY, and this docblock used to overclaim it.
   * The token auto-refreshes (the SDK re-mints ~2 min before expiry) and each
   * refresh hands down a NEW `scopes` array, so an effect keyed on that array
   * re-runs on every refresh for the life of the page; `hasGenerate` changes only
   * when the ANSWER changes. That is worth having — but it buys no behaviour,
   * because the consume-before-replay line below already makes every extra pass a
   * no-op. MEASURED on this tree: mutating this dep to `[token.scopes]` leaves
   * the ENTIRE suite green (546/546), so nothing pins it and nothing can — the
   * two spellings are behaviourally indistinguishable by construction. Treat it
   * as a cheap preference, and do not cite it as a guard.
   *
   * WHY THE SLOT IS CONSUMED BEFORE THE REPLAY, and not after it resolves:
   * `pendingConsentRunRef.current` is read and nulled in one synchronous step, so
   * a second pass over this effect — a re-render, a StrictMode double-invoke, a
   * token whose scope flaps off and back on — finds nothing to replay. That one
   * line IS the at-most-once property; deleting it makes case 2 of
   * `src/consentResume.test.tsx` report two runs where one was pressed for.
   *
   * WHAT IT DOES NOT DO: spend. The replay re-enters `beginRun`, which re-checks
   * `cellHasResult` (a cell that filled in while the dialog was open is not
   * re-run) and stops at `estimating` → `confirming`. Buzz moves only when the
   * viewer presses Confirm, exactly as on the manual path.
   *
   * 🔴 WHY THERE IS NO TTL ON THE HELD ACTION. An earlier revision aged the slot
   * out after five minutes. It was DELETED, deliberately: it was standing in for
   * a consent-DISMISSED signal that does not exist, and a timer is not that
   * signal — it cannot tell "dismissed the dialog" from "read it slowly". The
   * bound it was reaching for belongs upstream, as a `CONSENT_DECLINED`-shaped
   * host push mirroring the existing `CONSENT_UNAVAILABLE`; per this repo's
   * `CLAUDE.md`, a missing host hook is a PR there, not a workaround here. The
   * cost of having no bound is small and does not involve money: the worst case
   * is a viewer who grants `ai:write:budgeted` elsewhere on civitai much later
   * and finds one cell sitting at its Confirm gate, which they can dismiss. The
   * bounds that DO matter — one slot, consume-before-replay, drop on viewer swap
   * or unmount, and a replay that cannot spend — are all still pinned by
   * `src/consentResume.test.tsx`.
   */
  const hasGenerate = hasGenerateScope(token.scopes);
  useEffect(() => {
    if (!hasGenerate) return;
    const pending = pendingConsentRunRef.current;
    if (!pending) return;
    pendingConsentRunRef.current = null; // consume FIRST — see the docblock
    depsRef.current.track('consent_resume');
    void beginRunRef.current(pending.row, pending.prompt);
  }, [hasGenerate]);

  /**
   * 🔴 RE-READ THE BALANCE WHEN THE GRANT LANDS — the other half of the
   * operator's report, and a SEPARATE effect from the replay above on purpose.
   *
   * `useBuzzBalance()` fetches exactly ONCE, from a mount effect over a
   * `useCallback([], …)` whose identity never changes, and does not re-fetch on
   * `TOKEN_REFRESH`. So the number this app gated Confirm against was whatever
   * came back in the first few hundred milliseconds of the page, forever. A
   * viewer who granted consent mid-session — very often arriving from a top-up
   * flow, and in any case now holding a different token — was still being
   * measured against that first read. When the first read had failed there was
   * no number at all, and until the `confirmGate` fix that rendered as
   * "Insufficient Buzz balance": the app asserting a shortfall it had never
   * observed. A full page reload "fixed" it because a reload is the only other
   * thing that re-runs a mount effect.
   *
   * WHY NOT FOLDED INTO THE REPLAY EFFECT ABOVE: that one returns early when no
   * action is held, and a grant is a balance-changing event whether or not the
   * held action survived (it can be superseded, or dropped on a viewer swap).
   * These are two different questions about the same signal.
   *
   * WHY IT CANNOT LOOP, which is the whole risk of adding a refetch at all:
   * `consentAskedRef` means an ordinary token hydration does not qualify, and
   * the consume-before-acting slot means the ~2-minute re-mints that follow find
   * nothing to do. Pinned as an EXACT count, not an at-least, by cases 1–3 of
   * `src/buzzBalance.test.tsx` — an at-least would be satisfied by the loop.
   */
  useEffect(() => {
    if (!hasGenerate) return;
    if (!consentAskedRef.current) return;
    if (balanceRefetchedOnGrantRef.current) return;
    balanceRefetchedOnGrantRef.current = true; // consume FIRST, like the replay
    buzzRef.current.refetch();
  }, [hasGenerate]);

  // A held action belongs to the viewer who pressed for it. The cleanup runs on a
  // viewer swap (the host can change viewer without remounting — see
  // `src/viewer-change.test.tsx`) AND on unmount, so neither a different account's
  // grant nor a remount can complete a press that is no longer anyone's.
  //
  // ⚠️ `reportedKeys` WAS CLEARED HERE FOR ONE ROUND AND IS NOT ANY MORE, deliberately.
  // The hazard is real and identical — a report belongs to the viewer who filed it, and
  // the swap does NOT remount, so viewer B must not arrive looking at "Reported for
  // review" against rows they have never reported, with no Report trigger of their own.
  // But AN EFFECT IS THE WRONG INSTRUMENT FOR IT: a passive effect's cleanup flushes
  // after PAINT, so B's first committed frame still carried A's set and only the frame
  // after that was right. `reportedKeys` is DERIVED in render now, from a record that
  // stores its owner, so no such frame exists. Do not re-add a clear here — it would be a
  // second, weaker spelling of a decision already made, and the two could disagree.
  useEffect(
    () => () => {
      pendingConsentRunRef.current = null;
    },
    [viewer?.id],
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

      // 🔴 THE SPEND LANDED — RE-READ THE BALANCE. This is the case the SDK's own
      // docstring names ("`refetch` for on-demand refreshes (e.g. after a
      // generation debits the balance)") and the app ignored: every later cell in
      // the session was gated against the PRE-spend number, so the grid stayed
      // willing to confirm runs the viewer could no longer afford and the refusal
      // arrived from the server instead of the gate.
      //
      // Placed after the submit RESOLVED, not before it and not in the catch: a
      // throw leaves the outcome genuinely unknown (see above), and re-reading
      // there would replace one unknown with a number that may or may not include
      // the charge. Unconditional across `first.status` on purpose — a host
      // failure-snapshot can still have moved money and then refunded it, and
      // `first.status === 'failed'` returns before any other refetch site.
      //
      // Not awaited: the balance is advisory for the NEXT run, never a gate on
      // this one, and blocking the poll on it would make a slow balance read look
      // like a slow generation.
      buzzRef.current.refetch();

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
  /**
   * Every matchup and prompt a grid may REFERENCE, as `GridPicker` rows: the board's
   * published rows, then the viewer's OWN PRIVATE records.
   *
   * 🔴 A PRIVATE ROW IS KEYED BY ITS LOCAL ID, which is a different kind of string
   * from every other key in these lists, and that is the whole hazard of the feature.
   * A grid stores whatever key is picked, so a private pick puts a per-viewer id into
   * the grid's member list — fine while the grid is private, and NEVER acceptable on
   * the public board, where nobody else could resolve it and nothing could repair it.
   * `lib/gridCascade.ts` is what closes that: publishing the grid publishes those
   * records FIRST and rewrites their local ids to the shared keys the host mints.
   *
   * 🔴 AND A PRIVATE PICK CAN NEVER REACH A RESULT ROW, which is the invariant that
   * actually protects the public board. A result row is keyed
   * `comboKey · configId × promptKey` and is not grid-scoped; the matrix is built from
   * `resolveGridRows`, which resolves member keys against the BOARD rows only, so a
   * local id resolves to nothing, contributes no row and no column, and cannot be part
   * of any cell. Pinned against the `shared.append` log in
   * `src/gridDraftsCascade.test.tsx` — not inferred from this comment.
   *
   * ⚠️ PUBLISHED FIRST, PRIVATE AFTER. `GridPicker` lists `items` in the order given
   * and keeps the AUTHOR'S selection order separately, so this only decides what the
   * picker's list looks like, never what a grid stores.
   */
  const matchupBoardItems = useMemo<GridPickerItem[]>(
    () =>
      combinations.map((c) => ({
        key: c.key,
        name: c.name || `#${c.key}`,
        description: c.description,
        // 🔴 THE COPY LIVES IN `modelCountSummary`, NOT HERE. This ternary was
        // open-coded identically in `MatchupsView` too; see that helper for why the
        // viewer-facing noun is "models" while every internal name stays "config".
        meta: modelCountSummary(c.data.configs.length),
      })),
    [combinations],
  );
  const promptBoardItems = useMemo<GridPickerItem[]>(
    () =>
      prompts.map((p) => ({
        key: p.key,
        name: p.name || `#${p.key}`,
        description: p.description,
      })),
    [prompts],
  );
  const matchupPickerItems = useMemo<GridPickerItem[]>(
    () => [
      ...matchupBoardItems,
      ...unpublishedMatchups.map((d) => ({
        key: d.localId,
        name: d.name || 'Untitled matchup',
        description: d.description,
        // 🔴 THE WORD IS "Private", NOT "Draft" — §11.1 took the old word out of the
        // rendered vocabulary entirely (`myCommunity.test.tsx` holds it out of
        // `document.body.textContent`), and "Private" is also the honest fact: the
        // record lives in this viewer's own KV and no other viewer can see it. It is
        // the same word `MyList`'s state badge uses.
        meta: `${PRIVATE_PICK_LABEL} · ${modelCountSummary(d.configs.length)}`,
      })),
    ],
    [matchupBoardItems, unpublishedMatchups],
  );
  const promptPickerItems = useMemo<GridPickerItem[]>(
    () => [
      ...promptBoardItems,
      ...unpublishedPrompts.map((p) => ({
        key: p.localId,
        name: p.name || 'Untitled prompt',
        description: p.description,
        meta: PRIVATE_PICK_LABEL,
      })),
    ],
    [promptBoardItems, unpublishedPrompts],
  );

  const archivedKeys = useMemo(() => new Set(archived), [archived]);
  const quotaLine = formatQuota(quota);
  /** The viewer's OWN published grids — the same `isOwnRow` predicate the cards use. */
  const ownGrids = useMemo(() => grids.filter((g) => isOwnRow(g, viewer?.id ?? null)), [grids, viewer?.id]);

  // ---- the OPEN grid, resolved ONCE ----
  //
  // 🔴 IT IS RESOLVED HERE AND NOWHERE ELSE, and the reason is a bug shape rather
  // than tidiness. Two consumers need to agree about which grid is open: the panel
  // that RENDERS it and the list that EXCLUDES it. `openGridRef` can name a grid that
  // has since been withdrawn — by its author in another tab, or by this viewer from
  // the list — and the panel falls back to the Top Grid in that case. A list that
  // applied its own `key !== openGridKey` test would then find no match, keep the Top
  // Grid in the list, and show the same grid twice: once in the panel, once as a card.
  // So the fallback happens once and `GridsView` is handed the RESOLVED key.
  //
  // 🔴 THERE ARE THREE ARMS NOW, AND THE THIRD RESOLVES AGAINST A DIFFERENT STORE.
  // A `private` reference is a per-viewer LOCAL id and is looked up in
  // `unpublishedGrids` (the KV half), never in `grids` (the shared board). The two id
  // spaces are disjoint and the tag is what keeps them apart; see `OpenGridRef`.
  //
  // ⚠️ THE PRIVATE ARM FALLS BACK THE SAME WAY, AND IT IS NOT A HYPOTHETICAL: the
  // record is RETIRED from `unpublishedGrids` the moment it publishes
  // (`publishedThisSession`), so a viewer who opens a private grid and then publishes
  // it lands on the Top Grid rather than on a blank panel. The published row's own key
  // is minted by that publish and nothing here re-points the reference at it — doing
  // so would be a second place that decides which grid is open.
  const topGrid = useMemo(() => buildTopGrid(combinations, prompts), [combinations, prompts]);
  const openTarget: OpenGrid = useMemo(() => {
    const system = openSystemGrid(topGrid);
    if (openGridRef.kind === 'published') {
      const row = grids.find((g) => g.key === openGridRef.key);
      return row ? { kind: 'published', row } : system;
    }
    if (openGridRef.kind === 'private') {
      const rec = unpublishedGrids.find((g) => g.localId === openGridRef.localId);
      return rec ? { kind: 'private', rec } : system;
    }
    return system;
  }, [openGridRef, grids, unpublishedGrids, topGrid]);
  /**
   * The open grid's members, resolved against the LIVE BOARD.
   *
   * 🔴 ONE RESOLVER FOR ALL THREE KINDS, AND THAT IS WHAT KEEPS A LOCAL ID OFF THE
   * WIRE. `resolveOpenGrid` delegates to `resolveMemberRows`, which resolves each
   * authored key against the board's rows — so a member that is one of the viewer's
   * own PRIVATE matchups/prompts has no row, contributes no row and no column, and
   * cannot be part of any cell. A cell's identity is what every result row is written
   * under (`buildResultPayload`), so opening a private grid adds NO path by which a
   * local id can reach `shared.append`. The property belongs to the resolver, not to
   * a check here — see `lib/gridCascade.ts`'s header for the boundary, and
   * `src/gridOpenPrivate.test.tsx` for the assertion against the append log.
   */
  const openResolved = useMemo(
    () => resolveOpenGrid(openTarget, combinations, prompts),
    [openTarget, combinations, prompts],
  );
  /**
   * The shortfall sentence, built by whichever helper can state an honest cause.
   *
   * 🔴 THE PRIVATE ARM MUST NOT USE `missingMembersNotice`. Its complete-scan wording
   * attributes the absence to "their authors removed them", and the commonest cause on
   * a private grid is the viewer's OWN still-private member sitting in their own
   * storage. `privateGridShortfall` states the arithmetic and the rule and attributes
   * nothing — the same reason `MyGridsView`'s private CARD renders no missing notice.
   */
  const openMissing =
    openTarget.kind === 'private'
      ? privateGridShortfall(openResolved)
      : missingMembersNotice(openResolved, boardTruncated);
  /**
   * The open grid's "N matchups × N prompts" line.
   *
   * 🔴 THE SAME HELPER THE CARDS USE, over the SAME resolved rows. Excluding the open
   * grid from the list took its member count off the page entirely — on a default load
   * (Top Grid open, nothing published) there was no statement anywhere of how many
   * members the matrix has. One helper, two surfaces, so the two can never disagree.
   */
  const openMembers = gridMemberSummary(openResolved);
  const openName = openGridName(openTarget);
  /**
   * The identity `GridsView` filters its own list against, as an `entryDomKey`.
   *
   * 🔴 THREE STATES, AND THE THIRD IS WHY THIS IS A DOM KEY RATHER THAN AN OPEN KEY.
   * `'__system__'` when the Top Grid is open, the shared key when a published row is,
   * and `null` when NOTHING IN THAT LIST IS OPEN — which is the case while one of the
   * viewer's own private grids is. The prop used to be an `entryOpenKey`, whose `null`
   * already meant "the Top Grid", so the private arm's `null` silently hid the Top Grid
   * from the board. `GridsView.openKey`'s docblock carries the whole account.
   */
  const openKeyResolved =
    openTarget.kind === 'published'
      ? openTarget.row.key
      : openTarget.kind === 'system'
        ? SYSTEM_GRID_DOM_KEY
        : null;

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
  // ---- the GRID-PUBLISH CASCADE (a grid that names PRIVATE members) ----
  //
  /** Mid-cascade flag for the dialog's spinner, and the synchronous gate beside it. */
  const [gridPublishBusy, setGridPublishBusy] = useState(false);
  /**
   * The grid-publish REFUSAL or CASCADE FAILURE notice.
   *
   * 🔴 ITS RENDER SITE IS `MyGridsView`, ABOVE THE LIST — NOT THE DIALOG. The state
   * lived in `App` from the start and the previous docblock said so, but the only
   * place it RENDERED was inside the dialog body, nested under
   * `gridPublishRec && gridPublishPlan`. `gridPublishRec` resolves out of
   * `unpublishedGrids`, which filters `publishedThisSession` — so at the exact moment
   * the grid's own pointer write is refused, `publishRecord` retires the local id, the
   * record leaves the list, and the notice that was just set became UNRENDERABLE.
   * Measured: two rows public and permanent, nothing on screen. A STATE that survives
   * and a RENDER SITE that does not are two different claims, and the docblock
   * asserted the first while the viewer needed the second.
   *
   * ⚠️ WHAT IT COVERS, STATED NARROWLY, because the previous version over-claimed. It
   * is the channel for the GRID-PUBLISH paths only: the refusal, the cascade's partial
   * failure, and the grid's own pointer refusal. It DOES survive a nav away and back,
   * because `App` holds it and `MyGridsView` re-renders it on return.
   *
   * ⚠️ IT IS NOT THE ONLY PUBLISH-FAILURE CHANNEL, and the other one is NOT hoisted.
   * The direct, no-dependency publish still rejects into `MyList`, which renders
   * `unpublished-error` from its OWN local state — unchanged from before this feature,
   * and still destroyed by a nav away, exactly as `publishPointerFailure.test.tsx`'s
   * characterisation case pins. Hoisting THAT is a change to the matchup and prompt
   * surfaces as well as the grid one and is still not taken here.
   */
  const [gridPublishError, setGridPublishError] = useState<string | null>(null);
  const cascadeRunningRef = useRef(false);
  //
  // 🔴 THE PROBLEM IT SOLVES, IN ONE LINE: a grid stores member KEYS, a private
  // matchup/prompt has only a per-viewer LOCAL id, and a local id must never reach
  // the public board. See `lib/gridCascade.ts` for the whole argument and for why
  // the order (dependencies first, grid last) is the load-bearing part.
  //
  // 🔴 THE THREE SOURCES A MEMBER KEY IS CLASSIFIED AGAINST, per axis, and they are
  // NOT interchangeable:
  //   - `boardKeys`    — a published row. Resolves to itself; nothing to do.
  //   - `pointers`     — a local id whose record ALREADY became a `PublishedPointer`.
  //     Resolves to the stored shared key WITHOUT appending anything. This is the
  //     DURABLE half, and it is what makes a retry after a half-finished cascade
  //     publish the grid instead of re-publishing its members.
  //   - `privateNames` — a local id with a live private record: a DEPENDENCY.
  // 🔴 ANYTHING ELSE IS `unresolved`, AND A NON-EMPTY `unresolved` NOW REFUSES THE
  // PUBLISH — see `cascadeRefusal`, which owns that decision and its copy. Before
  // private members existed that bucket could only hold a withdrawn SHARED key and
  // carrying it through was right; it is now also where an unaccountable LOCAL ID
  // lands, by three measured paths with no error at all.
  const matchupSources = useMemo<MemberSources>(
    () => ({
      boardKeys: new Set(combinations.map((c) => c.key)),
      privateNames: new Map(
        unpublishedMatchups.map((d) => [d.localId, d.name || 'Untitled matchup'] as const),
      ),
      pointers: new Map(drafts.filter(isSubmitted).map((p) => [p.localId, p.sharedKey] as const)),
    }),
    [combinations, unpublishedMatchups, drafts],
  );
  const promptSources = useMemo<MemberSources>(
    () => ({
      boardKeys: new Set(prompts.map((p) => p.key)),
      privateNames: new Map(
        unpublishedPrompts.map((p) => [p.localId, p.name || 'Untitled prompt'] as const),
      ),
      pointers: new Map(
        unpubPrompts.filter(isPublishedPrompt).map((p) => [p.localId, p.sharedKey] as const),
      ),
    }),
    [prompts, unpublishedPrompts, unpubPrompts],
  );
  const planFor = useCallback(
    (rec: UnpublishedGrid): GridCascadePlan =>
      planGridCascade(unpubGridToInput(rec), matchupSources, promptSources),
    [matchupSources, promptSources],
  );

  /**
   * 🔴 THE PUBLISH BOUNDARY, CALLED FROM BOTH ENTRY POINTS. One predicate, one place:
   * `cascadeRefusal` decides, this closure only supplies the two facts it cannot see
   * (whether the private scans were complete, and whether the board scan was).
   *
   * The scan flag is read from a REF at call time, not from a render-time value — the
   * answer must be about the store as of this press, not as of the render that built
   * the handler.
   */
  const refusalFor = useCallback(
    (rec: UnpublishedGrid, plan: GridCascadePlan): string | null =>
      cascadeRefusal({
        gridName: rec.name || 'Untitled grid',
        plan,
        scanComplete: privateScanCompleteRef.current,
        // 🔴 THE WHOLE SNAPSHOT, NOT ITS FIELDS. They answer different questions —
        // `outcome` whether an absence can be trusted, `prefix` whether a retry is
        // worth promising — and passing them separately is a seam a caller can wire by
        // halves. A mutant doing exactly that survived the suite once; see
        // `cascadeRefusal`'s docblock.
        board: boardSnapshot,
      }),
    [boardSnapshot],
  );

  /**
   * Publish a private grid — the route `MyList`'s Publish button takes.
   *
   * 🔴 THE REFUSAL COMES FIRST, BEFORE THE DIALOG DECISION, and the order is the
   * point. All three measured paths that put a local id on the public board have
   * `deps.length === 0`, so they never opened the dialog and published on the FIRST
   * click with nothing shown. Checking `deps.length` first is what made the hazard
   * invisible; checking accountability first is what closes it.
   *
   * 🔴 IT BRANCHES RATHER THAN ALWAYS CONFIRMING. A grid whose members are all on
   * the board has nothing to disclose, and a dialog naming nothing is friction on
   * the path this app already had. A grid with private members opens the confirm,
   * which is the one place the viewer learns that pressing Publish makes MORE than
   * one row public.
   *
   * ⚠️ IT DOES NOT THROW ON A REFUSAL. A refusal happens BEFORE any irreversible
   * write, so there is nothing for `MyList`'s own notice to report; routing it to
   * `gridPublishError` keeps the grid surface's refusal and cascade copy in ONE place
   * rather than splitting it across two alerts by entry point.
   */
  const publishGridById = useCallback(
    async (localId: string) => {
      const rec = unpublishedGrids.find((g) => g.localId === localId);
      if (!rec) return;
      const plan = planFor(rec);
      const refusal = refusalFor(rec, plan);
      if (refusal !== null) {
        setGridPublishError(refusal);
        return;
      }
      if (plan.deps.length > 0) {
        setGridPublishError(null);
        // 🔴 THE DEPS ARE SNAPSHOTTED FOR **DISPLAY** AND RECOMPUTED FOR THE
        // **DECISION**. The dialog renders this list; `runGridCascade` re-plans from
        // the live stores and acts on that. The split exists because a plan
        // recomputed at render churns mid-cascade (each dependency that lands leaves
        // the private list), which would rewrite the dialog under the viewer's hands
        // and, at zero, leave a counts sentence built from nothing.
        //
        // ⚠️ AND THE SNAPSHOT CANNOT UNDER-STATE WHAT PUBLISHES. In this tab the
        // dependency set can only SHRINK while the dialog is open: a record leaves it
        // by being published or discarded, both of which need a surface this modal
        // covers, and a record JOINS it only via the create form, which cannot be
        // opened from here. So the fresh plan's dependencies are a subset of what the
        // viewer was shown — never a superset.
        setModal({ kind: 'grid-publish', localId, deps: plan.deps });
        return;
      }
      // 🔴 CLEAR THE PREVIOUS NOTICE BEFORE THE ATTEMPT, not only on the dialog path.
      // Measured: a viewer who followed a refusal's advice — edit the grid, remove the
      // member, publish — SUCCEEDED and was left looking at the red alert saying the
      // publish had been refused. The refusal's whole point is to be actionable, so an
      // alert that outlives the action it asked for undoes that.
      setGridPublishError(null);
      await publishUnpubGrid(rec, plan.resolved);
    },
    [unpublishedGrids, planFor, refusalFor, publishUnpubGrid],
  );

  /**
   * Run the cascade: every dependency first, the grid LAST.
   *
   * 🔴 IT THROWS VIEWER COPY AND NEVER SWALLOWS, the same contract `publishRecord`
   * has, and the copy is built by `cascadeStoppedNotice` so it names exactly which
   * items DID publish. There is no rollback to report: `shared.append` is
   * irreversible, so the honest thing is a statement, not an apology.
   *
   * 🔴 `key === undefined` IS TREATED AS A FAILURE. It means `publishRecord`'s own
   * guards returned early, so no append happened on this call and there is no key to
   * rewrite the dependency's local id to. Publishing the grid anyway is precisely the
   * permanent public dangling reference this path exists to prevent.
   *
   * 🔴 A DEPENDENCY WHOSE **POINTER** WRITE FAILED IS REPORTED AS PUBLISHED, because
   * it is. `publishRecord` throws `PointerWriteFailure` only AFTER its `append`
   * resolved, so that row is public and permanent; routing it through the ordinary
   * failure arm produced "Nothing was published." in the same sentence as a host error
   * about a row the append log proves is on the board. It also stops the cascade: the
   * dependency's private record has been deleted, so its key can no longer be
   * accounted for from this viewer's storage — the same boundary `cascadeRefusal`
   * enforces from the outside.
   *
   * 🔴 AND THE GRID'S OWN POINTER REFUSAL IS A FOURTH OUTCOME, not the `null` arm. The
   * grid IS public there, so every `cascadeStoppedNotice` branch ("still private")
   * would be false. It composes the dependencies' sentence with
   * `publishPointerFailedNotice`'s existing, already-pinned grid copy instead.
   *
   * ⚠️ THE PLAN IS RECOMPUTED HERE rather than taken from the dialog's snapshot —
   * the snapshot is for DISPLAY. The refusal is re-checked here too, so a member that
   * became unaccountable while the dialog was open cannot slip past the boundary.
   */
  const runGridCascade = useCallback(
    async (localId: string) => {
      const rec = unpublishedGrids.find((g) => g.localId === localId);
      if (!rec) return;
      const plan = planFor(rec);
      const gridName = rec.name || 'Untitled grid';
      // ⚠️ RE-CHECKED AT THE PRESS — DEFENSIVE, AND LABELLED AS SUCH RATHER THAN
      // LEFT READING AS LOAD-BEARING. An independent trace found NO in-tab route that
      // changes the plan between the dialog opening and this press (the modal covers
      // every surface that could publish or discard a dependency, and the create form
      // cannot be opened from under it), so no test drives this and a mutant deleting
      // it would SURVIVE. It is kept because nothing irreversible has happened yet, so
      // a refusal here is free — not because a reachable path needs it.
      const refusal = refusalFor(rec, plan);
      if (refusal !== null) throw new Error(refusal);
      const resolved = new Map(plan.resolved);
      /** Names of the dependencies whose ROW IS NOW PUBLIC, in publish order. */
      const landed: string[] = [];
      for (const dep of plan.deps) {
        let key: string | undefined;
        try {
          if (dep.noun === 'matchup') {
            const d = unpublishedMatchups.find((x) => x.localId === dep.localId);
            key = d ? await submitDraft(d) : undefined;
          } else {
            const p = unpublishedPrompts.find((x) => x.localId === dep.localId);
            key = p ? await publishUnpubPrompt(p) : undefined;
          }
        } catch (e) {
          // The append LANDED iff this is a pointer failure. Name it as published.
          const appended = e instanceof PointerWriteFailure;
          if (appended) landed.push(dep.name);
          throw new Error(
            cascadeStoppedNotice({
              gridName,
              published: landed,
              stoppedAt: { name: dep.name, appended },
              // The host's RAW refusal, not the paragraph `message` wraps it in.
              hostError: e instanceof PointerWriteFailure ? e.hostError : errMsg(e),
            }),
          );
        }
        if (key === undefined) {
          throw new Error(
            cascadeStoppedNotice({
              gridName,
              published: landed,
              stoppedAt: { name: dep.name, appended: false },
              hostError: CASCADE_NO_KEY,
            }),
          );
        }
        resolved.set(dep.localId, key);
        landed.push(dep.name);
      }
      try {
        await publishUnpubGrid(rec, resolved);
      } catch (e) {
        if (e instanceof PointerWriteFailure) {
          // 🔴 THE GRID IS PUBLIC. Its own notice already says exactly that, branching
          // on whether the private copy could be discarded — reused verbatim so this
          // path has no second copy of that sentence to keep in step.
          throw new Error(`${cascadeLandedSentence(landed)} ${e.message}`);
        }
        throw new Error(
          cascadeStoppedNotice({
            gridName,
            published: landed,
            stoppedAt: null,
            hostError: errMsg(e),
          }),
        );
      }
    },
    [
      unpublishedGrids,
      unpublishedMatchups,
      unpublishedPrompts,
      planFor,
      refusalFor,
      submitDraft,
      publishUnpubPrompt,
      publishUnpubGrid,
    ],
  );

  /**
   * The confirm dialog's Publish press.
   *
   * 🔴 THE GATE IS A REF, NOT THE `busy` STATE. A double-tap reads the state from the
   * render that was current when the handler was created, so a state check can let
   * the second press through — the same reason `submittingRef` exists one level down.
   * The ref is synchronous and cannot. (`publishRecord`'s own `submittingRef` still
   * covers each individual append; this one stops two whole cascades interleaving.)
   *
   * 🔴 THE DIALOG CLOSES ON **BOTH** OUTCOMES, and that is a render requirement rather
   * than a preference: the notice renders on the grids SURFACE, which a modal overlay
   * covers. Leaving the dialog open on failure would put the only explanation behind
   * the thing the viewer has to dismiss to read it. The grid, if it is still private,
   * is still listed with its Publish button — so retrying costs one press.
   */
  const confirmGridPublish = useCallback(
    async (localId: string) => {
      if (cascadeRunningRef.current) return;
      cascadeRunningRef.current = true;
      setGridPublishBusy(true);
      setGridPublishError(null);
      try {
        await runGridCascade(localId);
      } catch (e) {
        setGridPublishError(errMsg(e));
      } finally {
        cascadeRunningRef.current = false;
        setGridPublishBusy(false);
        closeModal();
      }
    },
    [runGridCascade, closeModal],
  );

  /**
   * The record the open confirm is about, resolved at RENDER.
   *
   * ⚠️ THE **PLAN** IS NO LONGER RESOLVED HERE. It used to be, and the dialog rendered
   * from it — which meant the body churned as each dependency landed and, at zero,
   * rendered a counts sentence built from an empty list plus a literal
   * ("Everything this grid lists is already published") that was FALSE whenever the
   * grid also held an unaccountable member. The dialog renders `modal.deps`, the
   * snapshot taken when it opened; `runGridCascade` re-plans for the decision. Both
   * halves of that split are argued at the `setModal` call in `publishGridById`.
   */
  const gridPublishRec = useMemo(
    () =>
      modal.kind === 'grid-publish'
        ? unpublishedGrids.find((g) => g.localId === modal.localId)
        : undefined,
    [modal, unpublishedGrids],
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

  /**
   * The row the open DETAIL modal is about, resolved against the LIVE board.
   *
   * 🔴 RESOLVED AT RENDER, NEVER SNAPSHOTTED INTO THE MODAL STATE. The detail is
   * reached from the grid, which means it can be open while the row it names is
   * voted on, edited or WITHDRAWN — by its author in another tab, or by this viewer
   * in the modal itself. A captured row would keep rendering the old vote count and
   * would keep offering Withdraw on a row that no longer exists; `undefined` here
   * closes the modal instead (the `opened` prop branches on it).
   */
  const detailMatchup = useMemo(
    () => (modal.kind === 'matchup-detail' ? combinations.find((r) => r.key === modal.comboKey) : undefined),
    [modal, combinations],
  );
  const detailPrompt = useMemo(
    () => (modal.kind === 'prompt-detail' ? prompts.find((r) => r.key === modal.promptKey) : undefined),
    [modal, prompts],
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
      {/* 🔴 THE LAYOUT SHEET IS UNCONDITIONAL, and that is not an inconsistency with
          the line above. It carries the WIDE case — sidebar beside content — and the
          compact sheet OVERRIDES it to a single column. A sheet mounted only on narrow
          viewports could not express the wide case at all, and putting the wide case in
          an inline `style` would make it unbeatable: an inline declaration outranks
          every author rule that is not `!important`. Two rules in two sheets, no
          `!important` anywhere. */}
      <style data-testid="layout-styles">{layoutCss()}</style>
      <div style={contentStyle} data-testid="app-content">
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
          🔴 THE BOARD IS BIGGER THAN WHAT IS RANKED. `list()` is newest-first with
          no server-side sort, so "most-voted" is computed client-side over the
          rows the scan actually read — and the scan stops at a page cap. When it
          stops early, the section counts below, the top-N that becomes the grid,
          and every "Included" badge describe a PREFIX of the board.

          Saying so is the whole point: an honest partial beats a confident wrong
          order, and the alternative is a ranking that silently omits row 2001
          while looking complete.

          🔴 IT STAYS ABOVE ALL THREE SECTIONS, and that placement is load-bearing
          for the same reason it was when there were three tabs: THREE readers
          depend on the same truncated ranking — the matchup list's order, the
          prompt list's order, and the grids list (whose Community order is that
          same client-side count, and whose TOP GRID's members come straight out of
          the matchup and prompt rankings). One disclosure above all of them is the
          only placement that is not either duplicated or missing.
        */}
        {boardTruncated && (
          <Alert color="warning" data-testid="board-truncated-notice">
            This board has more entries than the app can rank at once. Vote order — and
            the rows and columns of the grid — cover only the entries loaded so far.
          </Alert>
        )}

        {/* ================= THE PAGE BODY: SIDEBAR + ONE SURFACE =================

             🔴 WHAT REPLACED WHAT, IN ORDER, BECAUSE THE HISTORY IS THE ARGUMENT:
             a three-tab `SegmentedControl` strip (one view mounted) → one page with
             three simultaneous sections and a `ContributeMenu` dropdown → this: a
             SIDEBAR choosing Home vs the viewer's own work, and on Home a BOARD
             SUBNAV choosing which single community board is mounted.

             🔴 THE UNSELECTED SURFACES ARE UNMOUNTED, NOT HIDDEN. Every absence this
             layout creates is asserted as an absence (`boardNav.test.tsx`,
             `sideNav.test.tsx`): a `display: none` would satisfy a visibility check,
             keep every hidden section's testids resolving, and keep its gated image
             reads running — the read budget the preview suites defend is a claim about
             what is MOUNTED.

             🔴 AND THE ONE-PAGE LAYOUT COST THE STORE LISTING SOMETHING MEASURABLE,
             which is part of why this is worth doing: the host sizes the iframe to the
             VIEWPORT inside an `overflow: hidden` parent, the three-section page came
             to 2166 CSS px, and `section-matchups` (y 1175..1482) and `section-prompts`
             (y 1500..2142) sat below the iframe edge at EVERY tested viewport height
             (900/1100/1400 → iframe 752/952/1253). Mounting one board at a time is the
             only change that can put them back in frame. ⚠️ NOT YET RE-MEASURED —
             that needs a released artifact, and it is owed. ================== */}
        <div
          {...{ [LAYOUT_ATTR]: 'true' }}
          data-testid="app-layout"
        >
          {/* 🔴 THE SIDEBAR HOLDS NO VIEW STATE — `view` is App's, which is what makes
              an in-flight run survive a trip to My Benchmarks and back. See
              `openGridKey` and `SideNav`'s own header. */}
          <SideNav view={view} onSelect={setView} />

          <div style={{ minWidth: 0, display: 'grid', gap: 14 }} data-testid="app-surface">
            {view.kind === 'home' ? (
              <>
                {/* ---- THE OPEN GRID: always on Home, whichever board is selected.
                     It is the app's primary object and the boards below it are what
                     feed it, so it does not belong to any one of them.

                     `minWidth: 0` for the same reason `contentStyle` carries it: this
                     box is a grid item holding the wide results matrix, and its
                     default content-based minimum would re-introduce the blowout one
                     level below the containment in `contentStyle`. ---- */}
                <section
                  data-mb-section="open-grid"
                  data-testid="section-open-grid"
                  style={{ minWidth: 0, display: 'grid', gap: 14 }}
                >
                  <Stack gap={14} data-testid="grid-view" style={{ minWidth: 0 }}>
                    <GridOpenPanel
                      /* 🔴 THE WHOLE RESOLVED OBJECT, not a `system` boolean — the
                         panel's three row controls each need the row's KEY as well, and
                         one object is what stops them naming two different grids. It is
                         an `OpenGrid` (three kinds) rather than a `GridEntry` (two),
                         because the panel can show a PRIVATE grid the board cannot
                         list. */
                      open={openTarget}
                      viewerId={viewer?.id ?? null}
                      name={openName}
                      members={openMembers}
                      /* 🔴 Criterion 8 on the OPEN grid: the surviving members render
                         below and this sentence carries the honest count of what is
                         not there — built from the scan's truncation flag, so a
                         member that was merely UNREAD is not reported as removed. */
                      missing={openMissing}
                      /* 🔴 THE OPEN GRID'S OWN CONTROLS, and they are the SAME
                         callbacks the cards get. Excluding the open grid from the list
                         took its card away, and the card was the only place vote /
                         withdraw / report rendered — so the grid a viewer is actually
                         reading was the one grid they could not act on. */
                      votedKeys={votedKeys}
                      reportedKeys={reportedKeys}
                      onVote={onVote}
                      onUnvote={onUnvote}
                      onRequireAuth={requireAuth}
                      onWithdraw={withdrawGrid}
                      onReport={reportRow}
                    >
                      {/* 🔴 THE MATRIX IS RENDERED HERE, not inside any browse
                          surface, because every prop below it is money-shaped (the
                          estimate → confirm → submit → poll path and the Buzz gate).
                          `matchups`/`prompts` arrive already RESOLVED against the live
                          board, so a withdrawn member simply is not among them. */}
                      <ResultsGrid
                        configs={flattenConfigs(openResolved.matchups)}
                        prompts={openResolved.prompts}
                        results={results}
                        runs={runs}
                        c={c}
                        buzzTotal={buzzTotal}
                        /* 🔴 THE TWO PROPS THAT MAKE AN UNKNOWN BALANCE RECOVERABLE.
                           `buzzTotal === null` alone cannot tell "still loading" from
                           "the read failed", and the grid has to say different things
                           about those. `refetch` is the hook's own escape hatch — the
                           app used neither it nor `error`, which is why a single
                           failed mount read was permanent until a page reload. */
                        buzzBalanceLoading={buzz.loading}
                        onRetryBalance={buzz.refetch}
                        /* 🔴 THE ONE THING THE MATRIX IS TOLD ABOUT THE GRID'S OWN
                           STATE, and it buys exactly one extra sentence on the confirm
                           path: a private grid's OUTPUTS are public anyway, because a
                           result row is keyed on the matchup and the prompt and is not
                           grid-scoped. It gates no behaviour — see
                           `ResultsGridProps.privateGrid`. */
                        privateGrid={openTarget.kind === 'private'}
                        GatedCell={deps.GatedCell}
                        onRunCell={beginRun}
                        onConfirmRun={confirmRun}
                        onResumeRun={resumeRun}
                        onCancelRun={cancelRun}
                        /* 🔴 THESE USED TO BE `setView(...)` to a tab, then a modal
                           open. They stay a modal open: the destination was only ever
                           a way of reaching the submit form. */
                        onAddCombination={() => setModal({ kind: 'combo' })}
                        onAddPrompt={() => setModal({ kind: 'prompt' })}
                        /* Drill-in: the group BAND opens the matchup, a COLUMN header
                           opens the prompt. Config rows stay inert — see
                           `ResultsGridProps.onOpenMatchup`. */
                        onOpenMatchup={(comboKey) => setModal({ kind: 'matchup-detail', comboKey })}
                        onOpenPrompt={(promptKey) => setModal({ kind: 'prompt-detail', promptKey })}
                      />
                    </GridOpenPanel>
                  </Stack>
                </section>

                {/* 🔴 THE BOARD SUBNAV, WHERE THE "All grids" HEADING USED TO BE. One
                    board is mounted; the other two are gone from the DOM. */}
                <BoardNav value={board} onChange={setBoard} />

                {board === 'grids' && (
                  <section
                    data-mb-section="grids"
                    data-testid="section-grids"
                    style={{ minWidth: 0, display: 'grid', gap: 14 }}
                  >
                    <GridsView
                      grids={grids}
                      combinations={combinations}
                      prompts={prompts}
                      /* The preview strips' source. One batched gated read per card —
                         see GridPreview for the budget and why it reuses GatedCell. */
                      results={results}
                      GatedCell={deps.GatedCell}
                      votedKeys={votedKeys}
                      reportedKeys={reportedKeys}
                      viewerId={viewer?.id ?? null}
                      loading={loading}
                      error={error}
                      /* 🔴 The SAME flag the `board-truncated-notice` above is
                         rendered from. A grid's members are resolved against the rows
                         this scan READ, so when it stopped early a "missing" member
                         may simply be unread — and the notice must not tell the viewer
                         its author removed it. */
                      boardTruncated={boardTruncated}
                      /* 🔴 RESOLVED, not raw — see the prop's own docblock for the
                         same-grid-twice bug a second resolution would create. */
                      openKey={openKeyResolved}
                      onOpen={openPublishedKey}
                      onVote={onVote}
                      onUnvote={onUnvote}
                      onRequireAuth={requireAuth}
                      onWithdraw={withdrawGrid}
                      onReport={reportRow}
                    />
                  </section>
                )}

                {board === 'matchups' && (
                  <section
                    data-mb-section="matchups"
                    data-testid="section-matchups"
                    style={{ minWidth: 0, display: 'grid', gap: 14 }}
                  >
                    <MatchupsView
                      surface="community"
                      combinations={combinations}
                      includedCount={includedCombos.length}
                      votedKeys={votedKeys}
                      reportedKeys={reportedKeys}
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
                    />
                  </section>
                )}

                {board === 'prompts' && (
                  <section
                    data-mb-section="prompts"
                    data-testid="section-prompts"
                    style={{ minWidth: 0, display: 'grid', gap: 14 }}
                  >
                    <PromptsView
                      surface="community"
                      prompts={prompts}
                      includedCount={includedPrompts.length}
                      votedKeys={votedKeys}
                      reportedKeys={reportedKeys}
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
                    />
                  </section>
                )}
              </>
            ) : (
              /* ================= MY BENCHMARKS =================

                 🔴 THIS IS WHERE THE "My" HALF OF §11.1 LIVES NOW, and where ARCHIVE
                 lives with it. The per-board My/Community sub-tabs are deleted: "my
                 work" is one destination rather than a toggle repeated on each board,
                 and `ARCHIVE_NOTE`'s promise — an archived row "stays in Community for
                 everyone including you" — only makes sense once there is a My list
                 that is not the community board. ================== */
              <section
                data-mb-section={`my-${view.noun}`}
                data-testid={`section-my-${view.noun}`}
                style={{ minWidth: 0, display: 'grid', gap: 14 }}
              >
                {view.noun === 'grid' && (
                  <MyGridsView
                    ownGrids={ownGrids}
                    combinations={combinations}
                    prompts={prompts}
                    boardTruncated={boardTruncated}
                    viewerId={viewer?.id ?? null}
                    loading={loading}
                    /* 🔴 THE SAME `error` EVERY OTHER SURFACE GETS. It used to be
                       omitted here alone, so a failed `listAll` rendered
                       the list's empty line — an absence the app never
                       observed, while My ▸
                       Matchups showed `matchups-error` on the same failure. */
                    error={error}
                    /* 🔴 THE GRID-PUBLISH NOTICE'S RENDER SITE. It is passed DOWN
                       rather than rendered in the dialog precisely because the dialog
                       unmounts when the grid's record is retired — which is the moment
                       the notice matters most. See the prop's own docblock. */
                    publishError={gridPublishError}
                    archivedKeys={archivedKeys}
                    unpublished={unpublishedGrids}
                    quotaLine={quotaLine}
                    onRequireAuth={requireAuth}
                    onWithdraw={withdrawGrid}
                    onArchive={archiveRow}
                    onUnarchive={unarchiveRow}
                    onNewUnpublished={openNewGrid}
                    onEditUnpublished={editGridById}
                    onDiscardUnpublished={deleteUnpubGrid}
                    onPublishUnpublished={publishGridById}
                    /* 🔴 THE PUBLISHED-GRID EDIT ROUTE, and it is wired ONLY here.
                       `GridsView` (the community board) is passed no edit callback,
                       so the control cannot appear on a row the viewer does not own
                       . 🔴 AND THIS IS NOT THE SHAPE THE OTHER TWO USE — an earlier
                       comment here said it was, and a maintainer copying that would ship
                       an UNGATED control. `MatchupsView`/`PromptsView` pass `onEdit` on
                       the COMMUNITY card too (`PromptsView.tsx:117`) and narrow INSIDE
                       the body (`MatchupBody.tsx:122`, `canEdit = isOwn && onEdit !==
                       undefined`). `GridsView` wires no edit at all and has NO body-level
                       edit gate, so mirroring their call site into it yields Edit on every
                       foreign row. Opposite designs; only the NON-OWNER outcome
                       matches — the own-row one does not, see below.
                       ⚠️ AND THE ASYMMETRY IS REAL: a matchup or prompt author gets Edit
                       on the community board, a grid author does not and must go to My
                       Benchmarks. Recorded so it reads as a choice, not an oversight. */
                    onEditPublished={(row) => setModal({ kind: 'grid', edit: row })}
                    /* 🔴 THE TWO OPEN ROUTES FROM THIS SURFACE, and the private one is
                       the only way a private grid's matrix can be reached at all — a
                       private grid has no shared row, so the community board cannot
                       list it and `grid-open` there cannot name it. Both go through
                       `openOwnGrid`, which ALSO returns to Home: the open panel only
                       exists on `view.kind === 'home'`, so setting the reference
                       without the view switch would leave the press looking inert. */
                    onOpenUnpublished={(localId) =>
                      openOwnGrid({ kind: 'private', localId })
                    }
                    onOpenPublished={(row) => openOwnGrid({ kind: 'published', key: row.key })}
                    /* The preview strips' source, on the viewer's OWN grids now too —
                       ONE batched gated read per card, private and published alike.
                       See `MyGridsView.GatedCell` for why this does not move the
                       open/listed partition `gridPreviewSeam.test.tsx` pins. */
                    results={results}
                    GatedCell={deps.GatedCell}
                  />
                )}

                {view.noun === 'matchup' && (
                  <MatchupsView
                    surface="my"
                    combinations={combinations}
                    includedCount={includedCombos.length}
                    votedKeys={votedKeys}
                    reportedKeys={reportedKeys}
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

                {view.noun === 'prompt' && (
                  <PromptsView
                    surface="my"
                    prompts={prompts}
                    includedCount={includedPrompts.length}
                    votedKeys={votedKeys}
                    reportedKeys={reportedKeys}
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
              </section>
            )}
          </div>
        </div>

        {/* ---- DRILL-IN DETAIL: what the grid's group band and column headers open.
             🔴 A DETAIL VIEW, NOT AN EDIT FORM. Most viewers do not own the row they
             just clicked, so the destination has to be something they can DO
             something with: the full config list / prompt text, vote, report, and
             Edit/Withdraw only for the author — which is exactly the shared body the
             list cards render, so the ownership decision is not made twice.

             `detailMatchup`/`detailPrompt` resolve the key against the LIVE board, so
             a row withdrawn while its detail is open renders nothing rather than vote
             controls for something that is gone. ---- */}
        <Modal
          opened={modal.kind === 'matchup-detail' && !!detailMatchup}
          onClose={closeModal}
          title="Matchup"
          size="lg"
        >
          {modal.kind === 'matchup-detail' && detailMatchup && (
            <div data-testid="matchup-detail">
              <MatchupBody
                combo={detailMatchup}
                detail
                voted={votedKeys.has(detailMatchup.key)}
                reported={reportedKeys.has(detailMatchup.key)}
                viewerId={viewer?.id ?? null}
                onVote={onVote}
                onUnvote={onUnvote}
                onRequireAuth={requireAuth}
                onEdit={(combo) => setModal({ kind: 'combo', edit: combo })}
                onWithdraw={withdrawCombination}
                onReport={reportRow}
              />
            </div>
          )}
        </Modal>
        <Modal
          opened={modal.kind === 'prompt-detail' && !!detailPrompt}
          onClose={closeModal}
          title="Prompt"
          size="lg"
        >
          {modal.kind === 'prompt-detail' && detailPrompt && (
            <div data-testid="prompt-detail">
              <PromptBody
                prompt={detailPrompt}
                detail
                voted={votedKeys.has(detailPrompt.key)}
                reported={reportedKeys.has(detailPrompt.key)}
                viewerId={viewer?.id ?? null}
                onVote={onVote}
                onUnvote={onUnvote}
                onRequireAuth={requireAuth}
                onEdit={(prompt) => setModal({ kind: 'prompt', edit: prompt })}
                onWithdraw={withdrawPrompt}
                onReport={reportRow}
              />
            </div>
          )}
        </Modal>

        <Modal
          opened={modal.kind === 'combo'}
          onClose={closeModal}
          title={modal.kind === 'combo' && modal.edit ? 'Edit matchup' : 'New Matchup'}
          size="lg"
        >
          {modal.kind === 'combo' && (
            <MatchupForm
              key={modal.edit?.key ?? 'new'}
              pickResource={deps.pickResource}
              initial={modal.edit ? combinationToInput(modal.edit) : undefined}
              submitLabel={modal.edit ? 'Save changes' : undefined}
              /* 🔴 THE MODAL KIND DECIDES THE SHAPE, NOT `initial`. A create is two
                 steps (models, then name + description); an edit is one page. Read off
                 `modal.edit` here because that is the thing that actually distinguishes
                 them — the private paths below use `modal.existing` for the same reason,
                 and `initial` is undefined on a NEW private record too. */
              multiStep={!modal.edit}
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
          /* 🔴 FLAT, AND THE SUFFIX IT LOST WAS REDUNDANT RATHER THAN WRONG. This
             read "New matchup (not published yet)", which was true — nothing in this
             form reaches `shared.append` — but the row the save lands on now carries
             a **Private** badge (`MyList`'s `draft-badge`) and the submit button says
             "Save privately", so the parenthetical was the third telling of one fact,
             in the most prominent position on screen. Operator decision 2026-10-01:
             all three create titles are `New <Noun>`. Pinned as whole strings by
             `src/gridDraftsCascade.test.tsx`. */
          title={
            modal.kind === 'draft' && modal.existing
              ? 'Edit your unpublished matchup'
              : 'New Matchup'
          }
          size="lg"
        >
          {modal.kind === 'draft' && (
            <MatchupForm
              key={modal.localId}
              pickResource={deps.pickResource}
              initial={modal.initial}
              submitLabel="Save privately"
              multiStep={!modal.existing}
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
          /* 🔴 FLAT — the same operator decision, and the same reasoning as the
             private matchup modal above. */
          title={
            modal.kind === 'unpub-prompt' && modal.existing
              ? 'Edit your unpublished prompt'
              : 'New Prompt'
          }
          size="lg"
        >
          {modal.kind === 'unpub-prompt' && (
            <PromptForm
              key={modal.localId}
              initial={modal.initial}
              submitLabel="Save privately"
              multiStep={!modal.existing}
              onSubmit={(input) => saveUnpubPrompt(modal.localId, input)}
              onCancel={closeModal}
            />
          )}
        </Modal>
        {/* The PRIVATE grid form. 🔴 There is no public CREATE sibling: a grid has ONE
            create path and it lands in the per-viewer store. Publishing it is a
            separate, explicit button on the record (see `publishUnpubGrid`), and
            editing it AFTER that is the `grid` modal below. */}
        <Modal
          opened={modal.kind === 'unpub-grid'}
          onClose={closeModal}
          title={
            modal.kind === 'unpub-grid' && modal.existing
              ? 'Edit your unpublished grid'
              : 'New Grid'
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
              multiStep={!modal.existing}
              onSubmit={(input) => saveUnpubGrid(modal.localId, input)}
              onCancel={closeModal}
            />
          )}
        </Modal>
        {/* 🔴 THE GRID-PUBLISH CASCADE CONFIRM — the one place a viewer learns that
            pressing Publish on a grid makes MORE THAN ONE row public.

            🔴 IT ENUMERATES, IT DOES NOT COUNT. `shared.append` is irreversible and
            there is no merge, so "3 items" is not enough for a decision the viewer
            cannot take back: each item is named, by the record's own name, and the
            counts ride along in the summary sentence because 20 names is not a thing
            anybody counts by eye.

            🔴 AND IT PROMISES NO ROLLBACK ANYWHERE. `cascadeStoppedNotice` states
            what landed; nothing in this dialog says "abort", "undo" or "revert",
            because nothing in this app can take an appended row back. */}
        <Modal
          opened={
            modal.kind === 'grid-publish' && !!gridPublishRec && modal.deps.length > 0
          }
          /* 🔴 `onClose` IS GATED ON `busy`, AND IT IS THE WHOLE FIX. Measured in
             `@civitai/blocks-react`'s `Modal.js`: Escape, the overlay click AND the ×
             all route through this ONE callback — so a no-op here closes all three
             while the cascade appends. That is wider than an earlier draft of this
             comment claimed (it named only Escape and the overlay).
             ⚠️ `closeOnEscape` IS THEREFORE REDUNDANT DEFENCE, not a second gate, and
             is labelled as such: the no-op `onClose` already stops Escape whatever
             this prop says. Kept to state the ownership at the seam, the same way
             `GridPicker` keeps its own. No test drives Escape or the overlay. */
          onClose={gridPublishBusy ? () => {} : closeModal}
          closeOnEscape={!gridPublishBusy}
          title="Publish this grid"
          size="md"
        >
          {modal.kind === 'grid-publish' && gridPublishRec && modal.deps.length > 0 && (
            <Stack gap={12} data-testid="grid-publish-confirm">
              {/* 🔴 NO EMPTY-DEPS BRANCH, AND IT WAS DELETED RATHER THAN REWORDED. It
                  rendered "Everything this grid lists is already published. Publishing
                  now publishes only the grid." — an inline literal pinned by nothing,
                  and FALSE whenever the grid also held a member nothing could account
                  for. Its stated reason (a cascade whose grid was refused leaves the
                  dialog open with nothing left to cascade) is also gone: the dialog
                  now CLOSES on both outcomes. Rather than fit it with a fresh
                  rationale, the branch is gone and the dialog's `opened` requires a
                  non-empty snapshot, so the state cannot render.

                  🔴 AND NO `grid-publish-unresolved` NODE. An unaccountable member now
                  REFUSES the publish before this dialog can open (`cascadeRefusal`,
                  re-checked at the press), so a disclosure here would be unreachable —
                  the refusal carries that copy instead, on the surface where the
                  viewer can act on it. Round 0 proposed deleting the disclosure
                  outright; it is kept and rewired, which is the stronger reading. */}
              <span style={mutedText} data-testid="grid-publish-summary">
                {cascadeConfirmNotice(gridPublishRec.name || 'Untitled grid', modal.deps)}
              </span>
              <Stack gap={6} data-testid="grid-publish-list">
                {modal.deps.map((dep: CascadeDep) => (
                  <Card key={dep.localId} withBorder padding="sm" data-testid="grid-publish-item">
                    <Group gap={8} align="center">
                      <Badge variant="light">
                        {dep.noun === 'matchup' ? 'Matchup' : 'Prompt'}
                      </Badge>
                      <strong style={{ fontSize: 13 }}>{dep.name}</strong>
                    </Group>
                  </Card>
                ))}
              </Stack>
              <Group justify="flex-end" gap={8}>
                {/* 🔴 DISABLED WHILE THE CASCADE RUNS. Cancel changes MODAL STATE and
                    nothing else — the promise keeps appending — so a live Cancel
                    beside copy that says "Publishing cannot be undone" offered exactly
                    the undo that does not exist. The dialog's own `onClose` is gated
                    the same way, so Escape and the overlay cannot do what the button
                    is stopped from doing. */}
                <Button
                  size="sm"
                  variant="subtle"
                  disabled={gridPublishBusy}
                  onClick={closeModal}
                  data-testid="grid-publish-cancel"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  loading={gridPublishBusy}
                  onClick={() => confirmGridPublish(modal.localId)}
                  data-testid="grid-publish-go"
                >
                  Publish
                </Button>
              </Group>
            </Stack>
          )}
        </Modal>
        {/* 🔴 THE PUBLISHED-GRID EDIT FORM — the SAME `GridForm`, so `validateGrid`
            runs on this path exactly as on the create path and an edit cannot store a
            shape a create could not. Only the store differs: `updateGrid` →
            `shared.update`, author-scoped, key and vote total preserved.

            🔴 BUT ITS PICKERS ARE BOARD-ONLY, AND THAT IS THE SECOND WRITE SITE THE
            PRIVATE-MEMBER FEATURE HAD TO CLOSE. `updateGrid` goes straight to
            `shared.update`: there is no cascade on this path, no "publish the members
            first" step, no `publishRecord`. Handing this form `matchupPickerItems`
            (board PLUS private) would therefore let a viewer add a private matchup to
            an ALREADY-PUBLISHED grid and write its per-viewer LOCAL ID onto the public
            board in one press — and `shared.update` is author-scoped with no history
            and no merge, so that row would name an unresolvable id permanently, for
            every other viewer.
            The PRIVATE grid form above gets the wide lists; this one gets the board.
            Pinned in `src/gridDraftsCascade.test.tsx`, with the private picker's
            offer of the same row as the positive control. */}
        <Modal opened={modal.kind === 'grid'} onClose={closeModal} title="Edit grid" size="lg">
          {modal.kind === 'grid' && (
            <GridForm
              key={modal.edit.key}
              matchupItems={matchupBoardItems}
              promptItems={promptBoardItems}
              initial={gridToInput(modal.edit)}
              submitLabel="Save changes"
              onSubmit={(input) => updateGrid(modal.edit.key, input)}
              onCancel={closeModal}
            />
          )}
        </Modal>
        <Modal
          opened={modal.kind === 'prompt'}
          onClose={closeModal}
          title={modal.kind === 'prompt' && modal.edit ? 'Edit prompt' : 'New Prompt'}
          size="lg"
        >
          {modal.kind === 'prompt' && (
            <PromptForm
              key={modal.edit?.key ?? 'new'}
              initial={modal.edit ? promptToInput(modal.edit) : undefined}
              submitLabel={modal.edit ? 'Save changes' : undefined}
              multiStep={!modal.edit}
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

/**
 * Page the WHOLE shared list (newest-first) into a flat RawSharedItem[].
 *
 * 🔴 THIS IS THE ONE PLACE A SHARED ROW'S `value` IS NARROWED, and it is a
 * deliberate cast rather than a validation. `@civitai/sdk` types `SharedItem.value`
 * as `unknown` on purpose — the row was written by some OTHER viewer's copy of
 * this app, possibly an older or newer one, so its shape is a fact about stored
 * data and not a promise a client can keep — and it instructs callers to narrow at
 * the call site. This app has exactly one read funnel, so "the call site" is here.
 *
 * ⚠ IT IS SAFE BECAUSE THE NEXT LAYER ALREADY DISTRUSTS IT, which is the evidence
 * and not an assumption: every consumer of `RawSharedItem.value.data` goes through
 * `lib/benchmark.ts`'s `parseCombination`/`parsePrompt`/`parseResult` or
 * `lib/grids.ts`'s `parseGrid`, each of which returns `null` for a missing or
 * wrong-typed field rather than trusting the declared type. A row of the wrong
 * shape is dropped there, as it was before the port — the bridge hook's declared
 * `SharedAppendValue` was the same unchecked claim, just made one layer earlier.
 * So do NOT add a second validation here; add it to the parser that is missing it.
 */
async function listAll(
  shared: SharedStore,
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
        value: it.value as SharedStorageValue,
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
