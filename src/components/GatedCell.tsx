// Default gated-image grid cell. Reads per-viewer gated display data for a set
// of published image ids via the SDK's `useGatedImages()` hook and renders ONLY
// what the host says this viewer may see. THREE states, not two: a `visible`
// image shows its host-provided url; a `hidden` image (NO url ever) shows a
// withheld-hint tile; and a `visible` image carrying `ratingPending` is the
// VIEWER'S OWN output that nothing has rated yet — it shows the url with an
// "awaiting rating" affordance, asserting neither a rating nor a gate.
// The app NEVER holds or renders a raw url itself; the gated read is the
// per-viewer moderation boundary (correct-by-construction: an over-ceiling viewer
// receives status:'hidden' with no url).
//
// Robustness (production hardening): the host round-trip can stall or fail
// transiently, so the read is raced against a LONG timeout (45s — the read
// follows a multi-minute generate+publish, and the old 15s was never tuned and
// surfaced "Timed out loading images" to a viewer whose manual Retry then
// worked) with ONE bounded automatic retry after a short backoff before the
// error state surfaces, and every SURFACED error is tracked (`gated_read_error`)
// so the mechanism (timeout vs transport vs host error) is diagnosable from
// telemetry. The read is a no-spend path, so the auto-retry carries no
// money-path risk. Visible cells render through the design-system <Image>
// (token placeholder while loading + broken-image fallback); withheld cells
// render a <Tooltip>-annotated hint that points the viewer at their browsing
// settings.

import type { ComponentType } from 'react';
import { useEffect, useRef, useState } from 'react';

import { useBlockAnalytics, useGatedImages } from '@civitai/blocks-react';
import type { BlockGatedImage } from '@civitai/app-sdk/blocks';
import { Button, Loader } from '@civitai/blocks-react/ui';
import { Image, Tooltip } from '@civitai/components-react';

import { recessedSurface, token } from '../theme.js';

/** The injectable render seam for a gated grid cell (App wires the default;
 * pure ResultsGrid tests inject a component stub). */
export type GatedCellComponent = ComponentType<{ imageIds: number[]; label?: string }>;

/** Max wait for the per-viewer gated host round-trip before the read is
 * treated as failed. Deliberately LONG (45s): this read runs right after a
 * generate+publish measured in minutes, against a host read that fetches the
 * viewer's hidden-prefs and classifies the just-materialised rows — the old
 * 15s (set at v0.2.0, never tuned) surfaced a retryable timeout to viewers
 * whose manual Retry then worked, which is the observed defect. */
export const GATED_READ_TIMEOUT_MS = 45_000;
/** Backoff before the ONE automatic re-read each read sequence gets on
 * failure. Exactly one: a second consecutive failure surfaces the error state
 * (pinned by GatedCell.test.tsx), so a genuinely dead read never hides behind
 * an endless spinner, and a transient one self-heals without the viewer
 * noticing. */
export const GATED_AUTO_RETRY_DELAY_MS = 2_000;
/** The per-sequence auto-retry budget. */
const AUTO_RETRIES = 1;

/**
 * The narrowest an output tile may be laid out, in px.
 *
 * Long-shipped as the `minmax()` floor; kept as a named constant because the CAP
 * below is the new half and the two only make sense as a pair.
 */
export const TILE_MIN_PX = 72;

/**
 * The WIDEST an output tile may be laid out, in px — and the fix for the defect
 * described on {@link tileGridStyle}.
 *
 * 🔴 IT IS A SIZING JUDGEMENT, NOT A TYPO FIX, so here is the reasoning rather than
 * just the number. Three constraints, and they do not all pull the same way:
 *
 *   1. A cell in the results matrix holds ONE image in every shipped shape, in a
 *      track whose width is set by the matrix, not by this component. Measured live:
 *      a 3014px viewport gives a 403px cell; a 1440px viewport gives 184px.
 *   2. The tile is `object-fit: cover` on a reserved `aspect-ratio`, so WIDTH SETS
 *      HEIGHT. An uncapped tile in a 403px cell is a ~403px-tall ROW — and the row
 *      height is shared by every cell in it, so one wide column makes the whole
 *      matrix scroll vertically for no extra information.
 *   3. The matrix's whole job is side-by-side comparison, which means several cells
 *      visible at once. A tile large enough to fill a 403px cell is a tile large
 *      enough to push its neighbours out of frame.
 *
 * 200 is chosen against (2) and (3): at the measured 403px cell it is about half the
 * track — a legible thumbnail, a row under ~210px — and at the measured 184px cell it
 * is not binding at all, so narrow and mid viewports are unchanged by it. It is NOT
 * chosen to make the cell look full; see {@link tileGridStyle} for why the leftover
 * width is a matrix-level question that this constant deliberately does not answer.
 *
 * ⚠️ UNVERIFIABLE HERE. jsdom performs no layout, so nothing in this repo can observe
 * a rendered tile at any width. `GatedCell.test.tsx` pins the DECLARED track list; a
 * live reading at ≥1440px is owed.
 */
export const TILE_MAX_PX = 200;

/**
 * The tile grid inside one gated cell.
 *
 * 🔴 THE DEFECT THIS REPLACES, AND WHY "MAKE THE CELLS BIGGER" NEVER LANDED. It read
 * `repeat(auto-fill, minmax(72px, 1fr))` while every cell holds exactly ONE image, and
 * those two facts together turn every px of extra cell width into EMPTY TRACKS:
 * `auto-fill` creates as many tracks as fit whether or not there is content for them,
 * and `1fr` then divides the cell between all of them. Measured live — a 3014px
 * viewport gave a 403px cell laid out as 5 tracks x 77px, i.e. the one image occupied
 * **19%** of the cell; 1440px gave 184px as 2 x 90px, **49%**. Every attempt to widen
 * the matrix was absorbed downstream by a track nothing rendered into.
 *
 * 🔴 `auto-fit` ALONE IS NOT THE FIX, and reaching for it is the trap. `auto-fit`
 * collapses the empty tracks, which is necessary — but with a `1fr` maximum the one
 * surviving track then takes the WHOLE 403px, and constraint (2) on
 * {@link TILE_MAX_PX} says that is a 403px-tall row. The max has to be a LENGTH.
 *
 * 🔴 AND `justify-content: center` IS PART OF THE DECISION, NOT DECORATION. Once the
 * track is capped, a wide cell has leftover width by construction. Centring says the
 * tile is the cell's content; `start` would read as a tile shoved against the row
 * header with a hole beside it. Closing that hole properly is a MATRIX-level question
 * — whether the matrix caps its own column width or lets the columns absorb the
 * slack — and it needs a live width reading to answer, so it is deliberately NOT
 * answered here. Do not read the cap as a claim that the cell is now full.
 *
 * ⚠️ `gap` IS WRITTEN HERE AND MUST STAY HERE. This object is applied as an INLINE
 * `style`, which outranks every non-`!important` author rule — a `gap` declaration
 * added to `compact.ts`'s sheet for this element would be INERT, and a test reading
 * that sheet's text could not see it. `compact.ts`'s own header records two rounds
 * lost to exactly that.
 */
export const tileGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: `repeat(auto-fit, minmax(${TILE_MIN_PX}px, ${TILE_MAX_PX}px))`,
  justifyContent: 'center',
  gap: 4,
};

interface GatedState {
  loading: boolean;
  /** True while an automatic retry is pending (the spinner says so). */
  retrying: boolean;
  error: string | null;
  images: BlockGatedImage[];
}

/** The withheld tile's headline — names WHY the slot is empty (a deliberate
 * maturity gate), so it never reads as a broken/failed cell. */
const WITHHELD_TITLE = 'Hidden — rated mature';
/** The actionable settings hint (also the tooltip + the accessible-name tail). */
const WITHHELD_HINT =
  'This output is rated above your current browsing level. Adjust your content settings on Civitai to view it.';

/** Headline for the viewer's OWN not-yet-rated output. 🔴 It must assert NEITHER
 * a rating nor a gate: an absent `nsfwLevel` is "nothing has decided", not "rated
 * G" and not "rated mature". Naming the third state is the whole point of the
 * `ratingPending` wire field (@civitai/blocks-react >= 0.51.0). */
const PENDING_TITLE = 'Awaiting rating';
/** The accessible-name tail — says why the slot looks different and that nothing
 * is wrong, so it never reads as a failed or withheld cell. */
const PENDING_HINT =
  'Only you can see this output until its rating finishes processing. Nothing has rated it yet.';

export function GatedCell({ imageIds, label }: { imageIds: number[]; label?: string }): React.JSX.Element {
  const { getImages } = useGatedImages();
  const { track } = useBlockAnalytics();
  const [state, setState] = useState<GatedState>({
    loading: imageIds.length > 0,
    retrying: false,
    error: null,
    images: [],
  });
  // Retry nonce — bumping it re-runs the fetch effect for the same id set.
  const [attempt, setAttempt] = useState(0);
  // The auto-retry budget, as a ref because the fetch effect closes over it and
  // the budget must NOT reset when the auto-retry itself bumps `attempt` — only
  // an explicit reset (new id set, manual Retry) restores it. Getting this wrong
  // in either direction is bad: resetting on every effect run = an unbounded
  // retry loop; never restoring = later reads inherit an earlier sequence's
  // failure.
  const autoRetriesLeftRef = useRef(AUTO_RETRIES);

  // Fetch whenever the id SET changes or a retry is requested. `getImages` is
  // stable across renders (SDK hook contract), so keying on the id set is enough.
  const idKey = imageIds.join(',');
  // A new id set is a new read sequence: fresh auto-retry budget. Runs BEFORE
  // the fetch effect (declaration order) so the new read sees the reset value.
  useEffect(() => {
    autoRetriesLeftRef.current = AUTO_RETRIES;
  }, [idKey]);

  useEffect(() => {
    if (imageIds.length === 0) {
      setState({ loading: false, retrying: false, error: null, images: [] });
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let backoffTimer: ReturnType<typeof setTimeout> | undefined;
    setState((s) => ({ ...s, loading: true, retrying: false, error: null }));

    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error('Timed out loading images. Retry?')),
        GATED_READ_TIMEOUT_MS,
      );
    });

    Promise.race([getImages(imageIds), timeout])
      .then((images) => {
        if (!cancelled) setState({ loading: false, retrying: false, error: null, images: images as BlockGatedImage[] });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : 'Could not load images.';
        if (autoRetriesLeftRef.current > 0) {
          // ONE automatic re-read per sequence. Stay in loading and SAY the
          // retry is running; only a SECOND consecutive failure surfaces the
          // error state.
          autoRetriesLeftRef.current -= 1;
          setState((s) => ({ ...s, loading: true, retrying: true, error: null }));
          backoffTimer = setTimeout(() => {
            if (!cancelled) setAttempt((n) => n + 1);
          }, GATED_AUTO_RETRY_DELAY_MS);
          return;
        }
        // Surfacing (not the transient attempt that self-healed) is what lands
        // in telemetry — the event that needs diagnosing is the one the viewer
        // actually saw.
        track('gated_read_error', { message });
        setState({ loading: false, retrying: false, error: message, images: [] });
      })
      .finally(() => {
        if (timer) clearTimeout(timer);
      });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (backoffTimer) clearTimeout(backoffTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idKey, attempt]);

  if (state.loading) {
    return (
      <div data-testid="gated-loading" style={{ display: 'grid', placeItems: 'center', minHeight: 96 }}>
        <Loader size="sm" />
        {state.retrying && (
          <span data-testid="gated-retrying" style={{ fontSize: 10, color: token.dimmed }}>
            The read stalled — retrying…
          </span>
        )}
      </div>
    );
  }

  if (state.error) {
    return (
      <div
        data-testid="gated-error"
        style={{ display: 'grid', gap: 6, fontSize: 11, color: token.error, padding: 4 }}
      >
        <span>{state.error}</span>
        <div>
          <Button
            size="sm"
            variant="subtle"
            data-testid="gated-retry"
            // A manual retry is an explicit new read sequence: fresh auto-retry
            // budget with it.
            onClick={() => {
              autoRetriesLeftRef.current = AUTO_RETRIES;
              setAttempt((n) => n + 1);
            }}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="gated-cell" style={tileGridStyle}>
      {state.images.map((img) =>
        img.status === 'visible' && img.ratingPending ? (
          // The viewer's OWN image, which nothing has rated yet. The host gives us
          // the url and DELIBERATELY no rating claim, so we must assert neither:
          // rendering it as an ordinary result would imply a rating exists, and
          // rendering the withheld tile would claim it is over the ceiling — the
          // bug this branch exists to stop (an author's unscanned output read as
          // "Hidden — rated mature"). Show the image, say the rating is pending.
          // NOT `data-testid="result-image"`: a pending entry is not a rated one,
          // and a test that counts result-image must not silently include it.
          <span
            key={img.imageId}
            data-testid="result-pending"
            role="img"
            aria-label={`${PENDING_TITLE}. ${PENDING_HINT}`}
            style={{ display: 'grid', gap: 2, width: '100%' }}
          >
            <Image
              data-testid="result-pending-image"
              src={img.url}
              alt={label ?? `output ${img.imageId}`}
              loading="lazy"
              fit="cover"
              fallback={<span style={{ fontSize: 10, color: token.dimmed }}>unavailable</span>}
              wrapperStyle={{
                width: '100%',
                borderRadius: 6,
                overflow: 'hidden',
                border: `1px dashed ${token.border}`,
                aspectRatio: img.width && img.height ? `${img.width} / ${img.height}` : '1 / 1',
              }}
            />
            <span
              data-testid="result-pending-hint"
              style={{ fontSize: 10, lineHeight: 1.3, textAlign: 'center', color: token.dimmed }}
            >
              {PENDING_TITLE}
            </span>
          </span>
        ) : img.status === 'visible' ? (
          <Image
            key={img.imageId}
            data-testid="result-image"
            src={img.url}
            alt={label ?? `output ${img.imageId}`}
            loading="lazy"
            fit="cover"
            fallback={<span style={{ fontSize: 10, color: token.dimmed }}>unavailable</span>}
            wrapperStyle={{
              width: '100%',
              borderRadius: 6,
              overflow: 'hidden',
              // Reserve the cell from the host-provided intrinsic size so the grid
              // doesn't reflow when the image finishes loading.
              aspectRatio: img.width && img.height ? `${img.width} / ${img.height}` : '1 / 1',
            }}
          />
        ) : (
          // Withheld from THIS viewer (over browsing ceiling / not-yet-scanned /
          // flagged). NO url is ever provided; render an actionable hint, not a
          // bare tile. The <Tooltip> trigger is keyboard-focusable.
          <Tooltip key={img.imageId} label={WITHHELD_HINT}>
            <span
              data-testid="result-hidden"
              tabIndex={0}
              role="img"
              aria-label={`${WITHHELD_TITLE}. ${WITHHELD_HINT}`}
              style={{
                aspectRatio: '1 / 1',
                display: 'grid',
                placeItems: 'center',
                gap: 3,
                borderRadius: 6,
                // 🔴 THE RECESS COMES FROM ONE PLACE NOW. This used to be a local
                // `elevate(5)` under a comment explaining why surface-2 is wrong
                // here — and a third site went and used surface-2 anyway. The
                // reasoning lives on `recessedSurface` in `theme.ts`; the border
                // stays, because it is what makes the gated slot unambiguous
                // regardless of how far the fill actually reads.
                background: recessedSurface,
                border: `1px solid ${token.border}`,
                color: token.dimmed,
                fontSize: 10,
                lineHeight: 1.3,
                textAlign: 'center',
                padding: 4,
                cursor: 'help',
              }}
            >
              <span style={{ fontWeight: 600, color: token.text }}>{WITHHELD_TITLE}</span>
              <span data-testid="result-hidden-hint">Adjust content settings to view</span>
            </span>
          </Tooltip>
        ),
      )}
    </div>
  );
}
