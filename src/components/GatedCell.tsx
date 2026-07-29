// Default gated-image grid cell. Reads per-viewer gated display data for a set
// of published image ids via the SDK's `useGatedImages()` hook and renders ONLY
// what the host says this viewer may see — a `visible` image shows its
// host-provided url; a `hidden` image (NO url ever) shows a withheld-hint tile.
// The app NEVER holds or renders a raw url itself; the gated read is the
// per-viewer moderation boundary (correct-by-construction: an over-ceiling viewer
// receives status:'hidden' with no url).
//
// Robustness (production hardening): the host round-trip can stall, so the read
// is raced against a TIMEOUT and any failure (timeout or host error) surfaces a
// clear message + a RETRY affordance instead of a spinner that never resolves.
// Visible cells render through the design-system <Image> (token placeholder while
// loading + broken-image fallback); withheld cells render a <Tooltip>-annotated
// hint that points the viewer at their browsing settings.

import type { ComponentType } from 'react';
import { useEffect, useState } from 'react';

import { useGatedImages } from '@civitai/blocks-react';
import type { BlockGatedImage } from '@civitai/app-sdk/blocks';
import { Button, Loader } from '@civitai/blocks-react/ui';
import { Image, Tooltip } from '@civitai/components-react';

import { elevate, token } from '../theme.js';

/** The injectable render seam for a gated grid cell (App wires the default;
 * pure ResultsGrid tests inject a component stub). */
export type GatedCellComponent = ComponentType<{ imageIds: number[]; label?: string }>;

/** Max wait for the per-viewer gated host round-trip before we surface a
 * retryable timeout (rather than a spinner that never resolves). */
export const GATED_READ_TIMEOUT_MS = 15_000;

interface GatedState {
  loading: boolean;
  error: string | null;
  images: BlockGatedImage[];
}

const WITHHELD_HINT =
  'This output is above your current browsing level. Adjust your browsing settings on Civitai to view it.';

export function GatedCell({ imageIds, label }: { imageIds: number[]; label?: string }): React.JSX.Element {
  const { getImages } = useGatedImages();
  const [state, setState] = useState<GatedState>({ loading: imageIds.length > 0, error: null, images: [] });
  // Retry nonce — bumping it re-runs the fetch effect for the same id set.
  const [attempt, setAttempt] = useState(0);

  // Fetch whenever the id SET changes or a retry is requested. `getImages` is
  // stable across renders (SDK hook contract), so keying on the id set is enough.
  const idKey = imageIds.join(',');
  useEffect(() => {
    if (imageIds.length === 0) {
      setState({ loading: false, error: null, images: [] });
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setState((s) => ({ ...s, loading: true, error: null }));

    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error('Timed out loading images. Retry?')),
        GATED_READ_TIMEOUT_MS,
      );
    });

    Promise.race([getImages(imageIds), timeout])
      .then((images) => {
        if (!cancelled) setState({ loading: false, error: null, images: images as BlockGatedImage[] });
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setState({
            loading: false,
            error: e instanceof Error ? e.message : 'Could not load images.',
            images: [],
          });
        }
      })
      .finally(() => {
        if (timer) clearTimeout(timer);
      });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idKey, attempt]);

  if (state.loading) {
    return (
      <div data-testid="gated-loading" style={{ display: 'grid', placeItems: 'center', minHeight: 96 }}>
        <Loader size="sm" />
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
            onClick={() => setAttempt((n) => n + 1)}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="gated-cell"
      style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: 4 }}
    >
      {state.images.map((img) =>
        img.status === 'visible' ? (
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
              aria-label={`Hidden output. ${WITHHELD_HINT}`}
              style={{
                aspectRatio: '1 / 1',
                display: 'grid',
                placeItems: 'center',
                borderRadius: 6,
                // NOT surface-2: in light theme surface-2 resolves to the same value
                // as body -> an invisible white-on-white tile. `elevate()` mixes a
                // little text into surface, so the recess reads in BOTH themes; the
                // border makes the gated slot unambiguous regardless of fill contrast.
                background: elevate(5),
                border: `1px solid ${token.border}`,
                color: token.dimmed,
                fontSize: 10,
                lineHeight: 1.3,
                textAlign: 'center',
                padding: 4,
                cursor: 'help',
              }}
            >
              Hidden — adjust browsing settings
            </span>
          </Tooltip>
        ),
      )}
    </div>
  );
}
