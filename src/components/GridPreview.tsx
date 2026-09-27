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

import { useEffect, useRef, useState } from 'react';

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
 * Has this element come near the viewport yet?
 *
 * Starts `true` when the environment has no `IntersectionObserver` — jsdom does
 * not implement one, and a preview that never mounted there would make every
 * read-budget assertion vacuously zero. A test that wants to pin the DEFERRAL
 * installs a stub observer that never fires, which is the only way to tell "not
 * yet visible" from "no observer".
 */
function useNearViewport(ref: React.RefObject<HTMLElement | null>): boolean {
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    if (near) return;
    const el = ref.current;
    if (!el) return;
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
    obs.observe(el);
    return () => obs.disconnect();
  }, [near, ref]);
  return near;
}

export function GridPreview({
  imageIds,
  totalCount,
  label,
  GatedCell,
}: GridPreviewProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const near = useNearViewport(hostRef);

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
      ref={hostRef}
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
