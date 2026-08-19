import { describe, expect, it } from "vitest";
import {
  initialSettingsSection,
  settingsSectionTab,
} from "./settings-navigation";

describe("settings navigation", () => {
  it("exposes the twelve focused destinations from the settings design", () => {
    expect(Object.keys(settingsSectionTab)).toEqual([
      "account",
      "sync",
      "processing",
      "microphone",
      "shortcuts",
      "behavior",
      "providers",
      "appearance",
      "calendar",
      "privacy",
      "storage",
      "about",
    ]);
  });

  it("maps grouped sections to their functional settings surfaces", () => {
    expect(settingsSectionTab.microphone).toBe("general");
    expect(settingsSectionTab.shortcuts).toBe("general");
    expect(settingsSectionTab.calendar).toBe("app");
    expect(settingsSectionTab.storage).toBe("app");
    expect(initialSettingsSection.models).toBe("processing");
    expect(initialSettingsSection.app).toBe("calendar");
  });
});
