// The inline THUMBNAIL PREVIEW on a grid card — real images, read through the
// per-viewer gated bridge, so a viewer can tell two grids apart without opening
// either.
//
// 🔴 THE READ BUDGET IS THE WHOLE DESIGN, not a nicety. The host rate-limits
// gated reads at 150 per 10s per `blockInstanceId`, and this component is
// rendered once per grid card on a list that is already ~22 rows long. Three
// structural properties keep that safe, and each has a test asserting an EXACT
// count (never an "at least", which the per-tile bug would satisfy):
//
//   1. ONE BATCHED READ PER CARD. `useGatedImages().getImages` takes an ID ARRAY,
//      so the card's whole preview strip is a single call — the ids are collected
//      by `gridPreviewIds` and handed to ONE `GatedCell`. A `GatedCell` per tile
//      would be N calls for N tiles, which is the defect this exists to prevent.
//   2. AN UNRUN CELL COSTS NOTHING. A cell with no result row has no image id, so
//      it contributes none; a grid with no results at all yields an EMPTY id list
//      and this component then renders no `GatedCell` at all — zero calls, by
//      construction rather than by the hook happening to short-circuit.
//   3. NOTHING BELOW THE FOLD READS ANYTHING. The strip mounts only once an
//      `IntersectionObserver` says the card is near the viewport, so a long list
//      does not fire every card's read at once.
//
// 🔴 IT REUSES `GatedCell` RATHER THAN OPENING A SECOND READ PATH. `GatedCell`
// already carries the 45s timeout, the ONE bounded auto-retry, the manual Retry
// affordance and the `gated_read_error` telemetry added in 0.4.6. A second reader
// would fork all of that, and the fork would be the one nobody hardens again.
// The component is INJECTED (the same seam `ResultsGrid` uses) so a test can
// drive the real one against a counted `getImages`.

import { useEffect, useState } from 'react';

import { metaText, radius, token } from '../theme.js';
import type { GatedCellComponent } from './GatedCell.js';

export interface GridPreviewProps {
  /** The preview's image ids, ALREADY capped by `gridPreviewIds`. */
  imageIds: number[];
  /** How many published outputs the grid actually has, capped or not. */
  totalCount: number;
  /** Accessible label tail, naming the grid the strip belongs to. */
  label: string;
  GatedCell: GatedCellComponent;
}

/**
 * Has the host element come near the viewport yet? Returns `[near, setHost]`,
 * where `setHost` is a CALLBACK REF to put on the element to watch.
 *
 * Starts `true` when the environment has no `IntersectionObserver` — jsdom does
 * not implement one, and a preview that never mounted there would make every
 * read-budget assertion vacuously zero. A test that wants to pin the DEFERRAL
 * installs a stub observer that never fires, which is the only way to tell "not
 * yet visible" from "no observer".
 *
 * 🔴 THE ELEMENT IS HELD IN STATE, NOT IN A `useRef`, AND THAT IS THE FIX FOR A
 * SHIPPED DEFECT — the case it covers is "the host element mounts on a LATER
 * render than the first". A ref object never changes identity, so an effect keyed
 * on it runs once and can never see the element ARRIVE. Concretely: the host div
 * below is inside the id-bearing branch, so a grid with no previewable outputs
 * renders `grid-preview-empty` and there is no element to observe. When a shared
 * cell is later run and published the ids arrive on the SAME mounted card (the
 * card's React key is the grid key, so this component instance survives the
 * transition) — and with deps `[near, ref]`, neither of which had changed, the
 * effect never re-ran. No `IntersectionObserver` was ever constructed, `near`
 * stayed `false`, and the card kept the inert dashed placeholder below FOREVER:
 * no read, no spinner, no error, no Retry, and nothing a viewer could press.
 *
 * Holding the element in state makes the dependency the thing the effect actually
 * uses, so the arming re-runs whenever the host appears, disappears or is replaced
 * — by construction, rather than by remembering to list a proxy for it (an
 * `imageIds.length` dep would work today and reads as removable to the next
 * person, because the hook does not use it). Pinned by `gridPreview.test.tsx`'s
 * "ids arriving AFTER the first render" cases, which are RED without this.
 */
function useNearViewport(): [boolean, (el: HTMLElement | null) => void] {
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined');
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (near || !host) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          obs.disconnect();
        }
      },
      // A little ahead of the fold, so the strip is usually already there by the
      // time the card is scrolled to.
      { rootMargin: '200px' },
    );
    obs.observe(host);
    return () => obs.disconnect();
  }, [near, host]);
  return [near, setHost];
}

export function GridPreview({
  imageIds,
  totalCount,
  label,
  GatedCell,
}: GridPreviewProps): React.JSX.Element {
  const [near, setHost] = useNearViewport();

  // 🔴 NOTHING TO READ — and therefore NOTHING READ. Rendered instead of an empty
  // `GatedCell` so the zero-read case is structural: there is no id array here
  // that a future refactor could accidentally hand to the hook.
  if (imageIds.length === 0) {
    return (
      <span style={metaText} data-testid="grid-preview-empty">
        {totalCount === 0
          ? 'No outputs yet — run a cell to fill it in.'
          : 'No outputs this viewer can preview.'}
      </span>
    );
  }

  const hidden = totalCount - imageIds.length;

  return (
    <div
      ref={setHost}
      data-testid="grid-preview"
      data-preview-count={imageIds.length}
      style={{ display: 'grid', gap: 4, minWidth: 0 }}
    >
      {near ? (
        <GatedCell imageIds={imageIds} label={`${label} preview`} />
      ) : (
        // A reserved, inert placeholder: no spinner, because nothing is loading —
        // the read has deliberately not been issued yet.
        <div
          data-testid="grid-preview-deferred"
          aria-hidden="true"
          style={{
            minHeight: 72,
            borderRadius: radius.sm,
            border: `1px dashed ${token.border}`,
          }}
        />
      )}
      {/* 🔴 SAY SO WHEN THE STRIP IS A SUBSET — the same disclosure rule as
          `cell-publish-more`. A preview silently showing 6 of 40 outputs would
          understate the grid, and the count is the only thing that tells a viewer
          the strip is a sample rather than the whole of it. */}
      {hidden > 0 && (
        <span style={metaText} data-testid="grid-preview-more">
          {`+${hidden} more output${hidden === 1 ? '' : 's'} in this grid.`}
        </span>
      )}
    </div>
  );
}
