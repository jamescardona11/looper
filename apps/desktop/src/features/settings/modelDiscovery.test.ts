import { describe, expect, test } from "vitest";
import {
  applyModelDiscoveryFailure,
  applyModelDiscoverySuccess,
  beginModelDiscovery,
  EMPTY_MODEL_DISCOVERY_STATE,
  resetModelDiscovery,
} from "./modelDiscovery";

describe("model discovery request ordering", () => {
  test("keeps visible models while a refresh starts", () => {
    const loaded = applyModelDiscoverySuccess(
      beginModelDiscovery(EMPTY_MODEL_DISCOVERY_STATE).state,
      1,
      ["local-a"],
    );

    const refresh = beginModelDiscovery(loaded);
    expect(refresh.requestSeq).toBe(2);
    expect(refresh.state.models).toEqual(["local-a"]);
  });

  test("ignores results from superseded requests", () => {
    const first = beginModelDiscovery(EMPTY_MODEL_DISCOVERY_STATE);
    const second = beginModelDiscovery(first.state);

    expect(
      applyModelDiscoverySuccess(second.state, first.requestSeq, ["stale"]),
    ).toBe(second.state);
    expect(applyModelDiscoveryFailure(second.state, first.requestSeq)).toBe(
      second.state,
    );
  });

  test("reset invalidates work and removes the visible catalog", () => {
    const active = beginModelDiscovery(EMPTY_MODEL_DISCOVERY_STATE);
    const reset = resetModelDiscovery({
      requestSeq: active.requestSeq,
      models: ["local-a"],
    });

    expect(reset).toEqual({ requestSeq: 2, models: [] });
  });
});
