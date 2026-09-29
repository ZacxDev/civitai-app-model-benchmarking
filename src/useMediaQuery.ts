import { useEffect, useState } from 'react';

import { MOBILE_BREAKPOINT_PX } from './compact.js';

/**
 * 🔴 THE BREAKPOINT IS IMPORTED, NOT SPELLED. It used to be the literal `720` here
 * and nowhere else; `compact.ts` now also reasons about it (the sidebar collapses to
 * a top bar at the same width), and a number stated in two files is a number that
 * drifts. One authority, the way `.nvmrc` is the one authority for the node major.
 */
const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT_PX}px)`;

/** True on a narrow (mobile) viewport. Mobile-first: defaults to true when
 * matchMedia is unavailable (SSR/older jsdom) so the compact layout wins. */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return true;
    return window.matchMedia(MOBILE_QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(MOBILE_QUERY);
    const onChange = () => setIsMobile(mql.matches);
    onChange();
    mql.addEventListener?.('change', onChange);
    return () => mql.removeEventListener?.('change', onChange);
  }, []);

  return isMobile;
}
