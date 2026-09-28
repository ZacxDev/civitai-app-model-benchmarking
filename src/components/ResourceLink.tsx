// A resource TITLE that navigates to its model page on civitai.com — or plain
// text when it cannot.
//
// 🔴 THE UNLINKED STATE IS PERMANENT, NOT A MIGRATION WINDOW. `LoraRef.modelId`
// was only added to the wire shape by this change, and a published shared row
// belongs to its author: `shared.update`/`withdraw` are author-scoped, so this app
// can never backfill another viewer's row. Every LoRA published before this change
// therefore lacks `modelId` FOREVER, and its title will render as plain text on
// every viewer's screen for as long as the row exists.
//
// 🔴 WHICH IS WHY THE UNDERLINE IS LOAD-BEARING. It is the only thing that
// separates "this is not a link" from "this is a link and it is broken". A linked
// title is underlined and takes the primary colour; an unlinked one is explicitly
// `textDecoration: 'none'` and renders NO interactive element at all — not a
// disabled button, not a `<button>` with no handler. A dead control is worse than
// no control, because a viewer who presses it learns nothing.
//
// 🔴 IT IS A `<button>`, NOT AN `<a href>`. A block renders inside a sandboxed
// iframe (`iframe.sandbox: "allow-scripts allow-forms"` in `block.manifest.json`)
// where a top-level navigation is host-mediated, so an `<a href>` would either be
// inert or would punch the viewer out of the app mid-task. Upstream's own
// `ResourceCard` declined to be a link for the same reason and says so in its own
// header. What the host currently DOES with the requested path is measured in
// `lib/resourceLink.ts` — read that before trusting this to land.

import { useCivitaiNavigate } from '@civitai/blocks-react';

import { modelPath } from '../lib/resourceLink.js';
import { token } from '../theme.js';

export interface ResourceLinkProps {
  /** The text on screen — an author label, a model name, or a `#id` fallback. */
  name: string;
  /**
   * The model this title names. ABSENT is a normal, permanent state — see the
   * header. Absent ⇒ plain text, no interactive element.
   */
  modelId?: number;
  /** Pins the page to a version when known. */
  versionId?: number;
  /** Typography from the caller; this component owns only the link affordance. */
  style?: React.CSSProperties;
}

export function ResourceLink({
  name,
  modelId,
  versionId,
  style,
}: ResourceLinkProps): React.JSX.Element {
  const { navigate } = useCivitaiNavigate();

  if (modelId === undefined) {
    return (
      <span data-testid="resource-plain" style={{ ...style, textDecoration: 'none' }}>
        {name}
      </span>
    );
  }

  return (
    <button
      type="button"
      data-testid="resource-link"
      /* 🔴 THE VISIBLE TEXT IS INSIDE THE ACCESSIBLE NAME, not replaced by it.
         WCAG 2.5.3 (Label in Name) needs the visible label to be contained in the
         accessible name, so voice control ("click JuggernautXL") still works —
         and a bare name would not tell a screen reader user that pressing this
         leaves the app. */
      aria-label={`Open ${name} on Civitai`}
      onClick={() => navigate(modelPath(modelId, versionId), 'current')}
      /* 🔴 THE CALLER'S `style` GOES FIRST AND THE AFFORDANCE LAST. The underline
         is what distinguishes a link from broken text (see the header), so a
         caller passing typography must not be able to switch it off by accident. */
      style={{
        appearance: 'none',
        background: 'none',
        border: 'none',
        padding: 0,
        margin: 0,
        font: 'inherit',
        textAlign: 'left',
        ...style,
        cursor: 'pointer',
        color: token.primary,
        textDecoration: 'underline',
        textUnderlineOffset: '2px',
      }}
    >
      {name}
    </button>
  );
}
