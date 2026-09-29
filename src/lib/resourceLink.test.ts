// The one civitai.com path builder — and the guard that keeps it DORMANT.
//
// 🔴 A BRAND-NEW FILE, SO NONE OF IT IS RED AT BASE — `lib/resourceLink.ts` does not
// exist on `zach/ia-feedback-sidebar`. Stated rather than implied: "0 of N red at
// base" is not coverage, and this file's job is to pin a CONTRACT (the exact string
// the host would be asked to navigate to) as literals, not to guard a fixed bug.
//
// 🔴 THE EXPECTATIONS ARE TYPED-OUT STRINGS, never built from `modelPath`'s own
// pieces. A test that composed `/models/${id}` the same way the implementation does
// would pass whatever the implementation said — including a path the site does not
// serve.
//
// 🔴 THE MODULE IS KEPT ON PURPOSE AND CALLED BY NOTHING. Every route out of a
// block's sandboxed iframe is shut (the measurement is in `resourceLink.ts`'s
// header), so a resource title that navigated would be a control advertising an
// action it cannot perform. The last case here is the tripwire: re-wiring this
// builder, or reintroducing `useCivitaiNavigate` anywhere in production source,
// fails a test with that header's name in the message. It is meant to be deleted
// deliberately on the day the trust tier changes — not walked past.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { modelPath } from './resourceLink.js';

describe('modelPath', () => {
  it('addresses the MODEL, and pins the version when one is known', () => {
    expect(modelPath(500, 1001)).toBe('/models/500?modelVersionId=1001');
  });

  it('falls back to the bare model page when no version is given', () => {
    // The LoRA case that matters is the OPPOSITE of this one (a version with no
    // model id is not addressable at all, which is why `modelId` is the required
    // parameter), but a caller with only a model id is legitimate.
    expect(modelPath(500)).toBe('/models/500');
  });

  it('is absolute from the site root, with exactly one leading slash', () => {
    // 🔴 THE LEADING SLASH IS PART OF THE CONTRACT, and the host's own handling is
    // why: it strips leading slashes and then rejects a path that still starts with
    // one, or contains `//` or a `..` segment. A relative path would be accepted and
    // resolved somewhere else entirely.
    const p = modelPath(7, 8);
    expect(p.startsWith('/')).toBe(true);
    expect(p.startsWith('//')).toBe(false);
    expect(p.split('/')).not.toContain('..');
  });

  it('distinguishes two different resources', () => {
    // A guard against a constant sneaking in: two calls with pairwise-distinct
    // arguments must produce two distinct strings, and neither may equal the other's.
    expect(modelPath(500, 1001)).not.toBe(modelPath(900, 2002));
    expect(modelPath(900, 2002)).toBe('/models/900?modelVersionId=2002');
  });
});

// ---------------------------------------------------------------------------
// THE DORMANCY TRIPWIRE.
// ---------------------------------------------------------------------------

/** Every production (non-test) `.ts`/`.tsx` file under `src/`. */
function productionSources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...productionSources(full));
    else if (/\.tsx?$/.test(entry) && !entry.includes('.test.')) out.push(full);
  }
  return out;
}

/**
 * Source with comments removed.
 *
 * 🔴 IT HAS TO STRIP COMMENTS, AND THE FIRST DRAFT DID NOT — both guards below
 * went RED on the very prose that documents them (`resourceLink.ts`'s header names
 * `useCivitaiNavigate` and `modelPath` repeatedly, and `ResourceName.tsx`'s does
 * too). A name-scan over raw source cannot tell a call from an explanation, and
 * this repo's discipline is to write the explanation down — so the two would have
 * been permanently red, which is worse than no gate at all.
 *
 * ⚠️ THE `//` RULE IS A HEURISTIC AND ITS FAILURE DIRECTION MATTERS. A `//` inside
 * a string (`'https://…'`) would truncate real code, and for an ABSENCE check
 * over-stripping is a FALSE NEGATIVE — the quiet kind. So `//` is only treated as a
 * comment when it is not preceded by `:`, which covers every URL in this tree, and
 * the stripper is validated by its own controls below rather than trusted.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const SRC = resolve(process.cwd(), 'src');
const PROD_FILES = productionSources(SRC);
const PROD_CODE = new Map(PROD_FILES.map((f) => [f, stripComments(readFileSync(f, 'utf8'))]));
const ALL_CODE = [...PROD_CODE.values()].join('\n');

describe('🔴 the resource-link machinery stays dormant', () => {
  it('VALIDATE THE INSTRUMENT: the scan reads real code, and only code', () => {
    // 🔴 EVERY ASSERTION BELOW IS AN ABSENCE, and an absence read off an empty (or
    // over-stripped) string is green for the worst possible reason. Four controls,
    // and the last two are the ones that matter:
    expect(PROD_FILES.length, 'the disk scan found no production sources').toBeGreaterThan(20);
    expect(ALL_CODE.length).toBeGreaterThan(20_000);
    // POSITIVE: real code survives the stripper — including a `//` inside a string.
    expect(ALL_CODE).toContain('export function modelPath');
    expect(ALL_CODE).toContain("data-testid=\"resource-name\"");
    expect(stripComments("const u = 'https://x.test/a'; // gone")).toContain('https://x.test/a');
    // NEGATIVE: comment prose does NOT survive — if it did, the two cases below
    // would be measuring this file's own documentation instead of the app.
    expect(ALL_CODE).not.toContain('DELIBERATELY UNCALLED');
    expect(stripComments('a(); // useCivitaiNavigate')).not.toContain('useCivitaiNavigate');
    expect(stripComments('/* useCivitaiNavigate */ b();')).not.toContain('useCivitaiNavigate');
  });

  it('NO production source reaches for `useCivitaiNavigate`', () => {
    // 🔴 THE BROADEST FORM OF THE CLAIM, and the structural one: the app asks the
    // host for no navigation AT ALL, so there is no path by which a title, a
    // wrapper, or anything else can advertise a navigation it cannot perform.
    // Matching the bare identifier catches the IMPORT too, so an alias
    // (`import { useCivitaiNavigate as go }`) still fails here.
    const offenders = [...PROD_CODE]
      .filter(([, code]) => code.includes('useCivitaiNavigate'))
      .map(([f]) => f);
    expect(
      offenders,
      'a production source reached for useCivitaiNavigate — read lib/resourceLink.ts before wiring it',
    ).toEqual([]);
  });

  it('NO production source calls `modelPath`', () => {
    // The builder is correct and deliberately uncalled — see this file's header and
    // `resourceLink.ts`'s. ⚠️ THIS IS A SPELLED GUARD and cannot be more than that:
    // it pins a NAME, so a re-export under another name walks past it. The case
    // above is the structural backstop; this one exists to put the header in front
    // of whoever tries first.
    const callers = [...PROD_CODE]
      .filter(([f, code]) => !f.endsWith('lib/resourceLink.ts') && code.includes('modelPath'))
      .map(([f]) => f);
    expect(callers, 'modelPath gained a caller — read lib/resourceLink.ts first').toEqual([]);
  });
});
