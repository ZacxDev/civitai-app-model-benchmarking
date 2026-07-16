// VENDORED view-switcher.
//
// 🔴 This mirrors the `SegmentedControl` primitive proposed for the
// `@civitai/blocks-react/ui` pack (see the companion PR to civitai-app-starters).
// It's vendored here because that primitive is not yet PUBLISHED — once the pack
// PR ships in a released @civitai/blocks-react, DELETE this file and switch the
// imports to `import { SegmentedControl } from '@civitai/blocks-react/ui'` (the
// API is identical by design). It's built ONLY on the pack's public `--ci-*` CSS
// vars (injected by any other `/ui` component on the page via useBlocksStyles),
// so it stays auto-themed in light + dark with the rest of the pack.

import { forwardRef, useRef } from 'react';

export interface SegmentedControlItem {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
}

export interface SegmentedControlProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  data: SegmentedControlItem[];
  value: string;
  onChange: (value: string) => void;
  fullWidth?: boolean;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
}

const HEIGHTS: Record<NonNullable<SegmentedControlProps['size']>, string> = {
  sm: '30px',
  md: '36px',
  lg: '44px',
};

export const SegmentedControl = forwardRef<HTMLDivElement, SegmentedControlProps>(
  function SegmentedControl(
    { data, value, onChange, fullWidth = false, size = 'md', disabled = false, style, ...rest },
    ref,
  ): React.JSX.Element {
    const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);

    const enabledIndexes = data
      .map((d, i) => (d.disabled ? -1 : i))
      .filter((i) => i >= 0);

    const move = (dir: 1 | -1, fromIndex: number) => {
      if (disabled || enabledIndexes.length === 0) return;
      const pos = enabledIndexes.indexOf(fromIndex);
      const nextPos =
        pos < 0
          ? 0
          : (pos + dir + enabledIndexes.length) % enabledIndexes.length;
      const nextIndex = enabledIndexes[nextPos];
      onChange(data[nextIndex].value);
      btnRefs.current[nextIndex]?.focus();
    };

    return (
      <div
        ref={ref}
        {...rest}
        data-civitai-ui="segmented-control"
        role="tablist"
        style={{
          display: fullWidth ? 'flex' : 'inline-flex',
          width: fullWidth ? '100%' : undefined,
          gap: 3,
          padding: 3,
          borderRadius: 'var(--ci-radius, 8px)',
          background: 'var(--ci-color-surface-2, #f4f4f5)',
          border: '1px solid var(--ci-color-border, #e0e0e3)',
          boxSizing: 'border-box',
          ...style,
        }}
      >
        {data.map((item, i) => {
          const selected = item.value === value;
          const isDisabled = disabled || item.disabled;
          return (
            <button
              key={item.value}
              ref={(el) => {
                btnRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              data-active={selected ? 'true' : undefined}
              disabled={isDisabled}
              onClick={() => {
                if (isDisabled) return;
                onChange(item.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                  e.preventDefault();
                  move(1, i);
                } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                  e.preventDefault();
                  move(-1, i);
                }
              }}
              style={{
                flex: fullWidth ? 1 : undefined,
                height: HEIGHTS[size],
                padding: '0 14px',
                border: 'none',
                borderRadius: 'calc(var(--ci-radius, 8px) - 3px)',
                cursor: isDisabled ? 'not-allowed' : 'pointer',
                opacity: isDisabled ? 0.5 : 1,
                fontFamily: 'var(--ci-font, inherit)',
                fontWeight: 600,
                fontSize: size === 'sm' ? 13 : size === 'lg' ? 16 : 14,
                lineHeight: 1,
                whiteSpace: 'nowrap',
                background: selected ? 'var(--ci-color-surface, #fff)' : 'transparent',
                color: selected
                  ? 'var(--ci-color-primary, #228be6)'
                  : 'var(--ci-color-text-dimmed, #6b7280)',
                boxShadow: selected ? '0 1px 2px rgba(0,0,0,0.12)' : undefined,
                transition: 'background-color 120ms ease, color 120ms ease',
              }}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    );
  },
);
