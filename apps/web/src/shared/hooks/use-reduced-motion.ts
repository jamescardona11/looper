import { useSyncExternalStore } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY);
  mediaQuery.addEventListener("change", onChange);
  return () => mediaQuery.removeEventListener("change", onChange);
}

function getSnapshot() {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function getServerSnapshot() {
  return false;
}

/**
 * Tracks the user's `prefers-reduced-motion` setting reactively.
 *
 * Chart entrance animations (bars growing, area drawing, donut sweeping) are
 * gated on `!reduced` so motion-sensitive users get the final frame instantly.
 * Uses a real subscription (matchMedia listener) so a mid-session OS change is
 * honoured — this is the allowed `useEffect` shape per web-rules (a listener,
 * not data fetching).
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
