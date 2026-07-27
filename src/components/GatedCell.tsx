// Default gated-image grid cell. Reads per-viewer gated display data for a set
// of published image ids via the SDK's `useGatedImages()` hook (0.30) and renders
// ONLY what the host says this viewer may see — a `visible` image shows its
// host-provided url; a `hidden` image (NO url ever) shows a blurred placeholder.
// The app NEVER holds or renders a raw url itself; the gated read is the
// per-viewer moderation boundary.
//
// The hook returns a stable `{ getImages }`; we call `getImages(ids)` once per
// id-set in an effect and manage loading/error/result state here.

import type { ComponentType } from 'react';
import { useEffect, useState } from 'react';

import { useGatedImages } from '@civitai/blocks-react';
import type { BlockGatedImage } from '@civitai/app-sdk/blocks';
import { Loader } from '@civitai/blocks-react/ui';

import { elevate, token } from '../theme.js';

/** The injectable render seam for a gated grid cell (App wires the default;
 * pure ResultsGrid tests inject a component stub). */
export type GatedCellComponent = ComponentType<{ imageIds: number[]; label?: string }>;

interface GatedState {
  loading: boolean;
  error: string | null;
  images: BlockGatedImage[];
}

export function GatedCell({ imageIds, label }: { imageIds: number[]; label?: string }): React.JSX.Element {
  const { getImages } = useGatedImages();
  const [state, setState] = useState<GatedState>({ loading: imageIds.length > 0, error: null, images: [] });

  // Fetch whenever the id SET changes. `getImages` is stable across renders
  // (SDK hook contract), so keying the effect on the id set is sufficient.
  const idKey = imageIds.join(',');
  useEffect(() => {
    if (imageIds.length === 0) {
      setState({ loading: false, error: null, images: [] });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    getImages(imageIds)
      .then((images) => {
        if (!cancelled) setState({ loading: false, error: null, images });
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setState({ loading: false, error: e instanceof Error ? e.message : 'Could not load images.', images: [] });
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idKey]);

  if (state.loading) {
    return (
      <div data-testid="gated-loading" style={{ display: 'grid', placeItems: 'center', minHeight: 96 }}>
        <Loader size="sm" />
      </div>
    );
  }

  if (state.error) {
    return (
      <div data-testid="gated-error" style={{ fontSize: 11, color: 'var(--civitai-color-error)', padding: 4 }}>
        {state.error}
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
          <img
            key={img.imageId}
            data-testid="result-image"
            src={img.url}
            alt={label ?? `output ${img.imageId}`}
            loading="lazy"
            width={img.width ?? undefined}
            height={img.height ?? undefined}
            style={{ width: '100%', height: 'auto', borderRadius: 6, display: 'block', maxWidth: '100%' }}
          />
        ) : (
          <div
            key={img.imageId}
            data-testid="result-hidden"
            title="Hidden for this viewer"
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
              fontSize: 11,
              textAlign: 'center',
              padding: 4,
            }}
          >
            hidden
          </div>
        ),
      )}
    </div>
  );
}
