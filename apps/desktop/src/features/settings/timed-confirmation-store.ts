type TimerHandle = ReturnType<typeof setTimeout>;

type TimerDependencies = {
  schedule: (callback: () => void, delayMs: number) => TimerHandle;
  cancel: (handle: TimerHandle) => void;
};

const defaultTimerDependencies: TimerDependencies = {
  schedule: (callback, delayMs) => setTimeout(callback, delayMs),
  cancel: (handle) => clearTimeout(handle),
};

export function createTimedConfirmationStore(
  durationMs: number,
  timers: TimerDependencies = defaultTimerDependencies,
) {
  let armed = false;
  let timer: TimerHandle | null = null;
  const listeners = new Set<() => void>();

  const publish = (next: boolean) => {
    if (armed === next) return;
    armed = next;
    listeners.forEach((listener) => listener());
  };

  const clearTimer = () => {
    if (timer === null) return;
    timers.cancel(timer);
    timer = null;
  };

  const cancel = () => {
    clearTimer();
    publish(false);
  };

  return {
    getSnapshot: () => armed,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) cancel();
      };
    },
    request: (): boolean => {
      if (armed) {
        cancel();
        return true;
      }
      publish(true);
      clearTimer();
      timer = timers.schedule(() => {
        timer = null;
        publish(false);
      }, durationMs);
      return false;
    },
    cancel,
  };
}
