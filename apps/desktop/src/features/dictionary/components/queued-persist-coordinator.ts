type QueuedValue<T> = { value: T } | null;

export type QueuedPersistState<T> = {
  durableValue: T;
  latestValue: T;
  queuedValue: QueuedValue<T>;
  writing: boolean;
};

export type DrainResult =
  | { status: "saved" }
  | { status: "failed"; error: unknown };

function readQueuedValue<T>(state: QueuedPersistState<T>) {
  return state.queuedValue;
}

export function createQueuedPersistState<T>(initialValue: T) {
  return {
    durableValue: initialValue,
    latestValue: initialValue,
    queuedValue: null,
    writing: false,
  } satisfies QueuedPersistState<T>;
}

export function acceptExternalValue<T>(
  state: QueuedPersistState<T>,
  value: T,
) {
  state.latestValue = value;
  if (!state.writing && state.queuedValue === null) {
    state.durableValue = value;
  }
}

export function enqueueLatestValue<T>(
  state: QueuedPersistState<T>,
  value: T,
) {
  state.latestValue = value;
  state.queuedValue = { value };
  if (state.writing) return false;

  state.writing = true;
  return true;
}

export async function drainQueuedValues<T>(
  state: QueuedPersistState<T>,
  persist: (value: T) => Promise<T>,
  publish: (value: T) => void,
): Promise<DrainResult> {
  try {
    while (state.queuedValue !== null) {
      const requestedValue = state.queuedValue.value;
      state.queuedValue = null;
      const savedValue = await persist(requestedValue);
      const queuedAfterSave = readQueuedValue(state);
      const superseded =
        queuedAfterSave !== null &&
        !Object.is(queuedAfterSave.value, requestedValue);

      if (!superseded) {
        state.latestValue = savedValue;
        state.durableValue = savedValue;
        publish(savedValue);
      }
    }
    return { status: "saved" };
  } catch (error) {
    state.queuedValue = null;
    state.latestValue = state.durableValue;
    publish(state.durableValue);
    return { status: "failed", error };
  } finally {
    state.writing = false;
  }
}

export function describePersistFailure(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
