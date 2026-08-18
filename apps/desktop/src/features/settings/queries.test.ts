import { describe, expect, test } from "vitest";
import { settingsKeys } from "./queries";

describe("settings cache keys", () => {
  test("keeps detail invalidation under the settings root", () => {
    expect(settingsKeys.all).toEqual(["settings"]);
    expect(settingsKeys.detail()).toEqual(["settings", "detail"]);
  });

  test("keeps app and device resources independently addressable", () => {
    expect(settingsKeys.appInfo()).toEqual(["appInfo"]);
    expect(settingsKeys.devices()).toEqual(["inputDevices"]);
  });
});
