import type { AneCompileEvent } from "../../types";
import { subscribeAneCompile } from "../../data/transcription";

type AneCompileDependencies = {
  subscribe: (
    listener: (payload: AneCompileEvent) => void,
  ) => Promise<() => void>;
};

const defaultDependencies: AneCompileDependencies = {
  subscribe: subscribeAneCompile,
};

export function createAneCompileStore(
  dependencies: AneCompileDependencies = defaultDependencies,
) {
  let label: string | null = null;
  let subscriptionVersion = 0;
  let stopNativeSubscription: (() => void) | null = null;
  const listeners = new Set<() => void>();

  const publish = (nextLabel: string | null) => {
    if (nextLabel === label) return;
    label = nextLabel;
    listeners.forEach((listener) => listener());
  };

  const start = () => {
    const version = ++subscriptionVersion;
    void dependencies
      .subscribe((payload) => {
        if (version !== subscriptionVersion) return;
        publish(payload.status === "start" ? payload.label : null);
      })
      .then((cleanup) => {
        if (version !== subscriptionVersion) cleanup();
        else stopNativeSubscription = cleanup;
      })
      .catch(() => {});
  };

  const stop = () => {
    subscriptionVersion += 1;
    stopNativeSubscription?.();
    stopNativeSubscription = null;
    label = null;
  };

  return {
    getSnapshot: () => label,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      if (listeners.size === 1) start();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) stop();
      };
    },
  };
}

export const aneCompileStore = createAneCompileStore();
