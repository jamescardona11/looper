export type ModelDiscoveryState = Readonly<{
  requestSeq: number;
  models: string[];
}>;

export type ModelDiscoveryEvent =
  | { type: "begin"; preserveCatalog: boolean }
  | { type: "settle"; requestSeq: number; models: string[] };

export const EMPTY_MODEL_DISCOVERY_STATE: ModelDiscoveryState = Object.freeze({
  requestSeq: 0,
  models: [],
});

const nextRequestSeq = (state: ModelDiscoveryState) => state.requestSeq + 1;

const belongsToCurrentRequest = (
  state: ModelDiscoveryState,
  requestSeq: number,
) => state.requestSeq === requestSeq;

export function transitionModelDiscovery(
  current: ModelDiscoveryState,
  event: ModelDiscoveryEvent,
): ModelDiscoveryState {
  if (event.type === "begin") {
    return {
      requestSeq: nextRequestSeq(current),
      models: event.preserveCatalog ? current.models : [],
    };
  }

  if (!belongsToCurrentRequest(current, event.requestSeq)) return current;
  return { requestSeq: event.requestSeq, models: event.models };
}

type DiscoveryResult = {
  state: ModelDiscoveryState;
  requestSeq: number;
};

export function resetModelDiscovery(
  current: ModelDiscoveryState,
): ModelDiscoveryState {
  return transitionModelDiscovery(current, {
    type: "begin",
    preserveCatalog: false,
  });
}

export function beginModelDiscovery(
  current: ModelDiscoveryState,
): DiscoveryResult {
  const state = transitionModelDiscovery(current, {
    type: "begin",
    preserveCatalog: true,
  });
  return { state, requestSeq: state.requestSeq };
}

export function applyModelDiscoverySuccess(
  current: ModelDiscoveryState,
  requestSeq: number,
  models: string[],
): ModelDiscoveryState {
  return transitionModelDiscovery(current, {
    type: "settle",
    requestSeq,
    models,
  });
}

export function applyModelDiscoveryFailure(
  current: ModelDiscoveryState,
  requestSeq: number,
): ModelDiscoveryState {
  return transitionModelDiscovery(current, {
    type: "settle",
    requestSeq,
    models: [],
  });
}
