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

  it("shares the product shell geometry while authenticated chrome loads", () => {
    render(
      <I18nProvider defaultLocale="en">
        <RouteLoadingState shellLabel="Home" />
      </I18nProvider>,
    );

    const status = screen.getByRole("status");
    const sidebar = screen.getByText("Looper").closest("aside");

    expect(status.closest(".web-product-canvas")).not.toBeNull();
    expect(status.closest(".web-product-shell")).not.toBeNull();
    expect(status.closest(".web-product-content-shell")).not.toBeNull();
    expect(sidebar).toHaveClass("web-product-sidebar");
    expect(sidebar?.querySelector(".web-product-brand")).not.toBeNull();
  });
});
