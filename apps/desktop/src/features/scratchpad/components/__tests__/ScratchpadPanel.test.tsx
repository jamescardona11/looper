// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import ScratchpadPanel from "../ScratchpadPanel";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("ScratchpadPanel", () => {
  test("keeps the draft in local storage and exposes a close action", () => {
    const onClose = vi.fn();
    render(<ScratchpadPanel open onClose={onClose} />);

    fireEvent.change(screen.getByLabelText("Quick note"), {
      target: { value: "Keep this idea." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Close Scratchpad" }));

    expect(window.localStorage.getItem("looper.desktop.scratchpad")).toBe(
      "Keep this idea.",
    );
    expect(onClose).toHaveBeenCalledOnce();
  });
});
