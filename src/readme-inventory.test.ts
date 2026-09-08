// 🔴 THE README'S `src/lib/` INVENTORY, PINNED TO THE FILESYSTEM.
//
// WHY THIS EXISTS. The public README claims to list "the pure, node-testable
// core". It was edited BY EYE across 527 and silently went one short: twelve
// modules existed and eleven were named. The missing one was `kv.ts` — the
// per-viewer in-flight run record, which `CLAUDE.md` calls out by name as
// money-path-critical. An inventory that is *nearly* complete is worse than no
// inventory: a public-mirror reader takes it as the map and never looks for the
// twelfth file. The audit round that found it (PR #38, F9) had itself already
// "swept" this paragraph once — by eye — and missed it.
//
// 🔴 WHAT THIS PINS IS A RELATIONSHIP, NOT A COUNT. It fails when the set GROWS
// (a new module nobody added to the README) *and* when it SHRINKS (a README link
// to a module that no longer exists — a dead link on a public mirror). A guard
// that asserted "the README names 12 modules" would pass a README that named the
// same module twice, and would have to be hand-edited on every legitimate
// addition, which is the rot it exists to prevent.
//
// ⚠ IT PINS PRESENCE, NOT PROSE. The README naming `kv.ts` is not evidence that
// what it SAYS about `kv.ts` is true; nothing mechanical can check that. This
// closes the "silently one short" failure only.
//
// 🔴 AND IT IS SCOPED TO THE INVENTORY PARAGRAPH, which it was not at first. See
// `inventoryParagraph()` below: a whole-file scan was blind to a module dropped
// from the inventory while the README still linked it from somewhere else, which
// was true of three of the twelve.

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');

/** Every non-test module in `src/lib/`, read off disk — never a hand-kept list. */
function libModulesOnDisk(): string[] {
  return readdirSync(join(repoRoot, 'src', 'lib'))
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((f) => `src/lib/${f}`)
    .sort();
}

const START = '<!-- lib-inventory:start';
const END = '<!-- lib-inventory:end -->';

/**
 * Just the inventory paragraph, between its two HTML-comment markers.
 *
 * 🔴 WHY THIS IS DELIMITED AND NOT A WHOLE-FILE REGEX. It used to scan the whole
 * README, and the README links three of the twelve modules a SECOND time outside
 * the inventory — `workflow.ts` from the hooks table, `ecosystem.ts` and
 * `benchmark.ts` from the sections further down. Those other links kept the set
 * equal for those three, so the exact failure this guard exists for — a module
 * silently dropped from the INVENTORY — recurred undetected for a quarter of the
 * modules while the README claimed the list itself was checked. Measured on that
 * tree: deleting `workflow.ts` from the inventory paragraph left the suite
 * 526/526 green.
 *
 * The marker is load-bearing, so a missing one THROWS rather than falling back to
 * the whole file — a silent widening is how this got weak in the first place.
 */
function inventoryParagraph(): string {
  const readme = readFileSync(join(repoRoot, 'README.md'), 'utf8');
  const from = readme.indexOf(START);
  const to = readme.indexOf(END);
  if (from < 0 || to < 0 || to <= from) {
    throw new Error(
      `README.md is missing the "${START}…${END}" markers around the src/lib ` +
        `inventory — the guard cannot tell which paragraph it is about. Restore them.`,
    );
  }
  return readme.slice(from, to);
}

/** Every `src/lib/<name>.ts` path the INVENTORY PARAGRAPH references, deduped. */
function libModulesInReadme(): string[] {
  const found = inventoryParagraph().match(/src\/lib\/[A-Za-z0-9_-]+\.ts/g) ?? [];
  return [...new Set(found)].sort();
}

describe("the README's src/lib inventory", () => {
  it('names EVERY module on disk, and no module that is not', () => {
    const onDisk = libModulesOnDisk();

    // POSITIVE CONTROL on the reader itself. A `readdirSync` pointed at the wrong
    // directory, or a regex that matches nothing, would make the comparison below
    // an assertion that `[] === []` — green, and blind. Both sides must be
    // non-empty before the equality means anything.
    expect(onDisk.length, 'the disk scan found no lib modules — wrong path?').toBeGreaterThan(0);
    const inReadme = libModulesInReadme();
    expect(
      inReadme.length,
      'the README scan matched no src/lib path — wrong pattern?',
    ).toBeGreaterThan(0);

    expect(inReadme).toEqual(onDisk);
  });

  it('pins the money-path module BY NAME, because that is the one that went missing', () => {
    // Deliberately redundant with the case above, and deliberately specific:
    // `kv.ts` is the module the README omitted, and `CLAUDE.md` names it as
    // money-path-critical ("the per-viewer in-flight record"). If the set-equality
    // case is ever weakened, this one still fails on the exact regression.
    expect(libModulesOnDisk()).toContain('src/lib/kv.ts');
    expect(libModulesInReadme()).toContain('src/lib/kv.ts');
  });
});
