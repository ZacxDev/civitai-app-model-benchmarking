// The ONE place a civitai.com resource path is built.
//
// 🔴 ONE RULE, ONE PLACE. A checkpoint link and a LoRA link are the same URL shape
// over different fields, and a path spelled at two call sites is a path that
// disagrees at one of them. Everything that renders a resource title as a link
// goes through {@link modelPath}; nothing else concatenates `/models/`.
//
// ── 🔴 WHAT THE HOST ACTUALLY DOES WITH THIS PATH, MEASURED ──────────────────
//
// The SDK's `useCivitaiNavigate(path, 'current')` posts
// `{ type: 'NAVIGATE', payload: { path, target } }` and the host mediates. The
// documentation (`@civitai/blocks-react`'s own JSDoc, and
// developer.civitai.com/apps/reference/hooks) says a block may request a
// navigation "within civitai.com" and its worked example is `/models/12345`.
//
// 🔴 THE ONLY HOST THAT BRIDGES `NAVIGATE` DOES NOT DO THAT. Read against
// `civitai/civitai` at `f3ebfad2f3` (2026-09-28),
// `src/components/AppBlocks/PageBlockHost.tsx` is the sole implementation
// (`hostHandlerParity.ts` marks `NAVIGATE` as `PageBlockHost: 'required'`,
// `IframeHost: 'model slot is an embedded panel … (no NAVIGATE bridge)'`), and it
// REWRITES every path into the app's own sub-path space:
//
//     const cleaned = rawPath.replace(/^\/+/, '');
//     const target = cleaned ? `/apps/run/${encodeURIComponent(slug)}/${cleaned}` : …
//     void router.push(target, undefined, { shallow: true });
//
// It also ignores `payload.target` entirely, so `'new_tab'` is unreachable on this
// surface for a second, independent reason.
//
// So on the measured host revision `modelPath(500, 1001)` shallow-pushes
// `/apps/run/model-benchmarking/models/500?modelVersionId=1001` — the URL bar
// changes and the viewer never leaves the app. The app-side call is correct; the
// affordance cannot land until the host stops rewriting the path, and that is NOT
// something this repo can work around: the host is the only thing that can perform
// a top-level navigation out of a sandboxed iframe.
//
// 🔵 FILED UPSTREAM as `civitai/civitai` **issue #5209** — the path rewrite and the
// missing `allow-popups-to-escape-sandbox` token as ONE consumer story, since either
// alone blocks the feature. It may close by the host changing OR by the docs being
// corrected to say the path is app-scoped; the issue names both outcomes. Nothing
// here changes until it does.
//
// ⚠ THE EVIDENCE IS A SOURCE READ, NOT A LIVE CLICK. Upstream has no behavioural
// test on that handler's rewrite, and nobody has watched a resource link fail in a
// real host from here. Do not upgrade this to "measured in production".
//
// ⚠ Recorded so nobody "fixes" it here. An `<a href>` is not the workaround
// either — upstream's own `ResourceCard` declined to be a link for exactly this
// reason ("a block renders inside a sandboxed iframe where a top-level navigation
// is host-mediated … so an `<a href>` here would either be inert or would punch
// the viewer out of the app mid-task").

/**
 * The site path for a model, version-pinned when the version is known.
 *
 * `modelId` is the addressable unit on civitai.com — `/models/<modelId>` — and
 * `?modelVersionId=` selects which version the page opens on. A version id alone
 * is NOT addressable, which is why {@link modelPath} takes the model id first and
 * requires it.
 */
export function modelPath(modelId: number, versionId?: number): string {
  const base = `/models/${modelId}`;
  return versionId === undefined ? base : `${base}?modelVersionId=${versionId}`;
}
