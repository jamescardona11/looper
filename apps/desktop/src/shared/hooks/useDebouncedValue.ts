import { useCallback, useRef, useSyncExternalStore } from "react";

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const visibleValue = useRef(value);

  const subscribe = useCallback(
    (notify: () => void) => {
      const timer = window.setTimeout(() => {
        if (Object.is(visibleValue.current, value)) return;
        visibleValue.current = value;
        notify();
      }, delayMs);

      return () => window.clearTimeout(timer);
    },
    [delayMs, value],
  );

  const getSnapshot = useCallback(() => visibleValue.current, []);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
