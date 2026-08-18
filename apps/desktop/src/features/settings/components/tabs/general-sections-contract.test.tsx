// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { GeneralFeatureSection } from "./GeneralFeatureSection";
import { GeneralInputSection } from "./GeneralInputSection";
import { MicrophoneTestSlot } from "./GeneralMicrophoneTest";

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

function renderWithI18n(node: ReactNode) {
  return render(<I18nProvider i18n={i18n}>{node}</I18nProvider>);
}

function featureProps(
  overrides: Partial<ComponentProps<typeof GeneralFeatureSection>> = {},
): ComponentProps<typeof GeneralFeatureSection> {
  return {
    editModeEnabled: false,
    setEditModeEnabled: vi.fn(),
    previewBeforeInsertEnabled: false,
    setPreviewBeforeInsertEnabled: vi.fn(),
    previewBeforeInsertSelectionEnabled: true,
    setPreviewBeforeInsertSelectionEnabled: vi.fn(),
    useScreenContext: false,
    setUseScreenContext: vi.fn(),
    autoDictionaryEnabled: false,
    autoDictionarySupported: true,
    setAutoDictionaryEnabled: vi.fn(),
    aiFeaturesReady: true,
    licenseGateActive: true,
    onOpenProvidersTab: vi.fn(),
    onOpenAccountTab: vi.fn(),
    ...overrides,
  };
}

function inputProps(
  overrides: Partial<ComponentProps<typeof GeneralInputSection>> = {},
): ComponentProps<typeof GeneralInputSection> {
  return {
    inputDevices: [
      { id: "built-in", name: "MacBook Microphone", is_default: true },
      { id: "usb", name: "USB Microphone", is_default: false },
    ],
    microphoneDevice: null,
    onMicrophoneDeviceChange: vi.fn(),
    language: "en",
    onLanguageChange: vi.fn(),
    languages: [
      { code: "en", name: "English" },
      { code: "es", name: "Spanish", description: "Español" },
    ],
    languageGuidance: "The active model supports both languages.",
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("General feature presentation contract", () => {
  test("routes provider setup and preserves keyboard help interactions", () => {
    const openProviders = vi.fn();
    const view = renderWithI18n(
      <GeneralFeatureSection
        {...featureProps({
          aiFeaturesReady: false,
          licenseGateActive: true,
          onOpenProvidersTab: openProviders,
        })}
      />,
    );

    const editSwitch = screen.getByRole("switch", { name: "Toggle Edit Mode" });
    expect(editSwitch.hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Providers" }));
    expect(openProviders).toHaveBeenCalledOnce();
    expect(
      view.container.querySelector('[data-settings-section="behavior"]')
        ?.className,
    ).toBe("space-y-2");

    cleanup();
    renderWithI18n(<GeneralFeatureSection {...featureProps()} />);
    const info = screen.getByRole("button", {
      name: "More information about Edit Mode",
    });
    const tooltip = screen.getByRole("tooltip");
    fireEvent.focus(info);
    expect(tooltip.className.includes("block")).toBe(true);
    expect(info.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(info, { key: "Escape" });
    expect(tooltip.className.includes("hidden")).toBe(true);
  });

  test("keeps unsupported Auto Dictionary disabled with its alternate copy", () => {
    const setDictionary = vi.fn();
    renderWithI18n(
      <GeneralFeatureSection
        {...featureProps({
          autoDictionarySupported: false,
          autoDictionaryEnabled: true,
          setAutoDictionaryEnabled: setDictionary,
        })}
      />,
    );

    const toggle = screen.getByRole("switch", {
      name: "Toggle Auto Dictionary",
    });
    expect(toggle.hasAttribute("disabled")).toBe(true);
    expect(
      screen.getByText("requires a model with dictionary support").isConnected,
    ).toBe(true);
    fireEvent.click(toggle);
    expect(setDictionary).not.toHaveBeenCalled();
  });
});

describe("General input presentation contract", () => {
  test("routes microphone and language menu selections and raises open menus", () => {
    const selectMicrophone = vi.fn();
    const selectLanguage = vi.fn();
    const view = renderWithI18n(
      <GeneralInputSection
        {...inputProps({
          onMicrophoneDeviceChange: selectMicrophone,
          onLanguageChange: selectLanguage,
        })}
      />,
    );
    const section = view.container.querySelector(
      '[data-settings-section="microphone"]',
    );

    fireEvent.click(screen.getByRole("button", { name: "System Default" }));
    expect(section?.className.includes("relative z-dropdown-open")).toBe(true);
    fireEvent.click(screen.getByRole("option", { name: "USB Microphone" }));
    expect(selectMicrophone).toHaveBeenCalledWith("usb");

    fireEvent.click(screen.getByRole("button", { name: "English" }));
    fireEvent.click(screen.getByRole("option", { name: /Spanish/ }));
    expect(selectLanguage).toHaveBeenCalledWith("es");
  });

  test("moves from unsupported microphone test error back to the picker", async () => {
    renderWithI18n(<GeneralInputSection {...inputProps()} />);

    fireEvent.click(screen.getByRole("button", { name: "Test" }));
    await waitFor(() => {
      expect(
        screen.getByText("Microphone testing isn't available in this window.")
          .isConnected,
      ).toBe(true);
    });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(
      screen.getByRole("button", { name: "System Default" }).isConnected,
    ).toBe(true);
  });
});

describe("Microphone meter presentation contract", () => {
  test("renders two 32-column channels with threshold colors and activity", () => {
    const view = renderWithI18n(
      <MicrophoneTestSlot
        status="listening"
        levels={{ left: 0.5, right: 1 }}
        label="USB Microphone"
        error={null}
      />,
    );

    const liveRegion = view.container.querySelector('[aria-live="polite"]');
    const dots = Array.from(liveRegion?.querySelectorAll("span.block") ?? []);
    expect(liveRegion?.className).toBe(
      "flex h-[38px] items-center gap-2 rounded-lg border border-border-primary bg-surface-surface px-3",
    );
    expect(dots).toHaveLength(64);
    expect(
      dots.filter((dot) =>
        dot.getAttribute("style")?.includes("opacity: 0.95"),
      ),
    ).toHaveLength(48);
    expect(
      dots.filter((dot) =>
        dot.getAttribute("style")?.includes("var(--color-error)"),
      ),
    ).toHaveLength(8);
  });

  test("prefers a supplied microphone error over generic copy", () => {
    renderWithI18n(
      <MicrophoneTestSlot
        status="error"
        levels={{ left: 0, right: 0 }}
        label="System Default"
        error="Device disconnected"
      />,
    );
    expect(screen.getByText("Device disconnected").isConnected).toBe(true);
    expect(screen.queryByText("Couldn't start microphone test.")).toBeNull();
  });
});

test("keeps distinctive Lingui ids across the split sections", () => {
  const translated = setupI18n();
  translated.loadAndActivate({
    locale: "es",
    messages: {
      "settings.general.features": "Funciones verificadas",
      "settings.general.microphone": "Micrófono verificado",
      "settings.general.transcription_language": "Idioma verificado",
    },
  });
  render(
    <I18nProvider i18n={translated}>
      <GeneralFeatureSection {...featureProps()} />
      <GeneralInputSection {...inputProps()} />
    </I18nProvider>,
  );

  expect(screen.getByText("Funciones verificadas").isConnected).toBe(true);
  expect(screen.getByText("Micrófono verificado").isConnected).toBe(true);
  expect(screen.getByText("Idioma verificado").isConnected).toBe(true);
});
