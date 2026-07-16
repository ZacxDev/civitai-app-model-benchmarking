// Minimal palette. The `@civitai/blocks-react/ui` component pack is self-themed
// off the block root's `data-theme`; this palette only styles the app chrome the
// pack doesn't cover (page background, muted text, the results-matrix grid
// scaffolding, sticky headers, cell states). Values track the pack's own
// `--ci-*` tokens so the hand-rolled matrix reads as one system with the pack.

import type { CSSProperties } from 'react';

export interface Palette {
  bg: string;
  fg: string;
  muted: string;
  border: string;
  card: string;
  chipBg: string;
  headerBg: string;
  cellEmpty: string;
}

export function palette(dark: boolean): Palette {
  return dark
    ? {
        bg: '#0b0c0f',
        fg: '#e6e6e6',
        muted: '#909296',
        border: '#2c2e33',
        card: '#1a1b1e',
        chipBg: '#25262b',
        headerBg: '#141517',
        cellEmpty: '#131417',
      }
    : {
        bg: '#f6f7f9',
        fg: '#1a1a1a',
        muted: '#6b7280',
        border: '#e0e0e3',
        card: '#ffffff',
        chipBg: '#f4f4f5',
        headerBg: '#eceef1',
        cellEmpty: '#fafafb',
      };
}

export function pageStyle(c: Palette): CSSProperties {
  return {
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    background: c.bg,
    color: c.fg,
    width: '100%',
    minHeight: '100dvh',
    display: 'flex',
    boxSizing: 'border-box',
  };
}

export const contentStyle: CSSProperties = {
  margin: '0 auto',
  width: '100%',
  maxWidth: 1100,
  padding: 18,
  display: 'grid',
  gap: 16,
  alignContent: 'start',
  boxSizing: 'border-box',
};
