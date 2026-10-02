// The PURE, node-testable core of the Grids VIEW (spec §11.5): what the Top Grid
// is, how Community Grids is ordered, and how a grid's authored member keys are
// resolved against the live board. No React, no SDK hooks, no network.
//
// 🔴 THE ONE ASYMMETRY THIS FILE EXISTS TO HOLD. Community Grids lists two
// genuinely different things:
//
//   - PUBLISHED grids  — real shared rows, with a host-minted key, a vote
//     `count`, an author, and `shared.vote`/`unvote` available on them.
//   - THE TOP GRID     — computed client-side from `topByVotes()` over the
//     matchup and prompt rankings. It is SYSTEM-OWNED: there is no shared row,
//     therefore no key, therefore no vote and no `count`.
//
// §11.5 settles what follows: the Top Grid is PINNED FIRST, outside the vote
// ordering, and labelled as system-owned — rather than given a fake position in
// a ranking it does not participate in. A discriminated union is what makes that
// unfakeable: a system entry HAS no `count` field to sort on, so a future sort
// that tried to include it would not type-check rather than silently inventing 0
// and burying it under every one-vote grid.

import type {
  CombinationRow,
  GridRow,
  PromptRow,
  ResultRow,
  UnpublishedGrid,
} from '../types.js';
import { cellKey, DEFAULT_TOP_N, flattenConfigs, topByVotes } from './benchmark.js';
import { resolveMembers } from './grids.js';

/** The system-owned Top Grid: no shared key, no votes, no author. */
export interface SystemGridEntry {
  system: true;
  matchupKeys: string[];
  promptKeys: string[];
}

/** A published grid row, as listed. */
export interface PublishedGridEntry {
  system: false;
  row: GridRow;
}

/** One row of the Grids list. */
export type GridEntry = SystemGridEntry | PublishedGridEntry;

/**
 * The Top Grid's user-visible name and the words that say it is system-owned.
 * Both live here so a test can pin the WHOLE string: a keyword guard on
 * "system" would be walkable by a reword that quietly re-implies ownership.
 */
export const TOP_GRID_NAME = 'Top Grid';
export const TOP_GRID_NOTE =
  'System grid — the top-voted matchups and prompts, recomputed from the board. ' +
  'Nobody owns it, so it cannot be voted on and it is not part of the vote order below.';

/**
 * Build the Top Grid: the `n` top-voted matchups × the `n` top-voted prompts
 * (§11.5), computed with the SAME `topByVotes()` that orders the Community
 * Matchups and Community Prompts lists — so the three cannot disagree about what
 * "top-voted" means, including the deterministic key tie-break.
 *
 * `n` defaults to `DEFAULT_TOP_N` and is a parameter only so a test can drive a
 * second point; nothing in the app passes anything else.
 */
export function buildTopGrid(
  combinations: CombinationRow[],
  prompts: PromptRow[],
  n: number = DEFAULT_TOP_N,
): SystemGridEntry {
  return {
    system: true,
    matchupKeys: topByVotes(combinations, n).map((r) => r.key),
    promptKeys: topByVotes(prompts, n).map((r) => r.key),
  };
}

/**
 * Community Grids' order: by vote `count` DESCENDING, ties broken by key
 * (lexical), which is exactly `topByVotes`' contract. It is called with the full
 * length rather than a top-N because this list is not truncated — the sort is the
 * whole point, and re-implementing `.sort()` here would be a second copy of the
 * tie-break that stops tracking §7.1 the day that rule moves.
 */
export function orderGridsByVotes(grids: GridRow[]): GridRow[] {
  return topByVotes(grids, grids.length);
}

/**
 * The Community Grids list: the Top Grid FIRST, then the published grids in vote
 * order.
 *
 * 🔴 THE PIN IS OUTSIDE THE SORT, and that is the criterion. The Top Grid has no
 * `count`, so any ordering that included it would have to invent one — and an
 * invented 0 would rank it below every grid with a single vote, asserting a
 * position in a ranking it does not participate in.
 */
export function communityGridEntries(topGrid: SystemGridEntry, grids: GridRow[]): GridEntry[] {
  return [topGrid, ...orderGridsByVotes(grids).map((row): GridEntry => ({ system: false, row }))];
}

/**
 * The system entry's identity as a non-null string.
 *
 * 🔴 EXPORTED SO THE SENTINEL IS WRITTEN DOWN EXACTLY ONCE. It was a literal inside
 * {@link entryDomKey}, which was enough while that function was the only thing that
 * needed it; `App` now has to name the same value when it tells `GridsView` which
 * LISTED entry is open (see `GridsView.openKey`), and a second spelling of it is a
 * silently-unfindable card. Read by tests and by the card-lookup helpers too.
 */
export const SYSTEM_GRID_DOM_KEY = '__system__';

/**
 * ONE SPELLING OF "WHICH LISTED CARD IS THIS", as a non-null string — the React key,
 * the card's `data-key`, and the value `GridsView`'s open-filter compares.
 *
 * 🔴 IT EXISTS BECAUSE THE SAME TERNARY WAS OPEN-CODED THREE TIMES IN `GridsView`, in
 * three different shapes — one for the card's React/`data-key`, one for the Open
 * callback, and `entry.system ? openKey !== null : entry.row.key !== openKey` for the
 * list filter. All three answered one question, and a predicate open-coded at N sites is
 * typically wrong at N−1 of them. The filter is the one that matters: it decides whether
 * the OPEN grid is ALSO listed, i.e. whether the same grid renders twice.
 *
 * 🔴 IT IS TOTAL ON EVERY LISTABLE ENTRY, WHICH IS LOAD-BEARING RATHER THAN incidental:
 * because no entry maps to `null`, `null` is free to mean "no listed entry at all",
 * which is what the open-filter needs now that a grid OUTSIDE the list (a private one)
 * can be the open one.
 *
 * ⚠️ IT REPLACED AN `entryOpenKey` THAT RETURNED `string | null` WITH `null` FOR THE
 * SYSTEM ENTRY, and that function is DELETED rather than kept beside this one. Its
 * `null` and the filter's `null` were two different facts in one value, which is the
 * collision this round closed; and once the Open callback took an {@link OpenGridRef}
 * (see {@link entryOpenRef}) it had no caller left. Two identity encodings in one
 * component is the shape that produced the collision in the first place.
 */
export function entryDomKey(entry: GridEntry): string {
  return entry.system ? SYSTEM_GRID_DOM_KEY : entry.row.key;
}

/**
 * THE SAME ENTRY AS THE REFERENCE `App` HOLDS — what the Open callback passes up.
 *
 * 🔴 A TAGGED REFERENCE RATHER THAN A KEY, so `GridsView` names no identity of its own
 * and `App` needs no adapter: `onOpen` IS `setOpenGridRef`. It replaced a `string | null`
 * callback whose `null` meant the Top Grid, which forced an adapter in `App` that read
 * the same `null` the open-filter uses for "nothing in this list is open".
 *
 * ⚠️ IT ANSWERS A DIFFERENT QUESTION FROM {@link entryDomKey} AND THAT IS WHY BOTH
 * EXIST. This one is "which grid should be open", a value that outlives the list and
 * must survive a private grid being open; that one is "which card is this in the DOM".
 * They return different types to different consumers, and neither is derived from the
 * other — a derivation is what let the old pair share a `null`.
 */
export function entryOpenRef(entry: GridEntry): OpenGridRef {
  return entry.system ? { kind: 'system' } : { kind: 'published', key: entry.row.key };
}

/** The authored member keys of either kind of entry, in authored order. */
export function entryKeys(entry: GridEntry): { matchupKeys: string[]; promptKeys: string[] } {
  return entry.system
    ? { matchupKeys: entry.matchupKeys, promptKeys: entry.promptKeys }
    : { matchupKeys: entry.row.data.matchupKeys, promptKeys: entry.row.data.promptKeys };
}

/** A grid resolved against the live board: the rows that survive, and how many
 * authored members are gone. */
export interface ResolvedGridRows {
  /** Surviving matchup rows, in AUTHORED order. */
  matchups: CombinationRow[];
  /** Surviving prompt rows, in AUTHORED order. */
  prompts: PromptRow[];
  /** Authored matchup keys with no row on the board. Never folded into a length. */
  missingMatchups: number;
  /** Authored prompt keys with no row on the board. */
  missingPrompts: number;
  /** Missing across BOTH axes — the one number the honest notice leads with. */
  missingTotal: number;
  /** Authored members across both axes, present and missing together. */
  authoredTotal: number;
}

/**
 * Resolve a grid's authored member keys against the rows currently on the board
 * (acceptance criterion 8, spec §11.2).
 *
 * 🔴 DANGLING REFERENCES ARE NORMAL, NOT EXCEPTIONAL. A grid names keys whose
 * rows another author may `withdraw` at any time and the grid's author cannot
 * repair another author's row. So this never throws and never silently shrinks:
 * it returns what survives, in authored order, alongside a COUNT of what is gone
 * so the caller can disclose the gap. A quietly-shrinking grid is the same class
 * of lie as the §7.2 truncation this app already discloses.
 *
 * ⚠ It resolves EACH AXIS AGAINST ITS OWN ROW SET, via `resolveMembers` — not via
 * `resolveGrid`, whose single `available` set is the right shape for one flat
 * board but would let a PROMPT key satisfy a matchup slot (and vice versa) and so
 * report a member present that can render no row. `resolveGrid` is built out of
 * two `resolveMembers` calls; this is the same rule applied per axis.
 */
export function resolveGridRows(
  entry: GridEntry,
  combinations: CombinationRow[],
  prompts: PromptRow[],
): ResolvedGridRows {
  const { matchupKeys, promptKeys } = entryKeys(entry);
  return resolveMemberRows(matchupKeys, promptKeys, combinations, prompts);
}

/**
 * The same resolution from BARE KEY LISTS, for a grid that has no entry because it
 * has no shared row yet — i.e. one still in the per-viewer store.
 *
 * 🔴 IT IS THE BODY OF {@link resolveGridRows}, NOT A SECOND COPY OF IT. A private
 * grid card renders a thumbnail strip, which needs the same row-major cell order
 * the published cards use (`gridPreviewIds` consumes this shape), and a second
 * resolver would be the "predicate open-coded at N sites" shape this file's own
 * {@link entryDomKey} docblock exists to warn about. `resolveGridRows` delegates here.
 *
 * ⚠️ A PRIVATE MEMBER RESOLVES AS *MISSING* HERE, AND THAT IS CORRECT RATHER THAN A
 * GAP. A private matchup or prompt has only a per-viewer LOCAL id and no row on the
 * board, so it genuinely contributes no row and no column — which is exactly what
 * keeps a local id out of every cell identity, and therefore out of every result
 * row (`buildResultPayload` keys on `comboKey · configId × promptKey`).
 *
 * 🔴 SO THE CALLER MUST NOT RENDER {@link missingMembersNotice} FROM THIS. That
 * sentence attributes a complete-scan absence to "their authors removed them",
 * which for the viewer's OWN private member is false — it is sitting in their own
 * storage waiting to be published. The private grid card deliberately shows the
 * preview and no missing notice; `MyGridsView` says so at the call site.
 */
export function resolveMemberRows(
  matchupKeys: readonly string[],
  promptKeys: readonly string[],
  combinations: CombinationRow[],
  prompts: PromptRow[],
): ResolvedGridRows {
  const byMatchup = new Map(combinations.map((r) => [r.key, r] as const));
  const byPrompt = new Map(prompts.map((r) => [r.key, r] as const));

  const m = resolveMembers(matchupKeys, new Set(byMatchup.keys()));
  const p = resolveMembers(promptKeys, new Set(byPrompt.keys()));

  return {
    matchups: m.present.map((k) => byMatchup.get(k)!),
    prompts: p.present.map((k) => byPrompt.get(k)!),
    missingMatchups: m.missing,
    missingPrompts: p.missing,
    missingTotal: m.missing + p.missing,
    authoredTotal: matchupKeys.length + promptKeys.length,
  };
}

/** English pluralisation for the one noun pair this file's copy needs. */
function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * The honest disclosure for a grid with dangling references (criterion 8).
 *
 * 🔴 It names BOTH the missing count AND the authored total, because the missing
 * count alone does not tell a reader how much of the grid they are looking at —
 * "2 members are gone" reads very differently against 4 authored members than
 * against 40. `null` when nothing is missing, so the caller renders no notice at
 * all rather than a reassuring "0 missing" nobody reads.
 *
 * 🔴 `boardTruncated` DECIDES WHICH CAUSE MAY BE NAMED, and it is the whole
 * reason this takes a second argument. "Missing" is computed by set difference
 * against the rows the scan actually READ, so it has (at least) two causes and
 * the resolver cannot tell them apart:
 *
 *   - the member's row really was WITHDRAWN by its author (§11.2 calls this
 *     normal), or
 *   - the BOARD SCAN never reached it — `listAll` caps at `LIST_PAGE` ×
 *     `MAX_PAGES` rows, and a row past that cap is simply unread. (A row whose
 *     `data` fails to parse lands here too: `splitRows` skips it silently.)
 *
 * The sentence used to assert the first unconditionally — "their authors removed
 * them" — which on an over-cap board is a claim about other people's actions
 * that the app has no evidence for, and it points the reader at the wrong
 * remedy. Attribute removal ONLY when the scan was complete; when it was not,
 * say the members may simply not have been read. Same honesty rule as the
 * `board-truncated-notice` this app already renders.
 *
 * ⚠ `boardTruncated: false` is NOT "definitely withdrawn" either — an unparseable
 * row still reads as missing. What it buys is that the app READ everything it
 * could, which is the strongest claim available.
 *
 * 🔴 SO A RESIDUAL UNSUPPORTED CLAIM REMAINS, AND THIS SAYS SO RATHER THAN
 * CLOSING OVER IT. On the complete-scan branch the copy attributes removal ("no
 * longer on the board"), and for the unparseable case named two paragraphs above
 * that IS an assertion about a row nobody can see: the row is on the board; the
 * app merely could not read it. An earlier draft of this docstring ended by
 * saying the copy asserts nothing about such a row — which was itself false, for
 * exactly the case it had just named. What the `boardTruncated` split did was
 * NARROW the unsupported claim, from "every missing member, including everything
 * past a page cap" (routine, and the common case on a busy board) to "a member
 * whose `data` blob does not parse" (rare, and an app-shape failure). It did not
 * eliminate it.
 *
 * 🔴 THAT NARROWING WAS FALSE FOR ONE RANGE, AND SAYING SO IS THE POINT OF THIS
 * PARAGRAPH. While `App` derived `boardTruncated` as `boardRead === 'truncated'`, a
 * board over the page cap loaded as a prefix and then ANY routine reload whose
 * `list()` threw flipped the flag to `false` — with `items` untouched and still
 * holding that prefix, because the catch arm never calls `setItems`. Every member
 * past the cap then arrived here on the complete-scan branch and was reported as
 * REMOVED BY ITS AUTHOR: exactly the broad, routine claim the split was supposed to
 * have narrowed away. `App` now keeps the prefix bit as a property of `items` rather
 * than of the latest request, and `boardTruncation.test.tsx` drives the
 * truncated-then-thrown sequence. The narrowing above is accurate again; it was not
 * for the length of that range.
 *
 * ⚠️ WHAT IT STILL DOES NOT COVER, stated because the sibling DOES cover it: this
 * function takes a truncation boolean and nothing else, so it cannot tell a COMPLETE
 * snapshot from a complete-but-STALE one (the latest read threw). It says "their
 * authors removed them" in that window. That reading is supportable — the member was
 * genuinely absent when the snapshot was taken — but it is NOT the same claim
 * `cascadeRefusal` makes, and that function's docblock retracts an earlier sentence
 * asserting the two residuals were equivalent.
 *
 * Eliminating it needs `splitRows` to report the keys it SKIPPED, so the resolver
 * can tell "unread" from "unreadable" and say a third thing. That is a change to
 * the scan's return shape and is deliberately not made here.
 */
export function missingMembersNotice(
  resolved: ResolvedGridRows,
  boardTruncated = false,
): string | null {
  if (resolved.missingTotal <= 0) return null;
  const parts: string[] = [];
  if (resolved.missingMatchups > 0) parts.push(plural(resolved.missingMatchups, 'row', 'rows'));
  if (resolved.missingPrompts > 0) parts.push(plural(resolved.missingPrompts, 'column', 'columns'));
  const head = `${resolved.missingTotal} of this grid's ${resolved.authoredTotal} members (${parts.join(', ')}) `;
  return boardTruncated
    ? head +
        'could not be found on the board — but this board has more entries than the app ' +
        'can load at once, so they may simply not have been read rather than removed. ' +
        'Everything else below still renders; nothing was quietly dropped.'
    : head +
        'are no longer on the board — their authors removed them. ' +
        'Everything else below still renders; nothing was quietly dropped.';
}

/**
 * How many thumbnails a grid card's inline preview shows.
 *
 * 🔴 IT IS A READ BUDGET, not a layout number. Every id in the strip is part of
 * ONE batched `getImages` call per card (see `components/GridPreview.tsx`), and
 * the host rate-limits gated reads at 150 per 10 seconds per block instance. Six
 * is enough to tell two grids apart at a glance; the count of what is NOT shown
 * is disclosed rather than dropped.
 */
export const GRID_PREVIEW_MAX = 6;

/**
 * The image ids a grid card's preview strip should read, in row-major cell order
 * (config rows × prompt columns, the same order the matrix renders).
 *
 * 🔴 AN UNRUN CELL CONTRIBUTES NOTHING. There is no result row for it, therefore
 * no image id, therefore no read — which is what makes a grid of empty cells cost
 * ZERO gated reads rather than one per cell. Returned alongside the UNCAPPED
 * total so the caller can disclose that the strip is a subset instead of quietly
 * showing six of forty.
 *
 * Pure, so the budget is node-testable without a DOM: the component it feeds only
 * decides *when* to issue the one read, never *how many* ids are in it.
 *
 * ⚠️ NO `cap` PARAMETER — {@link GRID_PREVIEW_MAX} is read directly. It took one
 * with a default and a `Math.max(cap, 0)` clamp against a negative that no caller
 * could supply: there is one call site, it passes two arguments, and no test ever
 * passed a third. An overridable budget reads as a knob someone is entitled to turn,
 * and the clamp read as a guard against a reachable input. Neither was true.
 */
export function gridPreviewIds(
  resolved: ResolvedGridRows,
  byCell: Map<string, ResultRow>,
): { ids: number[]; total: number } {
  const all: number[] = [];
  for (const row of flattenConfigs(resolved.matchups)) {
    for (const prompt of resolved.prompts) {
      const result = byCell.get(cellKey(row.comboKey, row.config.id, prompt.key));
      if (!result) continue;
      all.push(...result.data.imageIds);
    }
  }
  return { ids: all.slice(0, GRID_PREVIEW_MAX), total: all.length };
}

// ===========================================================================
// THE OPEN GRID — a SUPERSET of `GridEntry`, because the open panel can show a
// grid that is not listed anywhere.
// ===========================================================================

/**
 * What the open panel is showing.
 *
 * 🔴 THREE KINDS, AND `GridEntry` CAN ONLY SPELL TWO. The Grids LIST holds the
 * system Top Grid and published rows, which is exactly {@link GridEntry}. The open
 * PANEL can additionally show a grid that has no shared row at all because it is
 * still in the viewer's own per-viewer KV — an {@link UnpublishedGrid} with a LOCAL
 * id and no key, no `count` and no author. A viewer asked to be able to generate
 * into such a grid before publishing it, and the panel is where that happens.
 *
 * 🔴 IT IS A SEPARATE TYPE RATHER THAN A THIRD ARM OF `GridEntry`, DELIBERATELY.
 * `GridEntry`'s discriminant is `system: true | false`, and every consumer of it
 * narrows with `entry.system ? … : entry.row` — including `lib/gridCascade.ts`'s
 * neighbours, `GridsView`, `MyGridsView` and `communityGridEntries`. A third arm
 * spelled `system: false` would make `entry.row` a lie that still TYPE-CHECKS at
 * each of those sites. Widening only the panel's own type leaves the list's type
 * exactly as narrow as the list actually is.
 *
 * 🔴 `kind` RATHER THAN A BOOLEAN, so adding a fourth state is a compile error at
 * every `switch` below rather than a silently-taken `else` branch.
 */
export type OpenGrid =
  /** The system Top Grid: computed members, no shared row. */
  | { kind: 'system'; matchupKeys: readonly string[]; promptKeys: readonly string[] }
  /** A published grid row — votable, withdrawable, reportable. */
  | { kind: 'published'; row: GridRow }
  /** This viewer's PRIVATE grid, straight out of per-viewer KV. No shared row. */
  | { kind: 'private'; rec: UnpublishedGrid };

/**
 * A REFERENCE to whatever is open — what `App` holds in state, as distinct from the
 * resolved {@link OpenGrid} it renders.
 *
 * 🔴 A REFERENCE RATHER THAN THE OBJECT, because both referents can disappear under
 * the panel: a published row can be withdrawn by its author in another tab, and a
 * private record is retired the instant it publishes. Re-resolving every render is
 * what lets the panel fall back instead of pinning a stale copy.
 *
 * 🔴 AND TAGGED RATHER THAN A BARE `string | null`, which is what it replaced. A
 * per-viewer LOCAL id and a host-minted SHARED key are both strings and nothing in
 * either one's TEXT distinguishes them (a shared key's real shape is not verified
 * anywhere in this repo — see `cascadeRefusal`). An untagged slot therefore looked a
 * local id up among the published rows, found nothing, and silently showed the Top
 * Grid: a dead Open button with no error anywhere.
 */
export type OpenGridRef =
  | { kind: 'system' }
  | { kind: 'published'; key: string }
  | { kind: 'private'; localId: string };

/** {@link buildTopGrid}'s result as an {@link OpenGrid}. */
export function openSystemGrid(top: SystemGridEntry): OpenGrid {
  return { kind: 'system', matchupKeys: top.matchupKeys, promptKeys: top.promptKeys };
}

/**
 * The authored member keys of whatever is open, in authored order.
 *
 * 🔴 MODULE-PRIVATE. It was exported, and {@link resolveOpenGrid} — in this same file —
 * was its only consumer; a second, test-only call site is what made it look like part of
 * the module's surface. An export is a licence for a caller to resolve a grid's members
 * some other way, which is the one thing this file's whole private-grid argument rests on
 * NOT happening (see {@link resolveOpenGrid}). Its three-kind coverage now lives on the
 * resolver's own node case, where the claim is about the keys that reach the matrix
 * rather than about an intermediate shape.
 */
function openGridKeys(open: OpenGrid): {
  matchupKeys: readonly string[];
  promptKeys: readonly string[];
} {
  switch (open.kind) {
    case 'system':
      return { matchupKeys: open.matchupKeys, promptKeys: open.promptKeys };
    case 'published':
      return open.row.data;
    case 'private':
      return open.rec;
  }
}

/**
 * The open grid's members resolved against the live board.
 *
 * 🔴 IT DELEGATES TO {@link resolveMemberRows}, THE SAME BODY `resolveGridRows`
 * USES, AND THAT IS THE LOAD-BEARING PART OF THE WHOLE PRIVATE-GRID FEATURE. A
 * private grid may name the viewer's own private matchups and prompts, which carry
 * only a per-viewer LOCAL id. `resolveMemberRows` resolves against the BOARD, so such
 * a member has no row, contributes NO row and NO column, and therefore cannot be part
 * of any cell — and a cell's identity (`comboKey · configId × promptKey`,
 * `buildResultPayload`) is what every result row is written under. Opening a private
 * grid therefore creates NO new path by which a local id can reach `shared.append`:
 * the matrix it renders is built from board rows only, by construction rather than by
 * a check. See `lib/gridCascade.ts`'s header for the boundary this preserves.
 *
 * ⚠️ SO THE CALLER MUST NOT RENDER {@link missingMembersNotice} FOR A PRIVATE GRID —
 * see {@link privateGridShortfall}, which exists for exactly that reason.
 */
export function resolveOpenGrid(
  open: OpenGrid,
  combinations: CombinationRow[],
  prompts: PromptRow[],
): ResolvedGridRows {
  const { matchupKeys, promptKeys } = openGridKeys(open);
  return resolveMemberRows(matchupKeys, promptKeys, combinations, prompts);
}

/** The display name for whatever is open. One spelling, read by the panel. */
export function openGridName(open: OpenGrid): string {
  switch (open.kind) {
    case 'system':
      return TOP_GRID_NAME;
    case 'published':
      return open.row.name || 'Untitled grid';
    case 'private':
      return open.rec.name || 'Untitled grid';
  }
}

/**
 * The shortfall sentence for an open PRIVATE grid, or `null` when nothing is short.
 *
 * 🔴 IT NAMES NO CAUSE, AND THAT IS THE ENTIRE DIFFERENCE FROM
 * {@link missingMembersNotice}. That sentence's complete-scan arm says the missing
 * members' "authors removed them" — which about the viewer's OWN private matchup is
 * simply false: it is sitting in their own storage waiting to be published. A private
 * grid's shortfall has (at least) three causes and this function can tell NONE of them
 * apart: a member is the viewer's own private record, or its row was withdrawn by its
 * author, or the board scan never read it. So it states the arithmetic and the RULE,
 * and attributes nothing.
 *
 * 🔴 IT IS ALSO WHY OPEN DOES NOT REFUSE. A grid row that reports missing members
 * (`grid-card-missing`) still OPENS and still renders what resolves — the same
 * decision `resolveGridRows` makes for every published grid, and the same one
 * `MyGridsView`'s private CARD already makes when it shows a preview strip built from
 * board members only. Refusing would hide a working matrix because one member of it is
 * private, which is the normal state of a grid the viewer is still assembling.
 *
 * ⚠️ IT TAKES NO `boardTruncated`, deliberately: with the cause unattributed there is
 * nothing for the flag to switch between. The truncation disclosure a viewer needs in
 * that state is the page-level `board-truncated-notice`, which is unchanged.
 *
 * 🔴 THE RULE CLAUSE USED TO BE FALSE ON A TRUNCATED SCAN, AND THE DECISION IS TO FIX
 * THE SENTENCE RATHER THAN LEAN ON THAT PAGE-LEVEL NOTICE. It read "Only members with a
 * row on the shared board can be [in the matrix]" — and on a scan that hit `listAll`'s
 * page cap a member DOES have a row and is still excluded, which is exactly why
 * {@link missingMembersNotice} carries a dedicated truncated arm. The rule is now stated
 * over the rows the app HAS READ, which is what makes it survive the TRUNCATED case that
 * falsified the old wording. ⚠️ IT DOES NOT MAKE THE RULE UNIVERSALLY TRUE, AND A DRAFT
 * OF THIS PARAGRAPH SAID IT DID — "true on a complete scan and on a truncated one" is
 * refuted by the very next sentence, so A COMPLETE SCAN IS NOT A SAFE CASE EITHER:
 * SCAN-COMPLETENESS AND PARSEABILITY ARE ORTHOGONAL, and the rule is false for an
 * unparseable row on EVERY scan, complete or not.
 * ⚠️ AND THAT IS THE WHOLE OF THE CLAIM — IT USED TO ADD "and for a row whose
 * `data` does not parse", WHICH IS FALSE. `splitRows` (./benchmark.ts) SKIPS a row it
 * cannot parse, so that row WAS read and the matrix is still not built from it: both
 * halves of the sentence fail for that member, and neither named cause applies to it
 * either. Covering it would need "read AND UNDERSTOOD", and the user-facing string is
 * deliberately NOT being widened for a case no viewer can act on — so the gap is
 * recorded here instead. 🔴 AND THE TWO NAMED CAUSES ARE EXAMPLES
 * RATHER THAN A CLOSED LIST — the dash is what makes that readable, and it is the half
 * that matters: a two-item list introduced by "Only … can be:" reads as exhaustive while
 * this function's own docblock names a third cause. Enumerating all three would put a
 * "may simply not have been read yet" in front of every viewer whose scan WAS complete,
 * which is the claim-without-evidence the sibling's `boardTruncated` flag exists to
 * avoid; the two named here are the two the viewer can act on.
 *
 * 🔴 AND THE REASSURANCE CLAUSE IS CONDITIONAL ON THERE BEING SOMETHING BELOW. "Everything
 * else below still renders" is FALSE for an all-private grid — the commonest first state
 * of this feature — where nothing resolves, the matrix is empty, and what renders below is
 * `ResultsGrid`'s empty state. A sentence promising a remainder over an empty matrix is the
 * same class of lie the clause exists to deny, so it is DROPPED rather than reworded: there
 * is no honest short way to say "nothing was dropped, and also nothing is there".
 */
export function privateGridShortfall(resolved: ResolvedGridRows): string | null {
  if (resolved.missingTotal <= 0) return null;
  /** Is there a matrix below at all? Both axes must be non-empty for a cell to exist. */
  const hasMatrix = resolved.matchups.length > 0 && resolved.prompts.length > 0;
  return (
    `${resolved.missingTotal} of this grid's ${resolved.authoredTotal} members are not in the ` +
    'matrix below. The matrix is built from the rows the app has read off the shared board, ' +
    'so a member with no such row is left out — your own private matchups and prompts until ' +
    'you publish them, and a member another author withdrew.' +
    (hasMatrix ? ' Everything else below still renders; nothing was quietly dropped.' : '')
  );
}

/** The one-line structural summary of a grid, as listed. */
export function gridMemberSummary(resolved: ResolvedGridRows): string {
  return `${plural(resolved.matchups.length, 'matchup', 'matchups')} × ${plural(
    resolved.prompts.length,
    'prompt',
    'prompts',
  )}`;
}
