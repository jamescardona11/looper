// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import WindowControls from "../WindowControls";

const mocks = vi.hoisted(() => ({
  customControls: vi.fn(),
  perform: vi.fn(),
}));

vi.mock("../../../platform/service", () => ({
  getPlatformCapabilities: () => ({
    usesCustomWindowControls: mocks.customControls(),
  }),
}));

vi.mock("../../../data/window", () => ({
  performWindowAction: mocks.perform,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("WindowControls", () => {
  test("stays hidden when the platform owns the title bar controls", () => {
    mocks.customControls.mockReturnValue(false);
    const { container } = render(<WindowControls />);

    expect(container.firstElementChild).toBeNull();
  });

  test("routes each custom title bar button to its native action", () => {
    mocks.customControls.mockReturnValue(true);
    render(<WindowControls />);

    fireEvent.click(screen.getByRole("button", { name: "Minimize" }));
    fireEvent.click(screen.getByRole("button", { name: "Maximize" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(mocks.perform.mock.calls).toEqual([
      ["minimize"],
      ["maximize"],
      ["close"],
    ]);
  });
});
