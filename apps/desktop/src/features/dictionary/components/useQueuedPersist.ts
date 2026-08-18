import { useCallback, useEffect, useRef, useState } from "react";
import {
  acceptExternalValue,
  createQueuedPersistState,
  describePersistFailure,
  drainQueuedValues,
  enqueueLatestValue,
} from "./queued-persist-coordinator";

type PersistWriter<T> = (value: T) => Promise<T>;
type ErrorSink = (message: string | null) => void;
type ValueSink<T> = (value: T) => void;

type QueuedPersistBindings<T> = {
  value: T;
  persist: PersistWriter<T>;
  setError: ErrorSink;
  setValue: ValueSink<T>;
};

export function useQueuedPersist<T>(bindings: QueuedPersistBindings<T>) {
  const {
    value,
    persist: writeValue,
    setError: reportError,
    setValue: publishValue,
  } = bindings;
  const [isWriting, setIsWriting] = useState(false);
  const optimisticValueRef = useRef(value);
  const coordinatorRef = useRef(createQueuedPersistState(value));

  useEffect(() => {
    optimisticValueRef.current = value;
    acceptExternalValue(coordinatorRef.current, value);
  }, [value]);

  const queuePersist = useCallback(
    async (requestedValue: T) => {
      optimisticValueRef.current = requestedValue;
      publishValue(requestedValue);

      const coordinator = coordinatorRef.current;
      if (!enqueueLatestValue(coordinator, requestedValue)) return;

      setIsWriting(true);
      reportError(null);

      try {
        const result = await drainQueuedValues(
          coordinator,
          writeValue,
          (savedValue) => {
            optimisticValueRef.current = savedValue;
            publishValue(savedValue);
          },
        );
        if (result.status === "failed") {
          console.error(result.error);
          reportError(describePersistFailure(result.error));
        }
      } finally {
        setIsWriting(false);
      }
    },
    [publishValue, reportError, writeValue],
  );

  return {
    currentRef: optimisticValueRef,
    pending: isWriting,
    persistNext: queuePersist,
  };
}
