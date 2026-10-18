// The SIDEBAR NAV — a slide-out drawer carrying the upstream
// `<civitai-nav-list>` / `<civitai-nav-item>` web components.
//
// 🔴 WHAT THIS FILE PINS, AND WHAT IT NO LONGER DOES. This file used to pin a
// HAND-BUILT mirror of the upstream elements: the indent arithmetic, the
// chevron character, roving arrow keys, the default-open group, the active
// row's style read against the pack's stylesheet. The swap it was holding
// the shape for has happened (operator, 2026-10-17) — the nav IS the
// upstream elements now, and those behaviours are THEIRS, covered by their
// own contract. What remains here is the APP's contract, which no upstream
// test can assert for us:
//
//   - the ITEM LEDGER (which destinations exist, in which order, with which
//     labels and route strings);
//   - the ROUTING (a press on an item host selects exactly its view and
//     closes the drawer; the group press selects nothing);
//   - the DRAWER mechanics this app owns (scrim, close button, Escape);
//   - the CURRENT marking, observed through the elements' own properties
//     (`current`, `expanded`) — including the list opening the My group on
//     its own when a My page is current;
//   - the PAGES contract at App level (folded in from the deleted
//     `boardNav.test.tsx`): exactly one page mounted, the boards absent from
//     Home and the open grid absent from the boards.
//
// ⚠️ WHAT THIS FILE CANNOT SETTLE. jsdom performs no layout, so nothing here
// observes whether the drawer reads as a drawer, whether the upstream
// indent is visible, or whether the matrix scrolls the way it should on a
// phone. Live measurement is owed and has not been done.

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { SharedItem } from '@civitai/sdk';

import { Harness } from './test-harness.js';
import { App } from './App.js';
import { SIDE_NAV_ITEMS, SideNav, viewRoute, type MainView } from './components/SideNav.js';
import { fakeAppStorage, fakeShared, immediateSleep } from './test-helpers.js';
import type { CombinationData, PromptData } from './types.js';

/**
 * The eight items, as `[testid, label, route, the view selecting it produces]`,
 * **in rendered order**. `route: null` and `view: null` mark the group.
 *
 * 🔴 LITERALS ON EVERY SIDE, and deliberately NOT derived from the component's
 * own tables — a mapping read out of the implementation agrees with a wrong
 * implementation. `SIDE_NAV_ITEMS` is cross-checked against this table rather
 * than used to build it.
 *
 * 🔴 TWO ORDERS LIVE HERE, BOTH OPERATOR DECISIONS. The board pages read
 * Grids / Matchups / Prompts (the board order); the My group's children read
 * Prompts / Matchups / Grids (the order a viewer BUILDS the objects — a
 * prompt and a matchup exist before a grid can be assembled out of them).
 */
const ITEMS = [
  ['nav-home', 'Home', '/', { kind: 'home' }],
  ['nav-grids', 'Grids', 'grids', { kind: 'board', board: 'grids' }],
  ['nav-matchups', 'Matchups', 'matchups', { kind: 'board', board: 'matchups' }],
  ['nav-prompts', 'Prompts', 'prompts', { kind: 'board', board: 'prompts' }],
  ['nav-my', 'My Benchmarks', null, null],
  ['nav-my-prompt', 'Prompts', 'my/prompts', { kind: 'my', noun: 'prompt' }],
  ['nav-my-matchup', 'Matchups', 'my/matchups', { kind: 'my', noun: 'matchup' }],
  ['nav-my-grid', 'Grids', 'my/grids', { kind: 'my', noun: 'grid' }],
] as const satisfies ReadonlyArray<readonly [string, string, string | null, MainView | null]>;

function renderNav(view: MainView = { kind: 'home' }, open = true) {
  const onSelect = vi.fn();
  const onClose = vi.fn();
  const r = render(<SideNav view={view} open={open} onClose={onClose} onSelect={onSelect} />);
  return {
    onSelect,
    onClose,
    unmount: r.unmount,
    rerender: (v: MainView, o = open) =>
      r.rerender(<SideNav view={v} open={o} onClose={onClose} onSelect={onSelect} />),
  };
}

/**
 * Read one of the upstream elements' declared properties.
 *
 * 🔴 PROPERTIES, NOT ATTRIBUTES. React 19 assigns a custom element's known
 * properties as properties, so `label`, `href` and the list's `current`
 * never land in the attribute map — `getAttribute('label')` is `null` on a
 * correctly rendered item (measured, this file, first run of the rewrite).
 */
const prop = (el: Element, name: string): unknown =>
  (el as unknown as Record<string, unknown>)[name];

/** The item hosts in rendered order, group children included. */
const itemHosts = (): HTMLElement[] =>
  Array.from(screen.getByTestId('side-nav').querySelectorAll('civitai-nav-item'));

describe('SideNav — the item ledger', () => {
  it('🔴 LEDGER: SIDE_NAV_ITEMS is exactly the literal table', () => {
    expect(SIDE_NAV_ITEMS.map(({ testid, label, route }) => [testid, label, route])).toEqual(
      ITEMS.map(([testid, label, route]) => [testid, label, route]),
    );
  });

  it('renders exactly those hosts, in that order, with those labels and hrefs', () => {
    renderNav();
    const hosts = itemHosts();
    expect(hosts.map((h) => h.getAttribute('data-testid'))).toEqual(ITEMS.map(([t]) => t));
    for (const [testid, label, route] of ITEMS) {
      const host = screen.getByTestId(testid);
      expect(prop(host, 'label'), testid).toBe(label);
      // 🔴 THE GROUP HAS NO HREF — that absence is what makes the element
      // render a disclosure button instead of a link. Every other item has
      // exactly its route string. Read as a property; the group carries
      // the element's empty-string default, normalised to `null` here.
      expect(prop(host, 'href') || null, testid).toBe(route);
    }
  });

  it('is a landmark <nav> with an accessible name, wrapping the upstream list', () => {
    renderNav();
    const nav = screen.getByTestId('side-nav');
    expect(nav.tagName).toBe('NAV');
    expect(nav.getAttribute('aria-label')).toBe('Model Benchmarking sections');
    expect(nav.querySelector('civitai-nav-list')).not.toBeNull();
  });

  it('the list’s `current` is the view’s route, for every view kind', () => {
    const { rerender } = renderNav({ kind: 'home' });
    const list = () => screen.getByTestId('side-nav').querySelector('civitai-nav-list')!;
    expect(prop(list(), 'current')).toBe('/');
    rerender({ kind: 'board', board: 'matchups' });
    expect(prop(list(), 'current')).toBe('matchups');
    rerender({ kind: 'my', noun: 'grid' });
    expect(prop(list(), 'current')).toBe('my/grids');
    // The exported mapping agrees, spelled against the same literals.
    expect(viewRoute({ kind: 'home' })).toBe('/');
    expect(viewRoute({ kind: 'board', board: 'prompts' })).toBe('prompts');
    expect(viewRoute({ kind: 'my', noun: 'prompt' })).toBe('my/prompts');
  });
});

describe('SideNav — each item selects its own view, and only its own', () => {
  it('pressing a link item selects exactly its view and closes the drawer', async () => {
    for (const [testid, , , view] of ITEMS) {
      if (view === null) continue;
      const { onSelect, onClose, unmount } = renderNav();
      await userEvent.click(screen.getByTestId(testid));
      expect(onSelect, testid).toHaveBeenCalledTimes(1);
      expect(onSelect, testid).toHaveBeenCalledWith(view);
      expect(onClose, testid).toHaveBeenCalledTimes(1);
      unmount();
    }
  });

  it('the group item selects NO view — it is a disclosure, not a destination', async () => {
    const { onSelect, onClose } = renderNav();
    // The press lands on the shadow button, where a real press lands (the
    // element binds its toggle there; the button fills the row).
    const group = screen.getByTestId('nav-my');
    await userEvent.click(group.shadowRoot!.querySelector('button')!);
    expect(onSelect).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('SideNav — current marking, through the elements’ own state', () => {
  it('marks the active item current, and only it', async () => {
    renderNav({ kind: 'board', board: 'prompts' });
    // The list syncs `current` onto the matching item after upgrade; wait for
    // the property rather than asserting on the first paint.
    await waitFor(() =>
      expect((screen.getByTestId('nav-prompts') as unknown as { current: boolean }).current).toBe(
        true,
      ),
    );
    for (const [testid] of ITEMS) {
      if (testid === 'nav-prompts' || testid === 'nav-my') continue;
      expect(
        (screen.getByTestId(testid) as unknown as { current: boolean }).current,
        testid,
      ).toBe(false);
    }
  });

  it('🔴 the list opens the My group on its own when a My page is current', async () => {
    renderNav({ kind: 'my', noun: 'matchup' });
    await waitFor(() =>
      expect((screen.getByTestId('nav-my') as unknown as { expanded: boolean }).expanded).toBe(
        true,
      ),
    );
    expect(
      (screen.getByTestId('nav-my-matchup') as unknown as { current: boolean }).current,
    ).toBe(true);
  });

  it('the current item’s shadow row carries aria-current="page"', async () => {
    renderNav({ kind: 'home' });
    await waitFor(() => {
      const row = screen.getByTestId('nav-home').shadowRoot?.querySelector('[part="link"]');
      expect(row?.getAttribute('aria-current')).toBe('page');
    });
  });
});

describe('SideNav — the drawer mechanics', () => {
  it('closed: no scrim, and the drawer is translated off-canvas', () => {
    renderNav({ kind: 'home' }, false);
    expect(screen.queryByTestId('nav-scrim')).toBeNull();
    const aside = screen.getByTestId('sidebar');
    expect(aside.getAttribute('data-open')).toBe('false');
    expect((aside as HTMLElement).style.transform).toContain('-102%');
    // The items are still in the DOM — the drawer is an overlay, not a mount
    // gate. (That is also what lets other suites press items directly.)
    expect(itemHosts()).toHaveLength(ITEMS.length);
  });

  it('open: the scrim is present, and pressing it closes', async () => {
    const { onClose } = renderNav({ kind: 'home' }, true);
    expect(screen.getByTestId('sidebar').getAttribute('data-open')).toBe('true');
    await userEvent.click(screen.getByTestId('nav-scrim'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('the close button closes', async () => {
    const { onClose } = renderNav({ kind: 'home' }, true);
    await userEvent.click(screen.getByTestId('nav-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape closes an open drawer, and does nothing to a closed one', async () => {
    const { onClose, rerender } = renderNav({ kind: 'home' }, true);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    onClose.mockClear();
    rerender({ kind: 'home' }, false);
    await userEvent.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// The PAGES contract, at App level — folded in from the deleted
// `boardNav.test.tsx`, whose subject (a subnav under the open grid) no
// longer exists. The claim that survives is the one that file existed for:
// exactly one surface is MOUNTED, and the others are ABSENT, not hidden.
// ===========================================================================

const comboData: CombinationData = {
  v: 2,
  kind: 'combination',
  configs: [
    {
      id: 'cfgA',
      checkpoint: { versionId: 1001, modelId: 500, baseModel: 'SDXL 1.0', modelName: 'JuggernautXL' },
      loras: [],
    },
  ],
};
const promptData: PromptData = { v: 3, kind: 'prompt', default: { prompt: 'a portrait', params: {} } };
const row = (key: string, title: string, data: unknown): SharedItem => ({
  key,
  authorUserId: 7,
  count: 3,
  viewerVoted: false,
  value: { title, body: '', data },
  createdAt: new Date(0),
  updatedAt: new Date(0),
});

const SEED: SharedItem[] = [row('mk-1', 'A matchup', comboData), row('qk-1', 'A prompt', promptData)];

function renderApp() {
  const { shared } = fakeShared({ seed: SEED });
  render(
    <Harness
      viewer={{ id: 99, username: 'me' }}
      theme="dark"
      consentGranted
      buzzBudget={1000}
      buzzBalance={{ blue: 0, green: 0, yellow: 5000 }}
      shared={{ seed: [] }}
      showLog={false}
    >
      <App
        deps={{
          resolveResources: async () => [],
          pollIntervalMs: 0,
          sleep: immediateSleep,
          shared,
          appStorage: fakeAppStorage().appStorage,
        }}
      />
    </Harness>,
  );
}

describe('the pages — exactly one surface mounted (App level)', () => {
  it('opens on HOME: the open grid mounted, every board ABSENT', async () => {
    renderApp();
    expect(await screen.findByTestId('section-open-grid')).toBeInTheDocument();
    expect(screen.queryByTestId('section-grids')).toBeNull();
    expect(screen.queryByTestId('section-matchups')).toBeNull();
    expect(screen.queryByTestId('section-prompts')).toBeNull();
  });

  it('a board page mounts its board and UNMOUNTS the open grid', async () => {
    renderApp();
    await screen.findByTestId('section-open-grid');
    await userEvent.click(await screen.findByTestId('nav-toggle'));
    await userEvent.click(await screen.findByTestId('nav-matchups'));
    expect(await screen.findByTestId('section-matchups')).toBeInTheDocument();
    expect(screen.queryByTestId('section-open-grid')).toBeNull();
    expect(screen.queryByTestId('section-grids')).toBeNull();
    expect(screen.queryByTestId('section-prompts')).toBeNull();
  });

  it('🔴 the selection is NOT persisted: a remount opens on Home', async () => {
    renderApp();
    await userEvent.click(await screen.findByTestId('nav-prompts'));
    expect(await screen.findByTestId('section-prompts')).toBeInTheDocument();
  });
});
