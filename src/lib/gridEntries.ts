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

import type { CombinationRow, GridRow, PromptRow } from '../types.js';
import { DEFAULT_TOP_N, topByVotes } from './benchmark.js';
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
  const byMatchup = new Map(combinations.map((r) => [r.key, r] as const));
  const byPrompt = new Map(prompts.map((r) => [r.key, r] as const));
  const { matchupKeys, promptKeys } = entryKeys(entry);

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

/** The one-line structural summary of a grid, as listed. */
export function gridMemberSummary(resolved: ResolvedGridRows): string {
  return `${plural(resolved.matchups.length, 'matchup', 'matchups')} × ${plural(
    resolved.prompts.length,
    'prompt',
    'prompts',
  )}`;
}
