// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const openUrl = vi.hoisted(() => vi.fn());
const checkoutUrlFor = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl }));
vi.mock("../../license/purchaseConfig", () => ({ checkoutUrlFor }));

import { useAccountCheckout } from "../useAccountCheckout";

describe("account checkout", () => {
  beforeEach(() => {
    openUrl.mockReset();
    checkoutUrlFor.mockReset();
  });

  test("opens the configured tier and clears its pending target", async () => {
    checkoutUrlFor.mockReturnValue("https://checkout.example/personal");
    openUrl.mockResolvedValue(undefined);
    const { result } = renderHook(() => useAccountCheckout());

    await act(() => result.current.openCheckout("personal"));

    expect(checkoutUrlFor).toHaveBeenCalledWith("personal", "settings_account");
    expect(openUrl).toHaveBeenCalledWith("https://checkout.example/personal");
    expect(result.current.openingTarget).toBeNull();
    expect(result.current.error).toBeNull();
  });

  test("surfaces a missing build configuration without opening a URL", async () => {
    checkoutUrlFor.mockReturnValue(null);
    const { result } = renderHook(() => useAccountCheckout());

    await act(() => result.current.openCheckout("commercial"));

    expect(openUrl).not.toHaveBeenCalled();
    expect(result.current.error).toContain(
      "Commercial checkout link is not configured",
    );
  });

  test("surfaces an opener failure and always clears the pending tier", async () => {
    checkoutUrlFor.mockReturnValue("https://checkout.example/personal");
    openUrl.mockRejectedValue(new Error("browser unavailable"));
    const { result } = renderHook(() => useAccountCheckout());

    await act(() => result.current.openCheckout("personal"));

    expect(result.current.openingTarget).toBeNull();
    expect(result.current.error).toBe("browser unavailable");
  });
});
