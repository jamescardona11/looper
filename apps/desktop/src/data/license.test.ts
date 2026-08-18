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
} from "./license";

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
      ["get_license_state", undefined],
      ["activate_license", { args: { key: "LOOPER-KEY" } }],
      ["refresh_license", undefined],
      ["deactivate_license", undefined],
      ["get_dictation_stats", undefined],
    ]);
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
