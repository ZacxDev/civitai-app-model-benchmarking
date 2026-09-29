// A resource title is plain text, for EVERY resource.
//
// ⚠ THIS FILE REPLACES `ResourceLink.test.tsx`, WHICH ASSERTED THE OPPOSITE and is
// deleted rather than edited into silence. That file pinned a `<button>` calling
// `useCivitaiNavigate(..., 'current')`, an underline, and a `NAVIGATE` payload. All
// of it was correct about the component and wrong about the world: the operator
// measured the live iframe as `sandbox="allow-scripts allow-forms"` — no
// `allow-same-origin`, so `trustTier: 'unverified'` — which shuts the last of the
// three routes out of the frame. `lib/resourceLink.ts` carries the whole record.
//
// 🔴 THE CONTRACT INVERTED, so the guards had to invert with it. What used to be
// the special case ("a LoRA with no `modelId` renders no link") is now the ONLY
// case, and the interesting assertion is no longer "is this one linked?" but "is
// ANY of them?".

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ResourceName } from './ResourceName.js';

describe('ResourceName', () => {
  it('renders the name as plain, un-underlined text', () => {
    render(<ResourceName name="JuggernautXL" />);
    const el = screen.getByTestId('resource-name');
    expect(el).toHaveTextContent('JuggernautXL');
    expect(el.tagName).toBe('SPAN');
    // 🔴 THE UNDERLINE IS THE WHOLE TELL. It is what would say "this is a control"
    // to a viewer, and there is no control behind it.
    expect(el).toHaveStyle({ textDecoration: 'none' });
  });

  it('🔴 renders NO interactive element — three independent readings', () => {
    // Each reading is walkable by a different mistake on its own: a testid says
    // nothing about an `<a>`, a tag check says nothing about `role="button"`, and a
    // role query says nothing about a `<span onClick>` with no role at all. The
    // fourth line covers that last one.
    render(<ResourceName name="Detail Tweaker" />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
    expect(document.querySelector('a, button')).toBeNull();
    expect(screen.getByTestId('resource-name')).not.toHaveAttribute('role');
  });

  it('🔴 a caller cannot switch the un-underlined state off', () => {
    // `MatchupBody` passes typography for the checkpoint title. A caller style
    // spread AFTER the declaration would let any call site reintroduce the exact
    // dead affordance this component exists to prevent — so the declaration wins.
    render(
      <ResourceName
        name="JuggernautXL"
        style={{ fontSize: 13, fontWeight: 600, textDecoration: 'underline' }}
      />,
    );
    const el = screen.getByTestId('resource-name');
    expect(el).toHaveStyle({ textDecoration: 'none' });
    // …while the caller's own typography DOES apply, so this is a targeted
    // override and not the component ignoring `style` altogether.
    expect(el).toHaveStyle({ fontWeight: '600' });
  });

  it('does not vary on anything — two different resources render the same shape', () => {
    // 🔴 THE POINT OF THIS CASE. There is no longer a linked/unlinked split, so
    // two resources that used to differ (one with a `modelId`, one without) must
    // now be INDISTINGUISHABLE in the DOM. A component that still branched
    // internally would show up here.
    const { container: a } = render(<ResourceName name="Alpha" />);
    const { container: b } = render(<ResourceName name="Beta" />);
    expect(a.innerHTML.replace('Alpha', 'X')).toBe(b.innerHTML.replace('Beta', 'X'));
  });
});
