// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { useSettingsErrors } from "../useSettingsErrors";

describe("useSettingsErrors", () => {
  test("routes errors from account screens to general settings", () => {
    const { result } = renderHook(() => useSettingsErrors("account"));

    act(() => result.current.show("save failed"));
    expect(result.current.issue).toEqual({
      message: "save failed",
      sourceTab: "general",
    });

    act(() => result.current.clear());
    expect(result.current.issue).toBeNull();
  });

  test("keeps explicit provider routing", () => {
    const { result } = renderHook(() => useSettingsErrors("app"));

    act(() => result.current.showProvider("invalid key"));
    expect(result.current.issue?.sourceTab).toBe("providers");
  });
});
