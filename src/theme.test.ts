// 🔴 THE RECESSED-FILL RULE, AS A TEST INSTEAD OF A THIRD COMMENT.
//
// THE DEFECT. `--civitai-color-surface-2` resolves to the SAME value as
// `--civitai-color-body` in the light theme, so anything filled with it has no fill
// at all there. This repo knew that. It said so in THREE places:
//
//   1. `theme.ts`, in the docblock on `elevate()` — "unlike surface-2, identical to
//      `body` in light mode";
//   2. `GatedCell.tsx:278`, above the one site that got it right — "NOT surface-2: in
//      light theme surface-2 resolves to the same value as body";
//   3. `PLAYBOOK.md` §1e, as an audit gate — a hand-run `grep` for exactly this.
//
// …and `PromptBody.tsx`'s prompt-text `<pre>` shipped `background: token.surface2`
// anyway. A predicate open-coded at three sites and wrong at a fourth is the shape
// this repo's rules already name; the part worth recording is that ALL THREE of the
// statements above were PROSE. Prose does not run. The grep gate in particular reads
// as coverage while providing none — nobody ran it, and there was no CI step that
// could.
//
// 🔴 SO THE FIX IS TWO THINGS, AND THE DELETION IS THE IMPORTANT ONE. `theme.ts` no
// longer exports a `surface2` token, so the wrong value cannot be reached for through
// the module every component already imports; and `recessedSurface` gives the right
// value a name, so "which `elevate(N)` is the inset one" stops being a judgement call
// re-made at each site. This file is the backstop for the route the deletion does not
// close — someone writing the raw `var(--civitai-color-surface-2)` by hand.
//
// ⚠️ WHAT THIS FILE CANNOT SETTLE. It is a scan and a ledger. It cannot tell you that
// `recessedSurface` READS as a recess against `surface` at any particular contrast —
// that is a live-rendering question, jsdom resolves no colour, and this is the `node`
// project with no DOM at all. A live reading in BOTH themes is owed and has not been
// taken here.
//
// ⚠️ NAMESPACE IMPORT, DELIBERATELY. `import * as theme` keeps every case RUNNABLE
// against a tree where `recessedSurface` does not exist yet — a named import of a
// missing export is a link-time SyntaxError that reddens the whole file, which would
// make "red at base" a fact about module resolution rather than about any assertion.
// With the namespace, each case below fails on its own merits.

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import * as theme from './theme.js';

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = here;

/**
 * The value that must never appear in this app's source.
 *
 * 🔴 IT IS THE `var(…)` REFERENCE, NOT THE BARE PROPERTY NAME, and the distinction is
 * load-bearing rather than pedantic: the bare name appears in five COMMENTS in
 * `theme.ts` alone — including the ones explaining why it is banned — so a scan for
 * the name flags its own documentation and gets weakened or deleted within a round.
 * `var(--civitai-color-surface-2)` is the only spelling that is a usable VALUE, which
 * is the thing that can actually reach a `background`.
 */
const FORBIDDEN_VAR = 'var(--civitai-color-surface-2)';

/**
 * A property that IS legitimately all over `theme.ts`, used as the scan's positive
 * control. Deliberately NOT a prefix of {@link FORBIDDEN_VAR}: `--civitai-color-surface`
 * is a substring of `--civitai-color-surface-2`, so a control built on it could not
 * tell "the reader works" from "the forbidden string is present".
 */
const CONTROL_VAR = 'var(--civitai-color-text-dimmed)';

/** Every non-test `.ts`/`.tsx` under `src/`, read off disk — never a hand-kept list. */
function appModules(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry.name)) continue;
      if (/\.test\.tsx?$/.test(entry.name)) continue;
      out.push(full);
    }
  };
  walk(srcRoot);
  return out;
}

function modulesContaining(needle: string): string[] {
  return appModules()
    .filter((f) => readFileSync(f, 'utf8').includes(needle))
    .map((f) => relative(srcRoot, f))
    .sort();
}

describe('the recessed-fill rule has exactly ONE home', () => {
  it('🔴 `token` does not offer surface-2 — the enumerated ledger', () => {
    // The WHOLE set, as literals. A `not.toHaveProperty('surface2')` would pass a
    // token object that had grown `surfaceTwo`, and would say nothing about the rest
    // of the palette; this fails when the set grows as loudly as when it shrinks,
    // which is the only way "the wrong value is unreachable" stays true.
    expect(Object.keys(theme.token).sort()).toEqual([
      'body',
      'border',
      'dimmed',
      'error',
      'font',
      'primary',
      'primaryLight',
      'radius',
      'success',
      'surface',
      'text',
    ]);
    // …and no token's VALUE is the forbidden property either, which the key ledger
    // alone cannot see: `surface2` could have been renamed rather than removed.
    expect(Object.values(theme.token).join(' ')).not.toContain(FORBIDDEN_VAR);
  });

  it('🔴 `recessedSurface` is a mix over `surface`, and names the recess once', () => {
    // A LITERAL, not `elevate(5)`. Deriving the expectation from the function under
    // test is what makes a guard unable to fail: `elevate` returning surface-2 would
    // satisfy `recessedSurface === elevate(5)` perfectly.
    expect(theme.recessedSurface).toBe(
      'color-mix(in srgb, var(--civitai-color-text) 5%, var(--civitai-color-surface))',
    );
    expect(theme.recessedSurface).not.toContain(FORBIDDEN_VAR);
  });

  it('🔴 SCAN: no module under `src/` names surface-2, with both controls', () => {
    // POSITIVE CONTROL 1 — the MATCHER can match. A scan whose pattern is wrong
    // returns the same reassuring empty set as a scan over clean code.
    expect(`background: ${FORBIDDEN_VAR};`.includes(FORBIDDEN_VAR)).toBe(true);
    // …and the NEGATIVE half of the same control: the bare property name, which the
    // comments in `theme.ts` are full of, must NOT be what this scan looks for.
    expect('`--civitai-color-surface-2` is banned'.includes(FORBIDDEN_VAR)).toBe(false);

    // POSITIVE CONTROL 2 — the READER can see files, and it can see a NON-ZERO
    // number of them. Without this, a walker pointed at the wrong directory (or one
    // that filtered every file out) reports the same `[]` as compliance.
    const control = modulesContaining(CONTROL_VAR);
    expect(control.length, 'the module scan found nothing at all').toBeGreaterThan(0);
    expect(control, 'the scan cannot see theme.ts').toContain('theme.ts');

    // …and only now is the zero meaningful.
    expect(modulesContaining(FORBIDDEN_VAR)).toEqual([]);
  });

  // ⚠️ INVARIANT GUARD — NOT REGRESSION COVERAGE, and measured as such: this case is
  // GREEN at `origin/main`. Nothing ever forked `color-mix(`; the bug this file exists
  // for was a `surface-2` token, not a second mixer. It is labelled rather than
  // deleted because the consolidation is only durable while the helper stays single,
  // and it is VALIDATED BY MUTATION rather than by a red base: adding
  // `color-mix(in srgb, red 5%, blue)` to `components/Menu.tsx` turns this case — and
  // only this case — red, with its own message. The three cases above it ARE
  // regression coverage (red at `origin/main`).
  it('🔴 SCAN: `elevate()` is still the only way this app spells a tint', () => {
    // The mirror of the case above, and the reason the deletion is not enough on its
    // own: `recessedSurface` exists so that recesses stop being open-coded, so the
    // scan also pins that the ONE colour-mixing helper has not been re-forked. Any
    // hand-rolled `color-mix(` outside `theme.ts` is a second definition of the app's
    // elevation scale and the start of the next divergence.
    const mixers = modulesContaining('color-mix(');
    expect(mixers, 'color-mix() escaped theme.ts').toEqual(['theme.ts']);
  });
});
