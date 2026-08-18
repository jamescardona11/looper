export type ModelDiscoveryState = Readonly<{
  requestSeq: number;
  models: string[];
}>;

export const EMPTY_MODEL_DISCOVERY_STATE: ModelDiscoveryState = Object.freeze({
  requestSeq: 0,
  models: [],
});

type DiscoveryResult = {
  state: ModelDiscoveryState;
  requestSeq: number;
};

function advanceRequest(
  current: ModelDiscoveryState,
  keepModels: boolean,
): DiscoveryResult {
  const requestSeq = current.requestSeq + 1;
  return {
    requestSeq,
    state: {
      requestSeq,
      models: keepModels ? current.models : [],
    },
  };
}

function settleRequest(
  current: ModelDiscoveryState,
  requestSeq: number,
  models: string[],
): ModelDiscoveryState {
  if (current.requestSeq !== requestSeq) return current;
  return { requestSeq, models };
}

export function resetModelDiscovery(
  current: ModelDiscoveryState,
): ModelDiscoveryState {
  return advanceRequest(current, false).state;
}

export function beginModelDiscovery(
  current: ModelDiscoveryState,
): DiscoveryResult {
  return advanceRequest(current, true);
}

export function applyModelDiscoverySuccess(
  current: ModelDiscoveryState,
  requestSeq: number,
  models: string[],
): ModelDiscoveryState {
  return settleRequest(current, requestSeq, models);
}

export function applyModelDiscoveryFailure(
  current: ModelDiscoveryState,
  requestSeq: number,
): ModelDiscoveryState {
  return settleRequest(current, requestSeq, []);
}
