import { I18nProvider } from "@looper/i18n/react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RouteLoadingState } from "../route-loading-state";

afterEach(cleanup);

describe("RouteLoadingState", () => {
  it("keeps product context visible while the authenticated shell loads", () => {
    render(
      <I18nProvider defaultLocale="en">
        <RouteLoadingState shellLabel="Image" />
      </I18nProvider>,
    );

    expect(screen.getByText("Looper")).toBeVisible();
    expect(screen.getAllByText("Image")).toHaveLength(2);
    expect(screen.getByRole("status")).toHaveTextContent("Loading");
  });
});
