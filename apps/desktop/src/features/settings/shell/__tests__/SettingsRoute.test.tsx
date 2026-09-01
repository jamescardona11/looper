// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  selectTab: vi.fn(),
  useSettingsForm: vi.fn(),
}));

vi.mock("../../../../shared/ui/FAQModal", () => ({
  default: () => null,
}));

vi.mock("../../preferences/useSettingsForm", () => ({
  useSettingsForm: mocks.useSettingsForm,
}));

vi.mock("../SettingsTabContent", () => ({
  SettingsTabContent: () => <div data-testid="settings-content" />,
}));

import SettingsRoute from "../SettingsRoute";

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SettingsRoute", () => {
  test("places the setup hierarchy above the responsive navigation grid", () => {
    mocks.useSettingsForm.mockReturnValue(settingsForm());

    render(
      <I18nProvider i18n={i18n}>
        <SettingsRoute isOpen onClose={vi.fn()} transcriptionMode="local" />
      </I18nProvider>,
    );

    const eyebrow = screen.getByText("Setup");
    const title = screen.getByRole("heading", {
      level: 1,
      name: "Looper, tuned to this Mac.",
    });
    const navigation = screen.getByRole("navigation", {
      name: "Setup navigation",
    });

    expect(eyebrow.compareDocumentPosition(title)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(title.compareDocumentPosition(navigation)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(navigation.className).toContain("overflow-x-auto");
    expect(navigation.className).toContain("min-[1081px]:flex-col");
    expect(screen.getByTestId("settings-content")).toBeTruthy();
  });

  test("keeps every real destination interactive and exposes the active page", () => {
    mocks.useSettingsForm.mockReturnValue(settingsForm());

    render(
      <I18nProvider i18n={i18n}>
        <SettingsRoute isOpen onClose={vi.fn()} transcriptionMode="local" />
      </I18nProvider>,
    );

    expect(
      screen
        .getByRole("button", { name: "Processing & Models" })
        .getAttribute("aria-current"),
    ).toBe("page");

    fireEvent.click(
      screen.getByRole("button", { name: "Calendar & Meetings" }),
    );

    expect(mocks.selectTab).toHaveBeenCalledWith("app");
    expect(
      screen
        .getByRole("button", { name: "Calendar & Meetings" })
        .getAttribute("aria-current"),
    ).toBe("page");
  });
});

function settingsForm() {
  return {
    navigation: {
      activeTab: "general",
      selectTab: mocks.selectTab,
      loading: false,
      error: null,
    },
    faq: {
      isOpen: false,
      close: vi.fn(),
    },
  };
}
