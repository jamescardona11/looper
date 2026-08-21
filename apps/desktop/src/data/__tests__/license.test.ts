import { beforeEach, describe, expect, test, vi } from "vitest";

const tauri = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: tauri.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: tauri.listen }));

import {
  activateLicense,
  deactivateLicense,
  getDictationStats,
  getLicenseState,
  refreshLicense,
  subscribeLicenseCheckoutReturned,
} from "../license";

describe("entitlement native gateway", () => {
  beforeEach(() => {
    tauri.invoke.mockReset();
    tauri.listen.mockReset();
  });

  test("routes state, activation, refresh, and usage commands", async () => {
    tauri.invoke.mockResolvedValue(undefined);

    await getLicenseState();
    await activateLicense("LOOPER-KEY");
    await refreshLicense();
    await deactivateLicense();
    await getDictationStats();

    expect(tauri.invoke.mock.calls).toEqual([
      ["get_license_state"],
      ["activate_license", { args: { key: "LOOPER-KEY" } }],
      ["refresh_license"],
      ["deactivate_license"],
      ["get_dictation_stats"],
    ]);
  });

  test("returns the native payload for state and usage reads unchanged", async () => {
    const state = { licenseGateActive: false, license: null, trial: null };
    const stats = { totalWords: 12, totalDurationMs: 3400, totalDictations: 2 };
    tauri.invoke.mockResolvedValueOnce(state).mockResolvedValueOnce(stats);

    await expect(getLicenseState()).resolves.toBe(state);
    await expect(getDictationStats()).resolves.toBe(stats);
  });

  test("subscribes to checkout return notifications", async () => {
    const handler = vi.fn();
    tauri.listen.mockResolvedValue(vi.fn());
    await subscribeLicenseCheckoutReturned(handler);
    expect(tauri.listen).toHaveBeenCalledWith(
      "license:checkout-returned",
      handler,
    );
  });
});
