// A recoverable React error boundary for the whole block. The app mounts bare;
// an unhandled render/runtime error anywhere in the tree would otherwise blank
// the iframe with a React "something went wrong" or a frozen partial paint. This
// catches it, renders a themed, RECOVERABLE fallback (a "Try again" button that
// clears the error and re-mounts the subtree), and fires `onError` once per catch
// so the host analytics pipeline sees a `block_error` event.
//
// It is mounted NESTED INSIDE <BlockGate> (see main.tsx) — BlockGate owns the
// direct-load landing; this owns in-app render failures. Styled entirely off
// `--civitai-*` tokens so the fallback flips with [data-theme].

import { Component, type ErrorInfo, type ReactNode } from 'react';

import { Alert, Button, Stack } from '@civitai/blocks-react/ui';
import { token, radius } from '../theme.js';

export interface RootBoundaryProps {
  children: ReactNode;
  /** Fire-and-forget hook for analytics/telemetry — called once per caught error. */
  onError?: (error: Error, info: ErrorInfo) => void;
  /** Optional custom fallback; receives the error + a reset callback. */
  fallback?: (args: { error: Error; reset: () => void }) => ReactNode;
}

interface RootBoundaryState {
  error: Error | null;
}

export class RootBoundary extends Component<RootBoundaryProps, RootBoundaryState> {
  override state: RootBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): RootBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Fire-and-forget; never let a telemetry failure mask the original error.
    try {
      this.props.onError?.(error, info);
    } catch {
      /* swallow */
    }
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) {
      return this.props.fallback({ error, reset: this.reset });
    }

    return (
      <div
        data-testid="root-boundary-fallback"
        role="alert"
        style={{
          fontFamily: token.font,
          background: token.body,
          color: token.text,
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          padding: 'clamp(16px, 4vw, 32px)',
          boxSizing: 'border-box',
        }}
      >
        <Stack
          gap={12}
          align="center"
          style={{
            maxWidth: 440,
            textAlign: 'center',
            padding: '28px 24px',
            borderRadius: radius.md,
            border: `1px solid ${token.border}`,
            background: token.surface,
          }}
        >
          <strong style={{ fontSize: 16 }}>Something went wrong</strong>
          <Alert color="error" data-testid="root-boundary-message">
            {error.message || 'The app hit an unexpected error.'}
          </Alert>
          <span style={{ color: token.dimmed, fontSize: 13, lineHeight: 1.5 }}>
            Your combinations, prompts and votes are safe — they live in shared storage. Try
            reloading this view.
          </span>
          <Button data-testid="root-boundary-retry" onClick={this.reset}>
            Try again
          </Button>
        </Stack>
      </div>
    );
  }
}
