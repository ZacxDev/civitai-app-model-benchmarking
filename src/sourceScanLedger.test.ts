// 🔴 WHAT IS AND IS NOT IN `src/main.tsx`'s IMPORT GRAPH — a whole-tree structural
// claim — plus the validation of the instrument that reads the tree.
//
// ⚠️ THIS FILE WAS `src/navigationDormancy.test.ts` AND HELD A THIRD CASE THAT IS NOW
// RETIRED. That case was `it('NO scanned source reaches for \`useCivitaiNavigate\`')`:
// a whole-tree name scan asserting that no production source asks the host to navigate
// at all. It existed because every route out of a block's sandboxed iframe was believed
// shut — the host's app-scoped path rewrite, a `'new_tab'` the host was thought not to
// implement, and a block-opened popup that would land the viewer on civitai.com logged
// out — so a control that navigated would have been advertising an action it could not
// perform, and the scan was the tripwire that put that record in front of whoever
// reached for one first. ⚠️ THE MIDDLE ITEM USED TO READ "an ungrantable popup token",
// which was the same conflation `components/ResourceName.tsx`'s route 2 now retracts:
// the token governs the block-opened popup (the third item), and `'new_tab'` is
// implemented by the host from the parent frame where no sandbox of ours applies.
//
// 🔴 IT IS RETIRED BECAUSE THE WORLD CHANGED, NOT BECAUSE IT WAS IN THE WAY.
// `civitai/civitai` **#5250** shipped `scope: 'site'` on the `NAVIGATE` message, so
// `src/components/ResourceName.tsx` now genuinely does reach for `useCivitaiNavigate`
// and the guard asserted an absence that is no longer the contract. It was deleted
// rather than retargeted: there is nothing left for it to pin. The posture it used to
// protect is now pinned BEHAVIOURALLY instead, where it belongs —
// `src/matchupModalResources.test.tsx` presses every resource title in the real modal
// and requires exactly one `NAVIGATE` with `scope: 'site'` and the exact path, AND zero
// on `window.open` / `location.href` / `location.assign` / `location.replace`. Those
// four zeros are the part of the old claim that still matters: an `<a href>` or a
// `location.href =` in this iframe replaces the running block with an opaque-origin,
// logged-out civitai.com, and no host change touched that.
//
// ⚠️ AND THE FILE IS RENAMED, which is not cosmetic. With that case gone, neither
// surviving case has anything to do with navigation — a reader grepping "dormancy"
// would land on a file that asserts no dormancy at all, which is the same failure mode
// as a stale cross-reference. `git mv` keeps the history.
//
// WHAT IT PINS NOW, both independently valuable and both predating the rename:
//
//   1. THE LEDGER — which scanned files sit OUTSIDE `src/main.tsx`'s dependency graph.
//      It doubles as the guard that no production file imports `lib/sourceScan.ts`,
//      which reads `node:fs` and would break the browser build.
//   2. VALIDATE THE INSTRUMENT — that the comment stripper reads real code, and only
//      code. An absence check over an over-stripped string is green for the worst
//      possible reason.
//
// 🔴 NEITHER WAS EVER RED AT BASE, and that is stated rather than implied: both are
// INVARIANT GUARDS on properties that have always held, watched failing by MUTATION
// rather than by a red base. Do not count either as regression coverage.

import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { productionReachable, scannedSources } from './lib/sourceScan.js';

/*
 * 🔴 THE WALKER IS `lib/sourceScan.ts` NOW, NOT A LOCAL COPY, and the reason is a
 * concrete rot rather than tidiness: `renameWireCompat.test.ts` held a SEMANTICALLY
 * IDENTICAL duplicate under the name `productionSources` (same body, same regex; it
 * differed only in the name and in brace style), and when this copy's docstring was
 * corrected the other one kept the sentence that had just been found wrong. See that
 * module's header for what the second copy's version was silently feeding into a ledger.
 *
 * ⚠️ WHAT THE FILTER IS: every `.ts`/`.tsx` under `src/` not spelling `.test.` — WIDER
 * than "production", because the test scaffolding does not spell `.test.` either. For an
 * ABSENCE check that is the safe direction: scanning extra files can only produce a false
 * RED, never a false green. The scaffolding ledger below is what keeps the description
 * and the reality in step, MECHANICALLY, because the prose version of this paragraph has
 * now been wrong twice.
 */

/**
 * Source with comments removed.
 *
 * 🔴 IT HAS TO STRIP COMMENTS, AND THE FIRST DRAFT DID NOT — the retired name scan went
 * RED on the very prose that documented it (`ResourceName.tsx`'s header names
 * `useCivitaiNavigate` repeatedly, and so did this file). A name-scan over raw source
 * cannot tell a call from an explanation, and this repo's discipline is to write the
 * explanation down — so it would have been permanently red, which is worse than no gate
 * at all. ⚠️ That scan is gone; the stripper is NOT, because the LEDGER case and the
 * controls below still read code and must not read prose.
 *
 * ⚠️ THE `//` RULE IS A HEURISTIC AND ITS FAILURE DIRECTION MATTERS. A `//` inside a
 * string (`'https://…'`) would truncate real code, and for an ABSENCE check
 * over-stripping is a FALSE NEGATIVE — the quiet kind. So `//` is only treated as a
 * comment when it is not preceded by `:`, which covers every URL in this tree, and the
 * stripper is validated by its own controls below rather than trusted.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const SRC = resolve(process.cwd(), 'src');
const SCANNED = scannedSources(SRC);
/** `src/main.tsx`'s dependency graph — what really ships. */
const REACHABLE = productionReachable(resolve(SRC, 'main.tsx'));
/** Scanned files that are NOT in it, as `src/`-relative paths, sorted. */
const TEST_ONLY = SCANNED.filter((f) => !REACHABLE.has(f))
  .map((f) => relative(SRC, f))
  .sort();
const RAW = new Map(SCANNED.map((f) => [f, readFileSync(f, 'utf8')]));
const CODE = new Map([...RAW].map(([f, src]) => [f, stripComments(src)]));
const ALL_CODE = [...CODE.values()].join('\n');
const ALL_RAW = [...RAW.values()].join('\n');

describe("🔴 src/main.tsx's import graph, and the scanner that reads it", () => {
  // 🔴 THE SCAFFOLDING LEDGER, DERIVED BY AN IMPORT WALK RATHER THAN WRITTEN DOWN.
  //
  // ⚠️ WHAT THIS REPLACES, AND WHY IT IS NOT A CORRECTED SENTENCE. The docstring above
  // `scannedSources` used to enumerate the scaffolding by hand. It said FOUR files and
  // named `test-helpers.tsx` as the only test-only one. That was the SECOND version of
  // the paragraph (a draft before it had said "two of four" and named `test-harness.tsx`
  // as test-only, which was wrong), and it was STILL wrong TWICE OVER:
  //
  //   - `src/test-setup.ts` is a fifth scanned scaffolding file — `vite.config.ts`'s
  //     `setupFiles` entry, matching the filter, imported by no production file;
  //   - `src/manifest.ts` is a SIXTH, and nobody had noticed it at all. It exists to
  //     feed `manifest.test.ts`'s `defineBlock` gate; the only importer in the tree is
  //     that test. It does not look like scaffolding from its name, which is precisely
  //     why a hand-written list could not be trusted to contain it.
  //
  // A third writer editing "four" to "five" would simply have been the next person to
  // get it wrong. The list is COMPUTED now, and it fails when a file joins or leaves.
  //
  // 🔴 IT PINS A RELATIONSHIP, NOT A COUNT: which scanned files are outside
  // `src/main.tsx`'s dependency graph. `Harness.tsx`, `test-harness.tsx` and
  // `demo-data.ts` all ARE inside it — `main.tsx` imports `./Harness.js` statically (the
  // harness is selected by a runtime env flag, not a conditional import) and
  // `Harness.tsx` imports both of the others — which is the positive reason not to
  // narrow the filter to "production".
  //
  // 🔴 AND IT DOUBLES AS THE GUARD ON `lib/sourceScan.ts` ITSELF: that module reads
  // `node:fs`, so a production import of it would break the browser build. Its presence
  // in THIS list is the assertion that no production file imports it.
  it('🔴 LEDGER: exactly these scanned files are outside the production graph', () => {
    // VALIDATE THE INSTRUMENT FIRST. An import walk that resolved nothing would return a
    // one-element set and classify the whole tree as test-only — a ledger mismatch, yes,
    // but the diagnosis would read as "the tree changed" rather than "the walk is
    // broken". So: the walk reached most of the tree, and it reached two named files by
    // two different routes (a direct import from the entry, and a transitive one).
    expect(REACHABLE.size, 'the import walk resolved almost nothing').toBeGreaterThan(30);
    expect(REACHABLE.has(resolve(SRC, 'App.tsx')), 'App.tsx is not reachable?').toBe(true);
    expect(
      REACHABLE.has(resolve(SRC, 'components/GridOpenPanel.tsx')),
      'a transitively-imported component is not reachable — the walk stops at depth 1',
    ).toBe(true);

    expect(
      TEST_ONLY,
      'a scanned file entered or left the production graph — update this ledger on purpose',
    ).toEqual(['lib/sourceScan.ts', 'manifest.ts', 'test-helpers.tsx', 'test-setup.ts']);
  });

  it('VALIDATE THE INSTRUMENT: the scan reads real code, and only code', () => {
    // 🔴 THE CONTROLS BELOW READ AN ABSENCE, and an absence read off an empty (or
    // over-stripped) string is green for the worst possible reason.
    expect(SCANNED.length, 'the disk scan found no sources').toBeGreaterThan(20);
    expect(ALL_CODE.length).toBeGreaterThan(20_000);

    // ---- POSITIVE CONTROLS: real code survives the stripper ----
    // Two markers from two different files, so a single rename cannot make both
    // vacuous at once. Both are CODE, not prose.
    expect(ALL_CODE, 'ResourceName.tsx did not survive the stripper').toContain(
      'data-testid="resource-name"',
    );
    expect(ALL_CODE, 'SideNav.tsx did not survive the stripper').toContain(
      'export const NAV_ITEM_ATTR',
    );
    // …including a `//` inside a string, which the `:`-guarded rule exists for.
    expect(stripComments("const u = 'https://x.test/a'; // gone")).toContain('https://x.test/a');

    // ---- NEGATIVE CONTROLS: comment prose does NOT survive ----
    //
    // ⚠️ THE RULE THAT USED TO GOVERN THESE IS MOOT, AND SAYING SO IS THE POINT. This
    // block carried a 🔴 rule: "NONE OF THEM MAY MENTION `useCivitaiNavigate` ON THE
    // REAL TREE". It was learned the hard way — a draft's real-tree control asserted
    // `expect(ALL_CODE).not.toContain('useCivitaiNavigate')`, which was ALSO the
    // retired dormancy guard's own assertion, so under a mutant adding the hook to a
    // production file BOTH went red and the instrument case reported "the instrument is
    // broken" for what was really an app change. A control must not share its subject
    // with the thing it validates.
    //
    // That specific collision cannot recur: the guard it collided with no longer
    // exists, and `useCivitaiNavigate` is now ORDINARY PRODUCTION CODE in
    // `components/ResourceName.tsx` — so a real-tree `not.toContain` on it would be
    // permanently red rather than merely entangled. The GENERAL rule survives and is
    // the reusable half: a control must not share its subject with its subject's guard.
    // The token stays in the synthetic pair below because those are self-contained
    // literals — nothing about the real tree can make them pass or fail.
    //
    // Synthetic, in both comment syntaxes, so they cannot rot with a reword somewhere
    // else in the tree. ✅ WATCHED FAILING: a `stripComments` that returns its input
    // unchanged fails at the first of these.
    expect(stripComments('a(); // useCivitaiNavigate')).not.toContain('useCivitaiNavigate');
    expect(stripComments('/* useCivitaiNavigate */ b();')).not.toContain('useCivitaiNavigate');

    // 🔴 AND ON THE REAL TREE, because a regex that works on two synthetic strings can
    // still no-op against the files that matter. Measured at the time of writing: 685 kB
    // raw → 280 kB stripped, i.e. ~41%. The bound OVERSHOOTS deliberately rather than
    // sitting on the measurement: it asks only that MOST of this tree is comment, which
    // it emphatically is, so an ordinary round of comment edits cannot trip it while a
    // stripper that silently stopped stripping cannot pass it.
    //
    // ⚠️ THIS ONE AND THE NEXT ARE BACKSTOPS AND HAVE NOT BEEN WATCHED FAILING ON A REAL
    // MUTANT — the synthetic pair above fails first, which is the crisper diagnosis. A
    // stripper broken only against real files and not against a two-line string is
    // contrived enough that no such mutant was built.
    //
    // ⚠️ AND THE REACHABILITY CLAIM HERE WAS TOO WIDE, so it is narrowed rather than
    // restated. It said "their ASSERTIONS were proven REACHABLE", plural, citing the
    // `COMMENT_ONLY` experiment. That experiment reaches the `COMMENT_ONLY` PAIR below
    // and says nothing about THIS ratio assertion: the only mutant that would make the
    // ratio fail is a stripper that stops stripping, and such a mutant is already killed
    // — earlier in this same `it()` — by the two synthetic `stripComments` checks. So the
    // ratio guard has no mutant of its own that reaches it first, which is the definition
    // of an assertion whose reachability is UNPROVEN. It is kept as a cheap backstop and
    // labelled as one; it is not coverage.
    expect(ALL_CODE.length, 'the stripper removed almost nothing from the real tree').toBeLessThan(
      ALL_RAW.length * 0.75,
    );

    // A phrase that exists ONLY in a comment must go, while a code token in the SAME file
    // must stay — the sharpest form, and about the STRIPPER rather than about any hook.
    //
    // ⚠️ THE PHRASE WAS RE-CHECKED AGAINST THE REWRITTEN HEADER, NOT ASSUMED. That
    // header was rewritten end to end for #5250, and rewritten AGAIN when the "route 2
    // is still shut" reading was retracted (two of its three routes are open; read the
    // header, not this parenthesis, for which). This control keys on a literal string
    // inside it — so the assertion two lines below is doing double duty: it is a
    // control, and it is the thing that fails loudly if a later reword takes the phrase
    // with it. The heading has survived both rewrites with only its suffix changing,
    // which is why no re-pick was needed; `toContain` is what makes that checkable
    // rather than a claim.
    const one = RAW.get(resolve(SRC, 'components/ResourceName.tsx'));
    expect(one, 'ResourceName.tsx was not scanned — every control below is vacuous').toBeDefined();
    const COMMENT_ONLY = 'THE MEASUREMENT: THREE ROUTES OUT OF THE IFRAME';
    expect(one!, 'the phrase this control keys on was reworded — re-pick it').toContain(
      COMMENT_ONLY,
    );
    expect(stripComments(one!)).not.toContain(COMMENT_ONLY);
    expect(stripComments(one!)).toContain('data-testid="resource-name"');
  });
});
