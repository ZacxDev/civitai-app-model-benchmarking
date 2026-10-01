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
// ── 🔴 THE MEASUREMENT: THREE ROUTES OUT OF THE IFRAME — ONE IS NOW OPEN ─────
//
// The record is kept, not deleted, because TWO of the three are still shut and they
// are what decide the ELEMENT below. The routes are INDEPENDENT; opening one changes
// nothing about the others.
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
// 2. ❌ `{ target: 'new_tab' }` — STILL SHUT, and deliberately NOT USED. The sandbox
//    token a popup would need (`allow-popups-to-escape-sandbox`) is absent from the
//    host's `ALLOWED_SANDBOX_TOKENS`, and `intersectSandbox` filters every declared
//    token through that set, so it is dropped for EVERY app block whatever its
//    manifest says. The SDK's own hook doc now says the same thing. Independently,
//    the host's note on `'new_tab'` records it as "NOT MEASURED: any non-Chromium
//    engine" — so it would be a dead control on an unknown share of viewers. The
//    operator's call is `target: 'current'` (the default, hence omitted below): it
//    works in every engine, and #5209's closing condition is literally the parent
//    frame landing on the civitai.com model page.
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
// ⚠️ NOTHING HERE HAS BEEN CLICKED IN A REAL HOST. The upstream contract was read
// from the installed `@civitai/blocks-react@0.61.0` (`useCivitaiNavigate.d.ts` and its
// implementation) and from `civitai/civitai`'s own source; the live click-through —
// the parent frame actually landing on the civitai.com model page — is the remaining
// half of #5209's closing condition and is owned by the operator. Do not upgrade any
// sentence above to "verified live".
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

import { useState } from 'react';

import { useCivitaiNavigate } from '@civitai/blocks-react';

import { token } from '../theme.js';

export interface ResourceNameProps {
  /** The text on screen — an author label, a model name, or a `#id` fallback. */
  name: string;
  /** Typography from the caller. This component owns the affordance, not the type. */
  style?: React.CSSProperties;
  /**
   * The resource's MODEL id — what `/models/<id>` addresses on civitai.com.
   *
   * Present (positive, finite) ⇒ the name becomes an interactive control. Absent, 0,
   * or non-finite ⇒ the inert `<span>`, byte-for-byte as before. `CheckpointRef.modelId`
   * is required; `LoraRef.modelId` is optional forever — see `../types.ts`.
   *
   * 🔴 `0` MUST RENDER AS PLAIN TEXT, and it is a reachable value rather than a
   * hypothetical: `MatchupForm.tsx`'s `loraInfo()` coerces a missing id with
   * `modelId ?? 0` to satisfy upstream's `BlockResourceInfo`. A truthiness test would
   * already reject it; the explicit positive-and-finite test is what also rejects
   * `NaN` and a negative, neither of which addresses a model page.
   */
  modelId?: number;
  /**
   * The resource's VERSION id, so the link lands on the exact version rather than the
   * model's default. Carried as `?modelVersionId=` — the host preserves the query
   * string. Omitted from the path when absent or not positive-finite.
   */
  versionId?: number;
}

/** A positive, finite id — the only kind that addresses anything. */
function usableId(id: number | undefined): id is number {
  return typeof id === 'number' && Number.isFinite(id) && id > 0;
}

/**
 * The site path for a model, version-pinned when we have the version.
 *
 * 🔴 NO LEADING SLASH, and no `civitai.com` either: `scope: 'site'` names the space
 * and this is a path WITHIN it. Building an absolute URL here would be the route-3
 * mistake wearing a different hat.
 */
export function modelSitePath(modelId: number, versionId?: number): string {
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
  // 🔴 FOCUS AS STATE, NOT `:focus-visible`. This app has no component stylesheet —
  // `index.css` is a bare reset and nothing in `src/` uses `className` — so an inline
  // style cannot express a pseudo-class. The precedent is `GridPicker.tsx`'s active
  // outline. The cost, stated rather than hidden: the ring shows on a mouse press too,
  // where a real `:focus-visible` would suppress it. A ring that is sometimes
  // redundant beats a control a keyboard viewer cannot see.
  const [focused, setFocused] = useState(false);

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
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
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
        outline: focused ? `2px solid ${token.primary}` : 'none',
        outlineOffset: 2,
      }}
    >
      {name}
    </button>
  );
}
