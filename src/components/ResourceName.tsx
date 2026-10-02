// A resource TITLE in the matchup detail modal — a checkpoint's or a LoRA's name.
//
// 🔴 IT IS A LINK AGAIN, AND THAT IS A HOST CHANGE RATHER THAN A CHANGE OF MIND.
// This component was born as `ResourceLink`, shipped a `<button>` that called
// `useCivitaiNavigate('/models/<id>?modelVersionId=<v>', 'current')`, and was reduced
// to an inert `<span>` before release because every route out of a block's sandboxed
// iframe was shut. `civitai/civitai` **#5250** opened one of them: `NAVIGATE` now
// carries a `scope`, and `scope: 'site'` resolves the path at the civitai.com root.
// This app is the originating consumer — the removal is what filed `#5209`.
//
// ── 🔴 THE MEASUREMENT: THREE ROUTES OUT OF THE IFRAME — TWO ARE OPEN ────────
//
// The record is kept, not deleted, because the THIRD is still a hazard and it is what
// decides the ELEMENT below. The routes are INDEPENDENT; opening one changes nothing
// about the others.
//
// ⚠️ A DRAFT OF THIS HEADER SAID "TWO OF THE THREE ARE STILL SHUT", counting route 2
// as shut. That was wrong — see route 2 for the retraction and the measurement that
// settles it. The element choice never rested on route 2; it rests on route 3 alone.
//
// 1. ✅ `useCivitaiNavigate(path, { scope: 'site' })` — OPEN. This used to read "THE
//    HOST REWRITES THE PATH": at `civitai/civitai` `f3ebfad2f3` (2026-09-28)
//    `PageBlockHost.tsx` stripped leading slashes and pushed
//    `/apps/run/<slug>/<path>` shallowly, so `/models/500` deep-linked WITHIN the app
//    and the viewer never left it. That was deliberate upstream ("a block can
//    deep-link WITHIN its page but can't push the host off to an arbitrary route"),
//    and #5250 is the upstream answer to it: the path is resolved at the SITE root,
//    non-shallow, when the block asks for `scope: 'site'`.
//
//    🔴 A LEADING SLASH STILL CARRIES NO MEANING. The host normalises it away in BOTH
//    scopes, so `models/500` and `/models/500` are one request within whichever scope
//    was chosen. The unslashed form is written below because it is the one the SDK's
//    own docs model; nothing depends on the choice. Query strings and hashes ARE
//    preserved (the host appends `url.search + url.hash`), which is what lets the link
//    land on an exact model VERSION rather than the model's default.
//
//    ⚠️ ABSENT `scope` MEANS `'app'`, and the host compares against the literal
//    `'site'` — so an unknown value fails CLOSED onto app scope. Dropping the option
//    from the call below therefore does not error; it silently restores the old
//    deep-link-within-the-app behaviour. That is why the modal test asserts the
//    `scope` field by value rather than asserting that a `NAVIGATE` was sent.
//
// 2. ✅ `{ target: 'new_tab' }` — OPEN, AND NOT USED BY CHOICE RATHER THAN BY
//    OBSTRUCTION. 🔴 A DRAFT OF THIS ENTRY SAID "STILL SHUT" AND GAVE THE SANDBOX
//    TOKEN AS THE REASON. That is RETRACTED, and it was a false claim built by
//    conflating this route with route 3: `allow-popups-to-escape-sandbox` governs a
//    popup THE BLOCK OPENS, which is route 3, and has nothing to say about this one.
//    Measured at `civitai/civitai` `origin/main`, in `PageBlockHost.tsx`'s
//    `if (req.target === 'new_tab')` branch of the NAVIGATE handler: THE HOST opens the
//    tab itself, `window.open(req.href, '_blank', 'noopener')`, FROM THE PARENT FRAME.
//    The iframe's sandbox is not in that path, so no token of ours could gate it.
//
//    ⚠️ AND THE HISTORY MATTERS, BECAUSE "SHUT" WAS ONCE THE RIGHT ANSWER FOR THE
//    WRONG REASON. Measured: `72436ad8c1^` — the parent of #5250 — contains no
//    `new_tab` handling and no `window.open` anywhere in that file, so before #5250
//    this route genuinely was unimplemented, and the pre-release note that recorded it
//    as "the host never implements it" was correct on the day. #5250 added this branch
//    ALONGSIDE the scope field, i.e. one upstream PR opened routes 1 and 2 together.
//    What was never true is the SANDBOX-TOKEN explanation above, in either era. So the
//    defect was not a stale fact going out of date — it was a true conclusion re-derived
//    from a mechanism that did not produce it, which then survived the one event that
//    falsified the conclusion.
//
//    That same `new_tab` branch carries the host's own measurements, taken in Chromium
//    152 with the popup blocker ON: the click's user activation reaches the parent frame
//    even from a cross-origin sandboxed iframe, the activation is TRANSIENT so the open
//    must stay
//    synchronous, and the opened tab "gets a REAL origin: it read a host-set cookie and
//    wrote `localStorage`" — the whole reason the host, and not the block, opens it.
//    `@civitai/blocks-react@0.61.0`'s `useCivitaiNavigate.d.ts` retracts the same claim
//    in its own words: "(Earlier versions of this doc said `"new_tab"` required it —
//    that was wrong.)" Do not re-derive the shut reading; two documents now say so.
//
//    🔴 SO THE REASON THIS APP SENDS `target: 'current'` IS A DECISION, NOT A LIMIT,
//    and there are exactly two supports for it — no third one is implied and none
//    should be invented:
//      (a) THE AUTHOR OF RECORD IS THE OPERATOR. Given the three options, the choice
//          was `'current'` — the parent frame navigates — because it works in every
//          engine and is what #5209 asked to see happen. ⚠️ This is a decision
//          attribution, in the same form as every other "operator decision" in this
//          repo; it is not a measurement and nothing in the tree can settle it.
//      (b) THE MEASURED GAP. The host's own note on this branch reads "NOT MEASURED:
//          any non-Chromium engine. If one blocks this, the viewer gets no tab — the
//          pre-#5209 behaviour — rather than a wrong one". A `'new_tab'` here would
//          therefore risk a dead control on an unknown share of viewers, which the rule
//          further down forbids; `'current'` has no such exposure.
//    `'current'` is the SDK's default, hence omitted from the call below. (#5209 is
//    referred to in the past tense deliberately — that issue is closed; see the note
//    further down before citing it as live.)
//
// 3. ❌ A PLAIN `<a target="_blank">` BUILT FROM THE HOST ORIGIN — PERMITTED, AND
//    WORSE THAN NO LINK. `allow-popups` IS in `ALLOWED_SANDBOX_TOKENS`, so a popup
//    could be opened. But a popup inherits its opener's sandbox flags, and this block
//    runs WITHOUT `allow-same-origin` — so the new tab gets an OPAQUE ORIGIN and the
//    viewer arrives at civitai.com LOGGED OUT.
//
// 🔴 WHICH IS WHY THIS IS A `<button>` AND NOT AN `<a href>`. An `<a href>` inside
// this iframe navigates THE IFRAME — it would replace the running block with
// civitai.com at an opaque origin, inside the app frame, logged out. Same-frame
// navigation needs no sandbox token at all (`allow-top-navigation` governs the TOP
// context, not the frame's own), so that is a live hazard and not a theoretical one:
// `matchupModalResources.test.tsx` still watches `window.open`, `location.href`,
// `location.assign` and `location.replace` and still requires all four to stay at
// zero. The ONLY channel this component may use is the host message.
//
// THE READING THAT SETTLED (3), TAKEN ON THE LIVE HOST — off the actual `<iframe>`
// element, buildId `C3kqvYX_JE6v-CVYpApAm`:
//
//     sandbox        = "allow-scripts allow-forms"
//     src            = https://model-benchmarking.civit.ai/#civitai-block=v1&…
//     referrerPolicy = no-referrer
//
// `allow-same-origin` is ABSENT, which means this live, APPROVED block runs at
// `trustTier: 'unverified'`. That has NOT changed — `scope: 'site'` is granted by
// surface, not by trust tier, which is the whole reason the fix could land without
// one.
//
// ── 🔴 THE HONEST COST: `private-run` IS A SILENTLY DEAD CONTROL ─────────────
//
// `scope: 'site'` is granted PER SURFACE by the host's `BLOCK_HOST_SITE_NAVIGATION`
// record:
//
//     page-run        true     ← what real viewers get
//     dev-tunnel      true
//     private-run     FALSE    ← owner/moderator preview of a non-public or
//                                suspended app
//     review-preview  FALSE
//     model-slot      FALSE    (no NAVIGATE bridge there at all)
//
// 🔴 AND THE BLOCK CANNOT TELL WHICH SURFACE IT IS ON. The SDK exposes no capability
// flag to branch on — there is no `canNavigateSite` in `BlockContext`, and `NAVIGATE`
// is FIRE-AND-FORGET: the host never replies, so a refusal is indistinguishable from
// a success and this component cannot show an error, degrade, or fall back. On
// `private-run` and `review-preview` these titles therefore advertise an action they
// cannot perform, which is exactly what the rule below forbids.
//
// 🔴 THE OPERATOR HAS ACCEPTED THAT TRADE, EXPLICITLY, and the reasoning is recorded
// here rather than implied: `page-run` is the surface real viewers reach, this app is
// live and approved there, and the fix was asked for. The dead-control rule is not
// repealed — it is overridden for two preview surfaces, in exchange for the links
// working for everyone who is not an owner previewing their own unpublished app. If
// the SDK ever exposes a per-surface capability, branching on it is the fix and this
// paragraph is the reason to go looking.
//
// 🔴 THE RULE THIS STILL ENFORCES: NOTHING MAY ADVERTISE AN ACTION IT CANNOT PERFORM.
// A resource with no `modelId` has no page to go to, so it keeps rendering as the
// inert `<span>` — no underline, no pointer cursor, no `role`, NO HANDLER. That is
// not a legacy branch: `LoraRef.modelId` is OPTIONAL FOREVER (see `../types.ts` — a
// shared row belongs to its author, so rows published before the field existed can
// never be backfilled), so the unlinked variant is a permanent, first-class case.
//
// ⚠️ NOTHING HERE HAS BEEN CLICKED IN A REAL HOST. The upstream contract was read from
// the installed `@civitai/blocks-react@0.61.0` (`useCivitaiNavigate.d.ts` and its
// implementation) and from `civitai/civitai`'s own source. Do not upgrade any sentence
// above to "verified live".
//
// ⚠️ AND #5209 IS ALREADY CLOSED, so do not go looking for an issue that tracks the
// click-through. Measured: #5250 merged `2026-09-30T20:13:53Z` and #5209 closed two
// seconds later, `20:13:55Z` — i.e. upstream closed it on the HOST change, not on a
// consumer adopting it. So the live check is a verification step owed on THIS change
// by whoever merges it, with no open object behind it. A draft of this file called it
// "the remaining half of #5209's closing condition", which would have sent a reader to
// a closed issue.
//
// 🔴 WHICH TEST BACKS WHICH HALF:
//   - the two variants' shape (tag, role, `textDecoration`, the caller-style override)
//     → `ResourceName.test.tsx`.
//   - 🔴 THE BEHAVIOUR → `matchupModalResources.test.tsx`'s "pressing a resource name
//     asks the host to leave for civitai.com, by THAT channel only". It opens the real
//     modal, presses every title, and asserts (a) exactly one `NAVIGATE` with
//     `scope: 'site'` and the exact path including `?modelVersionId=`, (b) zero on
//     `window.open` / `location.href` (including a bare `location`) /
//     `location.assign` / `location.replace`, each with its own positive control, and
//     (c) that a LoRA with no `modelId` sends nothing and is not interactive.
//     ⚠️ (b) IS THE HALF THAT MUST NOT BE RELAXED. Two isolated mutants that added
//     nothing but an `onClick` — `window.open(…)` and `window.location.href = …` —
//     once SURVIVED a full green suite against the inert span. The second is the
//     dangerous one and the reason for the element choice above.

import { useCivitaiNavigate } from '@civitai/blocks-react';

export interface ResourceNameProps {
  /** The text on screen — an author label, a model name, or a `#id` fallback. */
  name: string;
  /** Typography from the caller. This component owns the affordance, not the type. */
  style?: React.CSSProperties;
  /**
   * The resource's MODEL id — what `/models/<id>` addresses on civitai.com.
   *
   * Present (a positive safe integer) ⇒ the name becomes an interactive control.
   * Anything else — absent, 0, negative, fractional, non-finite, or beyond 2^53-1 ⇒
   * the inert `<span>`, byte-for-byte as before. `CheckpointRef.modelId` is required;
   * `LoraRef.modelId` is optional forever — see `../types.ts`.
   *
   * 🔴 THE JUNK IS WIRE-REACHABLE, AND THAT IS WHY `usableId` IS AS NARROW AS IT IS.
   * ⚠️ An earlier draft of this paragraph named the wrong route — it said
   * `MatchupForm.tsx`'s `loraInfo()` coerces a missing id with `modelId ?? 0`, which is
   * true but goes nowhere near here: that value feeds upstream's `ResourceCard` and
   * `resourceDisplayName` only, and is never fed back into a `LoraRef` (see that
   * function's own docblock). The REAL route is the shared board. `data` is an opaque,
   * unmoderated blob written by other clients, and `lib/benchmark.ts`'s `isNum` is
   * `typeof v === 'number' && Number.isFinite(v)` — which admits `0`, negatives,
   * fractions and exponential-notation magnitudes alike. So `parseCheckpoint` accepts
   * `modelId: 1.5` or `modelId: 1e21` (it only requires `isNum`) and `parseLoras`
   * carries one through, and either lands on this prop. A truthiness test would reject
   * only `0`; see `usableId` for the measurement that set the rest of the bound.
   */
  modelId?: number;
  /**
   * The resource's VERSION id, so the link lands on the exact version rather than the
   * model's default. Carried as `?modelVersionId=` — the host preserves the query
   * string. Gated by the SAME `usableId`, so it is omitted from the path unless it is a
   * positive safe integer — a fractional or exponential-notation version would
   * otherwise pin the link to a version that does not exist, whereas dropping it lands
   * on the model's default version, which is a real page.
   */
  versionId?: number;
}

/**
 * A positive, exactly-representable INTEGER id — the only kind that addresses anything.
 *
 * 🔴 `Number.isFinite(id) && id > 0` WAS NOT ENOUGH, and the gap was reachable by the
 * same wire route as `0` and the negatives. Measured against the live component, all
 * three of these rendered the interactive `<button>` and built a path the host accepts:
 *
 *     modelId 1.5     →  models/1.5?modelVersionId=1001
 *     modelId 1e21    →  models/1e+21?modelVersionId=1001
 *     modelId 5e-324  →  models/5e-324?modelVersionId=1001
 *
 * None of those addresses a model page, so each is the rule above — NOTHING MAY
 * ADVERTISE AN ACTION IT CANNOT PERFORM — failing: a viewer presses an underlined
 * control, loses their modal and their place in the grid, and lands on a non-page.
 * That is strictly worse than the plain text the same row would otherwise have shown.
 *
 * 🔴 `Number.isSafeInteger`, NOT `Number.isInteger`, AND THE DIFFERENCE IS ONE OF THE
 * THREE CASES ABOVE. Measured: `Number.isInteger(1e21)` is `true` — 1e21 has no
 * fractional part — so an integer test alone still admits it, and `String(1e21)` is
 * `'1e+21'`, i.e. exponential notation in a URL path. The safe-integer bound is the
 * principled cut rather than a patch for that one literal: above 2^53-1 a JS number
 * cannot represent a distinct id at all, so such a value is not an id whatever it
 * stringifies to, and every integer at or below the bound stringifies as plain digits.
 * `isSafeInteger` already implies finite and non-fractional, so it subsumes the old
 * test rather than sitting beside it.
 */
function usableId(id: number | undefined): id is number {
  return typeof id === 'number' && Number.isSafeInteger(id) && id > 0;
}

/**
 * The site path for a model, version-pinned when we have the version.
 *
 * 🔴 NO LEADING SLASH, and no `civitai.com` either: `scope: 'site'` names the space
 * and this is a path WITHIN it. Building an absolute URL here would be the route-3
 * mistake wearing a different hat.
 *
 * ⚠️ NOT EXPORTED, AND THAT IS A DELIBERATE REVERSAL. A draft of this file exported it
 * so a test could assert the string directly — which is exactly the shape this repo
 * already deleted once: `lib/resourceLink.ts` held a four-line `modelPath` builder,
 * "correct, tested, and called by nothing", and was removed because a template string
 * anyone can rewrite in two minutes is not worth a module boundary. Re-adding the same
 * builder one directory over, with the same justification inverted, would have been
 * that module boundary under a new roof. It stays a local function: named for
 * readability at the call site, reachable only through the component, and asserted
 * through the component's rendered behaviour where a caller can actually get it wrong.
 */
function modelSitePath(modelId: number, versionId?: number): string {
  return usableId(versionId)
    ? `models/${modelId}?modelVersionId=${versionId}`
    : `models/${modelId}`;
}

export function ResourceName({
  name,
  style,
  modelId,
  versionId,
}: ResourceNameProps): React.JSX.Element {
  // Called unconditionally — hook order cannot depend on whether this resource
  // happens to carry an id.
  const { navigate } = useCivitaiNavigate();

  if (!usableId(modelId)) {
    return (
      <span
        data-testid="resource-name"
        /* 🔴 `textDecoration: 'none'` IS EXPLICIT, not inherited. It is what a test
           can assert, and it stops a future caller's `style` (or an ancestor rule)
           from reintroducing an underline this branch has no action behind. It
           goes AFTER the spread so a caller cannot switch it off. */
        style={{ ...style, textDecoration: 'none' }}
      >
        {name}
      </span>
    );
  }

  return (
    <button
      type="button"
      data-testid="resource-name"
      /* 🔴 THE ACCESSIBLE NAME SAYS WHERE IT GOES. The visible text is just the model
         name, which announces as an unexplained button; the viewer is about to LEAVE
         the app, so the control has to say so. No `role="link"`: this is a button that
         posts a message and the host decides — announcing it as a link would promise
         middle-click, copy-link-address and a status-bar URL, none of which exist. */
      aria-label={`Open ${name} on Civitai`}
      onClick={() => navigate(modelSitePath(modelId, versionId), { scope: 'site' })}
      style={{
        // Strip the UA button chrome so the title still reads as a title…
        background: 'none',
        border: 'none',
        padding: 0,
        margin: 0,
        font: 'inherit',
        color: 'inherit',
        textAlign: 'left',
        // …then take the caller's typography…
        ...style,
        /* …and OWN the affordance, after the spread, for the same reason the inert
           branch owns its absence: a caller must not be able to switch off the one
           thing that says this is a control. The underline is not decoration — a
           pointer cursor is invisible until the pointer is already on the control and
           never appears at all on a touch device, which is the argument
           `gridDrillIn.test.tsx` records for the matchup band. */
        textDecoration: 'underline',
        cursor: 'pointer',
        /* 🔴 AND NO `outline` DECLARATION AT ALL — THAT IS THE FOCUS RING, NOT THE
           ABSENCE OF ONE. A draft here carried `outline: focused ? … : 'none'` behind a
           `useState`, on the reasoning that an inline style cannot express a
           pseudo-class. The reasoning was sound and the premise was wrong: NOTHING
           suppresses the UA's `:focus-visible` ring on this button. The state's own
           `'none'` was the only thing hiding the ring it then re-added.
           🔴 THE ENUMERATION IS THE WHOLE EVIDENCE, so it names every sheet that
           reaches this document. ⚠️ TWO EARLIER DRAFTS GOT IT WRONG — the first listed
           three sources, the second listed five but ATTRIBUTED THE INJECTED ONE TO THE
           WRONG PACKAGE. What is actually in the document:
             1. `index.html`'s inline `<style>`, `src/index.css`, and the two sheets
                THIS APP injects as elements (`App.tsx`'s `compact-styles` and
                `layout-styles`, from `compact.ts`) — no `outline` in any sheet this
                app owns. (⚠️ NOT "nowhere in `src/`", which a draft of this line
                claimed: `GridPicker.tsx:380` has one. It is an INLINE style on that
                component's own element, so it reaches no sheet and no selector — see
                the note at the end of this block.)
             2. `@civitai/blocks-react/dist/ui/styles.js` (`injectBlocksStyles()`) — one
                `outline: none`, on `[data-civitai-ui='modal']` ITSELF, no descendant
                combinator, so it cannot reach here. It also carries three
                `:focus-visible { outline: 2px solid var(--civitai-color-primary) }`
                rules, for the pack's OWN elements.
             3. 🔴 `@civitai/components@0.9.0`'s `components.css` — and THIS is the one
                the previous draft misfiled as "Lit shadow styles, unreachable from
                light DOM, and nothing in this app imports it". It is a LIGHT-DOM
                `@layer civitai.components` sheet and it IS injected: `ui/styles.js`
                imports `componentsCss` + `injectStyles` from `@civitai/components`,
                which pnpm resolves FOR BLOCKS-REACT to 0.9.0, and
                `injectBlocksStyles()` writes it. Its only `outline: none` is nested
                under `[data-civitai-ui-control]:focus` — an attribute the pack's form
                controls carry and this button does not.
             4. ⚠️ `@civitai/components@0.4.3` (`main.tsx`'s own `injectStyles()`) is a
                NO-OP, which is the half that inverted. Both majors guard on the same
                `data-civitai-components` marker and early-return if it exists, and
                `main.tsx` calls `injectBlocksStyles()` BEFORE `injectComponentStyles()`
                — so 0.9.0's sheet lands first and 0.4.3's never does. Its own
                `outline: none` happens to sit on the same selector, which is why the
                conclusion survived a wrong premise.
             5. `@civitai/theme` (0.4.0, and 0.3.2 transitively) — zero `outline`,
                zero `:focus`.
           Every other `outline` in the pack is an INLINE style on its own elements
           (`TipButton`, `ReportButton`, `pickerOverlay`). ⚠️ NOT `ResourceCard`: a
           draft named it, but its only match is `variant: "outline"` on a `Badge`.
           🔴 THE FORWARD HAZARD, stated because this comment is load-bearing for a
           queued change: `SideNav.tsx`'s gate IS a `components-react` bump, and after
           it `main.tsx`'s call is no longer a no-op. Re-run this enumeration then.
           ⚠️ So the UA ring is what a keyboard viewer gets, and it is REAL
           `:focus-visible` rather than the mouse-press-too approximation the state
           gave. It is not token-coloured: the pack styles its OWN components with
           `:focus-visible { outline: 2px solid var(--civitai-color-primary) }` (three
           such rules), which a local component cannot reach without a stylesheet this
           app does not have. Tinting it from here is possible and deliberately NOT
           done — it would rest on UA cascade behaviour jsdom cannot verify.
           🔴 WHAT MUST NEVER COME BACK IS A SUPPRESSION, AND THE GUARD THAT PINS IT
           HAS BEEN WIDENED TWICE BECAUSE EACH EARLIER VERSION READ WIDER THAN IT WAS.
           ⚠️ Draft 1 of this comment named "`outline: 'none'`" and
           `ResourceName.test.tsx` guarded exactly that word — so `outline: 0`,
           `outlineStyle: 'none'` and `outlineWidth: 0` each SURVIVED while suppressing
           the ring identically, and `outline: 0` is the *more* common reset idiom.
           ⚠️ Draft 2 enumerated the DECLARED property names, required none to begin
           with `outline`, and claimed the family was thereby closed — "a suppression
           has to be spelled as some `outline*` property to exist at all". THAT WAS
           FALSE. `all: 'unset'` — the idiomatic one-line replacement for exactly the
           chrome strip this style object opens with — resets `outline-style` to its
           initial `none` without ever naming it, and SURVIVED that guard 8/8.
           🔴 THE GUARD NOW HAS TWO ARMS: no declared name may begin with `outline`,
           and no declared `all`. Over today's CSS property registry that is every
           inline declaration which can switch this ring off, `all` being the only
           shorthand besides `outline` itself whose sub-properties include the outline
           longhands. ⚠️ IT IS STILL NOT CLOSED, and the three open shapes are named
           here rather than left for the next reader to rediscover: a reset shorthand
           CSS adds later walks it exactly as `all` did; a CALLER's `style` is outside
           the default render the guard reads (this branch defends `textDecoration` and
           `cursor` by re-declaring them after the spread, and cannot defend a property
           it never sets); and a declared-style read cannot see a ring killed by a class
           or a sheet — which is what the five-sheet enumeration above is for, and why
           it has to be re-run on a `@civitai/*` bump.
           `GridPicker.tsx:380` is NOT a precedent for the state: it keys on a
           SELECTION, which has no pseudo-class. Focus has one. */
      }}
    >
      {name}
    </button>
  );
}
