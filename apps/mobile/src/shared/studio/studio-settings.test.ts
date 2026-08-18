import { describe, expect, it } from "vitest";
import { normalizeStudioSettings, smartModePrompt } from "./studio-settings";

describe("studio settings", () => {
  it("keeps built-ins and adapts imported styles", () => {
    const settings = normalizeStudioSettings({
      styles: [{ name: "Imported", instructions: "Keep product names exact." }],
      activeStyleId: "missing",
    });
    expect(settings.styles.map((style) => style.name)).toContain("Imported");
    expect(settings.activeStyleId).toBe("concise");
  });

  it("combines style, format, and mode instructions", () => {
    const settings = normalizeStudioSettings(null);
    expect(
      smartModePrompt(
        {
          id: "work",
          name: "Work",
          enabled: true,
          triggerType: "manual",
          triggerValue: "",
          styleId: "concise",
          format: "email",
          instructions: "End with the stated next step.",
        },
        settings.styles,
      ),
    ).toContain("Format as an email");
  });
});
