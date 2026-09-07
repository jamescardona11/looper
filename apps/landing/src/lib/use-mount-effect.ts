import { type EffectCallback, useEffect } from "react";

/** Runs setup for a browser integration once and releases it on unmount. */
export function useMountEffect(effect: EffectCallback): void {
  // biome-ignore lint/correctness/useExhaustiveDependencies: this escape hatch intentionally owns mount-only browser setup
  useEffect(effect, []);
}
