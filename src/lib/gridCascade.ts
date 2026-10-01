// The PURE, node-testable core of PUBLISHING A GRID THAT NAMES PRIVATE MEMBERS
// (spec §11.2, the private-member extension). No React, no SDK hooks, no network.
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
//
// A grid stores MEMBER KEYS, and until now every one of them was a SHARED key
// minted by the host. A viewer can now pick their OWN PRIVATE matchups and
// prompts into a grid, and a private record has no shared key at all — only a
// per-viewer LOCAL id (`draft:v1:<localId>` / `unpub:prompt:v1:<localId>`).
//
// 🔴 SO A GRID CAN HOLD TWO KINDS OF KEY, AND EXACTLY ONE OF THEM MAY REACH THE
// PUBLIC BOARD. A published grid row is world-readable and effectively permanent
// (`shared.update`/`withdraw` are author-scoped and there is no merge), so a row
// naming a local id would be a permanent public reference nobody but its author
// can resolve — and nobody at all can resolve once the private record is gone.
// Publishing a grid therefore has to do two things in one go: PUBLISH the private
// members first, and REWRITE their local ids to the shared keys the host just
// minted.
//
// 🔴 DEPENDENCIES FIRST IS NOT A STYLE CHOICE. `shared.append` is irreversible
// (see `unpublished.ts`'s `publishPointerFailedNotice` for the asymmetry), so the
// order decides what a failure LEAVES BEHIND:
//   - members first, grid last  → a failure leaves public members and a private
//     grid. Nothing on the board is wrong; the viewer retries.
//   - grid first, members last  → a failure leaves a PUBLIC grid pointing at
//     private rows, permanently, with no way to repair it.
// The second outcome cannot be undone by anything this app can call. That is the
// whole reason the planner below emits an ORDERED list and the caller walks it.
//
// 🔴 AND NOTHING HERE PROMISES A ROLLBACK, because none exists. The copy builders
// at the bottom say which items DID publish and what state the grid is in. An
// "aborted" or "rolled back" would be a false claim to the viewer about rows that
// are already public.
//
// ⚠️ WHAT THIS FILE DELIBERATELY DOES NOT DO: decide anything about RESULT rows.
// A result row is keyed `comboKey · configId × promptKey` and is NOT grid-scoped
// (`buildResultPayload` in ./benchmark.ts). A private member is resolved against
// the live BOARD by `resolveGridRows`, which never sees a local id, so a private
// member contributes NO row and NO column to the matrix and therefore cannot be
// part of any cell. That is what keeps a local id out of every result row, and it
// is a property of the resolver rather than of this file — asserted against the
// `shared.append` log, not inferred from here.

import type { GridInput } from './grids.js';

/** Which object kind a dependency is, for the viewer-facing copy and the order. */
export type CascadeNoun = 'matchup' | 'prompt';

/** One private record a grid names and that must publish before the grid does. */
export interface CascadeDep {
  /** The per-viewer local id, which is also the key stored in the grid today. */
  localId: string;
  noun: CascadeNoun;
  /** The record's own name, as the confirm enumerates it. */
  name: string;
}

/**
 * What is known about one axis' candidate members.
 *
 * 🔴 THREE SOURCES, AND THEY ARE NOT INTERCHANGEABLE. A key is a board key, OR a
 * local id with a live private record, OR a local id whose record has already
 * become a pointer (published earlier, possibly in an earlier session). The third
 * is why a retry after a half-finished cascade does the right thing instead of
 * re-publishing: the pointer is DURABLE, this plan is not.
 */
export interface MemberSources {
  /** Shared keys for this axis that the board scan actually read. */
  boardKeys: ReadonlySet<string>;
  /** localId → record name, for records that are STILL private. */
  privateNames: ReadonlyMap<string, string>;
  /** localId → sharedKey, from a stored `PublishedPointer`. */
  pointers: ReadonlyMap<string, string>;
}

/** The plan for one grid publish. */
export interface GridCascadePlan {
  /**
   * The private records to publish, MATCHUPS FIRST then PROMPTS, each axis in
   * AUTHORED order.
   *
   * ⚠️ The axis grouping is not load-bearing and no test should read it as such;
   * what IS load-bearing is that every entry here precedes the grid. The grouping
   * exists so the confirm reads in the same order as the form's two pickers.
   */
  deps: CascadeDep[];
  /**
   * localId → sharedKey already known WITHOUT publishing anything, from a stored
   * pointer. Seeds the map the caller extends as each dependency lands.
   */
  resolved: Map<string, string>;
  /**
   * Member keys that are neither a board key, nor a live private record, nor a
   * pointer.
   *
   * 🔴 CARRIED THROUGH UNCHANGED, which is the EXISTING dangling-reference rule
   * (§11.2 calls a withdrawn member normal) and not a new behaviour: `resolveGrid`
   * already renders what survives and discloses a count. They are reported here
   * only so the confirm can say the grid has members it cannot account for.
   */
  unresolved: string[];
}

function planAxis(
  keys: readonly string[],
  noun: CascadeNoun,
  src: MemberSources,
  out: { deps: CascadeDep[]; resolved: Map<string, string>; unresolved: string[] },
): void {
  for (const key of keys) {
    if (src.boardKeys.has(key)) continue;
    const pointer = src.pointers.get(key);
    if (pointer) {
      out.resolved.set(key, pointer);
      continue;
    }
    const name = src.privateNames.get(key);
    if (name !== undefined) {
      out.deps.push({ localId: key, noun, name });
      continue;
    }
    out.unresolved.push(key);
  }
}

/**
 * Work out what publishing this grid entails.
 *
 * Pure: it reads only the three maps per axis and never touches a store, so the
 * whole decision is node-testable without a DOM or a host.
 */
export function planGridCascade(
  input: GridInput,
  matchups: MemberSources,
  prompts: MemberSources,
): GridCascadePlan {
  const out = { deps: [] as CascadeDep[], resolved: new Map<string, string>(), unresolved: [] as string[] };
  planAxis(input.matchupKeys, 'matchup', matchups, out);
  planAxis(input.promptKeys, 'prompt', prompts, out);
  return out;
}

/**
 * Rewrite a grid's member keys through a localId → sharedKey map.
 *
 * 🔴 THIS IS THE STEP THAT KEEPS A LOCAL ID OFF THE BOARD, and it is applied to
 * the builder INPUT rather than to the built payload: `buildGridPayload` owns the
 * normalisation (order, de-dup, cap) and the moderation split, and a remap done
 * after it would be a second place those rules could be got wrong.
 *
 * A key with no entry in the map passes through unchanged — that covers board
 * keys (the common case) and the dangling references §11.2 calls normal.
 */
export function remapGridKeys(input: GridInput, map: ReadonlyMap<string, string>): GridInput {
  const swap = (k: string): string => map.get(k) ?? k;
  return {
    name: input.name,
    description: input.description,
    matchupKeys: input.matchupKeys.map(swap),
    promptKeys: input.promptKeys.map(swap),
  };
}

// ---------------------------------------------------------------------------
// The viewer-facing copy
// ---------------------------------------------------------------------------

/** English pluralisation for the two nouns this file's copy needs. */
function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "A, B and C" — the enumeration the confirm and both failure notices share. */
export function nameList(names: readonly string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]!}`;
}

/** The counts half of the confirm, per axis, omitting an axis with nothing in it. */
export function cascadeCounts(deps: readonly CascadeDep[]): string {
  const m = deps.filter((d) => d.noun === 'matchup').length;
  const p = deps.filter((d) => d.noun === 'prompt').length;
  const parts: string[] = [];
  if (m > 0) parts.push(plural(m, 'matchup', 'matchups'));
  if (p > 0) parts.push(plural(p, 'prompt', 'prompts'));
  return parts.join(' and ');
}

/**
 * The confirm's sentence.
 *
 * 🔴 IT NAMES THE CONSEQUENCE, NOT THE MECHANISM, and it does NOT offer an undo.
 * Everything this sentence promises is reversible-free: `append` cannot be taken
 * back, so "cannot be undone" is the honest tail and "you can unpublish later"
 * would be a lie about three different objects at once.
 *
 * Pinned as a WHOLE NORMALISED STRING by `src/lib/gridCascade.test.ts` against a
 * literal typed out there, which does not call this builder — a self-derived
 * expectation moves with any reword and certifies whatever it finds.
 *
 * ⚠ PRECONDITION: `deps` is NON-EMPTY. A grid with no private members is
 * published without a confirm at all (there is nothing to disclose and a dialog
 * naming nothing is friction), so the caller branches on `deps.length` before it
 * ever gets here. Called with an empty list the counts clause is empty and the
 * sentence reads wrong — that is a caller bug, not a case to render.
 */
export function cascadeConfirmNotice(gridName: string, deps: readonly CascadeDep[]): string {
  return (
    `Publishing “${gridName}” also publishes ${cascadeCounts(deps)} that are still private, ` +
    `because a public grid cannot point at a private row. ` +
    `They publish first and the grid last. Publishing cannot be undone.`
  );
}

/**
 * The disclosure for member keys {@link planGridCascade} could place NOWHERE.
 *
 * 🔴 IT PROMISES NOTHING AND REMOVES NOTHING. §11.2 calls a dangling member normal
 * (its row was withdrawn by its author) and `normalizeKeys` carries the key into the
 * payload rather than truncating — so this sentence states the consequence the viewer
 * will see and does not claim the key is dropped, because it is not.
 *
 * Pinned as a whole normalised string by `src/lib/gridCascade.test.ts`.
 */
export function cascadeUnresolvedNotice(count: number): string {
  const it = count === 1 ? 'it' : 'them';
  return (
    `${plural(count, 'member', 'members')} of this grid cannot be found — not on the board ` +
    `and not among your private items. Publishing keeps ${it} listed, and the grid renders ` +
    `without ${it}.`
  );
}

/**
 * The honest report for a cascade that STOPPED part-way.
 *
 * 🔴 WHAT IT MAY AND MAY NOT CLAIM. Every item in `published` reached
 * `shared.append` and resolved, so each is public and permanent; nothing in this
 * app can withdraw them on the viewer's behalf (`withdraw` is author-scoped but
 * key-addressed, and the keys live in pointers the viewer never sees). So the
 * notice STATES what happened and stops: no "rolled back", no "aborted", no
 * "nothing was published".
 *
 * TWO BRANCHES, because the viewer's next move differs:
 *   - `stoppedAt` names a DEPENDENCY → that item did not publish, so neither did
 *     the grid. The grid still lists everything it listed before.
 *   - `stoppedAt` is `null` → every dependency published and the GRID itself was
 *     refused. A retry publishes only the grid, because each dependency now has a
 *     stored pointer that {@link planGridCascade} resolves without re-appending.
 *     That claim is true exactly here: a dependency whose POINTER write failed
 *     throws, which puts it in the first branch instead.
 *
 * Both branches are pinned as whole normalised strings by
 * `src/lib/gridCascade.test.ts`, against literals typed out there.
 */
export function cascadeStoppedNotice(spec: {
  gridName: string;
  /** Names of the dependencies that DID publish, in publish order. */
  published: readonly string[];
  /** The dependency that failed, or `null` when the grid itself did. */
  stoppedAt: string | null;
  /** The host's error string. Developer-facing, quoted rather than paraphrased. */
  hostError: string;
}): string {
  const n = spec.published.length;
  const landed =
    n === 0
      ? 'Nothing was published.'
      : `${plural(n, 'item', 'items')} ${n === 1 ? 'was' : 'were'} published and ` +
        `${n === 1 ? 'is' : 'are'} now public and permanent: ${nameList(spec.published)}.`;
  if (spec.stoppedAt !== null) {
    return (
      `${landed} ${spec.stoppedAt} could not be published (${spec.hostError}), so the grid ` +
      `“${spec.gridName}” was not published either — a public grid must not point at a ` +
      `private row. The grid is unchanged and still private.`
    );
  }
  // 🔴 THE "still lists them" CLAUSE IS CONDITIONAL, because with nothing published
  // there is no "them" and the sentence would refer to an empty set. That state is
  // reachable: a cascade whose dependencies all landed and whose grid was then
  // refused leaves a plan with NO dependencies, so a retry that fails again arrives
  // here with an empty `published`.
  const tail =
    n === 0
      ? 'so it is still private.'
      : 'so it is still private and still lists them. Publishing it again will not ' +
        'publish them a second time.';
  return (
    `${landed} The grid “${spec.gridName}” itself could not be published ` +
    `(${spec.hostError}), ${tail}`
  );
}
