// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { SettingsWindow } from "../SettingsWindow";

afterEach(cleanup);

describe("SettingsWindow", () => {
  test("keeps an identifiable light workspace skeleton while loading", () => {
    render(
      <SettingsWindow
        loading
        onboardingVisible={false}
        previewRoute={null}
      />,
    );

    const loading = screen.getByRole("main", {
      name: "Preparing your workspace",
    });

    expect(loading.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByText("Looper").isConnected).toBe(true);
    expect(screen.getByText("Preparing your workspace").isConnected).toBe(
      true,
    );
  });
});
