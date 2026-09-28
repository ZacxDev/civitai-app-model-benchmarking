// The eight runtime bindings, driven directly rather than through the App.
//
// 🔴 WHY THIS FILE EXISTS BESIDE THE COMPONENT SUITE. The App's own tests mount a
// mock host and inject fakes into `deps`, so most of them never reach the REST
// clients at all — which is right for them and useless for the port. What the port
// can get wrong lives HERE: the wire (path, method, body) each binding puts on the
// network, the assertions that refuse a malformed reply rather than coercing it,
// the exact fetch BUDGET, and the singleton reset that stops one case's fixture
// leaking into the next.
//
// The transport is a hand-built fake implementing `@civitai/sdk`'s `BlockTransport`
// interface — NOT the bridge's, and NOT the bridge singleton. So these cases pin
// what `sdk-runtime.ts` does with a transport, independently of the adapter in
// `sdk-transport.test.ts` that produces one. The seam between them is covered by
// the component suite, which drives the real adapter over the real mock host.
//
// ⚠ `snapshotOf` + `fakeTransport` BELOW ARE A DELETION CANDIDATE, and the reason
// they survived this PR is scheduling, not a case for keeping them. `@civitai/sdk`
// ships `./testing` with `createFakeTransport(snapshot?: Partial<BlockSnapshot>)`
// carrying `sent`/`handle`/`reply`/`fail`/`stall`/`push`/`listenerCount`/
// `setSnapshot` — near one-for-one with what is hand-rolled here, in the dependency
// this PR just added, and with **0 importers on this tree** (measured the same way
// as the PR's import table: enumerate `git ls-tree -r HEAD -- src`, read each blob
// out of the ref). Not a free swap, which is why it is filed rather than done: ~10
// assertions here read `notify`/`request` as `vi.fn()` spies where the SDK's fake
// offers `sent`/`handle`, and the transport-identity case drives
// `resetHarnessTransport()` — the BRIDGE singleton, which the SDK's
// `__resetTransport` does not touch. Hand it to `/simplify`; do not cut blind, and
// re-run the mutation battery afterwards, because these are the fixtures that kill
// most of it.

import { act, render, renderHook, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createMockHost } from '@civitai/blocks-react/testing';
import type { BlockSnapshot, BlockTransport } from '@civitai/sdk';

import { createRestFake } from '../dev-rest.js';
import { resetHarnessTransport } from '../dev-transport.js';
import {
  configureSdkRuntime,
  resetSdkRuntime,
  useAppStorage,
  useBlockContext,
  useBlockResize,
  useBlockToken,
  useBuzzBalance,
  useRequestConsent,
  useRequestSignIn,
  useSharedStorage,
} from './sdk-runtime.js';

/** A ready snapshot carrying a block token, which is what `initialize()` waits for. */
function snapshotOf(over: Partial<BlockSnapshot> = {}): BlockSnapshot {
  return {
    ready: true,
    renderMode: 'iframe',
    context: { slotId: 'app.page', slug: 'model-benchmarking', subPath: '', viewerUserId: 99 },
    token: {
      raw: 'blk_tok',
      scopes: ['apps:storage:shared:read'],
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
      kind: 'block',
    },
    settings: { publisherSettings: {}, userSettings: {} },
    viewer: { id: 99, username: 'me' },
    theme: 'dark',
    blockInstanceId: 'bi-1',
    hostOrigin: 'https://civitai.com',
    ...over,
  } as BlockSnapshot;
}

/**
 * A fake `BlockTransport`. `notify`/`request`/`on` are spies, and `push()` swaps
 * the snapshot and fires subscribers — which is how the host re-minting a token
 * looks from inside the block.
 */
function fakeTransport(initial: BlockSnapshot = snapshotOf()) {
  let current = initial;
  const listeners = new Set<() => void>();
  const notify = vi.fn();
  const request = vi.fn();
  const handlers = new Map<string, (payload: unknown) => void>();
  const transport: BlockTransport = {
    snapshot: {
      get: () => current,
      subscribe: (l) => {
        listeners.add(l);
        return () => listeners.delete(l);
      },
    },
    notify,
    request,
    on: (type, handler) => {
      handlers.set(type, handler);
      return () => handlers.delete(type);
    },
  };
  const push = (next: BlockSnapshot) => {
    current = next;
    for (const l of [...listeners]) l();
  };
  return { transport, notify, request, handlers, push, listenerCount: () => listeners.size };
}

/** Install a runtime over the fake transport and a REST fake, returning the call log. */
function install(
  restOptions: Parameters<typeof createRestFake>[0] = {},
  snapshot: BlockSnapshot = snapshotOf(),
) {
  const t = fakeTransport(snapshot);
  const calls: Array<{ path: string; method: string; body: Record<string, unknown> }> = [];
  configureSdkRuntime({
    transport: t.transport,
    fetch: createRestFake({ viewerUserId: 99, ...restOptions, onRequest: (c) => calls.push(c) }),
  });
  return { ...t, calls };
}

// 🔴 NO `afterEach(resetSdkRuntime)` HERE, AND THAT IS DELIBERATE. `src/test-setup.ts`
// already resets the runtime in a global `beforeEach`, and a second reset in this
// file would make that global one UNREACHABLE from every case below — including the
// ordered pair at the bottom whose whole job is to fail if it is removed. One rule,
// one place; the leak guard is tested rather than duplicated.
afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Group 1 — the snapshot, read synchronously
// ---------------------------------------------------------------------------
describe('group 1 — the snapshot', () => {
  it('useBlockContext reads ready/viewer/theme off the live snapshot', () => {
    install();
    const { result } = renderHook(() => useBlockContext());
    expect(result.current).toEqual({ ready: true, viewer: { id: 99, username: 'me' }, theme: 'dark' });
  });

  it('useBlockContext follows a snapshot push — the host switching theme', async () => {
    const { push } = install();
    const { result } = renderHook(() => useBlockContext());
    expect(result.current.theme).toBe('dark');

    await act(async () => push(snapshotOf({ theme: 'light' })));

    expect(result.current.theme).toBe('light');
  });

  // 🔴 THE POINT OF READING THE SNAPSHOT AT ALL: `ready` is available BEFORE
  // `initialize()` resolves, because the bridge transport already holds BLOCK_INIT.
  // The app paints its boot skeleton off it, so a binding that awaited the
  // AppClient would blank the first frame. `renderHook` returns after the first
  // commit, so reading a populated value here IS the synchronous claim — a hook
  // that awaited would report `ready: false` at this point.
  it('useBlockContext is populated on the FIRST render, with no await', () => {
    install();
    const seen: boolean[] = [];
    renderHook(() => {
      seen.push(useBlockContext().ready);
      return null;
    });
    expect(seen[0]).toBe(true);
  });

  it('useBlockToken returns the snapshot token, and the identity is stable across renders', () => {
    install();
    const { result, rerender } = renderHook(() => useBlockToken());
    const first = result.current;
    expect(first.scopes).toEqual(['apps:storage:shared:read']);
    rerender();
    // Stability matters because `App.tsx` memoises on the token; the bridge hook
    // returned a fresh object every render and the app had to key on `raw` instead.
    expect(result.current).toBe(first);
  });

  it('useBlockToken hands down the NEW scopes when the host re-mints', async () => {
    const { push } = install();
    const { result } = renderHook(() => useBlockToken());
    expect(result.current.scopes).not.toContain('ai:write:budgeted');

    await act(async () =>
      push(
        snapshotOf({
          token: {
            raw: 'blk_tok2',
            scopes: ['apps:storage:shared:read', 'ai:write:budgeted'],
            expiresAt: new Date('2099-01-01T00:00:00.000Z'),
            kind: 'block',
          },
        }),
      ),
    );

    expect(result.current.scopes).toContain('ai:write:budgeted');
  });

  it('unsubscribes from the snapshot on unmount', () => {
    const { listenerCount } = install();
    const view = renderHook(() => useBlockContext());
    expect(listenerCount()).toBeGreaterThan(0);
    view.unmount();
    expect(listenerCount()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Group 2 — host-mediated, still postMessage
// ---------------------------------------------------------------------------
describe('group 2 — host UI', () => {
  it('useRequestSignIn notifies REQUEST_SIGN_IN', () => {
    const { notify } = install();
    const { result } = renderHook(() => useRequestSignIn());
    result.current.requestSignIn();
    expect(notify).toHaveBeenCalledWith({ type: 'REQUEST_SIGN_IN', payload: {} });
  });

  it('useRequestConsent notifies REQUEST_CONSENT carrying exactly the scopes asked for', async () => {
    const { notify } = install();
    const { result } = renderHook(() => useRequestConsent());

    await act(async () => {
      result.current.requestConsent({ scopes: ['ai:write:budgeted'] });
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith({
        type: 'REQUEST_CONSENT',
        payload: { scopes: ['ai:write:budgeted'] },
      }),
    );
  });

  // 🔴 THE FIRE-AND-FORGET CONTRACT, and the one this binding had to WORK to keep.
  // The bridge's `requestConsent` was a notify and could not fail; the SDK's
  // `requestGrants` is a promise that resolves `false` on CONSENT_UNAVAILABLE and
  // rejects on abort. The app's call site is a click handler that awaits nothing,
  // so an unswallowed rejection is a console error any viewer can produce by
  // closing a dialog. This asserts the swallow: a declined grant leaves no
  // unhandled rejection and throws nothing at the call site.
  it('useRequestConsent swallows a refusal rather than surfacing it to the caller', async () => {
    const { handlers } = install();
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      const { result } = renderHook(() => useRequestConsent());
      expect(() => result.current.requestConsent({ scopes: ['ai:write:budgeted'] })).not.toThrow();
      await act(async () => {
        await Promise.resolve();
      });
      // The host answers "cannot be granted".
      await act(async () => {
        handlers.get('CONSENT_UNAVAILABLE')?.({});
        await Promise.resolve();
      });
      await new Promise((r) => setTimeout(r, 0));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  // 🔴 CONSENT IS ALREADY HELD ⇒ NO MESSAGE. `requestGrants` short-circuits when
  // the live token carries the scopes, so this is the binding's own budget guard:
  // a second dialog for a grant the viewer already gave is a real, visible bug.
  it('useRequestConsent sends NOTHING when the token already carries the scope', async () => {
    const { notify } = install(
      {},
      snapshotOf({
        token: {
          raw: 'blk',
          scopes: ['ai:write:budgeted'],
          expiresAt: new Date('2099-01-01T00:00:00.000Z'),
          kind: 'block',
        },
      }),
    );
    const { result } = renderHook(() => useRequestConsent());

    await act(async () => {
      result.current.requestConsent({ scopes: ['ai:write:budgeted'] });
      await Promise.resolve();
    });
    await new Promise((r) => setTimeout(r, 0));

    expect(notify).not.toHaveBeenCalled();
  });

  it('useBlockResize reports the element height as RESIZE_IFRAME', async () => {
    class StubResizeObserver {
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', StubResizeObserver);
    const { notify } = install();

    function Sized() {
      const ref = useRef<HTMLDivElement>(null);
      useBlockResize(ref);
      return <div ref={ref} data-testid="root" />;
    }
    render(<Sized />);

    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith({
        type: 'RESIZE_IFRAME',
        // jsdom lays nothing out, so the height is 0 — the VALUE is the host's
        // problem. What this pins is that the app's ref reaches `autoResize` and a
        // report goes out at all, which is the binding's whole job.
        payload: { height: 0 },
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Group 3 — REST
// ---------------------------------------------------------------------------
describe('group 3 — per-viewer app storage', () => {
  it('get POSTs blocks/app-storage/get and resolves the stored value', async () => {
    const { calls } = install({ storage: { seed: { 'draft:v1:a': { title: 'x' } } } });
    const { result } = renderHook(() => useAppStorage());

    await expect(result.current.get('draft:v1:a')).resolves.toEqual({ title: 'x' });
    expect(calls).toEqual([
      { path: 'blocks/app-storage/get', method: 'POST', body: { key: 'draft:v1:a' } },
    ]);
  });

  it('get resolves null for an unset key — the answer the app branches on', async () => {
    install();
    const { result } = renderHook(() => useAppStorage());
    await expect(result.current.get('nope')).resolves.toBeNull();
  });

  it('set POSTs the key and value, and round-trips through get', async () => {
    const { calls } = install();
    const { result } = renderHook(() => useAppStorage());

    await expect(result.current.set('inflight:v1:c|p', { workflowId: 'wf1' })).resolves.toMatchObject(
      { ok: true },
    );
    expect(calls.map((c) => c.path)).toEqual(['blocks/app-storage/set']);
    await expect(result.current.get('inflight:v1:c|p')).resolves.toEqual({ workflowId: 'wf1' });
  });

  it('list pages with a cursor and stops without one', async () => {
    install({
      storage: { seed: { 'd:1': 1, 'd:2': 2, 'd:3': 3 }, pageSize: 2 },
    });
    const { result } = renderHook(() => useAppStorage());

    const first = await result.current.list({ prefix: 'd:' });
    expect(first.keys.map((k) => k.key)).toEqual(['d:1', 'd:2']);
    expect(first.nextCursor).toBeTypeOf('string');

    const second = await result.current.list({ prefix: 'd:', cursor: first.nextCursor });
    expect(second.keys.map((k) => k.key)).toEqual(['d:3']);
    // 🔴 THE ABSENCE IS THE PROOF A SCAN COMPLETED, and this app REFUSES TO SPEND
    // on a truncated in-flight scan — so a `nextCursor` that never clears would
    // wedge the money path closed, and one that never appears would let it spend
    // on a partial view.
    expect(second.nextCursor).toBeUndefined();
  });

  it('the façade is a stable object across renders — it goes into dependency arrays', () => {
    install();
    const { result, rerender } = renderHook(() => useAppStorage());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it('a refused write REJECTS rather than resolving "not written"', async () => {
    // An unknown route is the fake's 404, which is the shape of any refusal here:
    // the SDK's contract is that every failure rejects and nothing resolves to mean
    // "not written". The app persists its in-flight run claim through `set` and
    // refuses the run when the claim cannot be written, so a resolving failure is a
    // double-charge.
    configureSdkRuntime({
      transport: fakeTransport().transport,
      fetch: (async () => new Response(JSON.stringify({ error: 'QUOTA' }), { status: 413 })) as never,
    });
    const { result } = renderHook(() => useAppStorage());
    await expect(result.current.set('k', 1)).rejects.toThrow(/QUOTA/);
  });
});

describe('group 3 — shared storage', () => {
  it('list GETs blocks/shared-storage/list and lifts items out of the envelope', async () => {
    const { calls } = install({
      shared: { seed: [{ key: 'mk-a', value: { title: 'Matchup A' }, voters: [1, 2] }] },
    });
    const { result } = renderHook(() => useSharedStorage());

    const page = await result.current.list({ limit: 50 });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({ key: 'mk-a', count: 2, viewerVoted: false });
    // 🔴 GET, not POST. The two reads on this surface are GET with a query string
    // and the writes are POST; a read sent as POST is a 405 on the real route.
    expect(calls).toEqual([{ path: 'blocks/shared-storage/list', method: 'GET', body: {} }]);
  });

  it('append POSTs { value } and resolves the SERVER-minted key', async () => {
    const { calls } = install({ shared: { seed: [] } });
    const { result } = renderHook(() => useSharedStorage());

    const { key } = await result.current.append({ title: 'New matchup', body: '', data: { v: 2 } });
    // The key is the server's — this method takes none, because a client-chosen key
    // would let one viewer overwrite another's row.
    expect(key).toHaveLength(26);
    expect(calls[0]).toEqual({
      path: 'blocks/shared-storage/append',
      method: 'POST',
      body: { value: { title: 'New matchup', body: '', data: { v: 2 } } },
    });
  });

  it('update POSTs { key, value } and resolves void', async () => {
    const { calls } = install({ shared: { seed: [{ key: 'mk-a', value: { title: 'A' } }] } });
    const { result } = renderHook(() => useSharedStorage());

    await expect(result.current.update('mk-a', { title: 'A2' })).resolves.toBeUndefined();
    expect(calls[0]).toEqual({
      path: 'blocks/shared-storage/update',
      method: 'POST',
      body: { key: 'mk-a', value: { title: 'A2' } },
    });
  });

  it('withdraw POSTs { key } and reports whether a row was deleted', async () => {
    const { calls } = install({ shared: { seed: [{ key: 'mk-a', value: { title: 'A' } }] } });
    const { result } = renderHook(() => useSharedStorage());

    await expect(result.current.withdraw('mk-a')).resolves.toEqual({ ok: true, deleted: true });
    expect(calls[0]).toEqual({
      path: 'blocks/shared-storage/withdraw',
      method: 'POST',
      body: { key: 'mk-a' },
    });
    // `deleted: false` is a SUCCESS and deliberately ambiguous on the real route —
    // another author's key, an already-withdrawn row and one that never existed all
    // answer identically, so this cannot probe for other viewers' rows.
    await expect(result.current.withdraw('mk-a')).resolves.toEqual({ ok: true, deleted: false });
  });

  it('vote POSTs { key } to the vote route and returns the new tally', async () => {
    const { calls } = install({
      shared: { seed: [{ key: 'mk-a', value: { title: 'A' }, voters: [1, 2] }] },
    });
    const { result } = renderHook(() => useSharedStorage());

    await expect(result.current.vote('mk-a')).resolves.toBe(3);
    expect(calls[0]).toEqual({
      path: 'blocks/shared-storage/vote',
      method: 'POST',
      body: { key: 'mk-a' },
    });
  });

  // 🔴 IDEMPOTENT, because the platform's route is: "an atomic insert-gated counter
  // — a double vote is a no-op and the tally never inflates". The app writes this
  // number into the row's displayed count, and the Top Grid's membership is ranked
  // on it, so a client that assumed +1 per call would inflate a public ranking.
  it('a repeated vote does not inflate the tally', async () => {
    install({ shared: { seed: [{ key: 'mk-a', value: { title: 'A' }, voters: [] }] } });
    const { result } = renderHook(() => useSharedStorage());

    await expect(result.current.vote('mk-a')).resolves.toBe(1);
    await expect(result.current.vote('mk-a')).resolves.toBe(1);
  });

  it('unvote POSTs to the UNVOTE route and returns the decremented tally', async () => {
    const { calls } = install({
      shared: { seed: [{ key: 'mk-a', value: { title: 'A' }, voters: [99] }] },
    });
    const { result } = renderHook(() => useSharedStorage());

    await expect(result.current.unvote('mk-a')).resolves.toBe(0);
    // 🔴 A DISTINCT ROUTE, asserted by name. `vote` and `unvote` take the same body
    // and return the same shape, so a binding that sent an unvote to the vote route
    // would still resolve a plausible number — and would ADD a vote where the
    // viewer asked to remove one.
    expect(calls[0]!.path).toBe('blocks/shared-storage/unvote');
  });

  // 🔴 ASSERTED, NOT COERCED. `Number(undefined)` is NaN and a `?? 0` would report
  // a vote that did not land as a tally of ZERO — which the app renders and ranks
  // on. A malformed reply is a failure, not a count.
  it('vote REJECTS on a reply carrying no numeric count', async () => {
    configureSdkRuntime({
      transport: fakeTransport().transport,
      fetch: (async () => new Response(JSON.stringify({ ok: true }), { status: 200 })) as never,
    });
    const { result } = renderHook(() => useSharedStorage());
    await expect(result.current.vote('mk-a')).rejects.toThrow(/no numeric `count`/);
  });

  it('unvote REJECTS on a reply carrying no numeric count, and names itself', async () => {
    configureSdkRuntime({
      transport: fakeTransport().transport,
      fetch: (async () => new Response(JSON.stringify({ count: 'three' }), { status: 200 })) as never,
    });
    const { result } = renderHook(() => useSharedStorage());
    // The operation name is in the message so a failure says WHICH call produced
    // it; both routes answer `{ count }` and a shared message would not.
    await expect(result.current.unvote('mk-a')).rejects.toThrow(/unvote/);
  });

  it('report POSTs { key } and OMITS reason when the caller passes none', async () => {
    const { calls } = install({ shared: { seed: [{ key: 'mk-a', value: { title: 'A' } }] } });
    const { result } = renderHook(() => useSharedStorage());

    await result.current.report('mk-a');
    // 🔴 `reason` ABSENT, not `undefined` and not `''`. The route's schema is
    // `z.string().max(N).optional()`, so an empty string is a 400 where an absent
    // key takes the router's own `'user-report'` default.
    expect(calls[0]).toEqual({
      path: 'blocks/shared-storage/report',
      method: 'POST',
      body: { key: 'mk-a' },
    });
  });

  it('report carries reason when one is given', async () => {
    const { calls } = install({ shared: { seed: [{ key: 'mk-a', value: { title: 'A' } }] } });
    const { result } = renderHook(() => useSharedStorage());

    await result.current.report('mk-a', 'spam');
    expect(calls[0]!.body).toEqual({ key: 'mk-a', reason: 'spam' });
  });

  it('report leaves the row on the board — it files, it does not hide', async () => {
    install({ shared: { seed: [{ key: 'mk-a', value: { title: 'A' } }] } });
    const { result } = renderHook(() => useSharedStorage());

    await result.current.report('mk-a');
    const page = await result.current.list();
    expect(page.items.map((i) => i.key)).toEqual(['mk-a']);
  });

  it('the façade is a stable object across renders', () => {
    install();
    const { result, rerender } = renderHook(() => useSharedStorage());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});

describe('group 3 — the Buzz balance', () => {
  it('reads GET blocks/buzz exactly ONCE on mount', async () => {
    const { calls } = install({ buzz: { blue: 10, green: 0, yellow: 500 } });
    const { result } = renderHook(() => useBuzzBalance());

    await waitFor(() => expect(result.current.balance).toEqual({ blue: 10, green: 0, yellow: 500 }));
    // 🔴 EXACT, never at-least. The token re-mints every ~2 minutes, so a refetch
    // keyed on token churn fires forever, and an at-least assertion cannot tell
    // that loop apart from one correct read.
    expect(calls.filter((c) => c.path === 'blocks/buzz')).toHaveLength(1);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('a rerender adds NO read', async () => {
    const { calls } = install();
    const { result, rerender } = renderHook(() => useBuzzBalance());
    await waitFor(() => expect(result.current.balance).not.toBeNull());

    rerender();
    rerender();
    await act(async () => {});

    expect(calls.filter((c) => c.path === 'blocks/buzz')).toHaveLength(1);
  });

  it('refetch() adds exactly one read, and picks up a changed balance', async () => {
    const box = { current: { blue: 1, green: 0, yellow: 1 } };
    const { calls } = install({ buzz: () => box.current });
    const { result } = renderHook(() => useBuzzBalance());
    await waitFor(() => expect(result.current.balance).toEqual({ blue: 1, green: 0, yellow: 1 }));

    box.current = { blue: 7, green: 0, yellow: 7 };
    act(() => result.current.refetch());

    await waitFor(() => expect(result.current.balance).toEqual({ blue: 7, green: 0, yellow: 7 }));
    expect(calls.filter((c) => c.path === 'blocks/buzz')).toHaveLength(2);
  });

  // 🔴 A REFUSED READ IS `error` WITH `balance` STILL NULL, NEVER A ZERO BALANCE.
  // This app DISABLES Confirm when the balance is below the estimate, and reports
  // "could not be read" distinctly from "not enough Buzz" — a null coerced to 0
  // would relabel an unreadable balance as an insufficient one, which is the exact
  // operator-visible bug `src/buzzBalance.test.tsx` was written for.
  it('a 403 surfaces as error with a NULL balance, not a zero one', async () => {
    const { calls } = install({ buzz: null });
    const { result } = renderHook(() => useBuzzBalance());

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.balance).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(calls.filter((c) => c.path === 'blocks/buzz')).toHaveLength(1);
  });

  it('recovers on refetch after a refused read, with no page reload', async () => {
    const box: { current: { blue: number; green: number; yellow: number } | null } = {
      current: null,
    };
    install({ buzz: () => box.current });
    const { result } = renderHook(() => useBuzzBalance());
    await waitFor(() => expect(result.current.error).not.toBeNull());

    box.current = { blue: 0, green: 0, yellow: 5000 };
    act(() => result.current.refetch());

    await waitFor(() => expect(result.current.balance).toEqual({ blue: 0, green: 0, yellow: 5000 }));
    // The error must CLEAR, or the app keeps showing "could not be read" over a
    // balance it now has.
    expect(result.current.error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The singletons — the part that leaks between tests when it is wrong
// ---------------------------------------------------------------------------
describe('runtime lifecycle', () => {
  // 🔴 THE CROSS-TEST LEAK GUARD. `configureSdkRuntime` must DROP the AppClient
  // built under the previous options, not keep it: the client closes over the
  // previous `fetch`, so a second install that was ignored would serve the FIRST
  // fixture's board to the second case and pass for the wrong reason.
  it('a second configure swaps the fetch the REST clients use', async () => {
    install({ buzz: { blue: 1, green: 1, yellow: 1 } });
    const { result, rerender } = renderHook(() => useSharedStorage());
    await expect(result.current.list()).resolves.toMatchObject({ items: [] });

    install({ shared: { seed: [{ key: 'after', value: { title: 'After' } }] } });
    rerender();

    await expect(result.current.list()).resolves.toMatchObject({
      items: [expect.objectContaining({ key: 'after' })],
    });
  });

  it('resetSdkRuntime clears the options, so nothing carries into the next case', async () => {
    install({ shared: { seed: [{ key: 'gone', value: { title: 'Gone' } }] } });
    const { result } = renderHook(() => useSharedStorage());
    await expect(result.current.list()).resolves.toMatchObject({
      items: [expect.objectContaining({ key: 'gone' })],
    });

    resetSdkRuntime();
    // With no configured transport the runtime falls back to the bridge singleton,
    // which `src/test-setup.ts` has reset to an un-initialised transport: `ready` is
    // false, so `initialize()` cannot resolve and the call cannot answer from the
    // previous fixture. The observable claim is the one that matters — the stale
    // board is NOT served.
    const settled = await Promise.race([
      result.current.list().then(() => 'answered' as const),
      new Promise<'pending'>((r) => setTimeout(() => r('pending'), 50)),
    ]);
    expect(settled).toBe('pending');
  });

  // 🔴 AN ORDERED PAIR, AND THE ORDER IS THE TEST. The first case installs a fixture
  // and does NOT clean up after itself; the second asserts it cannot see it. The
  // only thing between them is `src/test-setup.ts`'s global
  // `beforeEach(resetSdkRuntime)`, so deleting that line turns the second case red —
  // which is what makes it a guard rather than a comment. Watched: with the reset
  // stubbed out, `leak-B` fails; with it, the pair passes.
  //
  // ⚠ The pair is coupled by file order. Vitest runs `it`s in declaration order
  // within a file, so this is deterministic — but a reader must not reorder them,
  // and `leak-B` must stay the case that installs NOTHING.
  it('leak-A: installs a board fixture and deliberately leaves it installed', async () => {
    install({ shared: { seed: [{ key: 'leaked', value: { title: 'Leaked' } }] } });
    const { result } = renderHook(() => useSharedStorage());
    await expect(result.current.list()).resolves.toMatchObject({
      items: [expect.objectContaining({ key: 'leaked' })],
    });
  });

  it('leak-B: cannot see leak-A\'s board — the global reset ran between them', async () => {
    // No `install()` at all. If the previous case's `fetch` were still in place this
    // would answer with its row; the global reset leaves the runtime on the bridge
    // singleton, which is un-initialised, so the call cannot answer at all.
    const { result } = renderHook(() => useSharedStorage());
    const settled = await Promise.race([
      result.current.list().then((page) => page.items.map((i) => i.key)),
      new Promise<'pending'>((r) => setTimeout(() => r('pending'), 50)),
    ]);
    expect(settled).toBe('pending');
  });

  // 🔴 THE TRANSPORT CACHE IS KEYED ON THE BRIDGE'S IDENTITY, and this is the case
  // that reaches that key. `resetTransport()` NULLS the bridge singleton so the next
  // `getTransport()` builds a NEW object; a cache that only checked "have I wrapped
  // anything yet" would keep serving a wrapper around the DISPOSED one, and every
  // later read would come off a dead snapshot. Nothing calls `configureSdkRuntime`
  // between the swap and the re-read here, which is precisely the window the key
  // covers. Watched: dropping `|| bridge !== bridgeWrapped` turns this red.
  it('follows a REPLACED bridge transport rather than a wrapper around the disposed one', async () => {
    const uninstall = createMockHost({
      viewer: { id: 99, username: 'me' },
      theme: 'dark',
      shared: { seed: [] },
    }).install();
    try {
      // No explicit transport: the runtime wraps the bridge singleton itself.
      configureSdkRuntime({ fetch: createRestFake({ viewerUserId: 99 }) });
      const { result, rerender } = renderHook(() => useBlockContext());
      await waitFor(() => expect(result.current.ready).toBe(true));
      expect(result.current.viewer).toEqual({ id: 99, username: 'me' });

      // The bridge singleton is REPLACED — exactly what `test-setup.ts` does before
      // every dom case.
      act(() => resetHarnessTransport());
      rerender();

      // The new transport has had no BLOCK_INIT, so `ready` is false. Reading `true`
      // here means the runtime is still talking to the object that was thrown away.
      expect(result.current.ready).toBe(false);
    } finally {
      uninstall();
    }
  });
});
