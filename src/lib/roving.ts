// Arrow-key roving: where does focus go next?
//
// 🔴 WHY THIS IS A MODULE AND NOT TWO INLINE EXPRESSIONS. It was open-coded in
// `components/Menu.tsx` and `components/SideNav.tsx`, byte-for-byte identically:
//
//     const i = items.indexOf(document.activeElement as HTMLElement);
//     const step = e.key === 'ArrowDown' ? 1 : -1;
//     items[(i + step + items.length) % items.length]!.focus();
//
// …and it was WRONG at both sites in the same way, which is the shape this repo's
// "one rule, one place" rule exists for: a predicate duplicated across call sites
// regenerates the same bug at every site, and unifying them is what makes the
// disagreement audible. `indexOf` returns **-1** when `document.activeElement` is
// not one of the items, and `(-1 - 1 + n) % n` is `n - 2` — so ArrowUp from outside
// the set lands on the SECOND-TO-LAST item instead of the last. ArrowDown was right
// by coincidence: `(-1 + 1 + n) % n` is `0`, which is the first item.
//
// ⚠️ REACHABILITY, STATED HONESTLY RATHER THAN IMPLIED. Through TODAY'S production
// call sites the `-1` branch is not reachable, and both fixes are therefore
// INVARIANT GUARDS rather than regression fixes:
//
//   - `SideNav`'s handler is on the `<nav>`, and the only focusable descendants are
//     the nav items themselves, so the event's target is always in the set.
//   - `Menu`'s handler is on the panel, and everything focusable inside it
//     (`role="menuitem"` items, and buttons inside a `MenuControl`) is matched by
//     `MENU_FOCUSABLE_SELECTOR`. The one panel child that is focusable and NOT
//     matched — `ReportButton`'s settled `<span tabIndex={-1}>` — only ever appears
//     in a panel whose item set is otherwise EMPTY (Report is offered exactly when
//     Edit and Remove are not), and both handlers return early on an empty set.
//
// So the fix buys correctness for the next control added to either panel, not a bug
// a viewer can hit today. It is still worth making, because it is one expression in
// one place instead of two, and because the next person to add a focusable non-item
// to a menu should not have to rediscover the arithmetic.

/**
 * The index to move focus to, for one arrow-key press.
 *
 * @param count how many focusable items there are. Callers MUST have checked this is
 *   positive; `-1` is returned for an empty set so a caller that forgets gets an
 *   out-of-range read rather than index 0 (i.e. a silent focus jump).
 * @param current the index of the currently-focused item, or `-1` when focus is not
 *   on any of them — exactly what `Array.prototype.indexOf` returns.
 * @param step `1` for ArrowDown/next, `-1` for ArrowUp/previous.
 *
 * 🔴 THE `current === -1` CASE IS THE WHOLE REASON THIS FUNCTION EXISTS: next goes to
 * the FIRST item and previous to the LAST, which is what both W3C APG menu and
 * listbox patterns specify for entering a set from outside it. A bare
 * `(current + step + count) % count` gets next right and previous wrong.
 */
export function rovingTarget(count: number, current: number, step: 1 | -1): number {
  if (count <= 0) return -1;
  if (current < 0) return step === 1 ? 0 : count - 1;
  return (current + step + count) % count;
}
