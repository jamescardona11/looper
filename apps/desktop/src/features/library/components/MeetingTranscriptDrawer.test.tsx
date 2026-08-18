// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { MeetingTranscriptDrawer } from "./MeetingTranscriptDrawer";

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

afterEach(cleanup);

const renderDrawer = (open: boolean, overrides = {}) => {
  const props = {
    open,
    searchQuery: "",
    searchMatchLabel: null,
    onSearchChange: vi.fn(),
    canShowTimestamps: true,
    speakerView: true,
    onViewToggle: vi.fn(),
    onClose: vi.fn(),
    children: <div>Transcript rows</div>,
    ...overrides,
  };

  const view = render(
    <I18nProvider i18n={i18n}>
      <MeetingTranscriptDrawer {...props} />
    </I18nProvider>,
  );
  return { ...view, props };
};

describe("MeetingTranscriptDrawer", () => {
  test("collapses without unmounting transcript state", () => {
    const { container } = renderDrawer(false);
    const drawer = container.querySelector(
      '[data-ui-panel="meeting-transcript"]',
    );
    const content = container.querySelector(
      '[data-ui-region="meeting-transcript-content"]',
    );

    expect(drawer?.getAttribute("aria-hidden")).toBe("true");
    expect(drawer?.className).toContain("w-0");
    expect(content?.className).toContain("flex");
    expect(screen.getByText("Transcript rows").isConnected).toBe(true);
  });

  test("exposes search, close, and transcript-view controls", () => {
    const { props } = renderDrawer(true, { searchMatchLabel: "2/4" });

    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "GraphQL" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Raw text" }));
    fireEvent.click(screen.getByRole("button", { name: "Close transcript" }));

    expect(props.onSearchChange).toHaveBeenCalledWith("GraphQL");
    expect(props.onViewToggle).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByText("2/4").isConnected).toBe(true);
  });

  test("disables speaker view without timestamped segments", () => {
    renderDrawer(true, {
      canShowTimestamps: false,
      speakerView: false,
    });

    expect(
      (
        screen.getByRole("button", {
          name: "Speaker view",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
});
