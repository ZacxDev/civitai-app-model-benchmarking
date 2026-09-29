// The civitai.com resource-URL builder — CORRECT, TESTED, AND DELIBERATELY
// UNCALLED. Read this whole header before wiring it to anything.
//
// ── 🔴 WHY NOTHING CALLS IT: THREE ROUTES OUT OF THE IFRAME, ALL SHUT ────────
//
// This app wanted its checkpoint / LoRA titles to open the model page. Every way
// a block can do that is closed today, and the three are INDEPENDENT — closing
// any one of them alone changes nothing. Measured, not assumed:
//
// 1. `useCivitaiNavigate(path, 'current')` — THE HOST REWRITES THE PATH.
//    `civitai/civitai` at `f3ebfad2f3` (2026-09-28):
//    `src/components/AppBlocks/PageBlockHost.tsx` is the ONLY host that bridges
//    `NAVIGATE` (`hostHandlerParity.ts` marks it `PageBlockHost: 'required'`,
//    `IframeHost: 'model slot is an embedded panel; host-navigation is out of
//    remit (no NAVIGATE bridge)'`). At `:1883` its handler does:
//
//        const cleaned = rawPath.replace(/^\/+/, '');
//        const target = cleaned ? `/apps/run/${encodeURIComponent(slug)}/${cleaned}` : …;
//        void router.push(target, undefined, { shallow: true });
//
//    So `modelPath(500, 1001)` shallow-pushes
//    `/apps/run/model-benchmarking/models/500?modelVersionId=1001`: the URL bar
//    changes, the viewer never leaves the app, and a reload from there lands on a
//    URL the route does not serve.
//    🔴 THIS IS DELIBERATE UPSTREAM, not an oversight — the file's own security
//    posture at `:175` reads "a block can deep-link WITHIN its page but can't push
//    the host off to an arbitrary route." The SDK's JSDoc and
//    developer.civitai.com both still show `/models/12345` as the example, so the
//    docs and the host disagree; the host is what runs.
//
// 2. `useCivitaiNavigate(path, 'new_tab')` — THE TARGET IS NEVER READ, and the
//    token it would need is not grantable. The handler above reads `payload.path`
//    and reads `payload.target` ZERO times. Independently,
//    `src/components/AppBlocks/sandbox.ts`'s `ALLOWED_SANDBOX_TOKENS` does not
//    contain `allow-popups-to-escape-sandbox`, and `intersectSandbox` filters
//    every declared token through that set — so the token is stripped for EVERY
//    app block whatever its manifest says. That file says so itself, in the
//    review-sandbox comment.
//
// 3. A PLAIN `<a target="_blank">` BUILT FROM THE HOST ORIGIN — PERMITTED, AND
//    WORSE THAN NO LINK. `allow-popups` IS in `ALLOWED_SANDBOX_TOKENS` (unlike the
//    escape token), so a popup could be opened. But a popup inherits its opener's
//    sandbox flags, and this block runs WITHOUT `allow-same-origin` — so the new
//    tab gets an OPAQUE ORIGIN and the viewer arrives at civitai.com logged out.
//
// ── 🔴 THE MEASUREMENT THAT SETTLED (3), TAKEN ON THE LIVE HOST ──────────────
//
// Read off the actual `<iframe>` element on the running host page, buildId
// `C3kqvYX_JE6v-CVYpApAm`:
//
//     sandbox        = "allow-scripts allow-forms"
//     src            = https://model-benchmarking.civit.ai/#civitai-block=v1&…
//     referrerPolicy = no-referrer
//
// `allow-same-origin` is ABSENT, which means this live, APPROVED block runs at
// `trustTier: 'unverified'` — `intersectSandbox` adds `allow-same-origin` only for
// the `internal`/`verified` tiers (`TRUSTED_TIERS`).
//
// 🔴 SO THE UNLOCK IS A TRUST-TIER CHANGE, NOT A CODE CHANGE. Nothing this repo
// can write opens route (3); promoting the block to a trusted tier does. Routes
// (1) and (2) need an upstream decision either way.
//
// ⚠ PROVENANCE, SPLIT HONESTLY, because the two halves are not equally strong:
// the sandbox string and the tier above were measured LIVE against the running
// host. Routes (1) and (2) are a SOURCE READ of `civitai/civitai` at the SHA
// named — upstream has no behavioural test on that path rewrite, and nobody has
// watched a resource link fail in a real host from here. Do not upgrade either
// half to the other's standard of evidence.
//
// 🔵 FILED AS `civitai/civitai` **issue #5209**, all three routes plus the live
// sandbox reading, as one consumer story. It may close by the host changing OR by
// the docs being corrected to say the path is app-scoped.
//
// ── 🔴 WHAT THE APP DOES INSTEAD, AND WHY THAT IS THE POINT ──────────────────
//
// Resource titles render as PLAIN TEXT — no underline, no `<button>`, no `<a>`,
// no `navigate()` call anywhere in `src/`. A control that advertises an action it
// cannot perform is worse than no control: a viewer who presses it learns nothing,
// and an underline that goes nowhere is indistinguishable from a broken link. That
// is the same argument that made an unlinkable LoRA render as plain text; the
// measurement above simply widened it from "some resources" to "all of them".
// `components/ResourceName.tsx` is the one place that renders a title, and it
// points here.
//
// 🔴 THIS MODULE IS KEPT ON PURPOSE. `LoraRef.modelId` is still written and still
// round-tripped (`renameWireCompat.test.ts` covers both directions), so the DATA
// needed to build these links is accumulating on the board from today. The day the
// tier changes, the fix is a caller — not a wire migration, which could never be
// applied retroactively to other authors' rows. `resourceLink.test.ts` asserts
// nothing calls it yet, so re-wiring it is a deliberate act with this header in
// front of it.

/**
 * The site path for a model, version-pinned when the version is known.
 *
 * `modelId` is the addressable unit on civitai.com — `/models/<modelId>` — and
 * `?modelVersionId=` selects which version the page opens on. A version id alone
 * is NOT addressable, which is why this takes the model id first and requires it.
 */
export function modelPath(modelId: number, versionId?: number): string {
  const base = `/models/${modelId}`;
  return versionId === undefined ? base : `${base}?modelVersionId=${versionId}`;
}
