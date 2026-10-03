// 🔴 THE RECESSED-FILL RULE, AS A TEST INSTEAD OF A THIRD COMMENT.
//
// THE DEFECT. `--civitai-color-surface-2` resolved to the SAME value as
// `--civitai-color-body` in the light theme, so anything filled with it had no fill at
// all there. This repo knew that. It said so in THREE places:
//
//   1. `theme.ts`, in the docblock on `elevate()` — "unlike surface-2, identical to
//      `body` in light mode";
//   2. `GatedCell.tsx`, above the one site that got it right — "NOT surface-2: in
//      light theme surface-2 resolves to the same value as body" (the surviving text
//      is near `GatedCell.tsx:459`; this header used to cite `:278`, which was already
//      the wrong line before the skin landed — **cite the file, not a line number**);
//   3. `PLAYBOOK.md` §1e, as an audit gate — a hand-run `grep` for exactly this.
//
// ⚠️ PAST TENSE DELIBERATELY: that collision is a property of the STOCK token set, and
// inside this block it no longer holds — the skin gives body/surface/surface-2 three
// distinct values in BOTH themes (`SKIN_LIGHT`/`SKIN_DARK` in `theme.ts`). The rule
// below is still right, and its own inequality case already dates the collision to the
// stock set; only this header was stating it unqualified and present-tense.
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
// 🔴 NAMED IMPORTS HERE, UNLIKE `theme` ABOVE, AND THE ASYMMETRY IS DELIBERATE. The
// namespace import above exists so each case fails on its own merits against a tree
// where an export is missing. These three are the OTHER end of a seam the skin sheet
// spells as literals — if one of them stops existing, "the lockstep broke" is exactly
// the right failure, and a link-time error naming the constant says so more clearly
// than an `undefined` passed to `toContain`.
import { ICON_BUTTON_SELECTOR, MENU_ITEM_SELECTOR, NAV_ITEM_SELECTOR } from './compact.js';

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
      // 🔴 `accent` AND `cursor` ARE THE SKIN'S, AND THEY ARE NOT `--civitai-*`. Both
      // resolve to properties this app declares itself ({@link theme.ACCENT_TEXT_PROP},
      // {@link theme.CURSOR_PROP}) rather than to anything `@civitai/theme` ships, and
      // each exists because ONE stock token was carrying two jobs that pull apart:
      // `primary` was both the fill under near-white `primary-fg` text and a text
      // colour on the page body (arithmetically unsatisfiable at AA — see that
      // docblock), and it was ALSO the colour of both "selected" and "the roving
      // cursor is here" in `GridPicker`. Splitting them is what makes each state
      // spellable exactly once. This ledger is the thing that makes a THIRD such
      // token a decision someone takes.
      'accent',
      'body',
      'border',
      'cursor',
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
  // only this case — red, with its own message.
  //
  // 🔴 AND THE SENTENCE THAT USED TO END THIS PARAGRAPH WAS FALSE. It read "The three
  // cases above it ARE regression coverage (red at `origin/main`)". Measured at base
  // `5992667`, the real matrix is:
  //
  //   • the ENUMERATED LEDGER is red — but NOT over `surface-2`. Base `token` already
  //     has no `surface2` key (that deletion landed in an earlier PR, and its red base
  //     was watched there, not here); it reds because `accent` and `cursor` do not
  //     exist at base. So it is regression coverage for THIS PR's two token additions
  //     and an INVARIANT GUARD with respect to the `surface-2` defect the file is named
  //     for. A red base is not a claim about WHICH line reddened it.
  //   • `recessedSurface` is a mix over `surface` — GREEN at base (`recessedSurface =
  //     elevate(5)` is unchanged by this PR). An invariant guard.
  //   • SCAN: no module under `src/` names surface-2 — GREEN at base. At `5992667` the
  //     only occurrences of `var(--civitai-color-surface-2)` anywhere in `src/` are in
  //     `mobile-responsive.test.tsx` and this file, and `appModules()` excludes test
  //     files. An invariant guard.
  //
  // `src/theme.ts` is **+409/−6** in this PR, and every one of those 6 deleted lines is a
  // COMMENT (the 5-line "ZERO hardcoded colors" header and the 1-line radius docblock) —
  // measured with `git diff --numstat origin/main..HEAD -- src/theme.ts`, then by filtering
  // the deleted lines for non-comment content, which leaves zero. THAT is the structural
  // reason three of the four cases cannot be regression coverage for it: nothing they read
  // was removed or changed here.
  //
  // ⚠️ This sentence said "+353/−0, i.e. purely additive" and was false when it was
  // written — the very commit that wrote it deleted those 6 comment lines. The conclusion
  // was right and its stated premise was not, which a reader falsifies in one command. If
  // you touch `theme.ts` again, re-derive the pair rather than editing the numbers.
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

// ===========================================================================
// 🔴 THE SKIN — what a test CAN hold about a thing jsdom cannot see.
//
// `skinCss()` redeclares the `--civitai-*` custom properties on the app root, per
// theme. That is a CASCADE and a COLOUR change, and this is the `node` project with
// no DOM at all — so these cases make no claim whatever about appearance. There are
// three kinds of claim here, and each is a RELATIONSHIP rather than a value this repo
// chose:
//
//   1. THE TWO THEMES DECLARE THE SAME SET. A property declared in one theme and not
//      the other silently renders the STOCK value in the other, which reads as "the
//      theme half-applied" and is invisible to a test that only reads one theme.
//   2. WHAT THE APP READS, SOME THEME DECLARES. `token.accent` and `token.cursor`
//      point at properties NOTHING in `@civitai/theme` ships, so if the skin stopped
//      declaring them the `var()` would resolve to nothing at all — an unset colour,
//      i.e. inherited text, on a focus ring and an active nav row.
//   3. THE COLLISIONS THE SKIN EXISTS TO FIX STAY FIXED, stated as inequalities over
//      the declared values rather than as the literals themselves.
//
// ⚠️ WHAT NONE OF THEM CAN SETTLE: whether any pair of these colours is legible, or
// reads as the step it is meant to be, in either theme. Every contrast figure in
// `theme.ts` is arithmetic over the hex. A LIVE READING IN BOTH THEMES IS OWED and
// has not been taken.
// ===========================================================================

/** The tokens whose whole job is to be a VISIBLY different ground from each other. */
const GROUND_PROPS = [
  '--civitai-color-body',
  '--civitai-color-surface',
  '--civitai-color-surface-2',
] as const;

describe('the skin declares a complete, self-consistent token layer', () => {
  it('🔴 light and dark declare the SAME property set — and the enumerated ledger', () => {
    // The RELATIONSHIP first: this is the assertion that cannot rot, because it names
    // no property at all. It fails when either side grows OR shrinks relative to the
    // other, which is the actual defect shape (a token added to one theme only).
    expect(Object.keys(theme.SKIN_LIGHT.vars).sort()).toEqual(
      Object.keys(theme.SKIN_DARK.vars).sort(),
    );

    // …and the LEDGER, as literals, because the relationship above is equally happy
    // with both sides empty. A deletion from BOTH themes is a decision someone takes.
    expect(Object.keys(theme.SKIN_LIGHT.vars).sort()).toEqual([
      '--civitai-card-border-width',
      '--civitai-color-body',
      '--civitai-color-border',
      '--civitai-color-error',
      '--civitai-color-info',
      '--civitai-color-media-placeholder',
      '--civitai-color-primary',
      '--civitai-color-primary-fg',
      '--civitai-color-primary-hover',
      '--civitai-color-primary-light',
      '--civitai-color-segmented-bg',
      '--civitai-color-success',
      '--civitai-color-surface',
      '--civitai-color-surface-2',
      '--civitai-color-text',
      '--civitai-color-text-dimmed',
      '--civitai-color-track',
      '--civitai-color-warning',
      '--civitai-radius',
      '--mb-accent-text',
      '--mb-cursor',
    ]);

    // The two schemes are not the same scheme, which is the cheapest way to catch a
    // copy-paste of one Skin object over the other.
    expect(theme.SKIN_LIGHT.scheme).toBe('light');
    expect(theme.SKIN_DARK.scheme).toBe('dark');
  });

  it('🔴 SEAM: every property the `token` table reads is declared by BOTH themes', () => {
    // 🔴 THIS IS THE ONE THAT CATCHES AN UNSET COLOUR. `token.accent` and
    // `token.cursor` resolve to properties NO package declares — they are this app's
    // own — so a skin that stopped declaring one would leave a `var()` resolving to
    // nothing: an inherited colour on a focus ring and on the active nav row, with
    // every structural test still green because the DECLARED style is unchanged.
    //
    // It is derived from `token` rather than from a second list, so a THIRD app-own
    // token added to `token` is covered the day it is added.
    const appOwn = Object.values(theme.token)
      .map((v) => /^var\((--mb-[a-z-]+)\)$/.exec(v)?.[1])
      .filter((p): p is string => p !== undefined)
      .sort();

    // POSITIVE CONTROL: the extractor found something. Without it, a regex that
    // matched nothing would report full compliance over an empty set.
    expect(appOwn, 'the app-own token extractor matched nothing').toEqual([
      theme.ACCENT_TEXT_PROP,
      theme.CURSOR_PROP,
    ]);

    for (const prop of appOwn) {
      expect(theme.SKIN_LIGHT.vars[prop], `light theme never declares ${prop}`).toBeTruthy();
      expect(theme.SKIN_DARK.vars[prop], `dark theme never declares ${prop}`).toBeTruthy();
    }
  });

  it('🔴 the ground tokens are three DIFFERENT values in each theme', () => {
    // The light-theme collision this skin exists to fix, as an inequality rather than
    // as the hex literals: stock light ships `#fefefe` for `body`, `surface` AND
    // `surface-2`, so a panel in light theme was a border around an identical ground.
    // Asserted in BOTH themes — dark had the same shape between `surface` and
    // `surface-2`.
    for (const [name, skin] of [
      ['light', theme.SKIN_LIGHT],
      ['dark', theme.SKIN_DARK],
    ] as const) {
      const values = GROUND_PROPS.map((p) => skin.vars[p]);
      expect(values.every((v) => typeof v === 'string' && v.length > 0)).toBe(true);
      expect(new Set(values).size, `${name}: the three ground tokens are not distinct`).toBe(
        GROUND_PROPS.length,
      );
    }

    // …and the two themes are not each other: a dark theme whose body matched the
    // light one would satisfy every assertion above.
    expect(theme.SKIN_DARK.vars['--civitai-color-body']).not.toBe(
      theme.SKIN_LIGHT.vars['--civitai-color-body'],
    );
    expect(theme.SKIN_DARK.vars['--civitai-color-text']).not.toBe(
      theme.SKIN_LIGHT.vars['--civitai-color-text'],
    );
  });

  it('🔴 the ACCENT is split: the text accent is never the fill accent', () => {
    // The whole argument on `ACCENT_TEXT_PROP` is that one value cannot do both jobs.
    // If these two are ever made equal the split has been quietly undone, and nothing
    // else in this repo would notice — `token.accent` would still be a distinct
    // `var()` and every structural assertion would still pass.
    for (const [name, skin] of [
      ['light', theme.SKIN_LIGHT],
      ['dark', theme.SKIN_DARK],
    ] as const) {
      expect(
        skin.vars[theme.ACCENT_TEXT_PROP],
        `${name}: the text accent collapsed onto the fill accent`,
      ).not.toBe(skin.vars['--civitai-color-primary']);
    }
  });
});

describe('the emitted skin sheet carries both themes, and wins the cascade by shape', () => {
  const sheet = (): string => theme.skinCss();

  it('🔴 every theme selector carries TWO attributes — the specificity argument', () => {
    // 🔴 NOT COSMETIC. `@civitai/theme`'s own `[data-theme='dark']` / `[data-theme=
    // 'light']` rules are (0,1,0) and land on the VERY element this app stamps
    // `data-theme` on, so a single-attribute selector here would TIE with them and the
    // winner would be decided by whether `injectBlocksStyles()` ran before React
    // committed this `<style>`. These three literals are what keep the skin's win
    // independent of injection order.
    expect(sheet()).toContain(`[${theme.SKIN_ATTR}='true'][data-theme='dark'] {`);
    expect(sheet()).toContain(`[${theme.SKIN_ATTR}='true'][data-theme='light'] {`);
    // …and the unknown-theme fallback, which is DARK — the same answer `bootTheme.ts`
    // and `index.html` give, so the three cannot disagree about an unrecognised host
    // theme string.
    expect(sheet()).toContain(`[${theme.SKIN_ATTR}='true'] {`);
  });

  // 🔴 THIS CASE REPLACES ONE THAT KILLED NOTHING. The deleted case — "the sheet emits
  // every declaration both palettes hold, with a control" — asserted that every value
  // in either palette appeared SOMEWHERE in the sheet. That is satisfiable by any
  // assignment of palettes to blocks, because the sheet has three blocks and only two
  // palettes: putting the LIGHT palette in the unknown-theme fallback leaves every
  // string it looked for still present. MEASURED — and the two readings are separate
  // claims, so both are stated. An audit swapped `skinBlock(SKIN_DARK)` for
  // `skinBlock(SKIN_LIGHT)` in the fallback block at `5daa534` and REPORTED 70 files /
  // 1054 tests all passing. This case was then written and the same mutation
  // re-applied, and the whole suite came back 1 failed / 1060 passed with THIS case the
  // only failure anywhere in it — the same fact from the other direction, and the one
  // measured here rather than taken on report. What a sheet with three theme blocks
  // needs pinned is WHICH PALETTE IS IN WHICH BLOCK, so that is what this asserts, and
  // it subsumes the "every declaration reaches the sheet" claim as a side effect.
  //
  // The fallback is the one that matters most and was the one nothing read:
  // `paintTheme()` (`bootTheme.ts`) passes the HOST's theme string through
  // unvalidated, so a host sending anything but `dark`/`light` matches neither keyed
  // rule and lands here — in production, not hypothetically. `theme.ts` asserts the
  // invariant "unknown means dark here, in `bootTheme.ts` and in `index.html`'s inline
  // script, so the three agree"; this is the only thing that can watch it.
  describe('each theme block carries the palette it claims', () => {
    /**
     * The declaration body of the ONE rule whose selector is EXACTLY `selector`.
     *
     * 🔴 AN `indexOf(selector)` CANNOT DO THIS, which is the whole reason the helper
     * exists. `[data-mb-skin='true']` is a PREFIX of both
     * `[data-mb-skin='true'][data-theme='dark']` and `…[data-theme='light']`, so a
     * substring search for the bare selector returns whichever rule comes first and
     * the case would be about the wrong block. Exact-match on the trimmed selector.
     */
    const ruleBody = (selector: string): string => {
      for (const chunk of sheet().split('}')) {
        const at = chunk.indexOf('{');
        if (at < 0) continue;
        if (chunk.slice(0, at).trim() === selector) return chunk.slice(at + 1);
      }
      throw new Error(`no rule in the sheet has the selector exactly: ${selector}`);
    };

    const FALLBACK = `[${theme.SKIN_ATTR}='true']`;
    const KEYED_DARK = `[${theme.SKIN_ATTR}='true'][data-theme='dark']`;
    const KEYED_LIGHT = `[${theme.SKIN_ATTR}='true'][data-theme='light']`;

    /** The properties the two palettes DISAGREE about — the only ones that can discriminate. */
    const divergent = Object.keys(theme.SKIN_DARK.vars).filter(
      (p) => theme.SKIN_DARK.vars[p] !== theme.SKIN_LIGHT.vars[p],
    );

    it('POSITIVE CONTROL: the extractor tells the three prefix-sharing rules apart', () => {
      // Without this, every assertion below could be reading one block three times.
      const bodies = [ruleBody(FALLBACK), ruleBody(KEYED_DARK), ruleBody(KEYED_LIGHT)];
      for (const b of bodies) expect(b.length).toBeGreaterThan(50);
      // The fallback is the only one carrying the root typographic rule, so it is
      // identifiable independently of any colour.
      expect(bodies[0], 'the extractor did not return the BARE fallback').toContain(
        'font-variant-numeric: tabular-nums;',
      );
      expect(bodies[1]).not.toContain('font-variant-numeric');
      expect(bodies[2]).not.toContain('font-variant-numeric');
      // …and the light block is a different string from the dark ones.
      expect(bodies[2]).not.toBe(bodies[1]);
      // The discrimination below is only real while the palettes actually differ.
      expect(divergent.length, 'the two palettes agree everywhere — nothing to discriminate')
        .toBeGreaterThan(10);
    });

    for (const [name, selector, skin, other] of [
      ['the UNKNOWN-THEME FALLBACK', FALLBACK, theme.SKIN_DARK, theme.SKIN_LIGHT],
      ['the keyed DARK block', KEYED_DARK, theme.SKIN_DARK, theme.SKIN_LIGHT],
      ['the keyed LIGHT block', KEYED_LIGHT, theme.SKIN_LIGHT, theme.SKIN_DARK],
    ] as const) {
      it(`🔴 ${name} declares the ${skin.scheme} palette, and none of the other one`, () => {
        const body = ruleBody(selector);
        expect(body, `${name}: wrong color-scheme`).toContain(`color-scheme: ${skin.scheme};`);
        for (const [prop, value] of Object.entries(skin.vars)) {
          expect(body, `${name}: does not declare ${skin.scheme} ${prop}`).toContain(
            `${prop}: ${value};`,
          );
        }
        // 🔴 THE HALF THAT MAKES IT A DISCRIMINATION RATHER THAN A PRESENCE CHECK.
        // Only the properties the palettes disagree about can say anything: asserting
        // the absence of a value both palettes share would be permanently red.
        for (const prop of divergent) {
          expect(
            body,
            `${name}: declares the ${other.scheme} value of ${prop} — this block paints the wrong palette`,
          ).not.toContain(`${prop}: ${other.vars[prop]};`);
        }
      });
    }

    // NEGATIVE CONTROL — the `toContain`s above can also NOT match. Without it, a
    // sheet that happened to contain every string asked of it would pass over nothing.
    it('NEGATIVE CONTROL: the sheet does not contain an invented property', () => {
      expect(sheet()).not.toContain('--mb-this-property-does-not-exist:');
    });
  });

  it('🔴 LOCKSTEP: the sheet reaches the selectors `compact.ts` owns, by their constants', () => {
    // 🔴 THE SEAM `theme.ts` CANNOT CLOSE BY IMPORTING. `compact.ts` already imports
    // `theme.ts`, so the dependency cannot run the other way and the two attribute
    // selectors below are spelled as LITERALS in the sheet. That makes a rename in
    // `compact.ts` a silently dead rule — the `⋮` trigger back to no resting box, the
    // app's own controls back to no focus ring — with the whole suite green. This is
    // the same two-ends-pinned discipline `navIndentVar` uses.
    const css = sheet();
    expect(css, 'the icon-button rules no longer reach ICON_BUTTON_SELECTOR').toContain(
      ICON_BUTTON_SELECTOR,
    );
    expect(css, 'the focus ring no longer reaches NAV_ITEM_SELECTOR').toContain(
      NAV_ITEM_SELECTOR,
    );
    expect(css, 'the focus ring no longer reaches MENU_ITEM_SELECTOR').toContain(
      MENU_ITEM_SELECTOR,
    );
    // POSITIVE CONTROL for the three above: these constants are not empty strings, and
    // `toContain('')` is true of every sheet ever written.
    for (const sel of [ICON_BUTTON_SELECTOR, NAV_ITEM_SELECTOR, MENU_ITEM_SELECTOR]) {
      expect(sel.length).toBeGreaterThan(1);
    }
  });

  it('🔴 the sheet is SCOPED — no rule can reach the host page', () => {
    // Every rule in this sheet must be under the app root, because a published block
    // renders inside somebody else's document. Walked over the selector of every rule
    // rather than asserted as a count, so a rule added later is covered.
    const selectors = sheet()
      .split('}')
      .map((chunk) => chunk.slice(0, chunk.indexOf('{')).trim())
      .filter((s) => s.length > 0);

    // POSITIVE CONTROL: the splitter found the rules. A parser returning [] would
    // report full compliance.
    expect(selectors.length, 'the rule splitter found no selectors').toBeGreaterThanOrEqual(8);
    for (const sel of selectors) {
      expect(sel, `an unscoped rule can reach the host page: ${sel}`).toContain(
        `[${theme.SKIN_ATTR}='true']`,
      );
    }
  });
});
