// 🔴 THE APP ASKS THE HOST FOR NO NAVIGATION AT ALL — a whole-tree structural claim.
//
// WHY IT EXISTS. Every route out of a block's sandboxed iframe is shut, and one of them
// (a popup inheriting an opener with no `allow-same-origin`) would land the viewer on
// civitai.com LOGGED OUT. The full measurement — the host's path rewrite at
// `PageBlockHost.tsx:1883`, the unread `payload.target`, `ALLOWED_SANDBOX_TOKENS`, and
// the live iframe's `sandbox="allow-scripts allow-forms"` / `trustTier: 'unverified'` —
// lives in `src/components/ResourceName.tsx`'s header and is filed upstream as
// `civitai/civitai` **#5209**. So a control that navigated would be advertising an
// action it cannot perform, and this file is the tripwire that puts that record in front
// of whoever reaches for one first.
//
// ⚠️ IT MOVED HERE FROM `src/lib/resourceLink.test.ts`, WHICH IS DELETED. That file also
// tested a four-line `modelPath(modelId, versionId)` string builder that production
// called from NOWHERE. The builder and its four path cases went with it: the
// retroactivity argument that justifies keeping the WIRE FIELD (`LoraRef.modelId`, which
// no later build can backfill onto another author's row) does not extend to a template
// string anyone can rewrite in two minutes, and the measurement it anchored is duplicated
// where a reader actually lands. What did NOT go is this guard — it is structural, it
// pins a whole-app property, and nothing else covers it.
//
// 🔴 IT IS THE BROADEST FORM OF THE CLAIM, DELIBERATELY. Matching the bare identifier
// catches the IMPORT too, so an alias (`import { useCivitaiNavigate as go }`) still
// fails here. What it does not catch is a re-export under a different name — that is the
// known limit of a name scan, and the reason the claim is phrased as "reaches for
// `useCivitaiNavigate`" rather than "cannot navigate".
//
// 🔴 A BRAND-NEW FILE, SO NONE OF IT IS RED AT BASE. Stated rather than implied: "0 of N
// red at base" is not coverage. Its ancestor case lived in `lib/resourceLink.test.ts`,
// which was itself new in this stack (verified: neither that file nor `lib/resourceLink.ts`
// exists on `origin/main` or on `zach/ia-feedback-sidebar`). What this IS: an INVARIANT
// GUARD on a property that has always held, watched failing by MUTATION (add a
// `useCivitaiNavigate` import to a production file → red) rather than by a red base.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Every `.ts`/`.tsx` file under `src/` whose name does not contain `.test.`.
 *
 * ⚠️ THE DOCSTRING USED TO SAY "every production (non-test) file" AND THE FILTER IS
 * WIDER THAN THAT: `test-helpers.tsx`, `test-harness.tsx`, `Harness.tsx` and
 * `demo-data.ts` are test scaffolding and are scanned too, because none of them spells
 * `.test.`. For an ABSENCE check that is the SAFE direction — scanning extra files can
 * only produce a false RED, never a false green — so it is left as is and described
 * accurately instead of narrowed.
 *
 * 🔴 AND THREE OF THOSE FOUR REALLY ARE PRODUCTION-REACHABLE, which is the positive
 * reason not to narrow it. The chain, traced rather than assumed: `src/main.tsx` imports
 * `./Harness.js` STATICALLY (the harness is selected by a runtime env flag, not by a
 * conditional import), and `Harness.tsx` imports BOTH `./test-harness.js` AND
 * `./demo-data.js`. So `Harness.tsx`, `test-harness.tsx` and `demo-data.ts` all sit in
 * the production entry's dependency graph. Only `test-helpers.tsx` is genuinely
 * test-only — nothing outside a `*.test.*` file imports it (the two non-test files that
 * match its name mention it in PROSE, which is exactly the confusion the stripper below
 * exists for). Do not "fix" the filter to match the old sentence.
 *
 * ⚠️ A draft of this paragraph said TWO of four and named `test-harness.tsx` as
 * test-only. Wrong: it is reached through `Harness.tsx`. Corrected by following the
 * imports instead of guessing from the file name — which is the whole hazard a name like
 * "test-harness" creates.
 */
function scannedSources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...scannedSources(full));
    else if (/\.tsx?$/.test(entry) && !entry.includes('.test.')) out.push(full);
  }
  return out;
}

/**
 * Source with comments removed.
 *
 * 🔴 IT HAS TO STRIP COMMENTS, AND THE FIRST DRAFT DID NOT — the guard went RED on the
 * very prose that documents it (`ResourceName.tsx`'s header names `useCivitaiNavigate`
 * repeatedly, and so does this file). A name-scan over raw source cannot tell a call
 * from an explanation, and this repo's discipline is to write the explanation down — so
 * it would have been permanently red, which is worse than no gate at all.
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
const RAW = new Map(SCANNED.map((f) => [f, readFileSync(f, 'utf8')]));
const CODE = new Map([...RAW].map(([f, src]) => [f, stripComments(src)]));
const ALL_CODE = [...CODE.values()].join('\n');
const ALL_RAW = [...RAW.values()].join('\n');

describe('🔴 the host-navigation machinery stays dormant', () => {
  it('VALIDATE THE INSTRUMENT: the scan reads real code, and only code', () => {
    // 🔴 THE ASSERTION BELOW IS AN ABSENCE, and an absence read off an empty (or
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
      "export const NAV_ITEM_ATTR",
    );
    // …including a `//` inside a string, which the `:`-guarded rule exists for.
    expect(stripComments("const u = 'https://x.test/a'; // gone")).toContain('https://x.test/a');

    // ---- NEGATIVE CONTROLS: comment prose does NOT survive ----
    //
    // 🔴 NONE OF THEM MAY MENTION `useCivitaiNavigate` ON THE REAL TREE, and that rule
    // was learned here. A draft's real-tree control asserted
    // `expect(ALL_CODE).not.toContain('useCivitaiNavigate')` — which IS the guard below.
    // Measured: under the mutant that adds the hook to a production file, BOTH cases went
    // red, so the instrument case reported "the instrument is broken" for what was
    // actually an app change. A control must not share its subject with the thing it
    // validates. The synthetic pair may name it freely; the real-tree pair must not.
    //
    // Synthetic, in both comment syntaxes — self-contained, so they cannot rot with a
    // reword somewhere else in the tree. ✅ WATCHED FAILING: a `stripComments` that
    // returns its input unchanged fails at the first of these.
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
    // MUTANT — the synthetic pair above fails first, which is the crisper diagnosis. Their
    // ASSERTIONS were proven REACHABLE (point `COMMENT_ONLY` at a code token and the
    // `not.toContain` below goes red), but a stripper broken only against real files and
    // not against a two-line string is contrived enough that no such mutant was built.
    expect(ALL_CODE.length, 'the stripper removed almost nothing from the real tree').toBeLessThan(
      ALL_RAW.length * 0.75,
    );

    // A phrase that exists ONLY in a comment must go, while a code token in the SAME file
    // must stay — the sharpest form, and about the STRIPPER rather than about the hook.
    const one = RAW.get(resolve(SRC, 'components/ResourceName.tsx'));
    expect(one, 'ResourceName.tsx was not scanned — every control below is vacuous').toBeDefined();
    const COMMENT_ONLY = 'THE MEASUREMENT: THREE ROUTES OUT OF THE IFRAME';
    expect(one!, 'the phrase this control keys on was reworded — re-pick it').toContain(
      COMMENT_ONLY,
    );
    expect(stripComments(one!)).not.toContain(COMMENT_ONLY);
    expect(stripComments(one!)).toContain('data-testid="resource-name"');
  });

  it('NO scanned source reaches for `useCivitaiNavigate`', () => {
    const offenders = [...CODE]
      .filter(([, code]) => code.includes('useCivitaiNavigate'))
      .map(([f]) => f);
    expect(
      offenders,
      'a source reached for useCivitaiNavigate — read ResourceName.tsx before wiring it',
    ).toEqual([]);
  });
});
