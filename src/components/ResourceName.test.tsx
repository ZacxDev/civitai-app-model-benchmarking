// A resource title is a LINK when it has a model id, and plain text when it does not.
//
// ⚠ THIS FILE HAS HELD BOTH CONTRACTS. It replaced `ResourceLink.test.tsx` (which
// pinned a `<button>`, an underline and a `NAVIGATE` payload) when every route out of
// a block's sandboxed iframe turned out to be shut, and asserted a single inert
// `<span>` for every resource. `civitai/civitai` **#5250** shipped `scope: 'site'` on
// `NAVIGATE`, so the linked branch is back — but NOT unconditionally, and that is the
// interesting part. `./ResourceName.tsx`'s header carries the whole record, including
// the `private-run` surface where site navigation is refused and the block cannot tell.
//
// 🔴 THE SPLIT IS THE CONTRACT: `modelId` a positive SAFE INTEGER ⇒ a control; anything
// else (absent, 0, negative, fractional, non-finite, or beyond 2^53-1) ⇒ the inert
// `<span>`, byte-for-byte as before. The unlinked half is not
// a legacy branch waiting to be deleted — `LoraRef.modelId` is optional FOREVER (see
// `../types.ts`: a shared row belongs to its author, so rows published before the field
// existed can never be backfilled), so both halves are permanent and both are pinned.
//
// ⚠ WHAT THIS FILE CANNOT SETTLE, and why `../matchupModalResources.test.tsx` exists:
// nothing here proves the MODAL passes the right ids, or passes them at all. A
// component that is perfect in isolation and a caller that forgets a prop are a green
// suite and a dead feature.

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

// A NAMED import, which it was not for one draft. The namespace form existed so a
// not-yet-exported `modelSitePath` could not redden the whole file at link time — and
// that export is now gone (see `./ResourceName.tsx`), so the reason went with it.
// `ResourceName` itself exists on `origin/main`, so this file imports and runs cleanly
// against the base component.
//
// 🔴 AND WHAT IT DOES THERE SPLITS EXACTLY ALONG THE TWO BLOCKS BELOW, which is worth
// stating because a draft of this paragraph claimed "every case below still failed on
// its own merits" — an overclaim, and one this file's own UNLINKED header contradicts
// a hundred lines down. `origin/main`'s component is `ResourceName({ name, style })`:
// it declares no `modelId`/`versionId` props and always returns the `<span>`. So the
// four LINKED cases fail there on their own merits — real regression coverage — and the
// four UNLINKED ones PASS, because they pin precisely the shape the base component
// already has. They are INVARIANT GUARDS against `origin/main`, and counting them as
// regression coverage is the one mislabeling this PR is otherwise careful to avoid.
//
// ⚠️ TWO BASELINES, AND THEY DO NOT CONTRADICT. The paragraph above grades against
// `origin/main`. Three entries added later to the id-junk case (`1.5`, `1e21`,
// `5e-324`) are real regression coverage against a DIFFERENT baseline: this PR's own
// first predicate, `Number.isFinite(id) && id > 0`, under which each one rendered the
// interactive `<button>`. Against `origin/main` they are invariant guards like their
// neighbours, because nothing there has a `modelId` prop at all. Say which baseline
// whenever you grade a case in this file.
import { ResourceName } from './ResourceName.js';

// 🔴 THE HOOK IS MOCKED HERE, AND ONLY HERE. `ResourceName` out of tree has no SDK
// transport, so the real `useCivitaiNavigate` would throw on press; the modal suite
// drives the REAL hook through the real mock host and reads the actual outbound
// message, which is the stronger claim. This mock exists so the cases below can render
// and press at all — it is NOT where the navigate contract is settled, and a case that
// only re-asserts a payload the modal suite already reads off the real transport has
// been deleted rather than kept for symmetry.
const navigate = vi.fn();
vi.mock('@civitai/blocks-react', () => ({
  useCivitaiNavigate: () => ({ navigate }),
}));

const LINKED = { modelId: 500, versionId: 1001 };

describe('ResourceName — LINKED (a usable modelId)', () => {
  it('renders a button that reads as a link and says where it goes', () => {
    render(<ResourceName name="JuggernautXL" {...LINKED} />);
    const el = screen.getByTestId('resource-name');

    expect(el).toHaveTextContent('JuggernautXL');
    // 🔴 A BUTTON, NOT AN ANCHOR. An `<a href>` in this sandboxed iframe navigates the
    // IFRAME — replacing the running block with an opaque-origin, logged-out
    // civitai.com inside the app frame. See `./ResourceName.tsx` route 3.
    expect(el.tagName).toBe('BUTTON');
    expect(el).toHaveAttribute('type', 'button');
    expect(document.querySelector('a')).toBeNull();
    // 🔴 NO `role="link"` ON A BUTTON. It would promise middle-click, copy-link-address
    // and a status-bar URL, none of which a host-mediated message can deliver.
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByRole('button')).toBe(el);
    // The accessible name is NOT the bare model name: the viewer is about to leave the
    // app and the control has to say so.
    expect(el).toHaveAccessibleName('Open JuggernautXL on Civitai');
  });

  it('🔴 carries the affordance a touch viewer can see, and does NOT suppress the focus ring', async () => {
    // A pointer cursor is invisible until the pointer is already on the control and
    // never appears at all on a touch device — the argument `gridDrillIn.test.tsx`
    // records for the matchup band. So the underline is the load-bearing one.
    render(<ResourceName name="JuggernautXL" {...LINKED} />);
    const el = screen.getByTestId('resource-name');
    expect(el).toHaveStyle({ textDecoration: 'underline' });
    expect(el).not.toHaveStyle({ textDecoration: 'none' });
    expect(el).toHaveStyle({ cursor: 'pointer' });

    // 🔴 THE FOCUS ASSERTION IS AN ABSENCE, AND IT ASSERTS THE STATE RATHER THAN A
    // SPELLING. Nothing in this app or the pack suppresses the UA's `:focus-visible`
    // ring on this button (measured — see `./ResourceName.tsx`), so the component
    // declares no `outline` of any kind and the UA supplies the ring. The regression to
    // guard is a REAPPEARING suppression, which is what a future tidy-up of the
    // button's chrome would reach for and which an earlier draft of this component
    // shipped.
    //
    // ⚠️ THIS LINE USED TO BE `expect(el).not.toHaveStyle({ outline: 'none' })`, AND
    // THAT GUARD WAS WALKABLE BY REWORDING. Measured one mutant at a time against the
    // button's style object, with that assertion in place: `outline: 'none'` KILLED,
    // but `outline: 0`, `outlineStyle: 'none'` and `outlineWidth: 0` each SURVIVED a
    // full green file (8/8). All three suppress the UA ring exactly as `'none'` does,
    // and `outline: 0` is the *more* common reset idiom — so the guard read as coverage
    // while leaving the likelier spelling open. Enumerating the DECLARED property names
    // closes the whole family instead of the one word: a suppression has to be spelled
    // as some `outline*` property to exist at all, and none may be present.
    //
    // ⚠️ `Array.from(el.style)` is the authored-longhand list, not a computed cascade.
    // Measured in this jsdom: a React `{ outline: 'none' }` yields `['outline']` and is
    // NOT expanded into `outline-color/-style/-width`, so a prefix test over the
    // declared names sees each of the four spellings as itself.
    //
    // ⚠️ jsdom performs no layout and renders no UA focus ring, so this CANNOT say the
    // ring is visible — only that the component declares nothing that would switch it
    // off, and that the control is reachable by keyboard at all.
    expect(
      Array.from(el.style).filter((prop) => prop.startsWith('outline')),
      'the button declares an outline property — that is the focus ring being suppressed',
    ).toEqual([]);
    await userEvent.tab();
    expect(el).toHaveFocus();
  });

  it('drops the version from the path when there is none, and still links', async () => {
    // ⚠️ A SIBLING CASE WAS DELETED HERE, not forgotten: it rendered the full
    // `{ modelId, versionId }` pair, pressed it, and asserted
    // `toHaveBeenCalledWith('models/500?modelVersionId=1001', { scope: 'site' })`
    // against this file's `vi.fn()`. `../matchupModalResources.test.tsx` asserts that
    // SAME payload through the REAL hook and the real transport, which strictly
    // dominates a mock, so the case bought nothing but a second place to update.
    // What survives here is the branch the modal's fixtures do NOT exercise: an id
    // with no usable version. `versionId` is required on both ref types, but
    // `lib/benchmark.ts`'s `isNum` admits `0`, so a wire row can carry one.
    //
    // 🔴 THE SAME `usableId` GATES BOTH FIELDS, so the junk magnitudes belong here too:
    // a fractional or exponential-notation version would otherwise reach the query
    // string as `?modelVersionId=1e+21` and pin the link to a version that does not
    // exist. Dropping it lands on the model's default version — a real page — which is
    // the right failure for a field that only refines the destination.
    for (const versionId of [undefined, 0, Number.NaN, -3, 1.5, 1e21, 5e-324]) {
      navigate.mockClear();
      const { unmount } = render(<ResourceName name="JuggernautXL" modelId={500} versionId={versionId} />);
      await userEvent.click(screen.getByTestId('resource-name'));
      expect(navigate, `versionId ${String(versionId)} reached the query string`).toHaveBeenCalledWith(
        'models/500',
        { scope: 'site' },
      );
      unmount();
    }
  });

  it('🔴 a caller cannot switch the underline off, but keeps its typography', () => {
    // `MatchupBody` passes typography for the checkpoint title. The declaration wins
    // over the spread for the same reason the unlinked branch's `'none'` does: the one
    // thing that says "this is a control" must not be a caller's to remove.
    render(
      <ResourceName
        name="JuggernautXL"
        {...LINKED}
        style={{ fontSize: 13, fontWeight: 600, textDecoration: 'none', cursor: 'default' }}
      />,
    );
    const el = screen.getByTestId('resource-name');
    expect(el).toHaveStyle({ textDecoration: 'underline' });
    expect(el).toHaveStyle({ cursor: 'pointer' });
    expect(el).toHaveStyle({ fontWeight: '600' });
  });
});

describe('ResourceName — UNLINKED (no usable modelId)', () => {
  // 🔴 MOST OF THIS BLOCK IS THE PRE-#5250 CONTRACT, CARRIED OVER UNCHANGED, AND IT IS
  // AN INVARIANT GUARD RATHER THAN REGRESSION COVERAGE. It is not "the old test kept
  // for sentiment": a LoRA published before `LoraRef.modelId` existed can never be
  // backfilled, so this is the shape a real row on the live board renders as today and
  // will render as forever.
  //
  // ⚠️ THE ONE EXCEPTION IS LABELLED WHERE IT LIVES. The last three entries of the
  // id-junk case below (`1.5`, `1e21`, `5e-324`) are REAL regression coverage: each was
  // watched rendering the interactive `<button>` against the predicate this file was
  // first written for. Counting the rest of this block as regression coverage would be
  // the one mislabeling this PR is otherwise careful to avoid.

  it('renders the name as plain, un-underlined text', () => {
    render(<ResourceName name="Old Tweaker" />);
    const el = screen.getByTestId('resource-name');
    expect(el).toHaveTextContent('Old Tweaker');
    expect(el.tagName).toBe('SPAN');
    // 🔴 THE UNDERLINE IS THE WHOLE TELL. It is what would say "this is a control"
    // to a viewer, and there is no control behind it.
    expect(el).toHaveStyle({ textDecoration: 'none' });
  });

  it('🔴 renders NO interactive element — four independent readings', () => {
    // Each reading is walkable by a different mistake on its own: a testid says
    // nothing about an `<a>`, a tag check says nothing about `role="button"`, and a
    // role query says nothing about a `<span onClick>` with no role at all. The
    // fourth line covers that last one; the press below covers it behaviourally.
    render(<ResourceName name="Old Tweaker" />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
    expect(document.querySelector('a, button')).toBeNull();
    expect(screen.getByTestId('resource-name')).not.toHaveAttribute('role');
  });

  it('🔴 treats every id that addresses no page as no id at all', async () => {
    // 🔴 THE JUNK IS WIRE-REACHABLE, and an earlier draft of this comment named the
    // wrong route. It said `MatchupForm.tsx`'s `loraInfo()` coerces a missing id with
    // `modelId ?? 0` — true, but that value only ever reaches upstream's
    // `ResourceCard` and `resourceDisplayName`, never a `LoraRef` and so never this
    // prop. The real route is the shared board: `data` is an opaque blob written by
    // other clients, and `lib/benchmark.ts`'s `isNum` is `typeof v === 'number' &&
    // Number.isFinite(v)`, which admits `0`, negatives, fractions and
    // exponential-notation magnitudes alike — so `parseCheckpoint` accepts any of them
    // and `parseLoras` carries one through.
    //
    // 🔴 THE LAST THREE ENTRIES ARE A REGRESSION, NOT A WIDENING FOR TIDINESS. Against
    // the predicate this file was first written for — `Number.isFinite(id) && id > 0` —
    // each one rendered the interactive `<button>` and built a path the host accepts:
    // `models/1.5`, `models/1e+21`, `models/5e-324`. A viewer pressing an underlined
    // control there loses their modal and their place in the grid and lands on a
    // non-page, which is strictly worse than the plain text the row would otherwise
    // have shown. ⚠️ `1e21` is the one that also defeats a plain integer test:
    // `Number.isInteger(1e21)` is `true`, so only the safe-integer bound rejects it.
    //
    // A truthiness test would already reject `0`; the negative is the case that needs
    // the explicit `> 0`, because `isNum` passes it just as readily. `{ versionId }`
    // alone is the one deleted sibling case worth keeping: a `versionId` with NO
    // `modelId` is still nothing to link to (there is no page at
    // `models/?modelVersionId=…`), and it is also the only input that could catch a
    // branch on the wrong field.
    const cases: { modelId?: number; versionId?: number }[] = [
      { modelId: 0 },
      { modelId: Number.NaN },
      { modelId: -1 },
      { modelId: Number.POSITIVE_INFINITY },
      { versionId: 4004 },
      { modelId: 1.5, versionId: 1001 },
      { modelId: 1e21, versionId: 1001 },
      { modelId: 5e-324, versionId: 1001 },
    ];
    for (const props of cases) {
      const label = JSON.stringify(props);
      navigate.mockClear();
      const { unmount } = render(<ResourceName name="Junk" {...props} />);
      const el = screen.getByTestId('resource-name');
      expect(el.tagName, `${label} became a control`).toBe('SPAN');
      expect(el).toHaveStyle({ textDecoration: 'none' });
      // The behavioural half, which is what the deleted `'pressing it asks the host
      // for nothing'` case covered on its own with `modelId: undefined` — an input
      // already covered structurally two cases above. Folded in here it costs one
      // line and covers five inputs instead of one.
      await userEvent.click(el);
      expect(navigate, `${label} navigated`).not.toHaveBeenCalled();
      unmount();
    }
  });

  it('🔴 a caller cannot switch the un-underlined state off', () => {
    render(
      <ResourceName
        name="Old Tweaker"
        style={{ fontSize: 13, fontWeight: 600, textDecoration: 'underline' }}
      />,
    );
    const el = screen.getByTestId('resource-name');
    expect(el).toHaveStyle({ textDecoration: 'none' });
    // …while the caller's own typography DOES apply, so this is a targeted
    // override and not the component ignoring `style` altogether.
    expect(el).toHaveStyle({ fontWeight: '600' });
  });
});
