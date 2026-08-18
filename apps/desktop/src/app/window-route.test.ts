import { describe, expect, test } from "vitest";

import { resolveDesktopWindowRoute, resolvePreviewRoute } from "./window-route";

describe("desktop window routing", () => {
  test("maps native windows to their owned surface", () => {
    expect(resolveDesktopWindowRoute("settings", false)).toBe("settings");
    expect(resolveDesktopWindowRoute("meeting-awareness", false)).toBe(
      "meeting-awareness",
    );
    expect(resolveDesktopWindowRoute("toast", false)).toBe("toast");
    expect(resolveDesktopWindowRoute("main", false)).toBe("main-overlay");
  });

  test("routes every preview through the settings shell", () => {
    expect(resolveDesktopWindowRoute("main", true)).toBe("settings");
    expect(resolvePreviewRoute("?surface=pill")).toBe("pill");
    expect(resolvePreviewRoute("?surface=motion")).toBe("motion");
    expect(resolvePreviewRoute("?surface=unknown")).toBe("dashboard");
  });
});
