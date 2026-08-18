import { beforeEach, describe, expect, test, vi } from "vitest";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

const {
  activateLicense,
  deactivateLicense,
  getDictationStats,
  getLicenseState,
  refreshLicense,
} = await import("../../src/data/license");

beforeEach(() => {
  invokeMock.mockReset();
});

describe("license api bridge", () => {
  test("reads license state through the Tauri command boundary", async () => {
    const state = {
      licenseGateActive: false,
      license: null,
      trial: null,
    };
    invokeMock.mockResolvedValueOnce(state);

    await expect(getLicenseState()).resolves.toBe(state);

    expect(invokeMock).toHaveBeenCalledWith("get_license_state");
  });

  test("activates, refreshes, and deactivates via the expected Tauri commands", async () => {
    invokeMock.mockResolvedValue({});

    await activateLicense("LOOPER-123");
    await refreshLicense();
    await deactivateLicense();

    expect(invokeMock).toHaveBeenNthCalledWith(1, "activate_license", {
      args: { key: "LOOPER-123" },
    });
    expect(invokeMock).toHaveBeenNthCalledWith(2, "refresh_license");
    expect(invokeMock).toHaveBeenNthCalledWith(3, "deactivate_license");
  });

  test("reads local dictation stats through the Tauri command boundary", async () => {
    const stats = {
      totalWords: 12,
      totalDurationMs: 3400,
      totalDictations: 2,
    };
    invokeMock.mockResolvedValueOnce(stats);

    await expect(getDictationStats()).resolves.toBe(stats);

    expect(invokeMock).toHaveBeenCalledWith("get_dictation_stats");
  });
});
