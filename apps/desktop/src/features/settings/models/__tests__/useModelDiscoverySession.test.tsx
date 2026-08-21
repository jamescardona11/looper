// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { useModelDiscoverySession } from "../useModelDiscoverySession";

describe("useModelDiscoverySession", () => {
  test("keeps the current models visible while a refresh is in flight", () => {
    const { result } = renderHook(useModelDiscoverySession);

    let firstRequest = 0;
    act(() => {
      firstRequest = result.current.begin();
      result.current.succeed(firstRequest, ["model-a"]);
    });

    act(() => {
      result.current.begin();
    });

    expect(result.current.models).toEqual(["model-a"]);
  });

  test("ignores a response from an older request", () => {
    const { result } = renderHook(useModelDiscoverySession);

    let olderRequest = 0;
    let currentRequest = 0;
    act(() => {
      olderRequest = result.current.begin();
      currentRequest = result.current.begin();
    });

    act(() => {
      result.current.succeed(currentRequest, ["current"]);
    });

    let applied = true;
    act(() => {
      applied = result.current.succeed(olderRequest, ["stale"]);
    });

    expect(applied).toBe(false);
    expect(result.current.models).toEqual(["current"]);
  });

  test("clears models after a current failure or explicit reset", () => {
    const { result } = renderHook(useModelDiscoverySession);

    let request = 0;
    act(() => {
      request = result.current.begin();
      result.current.succeed(request, ["model-a"]);
    });
    act(() => {
      request = result.current.begin();
      result.current.fail(request);
    });
    expect(result.current.models).toEqual([]);

    act(() => {
      request = result.current.begin();
      result.current.succeed(request, ["model-b"]);
      result.current.reset();
    });
    expect(result.current.models).toEqual([]);
  });
});
