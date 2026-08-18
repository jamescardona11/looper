import { useCallback, useRef, useState } from "react";

import {
  applyModelDiscoveryFailure,
  applyModelDiscoverySuccess,
  beginModelDiscovery,
  EMPTY_MODEL_DISCOVERY_STATE,
  resetModelDiscovery,
  type ModelDiscoveryState,
} from "./modelDiscovery";

type DiscoveryReducer = (state: ModelDiscoveryState) => ModelDiscoveryState;

export function useModelDiscoverySession() {
  const [state, setState] = useState(EMPTY_MODEL_DISCOVERY_STATE);
  const currentRef = useRef(EMPTY_MODEL_DISCOVERY_STATE);

  const apply = useCallback((reducer: DiscoveryReducer) => {
    const previous = currentRef.current;
    const next = reducer(previous);
    if (next === previous) return false;

    currentRef.current = next;
    setState(next);
    return true;
  }, []);

  const reset = useCallback(() => {
    apply(resetModelDiscovery);
  }, [apply]);

  const begin = useCallback(() => {
    const next = beginModelDiscovery(currentRef.current);
    currentRef.current = next.state;
    setState(next.state);
    return next.requestSeq;
  }, []);

  const succeed = useCallback(
    (requestSeq: number, models: string[]) =>
      apply((current) =>
        applyModelDiscoverySuccess(current, requestSeq, models),
      ),
    [apply],
  );

  const fail = useCallback(
    (requestSeq: number) =>
      apply((current) => applyModelDiscoveryFailure(current, requestSeq)),
    [apply],
  );

  return {
    models: state.models,
    reset,
    begin,
    succeed,
    fail,
  };
}
