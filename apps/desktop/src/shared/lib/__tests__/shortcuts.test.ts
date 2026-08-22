import { beforeEach, describe, expect, test, vi } from "vitest";

const currentPlatform = vi.hoisted(() => ({ id: "macos" }));

vi.mock("../../../platform/service", () => ({
  detectAppPlatform: () => currentPlatform.id,
}));

import { formatShortcutForDisplay } from "../shortcuts";

describe("shortcut display", () => {
  beforeEach(() => {
    currentPlatform.id = "macos";
  });

  test("normalizes and orders macOS modifiers", () => {
    expect(
      formatShortcutForDisplay("Shift+CommandOrControl+Alt+ArrowLeft"),
    ).toBe("Command + Option + Shift + Left");
    expect(formatShortcutForDisplay("LeftCommand+Space")).toBe(
      "Left Command + Space",
    );
    expect(formatShortcutForDisplay("CmdRight+CtrlLeft+A")).toBe(
      "Right Command + Left Ctrl + A",
    );
  });

  test("uses Windows modifier names and aliases", () => {
    currentPlatform.id = "windows";

    expect(formatShortcutForDisplay("CommandOrControl+Alt+Delete")).toBe(
      "Alt + Ctrl + Delete",
    );
    expect(formatShortcutForDisplay("Command+ForwardDelete")).toBe(
      "Meta + Delete",
    );
  });

  test("formats mouse and keypad inputs", () => {
    expect(formatShortcutForDisplay("mouse4+Keypad7+Return")).toBe(
      "Mouse Back + Keypad 7 + Enter",
    );
  });

  test("ignores empty segments", () => {
    expect(formatShortcutForDisplay(" Ctrl + + A ")).toBe("Ctrl + A");
  });
});
