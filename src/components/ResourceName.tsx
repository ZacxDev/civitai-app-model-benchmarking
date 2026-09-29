// A resource TITLE in the matchup detail modal — a checkpoint's or a LoRA's name,
// rendered as PLAIN TEXT.
//
// 🔴 IT IS NOT A LINK, AND THAT IS THE FEATURE. This component was born as
// `ResourceLink` and shipped a `<button>` that called
// `useCivitaiNavigate('/models/<id>?modelVersionId=<v>', 'current')`. It was removed
// before release because it could not work.
//
// ── 🔴 THE MEASUREMENT: THREE ROUTES OUT OF THE IFRAME, ALL SHUT ─────────────
//
// This file is where that record lives now. It used to live in `lib/resourceLink.ts`
// alongside a four-line path builder; the builder was deleted (correct, tested, and
// called by nothing — a string anyone can rewrite in two minutes, so it was not worth
// a module), and the record moved HERE, to the one place a reader lands when they think
// "these names should be clickable". The three routes are INDEPENDENT — closing any one
// alone changes nothing. Measured, not assumed:
//
// 1. `useCivitaiNavigate(path, 'current')` — THE HOST REWRITES THE PATH.
//    `civitai/civitai` at `f3ebfad2f3` (2026-09-28):
//    `src/components/AppBlocks/PageBlockHost.tsx` is the ONLY host that bridges
//    `NAVIGATE` (`hostHandlerParity.ts` marks it `PageBlockHost: 'required'`,
//    `IframeHost: 'model slot is an embedded panel; host-navigation is out of remit
//    (no NAVIGATE bridge)'`). At `:1883` its handler does:
//
//        const cleaned = rawPath.replace(/^\/+/, '');
//        const target = cleaned ? `/apps/run/${encodeURIComponent(slug)}/${cleaned}` : …;
//        void router.push(target, undefined, { shallow: true });
//
//    So `/models/500?modelVersionId=1001` shallow-pushes
//    `/apps/run/model-benchmarking/models/500?modelVersionId=1001`: the URL bar
//    changes, the viewer never leaves the app, and a reload from there lands on a URL
//    the route does not serve. 🔴 THIS IS DELIBERATE UPSTREAM, not an oversight — that
//    file's own security posture at `:175` reads "a block can deep-link WITHIN its page
//    but can't push the host off to an arbitrary route." The SDK's JSDoc and
//    developer.civitai.com both still show `/models/12345` as the example, so the docs
//    and the host disagree; the host is what runs.
//
// 2. `useCivitaiNavigate(path, 'new_tab')` — THE TARGET IS NEVER READ, and the token it
//    would need is not grantable. The handler above reads `payload.path` and reads
//    `payload.target` ZERO times. Independently,
//    `src/components/AppBlocks/sandbox.ts`'s `ALLOWED_SANDBOX_TOKENS` does not contain
//    `allow-popups-to-escape-sandbox`, and `intersectSandbox` filters every declared
//    token through that set — so the token is stripped for EVERY app block whatever its
//    manifest says. That file says so itself, in the review-sandbox comment.
//
// 3. A PLAIN `<a target="_blank">` BUILT FROM THE HOST ORIGIN — PERMITTED, AND WORSE
//    THAN NO LINK. `allow-popups` IS in `ALLOWED_SANDBOX_TOKENS` (unlike the escape
//    token), so a popup could be opened. But a popup inherits its opener's sandbox
//    flags, and this block runs WITHOUT `allow-same-origin` — so the new tab gets an
//    OPAQUE ORIGIN and the viewer arrives at civitai.com LOGGED OUT.
//
// THE READING THAT SETTLED (3), TAKEN ON THE LIVE HOST — off the actual `<iframe>`
// element, buildId `C3kqvYX_JE6v-CVYpApAm`:
//
//     sandbox        = "allow-scripts allow-forms"
//     src            = https://model-benchmarking.civit.ai/#civitai-block=v1&…
//     referrerPolicy = no-referrer
//
// `allow-same-origin` is ABSENT, which means this live, APPROVED block runs at
// `trustTier: 'unverified'` — `intersectSandbox` adds `allow-same-origin` only for the
// `internal`/`verified` tiers (`TRUSTED_TIERS`).
//
// ⚠ PROVENANCE, SPLIT HONESTLY, because the two halves are not equally strong: the
// sandbox string and the tier were measured LIVE against the running host. Routes (1)
// and (2) are a SOURCE READ of `civitai/civitai` at the SHA named — upstream has no
// behavioural test on that path rewrite, and nobody has watched a resource link fail in
// a real host from here. Do not upgrade either half to the other's standard of evidence.
//
// 🔵 FILED AS `civitai/civitai` **issue #5209**, all three routes plus the live sandbox
// reading, as one consumer story. It may close by the host changing OR by the docs being
// corrected to say the path is app-scoped.
//
// 🔴 THE RULE THIS ENFORCES: NOTHING MAY ADVERTISE AN ACTION IT CANNOT PERFORM.
// The rendered span carries no underline, no pointer cursor, no `role`, and NO
// HANDLER. An underline that goes nowhere is indistinguishable from a broken link,
// and a viewer who presses a dead control learns nothing — which is exactly the
// argument that had already made an unlinkable LoRA render as plain text. The
// measurement simply widened that from "some resources" to "all of them".
//
// 🔴 WHICH TEST BACKS WHICH HALF OF THAT SENTENCE, because for one round it backed
// only part of it and the comment did not say so:
//   - the span, the missing role, the absent `<a>`/`<button>` and the
//     `textDecoration: 'none'` → `ResourceName.test.tsx`, plus the subtree sweep in
//     `matchupModalResources.test.tsx`'s "NONE of them is interactive".
//   - 🔴 "NO HANDLER" → `matchupModalResources.test.tsx`'s "pressing every resource
//     name navigates NOWHERE, by ANY channel". It presses every title in the real
//     modal and asserts zero on `window.open`, `location.href` (including a bare
//     `location`), `location.assign`, `location.replace` AND the host `NAVIGATE`
//     message, each with its own positive control.
//     ⚠ THIS CLAIM USED TO BE UNBACKED. The guard asserted only the absence of a
//     `NAVIGATE` message — a MECHANISM, not a state — and two isolated mutants
//     adding nothing but an `onClick` (`window.open(…)`, and
//     `window.location.href = …`) SURVIVED a full green suite. The second is the
//     dangerous one: same-frame navigation needs no sandbox token at all, so it
//     would really have replaced this block with a logged-out civitai.com inside
//     the app frame. That test's header records the two residual channels jsdom
//     will not let it observe; read it before trusting this sentence further than
//     it goes.
//
// ⚠ WHY A COMPONENT AT ALL, when the body is one `<span>`: so there is ONE place
// a future reader lands when they think "these names should be clickable", with
// the record in front of them — and so a test can enumerate every resource title
// in the modal by testid and assert that none of them is interactive. Inlining the
// span would scatter both.
//
// 🔵 WHAT UNLOCKS IT: a TRUST-TIER change (this block is `unverified`; the
// `internal`/`verified` tiers get `allow-same-origin`), or upstream resolving
// `civitai/civitai` **#5209**. `LoraRef.modelId` is already written and
// round-tripped (`renameWireCompat.test.ts` covers both directions), so the data
// needed for the links is accumulating on the board from today — the fix will be a
// caller, not a wire migration (which could never be applied to another author's rows).
// The path itself is one template string and is deliberately NOT pre-built anywhere:
// `src/navigationDormancy.test.ts` asserts no production source asks the host to
// navigate at all, so re-wiring this is a deliberate act with this header in front of it.

export interface ResourceNameProps {
  /** The text on screen — an author label, a model name, or a `#id` fallback. */
  name: string;
  /** Typography from the caller. This component owns no visual affordance. */
  style?: React.CSSProperties;
}

export function ResourceName({ name, style }: ResourceNameProps): React.JSX.Element {
  return (
    <span
      data-testid="resource-name"
      /* 🔴 `textDecoration: 'none'` IS EXPLICIT, not inherited. It is what a test
         can assert, and it stops a future caller's `style` (or an ancestor rule)
         from reintroducing an underline this component has no action behind. It
         goes AFTER the spread so a caller cannot switch it off. */
      style={{ ...style, textDecoration: 'none' }}
    >
      {name}
    </span>
  );
}
