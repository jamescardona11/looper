import { describe, expect, it } from "vitest";
import { isSettingsTab } from "./settings-tabs";

describe("settings tabs", () => {
  it("does not accept the hidden subscription tab from the URL", () => {
    expect(isSettingsTab("subscription")).toBe(false);
  });
});
