// `rovingTarget` — the shared arrow-key index arithmetic.
//
// 🔴 WHY THIS FILE EXISTS RATHER THAN TWO COMPONENT CASES. The expression was open-coded
// in `components/Menu.tsx` and `components/SideNav.tsx` and wrong at BOTH sites in the
// same way. Consolidating it is the fix; this is the guard on the consolidated version,
// and it can reach the `current === -1` branch directly — which is the branch neither
// component's production call sites can currently produce (see `lib/roving.ts` for the
// traced reason, stated there rather than implied).
//
// ⚠️ SO THE `-1` CASES BELOW ARE AN **INVARIANT GUARD**, not regression coverage: they
// pin behaviour no viewer can currently observe. The WRAP cases are different — they are
// exercised on every ArrowDown/ArrowUp through both components, and
// `Menu.test.tsx`'s two roving cases drive them against the real DOM.
//
// 🔴 EVERY EXPECTED VALUE IS WRITTEN OUT, never computed from the implementation's own
// formula. A test that says `expect(rovingTarget(n, i, s)).toBe((i + s + n) % n)` asserts
// nothing at all.

import { describe, expect, it } from 'vitest';

import { rovingTarget } from './roving.js';

describe('rovingTarget', () => {
  it('steps forward and wraps at the end', () => {
    expect(rovingTarget(3, 0, 1)).toBe(1);
    expect(rovingTarget(3, 1, 1)).toBe(2);
    expect(rovingTarget(3, 2, 1)).toBe(0);
  });

  it('steps backward and wraps at the start', () => {
    expect(rovingTarget(3, 2, -1)).toBe(1);
    expect(rovingTarget(3, 1, -1)).toBe(0);
    expect(rovingTarget(3, 0, -1)).toBe(2);
  });

  it('🔴 INVARIANT GUARD: entering from OUTSIDE the set goes first / LAST, not n-2', () => {
    // 🔴 THIS IS THE BUG. The open-coded `(current + step + count) % count` gives 0 for
    // next (right) and `count - 2` for previous (wrong) when `current` is -1, which is
    // what `indexOf` returns for an element that is not in the list.
    expect(rovingTarget(3, -1, 1)).toBe(0);
    expect(rovingTarget(3, -1, -1)).toBe(2);
    // …and the old formula's answer is written out so the difference is legible rather
    // than asserted by absence: at count 3 it was 1, the MIDDLE item.
    //
    // ⚠️ THE THREE `expect((…) % …)` LINES IN THIS CASE ARE NOT GUARDS AND CANNOT BE RED.
    // They assert literal arithmetic over literal numbers, so no change to this repo can
    // move them; they are here to put the WRONG answer beside the right one in the
    // reader's eye. Do not count them when counting this case's coverage — the guards are
    // the `rovingTarget(...)` calls.
    expect((-1 + -1 + 3) % 3).toBe(1);
    expect(rovingTarget(3, -1, -1)).not.toBe(1);
    // 🔴 AT A COUNT WHERE THE TWO CANNOT COINCIDE BY ACCIDENT. With count 2 the buggy
    // answer is 0 and the correct one is 1, so a fixture of 2 discriminates; with
    // count 1 both are 0 and it does NOT. Both are checked so the boundary is stated.
    expect(rovingTarget(2, -1, -1)).toBe(1);
    expect((-1 + -1 + 2) % 2).toBe(0);
    expect(rovingTarget(1, -1, -1)).toBe(0);
  });

  it('a single item is its own next and previous', () => {
    expect(rovingTarget(1, 0, 1)).toBe(0);
    expect(rovingTarget(1, 0, -1)).toBe(0);
  });

  it('🔴 an EMPTY set returns -1, never 0 — a caller that forgot to guard must not focus', () => {
    // Returning 0 here would hand `items[0]` to a caller with no items, i.e. `undefined`
    // and a throw at the `!` — or, worse, a silent focus move if the list later grew.
    // Both production callers return early on an empty set; this is the backstop.
    expect(rovingTarget(0, -1, 1)).toBe(-1);
    expect(rovingTarget(0, -1, -1)).toBe(-1);
    expect(rovingTarget(0, 0, 1)).toBe(-1);
  });
});
