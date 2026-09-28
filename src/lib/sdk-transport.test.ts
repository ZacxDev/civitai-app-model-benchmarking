// Unit tests for the one-transport adapter. Runs in the `node` project — no DOM,
// no bridge singleton: the singleton is mocked to THROW, so a case that reached it
// by accident fails loudly instead of standing up a real iframe transport.

import { describe, expect, it, vi } from 'vitest';

const sendTypedRequest = vi.hoisted(() => vi.fn());

vi.mock('@civitai/blocks-react', () => ({
  getTransport: () => {
    throw new Error('the singleton must not be reached in these tests — pass a fake');
  },
  sendTypedRequest,
}));

const { createSdkTransportAdapter } = await import('./sdk-transport.js');

/**
 * A stand-in for the bridge transport. Only the five members the adapter touches
 * are real; `getSnapshot` returns whatever object the test last set, so identity
 * is under the test's control — which is the point of most of these cases.
 */
function fakeBridge(overrides: Record<string, unknown> = {}) {
  const base = { ready: true, token: null, viewer: null } as Record<string, unknown>;
  const state = { snapshot: base, hostOrigin: null as string | null };
  const listeners = new Set<() => void>();
  const bridge = {
    getSnapshot: () => state.snapshot,
    getHostOrigin: () => state.hostOrigin,
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    sendMessage: vi.fn(),
    onMessage: vi.fn(() => () => {}),
    ...overrides,
  };
  return { bridge, state, listeners };
}

describe('sdk-transport adapter — snapshot identity', () => {
  // 🔴 THE REGRESSION TEST. Composing `{...snap, hostOrigin}` fresh on every call
  // returns a new object each time; `useSyncExternalStore` bails out on
  // `Object.is`, so a non-memoised adapter re-renders forever. Watched to FAIL
  // against a `composeSnapshot` with the cache removed — 3 cases red in this file
  // and `sdk-runtime.test.tsx`'s own identity case with it.
  it('returns the SAME object identity while neither input has changed', () => {
    const { bridge } = fakeBridge();
    const t = createSdkTransportAdapter(bridge as never);

    const a = t.snapshot.get();
    const b = t.snapshot.get();
    const c = t.snapshot.get();

    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('returns a NEW identity when the underlying snapshot changes', () => {
    const { bridge, state } = fakeBridge();
    const t = createSdkTransportAdapter(bridge as never);

    const before = t.snapshot.get();
    state.snapshot = { ready: true, token: 'fresh', viewer: null };
    const after = t.snapshot.get();

    expect(after).not.toBe(before);
    expect((after as { token: string }).token).toBe('fresh');
  });

  it('returns a NEW identity when hostOrigin alone changes', () => {
    const { bridge, state } = fakeBridge();
    const t = createSdkTransportAdapter(bridge as never);

    const before = t.snapshot.get();
    expect((before as { hostOrigin: string | null }).hostOrigin).toBeNull();

    state.hostOrigin = 'https://civitai.com';
    const after = t.snapshot.get();

    expect(after).not.toBe(before);
    expect((after as { hostOrigin: string | null }).hostOrigin).toBe('https://civitai.com');
  });

  // 🔴 SECURITY INVARIANT, not a null-handling nit. The bridge documents
  // `getHostOrigin()` as returning only an allowlist-validated origin, because the
  // value becomes the base URL a money-scoped bearer token is sent to. A
  // not-yet-established origin must stay null; substituting `location.origin` or a
  // parent's origin here would convert a not-ready state into an exfiltration
  // vector. This pins that the adapter invents nothing.
  it('propagates a null hostOrigin as null and never substitutes a fallback', () => {
    const { bridge } = fakeBridge();
    const t = createSdkTransportAdapter(bridge as never);

    const snap = t.snapshot.get() as Record<string, unknown>;

    // `toBeNull()` is the WHOLE guard, and it is sufficient: any substituted
    // default — `location.origin`, `document.referrer`, `''`, a parent origin —
    // makes this non-null and fails here. Mutation-checked: adding
    // `?? 'https://evil.example'` to `composeSnapshot` turns this red.
    //
    // ⚠ A `not.toContain(globalThis.location?.origin)` assertion would be VACUOUS
    // in this project — this file runs in vitest's `node` project, which defines no
    // `location`, so it would reduce to `not.toContain(undefined)` and could never
    // fail. Deliberately absent: an assertion that reads as covering the
    // exfiltration case while covering nothing is worse than none, because it stops
    // the next reader looking.
    expect(snap.hostOrigin).toBeNull();
  });

  it('forwards subscribe through to the bridge', () => {
    const { bridge, listeners } = fakeBridge();
    const t = createSdkTransportAdapter(bridge as never);

    const listener = vi.fn();
    const off = t.snapshot.subscribe(listener);
    expect(listeners.size).toBe(1);
    off();
    expect(listeners.size).toBe(0);
  });
});

describe('sdk-transport adapter — request', () => {
  it('maps REQUEST_TOKEN to the TOKEN_REFRESH_RESPONSE reply type', async () => {
    sendTypedRequest.mockReset();
    sendTypedRequest.mockResolvedValue({ token: { raw: 'tok' } });
    const { bridge } = fakeBridge();
    const t = createSdkTransportAdapter(bridge as never);

    await expect(t.request('REQUEST_TOKEN', { blockInstanceId: 'bi1' })).resolves.toEqual({
      token: { raw: 'tok' },
    });

    expect(sendTypedRequest).toHaveBeenCalledTimes(1);
    const [passedBridge, request, responseType] = sendTypedRequest.mock.calls[0]!;
    expect(passedBridge).toBe(bridge);
    expect(request).toEqual({ type: 'REQUEST_TOKEN', payload: { blockInstanceId: 'bi1' } });
    // The literal is the whole point of the mapping — assert it, not its shape. It
    // is the pairing `@civitai/sdk`'s own iframe transport uses for this message
    // (`dist/core/transports/iframe-transport.js`), and a wrong one hangs.
    expect(responseType).toBe('TOKEN_REFRESH_RESPONSE');
  });

  // 🔴 A wrong reply type does not fail loudly — it waits for the request timeout
  // and surfaces as an unresponsive host. So an unmapped type must REFUSE rather
  // than guess, and the refusal must say what to do.
  it('throws for an unmapped request type instead of guessing a reply type', () => {
    sendTypedRequest.mockReset();
    const { bridge } = fakeBridge();
    const t = createSdkTransportAdapter(bridge as never);

    expect(() => t.request('OPEN_RESOURCE_PICKER', {})).toThrow(/no response type mapped/i);
    expect(sendTypedRequest).not.toHaveBeenCalled();
  });

  it('rejects immediately when the caller passes an already-aborted signal', async () => {
    sendTypedRequest.mockReset();
    sendTypedRequest.mockResolvedValue({ token: { raw: 'tok' } });
    const { bridge } = fakeBridge();
    const t = createSdkTransportAdapter(bridge as never);

    const ac = new AbortController();
    ac.abort(new Error('caller gave up'));

    await expect(t.request('REQUEST_TOKEN', {}, { signal: ac.signal })).rejects.toThrow(
      /caller gave up/,
    );
  });

  it('rejects when the signal aborts while the request is in flight', async () => {
    sendTypedRequest.mockReset();
    // Never settles — the abort is the only thing that can end this.
    sendTypedRequest.mockReturnValue(new Promise(() => {}));
    const { bridge } = fakeBridge();
    const t = createSdkTransportAdapter(bridge as never);

    const ac = new AbortController();
    const pending = t.request('REQUEST_TOKEN', {}, { signal: ac.signal });
    ac.abort(new Error('timed out upstream'));

    await expect(pending).rejects.toThrow(/timed out upstream/);
  });

  it('resolves normally when no signal is supplied', async () => {
    sendTypedRequest.mockReset();
    sendTypedRequest.mockResolvedValue('ok');
    const { bridge } = fakeBridge();
    const t = createSdkTransportAdapter(bridge as never);

    await expect(t.request('REQUEST_TOKEN', {})).resolves.toBe('ok');
  });

  // The bridge's own opts is `{ timeoutMs }` and the SDK's is `{ signal }` — no
  // common property. This pins that the adapter passes NEITHER through, so a
  // future cast cannot silently hand a signal to a parameter that would ignore it.
  it('passes no options object through to the bridge', async () => {
    sendTypedRequest.mockReset();
    sendTypedRequest.mockResolvedValue('ok');
    const { bridge } = fakeBridge();
    const t = createSdkTransportAdapter(bridge as never);

    await t.request('REQUEST_TOKEN', {}, { signal: new AbortController().signal });

    expect(sendTypedRequest.mock.calls[0]![3]).toBeUndefined();
  });
});

describe('sdk-transport adapter — notify and on', () => {
  it('forwards notify to the bridge sendMessage, shape intact', () => {
    const { bridge } = fakeBridge();
    const t = createSdkTransportAdapter(bridge as never);

    t.notify({ type: 'RESIZE_IFRAME', payload: { height: 480 } });

    expect(bridge.sendMessage).toHaveBeenCalledWith({
      type: 'RESIZE_IFRAME',
      payload: { height: 480 },
    });
  });

  it('forwards on() to onMessage and returns its unsubscribe', () => {
    const off = vi.fn();
    const { bridge } = fakeBridge({ onMessage: vi.fn(() => off) });
    const t = createSdkTransportAdapter(bridge as never);

    const handler = vi.fn();
    const returned = t.on('CONSENT_UNAVAILABLE', handler);

    expect(bridge.onMessage).toHaveBeenCalledWith('CONSENT_UNAVAILABLE', handler);
    returned();
    expect(off).toHaveBeenCalledTimes(1);
  });
});
