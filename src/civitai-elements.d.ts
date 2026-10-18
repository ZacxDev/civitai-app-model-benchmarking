// JSX typings for the @civitai/components custom elements this app renders
// DIRECTLY (the upstream web components): the slide-out sidebar's nav
// list/item. Registered by src/define-upstream.ts. React 19 sets matching
// element properties for props that exist on the element class
// (label / href / current / expanded).
import type React from 'react';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'civitai-nav-list': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        label?: string;
        current?: string;
      };
      'civitai-nav-item': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        label?: string;
        href?: string;
        current?: boolean;
        expanded?: boolean;
        disabled?: boolean;
      };
    }
  }
}

export {};
