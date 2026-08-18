import { useMemo, useSyncExternalStore, type RefCallback } from "react";

export type FAQScrollEdges = Readonly<{ top: boolean; bottom: boolean }>;

const NO_EDGES: FAQScrollEdges = Object.freeze({ top: false, bottom: false });

export const measureFAQScrollEdges = (
  element: Pick<HTMLElement, "scrollTop" | "clientHeight" | "scrollHeight">,
): FAQScrollEdges => ({
  top: element.scrollTop > 1,
  bottom: element.scrollTop + element.clientHeight < element.scrollHeight - 1,
});

const sameEdges = (left: FAQScrollEdges, right: FAQScrollEdges) =>
  left.top === right.top && left.bottom === right.bottom;

function createFAQScrollStore() {
  let element: HTMLDivElement | null = null;
  let observer: ResizeObserver | null = null;
  let snapshot = NO_EDGES;
  const listeners = new Set<() => void>();

  const publishMeasurement = () => {
    if (!element) return;
    const measured = measureFAQScrollEdges(element);
    if (sameEdges(snapshot, measured)) return;
    snapshot = measured;
    listeners.forEach((notify) => notify());
  };
  const unbindElement = () => {
    element?.removeEventListener("scroll", publishMeasurement);
    observer?.disconnect();
    observer = null;
  };
  const bindElement: RefCallback<HTMLDivElement> = (next) => {
    if (element === next) return;
    unbindElement();
    element = next;
    if (!element) {
      snapshot = NO_EDGES;
      return;
    }
    element.addEventListener("scroll", publishMeasurement, { passive: true });
    if (typeof ResizeObserver === "function") {
      observer = new ResizeObserver(publishMeasurement);
      observer.observe(element);
    }
    publishMeasurement();
  };

  return {
    snapshot: () => snapshot,
    subscribe: (notify: () => void) => {
      listeners.add(notify);
      return () => listeners.delete(notify);
    },
    bindElement,
  };
}

export function useFAQScrollEdges(): {
  edges: FAQScrollEdges;
  scrollRef: RefCallback<HTMLDivElement>;
} {
  const store = useMemo(createFAQScrollStore, []);
  return {
    edges: useSyncExternalStore(
      store.subscribe,
      store.snapshot,
      () => NO_EDGES,
    ),
    scrollRef: store.bindElement,
  };
}
