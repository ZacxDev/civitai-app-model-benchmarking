// A resource TITLE in the matchup detail modal — a checkpoint's or a LoRA's name,
// rendered as PLAIN TEXT.
//
// 🔴 IT IS NOT A LINK, AND THAT IS THE FEATURE. This component was born as
// `ResourceLink` and shipped a `<button>` that called
// `useCivitaiNavigate(modelPath(...), 'current')`. It was removed before release
// because it could not work: all three routes out of a block's sandboxed iframe
// are shut, and one of them (a popup inheriting an opener with no
// `allow-same-origin`) would have landed the viewer on civitai.com LOGGED OUT.
// The full measurement — the host's path rewrite, the unread `target`, the live
// iframe's `sandbox="allow-scripts allow-forms"`, and the `unverified` trust tier
// that follows from it — lives in `lib/resourceLink.ts`. Read that before
// reaching for a link here; it is also why that module still exists.
//
// 🔴 THE RULE THIS ENFORCES: NOTHING MAY ADVERTISE AN ACTION IT CANNOT PERFORM.
// The rendered span carries no underline, no pointer cursor, no `role`, no
// handler. An underline that goes nowhere is indistinguishable from a broken
// link, and a viewer who presses a dead control learns nothing — which is exactly
// the argument that had already made an unlinkable LoRA render as plain text. The
// measurement simply widened that from "some resources" to "all of them".
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
// round-tripped, so the data needed for the links is accumulating on the board
// from today — the fix will be a caller, not a wire migration (which could never
// be applied to another author's rows).

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
