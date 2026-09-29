// 🔴 NODE-ONLY, AND NOTHING IN PRODUCTION MAY IMPORT IT. It reads `node:fs`, so a
// production import would break the browser build — and `navigationDormancy.test.ts`'s
// scaffolding ledger asserts this file is NOT in `src/main.tsx`'s dependency graph, so
// such an import fails a test rather than shipping.
//
// ── WHY IT EXISTS: THE SAME WALKER WAS WRITTEN TWICE ────────────────────────
//
// `navigationDormancy.test.ts`'s `scannedSources` and `renameWireCompat.test.ts`'s
// `productionSources` were SEMANTICALLY IDENTICAL — same eight-line body, same regex,
// same filter, differing only in the function name and in whether the `if`/`else` arms
// carried braces. (⚠️ A draft of this paragraph, and of the two comments that point at
// it, said "byte-for-byte"; that is not what `git show 7410ca7:…` shows, and a
// duplication claim should be checked rather than asserted.) The duplication behaved
// exactly the way this repo's "one rule, one place" rule predicts: a docstring
// correction landed on one copy and not the other, so for a round one of them described
// the filter accurately ("wider than production — it scans the test scaffolding too")
// while the other still claimed "every production (non-test) file". Two copies, one
// corrected.
//
// 🔴 AND THE SECOND COPY WAS NOT MERELY UNTIDY. `renameWireCompat`'s `ALL_TESTIDS` is a
// LEDGER claiming to hold "every testid a production source renders"; scanning
// `src/test-helpers.tsx` fed three ids into it (`gated-cell`, `result-image`,
// `result-hidden`) that a TEST HELPER renders. Harmless in fact — all three are also
// rendered by `components/GatedCell.tsx`, so the SET is unchanged, verified — but a
// ledger that can certify an id only a helper renders is making a claim it cannot back.
// {@link productionReachable} is what lets that scan mean what it says.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * Every `.ts`/`.tsx` file under `dir` whose name does not contain `.test.`.
 *
 * ⚠️ IT IS WIDER THAN "PRODUCTION", AND THAT IS ACCURATE RATHER THAN A BUG: the test
 * scaffolding does not spell `.test.` either, so it comes back too. For an ABSENCE check
 * (does any file reach for X?) that is the SAFE direction — scanning extra files can
 * only produce a false RED, never a false green. Callers that need the narrower set
 * compose this with {@link productionReachable}.
 *
 * 🔴 WHICH FILES THOSE ARE IS NOT WRITTEN DOWN HERE, ON PURPOSE. A draft of this
 * docstring enumerated five by name — and enumerating by hand is the exact defect this
 * module exists to close. The paragraph it replaced in `navigationDormancy.test.ts` went
 * through two wrong versions: the first miscounted which of them are test-only, and the
 * SECOND — the one that survived review — still omitted `test-setup.ts` and
 * `manifest.ts` entirely. The live, asserted list is that file's `LEDGER` case, which
 * COMPUTES it; read it there, never from a comment.
 */
export function scannedSources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...scannedSources(full));
    else if (/\.tsx?$/.test(entry) && !entry.includes('.test.')) out.push(full);
  }
  return out;
}

/** Resolve an extensionless / `.js`-suffixed relative specifier to a real file. */
function resolveSpecifier(fromFile: string, spec: string): string | null {
  const base = resolve(dirname(fromFile), spec.replace(/\.js$/, ''));
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      /* not this one */
    }
  }
  return null;
}

/**
 * Every file reachable from `entry` by following RELATIVE import/export specifiers —
 * i.e. the set that is genuinely in the production bundle's graph.
 *
 * 🔴 THIS IS THE MECHANICAL ANSWER TO A QUESTION THAT HAS BEEN GOT WRONG TWICE BY HAND.
 * `navigationDormancy.test.ts`'s scaffolding paragraph has already been corrected once
 * ("a draft said TWO of four") and was still wrong afterwards — it enumerated FOUR
 * scaffolding files and missed both `src/test-setup.ts` (the vitest `setupFiles` entry)
 * and `src/manifest.ts` (imported only by `manifest.test.ts`, and not scaffolding-shaped
 * by its name at all). A prose list of which files are test-only rots on the next file
 * anyone adds; an import walk does not.
 *
 * ⚠️ TWO DELIBERATE HEURISTICS, both over-inclusive:
 *   - TYPE-ONLY imports count. `import type { X } from './y.js'` puts no code in the
 *     bundle, but distinguishing them needs a parser. Over-inclusive here means the
 *     reachable set can be too BIG, so the test-only set derived from it can only be too
 *     SMALL — a ledger built on it under-reports rather than inventing members.
 *   - BARE specifiers are ignored entirely: this walk is about THIS repo's files, not
 *     about `node_modules`.
 * A dynamic `import(expr)` with a computed path is invisible to it; there are none in
 * this tree, and a static `import()` with a literal is matched like any other.
 */
export function productionReachable(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [resolve(entry)];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    let src: string;
    try {
      src = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    // `from '…'` covers import, export-from and `export * from`; `import('…')` covers a
    // static dynamic import. Only relative specifiers are followed.
    for (const m of src.matchAll(/(?:from|import)\s*\(?\s*['"](\.[^'"]*)['"]/g)) {
      const target = resolveSpecifier(file, m[1]!);
      if (target) queue.push(target);
    }
  }
  return seen;
}
