// @vitest-environment jsdom

import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { useDocumentAppearance } from "../useDocumentAppearance";

vi.mock("../../data/settings", () => ({
  subscribeTextSizeChanged: vi.fn(),
}));
vi.mock("../../data/system/window", () => ({
  setWindowBackgroundColor: vi.fn(),
}));

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.theme;
});

test.each(["toast", "meeting-awareness"])(
  "%s uses light mode and keeps the native background transparent",
  (windowLabel) => {
    document.documentElement.dataset.theme = "dark";
    renderHook(() =>
      useDocumentAppearance({
        windowLabel,
        previewMode: false,
      }),
    );

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.style.backgroundColor).toBe("");
    expect(document.body.style.backgroundColor).toBe("");
  },
);
