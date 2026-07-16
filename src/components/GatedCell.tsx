// Default gated-image grid cell. Reads per-viewer gated display data for a set
// of published image ids via the 0.30 bridge (useGatedImagesState) and renders
// ONLY what the host says this viewer may see — a visible image shows its
// host-provided url; a hidden image shows a placeholder. The app NEVER holds or
// renders a raw url itself; the gated read is the per-viewer moderation boundary.
//
// The App injects this as `deps.GatedCell` (a GatedCellComponent); tests inject a
// fake so the visible/hidden paths are driven deterministically without the real
// hook.

import { Loader } from '@civitai/blocks-react/ui';

import { useGatedImagesState } from '../lib/generation-bridge.js';

export function GatedCell({ imageIds, label }: { imageIds: number[]; label?: string }): React.JSX.Element {
  const { images, loading } = useGatedImagesState(imageIds);

  if (loading) {
    return (
      <div data-testid="gated-loading" style={{ display: 'grid', placeItems: 'center', minHeight: 96 }}>
        <Loader size="sm" />
      </div>
    );
  }

  return (
    <div
      data-testid="gated-cell"
      style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: 4 }}
    >
      {images.map((img) =>
        img.status === 'visible' ? (
          <img
            key={img.imageId}
            data-testid="result-image"
            src={img.url}
            alt={label ?? `output ${img.imageId}`}
            loading="lazy"
            style={{ width: '100%', height: 'auto', borderRadius: 6, display: 'block', maxWidth: '100%' }}
          />
        ) : (
          <div
            key={img.imageId}
            data-testid="result-hidden"
            title={img.reason ?? 'Hidden for this viewer'}
            style={{
              aspectRatio: '1 / 1',
              display: 'grid',
              placeItems: 'center',
              borderRadius: 6,
              background: 'var(--ci-color-surface-2, #f0f0f2)',
              color: 'var(--ci-color-text-dimmed, #888)',
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
