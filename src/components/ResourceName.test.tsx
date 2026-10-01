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
// 🔴 THE SPLIT IS THE CONTRACT: `modelId` positive and finite ⇒ a control; absent, 0,
// or non-finite ⇒ the inert `<span>`, byte-for-byte as before. The unlinked half is not
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

// ⚠ NAMESPACE IMPORT, DELIBERATELY, and `theme.test.ts` is the precedent. It keeps
// every case RUNNABLE against a tree where `modelSitePath` does not exist yet — a named
// import of a missing export is a link-time SyntaxError that reddens the whole file,
// which would make "red at base" a fact about module resolution rather than about any
// assertion. With the namespace, each case below failed on its own merits when this
// file was run against `origin/main`'s inert `<span>`, which is what the PR's
// red-at-base matrix reports.
import * as RN from './ResourceName.js';

// 🔴 THE HOOK IS MOCKED HERE, AND ONLY HERE. `ResourceName` out of tree has no SDK
// transport, so the real `useCivitaiNavigate` would throw on press; the modal suite
// drives the REAL hook through the real mock host and reads the actual outbound
// message, which is the stronger claim. This mock exists so the two un-linked cases
// and the shape cases can render at all — it is NOT where the navigate contract is
// settled.
const navigate = vi.fn();
vi.mock('@civitai/blocks-react', () => ({
  useCivitaiNavigate: () => ({ navigate }),
}));

const LINKED = { modelId: 500, versionId: 1001 };

describe('modelSitePath', () => {
  // 🔴 NO LEADING SLASH, AND NO ORIGIN. `scope: 'site'` names the space; this is a
  // path WITHIN it. A leading slash is normalised away by the host in both scopes so
  // it would be harmless, but an absolute `https://civitai.com/...` would be the
  // build-your-own-URL mistake that `ResourceName.tsx`'s route 3 is about.
  it('version-pins the path when there is a version', () => {
    expect(RN.modelSitePath(500, 1001)).toBe('models/500?modelVersionId=1001');
  });

  it('omits the query when there is no usable version', () => {
    // Each of these addresses nothing, so none of them may reach the query string.
    expect(RN.modelSitePath(500)).toBe('models/500');
    expect(RN.modelSitePath(500, 0)).toBe('models/500');
    expect(RN.modelSitePath(500, Number.NaN)).toBe('models/500');
    expect(RN.modelSitePath(500, -3)).toBe('models/500');
  });
});

describe('ResourceName — LINKED (a usable modelId)', () => {
  it('renders a button that reads as a link and says where it goes', () => {
    render(<RN.ResourceName name="JuggernautXL" {...LINKED} />);
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

  it('🔴 carries the affordance a touch viewer can see, and a focus ring', async () => {
    // A pointer cursor is invisible until the pointer is already on the control and
    // never appears at all on a touch device — the argument `gridDrillIn.test.tsx`
    // records for the matchup band. So the underline is the load-bearing one.
    render(<RN.ResourceName name="JuggernautXL" {...LINKED} />);
    const el = screen.getByTestId('resource-name');
    expect(el).toHaveStyle({ textDecoration: 'underline' });
    expect(el).not.toHaveStyle({ textDecoration: 'none' });
    expect(el).toHaveStyle({ cursor: 'pointer' });

    // ⚠️ `:focus`, NOT `:focus-visible`, and the component says why: this app has no
    // component stylesheet (nothing in `src/` uses `className`), so an inline style
    // cannot express a pseudo-class. jsdom performs no layout, so this reads the
    // DECLARED style — it cannot say the ring is VISIBLE, only that it is declared,
    // and only that it appears on focus and not before.
    expect(el).toHaveStyle({ outline: 'none' });
    await userEvent.tab();
    expect(el).toHaveFocus();
    expect(el).not.toHaveStyle({ outline: 'none' });
  });

  it('asks the host to resolve the path at the SITE root', async () => {
    navigate.mockClear();
    render(<RN.ResourceName name="JuggernautXL" {...LINKED} />);
    await userEvent.click(screen.getByTestId('resource-name'));
    // The whole call, by value. `scope` is the field a mutant drops silently — the SDK
    // omits it when unset and the host then resolves the path under THIS APP's route,
    // which is the pre-#5250 behaviour returning with nothing to show for it.
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('models/500?modelVersionId=1001', {
      scope: 'site',
    });
  });

  it('drops the version from the path when there is none, and still links', async () => {
    navigate.mockClear();
    render(<RN.ResourceName name="JuggernautXL" modelId={500} />);
    await userEvent.click(screen.getByTestId('resource-name'));
    expect(navigate).toHaveBeenCalledWith('models/500', { scope: 'site' });
  });

  it('🔴 a caller cannot switch the underline off, but keeps its typography', () => {
    // `MatchupBody` passes typography for the checkpoint title. The declaration wins
    // over the spread for the same reason the unlinked branch's `'none'` does: the one
    // thing that says "this is a control" must not be a caller's to remove.
    render(
      <RN.ResourceName
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
  // 🔴 EVERY ASSERTION IN THIS BLOCK IS THE PRE-#5250 CONTRACT, CARRIED OVER
  // UNCHANGED. It is not "the old test kept for sentiment": a LoRA published before
  // `LoraRef.modelId` existed can never be backfilled, so this is the shape a real
  // row on the live board renders as today and will render as forever.

  it('renders the name as plain, un-underlined text', () => {
    render(<RN.ResourceName name="Old Tweaker" />);
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
    render(<RN.ResourceName name="Old Tweaker" />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
    expect(document.querySelector('a, button')).toBeNull();
    expect(screen.getByTestId('resource-name')).not.toHaveAttribute('role');
  });

  it('🔴 pressing it asks the host for nothing', async () => {
    navigate.mockClear();
    render(<RN.ResourceName name="Old Tweaker" />);
    await userEvent.click(screen.getByTestId('resource-name'));
    expect(navigate).not.toHaveBeenCalled();
  });

  it('🔴 treats 0, NaN and a negative id as no id at all', async () => {
    // `0` IS REACHABLE, not hypothetical: `MatchupForm.tsx`'s `loraInfo()` coerces a
    // missing id with `modelId ?? 0` to satisfy upstream's `BlockResourceInfo`. A
    // truthiness test would already reject `0`; `NaN` and a negative need the explicit
    // positive-and-finite rule, and neither addresses a model page.
    for (const modelId of [0, Number.NaN, -1, Number.POSITIVE_INFINITY]) {
      navigate.mockClear();
      const { unmount } = render(<RN.ResourceName name="Junk" modelId={modelId} />);
      const el = screen.getByTestId('resource-name');
      expect(el.tagName, `modelId ${String(modelId)} became a control`).toBe('SPAN');
      expect(el).toHaveStyle({ textDecoration: 'none' });
      await userEvent.click(el);
      expect(navigate, `modelId ${String(modelId)} navigated`).not.toHaveBeenCalled();
      unmount();
    }
  });

  it('a versionId alone does not make it a link', () => {
    // There is no page at `/models/?modelVersionId=…`, so a version without a model is
    // still nothing to link to.
    render(<RN.ResourceName name="Old Tweaker" versionId={4004} />);
    expect(screen.getByTestId('resource-name').tagName).toBe('SPAN');
  });

  it('🔴 a caller cannot switch the un-underlined state off', () => {
    render(
      <RN.ResourceName
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
