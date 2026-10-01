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
   * pointer — i.e. keys this app cannot POSITIVELY ACCOUNT FOR.
   *
   * 🔴 A NON-EMPTY `unresolved` NOW REFUSES THE PUBLISH. See {@link cascadeRefusal}
   * and the paragraph on its own docblock: before private members existed this
   * bucket could only hold a WITHDRAWN SHARED KEY, which §11.2 calls normal and
   * which `normalizeKeys` correctly carries into the payload. It is now ALSO where
   * an unaccountable per-viewer LOCAL ID lands, and three measured paths reach it
   * with no error at all. Nothing in a key's text distinguishes the two cases —
   * a shared key's real shape is not verified anywhere in this repo — so the
   * boundary refuses both rather than guessing.
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
 * 🔴 THE PUBLISH BOUNDARY: may this grid go to `shared.append` at all?
 *
 * Returns `null` to proceed, or the viewer-facing REFUSAL. One predicate, called by
 * BOTH publish entry points (the direct no-dependency publish and the cascade's own
 * press), so there is no second copy to disagree with this one.
 *
 * ── WHY IT REFUSES RATHER THAN DISCLOSES, AND WHAT IT COSTS ────────────────
 *
 * 🔴 THE HAZARD. A grid's member list is written to a shared row that is
 * world-readable and effectively permanent (`shared.update`/`withdraw` are
 * author-scoped, no merge, no history). A per-viewer LOCAL ID on that row is
 * unresolvable by every other viewer — and, once the private record behind it is
 * gone, by its own author too. THREE measured paths put one there with no error:
 *
 *   A. the viewer DISCARDS a private matchup the grid names (nothing prunes it from
 *      any grid), then presses Publish;
 *   B. a dependency's POINTER write is refused, so `publishRecord` deletes the
 *      private record after appending — on a retry the id is in neither the private
 *      names nor the pointers;
 *   C. 🔴 THE INVERSION, AND THE WORST OF THE THREE: the `draft:v1:` prefix listing
 *      THROWS. `App` swallows that best-effort so the public board cannot be taken
 *      down by a KV failure, the grid's OWN prefix reads fine, and the grid is
 *      therefore listed and publishable WHILE its private member is invisible to the
 *      planner. That path FAILED OPEN. `lib/kv.ts` already carries a 🔴 saying
 *      truncation "is not uniformly harmless… for one of them it is a MONEY
 *      decision", which is why `forEachStoredKey` RETURNS `{truncated, pages}` — and
 *      all three private-record scans discarded it. `scanComplete` below is that
 *      report, finally read.
 *
 * 🔴 WHY NOT A PREFIX TEST ON `draft_` / `unpubprompt_`. That is a SPELLED guard: it
 * passes while the hazard exists in a different shape, and it rests on a claim this
 * repo has never verified — what a host-minted shared key actually looks like. The
 * boundary tests the STATE (is this key in one of the three buckets?) and not the
 * key's text.
 *
 * ⚠️ AND IT HAS A REAL COST, STATED RATHER THAN HIDDEN: a grid one of whose members
 * was WITHDRAWN by its author can no longer be published until the author removes it
 * from the grid. That was publishable before this change, and §11.2 calls a dangling
 * member normal. Nothing in a key's text separates "withdrawn shared key" from
 * "unaccountable local id", so the choice is between an annoyance with a clear
 * remedy (edit the grid; the form already renders such a member as "No longer on the
 * board") and a permanent, unfixable public row. It is NOT symmetric, so it is not a
 * close call — but it IS a behaviour change on a path that worked, and a reader
 * deserves to see that written down.
 *
 * ⚠️ WHAT IT DOES NOT TOUCH: `updateGrid`, i.e. editing an ALREADY-PUBLISHED grid.
 * Those member keys are already public, and that form's pickers are board-only so a
 * local id cannot be added. §11.2's carry-through is unchanged there.
 *
 * 🔴 `scanComplete` CHANGES ONLY THE MESSAGE, AND THAT IS DELIBERATE. Per-key
 * positive accounting is what makes the refusal safe: `deps` and `resolved` both
 * mean a record was actually READ, so a key in either is accountable whatever the
 * scan did. An incomplete scan can only push an accountable key INTO `unresolved`,
 * which refuses. What the flag buys is an honest CAUSE: "this member is gone" and
 * "this app could not read your private items" are different sentences, and only one
 * of them is true at a time.
 */
export function cascadeRefusal(spec: {
  gridName: string;
  plan: GridCascadePlan;
  /** Were BOTH private-record scans known complete — neither thrown nor truncated? */
  scanComplete: boolean;
  /** Did the board scan hit its page cap? Decides whether "not on the board" may be said. */
  boardTruncated: boolean;
}): string | null {
  const n = spec.plan.unresolved.length;
  if (n === 0) return null;
  const head = `${plural(n, 'member', 'members')} of “${spec.gridName}” cannot be accounted for`;
  const tail =
    `Publishing is refused rather than putting ${n === 1 ? 'a key' : 'keys'} on the public ` +
    `board that nobody — including you — could resolve afterwards.`;
  if (!spec.scanComplete) {
    return (
      `${head}, because this app could not read all of your private items. It therefore ` +
      `cannot tell whether ${n === 1 ? 'it is' : 'they are'} yours and unpublished, or simply ` +
      `gone. ${tail} Reload and try again.`
    );
  }
  if (spec.boardTruncated) {
    return (
      `${head}: ${n === 1 ? 'it is' : 'they are'} not among your private items, and not in ` +
      `the part of the board this app could read — this board has more entries than one load ` +
      `fetches. ${tail} Reload and try again, or edit the grid and remove ` +
      `${n === 1 ? 'it' : 'them'}.`
    );
  }
  return (
    `${head}: ${n === 1 ? 'it is' : 'they are'} not on the board and not among your private ` +
    `items. ${tail} Edit the grid and remove ${n === 1 ? 'it' : 'them'}.`
  );
}

/**
 * "N items were published and are now public and permanent: A and B." — or
 * "Nothing was published."
 *
 * 🔴 EXPORTED BECAUSE A FOURTH OUTCOME REUSES IT AND MUST NOT RE-TYPE IT. When the
 * GRID's own append lands and the GRID's pointer write is then refused, the honest
 * report is the dependencies' sentence followed by `publishPointerFailedNotice`'s
 * EXISTING, already-pinned grid sentence — the grid IS public, so the `stoppedAt:
 * null` arm below (which says the grid "is still private") would be false. The
 * caller composes the two; this is the half that is shared.
 */
export function cascadeLandedSentence(published: readonly string[]): string {
  const n = published.length;
  return n === 0
    ? 'Nothing was published.'
    : `${plural(n, 'item', 'items')} ${n === 1 ? 'was' : 'were'} published and ` +
        `${n === 1 ? 'is' : 'are'} now public and permanent: ${nameList(published)}.`;
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
 * THREE BRANCHES, because the viewer's next move differs — and the THIRD was added
 * after the second's docblock was found asserting something false:
 *
 *   - `{ appended: false }` → that dependency's `append` was REFUSED, so neither it
 *     nor the grid is public. The grid still lists everything it listed before.
 *   - `{ appended: true }`  → that dependency's `append` LANDED and its pointer write
 *     did not. Its row is public and permanent, and it is named in `published`; what
 *     the viewer lost is their own handle on it. 🔴 THIS BRANCH EXISTS BECAUSE THE
 *     PREVIOUS VERSION ROUTED THIS CASE INTO THE FIRST ONE, which reported "Nothing
 *     was published." about exactly such a row — a sentence that contradicts itself
 *     inside one paragraph.
 *   - `null` → every dependency published and the GRID's own `append` was refused. A
 *     retry publishes only the grid, because each dependency now has a stored pointer
 *     that {@link planGridCascade} resolves without re-appending.
 *
 * ⚠️ AND A FOURTH OUTCOME IS DELIBERATELY NOT HERE. When the GRID's append lands and
 * the GRID's pointer write is then refused, the grid IS public — so none of the
 * branches above may be used, every one of them says it is still private. The caller
 * composes {@link cascadeLandedSentence} with `publishPointerFailedNotice`'s existing
 * grid sentence instead, which is the one place that copy lives.
 *
 * Every branch is pinned as a whole normalised string by
 * `src/lib/gridCascade.test.ts`, against literals typed out there.
 */
export function cascadeStoppedNotice(spec: {
  gridName: string;
  /**
   * Names of the dependencies whose row is now PUBLIC, in publish order.
   *
   * 🔴 THAT IS "PUBLIC", NOT "FULLY SUCCEEDED", and the difference is the bug this
   * field's meaning was changed to fix. A dependency whose `append` landed and whose
   * POINTER write was then refused is public and permanent; the caller puts it in
   * here and sets `stoppedAt.appended`. Counting it as a failure produced "Nothing
   * was published." in the same sentence as a host error about a row the append log
   * proves is on the board.
   */
  published: readonly string[];
  /**
   * What stopped the cascade:
   *   - `null` — every dependency landed and the GRID's own `append` was refused.
   *   - `{ appended: false }` — this dependency's `append` was refused. It is NOT in
   *     `published`.
   *   - `{ appended: true }` — this dependency's `append` LANDED and its pointer
   *     write did not. It IS in `published`, and the copy says which half failed.
   */
  stoppedAt: null | { name: string; appended: boolean };
  /** The host's error string. Developer-facing, quoted rather than paraphrased. */
  hostError: string;
}): string {
  const landed = cascadeLandedSentence(spec.published);
  if (spec.stoppedAt !== null && spec.stoppedAt.appended) {
    // 🔴 THE HALF-PUBLISHED DEPENDENCY. Its row is public (so it is named in
    // `landed`); what failed is the per-viewer handle on it. The grid is refused
    // because that member can no longer be accounted for from this viewer's own
    // storage — the same boundary `cascadeRefusal` enforces, reached from inside.
    return (
      `${landed} But ${spec.stoppedAt.name}'s own private copy could not be updated with ` +
      `its key (${spec.hostError}), so you have no stored handle on that row. The grid ` +
      `“${spec.gridName}” was not published — a public grid must not point at a member this ` +
      `app can no longer account for. The grid is unchanged and still private.`
    );
  }
  if (spec.stoppedAt !== null) {
    return (
      `${landed} ${spec.stoppedAt.name} could not be published (${spec.hostError}), so the ` +
      `grid “${spec.gridName}” was not published either — a public grid must not point at a ` +
      `private row. The grid is unchanged and still private.`
    );
  }
  // 🔴 THE "still lists them" CLAUSE IS CONDITIONAL, because with nothing published
  // there is no "them" and the sentence would refer to an empty set. That state is
  // reachable: the direct, no-dependency publish path reaches this arm with an empty
  // `published` whenever the grid's own `append` is refused.
  const tail =
    spec.published.length === 0
      ? 'so it is still private.'
      : 'so it is still private and still lists them. Publishing it again will not ' +
        'publish them a second time.';
  return (
    `${landed} The grid “${spec.gridName}” itself could not be published ` +
    `(${spec.hostError}), ${tail}`
  );
}
