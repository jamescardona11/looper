import { describe, expect, it } from "vitest";
import { isSettingsTab } from "../settings-tabs";

describe("settings tabs", () => {
  it("does not accept the hidden subscription tab from the URL", () => {
    expect(isSettingsTab("subscription")).toBe(false);
  });

  it("does not accept appearance until there is a real choice", () => {
    expect(isSettingsTab("appearance")).toBe(false);
  });
});
