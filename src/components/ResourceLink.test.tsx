// A resource title that navigates — and the permanent state where it cannot.
//
// 🔴 A BRAND-NEW FILE, SO NONE OF IT IS RED AT BASE (`components/ResourceLink.tsx`
// does not exist on `zach/ia-feedback-sidebar`). Said plainly because "N new cases,
// all green" is not a red/green matrix and must not be reported as one.
//
// 🔴 THE `navigate` ASSERTION GOES THROUGH THE REAL HOOK AND THE REAL TRANSPORT.
// `useCivitaiNavigate` is not stubbed here: the component is mounted inside the mock
// host and the outbound `NAVIGATE` message is read off `onOutbound`. A `vi.mock` of
// the hook would have asserted that this app calls a function this app defines, and
// would have stayed green through a wrong message type, a dropped `target`, or a
// payload the host cannot parse.
//
// ⚠ WHAT NO TEST HERE CAN SETTLE: whether the navigation LANDS. The message is
// fire-and-forget (the host sends no reply), and the only host that bridges it
// rewrites the path into the app's own sub-path space — measured, and recorded in
// `lib/resourceLink.ts`. So these cases pin what the app ASKS FOR, which is the only
// half that is ours.

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Harness } from '../test-harness.js';
import { ResourceLink } from './ResourceLink.js';

function mount(ui: React.ReactNode, onOutbound?: (m: { type: string; payload?: unknown }) => void) {
  return render(
    <Harness
      viewer={{ id: 99, username: 'me' }}
      theme="dark"
      showLog={false}
      {...(onOutbound ? { onOutbound } : {})}
    >
      {ui}
    </Harness>,
  );
}

describe('ResourceLink — a resource WITH a model id', () => {
  it('renders a link-styled control, underlined, naming the resource', () => {
    mount(<ResourceLink name="JuggernautXL" modelId={500} versionId={1001} />);
    const link = screen.getByTestId('resource-link');
    // Literal expected value, not derived: the visible text is inside the accessible
    // name (WCAG 2.5.3 Label in Name) AND the name says pressing it leaves the app.
    expect(link).toHaveAccessibleName('Open JuggernautXL on Civitai');
    expect(link).toHaveTextContent('JuggernautXL');
    // 🔴 THE UNDERLINE IS THE AFFORDANCE, and it is the only thing separating this
    // state from the un-linkable one below.
    expect(link).toHaveStyle({ textDecoration: 'underline' });
    expect(screen.queryByTestId('resource-plain')).toBeNull();
  });

  it('🔴 keeps the underline when the caller passes its own typography', () => {
    // `MatchupBody` passes `{ fontSize, fontWeight }` for the checkpoint title. A
    // caller style spread AFTER the affordance would let any caller silently switch
    // the underline off — and an un-underlined link is exactly the state this
    // component exists to make impossible.
    mount(
      <ResourceLink
        name="JuggernautXL"
        modelId={500}
        versionId={1001}
        style={{ fontSize: 13, fontWeight: 600, textDecoration: 'none' }}
      />,
    );
    expect(screen.getByTestId('resource-link')).toHaveStyle({ textDecoration: 'underline' });
  });

  it('asks the host to navigate to the version-pinned model page, in the CURRENT frame', async () => {
    const seen: { type: string; payload?: unknown }[] = [];
    mount(<ResourceLink name="JuggernautXL" modelId={500} versionId={1001} />, (m) => seen.push(m));
    await userEvent.click(screen.getByTestId('resource-link'));

    // POSITIVE CONTROL on the observer itself: the mock host reports RESIZE and the
    // handshake too, so a zero here would mean the hook never reached the transport
    // — indistinguishable, without this, from a filter that matched nothing.
    expect(seen.length, 'the outbound observer saw nothing at all').toBeGreaterThan(0);

    const navs = seen.filter((m) => m.type === 'NAVIGATE');
    expect(navs).toHaveLength(1);
    // 🔴 LITERALS. `'current'` is the operator's decision and it is NOT the same as
    // omitting the argument: `'new_tab'` is unobtainable for every app block (no
    // host bridges the target, and `allow-popups-to-escape-sandbox` is not in
    // upstream's `ALLOWED_SANDBOX_TOKENS`), so a silent default would hide which of
    // the two this app asked for.
    expect(navs[0]!.payload).toEqual({
      path: '/models/500?modelVersionId=1001',
      target: 'current',
    });
  });
});

describe('ResourceLink — a resource with NO model id (permanent, not transitional)', () => {
  it('🔴 renders plain, un-underlined text and NO interactive element at all', async () => {
    // Every LoRA published before `LoraRef.modelId` existed lacks it forever — a
    // published shared row belongs to its author, so nothing can backfill it. The
    // underline is what separates "not a link" from "a link that is broken", and a
    // disabled-looking button would be a control that teaches a viewer nothing.
    const onOutbound = vi.fn();
    mount(<ResourceLink name="Detail Tweaker" />, onOutbound);

    const plain = screen.getByTestId('resource-plain');
    expect(plain).toHaveTextContent('Detail Tweaker');
    expect(plain).toHaveStyle({ textDecoration: 'none' });

    // ABSENCE FROM THE DOM, on three independent readings — a testid, a tag name and
    // a role — because each on its own is walkable by a different mistake.
    expect(screen.queryByTestId('resource-link')).toBeNull();
    expect(plain.tagName).toBe('SPAN');
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();

    // …and nothing is navigable: clicking the text sends no NAVIGATE.
    await userEvent.click(plain);
    expect(onOutbound.mock.calls.map(([m]) => m.type)).not.toContain('NAVIGATE');
  });
});
